import { useState } from 'react'
import { motion } from 'framer-motion'
import { useQueryClient } from '@tanstack/react-query'
import { timeAgo, workerColor, type KanbanCard } from '@/hooks/use-mission-data'
import { cn } from '@/lib/utils'

// ────────────────────────────────────────────────────────────────────────────
// Mission kanban — 4 columns (brief §6.5). Read + move + approve via
// PATCH /api/swarm-kanban. Column mapping from the 7-lane internal vocab:
// backlog/todo/ready → Backlog · running/review → Active · blocked → Blocked · done → Done
// ────────────────────────────────────────────────────────────────────────────

type ColumnId = 'backlog' | 'active' | 'blocked' | 'done'

const COLUMNS: Array<{ id: ColumnId; label: string; match: Array<string> }> = [
  { id: 'backlog', label: 'Backlog', match: ['backlog', 'todo', 'ready'] },
  { id: 'active', label: 'Active', match: ['running', 'review'] },
  { id: 'blocked', label: 'Blocked', match: ['blocked'] },
  { id: 'done', label: 'Done', match: ['done'] },
]

const MOVE_TO: Record<ColumnId, string> = {
  backlog: 'ready',
  active: 'review',
  blocked: 'blocked',
  done: 'done',
}

export function MissionKanban({ cards }: { cards: Array<KanbanCard> | undefined }) {
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function moveCard(card: KanbanCard, column: ColumnId) {
    setBusy(`${card.id}->${column}`)
    setError(null)
    try {
      const res = await fetch('/api/swarm-kanban', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: card.id, status: MOVE_TO[column] }),
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

  return (
    <section className="flex min-h-0 flex-col rounded-xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-xl">
      <div className="flex items-center justify-between px-3.5 pt-3 pb-2">
        <h2 className="text-[13px] font-medium tracking-[-0.01em] text-[#f0f2f7]">Mission board</h2>
        {error && <span className="font-mono text-[9.5px] text-red-400">{error}</span>}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-2 px-2.5 pb-2.5 lg:grid-cols-4">
        {COLUMNS.map((col) => {
          const colCards = (cards ?? []).filter((c) => col.match.includes(c.status))
          return (
            <div key={col.id} className="flex min-h-0 flex-col rounded-lg border border-white/[0.04] bg-white/[0.015]">
              <div className="flex items-center gap-2 px-2.5 py-2">
                <span className="text-[10.5px] font-semibold tracking-wide text-[#7d8597] uppercase">{col.label}</span>
                <span className="rounded-full bg-white/[0.05] px-1.5 text-[9.5px] font-mono text-[#5a6172]">{colCards.length}</span>
              </div>
              <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-1.5 pb-2 mission-scroll">
                {colCards.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-white/[0.06] py-3 text-center text-[10px] text-[#4a5060]">
                    empty
                  </div>
                ) : (
                  colCards.map((card) => (
                    <motion.div
                      key={card.id}
                      layout
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="group rounded-lg border border-white/[0.07] bg-[#141a2a]/90 p-2 hover:border-white/[0.14]"
                    >
                      <div className="text-[11px] leading-snug text-[#e5e7eb]">{card.title}</div>
                      {card.assignedWorker ? (
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <span
                            className="rounded px-1 py-px font-mono text-[9px]"
                            style={{ background: `${workerColor(card.assignedWorker)}1a`, color: workerColor(card.assignedWorker) }}
                          >
                            {card.assignedWorker}
                          </span>
                          <span className="font-mono text-[9px] text-[#5a6172]">{timeAgo(card.updatedAt / 1000)}</span>
                        </div>
                      ) : null}
                      <div className="mt-1.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        {COLUMNS.filter((c) => c.id !== col.id).map((c) => (
                          <button
                            key={c.id}
                            onClick={() => moveCard(card, c.id)}
                            disabled={busy === `${card.id}->${c.id}`}
                            className="rounded border border-white/[0.08] px-1.5 py-0.5 text-[9px] text-[#7d8597] hover:bg-white/[0.06] hover:text-[#f0f2f7]"
                          >
                            {c.label.toLowerCase()}
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
