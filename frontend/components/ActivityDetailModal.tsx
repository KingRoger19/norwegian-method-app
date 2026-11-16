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
import {
  ActivityDetail,
  IntervalAnalysis,
  IntervalAnalysisWithText,
  INTERVAL_ANALYSIS_TAGS,
  getIntervalAnalysis,
  createIntervalAnalysis,
  analyzeFromDescription,
  type IntervalAnalysisRequest,
} from "@/lib/api";
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

const isIntervalTag = (tag: string | null) =>
  tag !== null && (INTERVAL_ANALYSIS_TAGS as readonly string[]).includes(tag);

const fmtSecs = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return sec === 0 ? `${m}m` : `${m}m ${sec}s`;
};

export default function ActivityDetailModal({ activity, onClose }: Props) {
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Interval analysis state
  const [analysis, setAnalysis] = useState<IntervalAnalysisWithText | null | undefined>(undefined); // undefined = loading
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ description: "", interval_type: "manual" as "manual" | "describe", reps: 10, warmup_value: 0, warmup_unit: "s" as UnitValue, cooldown_value: 0, cooldown_unit: "s" as UnitValue, effort_value: 60, effort_unit: "s" as UnitValue, recovery_value: 60, recovery_unit: "s" as UnitValue, effort_hr_threshold: "", natural_description: "" });
  const [submitting, setSubmitting] = useState(false);
  const [analysisFailed, setAnalysisFailed] = useState("");

  useEffect(() => {
    setChartData(buildChartData(activity));
  }, [activity]);

  useEffect(() => {
    if (!isIntervalTag(activity.activity_tag ?? null)) return;
    setAnalysis(undefined);
    getIntervalAnalysis(activity.activity_id)
      .then(setAnalysis)
      .catch(() => setAnalysis(null));
  }, [activity.activity_id, activity.activity_tag]);

  async function handleAnalysisSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setAnalysisFailed("");
    try {
      let result: IntervalAnalysisWithText;
      if (form.interval_type === "describe") {
        result = await analyzeFromDescription(activity.activity_id, {
          natural_description: form.natural_description,
          warmup_value: form.warmup_value,
          warmup_unit: form.warmup_unit,
          cooldown_value: form.cooldown_value,
          cooldown_unit: form.cooldown_unit,
        });
      } else {
        const req: IntervalAnalysisRequest = {
          description: form.description || undefined,
          interval_type: "manual",
          warmup_value: form.warmup_value,
          warmup_unit: form.warmup_unit,
          cooldown_value: form.cooldown_value,
          cooldown_unit: form.cooldown_unit,
          reps: form.reps,
          effort_value: form.effort_value,
          effort_unit: form.effort_unit,
          recovery_value: form.recovery_value,
          recovery_unit: form.recovery_unit,
        };
        result = await createIntervalAnalysis(activity.activity_id, req);
      }
      setAnalysis(result);
      setShowForm(false);
    } catch (err) {
      setAnalysisFailed(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setSubmitting(false);
    }
  }

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
            <p className="text-xs text-zinc-300">
              {activity.distance_km.toFixed(2)} km · {activity.duration_formatted}
              {avgHr !== null && ` · ${avgHr} bpm avg`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-300 hover:text-zinc-200 transition-colors ml-4 flex-shrink-0"
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
              <p className="text-xs text-zinc-300 mb-0.5">{s.label}</p>
              <p className="tabular font-semibold text-sm" style={{ color: s.color }}>
                {s.value}
              </p>
            </div>
          ))}
        </div>

        {/* Charts */}
        <div className="p-6 space-y-6">
          {chartData.length === 0 ? (
            <div className="space-y-4">
              {(() => {
                const avgPace =
                  activity.distance_km > 0
                    ? activity.duration_seconds / 60 / activity.distance_km
                    : null;
                const fmtAvgPace = avgPace
                  ? `${Math.floor(avgPace)}:${String(Math.round((avgPace % 1) * 60)).padStart(2, "0")} /km`
                  : null;
                const summaryStats = [
                  { label: "Avg Pace", value: fmtAvgPace },
                  { label: "Avg HR", value: activity.avg_hr ? `${activity.avg_hr} bpm` : null },
                  { label: "Max HR", value: activity.max_hr ? `${activity.max_hr} bpm` : null },
                  { label: "Avg Power", value: activity.avg_power ? `${activity.avg_power} W` : null },
                ].filter((s): s is { label: string; value: string } => s.value !== null);
                return summaryStats.length > 0 ? (
                  <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
                    {summaryStats.map((s) => (
                      <div key={s.label} className="bg-zinc-800/40 rounded-lg p-3 text-center">
                        <p className="text-xs text-zinc-400 mb-1">{s.label}</p>
                        <p className="text-sm font-semibold text-zinc-200">{s.value}</p>
                      </div>
                    ))}
                  </div>
                ) : null;
              })()}
              <div className="text-center py-6 border border-dashed border-zinc-800 rounded-lg">
                <p className="text-sm text-zinc-400 mb-1">No per-second data available</p>
                <p className="text-xs text-zinc-600">Upload a .fit file to enable HR, pace, and GPS charts</p>
              </div>
            </div>
          ) : (
            <>
              {/* HR chart */}
              <div>
                <p className="text-xs font-medium text-zinc-300 uppercase tracking-wider mb-3">
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
                  <p className="text-xs font-medium text-zinc-300 uppercase tracking-wider mb-3">
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
                  <p className="text-xs font-medium text-zinc-300 uppercase tracking-wider mb-3">
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
                <p className="text-xs font-medium text-zinc-300 uppercase tracking-wider mb-3">
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
                    <p className="text-xs text-zinc-300 mb-1">{s.label}</p>
                    <p className="tabular text-sm font-semibold text-zinc-200">{s.value}</p>
                  </div>
                ))}
            </div>
          )}

          {/* Interval Analysis — only for interval-type tags */}
          {isIntervalTag(activity.activity_tag ?? null) && (
            <div className="pt-4 border-t border-zinc-800">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-medium text-zinc-300 uppercase tracking-wider">
                  Heart Rate Recovery Analysis
                </p>
                {analysis !== undefined && (
                  <button
                    onClick={() => setShowForm((v) => !v)}
                    className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    {showForm ? "Cancel" : analysis ? "Re-analyze" : "Analyze intervals"}
                  </button>
                )}
              </div>

              {/* Loading state */}
              {analysis === undefined && (
                <p className="text-xs text-zinc-500">Loading…</p>
              )}

              {/* Form: shown when no analysis yet, or when user clicked Re-analyze */}
              {(analysis === null || showForm) && (
                <div className="bg-zinc-800/40 rounded-xl p-4 mb-3">
                  {analysis === null && (
                    <p className="text-xs text-zinc-400 mb-3">
                      Describe the workout structure so each interval can be segmented from the HR stream.
                    </p>
                  )}
                  <form onSubmit={handleAnalysisSubmit} className="space-y-3">
                    {/* Mode switcher */}
                    <div className="flex rounded-lg overflow-hidden border border-zinc-700 w-fit">
                      {(["manual", "describe"] as const).map((t) => (
                        <button key={t} type="button"
                          onClick={() => setForm((f) => ({ ...f, interval_type: t }))}
                          className={`px-4 py-1.5 text-xs font-medium transition-colors ${form.interval_type === t ? "bg-blue-600 text-white" : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"}`}>
                          {t === "manual" ? "Manual" : "✦ Describe"}
                        </button>
                      ))}
                    </div>

                    {/* Describe mode: free-text only */}
                    {form.interval_type === "describe" ? (
                      <>
                        <div>
                          <label className="block text-xs text-zinc-300 mb-1">Describe what you did</label>
                          <textarea
                            rows={3}
                            placeholder="e.g. 12 times 1km fast with 80 seconds rest, 10 minutes warmup and 5 minutes cooldown"
                            value={form.natural_description}
                            onChange={(e) => setForm((f) => ({ ...f, natural_description: e.target.value }))}
                            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-blue-500 resize-none"
                          />
                          <p className="text-[10px] text-zinc-500 mt-1">
                            Claude will parse your description, segment the HR stream, and provide a coaching commentary.
                          </p>
                        </div>
                        {/* Warmup + Cooldown for describe mode */}
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs text-zinc-300 mb-1">Warmup <span className="text-zinc-600">(override if not in description)</span></label>
                            <div className="flex gap-1">
                              <input type="number" min={0} step={1} value={form.warmup_value}
                                onChange={(e) => setForm((f) => ({ ...f, warmup_value: Number(e.target.value) }))}
                                className="flex-1 min-w-0 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-blue-500" />
                              <UnitToggle value={form.warmup_unit} onChange={(u) => setForm((f) => ({ ...f, warmup_unit: u }))} />
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs text-zinc-300 mb-1">Cooldown</label>
                            <div className="flex gap-1">
                              <input type="number" min={0} step={1} value={form.cooldown_value}
                                onChange={(e) => setForm((f) => ({ ...f, cooldown_value: Number(e.target.value) }))}
                                className="flex-1 min-w-0 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-blue-500" />
                              <UnitToggle value={form.cooldown_unit} onChange={(u) => setForm((f) => ({ ...f, cooldown_unit: u }))} />
                            </div>
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        {/* Description label for manual/auto */}
                        {form.interval_type === "manual" && (
                          <div>
                            <label className="block text-xs text-zinc-300 mb-1">Description (optional)</label>
                            <input
                              type="text"
                              placeholder="e.g. 10×1km + 80s"
                              value={form.description}
                              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-blue-500"
                            />
                          </div>
                        )}
                        {/* Warmup + Cooldown */}
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs text-zinc-300 mb-1">Warmup</label>
                            <div className="flex gap-1">
                              <input type="number" min={0} step={1} value={form.warmup_value}
                                onChange={(e) => setForm((f) => ({ ...f, warmup_value: Number(e.target.value) }))}
                                className="flex-1 min-w-0 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-blue-500" />
                              <UnitToggle value={form.warmup_unit} onChange={(u) => setForm((f) => ({ ...f, warmup_unit: u }))} />
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs text-zinc-300 mb-1">Cooldown</label>
                            <div className="flex gap-1">
                              <input type="number" min={0} step={1} value={form.cooldown_value}
                                onChange={(e) => setForm((f) => ({ ...f, cooldown_value: Number(e.target.value) }))}
                                className="flex-1 min-w-0 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-blue-500" />
                              <UnitToggle value={form.cooldown_unit} onChange={(u) => setForm((f) => ({ ...f, cooldown_unit: u }))} />
                            </div>
                          </div>
                        </div>
                        {/* Manual-mode fields */}
                        {form.interval_type === "manual" && (
                          <>
                            <div>
                              <label className="block text-xs text-zinc-300 mb-1">Reps</label>
                              <input type="number" min={1} max={50} value={form.reps}
                                onChange={(e) => setForm((f) => ({ ...f, reps: Number(e.target.value) }))}
                                className="w-28 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-blue-500" />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs text-zinc-300 mb-1">Effort</label>
                                <div className="flex gap-1">
                                  <input type="number" min={1} step={1} value={form.effort_value}
                                    onChange={(e) => setForm((f) => ({ ...f, effort_value: Number(e.target.value) }))}
                                    className="flex-1 min-w-0 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-blue-500" />
                                  <UnitToggle value={form.effort_unit} onChange={(u) => setForm((f) => ({ ...f, effort_unit: u }))} />
                                </div>
                              </div>
                              <div>
                                <label className="block text-xs text-zinc-300 mb-1">Recovery</label>
                                <div className="flex gap-1">
                                  <input type="number" min={1} step={1} value={form.recovery_value}
                                    onChange={(e) => setForm((f) => ({ ...f, recovery_value: Number(e.target.value) }))}
                                    className="flex-1 min-w-0 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-blue-500" />
                                  <UnitToggle value={form.recovery_unit} onChange={(u) => setForm((f) => ({ ...f, recovery_unit: u }))} />
                                </div>
                              </div>
                            </div>
                          </>
                        )}
                      </>
                    )}
                    {analysisFailed && (
                      <p className="text-xs text-red-400">{analysisFailed}</p>
                    )}
                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg px-4 py-2 transition-colors"
                    >
                      {submitting ? "Computing…" : analysis ? "Recompute HRR" : "Compute HRR"}
                    </button>
                  </form>
                </div>
              )}

              {/* Results table */}
              {analysis && !showForm && (
                <div>
                  <p className="text-xs text-zinc-400 mb-2 italic">
                    {analysis.description && <>{analysis.description} · </>}
                    {analysis.interval_type === "auto"
                      ? `${analysis.sets.length} intervals detected · threshold ${analysis.effort_hr_threshold} bpm`
                      : `${analysis.reps}×${fmtWithUnit(analysis.effort_value, analysis.effort_unit)} effort / ${fmtWithUnit(analysis.recovery_value, analysis.recovery_unit)} recovery`}
                    {analysis.warmup_value > 0 && ` · ${fmtWithUnit(analysis.warmup_value, analysis.warmup_unit)} warmup`}
                    {analysis.cooldown_value > 0 && ` · ${fmtWithUnit(analysis.cooldown_value, analysis.cooldown_unit)} cooldown`}
                    <span className="ml-2 uppercase tracking-wide text-zinc-600">{analysis.interval_type}</span>
                  </p>
                  {(() => {
                    const isAuto = analysis.interval_type === "auto";
                    const hrrCols = (
                      [
                        { key: "hrr30" as const, label: "HRR30", color: "text-emerald-400" },
                        { key: "hrr60" as const, label: "HRR60", color: "text-blue-400" },
                        { key: "hrr90" as const, label: "HRR90", color: "text-violet-400" },
                        { key: "hrr120" as const, label: "HRR120", color: "text-amber-400" },
                      ] as const
                    ).filter((col) => analysis.sets.some((s) => s[col.key] !== null));
                    const avg = (key: keyof typeof analysis.sets[0]) => {
                      const vals = analysis.sets.map((s) => s[key]).filter((v): v is number => v !== null);
                      return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
                    };
                    return (
                      <div className="overflow-x-auto rounded-lg border border-zinc-800">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-zinc-800/60 border-b border-zinc-700">
                              <th className="px-3 py-2 text-left text-zinc-300 font-medium">Set</th>
                              {isAuto && <th className="px-3 py-2 text-center text-zinc-400 font-medium">Effort</th>}
                              {isAuto && <th className="px-3 py-2 text-center text-zinc-400 font-medium">Recovery</th>}
                              <th className="px-3 py-2 text-center text-zinc-300 font-medium">Peak HR</th>
                              {hrrCols.map((c) => (
                                <th key={c.key} className={`px-3 py-2 text-center font-medium ${c.color}`}>{c.label}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {analysis.sets.map((s) => (
                              <tr key={s.set_number} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                                <td className="px-3 py-2 text-zinc-300 font-medium">#{s.set_number}</td>
                                {isAuto && (
                                  <td className="px-3 py-2 text-center tabular text-zinc-300 text-[11px]">
                                    {s.effort_duration_secs !== null ? fmtSecs(s.effort_duration_secs) : "—"}
                                  </td>
                                )}
                                {isAuto && (
                                  <td className="px-3 py-2 text-center tabular text-zinc-400 text-[11px]">
                                    {s.recovery_duration_secs !== null ? fmtSecs(s.recovery_duration_secs) : "—"}
                                  </td>
                                )}
                                <td className="px-3 py-2 text-center tabular text-zinc-200">
                                  {s.peak_hr !== null ? `${s.peak_hr} bpm` : "—"}
                                </td>
                                {hrrCols.map((c) => (
                                  <td key={c.key} className="px-3 py-2 text-center tabular">
                                    <HrrCell value={s[c.key]} />
                                  </td>
                                ))}
                              </tr>
                            ))}
                            {analysis.sets.length > 1 && (
                              <tr className="bg-zinc-800/40 border-t border-zinc-700">
                                <td className="px-3 py-2 text-zinc-400 font-medium text-xs italic">avg</td>
                                {isAuto && <td className="px-3 py-2 text-center tabular text-zinc-500 text-[11px]">{avg("effort_duration_secs") !== null ? fmtSecs(avg("effort_duration_secs")!) : "—"}</td>}
                                {isAuto && <td className="px-3 py-2 text-center tabular text-zinc-500 text-[11px]">{avg("recovery_duration_secs") !== null ? fmtSecs(avg("recovery_duration_secs")!) : "—"}</td>}
                                <td className="px-3 py-2 text-center tabular text-zinc-400">
                                  {avg("peak_hr") !== null ? `${avg("peak_hr")} bpm` : "—"}
                                </td>
                                {hrrCols.map((c) => (
                                  <td key={c.key} className="px-3 py-2 text-center tabular">
                                    <HrrCell value={avg(c.key)} muted />
                                  </td>
                                ))}
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    );
                  })()}
                  <p className="text-[10px] text-zinc-500 mt-2">
                    HRR = Peak HR − HR at T seconds after effort end. Higher = faster recovery.
                    {" "}Columns hidden when recovery is too short to measure them.
                  </p>
                  {analysis.analysis_text && (
                    <div className="mt-3 bg-zinc-800/40 border border-zinc-700 rounded-lg px-4 py-3">
                      <p className="text-[10px] font-medium text-blue-400 uppercase tracking-wider mb-1.5">AI Coach</p>
                      <p className="text-xs text-zinc-300 leading-relaxed">{analysis.analysis_text}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

type UnitValue = "s" | "min" | "m" | "km";

function UnitToggle({ value, onChange }: { value: UnitValue; onChange: (v: UnitValue) => void }) {
  const isTime = value === "s" || value === "min";
  const btn = (active: boolean) =>
    `px-2 py-1 text-[10px] font-medium transition-colors ${active ? "bg-blue-600 text-white" : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"}`;
  return (
    <div className="flex flex-col gap-px flex-shrink-0">
      {/* Top row: Time | Distance */}
      <div className="flex overflow-hidden rounded-t border border-zinc-700">
        <button type="button" onClick={() => onChange(isTime ? value : "s")} className={btn(isTime)}>Time</button>
        <button type="button" onClick={() => onChange(!isTime ? value : "m")} className={btn(!isTime)}>Dist</button>
      </div>
      {/* Bottom row: sub-unit */}
      <div className="flex overflow-hidden rounded-b border border-zinc-700">
        {isTime ? (
          <>
            <button type="button" onClick={() => onChange("s")} className={btn(value === "s")}>s</button>
            <button type="button" onClick={() => onChange("min")} className={btn(value === "min")}>min</button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => onChange("m")} className={btn(value === "m")}>m</button>
            <button type="button" onClick={() => onChange("km")} className={btn(value === "km")}>km</button>
          </>
        )}
      </div>
    </div>
  );
}

function fmtWithUnit(value: number | null, unit: UnitValue): string {
  if (value === null) return "—";
  if (unit === "min") return `${value} min`;
  if (unit === "km") return `${value} km`;
  return unit === "m" ? `${value}m` : fmtSecs(value);
}

function HrrCell({ value, muted = false }: { value: number | null; muted?: boolean }) {
  if (value === null) return <span className="text-zinc-600">—</span>;
  const color = muted
    ? "text-zinc-400"
    : value >= 25
    ? "text-emerald-400"
    : value >= 15
    ? "text-amber-400"
    : "text-red-400";
  return <span className={`font-semibold ${color}`}>−{value}</span>;
}
