"use client";

import type { SleepStats } from "@/lib/api";

interface Props {
  data: SleepStats | null;
}

function sleepColor(hrs: number): string {
  if (hrs >= 7.5) return "#4ade80"; // green
  if (hrs >= 6.5) return "#facc15"; // yellow
  return "#f87171";                  // red
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-zinc-800 last:border-0">
      <span className="text-xs text-zinc-500">{label}</span>
      <span className="text-xs font-semibold text-zinc-200 tabular">{value}</span>
    </div>
  );
}

export default function SleepStatsBox({ data }: Props) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col h-full">
      <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-4">
        Sleep Duration
      </p>

      {!data || data.sleep_1d_hrs === null ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-zinc-600">No sleep data</p>
        </div>
      ) : (
        <div className="flex flex-col gap-5 flex-1">
          {/* Sleep_1d — acute */}
          <div className="flex flex-col items-center bg-zinc-800/50 rounded-xl py-4 px-3">
            <span className="text-[10px] text-zinc-500 mb-1">
              Sleep<sub>1d</sub> · last night
            </span>
            <span
              className="text-4xl font-bold tabular leading-none"
              style={{ color: sleepColor(data.sleep_1d_hrs) }}
            >
              {data.sleep_1d_hrs.toFixed(1)}
            </span>
            <span className="text-xs text-zinc-500 mt-1">hours</span>
            {data.date_1d && (
              <span className="text-[10px] text-zinc-600 mt-1">
                {data.date_1d.slice(5)}
              </span>
            )}
          </div>

          {/* Sleep_7d — chronic baseline */}
          <div className="flex flex-col items-center bg-zinc-800/50 rounded-xl py-4 px-3">
            <span className="text-[10px] text-zinc-500 mb-1">
              Sleep<sub>7d</sub> · 7-day mean
            </span>
            <span
              className="text-4xl font-bold tabular leading-none"
              style={{
                color: data.sleep_7d_mean_hrs !== null
                  ? sleepColor(data.sleep_7d_mean_hrs)
                  : "#71717a",
              }}
            >
              {data.sleep_7d_mean_hrs?.toFixed(1) ?? "—"}
            </span>
            <span className="text-xs text-zinc-500 mt-1">hours</span>
          </div>

          {/* Deep / REM breakdown */}
          {(data.deep_pct !== null || data.rem_pct !== null) && (
            <div className="mt-auto">
              <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1">
                Last night
              </p>
              {data.deep_pct !== null && (
                <Row label="Deep sleep" value={`${data.deep_pct}%`} />
              )}
              {data.rem_pct !== null && (
                <Row label="REM sleep" value={`${data.rem_pct}%`} />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
