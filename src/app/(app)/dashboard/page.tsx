"use client";

import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  YAxis,
  ReferenceLine,
} from "recharts";
import { createClient } from "@/lib/supabase/client";

const WEIGHT_TARGET = 84.0;
const CARDIO_TARGET = 3;
const MUSCU_TARGET = 2;

interface Metric { date: string; resting_hr: number | null; hrv: number | null; weight: number | null }
interface Sleep { date: string; duration_hours: number; quality: string | null; deep_sleep_minutes: number | null; rem_sleep_minutes: number | null }
interface Activity { date: string; type: string; duration_minutes: number; intensity: string | null; calories: number }
interface JournalEntry { id: string; created_at: string; category: string; content: string }

const cardioTypes = ["cycling", "running", "rowing", "windsurfing_v2", "swimming", "walking", "hiking"];

function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return localDate(d);
}

function startOfWeek(weeksBack: number): string {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff - weeksBack * 7);
  return localDate(d);
}

function weekDays(): string[] {
  const start = startOfWeek(0);
  const [y, m, dd] = start.split("-").map(Number);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(y, m - 1, dd + i);
    return localDate(d);
  });
}

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="h-2 bg-surface-container-highest rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function MiniChart({ data, color, showTarget }: { data: { value: number }[]; color: string; showTarget?: boolean }) {
  return (
    <ResponsiveContainer width="100%" height={60}>
      <LineChart data={data}>
        <YAxis hide domain={["dataMin - 1", "dataMax + 1"]} />
        {showTarget && <ReferenceLine y={WEIGHT_TARGET} stroke="#ba1a1a" strokeDasharray="4 3" strokeWidth={1} />}
        <Line dataKey="value" stroke={color} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [sleep, setSleep] = useState<Sleep[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await fetch("/api/garmin/sync", { method: "POST" });
      const result = await res.json();
      if (result.ok) load();
    } catch { /* ignore */ }
    setSyncing(false);
  }

  async function load() {
    setLoading(true);
    const supabase = createClient();
    const sinceStr = daysAgo(173);

    const [{ data: m }, { data: s }, { data: a }, { data: j }] = await Promise.all([
      supabase.from("garmin_metrics").select("*").gte("date", sinceStr).order("date"),
      supabase.from("garmin_sleep").select("*").gte("date", sinceStr).order("date"),
      supabase.from("garmin_activities").select("*").gte("date", sinceStr).order("date", { ascending: false }),
      supabase.from("journal_entries").select("*").order("created_at", { ascending: false }).limit(50),
    ]);

    setMetrics(m || []);
    setSleep(s || []);
    setActivities(a || []);
    setJournal(j || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  // --- État de forme ---
  const lastSleep = sleep[sleep.length - 1];
  const sleepSignal = lastSleep
    ? (lastSleep.duration_hours >= 7 ? "green" : lastSleep.duration_hours >= 6 ? "orange" : "red")
    : "green";
  const sleepHours = lastSleep ? Math.floor(lastSleep.duration_hours) : null;
  const sleepMinutes = lastSleep ? Math.round((lastSleep.duration_hours % 1) * 60) : null;
  const sleepQuality = lastSleep?.quality?.toLowerCase() || null;

  // Humeur from most recent journal entry with mood
  const moodMap: Record<string, { emoji: string; label: string }> = {
    super: { emoji: "😄", label: "Super" },
    bien: { emoji: "🙂", label: "Bien" },
    neutre: { emoji: "😐", label: "Neutre" },
    irritable: { emoji: "😤", label: "Irritable" },
    anxieux: { emoji: "😰", label: "Anxieux" },
  };
  const latestMoodEntry = journal.find((j: any) => j.mood && j.category === "quotidien");
  const latestMood = latestMoodEntry ? moodMap[(latestMoodEntry as any).mood] : null;
  const moodEmoji = latestMood?.emoji || "—";
  const moodLabel = latestMood?.label || "Pas de donnée";

  const last30 = metrics.slice(-30);
  const todayMetric = metrics[metrics.length - 1];
  const metricsWithHR = last30.filter(m => m.resting_hr);
  const metricsWithHRV = last30.filter(m => m.hrv);
  const avgHR = metricsWithHR.reduce((s, m) => s + m.resting_hr!, 0) / (metricsWithHR.length || 1);
  const avgHRV = metricsWithHRV.reduce((s, m) => s + m.hrv!, 0) / (metricsWithHRV.length || 1);

  const hrDiff = todayMetric?.resting_hr && avgHR ? todayMetric.resting_hr - Math.round(avgHR) : 0;
  const hrvDiff = todayMetric?.hrv && avgHRV ? todayMetric.hrv - Math.round(avgHRV) : 0;

  let recoverySignal: "green" | "orange" | "red" = "green";
  if (hrDiff > 3 || hrvDiff < -5) recoverySignal = "orange";
  if (hrDiff > 6 || hrvDiff < -10) recoverySignal = "red";

  // --- Activité cette semaine ---
  const thisWeekStart = startOfWeek(0);
  const lastWeekStart = startOfWeek(1);
  const allThisWeek = activities.filter(a => a.date >= thisWeekStart);
  const allLastWeek = activities.filter(a => a.date >= lastWeekStart && a.date < thisWeekStart);

  const isRoutine = (a: Activity) => a.type === "strength_training" && a.duration_minutes < 10;
  const isMuscu = (a: Activity) => a.type === "strength_training" && a.duration_minutes >= 10;

  const routineThisWeek = allThisWeek.filter(isRoutine);
  const muscuThis = allThisWeek.filter(isMuscu).length;
  const cardioThis = allThisWeek.filter(a => cardioTypes.includes(a.type)).length;

  // Routine streak
  const days = weekDays();
  const today = localDate(new Date());
  const routineDays = new Set(routineThisWeek.map(a => a.date));
  let streak = 0;
  for (const d of days) {
    if (d > today) break;
    if (routineDays.has(d)) streak++;
    else streak = 0;
  }

  // --- Poids ---
  const latestWeight = [...metrics].reverse().find(m => m.weight != null);
  const weightDelta = latestWeight?.weight ? Math.round((latestWeight.weight - WEIGHT_TARGET) * 10) / 10 : null;

  const weight30 = metrics
    .filter(m => m.weight != null && m.date >= daysAgo(30))
    .map(m => ({ value: m.weight! }));

  const weightAll = metrics
    .filter(m => m.weight != null)
    .map(m => ({ value: m.weight! }));

  const dayLabels = ["L", "Ma", "Me", "J", "V", "S", "D"];

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-primary-container flex items-center justify-center">
            <svg className="w-5 h-5 text-on-primary-container" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" />
            </svg>
          </div>
          <h1 className="text-xl font-bold tracking-tight">Perso</h1>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="p-2 rounded-full text-on-surface-variant hover:bg-surface-container transition-colors disabled:opacity-50"
        >
          <svg className={`w-5 h-5 ${syncing ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182M20.016 4.356v4.992" />
          </svg>
        </button>
      </div>

      {/* État de forme */}
      <div>
        <h2 className="text-sm font-semibold text-on-surface-variant mb-3">État de forme</h2>
        <div className="grid grid-cols-3 gap-3">
          {/* Sommeil */}
          <div className="bg-white rounded-2xl p-3.5 shadow-[0px_10px_30px_rgba(94,139,126,0.08)]">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-on-surface-variant">Sommeil</p>
              <span className={`w-2 h-2 rounded-full ${sleepSignal === "green" ? "bg-primary" : sleepSignal === "orange" ? "bg-tertiary" : "bg-error"}`} />
            </div>
            <p className="text-lg font-bold mt-1.5">
              {sleepHours != null ? `${sleepHours}h${sleepMinutes ? String(sleepMinutes).padStart(2, "0") : ""}` : "—"}
            </p>
            {sleepQuality && (
              <p className="text-[11px] text-on-surface-variant mt-0.5 capitalize">{sleepQuality}</p>
            )}
            <div className="flex gap-0.5 mt-2">
              {sleep.slice(-7).map((s, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-sm bg-primary/20"
                  style={{ height: `${Math.max(8, (s.duration_hours / 9) * 24)}px` }}
                />
              ))}
            </div>
          </div>

          {/* Récup */}
          <div className="bg-white rounded-2xl p-3.5 shadow-[0px_10px_30px_rgba(94,139,126,0.08)]">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-on-surface-variant">Récup</p>
              <span className={`w-2 h-2 rounded-full ${recoverySignal === "green" ? "bg-primary" : recoverySignal === "orange" ? "bg-tertiary" : "bg-error"}`} />
            </div>
            <div className="mt-1.5 space-y-1">
              <div className="flex items-baseline justify-between">
                <span className="text-[11px] text-on-surface-variant">FC</span>
                <span className="text-sm font-bold">{todayMetric?.resting_hr ?? "—"}</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-[11px] text-on-surface-variant">HRV</span>
                <span className="text-sm font-bold">{todayMetric?.hrv ?? "—"}</span>
              </div>
            </div>
            <p className="text-[10px] text-outline mt-1.5">
              moy. FC {Math.round(avgHR)} · HRV {Math.round(avgHRV)}
            </p>
          </div>

          {/* Humeur */}
          <div className="bg-white rounded-2xl p-3.5 shadow-[0px_10px_30px_rgba(94,139,126,0.08)]">
            <p className="text-xs font-semibold text-on-surface-variant">Humeur</p>
            <p className="text-2xl mt-1">{moodEmoji}</p>
            <p className="text-[11px] text-on-surface-variant mt-1">→ {moodLabel}</p>
          </div>
        </div>
      </div>

      {/* Activité cette semaine */}
      <div>
        <h2 className="text-sm font-semibold text-on-surface-variant mb-3">Activité cette semaine</h2>
        <div className="bg-white rounded-2xl p-5 shadow-[0px_10px_30px_rgba(94,139,126,0.08)] space-y-5">
          {/* Routine */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-primary text-lg">🏃‍♂️</span>
                <span className="text-sm font-semibold">Routine</span>
              </div>
              <span className="text-sm font-semibold text-on-surface-variant">{streak} jours de suite</span>
            </div>
            <div className="flex justify-between">
              {days.map((d, i) => {
                const done = routineDays.has(d);
                const isFuture = d > today;
                return (
                  <div key={d} className="flex flex-col items-center gap-1.5">
                    <span className="text-[11px] text-on-surface-variant font-medium">{dayLabels[i]}</span>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${
                      done
                        ? "bg-tertiary-container text-tertiary"
                        : isFuture
                        ? "bg-surface-container-highest/50 text-outline"
                        : "bg-surface-container-highest text-outline"
                    }`}>
                      {done ? "✓" : ""}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Muscu */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-primary text-lg">🏋️</span>
                <span className="text-sm font-semibold">Muscu</span>
              </div>
              <span className="text-sm font-bold">{muscuThis}/{MUSCU_TARGET}</span>
            </div>
            <ProgressBar value={muscuThis} max={MUSCU_TARGET} color="bg-primary" />
          </div>

          {/* Cardio */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-primary text-lg">🚴</span>
                <span className="text-sm font-semibold">Cardio</span>
              </div>
              <span className="text-sm font-bold">{cardioThis}/{CARDIO_TARGET}</span>
            </div>
            <ProgressBar value={cardioThis} max={CARDIO_TARGET} color="bg-primary" />
          </div>
        </div>
      </div>

      {/* Poids */}
      <div>
        <h2 className="text-sm font-semibold text-on-surface-variant mb-3">Poids</h2>
        <div className="bg-white rounded-2xl p-5 shadow-[0px_10px_30px_rgba(94,139,126,0.08)]">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-2xl font-bold text-primary">{latestWeight?.weight ?? "—"} kg</p>
              {weightDelta !== null && (
                <p className="text-sm text-on-surface-variant mt-0.5">
                  {weightDelta > 0 ? `−${weightDelta} kg à faire` : "Objectif atteint !"}
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Objectif</p>
              <p className="text-lg font-bold">{WEIGHT_TARGET} kg</p>
            </div>
          </div>

          {weight30.length > 2 && (
            <div className="mb-4">
              <p className="text-xs font-semibold text-on-surface-variant mb-1">Tendance 30 jours</p>
              <MiniChart data={weight30} color="#386458" showTarget />
            </div>
          )}

          {weightAll.length > weight30.length && (
            <div>
              <p className="text-xs font-semibold text-on-surface-variant mb-1">Tendance 2026</p>
              <MiniChart data={weightAll} color="#386458" showTarget />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
