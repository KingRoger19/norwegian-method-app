const API = "/api";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type HrvStatus = "green" | "yellow" | "red" | "unknown";

export interface DashboardSummary {
  weekly_threshold_volume_secs: number;
  weekly_threshold_target_secs: number;
  hrv_today: number | null;
  hrv_baseline: number | null;
  hrv_status: HrvStatus;
  acwr: number | null;
  metrics_date: string | null;
}

export interface WeeklyZone {
  week_start: string;
  zone1_mins: number;
  zone2_mins: number;
  zone3_mins: number;
}

export interface DailyMetric {
  date: string;
  hrv_today: number | null;
  hrv_baseline: number | null;
  training_load: number | null;
}

export interface LactateFields {
  lactate_1_mmol: number | null;
  lactate_1_notes: string | null;
  lactate_2_mmol: number | null;
  lactate_2_notes: string | null;
  lactate_3_mmol: number | null;
  lactate_3_notes: string | null;
  lactate_4_mmol: number | null;
  lactate_4_notes: string | null;
  lactate_5_mmol: number | null;
  lactate_5_notes: string | null;
}

export interface Activity extends LactateFields {
  activity_id: string;
  date: string;
  start_time: string;
  duration_seconds: number;
  duration_formatted: string;
  distance_km: number;
  avg_hr: number | null;
  max_hr: number | null;
  avg_cadence: number | null;
  avg_stride_length: number | null;
  ground_time: number | null;
  stride_height: number | null;
  zone1_secs: number;
  zone2_secs: number;
  zone3_secs: number;
  zone2_pct: number | null;
  total_ascent: number | null;
  avg_power: number | null;
}

export interface StreamData {
  timestamps: number[];
  heart_rate?: (number | null)[];
  speed?: (number | null)[];
  power?: (number | null)[];
  effort_pace?: (number | null)[];
  altitude?: (number | null)[];
  cadence?: (number | null)[];
}

export interface ActivityDetail extends Activity {
  stream_data: StreamData | null;
}

export interface SyncStatus {
  status: "idle" | "running" | "success" | "partial" | "failed";
  started_at: string | null;
  completed_at: string | null;
  last_error: string | null;
}

export interface FitImportStatus {
  status: "idle" | "running" | "success" | "partial" | "failed";
  started_at: string | null;
  completed_at: string | null;
  total_files: number;
  imported: number;
  updated: number;
  skipped: number;
  errors: string[];
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export async function loginUser(
  email: string,
  password: string
): Promise<{ success: boolean; token: string }> {
  return apiFetch("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export const getDashboardSummary = () =>
  apiFetch<DashboardSummary>("/dashboard/summary");

export const getIntensityDistribution = (weeks = 8) =>
  apiFetch<WeeklyZone[]>(`/dashboard/intensity-distribution?weeks=${weeks}`);

export const getHrvLoad = (days = 30) =>
  apiFetch<DailyMetric[]>(`/dashboard/hrv-load?days=${days}`);

// ── Activities ────────────────────────────────────────────────────────────────

export const listActivities = (limit = 10, offset = 0) =>
  apiFetch<Activity[]>(`/activities/?limit=${limit}&offset=${offset}`);

export const getActivitiesCount = () =>
  apiFetch<{ total: number }>("/activities/count");

export const getActivity = (id: string) =>
  apiFetch<ActivityDetail>(`/activities/${id}`);

// ── Sync ──────────────────────────────────────────────────────────────────────

export const triggerSync = (weeks = 1) =>
  apiFetch<SyncStatus>(`/sync/trigger?weeks=${weeks}`, { method: "POST" });

export const getSyncStatus = () => apiFetch<SyncStatus>("/sync/status");

// ── .fit upload ───────────────────────────────────────────────────────────────

export async function uploadFitFiles(files: File[]): Promise<FitImportStatus> {
  const form = new FormData();
  for (const f of files) form.append("files", f);
  // No Content-Type header — browser sets it automatically with the multipart boundary
  const res = await fetch("/api/import/fit/upload", { method: "POST", body: form });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json() as Promise<FitImportStatus>;
}

export const getFitImportStatus = () =>
  apiFetch<FitImportStatus>("/import/fit/status");

// ── Athlete profile ───────────────────────────────────────────────────────────

export interface AthleteProfile {
  date_of_birth: string | null;
  gender: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  max_hr: number | null;
  resting_hr: number | null;
  lt1_hr: number | null;
  lt2_hr: number | null;
  lt1_lthr_ratio: number | null;
  lt1_pace_sec_km: number | null;
  lt2_pace_sec_km: number | null;
  ftp_watts: number | null;
  weekly_zone2_target_mins: number | null;
  updated_at: string | null;
}

export const getAthleteProfile = () => apiFetch<AthleteProfile>("/athlete");

export const updateAthleteProfile = (data: Partial<AthleteProfile>) =>
  apiFetch<AthleteProfile>("/athlete", {
    method: "PUT",
    body: JSON.stringify(data),
  });

// ── Lactate ───────────────────────────────────────────────────────────────────

export async function updateActivityLactate(
  id: string,
  fields: Partial<LactateFields>
): Promise<void> {
  await apiFetch(`/activities/${id}`, {
    method: "PATCH",
    body: JSON.stringify(fields),
  });
}
