"use client";

import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { HrvRolling } from "@/lib/api";

interface Props {
  data: HrvRolling[];
}

interface ChartPoint {
  date: string;
  label: string;
  mu_7d: number;
  sigma_7d: number;
  cv_7d: number;
  band_lower: number;
  band_width: number;
}

function buildChartData(data: HrvRolling[]): ChartPoint[] {
  return data.map((d) => ({
    date: d.date,
    label: d.date.slice(5), // "MM-DD"
    mu_7d: d.mu_7d,
    sigma_7d: d.sigma_7d,
    cv_7d: d.cv_7d,
    band_lower: Math.max(0, d.mu_7d - d.sigma_7d),
    band_width: 2 * d.sigma_7d,
  }));
}

function StatBadge({
  label,
  value,
  unit,
  color,
  formula,
}: {
  label: string;
  value: string;
  unit: string;
  color: string;
  formula: string;
}) {
  return (
    <div className="flex flex-col items-center bg-zinc-800/50 rounded-lg px-4 py-2.5 min-w-[100px]">
      <span className="text-[10px] text-zinc-300 mb-0.5">{formula}</span>
      <span className="tabular font-semibold text-base" style={{ color }}>
        {value}
        <span className="text-xs font-normal ml-0.5 text-zinc-200">{unit}</span>
      </span>
      <span className="text-[10px] text-zinc-300 mt-0.5">{label}</span>
    </div>
  );
}

export default function HRVRollingChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex items-center justify-center h-[320px]">
        <p className="text-sm text-zinc-400">No HRV data available</p>
      </div>
    );
  }

  const chartData = buildChartData(data);
  const latest = data[data.length - 1];

  // X-axis: show every ~7th label to avoid crowding
  const interval = Math.max(0, Math.ceil(chartData.length / 10) - 1);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <p className="text-xs font-medium text-zinc-300 uppercase tracking-wider">
          7-Day Rolling HRV Metrics
        </p>
        <span className="text-[10px] text-zinc-400 italic">lnHRV · last 120 days</span>
      </div>

      {/* Current-value badges */}
      <div className="flex gap-3 mb-5 flex-wrap">
        <StatBadge
          formula="μ₇d"
          label="Rolling Mean"
          value={latest.mu_7d.toFixed(3)}
          unit="ln"
          color="#60a5fa"
        />
        <StatBadge
          formula="σ₇d"
          label="Rolling SD"
          value={latest.sigma_7d.toFixed(4)}
          unit="ln"
          color="#a78bfa"
        />
        <StatBadge
          formula="CV₇d"
          label="Coeff. of Variation"
          value={latest.cv_7d.toFixed(2)}
          unit="%"
          color={
            latest.cv_7d < 5
              ? "#4ade80"
              : latest.cv_7d < 10
              ? "#facc15"
              : "#f87171"
          }
        />
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={chartData} margin={{ top: 4, right: 40, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: "#71717a", fontSize: 10 }}
            axisLine={{ stroke: "#27272a" }}
            tickLine={false}
            interval={interval}
          />
          {/* Left axis: lnHRV */}
          <YAxis
            yAxisId="hrv"
            tick={{ fill: "#71717a", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={42}
            tickFormatter={(v) => v.toFixed(2)}
            domain={["auto", "auto"]}
          />
          {/* Right axis: CV% */}
          <YAxis
            yAxisId="cv"
            orientation="right"
            tick={{ fill: "#71717a", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={36}
            tickFormatter={(v) => `${v.toFixed(1)}%`}
            domain={[0, "auto"]}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#18181b",
              border: "1px solid #3f3f46",
              borderRadius: "8px",
              fontSize: 11,
              color: "#ffffff",
            }}
            labelStyle={{ color: "#ffffff" }}
            itemStyle={{ color: "#ffffff" }}
            labelFormatter={(v) => `Date: ${v}`}
            formatter={(value, name) => {
              const v = Number(value ?? 0);
              if (name === "μ₇d") return [`${v.toFixed(4)}`, "μ₇d (lnHRV mean)"];
              if (name === "CV%")  return [`${v.toFixed(2)}%`, "CV₇d"];
              if (name === "σ₇d") return [`${v.toFixed(4)}`, "σ₇d (lnHRV SD)"];
              return [`${v}`, String(name)];
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, color: "#71717a", paddingTop: 8 }}
          />

          {/* ±1σ band (stacked area trick) */}
          <Area
            yAxisId="hrv"
            dataKey="band_lower"
            stackId="band"
            fill="transparent"
            stroke="none"
            legendType="none"
            tooltipType="none"
            name=""
          />
          <Area
            yAxisId="hrv"
            dataKey="band_width"
            stackId="band"
            fill="rgba(96,165,250,0.12)"
            stroke="none"
            name="±1σ band"
            legendType="square"
          />

          {/* Rolling mean line */}
          <Line
            yAxisId="hrv"
            dataKey="mu_7d"
            stroke="#60a5fa"
            strokeWidth={2}
            dot={false}
            name="μ₇d"
            connectNulls
          />

          {/* CV% line */}
          <Line
            yAxisId="cv"
            dataKey="cv_7d"
            stroke="#facc15"
            strokeWidth={1.5}
            dot={false}
            name="CV%"
            strokeDasharray="4 3"
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Legend note */}
      <p className="text-[10px] text-zinc-400 mt-3 text-center">
        Blue band = μ ± σ · Yellow dashed = CV% (right axis) · Green &lt;5% · Yellow 5–10% · Red &gt;10%
      </p>
    </div>
  );
}
