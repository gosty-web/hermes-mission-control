import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { formatCost, formatNumber, useSessions, type SessionRow } from '@/hooks/use-mission-data'

// ────────────────────────────────────────────────────────────────────────────
// Metrics row — 4 KPIs client-reduced from /api/sessions (brief §6.7).
// Total tokens · tool calls · sessions today · est. cost. Reduced every 60s
// (via the sessions query's 15s cadence + memoization).
// ────────────────────────────────────────────────────────────────────────────

type Kpi = {
  label: string
  value: string
  sub: string
  accent: string
  spark?: Array<number>
}

function Sparkline({ points, color }: { points: Array<number>; color: string }) {
  if (points.length < 2) return <div className="h-6" />
  const max = Math.max(...points, 1)
  const min = Math.min(...points, 0)
  const range = Math.max(max - min, 1)
  const step = 100 / (points.length - 1)
  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(24 - ((p - min) / range) * 22).toFixed(1)}`)
    .join(' ')
  return (
    <svg className="h-6 w-full" viewBox="0 0 100 24" preserveAspectRatio="none">
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.85" />
    </svg>
  )
}

export function MetricsRow() {
  const sessions = useSessions()

  const kpis = useMemo<Array<Kpi>>(() => {
    const list: Array<SessionRow> = sessions.data ?? []
    const now = Date.now()
    const dayMs = 24 * 3600 * 1000

    const last24h = list.filter((s) => s.createdAt && now - s.createdAt < dayMs)
    const totalTokens = last24h.reduce((acc, s) => acc + (s.tokenCount ?? s.totalTokens ?? 0), 0)
    const toolCalls = last24h.reduce((acc, s) => acc + (s.tool_call_count ?? 0), 0)
    const sessionsToday = new Set(last24h.map((s) => new Date(s.createdAt).toDateString())).size
    const cost = last24h.reduce((acc, s) => acc + (s.cost ?? 0), 0)

    // hourly buckets for sparklines
    const buckets = Array.from({ length: 24 }, (_, i) => now - (23 - i) * 3600 * 1000)
    const tokenSeries = buckets.map(
      (t) => last24h.filter((s) => s.createdAt && Math.abs(s.createdAt - t) < 3600 * 1000).reduce((a, s) => a + (s.tokenCount ?? 0), 0) / 1000,
    )
    const toolSeries = buckets.map(
      (t) => last24h.filter((s) => s.createdAt && Math.abs(s.createdAt - t) < 3600 * 1000).reduce((a, s) => a + (s.tool_call_count ?? 0), 0),
    )

    return [
      { label: 'Tokens · 24h', value: formatNumber(totalTokens), sub: 'prompt + completion', accent: '#818cf8', spark: tokenSeries },
      { label: 'Tool calls · 24h', value: formatNumber(toolCalls), sub: 'across all sessions', accent: '#34d399', spark: toolSeries },
      { label: 'Sessions · today', value: String(sessionsToday), sub: `${list.length} total stored`, accent: '#fbbf24' },
      { label: 'Est. cost · 24h', value: formatCost(cost), sub: 'from session ledger', accent: '#f472b6' },
    ]
  }, [sessions.data])

  return (
    <section className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
      {kpis.map((kpi, i) => (
        <motion.div
          key={kpi.label}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="relative overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-3 backdrop-blur-xl"
        >
          <div className="flex items-baseline justify-between">
            <span className="text-[10px] font-medium tracking-wide text-[#7d8597] uppercase">{kpi.label}</span>
            <span className="font-mono text-[9.5px] text-[#4a5060]">·24h</span>
          </div>
          <div className="mt-1 text-[22px] font-medium leading-none tracking-[-0.03em] text-[#f0f2f7] tabular-nums">
            {kpi.value}
          </div>
          <div className="mt-1.5 flex items-end justify-between gap-2">
            <span className="text-[10px] text-[#5a6172]">{kpi.sub}</span>
            {'spark' in kpi && kpi.spark && kpi.spark.length > 1 ? (
              <Sparkline points={kpi.spark} color={kpi.accent} />
            ) : null}
          </div>
          <div
            className="pointer-events-none absolute -right-6 -top-8 h-20 w-20 rounded-full opacity-[0.07] blur-2xl"
            style={{ background: kpi.accent }}
          />
        </motion.div>
      ))}
    </section>
  )
}
