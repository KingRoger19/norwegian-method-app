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
  double_threshold_days: number;
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

export interface Activity {
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
  is_double_threshold: boolean;
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

export const listActivities = (limit = 10) =>
  apiFetch<Activity[]>(`/activities/?limit=${limit}`);

export const getActivity = (id: string) =>
  apiFetch<ActivityDetail>(`/activities/${id}`);

// ── Sync ──────────────────────────────────────────────────────────────────────

export const triggerSync = (weeks = 1) =>
  apiFetch<SyncStatus>(`/sync/trigger?weeks=${weeks}`, { method: "POST" });

export const getSyncStatus = () => apiFetch<SyncStatus>("/sync/status");
