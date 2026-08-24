"use client";

import { useRef, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { DailyDistance } from "@/lib/api";

type Level = "month" | "week" | "day";

interface ChartEntry {
  key: string;
  label: string;
  km: number;
}

interface Props {
  data: DailyDistance[];
}

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAY_NAMES   = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

function getMonday(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  const day = out.getDay();
  out.setDate(out.getDate() - (day === 0 ? 6 : day - 1));
  return out;
}

function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function weekLabel(weekStart: string): string {
  const start = new Date(weekStart + "T00:00:00");
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const startStr = `${start.getDate()} ${MONTH_NAMES[start.getMonth()]}`;
  const endStr =
    start.getMonth() === end.getMonth()
      ? String(end.getDate())
      : `${end.getDate()} ${MONTH_NAMES[end.getMonth()]}`;
  return `${startStr}–${endStr}`;
}

export default function KmDrilldownChart({ data }: Props) {
  const [level, setLevel]             = useState<Level>("month");
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null); // "YYYY-MM"
  const [selectedWeek, setSelectedWeek]   = useState<string | null>(null); // "YYYY-MM-DD" Monday

  // Double-click detection
  const lastClick = useRef<{ key: string; time: number } | null>(null);

  // Build date→km lookup
  const kmByDate = new Map<string, number>();
  for (const { date, km } of data) {
    kmByDate.set(date, (kmByDate.get(date) ?? 0) + km);
  }

  // ── Compute chart entries per level ──────────────────────────────────────────

  function monthEntries(): ChartEntry[] {
    const map = new Map<string, number>();
    for (const [d, km] of kmByDate) {
      const key = d.slice(0, 7);
      map.set(key, (map.get(key) ?? 0) + km);
    }
    // Always show the last 12 months, filling in 0 for months with no data
    const now = new Date();
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      return {
        key,
        label: `${MONTH_NAMES[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`,
        km: Math.round((map.get(key) ?? 0) * 10) / 10,
      };
    });
  }

  function weekEntries(monthKey: string): ChartEntry[] {
    const map = new Map<string, number>();
    for (const [d, km] of kmByDate) {
      if (!d.startsWith(monthKey)) continue;
      const monday = getMonday(new Date(d + "T00:00:00"));
      const key = toYMD(monday);
      map.set(key, (map.get(key) ?? 0) + km);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, km]) => ({ key, label: weekLabel(key), km: Math.round(km * 10) / 10 }));
  }

  function dayEntries(weekStart: string): ChartEntry[] {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart + "T00:00:00");
      d.setDate(d.getDate() + i);
      const key = toYMD(d);
      return {
        key,
        label: `${DAY_NAMES[i]} ${d.getDate()}`,
        km: Math.round((kmByDate.get(key) ?? 0) * 10) / 10,
      };
    });
  }

  const chartData: ChartEntry[] =
    level === "month" ? monthEntries() :
    level === "week"  ? weekEntries(selectedMonth!) :
    dayEntries(selectedWeek!);

  // ── Drill-down on double-click ────────────────────────────────────────────────

  function handleBarClick(key: string) {
    if (level === "day") return;
    const now = Date.now();
    const prev = lastClick.current;
    if (prev?.key === key && now - prev.time < 400) {
      lastClick.current = null;
      if (level === "month") {
        setSelectedMonth(key);
        setLevel("week");
      } else {
        setSelectedWeek(key);
        setLevel("day");
      }
    } else {
      lastClick.current = { key, time: now };
    }
  }

  // ── Breadcrumb navigation ─────────────────────────────────────────────────────

  function Breadcrumb() {
    if (level === "month") return null;
    const [y, m] = selectedMonth!.split("-");
    const monthLabel = `${MONTH_NAMES[+m - 1]} ${y}`;

    return (
      <div className="flex items-center gap-1.5 text-xs mb-3">
        <button
          onClick={() => { setLevel("month"); setSelectedMonth(null); setSelectedWeek(null); }}
          className="text-blue-400 hover:text-blue-300 transition-colors"
        >
          Monthly
        </button>
        <span className="text-zinc-600">/</span>
        {level === "week" ? (
          <span className="text-zinc-300">{monthLabel}</span>
        ) : (
          <>
            <button
              onClick={() => { setLevel("week"); setSelectedWeek(null); }}
              className="text-blue-400 hover:text-blue-300 transition-colors"
            >
              {monthLabel}
            </button>
            <span className="text-zinc-600">/</span>
            <span className="text-zinc-300">{weekLabel(selectedWeek!)}</span>
          </>
        )}
      </div>
    );
  }

  const title =
    level === "month" ? "Total Distance — Monthly" :
    level === "week"  ? `Weekly Breakdown — ${MONTH_NAMES[+selectedMonth!.split("-")[1] - 1]} ${selectedMonth!.split("-")[0]}` :
    `Daily Breakdown — ${weekLabel(selectedWeek!)}`;

  const xInterval =
    level === "month" && chartData.length > 18 ? Math.ceil(chartData.length / 18) - 1 : 0;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
      <div className="flex items-start justify-between mb-1">
        <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">{title}</p>
        {level !== "day" && (
          <p className="text-xs text-zinc-600 italic">double-click to drill down</p>
        )}
      </div>

      <Breadcrumb />

      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: "#71717a", fontSize: 10 }}
            axisLine={{ stroke: "#27272a" }}
            tickLine={false}
            interval={xInterval}
          />
          <YAxis
            tick={{ fill: "#71717a", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            unit=" km"
            width={48}
            allowDecimals={false}
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
            formatter={(v) => [`${v ?? 0} km`, "Distance"]}
            cursor={{ fill: "#27272a" }}
          />
          <Bar dataKey="km" radius={[3, 3, 0, 0]}>
            {chartData.map((entry) => (
              <Cell
                key={entry.key}
                fill={entry.km > 0 ? "#3b82f6" : "#27272a"}
                style={{ cursor: level !== "day" ? "pointer" : "default" }}
                onClick={() => handleBarClick(entry.key)}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
