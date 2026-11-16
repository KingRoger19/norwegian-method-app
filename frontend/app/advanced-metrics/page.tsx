"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import NavDrawer from "@/components/NavDrawer";
import {
  listActivities,
  getActivitiesCount,
  updateActivityLactate,
  bulkDeleteActivities,
  ACTIVITY_TAGS,
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
  const [edits, setEdits] = useState<Record<string, Partial<LactateFields> & { activity_tag?: string | null }>>({});
  const [rowStatus, setRowStatus] = useState<Record<string, RowStatus>>({});

  // Tag filter
  const [tagFilter, setTagFilter] = useState<string>("");

  // Select-to-delete mode
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const fetchPage = useCallback(async (p: number, tag?: string) => {
    setLoading(true);
    try {
      const activeTag = tag ?? tagFilter;
      const [items, { total: t }] = await Promise.all([
        listActivities(PAGE_SIZE, p * PAGE_SIZE, undefined, activeTag || undefined),
        getActivitiesCount(undefined, activeTag || undefined),
      ]);
      setActivities(items);
      setTotal(t);
      setEdits({});
      setRowStatus({});
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tagFilter]);

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
      await updateActivityLactate(id, rowEdits as Parameters<typeof updateActivityLactate>[1]);
      setActivities((prev) =>
        prev.map((a) => (a.activity_id === id ? { ...a, ...(rowEdits as Partial<Activity>) } : a))
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

  function handleTagFilter(tag: string) {
    setTagFilter(tag);
    setPage(0);
    fetchPage(0, tag);
  }

  function toggleSelectMode() {
    setSelectMode((v) => !v);
    setSelected(new Set());
    setConfirmDelete(false);
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === activities.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(activities.map((a) => a.activity_id)));
    }
  }

  async function handleDelete() {
    if (selected.size === 0) return;
    setDeleting(true);
    try {
      await bulkDeleteActivities([...selected]);
      setSelected(new Set());
      setConfirmDelete(false);
      setSelectMode(false);
      await fetchPage(page);
    } finally {
      setDeleting(false);
    }
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
            {!selectMode && (
              <>
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
              </>
            )}
            <button
              onClick={toggleSelectMode}
              className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                selectMode
                  ? "bg-zinc-700 border-zinc-600 text-zinc-100"
                  : "bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700"
              }`}
            >
              {selectMode ? "Cancel" : "Select to delete"}
            </button>
            {selectMode && selected.size > 0 && !confirmDelete && (
              <button
                onClick={() => setConfirmDelete(true)}
                className="px-3 py-1.5 rounded-lg bg-red-900/60 border border-red-800 text-xs font-medium text-red-300 hover:bg-red-900 transition-colors"
              >
                Delete {selected.size} selected
              </button>
            )}
            {selectMode && confirmDelete && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-400">Permanently delete {selected.size} activities?</span>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 text-xs font-semibold text-white transition-colors"
                >
                  {deleting ? "Deleting…" : "Confirm"}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-xs text-zinc-300 hover:bg-zinc-700 transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Tag filter */}
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => handleTagFilter("")}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
              tagFilter === ""
                ? "bg-zinc-100 text-zinc-900 border-zinc-200"
                : "bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700"
            }`}
          >
            All
          </button>
          {ACTIVITY_TAGS.map((tag) => (
            <button
              key={tag}
              onClick={() => handleTagFilter(tag)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                tagFilter === tag
                  ? "bg-blue-600 text-white border-blue-500"
                  : "bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700"
              }`}
            >
              {tag}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-zinc-900 border-b border-zinc-800">
                {selectMode && (
                  <th className="px-3 py-2.5 w-8">
                    <input
                      type="checkbox"
                      checked={activities.length > 0 && selected.size === activities.length}
                      onChange={toggleSelectAll}
                      className="accent-blue-500 cursor-pointer"
                    />
                  </th>
                )}
                <th className="text-left px-3 py-2.5 text-zinc-300 font-medium whitespace-nowrap">Date</th>
                <th className="text-left px-3 py-2.5 text-zinc-300 font-medium whitespace-nowrap">Tag</th>
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
                      onClick={selectMode ? () => toggleSelect(a.activity_id) : undefined}
                      className={`border-b border-zinc-800/60 transition-colors ${
                        selectMode
                          ? selected.has(a.activity_id)
                            ? "bg-red-950/30 cursor-pointer"
                            : "cursor-pointer hover:bg-zinc-900/50"
                          : dirty
                          ? "bg-blue-950/20"
                          : "hover:bg-zinc-900/50"
                      }`}
                    >
                      {selectMode && (
                        <td className="px-3 py-2 w-8" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selected.has(a.activity_id)}
                            onChange={() => toggleSelect(a.activity_id)}
                            className="accent-blue-500 cursor-pointer"
                          />
                        </td>
                      )}
                      {/* Fixed columns */}
                      <td className="px-3 py-2 whitespace-nowrap text-zinc-300 font-medium">
                        {a.date}
                      </td>
                      <td className="px-2 py-1.5">
                        {selectMode ? (
                          a.activity_tag ? (
                            <span className="text-xs text-zinc-300">{a.activity_tag}</span>
                          ) : (
                            <span className="text-zinc-600 text-xs">—</span>
                          )
                        ) : (
                          <select
                            value={
                              edits[a.activity_id] && "activity_tag" in edits[a.activity_id]
                                ? (edits[a.activity_id].activity_tag as string) ?? ""
                                : a.activity_tag ?? ""
                            }
                            onChange={(e) => {
                              const val = e.target.value || null;
                              setEdits((prev) => {
                                const rowEdits = { ...(prev[a.activity_id] ?? {}), activity_tag: val };
                                if (val === a.activity_tag) delete (rowEdits as Record<string, unknown>).activity_tag;
                                if (Object.keys(rowEdits).length === 0) {
                                  const next = { ...prev }; delete next[a.activity_id]; return next;
                                }
                                return { ...prev, [a.activity_id]: rowEdits };
                              });
                            }}
                            className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:border-blue-500 transition-colors"
                          >
                            <option value="">— no tag —</option>
                            {ACTIVITY_TAGS.map((t) => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                        )}
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

                      {/* Lactate input pairs — hidden in select mode */}
                      {!selectMode && [1, 2, 3, 4, 5].flatMap((n) => [
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

                      {/* Save button — hidden in select mode */}
                      {!selectMode && (
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
                      )}
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
