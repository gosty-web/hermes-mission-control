import { motion } from 'framer-motion'
import { Link } from '@tanstack/react-router'
import {
  formatNumber,
  formatUptime,
  timeAgo,
  workerColor,
  WORKER_INITIALS,
  type MergedWorker,
  type WorkerStatus,
} from '@/hooks/use-mission-data'
import { cn } from '@/lib/utils'

// ────────────────────────────────────────────────────────────────────────────
// Worker grid — the hero widget (brief §6.2). 10 live status cards.
// Sort order: active → stuck → approval → error → warning → idle.
// ────────────────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<WorkerStatus, { dot: string; label: string; edge: string; pulse: boolean }> = {
  active: { dot: 'bg-emerald-400', label: 'text-emerald-400', edge: 'border-l-emerald-400', pulse: true },
  stuck: { dot: 'bg-amber-400', label: 'text-amber-400', edge: 'border-l-amber-400', pulse: false },
  approval: { dot: 'bg-violet-400', label: 'text-violet-400', edge: 'border-l-violet-400', pulse: false },
  error: { dot: 'bg-red-500', label: 'text-red-400', edge: 'border-l-red-500', pulse: false },
  warning: { dot: 'bg-orange-400', label: 'text-orange-400', edge: 'border-l-orange-400', pulse: false },
  idle: { dot: 'bg-[#5a6172]', label: 'text-[#7d8597]', edge: 'border-l-white/[0.08]', pulse: false },
}

function StatusDot({ status }: { status: WorkerStatus }) {
  const s = STATUS_STYLES[status]
  return (
    <span className="relative flex h-2 w-2 shrink-0">
      {s.pulse && (
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-50" />
      )}
      <span className={cn('relative inline-flex rounded-full h-2 w-2', s.dot)} />
    </span>
  )
}

function WorkerCard({ worker, index }: { worker: MergedWorker; index: number }) {
  const s = STATUS_STYLES[worker.status]
  const palette = workerColor(worker.workerId)
  const initials = WORKER_INITIALS[worker.workerId] ?? worker.workerId.slice(0, 2).toUpperCase()
  const health = worker.health

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.3), duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        'group relative rounded-xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-xl',
        'hover:bg-white/[0.045] transition-colors duration-200 border-l-2',
        s.edge,
      )}
    >
      <Link
        to="/swarm2"
        className="block p-3.5 outline-none focus-visible:ring-2 ring-indigo-400/40 rounded-xl"
      >
        <div className="flex items-start gap-3">
          {/* avatar */}
          <div
            className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tracking-wide text-white"
            style={{
              background: `radial-gradient(circle at 30% 25%, ${palette}33, ${palette}14 60%, transparent)`,
              boxShadow: `inset 0 0 0 1px ${palette}55`,
            }}
          >
            <span style={{ textShadow: `0 0 8px ${palette}88` }}>{initials}</span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-[13px] font-medium text-[#f0f2f7] tracking-[-0.01em]">
                {worker.displayName}
              </span>
              <StatusDot status={worker.status} />
              <span className={cn('text-[10.5px] font-medium', s.label)}>{worker.statusLabel}</span>
            </div>
            <div className="mt-0.5 truncate text-[11px] text-[#7d8597]">{worker.humanLabel ?? worker.role}</div>
          </div>
        </div>

        {/* current task */}
        <div className="mt-2.5 truncate rounded-md bg-white/[0.03] px-2 py-1.5 text-[11.5px] text-[#b6bdcb]" title={worker.currentTask ?? ''}>
          {worker.currentTask ?? '—'}
        </div>

        {/* meta row */}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          {worker.activeTool ? (
            <span className="inline-flex items-center gap-1 rounded border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 font-mono text-[10px] text-indigo-300">
              {worker.activeTool}
            </span>
          ) : null}
          {worker.model ? (
            <span className="font-mono text-[10px] text-[#5a6172]">{worker.model}</span>
          ) : null}
          {worker.uptimeMs > 0 ? (
            <span className="font-mono text-[10px] text-[#5a6172]">↑ {formatUptime(worker.uptimeMs)}</span>
          ) : null}
          {worker.stuckMinutes !== null ? (
            <span className="font-mono text-[10px] text-amber-400/90">⏱ {worker.stuckMinutes}m no output</span>
          ) : null}
          {worker.needsHuman ? (
            <span className="font-mono text-[10px] text-violet-300">greenlight required</span>
          ) : null}
        </div>

        {/* capabilities */}
        {worker.capabilities && worker.capabilities.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {worker.capabilities.slice(0, 3).map((c) => (
              <span key={c} className="rounded-full border border-white/[0.06] bg-white/[0.02] px-1.5 py-px text-[9.5px] text-[#7d8597]">
                {c}
              </span>
            ))}
            {worker.capabilities.length > 3 && (
              <span className="rounded-full border border-white/[0.06] px-1.5 py-px text-[9.5px] text-[#5a6172]">
                +{worker.capabilities.length - 3}
              </span>
            )}
          </div>
        ) : null}

        {/* error / warning footer */}
        {worker.hasError && health && (health.lastErrorMessage || health.lastFallbackMessage) ? (
          <div className="mt-2 rounded-md border border-red-500/20 bg-red-500/[0.06] px-2 py-1.5">
            <div className="truncate text-[10px] text-red-300/90" title={health.lastErrorMessage ?? health.lastFallbackMessage ?? ''}>
              ⚠ {health.lastErrorMessage ?? health.lastFallbackMessage}
            </div>
            <div className="text-[9.5px] text-[#5a6172]">
              {timeAgo(health.lastErrorAt ?? health.lastFallbackAt)}
              {health.recentAuthErrors > 0 ? ` · ${health.recentAuthErrors} auth err` : ''}
              {health.recentFallbacks > 0 ? ` · ${health.recentFallbacks} fallbacks` : ''}
            </div>
          </div>
        ) : null}
      </Link>

      {/* corner count */}
      {worker.assignedTaskCount > 0 && (
        <div className="absolute right-2.5 top-2.5 rounded-md bg-white/[0.05] px-1.5 py-0.5 font-mono text-[10px] text-[#7d8597]">
          {worker.assignedTaskCount} task{worker.assignedTaskCount === 1 ? '' : 's'}
        </div>
      )}
    </motion.div>
  )
}

export function WorkerGrid({ workers }: { workers: Array<MergedWorker> }) {
  if (!workers || workers.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-white/[0.08] text-[12px] text-[#5a6172]">
        no swarm workers reported
      </div>
    )
  }

  const active = workers.filter((w) => w.status === 'active').length
  const stuck = workers.filter((w) => w.status === 'stuck' || w.status === 'error').length

  return (
    <section>
      <div className="mb-2.5 flex items-baseline justify-between px-0.5">
        <h2 className="text-[13px] font-medium tracking-[-0.01em] text-[#f0f2f7]">Swarm workers</h2>
        <div className="flex items-center gap-3 font-mono text-[10px] text-[#5a6172]">
          <span className="text-emerald-400/80">{active} active</span>
          <span className="text-amber-400/80">{stuck} stuck</span>
          <span>{workers.length} total</span>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {workers.map((w, i) => (
          <WorkerCard key={w.workerId} worker={w} index={i} />
        ))}
      </div>
    </section>
  )
}
