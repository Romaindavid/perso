"use client";

import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { createClient } from "@/lib/supabase/client";

interface DashboardData {
  date: string;
  resting_hr: number | null;
  hrv: number | null;
  sleep_hours: number | null;
  mood: number | null;
  stress: number | null;
  activity_minutes: number | null;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<7 | 14 | 30>(7);
  const [syncing, setSyncing] = useState(false);

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await fetch("/api/garmin/sync", { method: "POST" });
      const result = await res.json();
      if (result.ok) {
        load();
      }
    } catch { /* ignore */ }
    setSyncing(false);
  }

  async function load() {
      setLoading(true);
      const supabase = createClient();
      const since = new Date();
      since.setDate(since.getDate() - range);

      const [{ data: metrics }, { data: sleep }, { data: activities }] =
        await Promise.all([
          supabase
            .from("garmin_metrics")
            .select("*")
            .gte("date", since.toISOString().split("T")[0])
            .order("date"),
          supabase
            .from("garmin_sleep")
            .select("*")
            .gte("date", since.toISOString().split("T")[0])
            .order("date"),
          supabase
            .from("garmin_activities")
            .select("*")
            .gte("date", since.toISOString().split("T")[0])
            .order("date"),
        ]);

      const byDate = new Map<string, DashboardData>();

      metrics?.forEach((m) => {
        byDate.set(m.date, {
          date: m.date,
          resting_hr: m.resting_hr,
          hrv: m.hrv,
          sleep_hours: null,
          mood: null,
          stress: null,
          activity_minutes: null,
        });
      });

      sleep?.forEach((s) => {
        const existing = byDate.get(s.date) || {
          date: s.date,
          resting_hr: null,
          hrv: null,
          sleep_hours: null,
          mood: null,
          stress: null,
          activity_minutes: null,
        };
        existing.sleep_hours = s.duration_hours;
        byDate.set(s.date, existing);
      });

      activities?.forEach((a) => {
        const existing = byDate.get(a.date) || {
          date: a.date,
          resting_hr: null,
          hrv: null,
          sleep_hours: null,
          mood: null,
          stress: null,
          activity_minutes: null,
        };
        existing.activity_minutes =
          (existing.activity_minutes || 0) + a.duration_minutes;
        byDate.set(a.date, existing);
      });

      setData(
        Array.from(byDate.values()).sort((a, b) =>
          a.date.localeCompare(b.date)
        )
      );
      setLoading(false);
  }

  useEffect(() => {
    load();
  }, [range]);

  const formatDate = (d: string) => {
    const date = new Date(d + "T00:00:00");
    return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  };

  return (
    <div className="space-y-6">
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
        <div className="flex gap-1 bg-surface-container rounded-full p-1">
          {([7, 14, 30] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                range === r
                  ? "bg-primary text-on-primary"
                  : "text-on-surface-variant"
              }`}
            >
              {r}j
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : data.length === 0 ? (
        <div className="text-center py-20 text-on-surface-variant">
          <p className="text-lg">Aucune donnée</p>
          <p className="text-sm mt-1">
            Connecte Garmin ou ajoute une entrée journal
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="bg-surface-container-low rounded-3xl p-4">
            <h2 className="text-sm font-medium text-on-surface-variant mb-3">
              Activité & Sommeil
            </h2>
            <ResponsiveContainer width="100%" height={200}>
              <ComposedChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#c4c8ba" />
                <XAxis dataKey="date" tickFormatter={formatDate} fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip labelFormatter={(d) => formatDate(String(d))} />
                <Bar
                  dataKey="activity_minutes"
                  fill="#5e8b7e"
                  name="Activité (min)"
                  radius={[8, 8, 0, 0]}
                />
                <Line
                  dataKey="sleep_hours"
                  stroke="#a3b1a2"
                  name="Sommeil (h)"
                  strokeWidth={2}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-surface-container-low rounded-3xl p-4">
            <h2 className="text-sm font-medium text-on-surface-variant mb-3">
              FC repos & HRV
            </h2>
            <ResponsiveContainer width="100%" height={200}>
              <ComposedChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#c4c8ba" />
                <XAxis dataKey="date" tickFormatter={formatDate} fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip labelFormatter={(d) => formatDate(String(d))} />
                <Line
                  dataKey="resting_hr"
                  stroke="#ba1a1a"
                  name="FC repos"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  dataKey="hrv"
                  stroke="#5e8b7e"
                  name="HRV"
                  strokeWidth={2}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
