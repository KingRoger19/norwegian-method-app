"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import NavDrawer from "@/components/NavDrawer";

const TOKEN_KEY = "nm_auth_token";
const STORAGE_KEY = "training_plan_md";

// ── Default plan ──────────────────────────────────────────────────────────────

const DEFAULT_MD = `|Day|Week A (Quality Long Run Week)|Week B (Saturday Quality / Moderate Sunday)|
|---|---|---|
|Monday|Easy Run (15 km) + Strength (40 min)|Easy Run (15 km) + Strength (40 min)|
|Tuesday|Double Threshold Day (~30 km total)|Double Threshold Day (~30 km total)|
|Wednesday|Easy Run (17 km) + Strength (40 min)|Easy Run (17 km) + Strength (40 min)|
|Thursday|Double Threshold Day (~30 km total)|Double Threshold Day (~30 km total)|
|Friday|Easy Recovery Run (14–16 km)|Easy Recovery Run (14–16 km)|
|Saturday|Easy Aerobic Run (12–14 km) + Strides|Speed / VO2max Workout (18–20 km)|
|Sunday|Marathon Long Run (32–35 km)|Moderate Long Run (22–24 km)|
|**Total Vol.**|**~160 km**|**~155–160 km**|`;

// ── Parser ────────────────────────────────────────────────────────────────────

interface ParsedTable {
  headers: string[];
  rows: string[][];
}

function parseMarkdownTable(md: string): ParsedTable | null {
  const lines = md
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("|"));

  const isSeparator = (l: string) => /^\|[\s\-:|]+\|$/.test(l);
  const dataLines = lines.filter((l) => !isSeparator(l));

  if (dataLines.length < 2) return null;

  const splitRow = (line: string) =>
    line.split("|").slice(1, -1).map((c) => c.trim());

  const [headerLine, ...bodyLines] = dataLines;
  return {
    headers: splitRow(headerLine),
    rows: bodyLines.map(splitRow),
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Strip markdown bold (**text**) for rendering as plain text
function stripMd(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, "$1");
}

function isBoldRow(row: string[]): boolean {
  return row.some((c) => /^\*\*.+\*\*$/.test(c.trim()));
}

const DAY_COLOURS: Record<string, string> = {
  monday: "bg-blue-950/60 text-blue-300 border-blue-800",
  tuesday: "bg-amber-950/60 text-amber-300 border-amber-800",
  wednesday: "bg-blue-950/60 text-blue-300 border-blue-800",
  thursday: "bg-amber-950/60 text-amber-300 border-amber-800",
  friday: "bg-emerald-950/60 text-emerald-300 border-emerald-800",
  saturday: "bg-purple-950/60 text-purple-300 border-purple-800",
  sunday: "bg-emerald-950/60 text-emerald-300 border-emerald-800",
};

function dayColour(cell: string): string {
  const key = stripMd(cell).toLowerCase().split(" ")[0].split("(")[0].trim();
  return DAY_COLOURS[key] ?? "bg-zinc-800/60 text-zinc-300 border-zinc-700";
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TrainingPlanPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [md, setMd] = useState<string>("");
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!localStorage.getItem(TOKEN_KEY)) {
      router.replace("/login");
      return;
    }
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      setMd(stored ?? DEFAULT_MD);
    } catch {
      setMd(DEFAULT_MD);
    }
  }, [router]);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoadError("");
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const parsed = parseMarkdownTable(text);
      if (!parsed) {
        setLoadError("Could not find a markdown table in the uploaded file.");
        return;
      }
      try {
        localStorage.setItem(STORAGE_KEY, text);
      } catch {}
      setMd(text);
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  function handleReset() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
    setMd(DEFAULT_MD);
    setLoadError("");
  }

  const table = parseMarkdownTable(md);
  const isCustom = md !== DEFAULT_MD;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Top nav */}
      <header className="border-b border-zinc-800 bg-zinc-900/50 sticky top-0 z-30 backdrop-blur-sm">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <NavDrawer />
            <span className="text-lg hidden sm:inline">🏔</span>
            <span className="font-semibold text-sm text-zinc-100 hidden sm:inline">Norwegian Method</span>
            <span className="text-zinc-700 hidden sm:inline">/</span>
            <span className="text-sm text-zinc-200">Training Plan</span>
          </div>
          <div className="flex items-center gap-2">
            {isCustom && (
              <button
                onClick={handleReset}
                className="text-xs text-zinc-300 hover:text-zinc-100 px-3 py-1.5 rounded-lg border border-zinc-700 hover:border-zinc-600 transition-colors"
              >
                Reset to default
              </button>
            )}
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-2 text-xs px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-zinc-600 text-zinc-300 rounded-lg transition-colors"
            >
              <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                <path d="M7.25 10.25a.75.75 0 001.5 0V4.56l2.22 2.22a.75.75 0 101.06-1.06l-3.5-3.5a.75.75 0 00-1.06 0l-3.5 3.5a.75.75 0 001.06 1.06l2.22-2.22v5.69z" />
                <path d="M3.5 12.75a.75.75 0 000 1.5h9a.75.75 0 000-1.5h-9z" />
              </svg>
              Load .md file
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".md,text/markdown"
              className="hidden"
              onChange={handleFile}
            />
          </div>
        </div>
      </header>

      <main className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6">
        {loadError && (
          <div className="mb-4 bg-red-950/40 border border-red-800 text-red-300 text-sm rounded-xl px-4 py-3">
            {loadError}
          </div>
        )}

        {isCustom && (
          <div className="mb-4 flex items-center gap-2 text-xs text-amber-400 bg-amber-950/30 border border-amber-800/50 rounded-xl px-4 py-2.5">
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 flex-shrink-0">
              <path fillRule="evenodd" d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM0 8a8 8 0 1116 0A8 8 0 010 8zm8-2.25a.75.75 0 01.75.75v2.5a.75.75 0 01-1.5 0v-2.5A.75.75 0 018 5.75zm0 6a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
            </svg>
            Showing custom plan from uploaded file.
          </div>
        )}

        {table ? (
          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-zinc-900 border-b border-zinc-800">
                  {table.headers.map((h, i) => (
                    <th
                      key={i}
                      className={`text-left text-xs font-semibold text-zinc-200 uppercase tracking-wider px-5 py-3 ${
                        i === 0
                          ? "w-36 sticky left-0 bg-zinc-900 z-10 border-r border-zinc-800 whitespace-nowrap"
                          : "min-w-72"
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, ri) => {
                  const bold = isBoldRow(row);
                  return (
                    <tr
                      key={ri}
                      className={`border-b border-zinc-800/60 last:border-0 align-middle transition-colors ${
                        bold
                          ? "bg-zinc-800/40"
                          : "hover:bg-zinc-900/40"
                      }`}
                    >
                      {row.map((cell, ci) => {
                        const text = stripMd(cell);
                        return (
                          <td
                            key={ci}
                            className={`px-5 py-3 ${
                              ci === 0
                                ? "sticky left-0 z-10 border-r border-zinc-800 bg-zinc-950"
                                : ""
                            } ${bold ? "font-semibold text-zinc-200" : "text-zinc-300"}`}
                          >
                            {ci === 0 && !bold ? (
                              <span
                                className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-lg border ${dayColour(cell)}`}
                              >
                                {text}
                              </span>
                            ) : ci === 0 && bold ? (
                              <span className="text-xs font-bold text-zinc-200">{text}</span>
                            ) : (
                              <span className="text-sm">{text}</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-6 py-12 text-center text-sm text-zinc-300">
            No table found. Upload a markdown file containing a table.
          </div>
        )}
      </main>
    </div>
  );
}
