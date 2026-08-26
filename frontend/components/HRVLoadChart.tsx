"use client";

import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { DailyMetric } from "@/lib/api";
import { fmtShortDate } from "@/lib/utils";

interface Props {
  data: DailyMetric[];
}

export default function HRVLoadChart({ data }: Props) {
  const chartData = data.map((d) => ({
    ...d,
    label: fmtShortDate(d.date),
  }));

  // Show every ~5th tick to avoid crowding
  const stride = Math.max(1, Math.floor(data.length / 6));
  const ticks = chartData
    .filter((_, i) => i % stride === 0 || i === chartData.length - 1)
    .map((d) => d.label);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
      <div className="mb-4">
        <p className="text-xs font-medium text-zinc-300 uppercase tracking-wider">
          Autonomic Recovery vs Stress
        </p>
        <p className="text-xs text-zinc-400 mt-0.5">
          HRV (ms) · dashed = rolling baseline · bars = daily training load
        </p>
      </div>

      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
          <XAxis
            dataKey="label"
            ticks={ticks}
            tick={{ fill: "#71717a", fontSize: 11 }}
            axisLine={{ stroke: "#27272a" }}
            tickLine={false}
          />
          {/* Left Y — HRV */}
          <YAxis
            yAxisId="hrv"
            tick={{ fill: "#a78bfa", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            unit=" ms"
            width={52}
          />
          {/* Right Y — Training load */}
          <YAxis
            yAxisId="load"
            orientation="right"
            tick={{ fill: "#fb923c", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={48}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#18181b",
              border: "1px solid #3f3f46",
              borderRadius: "8px",
              fontSize: 12,
            }}
            labelStyle={{ color: "#a1a1aa" }}
            cursor={{ fill: "#ffffff08" }}
          />
          <Legend wrapperStyle={{ fontSize: 11, color: "#71717a" }} />

          {/* Training load as subtle bars */}
          <Bar
            yAxisId="load"
            dataKey="training_load"
            fill="#fb923c"
            fillOpacity={0.35}
            name="Training Load"
            radius={[2, 2, 0, 0]}
          />

          {/* HRV baseline (dashed) */}
          <Line
            yAxisId="hrv"
            dataKey="hrv_baseline"
            stroke="#c4b5fd"
            strokeWidth={1.5}
            strokeDasharray="6 3"
            dot={false}
            name="HRV Baseline"
            connectNulls
          />

          {/* HRV today */}
          <Line
            yAxisId="hrv"
            dataKey="hrv_today"
            stroke="#a78bfa"
            strokeWidth={2}
            dot={false}
            name="HRV Today"
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
