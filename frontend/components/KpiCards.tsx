"use client";

import { DashboardSummary, HrvStatus } from "@/lib/api";
import { fmtDuration } from "@/lib/utils";

// ── Weekly Threshold Volume ───────────────────────────────────────────────────

export function WeeklyThresholdCard({ data }: { data: DashboardSummary | null }) {
  const secs = data?.weekly_threshold_volume_secs ?? 0;
  const target = data?.weekly_threshold_target_secs ?? 5400;
  const pct = Math.min(100, Math.round((secs / target) * 100));

  return (
    <Card label="Weekly Threshold Volume" sublabel="Zone 2 this week">
      <div className="tabular text-3xl font-bold text-zinc-100 tracking-tight">
        {fmtDuration(secs)}
      </div>
      <div className="mt-3">
        <div className="flex justify-between text-xs text-zinc-500 mb-1">
          <span>{pct}% of target</span>
          <span>{fmtDuration(target)}</span>
        </div>
        <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${pct}%`,
              backgroundColor: pct >= 100 ? "#22c55e" : pct >= 60 ? "#f59e0b" : "#3b82f6",
            }}
          />
        </div>
      </div>
    </Card>
  );
}

// ── Autonomic HRV Status ──────────────────────────────────────────────────────

const HRV_LABELS: Record<HrvStatus, { color: string; text: string; bg: string }> = {
  green:   { color: "#22c55e", text: "Optimal", bg: "bg-green-950/40 border-green-900" },
  yellow:  { color: "#eab308", text: "Monitor", bg: "bg-yellow-950/40 border-yellow-900" },
  red:     { color: "#ef4444", text: "Reduce Load", bg: "bg-red-950/40 border-red-900" },
  unknown: { color: "#71717a", text: "No data", bg: "bg-zinc-800/40 border-zinc-700" },
};

export function HRVCard({ data }: { data: DashboardSummary | null }) {
  const status: HrvStatus = data?.hrv_status ?? "unknown";
  const today = data?.hrv_today ?? null;
  const baseline = data?.hrv_baseline ?? null;
  const diff = today !== null && baseline !== null ? today - baseline : null;
  const label = HRV_LABELS[status];

  return (
    <Card label="Autonomic Status" sublabel="Waking HRV">
      <div className="flex items-center gap-3">
        <div
          className="w-3 h-3 rounded-full flex-shrink-0 shadow-lg"
          style={{
            backgroundColor: label.color,
            boxShadow: `0 0 8px ${label.color}88`,
          }}
        />
        <span className="tabular text-3xl font-bold text-zinc-100 tracking-tight">
          {today !== null ? `${Math.round(today)} ms` : "—"}
        </span>
      </div>
      {diff !== null && (
        <p className={`mt-1.5 text-xs font-medium ${diff >= 0 ? "text-green-400" : "text-red-400"}`}>
          {diff >= 0 ? "+" : ""}{diff.toFixed(1)} ms vs baseline
        </p>
      )}
      <div className={`mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${label.bg}`}
           style={{ color: label.color }}>
        {label.text}
      </div>
    </Card>
  );
}

// ── ACWR ──────────────────────────────────────────────────────────────────────

export function ACWRCard({ data }: { data: DashboardSummary | null }) {
  const acwr = data?.acwr ?? null;
  const risk = acwr !== null && acwr > 1.3;
  const warning = acwr !== null && acwr > 1.1 && acwr <= 1.3;

  return (
    <Card label="ACWR" sublabel="Acute:Chronic Workload Ratio">
      <div className="flex items-center gap-2">
        <span
          className={`tabular text-3xl font-bold tracking-tight ${
            risk ? "text-red-400" : warning ? "text-yellow-400" : "text-zinc-100"
          }`}
        >
          {acwr !== null ? acwr.toFixed(2) : "—"}
        </span>
        {risk && <span className="text-lg">🚩</span>}
      </div>
      {acwr !== null && (
        <p className={`mt-2 text-xs ${risk ? "text-red-400" : warning ? "text-yellow-400" : "text-green-400"}`}>
          {risk
            ? "Above 1.3 — injury risk zone"
            : warning
            ? "Approaching threshold — monitor"
            : "Within safe training range"}
        </p>
      )}
      <div className="mt-3 flex gap-1 items-center">
        {[0.6, 0.8, 1.0, 1.15, 1.3, 1.5].map((mark) => (
          <div
            key={mark}
            className="h-1 flex-1 rounded-sm"
            style={{
              backgroundColor:
                acwr !== null && acwr >= mark
                  ? mark >= 1.3
                    ? "#ef4444"
                    : mark >= 1.1
                    ? "#eab308"
                    : "#3b82f6"
                  : "#3f3f46",
            }}
          />
        ))}
      </div>
    </Card>
  );
}

// ── Shared card shell ─────────────────────────────────────────────────────────

function Card({
  label,
  sublabel,
  children,
}: {
  label: string;
  sublabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col">
      <div className="mb-3">
        <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
          {label}
        </p>
        <p className="text-xs text-zinc-600 mt-0.5">{sublabel}</p>
      </div>
      {children}
    </div>
  );
}
