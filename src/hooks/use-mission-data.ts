import { useQuery } from '@tanstack/react-query'

// ────────────────────────────────────────────────────────────────────────────
// Mission Control data hooks — poll, don't stream (2GB RAM budget).
// react-query's refetchInterval pauses automatically when document.hidden
// (refetchIntervalInBackground defaults to false).
// ────────────────────────────────────────────────────────────────────────────

export type WorkerRuntime = {
  workerId: string
  displayName: string
  humanLabel: string
  role: string
  specialty: string | null
  mission: string | null
  skills: Array<string>
  capabilities: Array<string>
  source: string
  pid: number | null
  startedAt: number | null
  lastOutputAt: number | null
  cwd: string | null
  currentTask: string | null
  activeTool: string | null
  state: string | null
  phase: string | null
  needsHuman: boolean
  blockedReason: string | null
  lastCheckIn: string | null
  lastSummary: string | null
  nextAction: string | null
  lastResult: string | null
  assignedTaskCount: number
  cronJobCount: number
  tmuxSession: string | null
  tmuxAttachable: boolean
  [k: string]: unknown
}

export type WorkerHealth = {
  workerId: string
  displayName: string
  humanLabel: string
  role: string
  specialty: string | null
  mission: string | null
  skills: Array<string>
  capabilities: Array<string>
  profileFound: boolean
  wrapperFound: boolean
  model: string | null
  provider: string | null
  recentAuthErrors: number
  recentFallbacks: number
  lastErrorAt: number | null
  lastErrorMessage: string | null
  lastFallbackAt: number | null
  lastFallbackMessage: string | null
  [k: string]: unknown
}

export type WorkerStatus = 'active' | 'stuck' | 'error' | 'approval' | 'warning' | 'idle'

export type MergedWorker = WorkerRuntime & {
  health?: WorkerHealth | null
  status: WorkerStatus
  statusLabel: string
  statusSince: number
  stuckMinutes: number | null
  uptimeMs: number
  hasError: boolean
  hasWarning: boolean
}

export type SessionRow = {
  key: string
  friendlyId: string
  kind: string
  status: string
  model: string | null
  label: string | null
  title: string | null
  preview: string | null
  tokenCount: number
  totalTokens: number
  message_count: number
  tool_call_count: number
  cost: number
  createdAt: number
  startedAt: number
  updatedAt: number
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number }
  [k: string]: unknown
}

export type KanbanCard = {
  id: string
  title: string
  spec: string
  acceptanceCriteria: Array<string>
  assignedWorker: string | null
  reviewer: string | null
  status: string
  missionId: string | null
  reportPath: string | null
  createdBy: string
  createdAt: number
  updatedAt: number
  parents?: Array<string>
  children?: Array<string>
  latestRun?: { summary?: string | null; outcome?: string | null; status?: string | null } | null
  tags?: Array<string>
  source?: string
  [k: string]: unknown
}

export type SystemMetrics = {
  checkedAt: number
  cpu: { loadPercent: number; loadAverage1m: number; cores: number }
  memory: { usedBytes: number; totalBytes: number; usedPercent: number }
  disk: { path: string; usedBytes: number; totalBytes: number; usedPercent: number }
  hermes: { status: string; health: boolean; dashboard: boolean }
  [k: string]: unknown
}

export type SwarmReport = {
  workerId: string | null
  missionId: string | null
  title?: string | null
  summary?: string | null
  outcome?: string | null
  status?: string | null
  fetchedAt?: number
  createdAt?: number
  [k: string]: unknown
}

// ── Shared fetchers ─────────────────────────────────────────────────────────

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`${url} → ${res.status}`)
  return (await res.json()) as T
}

// ── Polling hooks ───────────────────────────────────────────────────────────

export function useSystemMetrics() {
  return useQuery({
    queryKey: ['mc', 'system-metrics'],
    queryFn: () => fetchJson<SystemMetrics>('/api/system-metrics'),
    refetchInterval: 10_000,
    staleTime: 5_000,
    retry: 2,
  })
}

