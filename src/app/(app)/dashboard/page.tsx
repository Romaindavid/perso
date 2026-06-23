"use client";

import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { createClient } from "@/lib/supabase/client";

const WEIGHT_TARGET = 84.0;

interface Metric { date: string; resting_hr: number | null; hrv: number | null; weight: number | null }
interface Sleep { date: string; duration_hours: number; quality: string | null; deep_sleep_minutes: number | null; rem_sleep_minutes: number | null }
interface Activity { date: string; type: string; duration_minutes: number; intensity: string | null; calories: number }
interface JournalEntry { id: string; created_at: string; category: string; content: string }

type Signal = "green" | "orange" | "red";

function signal(value: number | null, avg: number | null, higherIsBetter: boolean): Signal {
  if (value == null || avg == null) return "green";
  const diff = higherIsBetter ? value - avg : avg - value;
  const pct = diff / avg;
  if (pct > 0.05) return "green";
  if (pct > -0.05) return "orange";
  return "red";
}

const signalColors: Record<Signal, string> = {
  green: "bg-primary/20 text-primary",
  orange: "bg-amber-100 text-amber-700",
  red: "bg-error-container text-error",
};

const signalDots: Record<Signal, string> = {
  green: "bg-primary",
  orange: "bg-amber-500",
  red: "bg-[#ba1a1a]",
};

function formatDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

