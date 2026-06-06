"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import NavDrawer from "@/components/NavDrawer";
import {
  getAthleteProfile,
  updateAthleteProfile,
  type AthleteProfile,
} from "@/lib/api";

const TOKEN_KEY = "nm_auth_token";

// ── Pace helpers ──────────────────────────────────────────────────────────────

function secToMinSec(sec: number | null | undefined): [string, string] {
  if (!sec) return ["", ""];
  return [String(Math.floor(sec / 60)), String(sec % 60).padStart(2, "0")];
}

function minSecToSec(min: string, sec: string): number | null {
  if (min === "" && sec === "") return null;
  const m = parseInt(min) || 0;
  const s = parseInt(sec) || 0;
  return m * 60 + s;
}

// ── Form state ────────────────────────────────────────────────────────────────

type Form = {
  date_of_birth: string;
  gender: string;
  height_cm: string;
  weight_kg: string;
  max_hr: string;
  resting_hr: string;
  lt1_hr: string;
  lt2_hr: string;
  lt1_lthr_ratio: string;
  lt1_min: string; lt1_sec: string;
  lt2_min: string; lt2_sec: string;
  ftp_watts: string;
  weekly_zone2_target_mins: string;
};

function toForm(p: AthleteProfile | null): Form {
  const [lt1m, lt1s] = secToMinSec(p?.lt1_pace_sec_km);
  const [lt2m, lt2s] = secToMinSec(p?.lt2_pace_sec_km);
  const str = (v: number | null | undefined) => (v != null ? String(v) : "");
  return {
    date_of_birth: p?.date_of_birth ?? "",
    gender: p?.gender?.trim() ?? "",
    height_cm: str(p?.height_cm),
    weight_kg: str(p?.weight_kg),
    max_hr: str(p?.max_hr),
    resting_hr: str(p?.resting_hr),
    lt1_hr: str(p?.lt1_hr),
    lt2_hr: str(p?.lt2_hr),
    lt1_lthr_ratio: str(p?.lt1_lthr_ratio),
    lt1_min: lt1m, lt1_sec: lt1s,
    lt2_min: lt2m, lt2_sec: lt2s,
    ftp_watts: str(p?.ftp_watts),
    weekly_zone2_target_mins: str(p?.weekly_zone2_target_mins),
  };
}

