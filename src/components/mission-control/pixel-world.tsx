import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Link } from '@tanstack/react-router'
import {
  computeWorkerStatus,
  timeAgo,
  WORKER_INITIALS,
  WORKER_PALETTES,
  useSwarmHealth,
  useSwarmRuntime,
  type WorkerRuntime,
} from '@/hooks/use-mission-data'

// ────────────────────────────────────────────────────────────────────────────
// Pixel World — a real-time 2D pixel-art town where the swarm lives.
// Single HTML5 canvas, requestAnimationFrame, zero sprite sheets (fillRect
// pixel art). Each worker has a palette + initials, their own office building,
// and a central WAR ROOM where agents gather. Behavior is driven by REAL data:
// /api/swarm-runtime + /api/swarm-health polled every 10s.
// ────────────────────────────────────────────────────────────────────────────

// ── World constants (world space, before camera) ───────────────────────────
const WORLD_W = 2400
const WORLD_H = 1500
const GROUND_Y = 420 // horizon: sky above, ground below

type BuildingDef = {
  id: string
  label: string
  x: number
  y: number
  w: number
  h: number
  color: string
  roof: string
  isWarRoom?: boolean
}

const BUILDINGS: Array<BuildingDef> = [
  // WAR ROOM — center, big
  {
    id: 'war-room',
    label: 'WAR ROOM',
    x: 1000,
    y: 480,
    w: 400,
    h: 260,
    color: '#1c2333',
    roof: '#6366f1',
    isWarRoom: true,
  },
  // Left offices (5)
  { id: 'builder', label: 'BUILDER', x: 90, y: 500, w: 180, h: 220, color: '#0f2430', roof: '#10b981' },
  { id: 'reviewer', label: 'REVIEWER', x: 90, y: 790, w: 180, h: 220, color: '#241d0e', roof: '#f59e0b' },
  { id: 'qa', label: 'QA', x: 90, y: 1080, w: 180, h: 220, color: '#0e2228', roof: '#06b6d4' },
  { id: 'researcher', label: 'RESEARCH', x: 330, y: 1080, w: 180, h: 220, color: '#1c1430', roof: '#8b5cf6' },
  { id: 'ops-watch', label: 'OPS-WATCH', x: 330, y: 790, w: 180, h: 220, color: '#2a1010', roof: '#ef4444' },
  // Right offices (5)
  { id: 'maintainer', label: 'MAINTAIN', x: 2130, y: 500, w: 180, h: 220, color: '#0e1a2e', roof: '#3b82f6' },
  { id: 'strategist', label: 'STRATEGY', x: 2130, y: 790, w: 180, h: 220, color: '#2a0f22', roof: '#ec4899' },
  { id: 'km-agent', label: 'KM-AGENT', x: 2130, y: 1080, w: 180, h: 220, color: '#0e2624', roof: '#14b8a6' },
  { id: 'inbox-triage', label: 'INBOX', x: 1890, y: 1080, w: 180, h: 220, color: '#261708', roof: '#f97316' },
  { id: 'orchestrator', label: 'ORCHESTRATOR', x: 1890, y: 500, w: 180, h: 220, color: '#141a2e', roof: '#818cf8' },
]

// desk = where the worker idles/works (in front of their office door)
const DESK_BY_WORKER: Record<string, { x: number; y: number }> = {
  builder: { x: 180, y: 745 },
  reviewer: { x: 180, y: 1035 },
  qa: { x: 180, y: 1325 },
  researcher: { x: 420, y: 1325 },
  'ops-watch': { x: 420, y: 1035 },
  maintainer: { x: 2220, y: 745 },
  strategist: { x: 2220, y: 1035 },
  'km-agent': { x: 2220, y: 1325 },
  'inbox-triage': { x: 1980, y: 1325 },
  orchestrator: { x: 1980, y: 745 },
}

// war-room plaza: where agents gather for meetings
const WAR_ROOM_PLAZA = { x: 1200, y: 800 }

// ── Character state machine ─────────────────────────────────────────────────
type CharMode = 'idle' | 'walk' | 'work' | 'meeting'
type CharState = {
  workerId: string
  x: number
  y: number
  targetX: number
  targetY: number
  mode: CharMode
  faceDir: 1 | -1
  walkPhase: number
  bobPhase: number
  bubble: string | null
  bubbleUntil: number
  stuck: boolean
  needsHuman: boolean
  currentTask: string | null
  activeTool: string | null
  statusLabel: string
  errorMsg: string | null
}

const WORKER_IDS = [
  'orchestrator',
  'builder',
  'reviewer',
  'qa',
  'researcher',
  'ops-watch',
  'maintainer',
  'strategist',
  'km-agent',
  'inbox-triage',
]

// ── Pixel sprite drawing (fillRect only) ────────────────────────────────────

type Ctx = CanvasRenderingContext2D

function px(ctx: Ctx, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color
  ctx.fillRect(Math.round(x), Math.round(y), w, h)
}

