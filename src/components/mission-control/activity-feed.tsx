import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Link } from '@tanstack/react-router'
import {
  timeAgo,
  workerColor,
  useSessions,
  useSwarmRuntime,
  useSwarmReports,
  type SessionRow,
} from '@/hooks/use-mission-data'

// ────────────────────────────────────────────────────────────────────────────
// Activity feed — right rail (brief §6.3). Sources: sessions (status/activity
// changes), swarm-runtime (worker output beats), swarm-reports (task done).
// Cap at 100 entries. Deep-links into /chat/$sessionKey.
// ────────────────────────────────────────────────────────────────────────────

type FeedEntry = {
  id: string
  ts: number
  kind: 'session' | 'worker' | 'report' | 'tool'
  workerId: string | null
  text: string
  detail?: string | null
  sessionKey?: string | null
  tone: 'green' | 'amber' | 'red' | 'neutral' | 'indigo'
}

const TONE_DOT: Record<FeedEntry['tone'], string> = {
  green: 'bg-emerald-400',
  amber: 'bg-amber-400',
  red: 'bg-red-500',
  indigo: 'bg-indigo-400',
  neutral: 'bg-[#5a6172]',
}

function sessionToEntries(sessions: Array<SessionRow> | undefined): Array<FeedEntry> {
  if (!sessions) return []
  return sessions.slice(0, 40).flatMap((s, i) => {
    const entries: Array<FeedEntry> = []
    if (i === 0 && s.status === 'idle') {
      entries.push({
        id: `s-${s.key}-tail`,
        ts: s.updatedAt,
        kind: 'session',
        workerId: null,
        text: `session ${s.title ?? s.label ?? s.key.slice(-8)} ended`,
        detail: `${s.message_count ?? 0} msgs · ${s.tool_call_count ?? 0} tool calls`,
        sessionKey: s.key,
        tone: 'neutral',
      })
    }
    if (i < 6) {
      entries.push({
        id: `s-${s.key}-${i}`,
        ts: s.updatedAt,
        kind: 'session',
        workerId: null,
        text: s.title ?? s.label ?? `session ${s.key.slice(-8)}`,
        detail: s.model ?? `${s.tokenCount ?? 0} tokens`,
        sessionKey: s.key,
        tone: i === 0 ? 'indigo' : 'neutral',
      })
    }
    return entries
  })
}

function runtimeToEntries(runtime: Array<{ workerId: string; displayName: string; currentTask: string | null; activeTool: string | null; lastOutputAt: number | null }> | undefined): Array<FeedEntry> {
  if (!runtime) return []
  const now = Date.now()
  return runtime
    .filter((r) => r.lastOutputAt && now - r.lastOutputAt < 24 * 3600 * 1000)
    .map((r) => ({
      id: `r-${r.workerId}-${r.lastOutputAt}`,
      ts: r.lastOutputAt ?? now,
      kind: 'worker' as const,
      workerId: r.workerId,
      text: r.currentTask && !r.currentTask.startsWith('Standing by')
        ? r.currentTask
        : r.activeTool
          ? `using ${r.activeTool}`
          : 'standing by',
      detail: r.activeTool ?? null,
      sessionKey: null,
      tone: r.activeTool ? ('indigo' as const) : ('neutral' as const),
    }))
}

function reportsToEntries(reports: Array<{ workerId: string | null; title?: string | null; summary?: string | null; outcome?: string | null; fetchedAt?: number; createdAt?: number }> | undefined): Array<FeedEntry> {
  if (!reports) return []
  return reports.map((r) => ({
    id: `rep-${r.workerId}-${r.fetchedAt ?? r.createdAt ?? Math.random()}`,
    ts: r.fetchedAt ?? r.createdAt ?? Date.now(),
    kind: 'report' as const,
    workerId: r.workerId,
    text: r.title ?? 'task report',
    detail: r.summary ?? r.outcome ?? null,
    sessionKey: null,
    tone: r.outcome === 'failed' ? ('red' as const) : ('green' as const),
  }))
}

export function ActivityFeed() {
  const sessions = useSessions()
  const runtime = useSwarmRuntime()
  const reports = useSwarmReports()
  const [filter, setFilter] = useState<'all' | 'activity' | 'reports'>('all')

  const entries = useMemo<Array<FeedEntry>>(() => {
    const all = [
      ...reportsToEntries(reports.data),
      ...sessionToEntries(sessions.data),
      ...runtimeToEntries(runtime.data),
    ].sort((a, b) => b.ts - a.ts)
    return all.slice(0, 100)
  }, [sessions.data, runtime.data, reports.data])

  const filtered = filter === 'all' ? entries : filter === 'reports' ? entries.filter((e) => e.kind === 'report') : entries.filter((e) => e.kind !== 'report')

  return (
    <section className="flex h-full min-h-0 flex-col rounded-xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-xl">
      <div className="flex items-center justify-between px-3.5 pt-3 pb-2">
        <h2 className="text-[13px] font-medium tracking-[-0.01em] text-[#f0f2f7]">Activity</h2>
        <div className="flex items-center gap-1 rounded-lg bg-white/[0.04] p-0.5">
          {(['all', 'activity', 'reports'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-md px-2 py-0.5 text-[10px] font-medium capitalize transition-colors ${
                filter === f ? 'bg-white/[0.08] text-[#f0f2f7]' : 'text-[#5a6172] hover:text-[#b6bdcb]'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-2 mission-scroll">
        {filtered.length === 0 ? (
          <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-white/[0.08] text-[11px] text-[#5a6172]">
            no activity yet — agents are standing by
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {filtered.slice(0, 60).map((e) => (
              <motion.div
                key={e.id}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.18 }}
                className="group flex items-start gap-2 rounded-lg px-1.5 py-1.5 hover:bg-white/[0.03]"
              >
                <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${TONE_DOT[e.tone]}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-1.5">
                    {e.workerId ? (
                      <span className="shrink-0 font-mono text-[10px] font-medium" style={{ color: workerColor(e.workerId) }}>
                        {e.workerId}
                      </span>
                    ) : (
                      <span className="shrink-0 font-mono text-[10px] text-[#5a6172]">sys</span>
                    )}
                    <span className="truncate text-[11px] text-[#b6bdcb]">{e.text}</span>
                    <span className="ml-auto shrink-0 font-mono text-[9.5px] text-[#5a6172]">{timeAgo(e.ts / 1000)}</span>
                  </div>
                  {e.detail ? <div className="mt-0.5 truncate pl-[18px] text-[10px] text-[#7d8597]">{e.detail}</div> : null}
                  {e.sessionKey ? (
                    <Link
                      to="/chat/$sessionKey"
                      params={{ sessionKey: e.sessionKey }}
                      className="mt-0.5 inline-block pl-[18px] text-[10px] text-indigo-300/80 hover:text-indigo-200"
                    >
                      open session →
                    </Link>
                  ) : null}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </section>
  )
}
