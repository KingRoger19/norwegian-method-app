"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import NavDrawer from "@/components/NavDrawer";

const TOKEN_KEY = "nm_auth_token";
const STORAGE_KEY = "nutrition_plan_md";

// ── Default meal plan ─────────────────────────────────────────────────────────

const DEFAULT_MD = `|Day|Pre-Run / Breakfast 1|Breakfast 2 / Post-Run|Mid-Morning Snack|Lunch (12:45–13:00)|Mid-Afternoon Snack|Dinner (Post-PM Run / Evening)|
|---|---|---|---|---|---|---|
|Monday (Fasted Run + Midday Gym)|Water + electrolytes only (Fasted Run at 06:15)|08:15 (At work/home): <ul><li>3 scrambled eggs</li><li>70g rolled oats cooked in water/skim milk</li><li>100g Greek yogurt (2% or 0%)</li><li>1 cup berries</li></ul>|Skipped (Due to late breakfast & 12:00 gym)|12:45 (Post-Gym):<ul><li>100g (dry) cooked basmati rice</li><li>150g grilled chicken breast</li><li>Steamed green beans or zucchini</li><li>1 tbsp extra virgin olive oil</li></ul>|16:00:<ul><li>1 apple or pear</li><li>20g raw almonds or walnuts</li></ul>|19:30:<ul><li>160g baked salmon fillet</li><li>250g boiled/baked potatoes</li><li>Large mixed green salad with olive oil</li></ul>|
|Tuesday (Double Threshold)|06:00 (Pre-Run):<ul><li>1 slice sourdough/white bread</li><li>15g light peanut butter</li><li>1 medium banana</li><li>350ml water + pinch of salt</li></ul>|08:30 (Post-Run 1):<ul><li>2 scrambled eggs + 1 egg white</li><li>80g rolled oats</li><li>100g Greek yogurt (0–2%)</li><li>1 tsp honey</li></ul>|11:00:<ul><li>1 fresh peach or apple</li></ul>|12:30:<ul><li>130g (dry) pasta or white rice</li><li>140g canned tuna in olive oil (or grilled chicken)</li><li>Cherry tomatoes & zucchini</li></ul>|16:30 (Pre-Run 2, ~90m prior):<ul><li>3 plain rice cakes with 1 tbsp jam or honey</li><li>1 banana</li></ul>|20:00 (Post-Run 2):<ul><li>150g lean beef fillet or 5% minced beef</li><li>350g roasted sweet potatoes</li><li>Steamed broccoli/spinach with olive oil</li></ul>|
|Wednesday (Fasted Run + Midday Gym)|Water + electrolytes only (Fasted Run at 06:15)|08:15 (At work/home):<ul><li>3 scrambled eggs</li><li>70g rolled oats</li><li>100g Greek yogurt</li><li>1 banana</li></ul>|Skipped (Due to late breakfast & 12:00 gym)|12:45 (Post-Gym):<ul><li>90g (dry) quinoa or farro</li><li>150g roasted turkey breast</li><li>Roasted carrots & cucumber salad</li><li>1 tbsp extra virgin olive oil</li></ul>|16:00:<ul><li>1 orange or apple</li><li>100g low-fat cottage cheese or 20g walnuts</li></ul>|19:30:<ul><li>180g white fish (cod/sea bass) or salmon</li><li>250g baked potatoes or 90g rice</li><li>Mixed vegetable stir-fry with olive oil</li></ul>|
|Thursday (Double Threshold)|06:00 (Pre-Run):<ul><li>1 slice sourdough bread</li><li>15g light peanut butter</li><li>1 medium banana</li><li>350ml water + electrolytes</li></ul>|08:30 (Post-Run 1):<ul><li>2 whole eggs + 1 egg white</li><li>80g rolled oats</li><li>100g Greek yogurt</li><li>1 tsp honey</li></ul>|11:00:<ul><li>1 fresh pear or kiwi</li></ul>|12:30:<ul><li>130g (dry) white Basmati rice</li><li>140g baked salmon fillet or turkey breast</li><li>Steamed carrots/zucchini</li></ul>|16:30 (Pre-Run 2, ~90m prior):<ul><li>1 low-fiber energy/fruit bar (~35g carbs)</li><li>1 banana</li></ul>|20:00 (Post-Run 2):<ul><li>150g grilled chicken breast or lean beef</li><li>120g (dry) pasta with light tomato sauce</li><li>Steamed green beans with 1 tbsp olive oil</li></ul>|
|Friday (Easy Day / PM Run)|N/A (Regular morning)|07:30 (Regular Breakfast)<ul><li>2 whole eggs + 1 slice whole-grain toast</li><li>60g oats with 100g Greek yogurt & berries</li></ul>|11:00:<ul><li>1 apple + black coffee</li></ul>|13:00:<ul><li>Large mixed salad box with 100g lentils or chickpeas, 130g grilled chicken, diced cucumbers, and olive oil</li></ul>|16:30 (Pre-PM Run):<ul><li>1 slice toast with jam or 1 banana</li></ul>|20:00 (Post-PM Run):<ul><li>160g grilled salmon or trout</li><li>200g roasted potatoes</li><li>Large portion of grilled vegetables</li></ul>|
|Saturday (Qualitative / Fast Run)|60–90 min Pre-Workout:<ul><li>2 slices white toast with jam & 1 sliced banana</li><li>300ml water + electrolytes</li></ul>|Post-Workout Recovery:<ul><li>30g whey protein or 3 scrambled eggs</li><li>80g oats or large bowl of muesli with 150g Greek yogurt</li></ul>|Mid-Day Window:<ul><li>1 piece of fresh fruit + 20g mixed nuts</li></ul>|Lunch (or Dinner if workout was PM):<ul><li>110g (dry) rice or pasta</li><li>140g chicken or lean beef</li><li>Steamed vegetables</li></ul>|Mid-Afternoon:<ul><li>2 rice cakes with honey or 1 small fruit bowl</li></ul>|Evening Meal:<ul><li>150g baked lean meat or fish</li><li>250g potatoes or 90g rice</li><li>Green salad with extra virgin olive oil</li></ul>|
|Sunday (Easy Day / Long Run Day)|90 min Pre-Long Run:<ul><li>2 slices white bread with honey/jam</li><li>1 banana</li><li>400ml water + Enervit electrolytes</li></ul>|Immediate Post-Run:<ul><li>30g Whey protein shake or 3 eggs</li><li>100g oats with honey, berries & 150g Greek yogurt</li></ul>|Adjusted around run timing|Main Meal 1 (Midday/Post-Run):<ul><li>140g (dry) pasta or rice</li><li>150g lean meat/poultry or salmon</li><li>Cooked vegetables with olive oil</li></ul>|Afternoon:<ul><li>Fresh fruit + 1 slice banana bread or 2 rice cakes</li></ul>|Main Meal 2 (Dinner):<ul><li>150g lean beef, salmon, or chicken</li><li>350g sweet potatoes or 100g rice</li><li>Large mixed salad with olive oil</li></ul>|`;

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

  // Separator rows contain only dashes, colons, and pipes
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

