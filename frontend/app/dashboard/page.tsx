"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";

import {
  getDashboardSummary,
  getIntensityDistribution,
  getHrvLoad,
  getHrvRolling,
  getSleepStats,
  getReadiness,
  getZone2Trend,
  listActivities,
  getActivitiesCount,
  getActivity,
  getDailyDistance,
  type DashboardSummary,
  type WeeklyZone,
  type DailyMetric,
  type Activity,
  type ActivityDetail,
  type DailyDistance,
  type HrvRolling,
  type SleepStats,
  type Readiness,
  type Zone2Week,
} from "@/lib/api";

const PAGE_SIZE = 10;

function sinceDate(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 4);
  return d.toISOString().slice(0, 10);
}

import {
  WeeklyThresholdCard,
  HRVCard,
  ACWRCard,
} from "@/components/KpiCards";
import ActivityTable from "@/components/ActivityTable";
import SyncButton from "@/components/SyncButton";
import UploadFitButton from "@/components/UploadFitButton";
import NavDrawer from "@/components/NavDrawer";
import SleepStatsBox from "@/components/SleepStatsBox";
import ReadinessCard from "@/components/ReadinessCard";

const Zone2TrendChart = dynamic(
  () => import("@/components/Zone2TrendChart"),
  { ssr: false, loading: () => <ChartSkeleton label="Weekly Zone 2 Volume" /> }
);

const HRVRollingChart = dynamic(
  () => import("@/components/HRVRollingChart"),
  {
    ssr: false,
    loading: () => <ChartSkeleton label="7-Day Rolling HRV Metrics" />,
  }
);

const KmDrilldownChart = dynamic(
  () => import("@/components/KmDrilldownChart"),
  {
    ssr: false,
    loading: () => <ChartSkeleton label="Total Distance — Monthly" />,
  }
);

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
  const [activityTotal, setActivityTotal] = useState(0);
  const [activityPage, setActivityPage] = useState(0);
  const [dailyDistance, setDailyDistance] = useState<DailyDistance[]>([]);
  const [hrvRolling, setHrvRolling] = useState<HrvRolling[]>([]);
  const [sleepStats, setSleepStats] = useState<SleepStats | null>(null);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [zone2Trend, setZone2Trend] = useState<Zone2Week[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedActivity, setSelectedActivity] = useState<ActivityDetail | null>(null);
  const [modalLoading, setModalLoading] = useState(false);

  const fetchActivities = useCallback(async (page: number) => {
    const since = sinceDate();
    const [items, { total }] = await Promise.all([
      listActivities(PAGE_SIZE, page * PAGE_SIZE, since),
      getActivitiesCount(since),
    ]);
    setActivities(items);
    setActivityTotal(total);
  }, []);

  const fetchAll = useCallback(async () => {
    try {
      const [s, i, h, dd, hr, sl, rd, z2] = await Promise.all([
        getDashboardSummary(),
        getIntensityDistribution(8),
        getHrvLoad(30),
        getDailyDistance(13),
        getHrvRolling(120),
        getSleepStats(),
        getReadiness(),
        getZone2Trend(12),
      ]);
      setSummary(s);
      setIntensity(i);
      setHrvLoad(h);
      setDailyDistance(dd);
      setHrvRolling(hr);
      setSleepStats(sl);
      setReadiness(rd);
      setZone2Trend(z2);
      await fetchActivities(0);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [fetchActivities]);

  useEffect(() => {
    if (!localStorage.getItem(TOKEN_KEY)) {
      router.replace("/login");
      return;
    }
    fetchAll();
  }, [router, fetchAll]);

  useEffect(() => {
    if (activityPage === 0) return; // page 0 is loaded by fetchAll
    fetchActivities(activityPage);
  }, [activityPage, fetchActivities]);

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
          <p className="text-sm text-zinc-300">Loading dashboard…</p>
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
            <span className="text-sm text-zinc-200 hidden sm:inline">Dashboard</span>
          </div>
          <div className="flex items-center gap-3">
            <SyncButton onSyncComplete={fetchAll} />
            <UploadFitButton onImportComplete={fetchAll} />
            <button
              onClick={handleSignOut}
              className="text-xs text-zinc-300 hover:text-zinc-100 transition-colors px-2 py-1"
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
          <h2 className="text-xs font-medium text-zinc-300 uppercase tracking-wider mb-3">
            Current Week
          </h2>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <WeeklyThresholdCard data={summary} />
            <HRVCard data={summary} />
            <ACWRCard data={summary} />
          </div>
        </section>

        {/* ── Daily Readiness ── */}
        <section>
          <ReadinessCard data={readiness} />
        </section>

        {/* ── Charts ── */}
        <section>
          <h2 className="text-xs font-medium text-zinc-300 uppercase tracking-wider mb-3">
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
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-4 items-stretch">
            <div className="xl:col-span-3">
              {hrvRolling.length > 0 ? (
                <HRVRollingChart data={hrvRolling} />
              ) : (
                <ChartSkeleton label="7-Day Rolling HRV Metrics" empty />
              )}
            </div>
            <div className="xl:col-span-1">
              <SleepStatsBox data={sleepStats} />
            </div>
          </div>
          {zone2Trend.length > 0 ? (
            <Zone2TrendChart data={zone2Trend} />
          ) : (
            <ChartSkeleton label="Weekly Zone 2 Volume" empty />
          )}
        </section>

        {/* ── Distance Drill-down ── */}
        <section>
          <h2 className="text-xs font-medium text-zinc-300 uppercase tracking-wider mb-3">
            Distance
          </h2>
          {dailyDistance.length > 0 ? (
            <KmDrilldownChart data={dailyDistance} />
          ) : (
            <ChartSkeleton label="Total Distance — Monthly" empty />
          )}
        </section>

        {/* ── Activity Table ── */}
        <section>
          <ActivityTable
            activities={activities}
            onSelect={handleSelectActivity}
            page={activityPage}
            totalPages={Math.ceil(activityTotal / PAGE_SIZE)}
            total={activityTotal}
            onPrev={() => setActivityPage((p) => Math.max(0, p - 1))}
            onNext={() => setActivityPage((p) => p + 1)}
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
      <p className="text-xs font-medium text-zinc-300 uppercase tracking-wider mb-4">
        {label}
      </p>
      <div className="h-[240px] flex items-center justify-center">
        {empty ? (
          <p className="text-sm text-zinc-400">No data available</p>
        ) : (
          <div className="w-8 h-8 border-2 border-zinc-700 border-t-blue-500 rounded-full animate-spin" />
        )}
      </div>
    </div>
  );
}
