import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { formatCost, formatNumber, timeAgo, useSessions, type SessionRow } from '@/hooks/use-mission-data'
import { cn } from '@/lib/utils'

// ────────────────────────────────────────────────────────────────────────────
// Sessions list — recent runs with tokens/cost/tools (brief §6.6).
// Sort by updatedAt desc; client-side search; deep-link /chat/$sessionKey.
// ────────────────────────────────────────────────────────────────────────────

const STATUS_PILL: Record<string, string> = {
  idle: 'bg-white/[0.06] text-[#b6bdcb]',
  ended: 'bg-white/[0.05] text-[#7d8597]',
  running: 'bg-emerald-500/15 text-emerald-300',
  active: 'bg-emerald-500/15 text-emerald-300',
  error: 'bg-red-500/15 text-red-300',
}

export function SessionsList() {
  const sessions = useSessions()
  const [q, setQ] = useState('')

  const rows = useMemo(() => {
    const list = [...(sessions.data ?? [])].sort((a, b) => b.updatedAt - a.updatedAt)
    if (!q.trim()) return list.slice(0, 12)
    const needle = q.trim().toLowerCase()
    return list
      .filter(
        (s) =>
          (s.title ?? '').toLowerCase().includes(needle) ||
          (s.label ?? '').toLowerCase().includes(needle) ||
          (s.model ?? '').toLowerCase().includes(needle) ||
          (s.key ?? '').toLowerCase().includes(needle),
      )
      .slice(0, 12)
  }, [sessions.data, q])

  return (
    <section className="flex min-h-0 flex-col rounded-xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3 px-3.5 pt-3 pb-2">
        <h2 className="text-[13px] font-medium tracking-[-0.01em] text-[#f0f2f7]">Sessions</h2>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search sessions…"
          className="w-44 rounded-lg border border-white/[0.07] bg-white/[0.03] px-2.5 py-1 text-[11px] text-[#e5e7eb] placeholder:text-[#4a5060] outline-none focus:border-indigo-400/40"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2 mission-scroll">
        {rows.length === 0 ? (
          <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-white/[0.08] text-[11px] text-[#5a6172]">
            {q ? 'no sessions match' : 'no sessions yet'}
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {rows.map((s: SessionRow) => (
              <Link
                key={s.key}
                to="/chat/$sessionKey"
                params={{ sessionKey: s.key }}
                className="group flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/[0.03]"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[11.5px] text-[#e5e7eb]">{s.title ?? s.label ?? s.key.slice(-8)}</span>
                    <span className={cn('shrink-0 rounded-full px-1.5 py-px text-[9px] font-medium capitalize', STATUS_PILL[s.status] ?? STATUS_PILL.idle)}>
                      {s.status}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 font-mono text-[9.5px] text-[#5a6172]">
                    {s.model ? <span>{s.model}</span> : null}
                    <span>{s.message_count ?? 0} msgs</span>
                    <span>{s.tool_call_count ?? 0} tools</span>
                    <span>{formatNumber(s.tokenCount ?? 0)} tok</span>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-mono text-[10px] text-[#7d8597]">{formatCost(s.cost ?? 0)}</div>
                  <div className="font-mono text-[9px] text-[#4a5060]">{timeAgo(s.updatedAt / 1000)}</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