// ── Day badge colours ─────────────────────────────────────────────────────────

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
  const key = cell.toLowerCase().split(" ")[0].split("(")[0].trim();
  return DAY_COLOURS[key] ?? "bg-zinc-800 text-zinc-300 border-zinc-700";
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function NutritionPage() {
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
      } catch {
        // storage full — still show it in memory
      }
      setMd(text);
    };
    reader.readAsText(file);
    // Reset so the same file can be re-uploaded
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
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <NavDrawer />
            <span className="text-lg hidden sm:inline">🏔</span>
            <span className="font-semibold text-sm text-zinc-100 hidden sm:inline">Norwegian Method</span>
            <span className="text-zinc-700 hidden sm:inline">/</span>
            <span className="text-sm text-zinc-400">Nutrition</span>
          </div>
          <div className="flex items-center gap-2">
            {isCustom && (
              <button
                onClick={handleReset}
                className="text-xs text-zinc-500 hover:text-zinc-300 px-3 py-1.5 rounded-lg border border-zinc-700 hover:border-zinc-600 transition-colors"
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

      <main className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6">
        {loadError && (
          <div className="mb-4 bg-red-950/40 border border-red-800 text-red-300 text-sm rounded-xl px-4 py-3">
            {loadError}
          </div>
        )}

        {isCustom && (
          <div className="mb-4 flex items-center gap-2 text-xs text-amber-400 bg-amber-950/30 border border-amber-800/50 rounded-xl px-4 py-2.5">
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 flex-shrink-0">
              <path fillRule="evenodd" d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM0 8a8 8 0 1116 0A8 8 0 010 8zm8-2.25a.75.75 0 01.75.75v2.5a.75.75 0 01-1.5 0v-2.5A.75.75 0 018 5.75zm0 6a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd"/>
            </svg>
            Showing custom plan from uploaded file.
          </div>
        )}

        {table ? (
          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full border-collapse text-sm" style={{ minWidth: "1200px" }}>
              <thead>
                <tr className="bg-zinc-900 border-b border-zinc-800">
                  {table.headers.map((h, i) => (
                    <th
                      key={i}
                      className={`text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider px-4 py-3 whitespace-nowrap ${
                        i === 0 ? "w-44 sticky left-0 bg-zinc-900 z-10 border-r border-zinc-800" : ""
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, ri) => (
                  <tr
                    key={ri}
                    className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-900/40 transition-colors align-top"
                  >
                    {row.map((cell, ci) => (
                      <td
                        key={ci}
                        className={`px-4 py-3 text-zinc-300 leading-relaxed ${
                          ci === 0
                            ? "sticky left-0 z-10 border-r border-zinc-800 bg-zinc-950"
                            : ""
                        }`}
                      >
                        {ci === 0 ? (
                          <span
                            className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-lg border ${dayColour(cell)}`}
                            dangerouslySetInnerHTML={{ __html: cell }}
                          />
                        ) : (
                          <div
                            className="text-xs text-zinc-400 [&_ul]:mt-1 [&_ul]:space-y-0.5 [&_ul]:list-disc [&_ul]:pl-4 [&_li]:leading-snug"
                            dangerouslySetInnerHTML={{ __html: cell }}
                          />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-6 py-12 text-center text-sm text-zinc-500">
            No table found. Upload a markdown file containing a table.
          </div>
        )}
      </main>
    </div>
  );
}