const activityIcons: Record<string, string> = {
  cycling: "🚴", running: "🏃", strength_training: "🏋️", windsurfing_v2: "🪁",
  walking: "🚶", hiking: "🥾", swimming: "🏊", yoga: "🧘", rowing: "🚣",
};

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [sleep, setSleep] = useState<Sleep[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [weightRange, setWeightRange] = useState<30 | 90 | 173>(30);

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
    const since30 = new Date();
    since30.setDate(since30.getDate() - 173);
    const sinceStr = since30.toISOString().split("T")[0];

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

  // Bloc 1 computations
  const last30Metrics = metrics.slice(-30);
  const todayMetric = metrics[metrics.length - 1];
  const avg30HR = last30Metrics.filter(m => m.resting_hr).reduce((s, m) => s + m.resting_hr!, 0) / (last30Metrics.filter(m => m.resting_hr).length || 1);
  const avg30HRV = last30Metrics.filter(m => m.hrv).reduce((s, m) => s + m.hrv!, 0) / (last30Metrics.filter(m => m.hrv).length || 1);
  const lastSleep = sleep[sleep.length - 1];
  const latestWeight = [...metrics].reverse().find(m => m.weight != null);

  const hrSignal = signal(todayMetric?.resting_hr, avg30HR, false);
  const hrvSignal = signal(todayMetric?.hrv, avg30HRV, true);
  const sleepSignal: Signal = lastSleep ? (lastSleep.duration_hours >= 7 ? "green" : lastSleep.duration_hours >= 6 ? "orange" : "red") : "green";

  // Bloc 2 computations
  const now = new Date();
  const last7Activities = activities.filter(a => {
    const d = new Date(a.date);
    return (now.getTime() - d.getTime()) / 86400000 <= 7;
  });
  const last30Activities = activities.filter(a => {
    const d = new Date(a.date);
    return (now.getTime() - d.getTime()) / 86400000 <= 30;
  });

  const cardioTypes = ["cycling", "running", "rowing", "windsurfing_v2", "swimming", "walking", "hiking"];
  const cardio7 = last7Activities.filter(a => cardioTypes.includes(a.type)).length;
  const muscu7 = last7Activities.filter(a => a.type === "strength_training").length;
  const cardio30 = last30Activities.filter(a => cardioTypes.includes(a.type)).length;
  const muscu30 = last30Activities.filter(a => a.type === "strength_training").length;

  const intensityCount = { low: 0, medium: 0, high: 0 };
  last7Activities.forEach(a => {
    if (a.intensity === "low") intensityCount.low++;
    else if (a.intensity === "medium") intensityCount.medium++;
    else if (a.intensity === "high") intensityCount.high++;
  });

  let chargeMessage = "";
  if (cardio7 < 3) chargeMessage = "En dessous du rythme cible — 3 cardio/semaine minimum";
  else if (last7Activities.length >= 6) chargeMessage = "Semaine chargée — pense à récupérer";
  else chargeMessage = "Bon rythme cette semaine";

  const chargeSignal: Signal = cardio7 < 3 ? "orange" : last7Activities.length >= 6 ? "orange" : "green";

  // Bloc 3 — weight data
  const weightData = metrics
    .filter(m => m.weight != null)
    .slice(weightRange === 30 ? -30 : weightRange === 90 ? -90 : 0)
    .map((m, i, arr) => {
      const window = arr.slice(Math.max(0, i - 6), i + 1);
      const avg = window.reduce((s, w) => s + w.weight!, 0) / window.length;
      return { date: m.date, weight: m.weight, avg: Math.round(avg * 10) / 10 };
    });

  // Bloc 4 — timeline
  type TimelineItem = { date: string; sortKey: string; type: "activity" | "journal" | "sleep"; content: string; meta?: string; icon: string };
  const timeline: TimelineItem[] = [];

  activities.slice(0, 30).forEach(a => {
    timeline.push({
      date: a.date,
      sortKey: a.date,
      type: "activity",
      content: `${a.type.replace(/_/g, " ")} — ${a.duration_minutes} min`,
      meta: a.intensity ? `${a.intensity} · ${a.calories} kcal` : `${a.calories} kcal`,
      icon: activityIcons[a.type] || "🏅",
    });
  });

  journal.forEach(j => {
    const catIcons: Record<string, string> = { sport: "🏃", psy: "🧠", medical: "🩺", quotidien: "📝" };
    timeline.push({
      date: j.created_at.split("T")[0],
      sortKey: j.created_at,
      type: "journal",
      content: j.content.length > 80 ? j.content.slice(0, 80) + "…" : j.content,
      meta: j.category,
      icon: catIcons[j.category] || "📝",
    });
  });

  sleep.slice(-14).forEach(s => {
    timeline.push({
      date: s.date,
      sortKey: s.date + "T06:00:00",
      type: "sleep",
      content: `${s.duration_hours}h — ${s.quality || "?"}`,
      meta: s.deep_sleep_minutes ? `${s.deep_sleep_minutes} min profond · ${s.rem_sleep_minutes || 0} min REM` : undefined,
      icon: "😴",
    });
  });

  timeline.sort((a, b) => b.sortKey.localeCompare(a.sortKey));

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
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="p-2 rounded-full text-on-surface-variant hover:bg-surface-container transition-colors disabled:opacity-50"
            title="Sync Garmin"
          >
            <svg className={`w-5 h-5 ${syncing ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182M20.016 4.356v4.992" />
            </svg>
          </button>
        </div>
      </div>

      {/* Bloc 1 — État du corps */}
      <div className="bg-surface-container-low rounded-3xl p-4 space-y-3">
        <h2 className="text-sm font-medium text-on-surface-variant">État du corps</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className={`rounded-2xl p-3 ${signalColors[hrSignal]}`}>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${signalDots[hrSignal]}`} />
              <span className="text-xs font-medium">FC repos</span>
            </div>
            <p className="text-xl font-semibold mt-1">{todayMetric?.resting_hr ?? "—"} <span className="text-xs font-normal">bpm</span></p>
            <p className="text-xs opacity-70">moy 30j : {Math.round(avg30HR)}</p>
          </div>

          <div className={`rounded-2xl p-3 ${signalColors[hrvSignal]}`}>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${signalDots[hrvSignal]}`} />
              <span className="text-xs font-medium">HRV</span>
            </div>
            <p className="text-xl font-semibold mt-1">{todayMetric?.hrv ?? "—"} <span className="text-xs font-normal">ms</span></p>
            <p className="text-xs opacity-70">moy 30j : {Math.round(avg30HRV)}</p>
          </div>

          <div className={`rounded-2xl p-3 ${signalColors[sleepSignal]}`}>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${signalDots[sleepSignal]}`} />
              <span className="text-xs font-medium">Sommeil</span>
            </div>
            <p className="text-xl font-semibold mt-1">{lastSleep?.duration_hours ?? "—"} <span className="text-xs font-normal">h</span></p>
            <p className="text-xs opacity-70">{lastSleep?.quality || "—"}</p>
          </div>

          <div className={`rounded-2xl p-3 ${latestWeight?.weight && latestWeight.weight <= WEIGHT_TARGET ? signalColors.green : latestWeight?.weight && latestWeight.weight <= WEIGHT_TARGET + 1 ? signalColors.orange : signalColors.red}`}>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${latestWeight?.weight && latestWeight.weight <= WEIGHT_TARGET ? signalDots.green : latestWeight?.weight && latestWeight.weight <= WEIGHT_TARGET + 1 ? signalDots.orange : signalDots.red}`} />
              <span className="text-xs font-medium">Poids</span>
            </div>
            <p className="text-xl font-semibold mt-1">{latestWeight?.weight ?? "—"} <span className="text-xs font-normal">kg</span></p>
            <p className="text-xs opacity-70">objectif : {WEIGHT_TARGET} kg</p>
          </div>
        </div>
      </div>

      {/* Bloc 2 — Charge d'entraînement */}
      <div className="bg-surface-container-low rounded-3xl p-4 space-y-3">
        <h2 className="text-sm font-medium text-on-surface-variant">Charge d'entraînement</h2>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <p className="text-xs text-on-surface-variant">7 derniers jours</p>
            <div className="flex gap-3">
              <div>
                <p className="text-xl font-semibold">{cardio7}</p>
                <p className="text-xs text-on-surface-variant">cardio</p>
              </div>
              <div>
                <p className="text-xl font-semibold">{muscu7}</p>
                <p className="text-xs text-on-surface-variant">muscu</p>
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs text-on-surface-variant">30 derniers jours</p>
            <div className="flex gap-3">
              <div>
                <p className="text-xl font-semibold">{cardio30}</p>
                <p className="text-xs text-on-surface-variant">cardio</p>
              </div>
              <div>
                <p className="text-xl font-semibold">{muscu30}</p>
                <p className="text-xs text-on-surface-variant">muscu</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          {(["low", "medium", "high"] as const).map(level => (
            <div key={level} className="flex-1 rounded-xl bg-surface-container p-2 text-center">
              <p className="text-lg font-semibold">{intensityCount[level]}</p>
              <p className="text-xs text-on-surface-variant">{level === "low" ? "basse" : level === "medium" ? "moyenne" : "haute"}</p>
            </div>
          ))}
        </div>

        <div className={`rounded-xl px-3 py-2 text-sm ${signalColors[chargeSignal]}`}>
          {chargeMessage}
        </div>
      </div>

      {/* Bloc 3 — Tendance poids */}
      {weightData.length > 0 && (
        <div className="bg-surface-container-low rounded-3xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-on-surface-variant">Tendance poids</h2>
            <div className="flex gap-1 bg-surface-container rounded-full p-1">
              {([30, 90, 173] as const).map(r => (
                <button
                  key={r}
                  onClick={() => setWeightRange(r)}
                  className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
                    weightRange === r ? "bg-primary text-on-primary" : "text-on-surface-variant"
                  }`}
                >
                  {r === 173 ? "tout" : `${r}j`}
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={weightData}>
              <XAxis dataKey="date" tickFormatter={formatDate} fontSize={11} tick={{ fill: "#74796d" }} />
              <YAxis domain={["dataMin - 1", "dataMax + 1"]} fontSize={11} tick={{ fill: "#74796d" }} />
              <Tooltip labelFormatter={(d) => formatDate(String(d))} />
              <ReferenceLine y={WEIGHT_TARGET} stroke="#5e8b7e" strokeDasharray="6 3" label={{ value: `${WEIGHT_TARGET}`, position: "right", fill: "#5e8b7e", fontSize: 11 }} />
              <Line dataKey="weight" stroke="#c4c8ba" strokeWidth={1} dot={{ r: 2, fill: "#c4c8ba" }} name="Poids" />
              <Line dataKey="avg" stroke="#5e8b7e" strokeWidth={2} dot={false} name="Moy. 7j" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Bloc 4 — Timeline unifiée */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-on-surface-variant px-1">Timeline</h2>
        {timeline.slice(0, 30).map((item, i) => {
          const showDate = i === 0 || timeline[i - 1].date !== item.date;
          return (
            <div key={`${item.sortKey}-${i}`}>
              {showDate && (
                <p className="text-xs font-medium text-on-surface-variant mt-4 mb-1 px-1">
                  {formatDate(item.date)}
                </p>
              )}
              <div className={`rounded-2xl px-4 py-3 flex gap-3 items-start ${
                item.type === "activity" ? "bg-surface-container-low" :
                item.type === "journal" ? "bg-primary-container/40" :
                "bg-secondary-container/40"
              }`}>
                <span className="text-lg mt-0.5">{item.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm">{item.content}</p>
                  {item.meta && <p className="text-xs text-on-surface-variant mt-0.5">{item.meta}</p>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
