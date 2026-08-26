"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { WeeklyZone } from "@/lib/api";
import { fmtWeekLabel } from "@/lib/utils";

const ZONE_COLORS = {
  zone1_mins: "#60a5fa", // blue-400
  zone2_mins: "#f59e0b", // amber-500
  zone3_mins: "#ef4444", // red-500
};

interface Props {
  data: WeeklyZone[];
}

export default function IntensityDistributionChart({ data }: Props) {
  const chartData = data.map((d) => ({
    ...d,
    label: fmtWeekLabel(d.week_start),
  }));

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
      <div className="mb-4">
        <p className="text-xs font-medium text-zinc-300 uppercase tracking-wider">
          Weekly Intensity Distribution
        </p>
        <p className="text-xs text-zinc-400 mt-0.5">Last 8 weeks · minutes per zone</p>
      </div>

      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={chartData} margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: "#71717a", fontSize: 11 }}
            axisLine={{ stroke: "#27272a" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "#71717a", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            unit=" m"
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
            formatter={(value, name) => [
              `${Number(value).toFixed(0)} min`,
              name === "zone1_mins"
                ? "Zone 1"
                : name === "zone2_mins"
                ? "Zone 2 ⚡"
                : "Zone 3",
            ]}
          />
          <Legend
            formatter={(value) =>
              value === "zone1_mins"
                ? "Zone 1 (Base)"
                : value === "zone2_mins"
                ? "Zone 2 (Threshold)"
                : "Zone 3 (VO₂max)"
            }
            wrapperStyle={{ fontSize: 11, color: "#71717a" }}
          />
          <Bar dataKey="zone1_mins" stackId="z" fill={ZONE_COLORS.zone1_mins} radius={[0, 0, 0, 0]} />
          <Bar dataKey="zone2_mins" stackId="z" fill={ZONE_COLORS.zone2_mins} radius={[0, 0, 0, 0]} />
          <Bar dataKey="zone3_mins" stackId="z" fill={ZONE_COLORS.zone3_mins} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
