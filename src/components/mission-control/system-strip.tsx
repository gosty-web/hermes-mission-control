import { motion } from 'framer-motion'
import { useGatewayHealth, useSystemMetrics, type SystemMetrics } from '@/hooks/use-mission-data'
import { cn } from '@/lib/utils'

// ────────────────────────────────────────────────────────────────────────────
// System strip — sticky header, every Mission Control page (brief §6.1).
// CPU · RAM · disk · hermes health · gateway status. Polled every 10s.
// ────────────────────────────────────────────────────────────────────────────

function Meter({
  label,
  value,
  percent,
  hint,
  tone = 'default',
}: {
  label: string
  value: string
  percent: number
  hint?: string
  tone?: 'default' | 'warn' | 'danger'
}) {
  const barColor =
    tone === 'danger' ? 'bg-red-500' : tone === 'warn' ? 'bg-amber-400' : 'bg-indigo-400/80'
  return (
    <div className="flex items-center gap-2 px-3 h-9" title={hint}>
      <span className="text-[11px] font-medium tracking-wide text-[#7d8597] uppercase w-8">{label}</span>
      <div className="w-16 h-[5px] rounded-full bg-white/[0.06] overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-700', barColor)}
          style={{ width: `${Math.min(100, Math.max(2, percent))}%` }}
        />
      </div>
      <span className="text-[11.5px] font-medium text-[#b6bdcb] tabular-nums w-14">{value}</span>
    </div>
  )
}

export function SystemStrip() {
  const metrics = useSystemMetrics()
  const gateway = useGatewayHealth()
  const m: SystemMetrics | undefined = metrics.data

  const cpu = m?.cpu
  const mem = m?.memory
  const disk = m?.disk
  const hermes = m?.hermes

  const cpuTone = (cpu?.loadPercent ?? 0) > 90 ? 'danger' : (cpu?.loadPercent ?? 0) > 70 ? 'warn' : 'default'
  const memTone = (mem?.usedPercent ?? 0) > 90 ? 'danger' : (mem?.usedPercent ?? 0) > 75 ? 'warn' : 'default'
  const diskTone = (disk?.usedPercent ?? 0) > 90 ? 'danger' : (disk?.usedPercent ?? 0) > 80 ? 'warn' : 'default'

  return (
    <div className="sticky top-0 z-40 backdrop-blur-2xl bg-[#0a0e1a]/70 border-b border-white/[0.06]">
      <div className="flex items-center h-11 px-4 gap-1 overflow-x-auto no-scrollbar">
        {/* hermes status */}
        <div className="flex items-center gap-2 px-3 h-9 rounded-lg" title={`hermes ${hermes?.status ?? 'unknown'}`}>
          <span className="relative flex h-2 w-2">
            {hermes?.health ? (
              <>
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
              </>
            ) : (
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400" />
            )}
          </span>
          <span className="text-[11.5px] font-medium text-[#b6bdcb]">hermes</span>
          <span className="text-[11px] font-medium text-[#5a6172]">{hermes?.status ?? '…'}</span>
        </div>

        <div className="h-5 w-px bg-white/[0.06]" />

        <Meter label="CPU" value={`${Math.round(cpu?.loadPercent ?? 0)}%`} percent={cpu?.loadPercent ?? 0} hint={`load avg ${cpu?.loadAverage1m?.toFixed(2) ?? '…'} / ${cpu?.cores ?? '?'} cores`} tone={cpuTone} />
        <Meter label="RAM" value={`${Math.round(mem?.usedPercent ?? 0)}%`} percent={mem?.usedPercent ?? 0} hint={`${mem ? Math.round(mem.usedBytes / 1048576) : '…'} MB used`} tone={memTone} />
        <Meter label="DISK" value={`${Math.round(disk?.usedPercent ?? 0)}%`} percent={disk?.usedPercent ?? 0} hint={`${disk?.path ?? ''} ${disk ? Math.round(disk.usedBytes / 1073741824) : '…'} GB`} tone={diskTone} />

        <div className="h-5 w-px bg-white/[0.06]" />

        {/* gateway */}
        <div className="flex items-center gap-2 px-3 h-9" title="hermes gateway :8642">
          <span className={cn('h-1.5 w-1.5 rounded-full', gateway.data === false ? 'bg-red-500' : gateway.isLoading ? 'bg-[#5a6172]' : 'bg-emerald-400')} />
          <span className="text-[11px] font-medium text-[#7d8597]">gw :8642</span>
        </div>

        <div className="ml-auto flex items-center gap-2 px-3">
          <motion.span
            key={metrics.isFetching ? 'live' : 'idle'}
            initial={{ opacity: 0.4 }}
            animate={{ opacity: 1 }}
            className="text-[10.5px] font-medium tracking-wider text-[#5a6172] uppercase"
          >
            {metrics.isFetching ? '● live' : 'polling'}
          </motion.span>
        </div>
      </div>
    </div>
  )
}