function toPayload(f: Form): Partial<AthleteProfile> {
  const num = (v: string) => (v === "" ? null : parseFloat(v));
  const int = (v: string) => (v === "" ? null : parseInt(v));
  return {
    date_of_birth: f.date_of_birth || null,
    gender: f.gender || null,
    height_cm: num(f.height_cm),
    weight_kg: num(f.weight_kg),
    max_hr: int(f.max_hr),
    resting_hr: int(f.resting_hr),
    lt1_hr: int(f.lt1_hr),
    lt2_hr: int(f.lt2_hr),
    lt1_lthr_ratio: num(f.lt1_lthr_ratio),
    lt1_pace_sec_km: minSecToSec(f.lt1_min, f.lt1_sec),
    lt2_pace_sec_km: minSecToSec(f.lt2_min, f.lt2_sec),
    ftp_watts: int(f.ftp_watts),
    weekly_zone2_target_mins: int(f.weekly_zone2_target_mins),
  };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionCard({
  color,
  icon,
  title,
  subtitle,
  children,
}: {
  color: string;
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
      <div className="flex items-center gap-3 mb-5">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${color}`}>
          {icon}
        </div>
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
          {subtitle && <p className="text-xs text-zinc-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-zinc-500 mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-xs text-zinc-600 mt-1.5 leading-relaxed">{hint}</p>}
    </div>
  );
}

const inputCls =
  "w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-blue-500 transition-colors";

function NumInput({
  value, onChange, unit, placeholder, step, min, max,
}: {
  value: string; onChange: (v: string) => void;
  unit?: string; placeholder?: string;
  step?: string; min?: string; max?: string;
}) {
  return (
    <div className="relative">
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "—"}
        step={step}
        min={min}
        max={max}
        className={inputCls}
        style={unit ? { paddingRight: `${unit.length * 7 + 24}px` } : undefined}
      />
      {unit && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500 pointer-events-none select-none">
          {unit}
        </span>
      )}
    </div>
  );
}

function PaceInput({
  minVal, secVal, onMinChange, onSecChange,
}: {
  minVal: string; secVal: string;
  onMinChange: (v: string) => void; onSecChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="relative flex-1">
        <input
          type="number"
          value={minVal}
          onChange={(e) => onMinChange(e.target.value)}
          placeholder="0"
          min="0"
          max="20"
          className={`${inputCls} text-center`}
        />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-zinc-600 pointer-events-none">m</span>
      </div>
      <span className="text-zinc-600 font-mono text-sm">:</span>
      <div className="relative flex-1">
        <input
          type="number"
          value={secVal}
          onChange={(e) => onSecChange(e.target.value)}
          placeholder="00"
          min="0"
          max="59"
          className={`${inputCls} text-center`}
        />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-zinc-600 pointer-events-none">s</span>
      </div>
      <span className="text-xs text-zinc-600 whitespace-nowrap">/km</span>
    </div>
  );
}

function GenderPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-1.5">
      {(["M", "F", "X"] as const).map((g) => (
        <button
          key={g}
          type="button"
          onClick={() => onChange(value === g ? "" : g)}
          className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${
            value === g
              ? "bg-blue-600 text-white border border-blue-500"
              : "bg-zinc-800 text-zinc-400 border border-zinc-700 hover:border-zinc-500 hover:text-zinc-200"
          }`}
        >
          {g === "M" ? "Male" : g === "F" ? "Female" : "Other"}
        </button>
      ))}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AthleteSettingsPage() {
  const router = useRouter();
  const [form, setForm] = useState<Form>(toForm(null));
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const set = (key: keyof Form) => (val: string) =>
    setForm((prev) => ({ ...prev, [key]: val }));

  useEffect(() => {
    if (!localStorage.getItem(TOKEN_KEY)) { router.replace("/login"); return; }
    getAthleteProfile()
      .then((p) => { setForm(toForm(p)); setLastUpdated(p.updated_at); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [router]);

  async function handleSave() {
    setSaveStatus("saving");
    try {
      const result = await updateAthleteProfile(toPayload(form));
      setLastUpdated(result.updated_at);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 4000);
    }
  }

  // Derived hint: effective LT1 from current form values
  const derivedLt1 = (() => {
    if (form.lt1_hr) return null; // directly set — no need to derive
    const lt2 = parseInt(form.lt2_hr);
    const ratio = parseFloat(form.lt1_lthr_ratio);
    if (!isNaN(lt2) && !isNaN(ratio)) return Math.round(lt2 * ratio);
    return null;
  })();

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-zinc-700 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/50 sticky top-0 z-30 backdrop-blur-sm">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <NavDrawer />
            <span className="text-lg hidden sm:inline">🏔</span>
            <span className="font-semibold text-sm text-zinc-100 hidden sm:inline">Norwegian Method</span>
            <span className="text-zinc-700 hidden sm:inline">/</span>
            <span className="text-sm text-zinc-400 hidden sm:inline">Athlete Profile</span>
          </div>
          <button
            onClick={() => { localStorage.removeItem(TOKEN_KEY); router.replace("/login"); }}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors px-2 py-1"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        {/* Page intro */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-sm font-semibold text-zinc-100">Athlete Profile</h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              Powers zone calculations, pct of HR max, and dashboard targets.
            </p>
          </div>
          {lastUpdated && (
            <span suppressHydrationWarning className="text-xs text-zinc-600 whitespace-nowrap mt-0.5">
              Saved {lastUpdated.slice(0, 10)}
            </span>
          )}
        </div>

        {/* ── Personal ── */}
        <SectionCard
          color="bg-violet-950 text-violet-400"
          title="Personal"
          subtitle="Identity and body composition"
          icon={
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 00-13.074.003z" />
            </svg>
          }
        >
          <div className="grid grid-cols-2 gap-4">
            <Field label="Date of birth">
              <input
                type="date"
                value={form.date_of_birth}
                onChange={(e) => set("date_of_birth")(e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Gender">
              <GenderPicker value={form.gender} onChange={set("gender")} />
            </Field>
            <Field label="Height">
              <NumInput value={form.height_cm} onChange={set("height_cm")} unit="cm" min="100" max="230" />
            </Field>
            <Field label="Weight">
              <NumInput value={form.weight_kg} onChange={set("weight_kg")} unit="kg" step="0.1" min="30" max="200" />
            </Field>
          </div>
        </SectionCard>

        {/* ── Cardiac ── */}
        <SectionCard
          color="bg-red-950 text-red-400"
          title="Cardiac"
          subtitle="Heart rate limits and baseline"
          icon={
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M9.653 16.915l-.005-.003-.019-.01a20.759 20.759 0 01-1.162-.682 22.045 22.045 0 01-2.582-2.012C4.045 12.455 2 10.298 2 7.5a4.5 4.5 0 018-2.828A4.5 4.5 0 0118 7.5c0 2.798-2.045 4.955-3.885 6.708a22.047 22.047 0 01-2.582 2.012 20.758 20.758 0 01-1.162.682l-.02.01-.005.003h-.002a.739.739 0 01-.69.001l-.002-.001z" />
            </svg>
          }
        >
          <div className="grid grid-cols-2 gap-4">
            <Field label="Max HR" hint="Used for pct of HR max on every activity.">
              <NumInput value={form.max_hr} onChange={set("max_hr")} unit="bpm" min="120" max="250" />
            </Field>
            <Field label="Resting HR" hint="Stable baseline for the Karvonen HR-reserve formula.">
              <NumInput value={form.resting_hr} onChange={set("resting_hr")} unit="bpm" min="30" max="100" />
            </Field>
          </div>
        </SectionCard>

        {/* ── Lactate Thresholds ── */}
        <SectionCard
          color="bg-amber-950 text-amber-400"
          title="Lactate Thresholds"
          subtitle="HR and pace boundaries for zone calculation"
          icon={
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M12 2a.75.75 0 01.75.75v.756a49.106 49.106 0 013.878.109.75.75 0 11-.256 1.478c-.09-.015-.18-.03-.27-.043a49.745 49.745 0 01.28 1.958.75.75 0 01-1.496.084 48.248 48.248 0 00-.35-2.31l-.007-.036a2.75 2.75 0 00-2.53 0l-.007.036a48.25 48.25 0 00-.35 2.31.75.75 0 01-1.496-.084 49.745 49.745 0 01.28-1.958c-.09.013-.18.028-.27.043a.75.75 0 11-.256-1.478 49.106 49.106 0 013.878-.109V2.75A.75.75 0 0112 2zM3 7.75a.75.75 0 01.75-.75h12.5a.75.75 0 010 1.5H3.75A.75.75 0 013 7.75zm.75 2.75a.75.75 0 000 1.5h.01a.75.75 0 000-1.5H3.75zm6.25 0a.75.75 0 000 1.5h.01a.75.75 0 000-1.5H10zm3.25 0a.75.75 0 000 1.5h.01a.75.75 0 000-1.5h-.01zM3.75 13.5a.75.75 0 000 1.5h.01a.75.75 0 000-1.5H3.75zm6.25 0a.75.75 0 000 1.5h.01a.75.75 0 000-1.5H10zm3.25 0a.75.75 0 000 1.5h.01a.75.75 0 000-1.5h-.01z" clipRule="evenodd" />
            </svg>
          }
        >
          <div className="space-y-4">
            {/* HR thresholds */}
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Heart rate</p>
            <div className="grid grid-cols-2 gap-4">
              <Field
                label="LT2 / LTHR baseline"
                hint="Fallback for days without Coros data. Daily data from Coros takes priority."
              >
                <NumInput value={form.lt2_hr} onChange={set("lt2_hr")} unit="bpm" min="100" max="220" />
              </Field>
              <Field
                label="LT1 (directly measured)"
                hint={
                  form.lt1_hr
                    ? undefined
                    : derivedLt1
                    ? `Not set — derived as LT2 × ratio ≈ ${derivedLt1} bpm`
                    : "Leave blank to derive from LT2 × ratio below."
                }
              >
                <NumInput value={form.lt1_hr} onChange={set("lt1_hr")} unit="bpm" min="80" max="220" />
              </Field>
            </div>
            <Field
              label="LT1 / LT2 ratio"
              hint="LT1 is derived as LT2 × this value when not directly measured. Default: 0.88."
            >
              <NumInput
                value={form.lt1_lthr_ratio}
                onChange={set("lt1_lthr_ratio")}
                step="0.01"
                min="0.7"
                max="0.99"
                placeholder="0.88"
              />
            </Field>

            {/* Pace thresholds */}
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider pt-1">Pace</p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="LT1 pace" hint="Easy aerobic upper limit.">
                <PaceInput
                  minVal={form.lt1_min} secVal={form.lt1_sec}
                  onMinChange={set("lt1_min")} onSecChange={set("lt1_sec")}
                />
              </Field>
              <Field label="LT2 pace" hint="Threshold sweet spot.">
                <PaceInput
                  minVal={form.lt2_min} secVal={form.lt2_sec}
                  onMinChange={set("lt2_min")} onSecChange={set("lt2_sec")}
                />
              </Field>
            </div>
          </div>
        </SectionCard>

        {/* ── Power ── */}
        <SectionCard
          color="bg-blue-950 text-blue-400"
          title="Power"
          subtitle="Running power reference point"
          icon={
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M11.983 1.907a.75.75 0 00-1.292-.657l-8.5 9.5A.75.75 0 002.75 12h6.572l-1.305 6.093a.75.75 0 001.292.657l8.5-9.5A.75.75 0 0017.25 8h-6.572l1.305-6.093z" />
            </svg>
          }
        >
          <Field label="Running FTP" hint="Functional threshold power — used for power-based zone boundaries.">
            <NumInput value={form.ftp_watts} onChange={set("ftp_watts")} unit="W" min="50" max="600" />
          </Field>
        </SectionCard>

        {/* ── Training targets ── */}
        <SectionCard
          color="bg-green-950 text-green-400"
          title="Training Targets"
          subtitle="Weekly volume goals shown on the dashboard"
          icon={
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-11.25a.75.75 0 00-1.5 0v4.59L7.3 9.24a.75.75 0 00-1.1 1.02l3.25 3.5a.75.75 0 001.1 0l3.25-3.5a.75.75 0 10-1.1-1.02l-1.95 2.1V6.75z" clipRule="evenodd" />
            </svg>
          }
        >
          <Field
            label="Weekly Zone 2 target"
            hint="The progress bar on the dashboard KPI card tracks time in Zone 2 against this target."
          >
            <NumInput
              value={form.weekly_zone2_target_mins}
              onChange={set("weekly_zone2_target_mins")}
              unit="min"
              min="0"
              max="600"
              placeholder="90"
            />
          </Field>
        </SectionCard>

        {/* Save */}
        <div className="flex justify-end pb-4">
          <button
            onClick={handleSave}
            disabled={saveStatus === "saving"}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
              saveStatus === "saved"
                ? "bg-green-900/60 text-green-300 border border-green-800"
                : saveStatus === "error"
                ? "bg-red-900/60 text-red-300 border border-red-800"
                : "bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white"
            }`}
          >
            {saveStatus === "saving" && (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            )}
            {saveStatus === "saved" ? "✓ Profile saved" :
             saveStatus === "error" ? "Error — try again" :
             saveStatus === "saving" ? "Saving…" :
             "Save changes"}
          </button>
        </div>
      </main>
    </div>
  );
}
