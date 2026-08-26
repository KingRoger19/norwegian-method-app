"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import NavDrawer from "@/components/NavDrawer";
import {
  getWikiComments,
  createWikiComment,
  deleteWikiComment,
  type WikiComment,
} from "@/lib/api";

const TOKEN_KEY = "nm_auth_token";

// ── Wiki content ──────────────────────────────────────────────────────────────

interface MetricDef {
  name: string;
  formula?: string;
  description: string;
  thresholds?: { label: string; color: string; condition: string }[];
  note?: string;
}

interface Section {
  id: string;
  title: string;
  intro?: string;
  metrics: MetricDef[];
}

const SECTIONS: Section[] = [
  {
    id: "zones",
    title: "Norwegian Method Training Zones",
    intro:
      "The Norwegian Method uses three heart-rate zones derived from two lactate thresholds (LT1 and LT2). All zone calculations in this app use per-second HR data from .fit files against your current Athlete Profile thresholds.",
    metrics: [
      {
        name: "Zone 1 — Easy Aerobic Base",
        description:
          "Heart rate below LT1. This is conversational-pace work that builds aerobic infrastructure without generating significant lactate accumulation. The vast majority of Norwegian Method training volume lives here.",
        note: "LT1 ≈ LT2 × 0.88 by default, configurable in Athlete Profile.",
      },
      {
        name: "Zone 2 — Threshold Sweet Spot",
        description:
          "Heart rate between LT1 and LT2. This is the lactate threshold zone — the range where lactate production and clearance are nearly balanced. Norwegian Method practitioners target high weekly Z2 volume through double-threshold sessions.",
      },
      {
        name: "Zone 3 — VO₂max / High Intensity",
        description:
          "Heart rate above LT2 (lactate threshold 2). Short bursts at this intensity stress the aerobic ceiling but require longer recovery. Used sparingly in the Norwegian Method.",
      },
    ],
  },
  {
    id: "kpi",
    title: "KPI Cards",
    intro: "The three cards at the top of the dashboard summarise your current training week at a glance.",
    metrics: [
      {
        name: "Weekly Zone 2 Volume",
        description:
          "Total seconds spent in Zone 2 (LT1–LT2) since Monday of the current week, shown as a progress bar against your weekly target set in Athlete Profile. Feeds directly from the recalculated zone seconds in activity_summaries.",
        formula: "Σ zone2_secs for activities with date ≥ current Monday",
        thresholds: [
          { label: "On track", color: "green", condition: "volume ≥ target" },
          { label: "Below target", color: "amber", condition: "volume < target" },
        ],
      },
      {
        name: "HRV Status",
        description:
          "Compares today's HRV reading against your personal 30-day baseline. A large negative deviation signals accumulated fatigue or poor recovery.",
        formula: "delta = HRV_today − HRV_baseline",
        thresholds: [
          { label: "Green", color: "green", condition: "delta ≥ −2" },
          { label: "Yellow", color: "amber", condition: "−7 ≤ delta < −2" },
          { label: "Red", color: "red", condition: "delta < −7" },
        ],
        note: "HRV values come from the Coros sleep HRV measurement synced nightly.",
      },
      {
        name: "ACWR — Acute:Chronic Workload Ratio",
        description:
          "The ratio of your recent training load (acute, ~7 days) to your longer-term load (chronic, ~28 days). Quantifies whether you are doing significantly more or less than your body is adapted to.",
        formula: "ACWR = training_load_ratio from Coros daily metrics",
        thresholds: [
          { label: "Sweet spot", color: "green", condition: "0.8 – 1.3 (low injury risk)" },
          { label: "Under-training", color: "amber", condition: "< 0.8" },
          { label: "Spike risk", color: "red", condition: "> 1.5 (high injury risk)" },
        ],
        note: "Sourced directly from the Coros training load ratio; not recomputed here.",
      },
    ],
  },
  {
    id: "readiness",
    title: "Daily Readiness",
    intro:
      "A composite flag that combines autonomic (HRV) and sleep signals to recommend how to approach the day's training session. Computed fresh on every dashboard load.",
    metrics: [
      {
        name: "Green — Full Recovery",
        description:
          "HRV coefficient of variation is low (stable autonomic system) AND chronic sleep is adequate. Execute the planned double-threshold session in full.",
        thresholds: [
          { label: "CV₇d", color: "green", condition: "≤ 10%" },
          { label: "Sleep₇d", color: "green", condition: "≥ 7.0 h" },
        ],
      },
      {
        name: "Yellow — Acute Sleep Deficit",
        description:
          "Last night's sleep was significantly shorter than your recent average, suggesting you are carrying an acute deficit even if your chronic average is acceptable. Proceed at LT1 intensity and monitor for HR lag (HR higher than expected at a given pace).",
        formula: "Sleep₁d < Sleep₇d × 0.85",
      },
      {
        name: "Red — High Volatility + Chronic Debt",
        description:
          "Both HRV autonomic volatility is elevated AND you have a chronic sleep deficit. The body is in a stressed state. Cap LT2 volume and prioritise recovery — easy aerobic work only.",
        thresholds: [
          { label: "CV₇d", color: "red", condition: "> 10%" },
          { label: "Sleep₇d", color: "red", condition: "< 7.0 h" },
        ],
        note: "Both conditions must be true simultaneously to trigger red. Yellow only requires the sleep deficit.",
      },
    ],
  },
  {
    id: "hrv-rolling",
    title: "7-Day Rolling HRV Metrics",
    intro:
      "Computed over the last 7 available HRV data points (gaps from rest days are skipped — this is not calendar-day averaging). Uses the natural logarithm of HRV to normalise the distribution.",
    metrics: [
      {
        name: "μ₇d — 7-day Rolling Mean of ln(HRV)",
        formula: "μ₇d = (1/7) × Σ ln(HRV_i) for the last 7 points",
        description:
          "The central tendency of your HRV in log space. A rising μ₇d indicates improving autonomic recovery; a falling trend signals accumulated fatigue. Shown with a ±1σ confidence band on the chart.",
      },
      {
        name: "σ₇d — 7-day Sample Standard Deviation of ln(HRV)",
        formula: "σ₇d = √[ Σ(ln(HRV_i) − μ₇d)² / 6 ]   (sample SD, divided by n−1=6)",
        description:
          "How much day-to-day variation exists in your HRV. A low σ means consistent readings; a high σ means volatile readings (possibly illness, travel, or lifestyle stress). The ±1σ band on the chart is μ ± σ.",
      },
      {
        name: "CV₇d — Coefficient of Variation",
        formula: "CV₇d = (σ₇d / μ₇d) × 100 %",
        description:
          "Normalised volatility: σ expressed as a percentage of the mean. This is the key autonomic stability metric used by the Readiness system. A CV above 10% signals unstable HRV and triggers the red readiness flag (when combined with sleep debt).",
        thresholds: [
          { label: "Stable", color: "green", condition: "CV₇d ≤ 10%" },
          { label: "Volatile", color: "red", condition: "CV₇d > 10%" },
        ],
      },
    ],
  },
  {
    id: "sleep",
    title: "Sleep Metrics",
    intro:
      "Sleep data is synced from your Coros device. Note: Coros does not expose a quality score via its API, so only duration and stage breakdown are available.",
    metrics: [
      {
        name: "Sleep₁d — Last Night Duration",
        description: "Total sleep duration for the most recently synced night, in hours.",
        formula: "total_duration_mins / 60",
      },
      {
        name: "Sleep₇d — 7-Day Rolling Mean",
        description:
          "Average nightly sleep duration over the last 7 recorded nights. Used as the chronic baseline for acute deficit detection.",
        formula: "mean(total_duration_mins for last 7 nights) / 60",
      },
      {
        name: "Deep % — Deep Sleep Percentage",
        description:
          "Slow-wave (deep) sleep as a percentage of last night's total. Deep sleep is critical for physical recovery and growth hormone release. Typical healthy range is 15–25%.",
        formula: "deep_mins / total_duration_mins × 100",
      },
      {
        name: "REM % — REM Sleep Percentage",
        description:
          "REM sleep as a percentage of last night's total. REM supports cognitive recovery, memory consolidation, and emotional regulation. Typical healthy range is 20–25%.",
        formula: "rem_mins / total_duration_mins × 100",
      },
    ],
  },
  {
    id: "zone2trend",
    title: "Weekly Zone 2 Volume Trend",
    intro:
      "A 12-week historical view of Zone 2 minutes per week. Missing weeks (no activities recorded) appear as zero-height bars rather than gaps, so the trend is always continuous.",
    metrics: [
      {
        name: "Zone 2 Minutes / Week",
        description:
          "Sum of zone2_secs across all activities in a calendar week (Monday–Sunday), divided by 60. The dashed reference line shows your weekly target from Athlete Profile.",
        formula: "Σ zone2_secs / 60 per ISO week",
        note:
          "The current (in-progress) week bar is faded to signal it is not yet complete. The tooltip shows ±Δ vs target for completed weeks.",
      },
    ],
  },
  {
    id: "activity",
    title: "Per-Activity Metrics",
    intro:
      "Shown in the Activity Table on the dashboard and in the detail modal when you click an activity.",
    metrics: [
      {
        name: "Z2 % — Zone 2 Percentage",
        description:
          "Fraction of recorded zone time spent in Zone 2. If zone seconds are all zero (e.g. no .fit data), falls back to zone2_secs / duration_seconds.",
        formula:
          "if (Z1+Z2+Z3 > 0): Z2 / (Z1+Z2+Z3) × 100  else: Z2 / duration × 100",
        note:
          "Zone seconds are computed from per-second HR data during .fit import and stored in activity_summaries. Use Recalculate Metrics after updating LT1/LT2 thresholds.",
      },
      {
        name: "HR% of Max",
        description:
          "Average heart rate expressed as a percentage of your maximum HR (from Athlete Profile). A proxy for relative cardiovascular effort.",
        formula: "avg_hr / max_hr × 100",
        note: "Recalculated automatically whenever Recalculate Metrics runs.",
      },
      {
        name: "Avg Cadence",
        description:
          "Average running cadence in steps per minute for the activity. Higher cadence (170–185 spm) is generally associated with better running economy and lower injury risk.",
      },
      {
        name: "Ground Time",
        description:
          "Average ground contact time in milliseconds — the time each foot spends on the ground per stride. Lower ground time indicates faster, more elastic running mechanics. Elite runners are typically < 200 ms.",
      },
      {
        name: "Stride Height",
        description:
          "Vertical oscillation of the centre of mass per stride, in centimetres. Lower stride height means less wasted vertical movement and more efficient horizontal propulsion.",
      },
      {
        name: "Stride Ratio",
        description:
          "Ratio of stride height to stride length — a combined measure of running economy. A lower ratio means more forward propulsion per unit of vertical bounce.",
        formula: "stride_height / (avg_stride_length × 100)",
      },
    ],
  },
  {
    id: "lactate",
    title: "Lactate Measurements",
    intro:
      "Manually entered in the Advanced Metrics table. Up to 5 blood lactate samples per activity can be recorded.",
    metrics: [
      {
        name: "Lactate (mmol/L)",
        description:
          "Blood lactate concentration in millimoles per litre, measured at a specific point during or after a session (e.g. after a threshold rep). Typical values: < 2 mmol/L at Z1, 2–4 mmol/L at LT1, ~4 mmol/L at LT2, > 6 mmol/L at Z3.",
        thresholds: [
          { label: "LT1 (aerobic threshold)", color: "green", condition: "~2 mmol/L" },
          { label: "LT2 (lactate threshold)", color: "amber", condition: "~4 mmol/L" },
          { label: "Above threshold", color: "red", condition: "> 4 mmol/L" },
        ],
        note:
          "Notes field is free-text (e.g. 'after rep 3', '5 min post-session'). Lactate data is stored in activity_summaries and never overwritten by syncs.",
      },
    ],
  },
];

