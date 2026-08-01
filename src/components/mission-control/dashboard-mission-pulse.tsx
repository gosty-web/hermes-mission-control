import { SystemStrip } from './system-strip'
import { MetricsRow } from './metrics-row'
import { ActivityFeed } from './activity-feed'
import './mission-control.css'

// ────────────────────────────────────────────────────────────────────────────
// Mission pulse — mission-control widgets folded into the EXISTING /dashboard
// screen (David: never create duplicate top-level sections; improve in place).
// Dark Linear canvas keeps the widgets' design language intact regardless of
// the surrounding dashboard theme.
// ────────────────────────────────────────────────────────────────────────────

export function DashboardMissionPulse() {
  return (
    <section
      aria-label="Mission pulse — live swarm"
      className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0a0e1a] shadow-[0_24px_80px_rgba(0,0,0,0.35)]"
    >
      {/* host strip: CPU · RAM · disk · hermes · gateway (renders statically
          inside this overflow-hidden container; sticky has no room to move) */}
      <div className="overflow-hidden">
        <SystemStrip />
      </div>

      <div className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[13px] font-medium tracking-[-0.01em] text-[#f0f2f7]">Mission pulse</h2>
            <p className="text-[10.5px] text-[#5a6172]">live swarm telemetry folded into your dashboard</p>
          </div>
          <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 font-mono text-[9.5px] text-[#7d8597]">
            /api/swarm-* · 10s
          </span>
        </div>

        <MetricsRow />

        <div className="h-[320px]">
          <ActivityFeed />
        </div>
      </div>
    </section>
  )
}
