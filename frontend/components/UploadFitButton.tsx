"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { uploadFitFiles, getFitImportStatus } from "@/lib/api";

type Toast = { type: "success" | "error"; message: string };

interface Props {
  onImportComplete?: () => void;
}

export default function UploadFitButton({ onImportComplete }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const pollUntilDone = useCallback(async () => {
    let attempts = 0;
    while (attempts < 180) {
      await new Promise((r) => setTimeout(r, 2000));
      attempts++;
      try {
        const s = await getFitImportStatus();
        if (s.status !== "running") {
          setImporting(false);
          if (s.status === "success" || s.status === "partial") {
            const parts: string[] = [];
            if (s.imported > 0) parts.push(`${s.imported} new`);
            if (s.updated > 0) parts.push(`${s.updated} updated`);
            const summary = parts.length ? parts.join(", ") : "no changes";
            setToast({ type: "success", message: `Import done — ${summary}` });
            onImportComplete?.();
          } else {
            setToast({ type: "error", message: `Import failed: ${s.errors[0] ?? s.status}` });
          }
          return;
        }
      } catch {
        // network blip — keep polling
      }
    }
    setImporting(false);
    setToast({ type: "error", message: "Import timed out — check backend logs" });
  }, [onImportComplete]);

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    // Reset so the same files can be re-selected later
    e.target.value = "";

    setImporting(true);
    setToast(null);
    try {
      await uploadFitFiles(files);
      pollUntilDone();
    } catch (err: unknown) {
      setImporting(false);
      const msg = err instanceof Error ? err.message : "Upload failed";
      setToast({ type: "error", message: msg });
    }
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="file"
        accept=".fit"
        multiple
        className="hidden"
        onChange={handleFiles}
      />
      <button
        onClick={() => !importing && inputRef.current?.click()}
        disabled={importing}
        className="flex items-center gap-2 bg-zinc-700 hover:bg-zinc-600 disabled:bg-zinc-800 disabled:cursor-not-allowed text-zinc-100 font-semibold rounded-lg px-4 py-2 text-sm transition-colors border border-zinc-600 disabled:border-zinc-700"
      >
        {importing ? (
          <>
            <span className="inline-block w-4 h-4 border-2 border-zinc-400/30 border-t-zinc-200 rounded-full animate-spin" />
            <span className="hidden sm:inline">Importing…</span>
          </>
        ) : (
          <>
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path
                fillRule="evenodd"
                d="M9.25 1a.75.75 0 011.5 0v7.69l2.47-2.47a.75.75 0 111.06 1.06l-3.75 3.75a.75.75 0 01-1.06 0L5.72 7.28a.75.75 0 011.06-1.06l2.47 2.47V1zM3.5 13.75A2.75 2.75 0 016.25 11h1a.75.75 0 010 1.5h-1A1.25 1.25 0 005 13.75v2.5A1.25 1.25 0 006.25 17.5h7.5A1.25 1.25 0 0015 16.25v-2.5A1.25 1.25 0 0013.75 12.5h-1a.75.75 0 010-1.5h1A2.75 2.75 0 0116.5 13.75v2.5A2.75 2.75 0 0113.75 19h-7.5A2.75 2.75 0 013.5 16.25v-2.5z"
                clipRule="evenodd"
              />
            </svg>
            <span className="hidden sm:inline">Upload .fit files</span>
            <span className="sm:hidden">.fit</span>
          </>
        )}
      </button>

      {toast && (
        <div
          className={`absolute right-0 top-12 z-10 flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium shadow-lg whitespace-nowrap ${
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
