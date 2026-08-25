"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { ActivityDetail } from "@/lib/api";
import { fmtDuration, fmtShortDate, speedToPace, downsample } from "@/lib/utils";

const ActivityMap = dynamic(() => import("@/components/ActivityMap"), { ssr: false });

interface Props {
  activity: ActivityDetail;
  onClose: () => void;
}

interface ChartPoint {
  t: number; // seconds from start
  hr: number | null;
  pace: number | null; // min/km as decimal
  power: number | null;
}

function buildChartData(activity: ActivityDetail): ChartPoint[] {
  const sd = activity.stream_data;
  if (!sd || !sd.timestamps || sd.timestamps.length === 0) return [];

  const t0 = sd.timestamps[0];
  const points: ChartPoint[] = sd.timestamps.map((ts, i) => ({
    t: ts - t0,
    hr: sd.heart_rate?.[i] ?? null,
    pace: (() => {
      const spd = sd.speed?.[i];
      if (!spd || spd <= 0) return null;
      return 1000 / (spd * 60); // min/km
    })(),
    power: sd.power?.[i] ?? null,
  }));

  return downsample(points, 400);
}

function fmtPaceDecimal(val: number | null): string {
  if (val === null) return "—";
  const m = Math.floor(val);
  const s = Math.round((val - m) * 60);
  return `${m}:${String(s).padStart(2, "0")} /km`;
}

