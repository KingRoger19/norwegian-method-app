"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";

import {
  getDashboardSummary,
  getIntensityDistribution,
  getHrvLoad,
  listActivities,
  getActivity,
  type DashboardSummary,
  type WeeklyZone,
  type DailyMetric,
  type Activity,
  type ActivityDetail,
} from "@/lib/api";

import {
  WeeklyThresholdCard,
  HRVCard,
  ACWRCard,
} from "@/components/KpiCards";
import ActivityTable from "@/components/ActivityTable";
import SyncButton from "@/components/SyncButton";
import UploadFitButton from "@/components/UploadFitButton";
import NavDrawer from "@/components/NavDrawer";

const IntensityDistributionChart = dynamic(
  () => import("@/components/IntensityDistributionChart"),
  {
    ssr: false,
    loading: () => <ChartSkeleton label="Weekly Intensity Distribution" />,
  }
);

const HRVLoadChart = dynamic(() => import("@/components/HRVLoadChart"), {
  ssr: false,
  loading: () => <ChartSkeleton label="Autonomic Recovery vs Stress" />,
});

const ActivityDetailModal = dynamic(
  () => import("@/components/ActivityDetailModal"),
  { ssr: false }
);

const TOKEN_KEY = "nm_auth_token";

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [intensity, setIntensity] = useState<WeeklyZone[]>([]);
  const [hrvLoad, setHrvLoad] = useState<DailyMetric[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedActivity, setSelectedActivity] = useState<ActivityDetail | null>(null);
  const [modalLoading, setModalLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [s, i, h, a] = await Promise.all([
        getDashboardSummary(),
        getIntensityDistribution(8),
        getHrvLoad(30),
        listActivities(10),
      ]);
      setSummary(s);
      setIntensity(i);
      setHrvLoad(h);
      setActivities(a);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!localStorage.getItem(TOKEN_KEY)) {
      router.replace("/login");
      return;
    }
    fetchAll();
  }, [router, fetchAll]);

  async function handleSelectActivity(id: string) {
    setModalLoading(true);
    try {
      const detail = await getActivity(id);
      setSelectedActivity(detail);
    } catch {
      // silently fail — activity might have no detail
    } finally {
      setModalLoading(false);
    }
  }

  function handleSignOut() {
    localStorage.removeItem(TOKEN_KEY);
    router.replace("/login");
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-zinc-700 border-t-blue-500 rounded-full animate-spin" />
          <p className="text-sm text-zinc-500">Loading dashboard…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* ── Top nav ── */}
      <header className="border-b border-zinc-800 bg-zinc-900/50 sticky top-0 z-30 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <NavDrawer />
            <span className="text-lg hidden sm:inline">🏔</span>
            <span className="font-semibold text-sm text-zinc-100 hidden sm:inline">
              Norwegian Method
            </span>
            <span className="text-zinc-700 hidden sm:inline">/</span>
            <span className="text-sm text-zinc-400 hidden sm:inline">Dashboard</span>
          </div>
          <div className="flex items-center gap-3">
            <SyncButton onSyncComplete={fetchAll} />
            <UploadFitButton onImportComplete={fetchAll} />
            <button
              onClick={handleSignOut}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors px-2 py-1"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {error && (
          <div className="bg-red-950/40 border border-red-900 rounded-xl px-4 py-3 text-sm text-red-400 flex items-center gap-2">
            <span>⚠</span> {error}
            <button
              onClick={() => { setError(""); fetchAll(); }}
              className="ml-auto text-xs underline hover:no-underline"
            >
              Retry
            </button>
          </div>
        )}

        {/* ── KPI Cards ── */}
        <section>
          <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">
            Current Week
          </h2>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <WeeklyThresholdCard data={summary} />
            <HRVCard data={summary} />
            <ACWRCard data={summary} />
          </div>
        </section>

        {/* ── Charts ── */}
        <section>
          <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">
            Analytics
          </h2>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {intensity.length > 0 ? (
              <IntensityDistributionChart data={intensity} />
            ) : (
              <ChartSkeleton label="Weekly Intensity Distribution" empty />
            )}
            {hrvLoad.length > 0 ? (
              <HRVLoadChart data={hrvLoad} />
            ) : (
              <ChartSkeleton label="Autonomic Recovery vs Stress" empty />
            )}
          </div>
        </section>

        {/* ── Activity Table ── */}
        <section>
          <ActivityTable
            activities={activities}
            onSelect={handleSelectActivity}
          />
        </section>
      </main>

      {/* ── Activity Detail Modal ── */}
      {modalLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-8 h-8 border-2 border-zinc-700 border-t-blue-500 rounded-full animate-spin" />
        </div>
      )}
      {selectedActivity && (
        <ActivityDetailModal
          activity={selectedActivity}
          onClose={() => setSelectedActivity(null)}
        />
      )}
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function ChartSkeleton({
  label,
  empty,
}: {
  label: string;
  empty?: boolean;
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
      <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-4">
        {label}
      </p>
      <div className="h-[240px] flex items-center justify-center">
        {empty ? (
          <p className="text-sm text-zinc-600">No data available</p>
        ) : (
          <div className="w-8 h-8 border-2 border-zinc-700 border-t-blue-500 rounded-full animate-spin" />
        )}
      </div>
    </div>
  );
}
