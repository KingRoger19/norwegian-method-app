"use client";

import type { Readiness } from "@/lib/api";

interface Props {
  data: Readiness | null;
}

const STATUS_CONFIG = {
  green: {
    bg: "bg-green-950/40",
    border: "border-green-800/60",
    dot: "bg-green-400",
    text: "text-green-300",
    badge: "bg-green-900/50 text-green-300",
  },
  yellow: {
    bg: "bg-amber-950/40",
    border: "border-amber-800/60",
    dot: "bg-amber-400",
    text: "text-amber-300",
    badge: "bg-amber-900/50 text-amber-300",
  },
  red: {
    bg: "bg-red-950/40",
    border: "border-red-800/60",
    dot: "bg-red-400",
    text: "text-red-300",
    badge: "bg-red-900/50 text-red-300",
  },
};

function Pill({
  active,
  label,
  status,
}: {
  active: boolean;
  label: string;
  status: "green" | "yellow" | "red";
}) {
  if (!active) return null;
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${cfg.badge} border-current/30`}>
      {label}
    </span>
  );
}

export default function ReadinessCard({ data }: Props) {
  if (!data) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-5 py-4 flex items-center gap-3">
        <div className="w-2.5 h-2.5 rounded-full bg-zinc-600 flex-shrink-0" />
        <span className="text-sm text-zinc-500">Readiness unavailable — sync needed</span>
      </div>
    );
  }

  const cfg = STATUS_CONFIG[data.status];

  return (
    <div className={`${cfg.bg} border ${cfg.border} rounded-xl px-5 py-4`}>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5">

        {/* Status dot + label */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className={`w-3 h-3 rounded-full ${cfg.dot} shadow-[0_0_8px_2px] shadow-current flex-shrink-0`} />
          <div>
            <p className={`text-sm font-semibold ${cfg.text}`}>{data.label}</p>
            <p className="text-xs text-zinc-400 mt-0.5">{data.action}</p>
          </div>
        </div>

        {/* Divider */}
        <div className="hidden sm:block w-px h-10 bg-zinc-700 flex-shrink-0" />

        {/* Contributing flags */}
        <div className="flex flex-wrap gap-2 items-center">
          <Pill active={data.high_autonomic_volatility} label={`CV₇d ${data.cv_7d?.toFixed(1)}% > 10%`} status="red" />
          <Pill active={data.chronic_sleep_debt} label={`Sleep₇d ${data.sleep_7d_mean_hrs?.toFixed(1)}h < 7h`} status="red" />
          <Pill active={data.acute_sleep_deficit} label={`Sleep₁d ${data.sleep_1d_hrs?.toFixed(1)}h < 85% baseline`} status="yellow" />
          {!data.high_autonomic_volatility && !data.chronic_sleep_debt && !data.acute_sleep_deficit && (
            <span className="text-[10px] text-zinc-500">
              CV₇d {data.cv_7d?.toFixed(1)}% · Sleep₁d {data.sleep_1d_hrs?.toFixed(1)}h · Sleep₇d {data.sleep_7d_mean_hrs?.toFixed(1)}h
            </span>
          )}
        </div>

        {/* Readiness label — top right */}
        <div className="sm:ml-auto flex-shrink-0">
          <span className={`text-[10px] uppercase tracking-wider font-semibold ${cfg.text} opacity-60`}>
            Daily Readiness
          </span>
        </div>
      </div>
    </div>
  );
}
