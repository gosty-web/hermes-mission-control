import { useState } from 'react'
import { motion } from 'framer-motion'
import { useQueryClient } from '@tanstack/react-query'
import { timeAgo, workerColor, type KanbanCard } from '@/hooks/use-mission-data'
import { cn } from '@/lib/utils'

// ────────────────────────────────────────────────────────────────────────────
// Approval inbox — greenlight-gated actions waiting (brief §6.4).
// Cards in 'review' / 'ready' lanes that need a human gate, plus runtime
// workers flagged needsHuman. Approve POSTs the status move to /api/swarm-kanban.
// ────────────────────────────────────────────────────────────────────────────

const GREENLIGHT_LANES = new Set(['review', 'ready'])

export function ApprovalInbox({
  cards,
  pendingHuman,
}: {
  cards: Array<KanbanCard> | undefined
  pendingHuman: Array<{ workerId: string; displayName: string; task: string | null; since: number }>
}) {
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const awaiting = (cards ?? []).filter((c) => GREENLIGHT_LANES.has(c.status))

  async function approve(card: KanbanCard) {
    setBusy(card.id)
    setError(null)
    try {
      const res = await fetch('/api/swarm-kanban', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: card.id, status: 'running' }),
      })
      const data = (await res.json()) as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) throw new Error(data.error ?? `PATCH failed (${res.status})`)
      await queryClient.invalidateQueries({ queryKey: ['mc', 'swarm-kanban'] })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  const total = awaiting.length + pendingHuman.length

  return (
    <section className="flex flex-col rounded-xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-xl">
      <div className="flex items-center justify-between px-3.5 pt-3 pb-2">
        <h2 className="text-[13px] font-medium tracking-[-0.01em] text-[#f0f2f7]">Approval inbox</h2>
        {total > 0 && (
          <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] font-semibold text-violet-300">
            {total} waiting
          </span>
        )}
      </div>

      <div className="space-y-1.5 px-2.5 pb-2.5">
        {error && (
          <div className="rounded-md border border-red-500/25 bg-red-500/[0.08] px-2 py-1.5 text-[10.5px] text-red-300">
            {error}
          </div>
        )}

        {awaiting.length === 0 && pendingHuman.length === 0 ? (
          <div className="flex h-16 items-center justify-center gap-2 rounded-lg border border-dashed border-emerald-400/20 bg-emerald-400/[0.04] text-[11px] text-emerald-300/70">
            <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
              <path d="M3 8.5L6.5 12L13 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            no approvals pending
          </div>
        ) : (
          <>
            {awaiting.map((card) => (
              <motion.div
                key={card.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-2.5"
              >
                <div className="flex items-start gap-2">
                  {card.assignedWorker ? (
                    <span
                      className="mt-0.5 shrink-0 rounded px-1.5 py-0.5 font-mono text-[9.5px] font-medium"
                      style={{ background: `${workerColor(card.assignedWorker)}1a`, color: workerColor(card.assignedWorker) }}
                    >
                      {card.assignedWorker}
                    </span>
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <div className="text-[11.5px] leading-snug text-[#e5e7eb]">{card.title}</div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="rounded border border-violet-400/25 bg-violet-400/10 px-1.5 py-px text-[9px] font-medium text-violet-300">
                        {card.status} · greenlight
                      </span>
                      <span className="font-mono text-[9.5px] text-[#5a6172]">{timeAgo(card.createdAt / 1000)}</span>
                    </div>
                  </div>
                </div>
                <div className="mt-2 flex gap-1.5">
                  <button
                    onClick={() => approve(card)}
                    disabled={busy === card.id}
                    className={cn(
                      'flex-1 rounded-md bg-violet-500/90 py-1 text-[10.5px] font-semibold text-white transition-colors hover:bg-violet-400',
                      busy === card.id && 'opacity-60',
                    )}
                  >
                    {busy === card.id ? 'Approving…' : 'Approve'}
                  </button>
                  <button className="rounded-md border border-white/[0.08] px-2.5 py-1 text-[10.5px] font-medium text-[#b6bdcb] hover:bg-white/[0.05]">
                    Inspect
                  </button>
                </div>
              </motion.div>
            ))}

            {pendingHuman.map((w) => (
              <div key={w.workerId} className="flex items-center gap-2 rounded-lg border border-violet-400/20 bg-violet-400/[0.06] p-2.5">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[11.5px] text-[#e5e7eb]">
                    <span className="font-medium">{w.displayName}</span> requests greenlight
                  </div>
                  <div className="truncate text-[10px] text-[#7d8597]">{w.task ?? 'awaiting dispatch'}</div>
                </div>
                <span className="shrink-0 font-mono text-[9.5px] text-[#5a6172]">{timeAgo(w.since / 1000)}</span>
              </div>
            ))}
          </>
        )}
      </div>
    </section>
  )
}