// ── Comments ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function CommentThread({
  comment,
  onDelete,
  onReply,
}: {
  comment: WikiComment;
  onDelete: (id: number) => void;
  onReply: (parentId: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="bg-zinc-800/60 border border-zinc-700 rounded-xl px-4 py-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold text-zinc-300">{comment.author}</span>
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-400">{timeAgo(comment.created_at)}</span>
            {comment.replies.length === 0 && (
              <button
                onClick={() => onReply(comment.id)}
                className="text-xs text-blue-500 hover:text-blue-400 transition-colors"
              >
                Reply
              </button>
            )}
            {comment.replies.length > 0 && (
              <span className="text-xs text-zinc-400">{comment.replies.length} repl{comment.replies.length === 1 ? "y" : "ies"}</span>
            )}
            <button
              onClick={() => onDelete(comment.id)}
              className="text-xs text-zinc-400 hover:text-red-400 transition-colors"
            >
              Delete
            </button>
          </div>
        </div>
        <p className="text-sm text-zinc-200 whitespace-pre-wrap">{comment.body}</p>
      </div>
      {comment.replies.length > 0 && (
        <div className="ml-6 space-y-2 border-l-2 border-zinc-800 pl-4">
          {comment.replies.map((r) => (
            <div key={r.id} className="bg-zinc-800/40 border border-zinc-700/60 rounded-xl px-4 py-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-zinc-300">{r.author}</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-zinc-400">{timeAgo(r.created_at)}</span>
                  <button
                    onClick={() => onDelete(r.id)}
                    className="text-xs text-zinc-400 hover:text-red-400 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
              <p className="text-sm text-zinc-200 whitespace-pre-wrap">{r.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CommentForm({
  parentId,
  onSubmit,
  onCancel,
  placeholder,
}: {
  parentId?: number;
  onSubmit: (author: string, body: string, parentId?: number) => Promise<void>;
  onCancel?: () => void;
  placeholder?: string;
}) {
  const [author, setAuthor] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!author.trim() || !body.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit(author.trim(), body.trim(), parentId);
      setAuthor("");
      setBody("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <input
        type="text"
        value={author}
        onChange={(e) => setAuthor(e.target.value)}
        placeholder="Your name"
        maxLength={50}
        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={placeholder ?? "Write a comment…"}
        rows={3}
        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-500 resize-none"
      />
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={submitting || !author.trim() || !body.trim()}
          className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-medium rounded-lg transition-colors"
        >
          {submitting ? "Posting…" : "Post"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-zinc-200 hover:text-zinc-200 text-xs transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function WikiPage() {
  const router = useRouter();
  const [comments, setComments] = useState<WikiComment[]>([]);
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const commentsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!localStorage.getItem(TOKEN_KEY)) {
      router.replace("/login");
      return;
    }
    loadComments();
  }, [router]);

  async function loadComments() {
    try {
      setComments(await getWikiComments());
    } catch {
      // silently ignore — comments are non-critical
    }
  }

  async function handlePost(author: string, body: string, parentId?: number) {
    await createWikiComment({ author, body, parent_id: parentId });
    setReplyingTo(null);
    await loadComments();
  }

  async function handleDelete(id: number) {
    await deleteWikiComment(id);
    await loadComments();
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Top nav */}
      <header className="border-b border-zinc-800 bg-zinc-900/50 sticky top-0 z-30 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
          <NavDrawer />
          <span className="text-lg hidden sm:inline">🏔</span>
          <span className="font-semibold text-sm text-zinc-100 hidden sm:inline">Norwegian Method</span>
          <span className="text-zinc-700 hidden sm:inline">/</span>
          <span className="text-sm text-zinc-200">Metrics Wiki</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-12">
        {/* Hero */}
        <div>
          <h1 className="text-2xl font-bold text-zinc-100 mb-2">Metrics Wiki</h1>
          <p className="text-sm text-zinc-200 max-w-2xl">
            Reference documentation for every indicator computed in this app. Use the section links to jump directly to a metric group.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="text-xs px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-full transition-colors"
              >
                {s.title}
              </a>
            ))}
            <a
              href="#comments"
              className="text-xs px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-full transition-colors"
            >
              Comments
            </a>
          </div>
        </div>

        {/* Sections */}
        {SECTIONS.map((section) => (
          <section key={section.id} id={section.id} className="scroll-mt-20">
            <h2 className="text-base font-semibold text-zinc-100 mb-1">{section.title}</h2>
            {section.intro && (
              <p className="text-sm text-zinc-200 mb-5 leading-relaxed">{section.intro}</p>
            )}
            <div className="space-y-4">
              {section.metrics.map((m) => (
                <div
                  key={m.name}
                  className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3"
                >
                  <h3 className="text-sm font-semibold text-zinc-100">{m.name}</h3>
                  {m.formula && (
                    <div className="font-mono text-xs text-emerald-400 bg-zinc-800 rounded-lg px-3 py-2">
                      {m.formula}
                    </div>
                  )}
                  <p className="text-sm text-zinc-200 leading-relaxed">{m.description}</p>
                  {m.thresholds && m.thresholds.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {m.thresholds.map((t) => (
                        <div
                          key={t.label}
                          className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border ${
                            t.color === "green"
                              ? "border-emerald-800 bg-emerald-950/40 text-emerald-300"
                              : t.color === "amber"
                              ? "border-amber-800 bg-amber-950/40 text-amber-300"
                              : "border-red-800 bg-red-950/40 text-red-300"
                          }`}
                        >
                          <span className="font-medium">{t.label}:</span>
                          <span className="font-mono">{t.condition}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {m.note && (
                    <p className="text-xs text-zinc-300 italic">{m.note}</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}

        {/* Comments */}
        <section id="comments" className="scroll-mt-20 pb-12" ref={commentsRef}>
          <h2 className="text-base font-semibold text-zinc-100 mb-1">Comments</h2>
          <p className="text-sm text-zinc-300 mb-6">
            Notes, questions, or observations about the metrics. Replies are one level deep.
          </p>

          {/* New top-level comment */}
          <div className="mb-8">
            <p className="text-xs text-zinc-300 uppercase tracking-wider mb-3">New comment</p>
            <CommentForm onSubmit={handlePost} />
          </div>

          {/* Thread list */}
          {comments.length === 0 ? (
            <p className="text-sm text-zinc-400">No comments yet.</p>
          ) : (
            <div className="space-y-4">
              {comments.map((c) => (
                <div key={c.id}>
                  <CommentThread
                    comment={c}
                    onDelete={handleDelete}
                    onReply={(id) => setReplyingTo(replyingTo === id ? null : id)}
                  />
                  {replyingTo === c.id && (
                    <div className="mt-2 ml-6 pl-4 border-l-2 border-zinc-800">
                      <CommentForm
                        parentId={c.id}
                        placeholder={`Reply to ${c.author}…`}
                        onSubmit={handlePost}
                        onCancel={() => setReplyingTo(null)}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
