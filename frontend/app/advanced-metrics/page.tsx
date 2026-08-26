"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import NavDrawer from "@/components/NavDrawer";
import {
  listActivities,
  getActivitiesCount,
  updateActivityLactate,
  type Activity,
  type LactateFields,
} from "@/lib/api";

const TOKEN_KEY = "nm_auth_token";
const PAGE_SIZE = 50;

type RowStatus = "idle" | "saving" | "saved" | "error";

const lf = (n: number, t: "mmol" | "notes") =>
  `lactate_${n}_${t}` as keyof LactateFields;

export default function AdvancedMetricsPage() {
  const router = useRouter();

  const [activities, setActivities] = useState<Activity[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [edits, setEdits] = useState<Record<string, Partial<LactateFields>>>({});
  const [rowStatus, setRowStatus] = useState<Record<string, RowStatus>>({});

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const fetchPage = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const [items, { total: t }] = await Promise.all([
        listActivities(PAGE_SIZE, p * PAGE_SIZE),
        getActivitiesCount(),
      ]);
      setActivities(items);
      setTotal(t);
      setEdits({});
      setRowStatus({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!localStorage.getItem(TOKEN_KEY)) {
      router.replace("/login");
      return;
    }
    fetchPage(page);
  }, [page, fetchPage, router]);

  function handleEdit(id: string, field: keyof LactateFields, raw: string) {
    setEdits((prev) => {
      const activity = activities.find((a) => a.activity_id === id)!;
      let parsed: number | string | null;
      if (field.endsWith("_mmol")) {
        parsed = raw === "" ? null : parseFloat(raw);
        if (typeof parsed === "number" && isNaN(parsed)) parsed = null;
      } else {
        parsed = raw === "" ? null : raw;
      }

      const rowEdits = { ...(prev[id] ?? {}), [field]: parsed };
      // Remove field from edits if it's back to the original value
      if (parsed === activity[field]) delete rowEdits[field];

      if (Object.keys(rowEdits).length === 0) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: rowEdits };
    });
  }

  function isDirty(id: string) {
    return !!(edits[id] && Object.keys(edits[id]).length > 0);
  }

  function cellVal(id: string, field: keyof LactateFields): string {
    const row = edits[id];
    if (row && field in row) {
      const v = row[field];
      return v === null ? "" : String(v);
    }
    const activity = activities.find((a) => a.activity_id === id)!;
    const v = activity[field];
    return v === null ? "" : String(v);
  }

  async function saveRow(id: string) {
    const rowEdits = edits[id];
    if (!rowEdits || Object.keys(rowEdits).length === 0) return;
    setRowStatus((p) => ({ ...p, [id]: "saving" }));
    try {
      await updateActivityLactate(id, rowEdits);
      setActivities((prev) =>
        prev.map((a) => (a.activity_id === id ? { ...a, ...rowEdits } : a))
      );
      setEdits((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setRowStatus((p) => ({ ...p, [id]: "saved" }));
      setTimeout(
        () =>
          setRowStatus((p) => {
            if (p[id] !== "saved") return p;
            const next = { ...p };
            delete next[id];
            return next;
          }),
        2000
      );
    } catch {
      setRowStatus((p) => ({ ...p, [id]: "error" }));
    }
  }

  function handleSignOut() {
    localStorage.removeItem(TOKEN_KEY);
    router.replace("/login");
  }

  const inputBase =
    "bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-blue-500 transition-colors";

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/50 sticky top-0 z-30 backdrop-blur-sm">
        <div className="max-w-full px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <NavDrawer />
            <span className="text-lg hidden sm:inline">🏔</span>
            <span className="font-semibold text-sm text-zinc-100 hidden sm:inline">
              Norwegian Method
            </span>
            <span className="text-zinc-700 hidden sm:inline">/</span>
            <span className="text-sm text-zinc-200 hidden sm:inline">Advanced Metrics</span>
          </div>
          <button
            onClick={handleSignOut}
            className="text-xs text-zinc-300 hover:text-zinc-100 transition-colors px-2 py-1"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="px-4 sm:px-6 py-6">
        {/* Page title + pagination controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <div>
            <h1 className="text-sm font-semibold text-zinc-100">Advanced Metrics</h1>
            <p className="text-xs text-zinc-300 mt-0.5">
              {loading ? "Loading…" : `${total} activities · showing ${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, total)}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0 || loading}
              className="px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-xs text-zinc-300 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              ← Prev
            </button>
            <span className="text-xs text-zinc-300 tabular-nums">
              {page + 1} / {totalPages || 1}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1 || loading}
              className="px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-xs text-zinc-300 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next →
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-zinc-900 border-b border-zinc-800">
                <th className="text-left px-3 py-2.5 text-zinc-300 font-medium whitespace-nowrap">Date</th>
                <th className="text-right px-3 py-2.5 text-zinc-300 font-medium whitespace-nowrap">Dist</th>
                <th className="text-right px-3 py-2.5 text-zinc-300 font-medium whitespace-nowrap">Duration</th>
                <th className="text-right px-3 py-2.5 text-zinc-300 font-medium whitespace-nowrap">Avg HR</th>
                {[1, 2, 3, 4, 5].flatMap((n) => [
                  <th key={`h-l${n}-m`} className="px-3 py-2.5 text-center whitespace-nowrap">
                    <span className="text-amber-400 font-semibold">L{n}</span>
                    <span className="text-zinc-400 ml-1">mmol/L</span>
                  </th>,
                  <th key={`h-l${n}-n`} className="px-3 py-2.5 text-left whitespace-nowrap">
                    <span className="text-zinc-300 font-medium">L{n} notes</span>
                  </th>,
                ])}
                <th className="px-3 py-2.5 text-zinc-300 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={15} className="text-center py-12 text-zinc-400">
                    <div className="inline-flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-zinc-700 border-t-blue-500 rounded-full animate-spin inline-block" />
                      Loading…
                    </div>
                  </td>
                </tr>
              ) : (
                activities.map((a) => {
                  const dirty = isDirty(a.activity_id);
                  const status = rowStatus[a.activity_id] ?? "idle";
                  return (
                    <tr
                      key={a.activity_id}
                      className={`border-b border-zinc-800/60 transition-colors ${
                        dirty ? "bg-blue-950/20" : "hover:bg-zinc-900/50"
                      }`}
                    >
                      {/* Fixed columns */}
                      <td className="px-3 py-2 whitespace-nowrap text-zinc-300 font-medium">
                        {a.date}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-zinc-200">
                        {a.distance_km} km
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-zinc-200">
                        {a.duration_formatted}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-zinc-200">
                        {a.avg_hr ? `${a.avg_hr} bpm` : "—"}
                      </td>

                      {/* Lactate input pairs */}
                      {[1, 2, 3, 4, 5].flatMap((n) => [
                        <td key={`l${n}-mmol`} className="px-2 py-1.5">
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            max="30"
                            placeholder="—"
                            value={cellVal(a.activity_id, lf(n, "mmol"))}
                            onChange={(e) =>
                              handleEdit(a.activity_id, lf(n, "mmol"), e.target.value)
                            }
                            className={`${inputBase} w-16 text-center`}
                          />
                        </td>,
                        <td key={`l${n}-notes`} className="px-2 py-1.5">
                          <input
                            type="text"
                            placeholder="notes…"
                            value={cellVal(a.activity_id, lf(n, "notes"))}
                            onChange={(e) =>
                              handleEdit(a.activity_id, lf(n, "notes"), e.target.value)
                            }
                            className={`${inputBase} w-44`}
                          />
                        </td>,
                      ])}

                      {/* Save button */}
                      <td className="px-2 py-1.5">
                        <button
                          disabled={!dirty || status === "saving"}
                          onClick={() => saveRow(a.activity_id)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                            status === "saved"
                              ? "bg-green-900/60 text-green-400 border border-green-800"
                              : status === "error"
                              ? "bg-red-900/60 text-red-400 border border-red-800"
                              : dirty
                              ? "bg-blue-600 hover:bg-blue-500 text-white"
                              : "bg-zinc-800 text-zinc-400 cursor-default border border-zinc-700"
                          }`}
                        >
                          {status === "saving" ? (
                            <span className="inline-flex items-center gap-1">
                              <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />
                            </span>
                          ) : status === "saved" ? (
                            "✓ Saved"
                          ) : status === "error" ? (
                            "Error"
                          ) : (
                            "Save"
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Bottom pagination */}
        {!loading && totalPages > 1 && (
          <div className="flex justify-center gap-2 mt-5">
            {Array.from({ length: totalPages }, (_, i) => (
              <button
                key={i}
                onClick={() => setPage(i)}
                className={`w-7 h-7 rounded text-xs font-medium transition-colors ${
                  i === page
                    ? "bg-blue-600 text-white"
                    : "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
