import { useMemo } from 'react'
import { WorkerGrid } from './worker-grid'
import { ApprovalInbox } from './approval-inbox'
import { SessionsList } from './sessions-list'
import { MissionKanban } from './mission-kanban'
import {
  mergeWorkers,
  useSwarmHealth,
  useSwarmKanban,
  useSwarmRuntime,
} from '@/hooks/use-mission-data'
import './mission-control.css'

// ────────────────────────────────────────────────────────────────────────────
// Swarm mission pulse — mission-control widgets folded into the EXISTING
// /swarm2 screen (swarm2 already has kanban + orchestrator cards + reports;
// this augments it with the worker grid, approval inbox, sessions, and the
// swarm kanban board, all on the dark Linear canvas).
// ────────────────────────────────────────────────────────────────────────────

export function SwarmMissionPulse() {
  const runtime = useSwarmRuntime()
  const health = useSwarmHealth()
  const kanban = useSwarmKanban()

  const workers = useMemo(
    () => mergeWorkers(runtime.data, health.data),
    [runtime.data, health.data],
  )

  const pendingHuman = useMemo(
    () =>
      workers
        .filter((w) => w.needsHuman)
        .map((w) => ({
          workerId: w.workerId,
          displayName: w.displayName,
          task: w.currentTask,
          since: w.lastOutputAt ?? Date.now(),
        })),
    [workers],
  )

  const cards = kanban.data?.cards

  return (
    <section
      aria-label="Mission pulse — swarm operations"
      className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0a0e1a] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.35)]"
    >
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-[13px] font-medium tracking-[-0.01em] text-[#f0f2f7]">Mission pulse</h2>
          <p className="text-[10.5px] text-[#5a6172]">worker grid · approvals · sessions · kanban</p>
        </div>
        <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 font-mono text-[9.5px] text-[#7d8597]">
          {workers.length} workers
        </span>
      </div>

      <div className="grid gap-3 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-3">
          <WorkerGrid workers={workers} />
          <div className="h-[380px]">
            <MissionKanban cards={cards} />
          </div>
        </div>
        <div className="flex min-h-0 flex-col gap-3">
          <div className="max-h-[280px] overflow-y-auto mission-scroll">
            <ApprovalInbox cards={cards} pendingHuman={pendingHuman} />
          </div>
          <div className="h-[240px]">
            <SessionsList />
          </div>
        </div>
      </div>
    </section>
  )
}
