"use client";

import { Activity } from "@/lib/api";
import { fmtShortDate } from "@/lib/utils";

interface Props {
  activities: Activity[];
  onSelect: (id: string) => void;
}

export default function ActivityTable({ activities, onSelect }: Props) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-zinc-800">
        <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
          Recent Workouts
        </p>
        <p className="text-xs text-zinc-600 mt-0.5">Last 10 activities · click for detail</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800">
              {["Date", "Activity", "Distance", "Duration", "Avg HR", "Z2%", "Double Day"].map(
                (h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider whitespace-nowrap"
                  >
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {activities.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-zinc-600 text-sm">
                  No activities found
                </td>
              </tr>
            )}
            {activities.map((a, i) => (
              <tr
                key={a.activity_id}
                onClick={() => onSelect(a.activity_id)}
                className={`cursor-pointer transition-colors hover:bg-zinc-800/60 ${
                  i !== activities.length - 1 ? "border-b border-zinc-800/60" : ""
                }`}
              >
                <td className="px-4 py-3 text-zinc-400 whitespace-nowrap tabular">
                  {fmtShortDate(a.date)}
                </td>
                <td className="px-4 py-3 text-zinc-200 whitespace-nowrap">
                  🏃 Run
                </td>
                <td className="px-4 py-3 text-zinc-200 whitespace-nowrap tabular">
                  {a.distance_km.toFixed(1)} km
                </td>
                <td className="px-4 py-3 text-zinc-200 whitespace-nowrap tabular">
                  {a.duration_formatted}
                </td>
                <td className="px-4 py-3 text-zinc-200 whitespace-nowrap tabular">
                  {a.avg_hr !== null ? `${a.avg_hr} bpm` : "—"}
                </td>
                <td className="px-4 py-3 whitespace-nowrap tabular">
                  {a.zone2_pct !== null ? (
                    <span
                      className={`font-medium ${
                        a.zone2_pct >= 50
                          ? "text-amber-400"
                          : a.zone2_pct >= 25
                          ? "text-blue-400"
                          : "text-zinc-400"
                      }`}
                    >
                      {a.zone2_pct.toFixed(0)}%
                    </span>
                  ) : (
                    <span className="text-zinc-600">—</span>
                  )}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {a.is_double_threshold ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-400 bg-amber-950/40 border border-amber-900/50 rounded-full px-2 py-0.5">
                      🔥 Yes
                    </span>
                  ) : (
                    <span className="text-zinc-600 text-xs">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
