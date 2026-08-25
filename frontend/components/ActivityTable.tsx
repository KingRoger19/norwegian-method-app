"use client";

import { Activity } from "@/lib/api";
import { fmtShortDate } from "@/lib/utils";

interface Props {
  activities: Activity[];
  onSelect: (id: string) => void;
  page: number;
  totalPages: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}

export default function ActivityTable({
  activities,
  onSelect,
  page,
  totalPages,
  total,
  onPrev,
  onNext,
}: Props) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
            Recent Workouts
          </p>
          <p className="text-xs text-zinc-600 mt-0.5">
            Last 4 months · {total} activities · click for detail
          </p>
        </div>
        {totalPages > 1 && (
          <p className="text-xs text-zinc-600">
            Page {page + 1} of {totalPages}
          </p>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800">
              {["Date", "Activity", "Distance", "Duration", "Avg HR", "Z2%"].map(
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
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-600 text-sm">
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="px-5 py-3 border-t border-zinc-800 flex items-center justify-between">
          <button
            onClick={onPrev}
            disabled={page === 0}
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-100 disabled:text-zinc-700 disabled:cursor-not-allowed transition-colors"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
              <path fillRule="evenodd" d="M9.78 4.22a.75.75 0 010 1.06L7.06 8l2.72 2.72a.75.75 0 11-1.06 1.06L5.47 8.53a.75.75 0 010-1.06l3.25-3.25a.75.75 0 011.06 0z" clipRule="evenodd" />
            </svg>
            Previous
          </button>
          <button
            onClick={onNext}
            disabled={page >= totalPages - 1}
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-100 disabled:text-zinc-700 disabled:cursor-not-allowed transition-colors"
          >
            Next
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
              <path fillRule="evenodd" d="M6.22 4.22a.75.75 0 011.06 0l3.25 3.25a.75.75 0 010 1.06l-3.25 3.25a.75.75 0 01-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 010-1.06z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