export default function ActivityDetailModal({ activity, onClose }: Props) {
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setChartData(buildChartData(activity));
  }, [activity]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const hasPace = chartData.some((d) => d.pace !== null);
  const hasPower = chartData.some((d) => d.power !== null);
  const avgHr = activity.avg_hr;

  const totalZone = activity.zone1_secs + activity.zone2_secs + activity.zone3_secs;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-zinc-800">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">🏃</span>
              <h2 className="text-base font-semibold text-zinc-100">
                Run · {fmtShortDate(activity.date)}
              </h2>
            </div>
            <p className="text-xs text-zinc-500">
              {activity.distance_km.toFixed(2)} km · {activity.duration_formatted}
              {avgHr !== null && ` · ${avgHr} bpm avg`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-200 transition-colors ml-4 flex-shrink-0"
            aria-label="Close"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-4 divide-x divide-zinc-800 border-b border-zinc-800">
          {[
            {
              label: "Zone 1",
              value: totalZone > 0 ? `${Math.round((activity.zone1_secs / totalZone) * 100)}%` : "—",
              color: "#60a5fa",
            },
            {
              label: "Zone 2 ⚡",
              value: totalZone > 0 ? `${Math.round((activity.zone2_secs / totalZone) * 100)}%` : "—",
              color: "#f59e0b",
            },
            {
              label: "Zone 3",
              value: totalZone > 0 ? `${Math.round((activity.zone3_secs / totalZone) * 100)}%` : "—",
              color: "#ef4444",
            },
            {
              label: "Elevation",
              value: activity.total_ascent ? `+${Math.round(activity.total_ascent)}m` : "—",
              color: "#a1a1aa",
            },
          ].map((s) => (
            <div key={s.label} className="px-4 py-3 text-center">
              <p className="text-xs text-zinc-500 mb-0.5">{s.label}</p>
              <p className="tabular font-semibold text-sm" style={{ color: s.color }}>
                {s.value}
              </p>
            </div>
          ))}
        </div>

        {/* Charts */}
        <div className="p-6 space-y-6">
          {chartData.length === 0 ? (
            <p className="text-sm text-zinc-600 text-center py-8">
              No time-series data for this activity
            </p>
          ) : (
            <>
              {/* HR chart */}
              <div>
                <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">
                  Cardiovascular Drift · Heart Rate
                </p>
                <ResponsiveContainer width="100%" height={180}>
                  <ComposedChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                    <XAxis
                      dataKey="t"
                      tick={{ fill: "#71717a", fontSize: 10 }}
                      tickFormatter={(v) => fmtDuration(v)}
                      axisLine={{ stroke: "#27272a" }}
                      tickLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fill: "#71717a", fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      unit=" bpm"
                      width={52}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#18181b",
                        border: "1px solid #3f3f46",
                        borderRadius: "8px",
                        fontSize: 11,
                      }}
                      labelFormatter={(v) => fmtDuration(Number(v))}
                      formatter={(v) => [`${v} bpm`, "HR"]}
                      cursor={{ stroke: "#3f3f46" }}
                    />
                    {avgHr && (
                      <ReferenceLine
                        y={avgHr}
                        stroke="#a1a1aa"
                        strokeDasharray="4 4"
                        strokeWidth={1}
                      />
                    )}
                    <Line
                      dataKey="hr"
                      stroke="#f87171"
                      strokeWidth={1.5}
                      dot={false}
                      name="HR"
                      connectNulls
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {/* Pace chart */}
              {hasPace && (
                <div>
                  <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">
                    Pace (min/km)
                  </p>
                  <ResponsiveContainer width="100%" height={160}>
                    <ComposedChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                      <XAxis
                        dataKey="t"
                        tick={{ fill: "#71717a", fontSize: 10 }}
                        tickFormatter={(v) => fmtDuration(v)}
                        axisLine={{ stroke: "#27272a" }}
                        tickLine={false}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        tick={{ fill: "#71717a", fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => fmtPaceDecimal(v)}
                        width={52}
                        reversed
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#18181b",
                          border: "1px solid #3f3f46",
                          borderRadius: "8px",
                          fontSize: 11,
                        }}
                        labelFormatter={(v) => fmtDuration(Number(v))}
                        formatter={(v) => [fmtPaceDecimal(v as number), "Pace"]}
                        cursor={{ stroke: "#3f3f46" }}
                      />
                      <Line
                        dataKey="pace"
                        stroke="#34d399"
                        strokeWidth={1.5}
                        dot={false}
                        name="Pace"
                        connectNulls
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Power chart (if available) */}
              {hasPower && (
                <div>
                  <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">
                    Running Power (W)
                  </p>
                  <ResponsiveContainer width="100%" height={140}>
                    <ComposedChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                      <XAxis
                        dataKey="t"
                        tick={{ fill: "#71717a", fontSize: 10 }}
                        tickFormatter={(v) => fmtDuration(v)}
                        axisLine={{ stroke: "#27272a" }}
                        tickLine={false}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        tick={{ fill: "#71717a", fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        unit="W"
                        width={48}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#18181b",
                          border: "1px solid #3f3f46",
                          borderRadius: "8px",
                          fontSize: 11,
                        }}
                        labelFormatter={(v) => fmtDuration(Number(v))}
                        formatter={(v) => [`${v}W`, "Power"]}
                        cursor={{ stroke: "#3f3f46" }}
                      />
                      <Line
                        dataKey="power"
                        stroke="#fb923c"
                        strokeWidth={1.5}
                        dot={false}
                        name="Power"
                        connectNulls
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
            </>
          )}

          {/* Route map */}
          {(() => {
            const coords = activity.stream_data?.lat_long?.filter(
              (p): p is [number, number] => Array.isArray(p) && p.length === 2
            ) ?? [];
            if (coords.length < 2) return null;
            return (
              <div>
                <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">
                  Route
                </p>
                <ActivityMap latLong={coords} />
              </div>
            );
          })()}

          {/* Biomechanics if available */}
          {(activity.avg_cadence || activity.ground_time || activity.stride_height) && (
            <div className="grid grid-cols-3 gap-3 pt-2 border-t border-zinc-800">
              {[
                { label: "Cadence", value: activity.avg_cadence ? `${Math.round(activity.avg_cadence)} spm` : null },
                { label: "Ground Time", value: activity.ground_time ? `${Math.round(activity.ground_time)} ms` : null },
                { label: "Vertical Osc.", value: activity.stride_height ? `${activity.stride_height.toFixed(1)} mm` : null },
              ]
                .filter((s) => s.value !== null)
                .map((s) => (
                  <div key={s.label} className="bg-zinc-800/40 rounded-lg p-3 text-center">
                    <p className="text-xs text-zinc-500 mb-1">{s.label}</p>
                    <p className="tabular text-sm font-semibold text-zinc-200">{s.value}</p>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
