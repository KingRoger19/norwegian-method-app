"use client";

import { useState, useEffect, useCallback } from "react";
import { triggerSync, getSyncStatus } from "@/lib/api";

type Toast = { type: "success" | "error"; message: string };

interface Props {
  onSyncComplete?: () => void;
}

export default function SyncButton({ onSyncComplete }: Props) {
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const pollUntilDone = useCallback(async () => {
    let attempts = 0;
    while (attempts < 120) {
      await new Promise((r) => setTimeout(r, 2000));
      attempts++;
      try {
        const status = await getSyncStatus();
        if (status.status !== "running") {
          setSyncing(false);
          if (status.status === "success" || status.status === "partial") {
            setToast({ type: "success", message: "Sync complete — data refreshed" });
            onSyncComplete?.();
          } else {
            setToast({ type: "error", message: `Sync ended with status: ${status.status}` });
          }
          return;
        }
      } catch {
        // network blip — keep polling
      }
    }
    setSyncing(false);
    setToast({ type: "error", message: "Sync timed out — check backend logs" });
  }, [onSyncComplete]);

  async function handleSync() {
    if (syncing) return;
    setSyncing(true);
    setToast(null);
    try {
      await triggerSync(1);
      pollUntilDone();
    } catch (err: unknown) {
      setSyncing(false);
      const msg = err instanceof Error ? err.message : "Failed to trigger sync";
      setToast({ type: "error", message: msg });
    }
  }

  return (
    <div className="relative">
      <button
        onClick={handleSync}
        disabled={syncing}
        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:cursor-not-allowed text-white font-semibold rounded-lg px-4 py-2 text-sm transition-colors"
      >
        {syncing ? (
          <>
            <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            <span className="hidden sm:inline">Connecting to Coros Hub…</span>
            <span className="sm:hidden">Syncing…</span>
          </>
        ) : (
          <>
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path
                fillRule="evenodd"
                d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H5.498a.75.75 0 00-.75.75v3.268a.75.75 0 001.5 0v-1.54l.308.31a7 7 0 0011.675-3.143.75.75 0 00-1.462-.326zm-2.62-4.848a5.5 5.5 0 00-9.2 2.466.75.75 0 001.461.327 4 4 0 016.687-1.79l.31.311H9.733a.75.75 0 000 1.5h3.269a.75.75 0 00.75-.75V5.072a.75.75 0 00-1.5 0v1.54l-.56-.536z"
                clipRule="evenodd"
              />
            </svg>
            Sync Training Data
          </>
        )}
      </button>

      {toast && (
        <div
          className={`absolute right-0 top-12 z-10 flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium shadow-lg whitespace-nowrap animate-in fade-in slide-in-from-top-2 ${
            toast.type === "success"
              ? "bg-green-950/90 border-green-800 text-green-300"
              : "bg-red-950/90 border-red-800 text-red-300"
          }`}
        >
          <span>{toast.type === "success" ? "✓" : "✕"}</span>
          {toast.message}
        </div>
      )}
    </div>
  );
}