function drawCharacter(ctx: Ctx, c: CharState, time: number) {
  const pal = WORKER_PALETTES[c.workerId] ?? WORKER_PALETTES.orchestrator
  const bob = c.mode === 'idle' ? Math.sin(c.bobPhase) * 1.2 : 0
  const walkSwing = c.mode === 'walk' ? Math.sin(c.walkPhase * 2) * 2 : 0
  const workBounce = c.mode === 'work' ? Math.abs(Math.sin(c.walkPhase * 1.5)) * 1.5 : 0
  const y = c.y + bob + workBounce - (c.mode === 'work' ? 1 : 0)

  const cx = c.x
  const cy = y

  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.25)'
  ctx.beginPath()
  ctx.ellipse(cx, c.y + 8, 7, 2.5, 0, 0, Math.PI * 2)
  ctx.fill()

  // legs
  const legColor = c.stuck ? '#7f1d1d' : '#1e2433'
  if (c.mode === 'walk') {
    px(ctx, cx - 4, cy + 8 + walkSwing * 0.4, 3, 6, legColor)
    px(ctx, cx + 1, cy + 8 - walkSwing * 0.4, 3, 6, legColor)
  } else {
    px(ctx, cx - 4, cy + 8, 3, 6, legColor)
    px(ctx, cx + 1, cy + 8, 3, 6, legColor)
  }

  // body (worker color; red-tinted when stuck)
  const bodyColor = c.stuck ? '#dc2626' : pal.primary
  px(ctx, cx - 5, cy + 1, 10, 9, bodyColor)

  // belt / accent
  px(ctx, cx - 5, cy + 7, 10, 2, c.stuck ? '#7f1d1d' : pal.dark)

  // arms — swing when walking, raise when working
  if (c.mode === 'work') {
    px(ctx, cx - 7, cy + 1 + workBounce, 2, 6, pal.dark)
    px(ctx, cx + 5, cy + 1 - workBounce, 2, 6, pal.dark)
  } else if (c.mode === 'walk') {
    px(ctx, cx - 7, cy + 2 + walkSwing, 2, 5, pal.dark)
    px(ctx, cx + 5, cy + 2 - walkSwing, 2, 5, pal.dark)
  } else {
    px(ctx, cx - 7, cy + 2, 2, 5, pal.dark)
    px(ctx, cx + 5, cy + 2, 2, 5, pal.dark)
  }

  // head
  const skin = c.stuck ? '#fca5a5' : '#f2c9a0'
  px(ctx, cx - 4, cy - 7, 8, 7, skin)
  // hair/visor in worker color
  px(ctx, cx - 4, cy - 7, 8, 2, c.stuck ? '#991b1b' : pal.primary)
  // eyes — direction-aware
  const eyeX = c.faceDir === 1 ? cx + 1 : cx - 2
  px(ctx, eyeX, cy - 4, 2, 2, '#14171f')
  // antenna for every agent (swarm link)
  px(ctx, cx - 1, cy - 10, 2, 3, '#5a6172')
  px(ctx, cx - 1, cy - 11, 2, 2, c.stuck ? '#ef4444' : '#22c55e')

  // initials badge
  const initials = WORKER_INITIALS[c.workerId] ?? c.workerId.slice(0, 2).toUpperCase()
  ctx.font = '600 5px "JetBrains Mono", monospace'
  ctx.textAlign = 'center'
  ctx.fillStyle = '#0a0e1a'
  ctx.fillText(initials, cx, cy + 8)

  // stuck indicator: floating '!'
  if (c.stuck) {
    ctx.font = '700 10px "JetBrains Mono", monospace'
    ctx.fillStyle = '#ef4444'
    ctx.fillText('!', cx, cy - 14 + Math.sin(time * 0.004) * 1.5)
  }
}

function drawBubble(ctx: Ctx, c: CharState, time: number) {
  if (!c.bubble) return
  const text = c.bubble.length > 42 ? `${c.bubble.slice(0, 40)}…` : c.bubble
  ctx.font = '9px "JetBrains Mono", monospace'
  const w = ctx.measureText(text).width + 14
  const h = 16
  const bx = Math.max(10, Math.min(c.x - w / 2, WORLD_W - w - 10))
  const by = c.y - 34 + (c.stuck ? Math.sin(time * 0.004) * 2 : 0)

  ctx.fillStyle = 'rgba(10,14,26,0.92)'
  ctx.strokeStyle = c.stuck ? 'rgba(239,68,68,0.6)' : 'rgba(255,255,255,0.14)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.roundRect(bx, by, w, h, 5)
  ctx.fill()
  ctx.stroke()
  // tail
  ctx.beginPath()
  ctx.moveTo(c.x - 3, by + h - 1)
  ctx.lineTo(c.x + 3, by + h - 1)
  ctx.lineTo(c.x, by + h + 4)
  ctx.closePath()
  ctx.fill()

  ctx.fillStyle = c.stuck ? '#fecaca' : c.needsHuman ? '#ddd6fe' : '#e5e7eb'
  ctx.textAlign = 'center'
  ctx.fillText(text, bx + w / 2, by + 12)
}