export function useSwarmHealth() {
  return useQuery({
    queryKey: ['mc', 'swarm-health'],
    queryFn: () =>
      fetchJson<{ workers: Array<WorkerHealth> }>('/api/swarm-health').then((d) => d.workers),
    refetchInterval: 10_000,
    staleTime: 5_000,
    retry: 2,
  })
}

export function useSwarmRuntime() {
  return useQuery({
    queryKey: ['mc', 'swarm-runtime'],
    queryFn: () =>
      fetchJson<{ entries: Array<WorkerRuntime> }>('/api/swarm-runtime').then((d) => d.entries),
    refetchInterval: 10_000,
    staleTime: 5_000,
    retry: 2,
  })
}

export function useSessions() {
  return useQuery({
    queryKey: ['mc', 'sessions'],
    queryFn: () => fetchJson<{ sessions: Array<SessionRow> }>('/api/sessions').then((d) => d.sessions),
    refetchInterval: 15_000,
    staleTime: 10_000,
    retry: 2,
  })
}

export function useSwarmKanban() {
  return useQuery({
    queryKey: ['mc', 'swarm-kanban'],
    queryFn: () =>
      fetchJson<{ ok: boolean; cards: Array<KanbanCard>; backend: { writable: boolean } }>(
        '/api/swarm-kanban',
      ),
    refetchInterval: 15_000,
    staleTime: 10_000,
    retry: 2,
  })
}

export function useSwarmReports() {
  return useQuery({
    queryKey: ['mc', 'swarm-reports'],
    queryFn: () =>
      fetchJson<{ ok: boolean; reports: Array<SwarmReport> }>('/api/swarm-reports').then(
        (d) => d.reports ?? [],
      ),
    refetchInterval: 15_000,
    staleTime: 10_000,
    retry: 2,
  })
}

export function useGatewayHealth() {
  return useQuery({
    queryKey: ['mc', 'gateway'],
    queryFn: async () => {
      try {
        const res = await fetch('http://localhost:8642/', {
          method: 'HEAD',
          // gateway root returns 404 by design; "reachable = healthy"
        })
        return res.status !== 0
      } catch {
        return false
      }
    },
    refetchInterval: 30_000,
    staleTime: 20_000,
    retry: 0,
  })
}

// ── Status computation (brief §6.2.1) ───────────────────────────────────────

const STUCK_AFTER_MS = 10 * 60 * 1000
const ERROR_AFTER_MS = 30 * 60 * 1000

export function computeWorkerStatus(rt: WorkerRuntime | null | undefined, h: WorkerHealth | null | undefined): {
  status: WorkerStatus
  statusLabel: string
  statusSince: number
  stuckMinutes: number | null
  hasError: boolean
  hasWarning: boolean
} {
  const now = Date.now()
  const hasError = Boolean(h && (h.recentAuthErrors > 0 || h.recentFallbacks > 0)) || Boolean(rt?.needsHuman)
  const hasWarning = Boolean(h && (h.recentAuthErrors > 0 || h.recentFallbacks > 0))

  if (rt?.needsHuman) {
    return { status: 'approval', statusLabel: 'needs approval', statusSince: rt.lastOutputAt ?? now, stuckMinutes: null, hasError: true, hasWarning: false }
  }

  const state = rt?.state ?? 'idle'
  const isActive = state === 'running' || state === 'active' || rt?.phase === 'active'

  if (isActive) {
    const lastOut = rt?.lastOutputAt ?? now
    const idleMs = now - lastOut
    if (idleMs > ERROR_AFTER_MS) {
      return { status: 'error', statusLabel: 'error', statusSince: lastOut, stuckMinutes: Math.floor(idleMs / 60000), hasError: true, hasWarning }
    }
    if (idleMs > STUCK_AFTER_MS) {
      return { status: 'stuck', statusLabel: 'stuck', statusSince: lastOut, stuckMinutes: Math.floor(idleMs / 60000), hasError, hasWarning }
    }
    return { status: 'active', statusLabel: 'active', statusSince: lastOut, stuckMinutes: null, hasError, hasWarning }
  }

  if (hasError) {
    return { status: 'warning', statusLabel: 'warning', statusSince: rt?.lastOutputAt ?? now, stuckMinutes: null, hasError, hasWarning: true }
  }

  return { status: 'idle', statusLabel: 'idle', statusSince: rt?.lastOutputAt ?? now, stuckMinutes: null, hasError: false, hasWarning: false }
}

