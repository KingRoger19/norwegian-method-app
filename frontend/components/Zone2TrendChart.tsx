"use client";

import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import type { Zone2Week } from "@/lib/api";

function fmtWeek(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

interface Props {
  data: Zone2Week[];
}

export default function Zone2TrendChart({ data }: Props) {
  const targetMins = data[0]?.target_mins ?? 0;
  const hasTarget = targetMins > 0;

  const maxVal = Math.max(...data.map((d) => d.zone2_mins), targetMins, 10);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-medium text-zinc-300 uppercase tracking-wider">
          Weekly Zone 2 Volume
        </p>
        {hasTarget && (
          <div className="flex items-center gap-1.5">
            <svg width="20" height="8">
              <line
                x1="0" y1="4" x2="20" y2="4"
                stroke="#52525b" strokeWidth="1.5" strokeDasharray="4 3"
              />
            </svg>
            <span className="text-xs text-zinc-300">Target {targetMins} min</span>
          </div>
        )}
      </div>
      <p className="text-xs text-zinc-400 mb-4">
        Last 12 weeks · minutes in threshold zone · faded bar = current week in progress
      </p>

      <ResponsiveContainer width="100%" height={220}>
        <BarChart
          data={data}
          margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
          barCategoryGap="32%"
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
          <XAxis
            dataKey="week_start"
            tick={{ fill: "#71717a", fontSize: 10 }}
            tickFormatter={fmtWeek}
            axisLine={{ stroke: "#27272a" }}
            tickLine={false}
            interval={1}
          />
          <YAxis
            tick={{ fill: "#71717a", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            unit=" min"
            width={52}
            domain={[0, Math.ceil(maxVal * 1.15)]}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#18181b",
              border: "1px solid #3f3f46",
              borderRadius: "8px",
              fontSize: 11,
            }}
            labelStyle={{ color: "#ffffff" }}
            itemStyle={{ color: "#ffffff" }}
            cursor={{ fill: "#27272a" }}
            labelFormatter={(v) => `Week of ${fmtWeek(String(v))}`}
            formatter={(value, _name, props) => {
              const mins = Number(value ?? 0);
              const isCurrent: boolean = props.payload?.is_current ?? false;
              const suffix = isCurrent ? " (in progress)" : "";
              const vs =
                hasTarget && !isCurrent
                  ? mins >= targetMins
                    ? ` ✓ +${Math.round(mins - targetMins)} vs target`
                    : ` −${Math.round(targetMins - mins)} vs target`
                  : "";
              return [`${mins} min${suffix}${vs}`, "Zone 2"];
            }}
          />
          {hasTarget && (
            <ReferenceLine
              y={targetMins}
              stroke="#52525b"
              strokeDasharray="4 3"
              strokeWidth={1.5}
            />
          )}
          <Bar dataKey="zone2_mins" radius={[4, 4, 0, 0]} maxBarSize={44}>
            {data.map((entry) => (
              <Cell
                key={entry.week_start}
                fill="#f59e0b"
                fillOpacity={entry.is_current ? 0.35 : 1}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