function drawBuilding(ctx: Ctx, b: BuildingDef, time: number, night: number) {
  const { x, y, w, h } = b

  // ground shadow
  ctx.fillStyle = 'rgba(0,0,0,0.28)'
  ctx.beginPath()
  ctx.roundRect(x - 6, y + h - 12, w + 12, 16, 6)
  ctx.fill()

  // main block
  ctx.fillStyle = b.color
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, 4)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'
  ctx.lineWidth = 1
  ctx.stroke()

  // roof
  ctx.fillStyle = b.roof
  ctx.beginPath()
  ctx.moveTo(x - 14, y + 8)
  ctx.lineTo(x + w / 2, y - 26)
  ctx.lineTo(x + w + 14, y + 8)
  ctx.closePath()
  ctx.fill()
  // roof ridge light
  ctx.fillStyle = 'rgba(255,255,255,0.18)'
  ctx.beginPath()
  ctx.moveTo(x - 4, y + 6)
  ctx.lineTo(x + w / 2, y - 22)
  ctx.lineTo(x + w / 2 + 8, y - 18)
  ctx.lineTo(x + 6, y + 6)
  ctx.closePath()
  ctx.fill()

  // war room antenna + beacon
  if (b.isWarRoom) {
    px(ctx, x + w / 2 - 1, y - 52, 2, 26, '#2a3040')
    const blink = Math.sin(time * 0.006) > 0.4
    px(ctx, x + w / 2 - 2, y - 56, 4, 4, blink ? '#818cf8' : '#3730a3')
    // side lights
    px(ctx, x + 20, y + h - 18, 14, 4, blink ? '#818cf8' : '#3b2f6b')
    px(ctx, x + w - 34, y + h - 18, 14, 4, blink ? '#818cf8' : '#3b2f6b')
  }

  // door
  ctx.fillStyle = '#0a0e1a'
  ctx.beginPath()
  ctx.roundRect(x + w / 2 - 14, y + h - 26, 28, 30, [4, 4, 0, 0])
  ctx.fill()
  px(ctx, x + w / 2 + 2, y + h - 14, 3, 3, '#f59e0b')

  // windows — glow at night / when lit
  const winY = y + 34
  const winColors = ['#0e1420', '#0e1420', '#0e1420']
  for (let i = 0; i < 3; i++) {
    const wx = x + 22 + i * (w - 44) / 2
    const lit = night > 0.5 || b.isWarRoom
    ctx.fillStyle = lit ? 'rgba(245,158,11,0.85)' : winColors[i]
    ctx.fillRect(wx, winY, 26, 18)
    ctx.strokeStyle = 'rgba(255,255,255,0.07)'
    ctx.strokeRect(wx, winY, 26, 18)
    // window cross
    ctx.strokeStyle = 'rgba(255,255,255,0.1)'
    ctx.beginPath()
    ctx.moveTo(wx + 13, winY)
    ctx.lineTo(wx + 13, winY + 18)
    ctx.stroke()
  }

  // sign / label
  ctx.font = b.isWarRoom ? '700 13px "JetBrains Mono", monospace' : '600 9px "JetBrains Mono", monospace'
  ctx.textAlign = 'center'
  ctx.fillStyle = b.isWarRoom ? '#c7d2fe' : 'rgba(255,255,255,0.75)'
  ctx.fillText(b.label, x + w / 2, y + h - 34)

  // occupancy indicator: little dot for its worker (from live data later)
  if (!b.isWarRoom) {
    const pal = WORKER_PALETTES[b.id]
    if (pal) {
      ctx.fillStyle = pal.primary
      ctx.beginPath()
      ctx.arc(x + w / 2, y + h - 6, 3, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

// ── The component ───────────────────────────────────────────────────────────

export function PixelWorld({
  embedded = false,
  missionRunning = false,
}: { embedded?: boolean; missionRunning?: boolean } = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const runtime = useSwarmRuntime()
  const health = useSwarmHealth()

  const charsRef = useRef<Array<CharState>>([])
  const cameraRef = useRef({ x: 0, y: 0, scale: 0.55 })
  const timeRef = useRef(0)
  const nightRef = useRef(0)
  const mouseRef = useRef<{ x: number; y: number; wx: number; wy: number; inside: boolean }>({
    x: 0,
    y: 0,
    wx: 0,
    wy: 0,
    inside: false,
  })
  const dragRef = useRef<{ active: boolean; sx: number; sy: number; cx: number; cy: number }>({
    active: false,
    sx: 0,
    sy: 0,
    cx: 0,
    cy: 0,
  })
  const rafRef = useRef<number>(0)
  const [hovered, setHovered] = useState<CharState | null>(null)
  const [selected, setSelected] = useState<CharState | null>(null)
  const [hudPos, setHudPos] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(0.55)
  const [paused, setPaused] = useState(false)
  const pausedRef = useRef(false)
  pausedRef.current = paused

  // camera helpers
  const camToWorld = useCallback((sx: number, sy: number) => {
    const cam = cameraRef.current
    const rect = wrapRef.current?.getBoundingClientRect()
    const cw = rect?.width ?? 800
    const ch = rect?.height ?? 600
    return {
      x: (sx - cw / 2 - cam.x) / cam.scale,
      y: (sy - ch / 2 - cam.y) / cam.scale,
    }
  }, [])

  // init characters
  useEffect(() => {
    charsRef.current = WORKER_IDS.map((id) => {
      const desk = DESK_BY_WORKER[id] ?? { x: 1200, y: 800 }
      return {
        workerId: id,
        x: desk.x,
        y: desk.y,
        targetX: desk.x,
        targetY: desk.y,
        mode: 'idle' as CharMode,
        faceDir: 1 as 1 | -1,
        walkPhase: Math.random() * 10,
        bobPhase: Math.random() * 10,
        bubble: 'standing by',
        bubbleUntil: 0,
        stuck: false,
        needsHuman: false,
        currentTask: null,
        activeTool: null,
        statusLabel: 'idle',
        errorMsg: null,
      }
    })
    // everyone gathers at the plaza once at boot — a "standup"
    charsRef.current.forEach((c, i) => {
      setTimeout(() => {
        const ch = charsRef.current[i]
        if (ch) {
          ch.targetX = WAR_ROOM_PLAZA.x + (Math.random() * 160 - 80)
          ch.targetY = WAR_ROOM_PLAZA.y + (Math.random() * 120 - 60)
          ch.mode = 'walk'
          ch.bubble = 'standup — reporting in'
        }
      }, 300 + i * 140)
    })
  }, [])

  // data → behavior (polled every 10s by the hooks)
  useEffect(() => {
    const entries = runtime.data ?? []
    const healthById = new Map((health.data ?? []).map((h) => [h.workerId, h]))
    const now = Date.now()

    for (const entry of entries) {
      const ch = charsRef.current.find((c) => c.workerId === entry.workerId)
      if (!ch) continue
      const h = healthById.get(entry.workerId) ?? null
      const { status, statusLabel } = computeWorkerStatus(entry as WorkerRuntime, h)
      const desk = DESK_BY_WORKER[entry.workerId] ?? { x: 1200, y: 800 }
      const hasError = Boolean(h && (h.recentAuthErrors > 0 || h.recentFallbacks > 0))
      const errMsg = h?.lastErrorMessage ?? h?.lastFallbackMessage ?? null

      ch.stuck = status === 'stuck' || status === 'error' || hasError
      ch.needsHuman = Boolean(entry.needsHuman)
      ch.statusLabel = statusLabel
      ch.currentTask = entry.currentTask
      ch.activeTool = entry.activeTool
      ch.errorMsg = errMsg

      // bubble text from real activity
      const task = entry.currentTask ?? ''
      let bubble: string
      if (ch.stuck) {
        bubble = errMsg ? `stuck: ${errMsg.slice(0, 36)}` : `stuck · no output ${status === 'error' ? '>30m' : '>10m'}`
      } else if (ch.needsHuman) {
        bubble = 'needs greenlight — awaiting human'
      } else if (task && !task.startsWith('Standing by')) {
        bubble = task.length > 42 ? `${task.slice(0, 40)}…` : task
      } else if (entry.activeTool) {
        bubble = `using ${entry.activeTool}`
      } else {
        bubble = 'standing by'
      }
      ch.bubble = bubble
      ch.bubbleUntil = now + 5200

      // behavior: active workers walk to war room (meeting) or work at desk.
      // When a Conductor mission is running, everyone gathers at the war room.
      if (missionRunning) {
        ch.targetX = WAR_ROOM_PLAZA.x + (Math.random() * 200 - 100)
        ch.targetY = WAR_ROOM_PLAZA.y + (Math.random() * 140 - 70)
        ch.mode = 'walk'
      } else if (status === 'active' || status === 'approval') {
        if (Math.random() < 0.5) {
          ch.targetX = WAR_ROOM_PLAZA.x + (Math.random() * 200 - 100)
          ch.targetY = WAR_ROOM_PLAZA.y + (Math.random() * 140 - 70)
          ch.mode = 'walk'
        } else {
          ch.targetX = desk.x
          ch.targetY = desk.y
          ch.mode = 'work'
        }
      } else {
        ch.targetX = desk.x
        ch.targetY = desk.y
        ch.mode = ch.mode === 'walk' ? 'walk' : 'idle'
      }
    }
  }, [runtime.data, health.data, missionRunning])

  // main loop
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let last = performance.now()

    const frame = (t: number) => {
      // paused: keep last frame, no updates (freeze the town)
      if (pausedRef.current) {
        rafRef.current = requestAnimationFrame(frame)
        return
      }
      const dt = Math.min(32, t - last)
      last = t
      timeRef.current = t
      // day/night: ~2.5 min cycle
      const cycle = (t % 150000) / 150000
      nightRef.current = cycle > 0.55 && cycle < 0.95 ? (cycle - 0.55) / 0.4 : 0

      // update characters
      const chars = charsRef.current
      const now = Date.now()
      for (const c of chars) {
        c.bobPhase += dt * 0.004
        const dx = c.targetX - c.x
        const dy = c.targetY - c.y
        const dist = Math.hypot(dx, dy)
        const speed = 0.11 * dt // ~66 px/s at 60fps

        if (dist > 2) {
          c.mode = c.mode === 'idle' ? 'walk' : c.mode
          c.x += (dx / dist) * speed
          c.y += (dy / dist) * speed
          c.walkPhase += dt * 0.012
          c.faceDir = Math.abs(dx) > 2 ? (dx > 0 ? 1 : -1) : c.faceDir
        } else if (c.mode === 'walk') {
          c.x = c.targetX
          c.y = c.targetY
          // arrived: decide what to do at destination
          const nearDesk = DESK_BY_WORKER[c.workerId]
          const atDesk = nearDesk && Math.hypot(c.x - nearDesk.x, c.y - nearDesk.y) < 40
          const atPlaza = Math.hypot(c.x - WAR_ROOM_PLAZA.x, c.y - WAR_ROOM_PLAZA.y) < 200
          if (atDesk) {
            c.mode = c.stuck ? 'idle' : c.statusLabel === 'active' ? 'work' : 'idle'
          } else if (atPlaza) {
            c.mode = 'meeting'
            c.bubble = c.bubbleUntil < now ? 'meeting in the war room' : c.bubble
            // drift around plaza while meeting
            if (Math.random() < 0.01) {
              c.targetX = WAR_ROOM_PLAZA.x + (Math.random() * 220 - 110)
              c.targetY = WAR_ROOM_PLAZA.y + (Math.random() * 160 - 80)
            }
          } else {
            c.mode = 'idle'
          }
        } else if (c.mode === 'work' || c.mode === 'meeting') {
          c.walkPhase += dt * 0.008
          // occasional tool flash
          if (c.activeTool && Math.random() < 0.002) {
            c.bubble = `using ${c.activeTool}`
            c.bubbleUntil = now + 4000
          }
        }
        // expire bubbles
        if (c.bubbleUntil < now && !c.stuck) {
          c.bubble = c.statusLabel === 'active' ? 'working' : 'standing by'
        }
        if (c.stuck) c.bubble = 'stuck'
      }

      // render
      const rect = wrapRef.current?.getBoundingClientRect()
      const cw = rect?.width ?? 800
      const ch = rect?.height ?? 600
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      if (canvas.width !== cw * dpr || canvas.height !== ch * dpr) {
        canvas.width = cw * dpr
        canvas.height = ch * dpr
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, cw, ch)

      const cam = cameraRef.current

      // ── sky (day/night gradient) ──
      const night = nightRef.current
      const dayTop = '#3b4a6b'
      const dayBottom = '#7d8fb5'
      const nightTop = '#05070f'
      const nightBottom = '#141a2e'
      const top = mixColor(dayTop, nightTop, night)
      const bottom = mixColor(dayBottom, nightBottom, night)
      const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y * cam.scale)
      sky.addColorStop(0, top)
      sky.addColorStop(1, bottom)
      ctx.fillStyle = sky
      ctx.fillRect(0, 0, cw, GROUND_Y * cam.scale + 2)

      // stars at night
      if (night > 0.3) {
        ctx.fillStyle = `rgba(255,255,255,${(night - 0.3) * 0.9})`
        for (let i = 0; i < 60; i++) {
          const sx = (i * 97.3 + 13) % cw
          const sy = ((i * 53.7 + 29) % Math.max(1, GROUND_Y * cam.scale - 40))
          const tw = Math.sin(t * 0.001 + i) > 0.5 ? 1.6 : 1
          ctx.fillRect(sx, sy, tw, tw)
        }
      }

      // sun / moon
      const sunX = cw * 0.18
      const sunY = GROUND_Y * cam.scale * 0.35
      ctx.fillStyle = night > 0.5 ? 'rgba(240,240,255,0.85)' : 'rgba(255,236,170,0.9)'
      ctx.beginPath()
      ctx.arc(sunX, sunY, night > 0.5 ? 16 : 22, 0, Math.PI * 2)
      ctx.fill()
      if (night > 0.5) {
        // crescent
        ctx.fillStyle = nightTop
        ctx.beginPath()
        ctx.arc(sunX + 8, sunY - 5, 13, 0, Math.PI * 2)
        ctx.fill()
      } else {
        // glow
        ctx.fillStyle = 'rgba(255,236,170,0.12)'
        ctx.beginPath()
        ctx.arc(sunX, sunY, 40, 0, Math.PI * 2)
        ctx.fill()
      }

      // ── ground ──
      const groundTop = mixColor('#2a3a28', '#101820', night)
      const groundBottom = mixColor('#1d2b22', '#0a1018', night)
      const gg = ctx.createLinearGradient(0, GROUND_Y * cam.scale, 0, ch)
      gg.addColorStop(0, groundTop)
      gg.addColorStop(1, groundBottom)
      ctx.fillStyle = gg
      ctx.fillRect(0, GROUND_Y * cam.scale, cw, ch - GROUND_Y * cam.scale)

      // camera transform
      ctx.save()
      ctx.translate(cw / 2 + cam.x, ch / 2 + cam.y)
      ctx.scale(cam.scale, cam.scale)

      // world border
      ctx.strokeStyle = 'rgba(255,255,255,0.06)'
      ctx.strokeRect(-20, -20, WORLD_W + 40, WORLD_H + 40)

      // roads: horizontal main road + plaza ring
      ctx.fillStyle = 'rgba(0,0,0,0.22)'
      ctx.fillRect(0, GROUND_Y + 300, WORLD_W, 40) // main road
      ctx.fillRect(0, GROUND_Y + 300 + 40 + 250, WORLD_W, 40)
      // vertical roads
      for (const bx of [180, 420, 1980, 2220]) {
        ctx.fillRect(bx - 22, GROUND_Y, 44, WORLD_H - GROUND_Y)
      }
      // plaza
      ctx.fillStyle = 'rgba(99,102,241,0.10)'
      ctx.beginPath()
      ctx.arc(WAR_ROOM_PLAZA.x, WAR_ROOM_PLAZA.y, 240, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = 'rgba(99,102,241,0.25)'
      ctx.lineWidth = 2
      ctx.setLineDash([10, 8])
      ctx.beginPath()
      ctx.arc(WAR_ROOM_PLAZA.x, WAR_ROOM_PLAZA.y, 240, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])

      // grass tufts + trees
      ctx.fillStyle = night > 0.5 ? '#0d1512' : '#31402e'
      for (let i = 0; i < 40; i++) {
        const gx = (i * 61.7 + 19) % WORLD_W
        const gy = GROUND_Y + 60 + ((i * 37.3 + 7) % (WORLD_H - GROUND_Y - 90))
        ctx.fillRect(gx, gy, 3, 5)
        ctx.fillRect(gx + 4, gy + 2, 3, 3)
      }
      // trees
      for (const [tx, ty] of [
        [60, 320],
        [2340, 340],
        [700, 1330],
        [1700, 1330],
        [120, 1330],
        [2280, 1290],
      ] as const) {
        ctx.fillStyle = '#3d2b1f'
        ctx.fillRect(tx - 4, ty - 6, 8, 14)
        ctx.fillStyle = night > 0.5 ? '#0d2418' : '#1d4d2e'
        ctx.beginPath()
        ctx.arc(tx, ty - 16, 18, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = night > 0.5 ? '#0a1a11' : '#2a6b3f'
        ctx.beginPath()
        ctx.arc(tx + 10, ty - 10, 12, 0, Math.PI * 2)
        ctx.fill()
      }

      // buildings
      for (const b of BUILDINGS) {
        drawBuilding(ctx, b, t, night)
      }

      // ambient particles: fireflies at night, dust motes by day
      if (night > 0.4) {
        for (let i = 0; i < 26; i++) {
          const px0 = (i * 89.7 + t * 0.02) % WORLD_W
          const py0 = GROUND_Y + 80 + ((i * 47.3 + t * 0.013) % (WORLD_H - GROUND_Y - 160))
          const flick = Math.sin(t * 0.005 + i * 2.4) > 0.2
          if (flick) {
            ctx.fillStyle = `rgba(250, 204, 21, ${0.35 + 0.4 * night})`
            ctx.fillRect(px0, py0, 2, 2)
          }
        }
      } else {
        for (let i = 0; i < 18; i++) {
          const px0 = (i * 71.3 + t * 0.008) % WORLD_W
          const py0 = GROUND_Y + 40 + ((i * 33.7 + t * 0.006) % (WORLD_H - GROUND_Y - 100))
          ctx.fillStyle = 'rgba(255,255,255,0.06)'
          ctx.fillRect(px0, py0, 2, 2)
        }
      }

      // characters (sorted by y for depth)
      const sorted = [...chars].sort((a, b) => a.y - b.y)
      for (const c of sorted) {
        drawCharacter(ctx, c, t)
      }
      // bubbles on top
      for (const c of sorted) {
        drawBubble(ctx, c, t)
      }

      // war room label under it
      ctx.font = '700 14px "JetBrains Mono", monospace'
      ctx.textAlign = 'center'
      ctx.fillStyle = 'rgba(199,210,254,0.9)'
      ctx.fillText('◈ HERMES WAR ROOM ◈', 1200, 470)

      ctx.restore()

      rafRef.current = requestAnimationFrame(frame)
    }

    rafRef.current = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  // hover + click hit testing (throttled to hover state)
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const rect = wrapRef.current?.getBoundingClientRect()
      if (!rect) return
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top
      mouseRef.current = { x: sx, y: sy, wx: 0, wy: 0, inside: true }
      const w = camToWorld(sx, sy)
      mouseRef.current.wx = w.x
      mouseRef.current.wy = w.y
      setHudPos({ x: sx, y: sy })

      // hit test characters (nearest within 14px)
      let best: CharState | null = null
      let bestD = 20
      for (const c of charsRef.current) {
        const d = Math.hypot(c.x - w.x, c.y - w.y)
        if (d < bestD) {
          bestD = d
          best = c
        }
      }
      setHovered(best)
    },
    [camToWorld],
  )

  const handleClick = useCallback(() => {
    if (hovered) setSelected(hovered)
  }, [hovered])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    const rect = wrapRef.current?.getBoundingClientRect()
    if (!rect) return
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const cam = cameraRef.current
    const factor = e.deltaY > 0 ? 0.88 : 1.13
    const ns = Math.min(2.2, Math.max(0.3, cam.scale * factor))
    // zoom toward cursor
    const wx = (sx - rect.width / 2 - cam.x) / cam.scale
    const wy = (sy - rect.height / 2 - cam.y) / cam.scale
    cam.scale = ns
    cam.x = sx - rect.width / 2 - wx * ns
    cam.y = sy - rect.height / 2 - wy * ns
    setZoom(ns)
  }, [])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    dragRef.current = {
      active: true,
      sx: e.clientX,
      sy: e.clientY,
      cx: cameraRef.current.x,
      cy: cameraRef.current.y,
    }
  }, [])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (dragRef.current.active) {
      cameraRef.current.x = dragRef.current.cx + (e.clientX - dragRef.current.sx)
      cameraRef.current.y = dragRef.current.cy + (e.clientY - dragRef.current.sy)
    }
  }, [])

  const handlePointerUp = useCallback(() => {
    dragRef.current.active = false
  }, [])

  const zoomBy = useCallback((f: number) => {
    const cam = cameraRef.current
    const ns = Math.min(2.2, Math.max(0.3, cam.scale * f))
    cam.scale = ns
    setZoom(ns)
  }, [])

  const resetCamera = useCallback(() => {
    cameraRef.current = { x: 0, y: 0, scale: 0.55 }
    setZoom(0.55)
  }, [])

  const selectedWorker = useMemo(() => {
    if (!selected) return null
    const rt = (runtime.data ?? []).find((e) => e.workerId === selected.workerId)
    const h = (health.data ?? []).find((e) => e.workerId === selected.workerId)
    return { rt, h, ch: selected }
  }, [selected, runtime.data, health.data])

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#0a0e1a]">
      {/* header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
        {!embedded ? (
          <div>
            <h1 className="text-[16px] font-medium tracking-[-0.03em] text-[#f0f2f7]">Pixel World</h1>
            <p className="text-[10.5px] text-[#5a6172]">the swarm town · live from /api/swarm-runtime · polled 10s</p>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-indigo-400" />
            </span>
            <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#7d8597]">World</span>
            {missionRunning ? (
              <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 font-mono text-[9.5px] text-emerald-300">
                mission running — agents in the war room
              </span>
            ) : (
              <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 font-mono text-[9.5px] text-[#5a6172]">
                agents on patrol
              </span>
            )}
          </div>
        )}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.03] p-1">
            <button onClick={() => zoomBy(1.25)} className="rounded-md px-2 py-1 text-[12px] text-[#b6bdcb] hover:bg-white/[0.06]" title="zoom in">+</button>
            <button onClick={() => zoomBy(0.8)} className="rounded-md px-2 py-1 text-[12px] text-[#b6bdcb] hover:bg-white/[0.06]" title="zoom out">−</button>
            <button onClick={resetCamera} className="rounded-md px-2 py-1 text-[10px] text-[#b6bdcb] hover:bg-white/[0.06]" title="reset view">⌂</button>
          </div>
          <button
            onClick={() => setPaused((p) => !p)}
            className={`rounded-lg border px-3 py-1.5 text-[11px] font-medium ${paused ? 'border-amber-400/30 bg-amber-400/10 text-amber-300' : 'border-white/[0.08] bg-white/[0.03] text-[#b6bdcb] hover:bg-white/[0.06]'}`}
          >
            {paused ? '⏸ paused' : '▶ live'}
          </button>
          {!embedded ? (
            <Link
              to="/conductor"
              className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium text-[#b6bdcb] hover:bg-white/[0.06]"
            >
              ← Conductor
            </Link>
          ) : null}
        </div>
      </div>

      {/* canvas */}
      <div
        ref={wrapRef}
        className="relative min-h-0 flex-1 cursor-grab overflow-hidden active:cursor-grabbing"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => {
          mouseRef.current.inside = false
          setHovered(null)
        }}
        onClick={handleClick}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <canvas ref={canvasRef} className="h-full w-full" />

        {/* zoom HUD */}
        <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-white/[0.08] bg-black/40 px-3 py-1 font-mono text-[10px] text-[#7d8597] backdrop-blur-md">
          {Math.round(zoom * 100)}% · drag to pan · scroll to zoom · click an agent
        </div>

        {/* hover tooltip */}
        <AnimatePresence>
          {hovered && !selected && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="pointer-events-none absolute z-10 w-52 rounded-xl border border-white/[0.1] bg-[#0d1220]/95 p-3 shadow-2xl backdrop-blur-xl"
              style={{
                left: Math.min(hudPos.x + 14, (wrapRef.current?.clientWidth ?? 800) - 220),
                top: Math.max(hudPos.y - 130, 8),
              }}
            >
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: WORKER_PALETTES[hovered.workerId]?.primary }} />
                <span className="text-[11.5px] font-medium text-[#f0f2f7]">{hovered.workerId}</span>
                <span className="ml-auto rounded px-1.5 py-px font-mono text-[9px] text-[#7d8597]">{hovered.statusLabel}</span>
              </div>
              <div className="mt-1.5 text-[10px] leading-snug text-[#b6bdcb]">{hovered.bubble}</div>
              {hovered.activeTool ? (
                <div className="mt-1 font-mono text-[9px] text-indigo-300">tool: {hovered.activeTool}</div>
              ) : null}
            </motion.div>
          )}
        </AnimatePresence>

        {/* worker detail panel */}
        <AnimatePresence>
          {selected && selectedWorker && (
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 30 }}
              transition={{ type: 'spring', stiffness: 380, damping: 34 }}
              className="absolute right-4 top-4 z-20 w-[300px] rounded-2xl border border-white/[0.1] bg-[#0d1220]/90 p-4 shadow-2xl backdrop-blur-2xl"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-bold"
                    style={{
                      background: WORKER_PALETTES[selected.workerId]?.primary + '22',
                      boxShadow: `inset 0 0 0 1px ${WORKER_PALETTES[selected.workerId]?.primary}66`,
                      color: WORKER_PALETTES[selected.workerId]?.primary,
                    }}
                  >
                    {WORKER_INITIALS[selected.workerId]}
                  </div>
                  <div>
                    <div className="text-[13px] font-medium tracking-[-0.01em] text-[#f0f2f7]">{selected.workerId}</div>
                    <div className="font-mono text-[9.5px] text-[#5a6172]">{selectedWorker.h?.model ?? 'model n/a'}</div>
                  </div>
                </div>
                <button
                  onClick={() => setSelected(null)}
                  className="rounded-md px-1.5 py-0.5 text-[12px] text-[#5a6172] hover:bg-white/[0.06] hover:text-[#b6bdcb]"
                >
                  ✕
                </button>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                <span className="rounded-full border border-white/[0.08] px-2 py-0.5 text-[9.5px] text-[#b6bdcb]">
                  {selected.statusLabel}
                </span>
                {selected.needsHuman && (
                  <span className="rounded-full border border-violet-400/30 bg-violet-400/10 px-2 py-0.5 text-[9.5px] text-violet-300">
                    needs greenlight
                  </span>
                )}
                {selectedWorker.rt?.activeTool && (
                  <span className="rounded-full border border-indigo-400/25 bg-indigo-400/10 px-2 py-0.5 font-mono text-[9.5px] text-indigo-300">
                    {selectedWorker.rt.activeTool}
                  </span>
                )}
              </div>

              <div className="mt-3 space-y-2 text-[10.5px] leading-snug">
                <div>
                  <div className="text-[9px] font-semibold uppercase tracking-wider text-[#5a6172]">Current task</div>
                  <div className="mt-0.5 text-[#d5d9e2]">{selectedWorker.rt?.currentTask ?? '—'}</div>
                </div>
                {selectedWorker.rt?.pid && (
                  <div>
                    <div className="text-[9px] font-semibold uppercase tracking-wider text-[#5a6172]">PID / uptime</div>
                    <div className="mt-0.5 font-mono text-[#b6bdcb]">
                      {selectedWorker.rt.pid} · started {timeAgo((selectedWorker.rt.startedAt ?? 0) / 1000)}
                    </div>
                  </div>
                )}
                {selected.errorMsg && (
                  <div className="rounded-lg border border-red-500/25 bg-red-500/[0.07] p-2">
                    <div className="text-[9px] font-semibold uppercase tracking-wider text-red-300">Last error</div>
                    <div className="mt-0.5 text-[10px] text-red-200/90">{selected.errorMsg}</div>
                  </div>
                )}
                {selectedWorker.h && (selectedWorker.h.skills?.length ?? 0) > 0 && (
                  <div>
                    <div className="text-[9px] font-semibold uppercase tracking-wider text-[#5a6172]">Skills</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {(selectedWorker.h.skills ?? []).slice(0, 5).map((s: string) => (
                        <span key={s} className="rounded border border-white/[0.07] px-1.5 py-px text-[9px] text-[#7d8597]">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <Link
                to="/swarm2"
                className="mt-3 block rounded-lg bg-white/[0.06] py-1.5 text-center text-[11px] font-medium text-[#f0f2f7] hover:bg-white/[0.1]"
              >
                Full worker profile →
              </Link>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ── color helpers ───────────────────────────────────────────────────────────

function mixColor(a: string, b: string, t: number): string {
  const ca = hexToRgb(a)
  const cb = hexToRgb(b)
  const r = Math.round(ca.r + (cb.r - ca.r) * t)
  const g = Math.round(ca.g + (cb.g - ca.g) * t)
  const bl = Math.round(ca.b + (cb.b - ca.b) * t)
  return `rgb(${r},${g},${bl})`
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const n = parseInt(hex.replace('#', ''), 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}