export function mergeWorkers(
  runtime: Array<WorkerRuntime> | undefined,
  health: Array<WorkerHealth> | undefined,
): Array<MergedWorker> {
  if (!runtime || runtime.length === 0) return []
  const healthById = new Map((health ?? []).map((h) => [h.workerId, h]))
  return runtime
    .map((rt) => {
      const h = healthById.get(rt.workerId) ?? null
      const { status, statusLabel, statusSince, stuckMinutes, hasError, hasWarning } =
        computeWorkerStatus(rt, h)
      return {
        ...rt,
        health: h,
        status,
        statusLabel,
        statusSince,
        stuckMinutes,
        hasError,
        hasWarning,
        uptimeMs: rt.startedAt ? Math.max(0, Date.now() - rt.startedAt) : 0,
      }
    })
    .sort((a, b) => {
      const order: Record<WorkerStatus, number> = {
        active: 0,
        stuck: 1,
        approval: 2,
        error: 3,
        warning: 4,
        idle: 5,
      }
      return order[a.status] - order[b.status]
    })
}

// ── Small helpers ───────────────────────────────────────────────────────────

export function timeAgo(ts: number | null | undefined): string {
  if (!ts) return '—'
  const diff = Date.now() / 1000 - ts / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

export function formatBytes(n: number): string {
  if (n >= 1_073_741_824) return `${(n / 1_073_741_824).toFixed(1)}GB`
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(0)}MB`
  if (n >= 1024) return `${(n / 1024).toFixed(0)}KB`
  return `${n}B`
}

export function formatUptime(ms: number): string {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m`
  return `${s}s`
}

export function formatCost(cost: number): string {
  if (!cost || cost <= 0) return '$0.00'
  if (cost < 0.01) return `$${cost.toFixed(4)}`
  return `$${cost.toFixed(2)}`
}

// ── Worker identity constants (shared with the pixel world) ────────────────

export const WORKER_PALETTES: Record<string, { primary: string; dark: string; light: string; glow: string }> = {
  orchestrator: { primary: '#6366f1', dark: '#3730a3', light: '#a5b4fc', glow: '#818cf8' },
  builder: { primary: '#10b981', dark: '#065f46', light: '#6ee7b7', glow: '#34d399' },
  reviewer: { primary: '#f59e0b', dark: '#92400e', light: '#fcd34d', glow: '#fbbf24' },
  qa: { primary: '#06b6d4', dark: '#155e75', light: '#67e8f9', glow: '#22d3ee' },
  researcher: { primary: '#8b5cf6', dark: '#5b21b6', light: '#c4b5fd', glow: '#a78bfa' },
  'ops-watch': { primary: '#ef4444', dark: '#991b1b', light: '#fca5a5', glow: '#f87171' },
  maintainer: { primary: '#3b82f6', dark: '#1e40af', light: '#93c5fd', glow: '#60a5fa' },
  strategist: { primary: '#ec4899', dark: '#9d174d', light: '#f9a8d4', glow: '#f472b6' },
  'km-agent': { primary: '#14b8a6', dark: '#115e59', light: '#5eead4', glow: '#2dd4bf' },
  'inbox-triage': { primary: '#f97316', dark: '#9a3412', light: '#fdba74', glow: '#fb923c' },
}

export const WORKER_INITIALS: Record<string, string> = {
  orchestrator: 'OR',
  builder: 'BU',
  reviewer: 'RV',
  qa: 'QA',
  researcher: 'RS',
  'ops-watch': 'OP',
  maintainer: 'MT',
  strategist: 'ST',
  'km-agent': 'KM',
  'inbox-triage': 'IN',
}

export function workerColor(workerId: string): string {
  return WORKER_PALETTES[workerId]?.primary ?? '#8a8f98'
}
