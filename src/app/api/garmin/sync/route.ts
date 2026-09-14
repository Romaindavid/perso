import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { GarminConnect } from "garmin-connect";

export const maxDuration = 60;

async function getLastDate(supabase: any, table: string): Promise<string> {
  const { data } = await supabase
    .from(table)
    .select("date")
    .order("date", { ascending: false })
    .limit(1);
  if (data?.[0]?.date) return data[0].date;
  return "2026-01-01";
}

function daysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  const current = new Date(from + "T00:00:00");
  const end = new Date(to + "T00:00:00");
  while (current <= end) {
    days.push(current.toISOString().split("T")[0]);
    current.setDate(current.getDate() + 1);
  }
  return days;
}

// Garmin sometimes logs a real sport (e.g. wing foiling) under the generic
// "other" typeKey when the watch wasn't set to the matching activity profile.
// The human-readable activityName still names it, so recover the sport from
// there rather than leaving it uselessly generic.
function resolveActivityType(typeKey: string, activityName: string | undefined): string {
  if (typeKey !== "other" && typeKey !== "unknown") return typeKey;
  const name = (activityName || "").toLowerCase();
  if (name.includes("wingfoil") || name.includes("wing foil") || /\bwing\b/.test(name)) return "wingfoiling";
  return typeKey;
}

async function runSync(supabase: any, userId: string) {
  const garminEmail = process.env.GARMIN_EMAIL;
  const garminPassword = process.env.GARMIN_PASSWORD;
  if (!garminEmail || !garminPassword) {
    throw new Error("Garmin credentials not configured");
  }

  const GCClient = new GarminConnect({
    username: garminEmail,
    password: garminPassword,
  });
  await GCClient.login();

  const today = new Date().toISOString().split("T")[0];
  const [lastSleep, lastMetrics, lastActivity] = await Promise.all([
    getLastDate(supabase, "garmin_sleep"),
    getLastDate(supabase, "garmin_metrics"),
    getLastDate(supabase, "garmin_activities"),
  ]);

  const stats = { sleep: 0, metrics: 0, activities: 0 };

  // Sync sleep
  const sleepDays = daysBetween(lastSleep, today);
  for (const day of sleepDays) {
    try {
      const sleep = await GCClient.getSleepData(new Date(day));
      const ds = sleep?.dailySleepDTO;
      if (ds?.sleepTimeSeconds) {
        await supabase.from("garmin_sleep").upsert({
          user_id: userId,
          date: day,
          duration_hours: Math.round((ds.sleepTimeSeconds / 3600) * 100) / 100,
          deep_sleep_minutes: ds.deepSleepSeconds ? Math.round(ds.deepSleepSeconds / 60) : null,
          rem_sleep_minutes: ds.remSleepSeconds ? Math.round(ds.remSleepSeconds / 60) : null,
          quality: (ds as any).sleepScores?.overall?.qualifierKey || (ds as any).sleepScoreQualifier || null,
        }, { onConflict: "user_id,date" });
        stats.sleep++;
      }
    } catch { /* skip day */ }
  }

  // Sync metrics (HR, weight, body composition)
  const metricsDays = daysBetween(lastMetrics, today);
  for (const day of metricsDays) {
    const m: Record<string, any> = {
      user_id: userId, date: day,
      resting_hr: null, hrv: null, weight: null,
      body_fat_pct: null, muscle_mass_kg: null, bone_mass_kg: null, water_pct: null,
    };
    try {
      const hr = await GCClient.getHeartRate(new Date(day));
      if (hr?.restingHeartRate) m.resting_hr = hr.restingHeartRate;
    } catch { /* skip */ }
    try {
      const hrvData = await GCClient.get<any>(`https://connectapi.garmin.com/hrv-service/hrv/${day}`);
      if (hrvData?.hrvSummary?.weeklyAvg) m.hrv = Math.round(hrvData.hrvSummary.weeklyAvg);
      else if (hrvData?.hrvSummary?.lastNightAvg) m.hrv = Math.round(hrvData.hrvSummary.lastNightAvg);
    } catch { /* skip */ }
    try {
      const w = await GCClient.getDailyWeightData(new Date(day));
      if (w?.totalAverage?.weight) m.weight = Math.round(w.totalAverage.weight / 1000 * 10) / 10;
      if (w?.totalAverage?.bodyFat) m.body_fat_pct = Math.round(w.totalAverage.bodyFat * 10) / 10;
      if (w?.totalAverage?.muscleMass) m.muscle_mass_kg = Math.round(w.totalAverage.muscleMass / 1000 * 10) / 10;
      if (w?.totalAverage?.boneMass) m.bone_mass_kg = Math.round(w.totalAverage.boneMass / 1000 * 10) / 10;
      if (w?.totalAverage?.bodyWater) m.water_pct = Math.round(w.totalAverage.bodyWater * 10) / 10;
    } catch { /* skip */ }
    if (m.resting_hr || m.weight) {
      await supabase.from("garmin_metrics").upsert(m, { onConflict: "user_id,date" });
      stats.metrics++;
    }
  }

  // Sync activities
  const activities = await GCClient.getActivities(0, 50);
  for (const a of activities) {
    const date = (a as any).startTimeLocal?.split(" ")[0] || (a as any).startTimeLocal?.split("T")[0];
    if (!date || date < lastActivity) continue;
    const avgHR = (a as any).averageHR;
    const record = {
      user_id: userId,
      date,
      type: resolveActivityType((a as any).activityType?.typeKey || "unknown", (a as any).activityName),
      duration_minutes: Math.round(((a as any).duration || 0) / 60),
      intensity: avgHR ? (avgHR > 150 ? "high" : avgHR > 120 ? "medium" : "low") : null,
      calories: (a as any).calories || 0,
    };
    // Check if already exists (same user, date, type, duration)
    const { data: existing } = await supabase
      .from("garmin_activities")
      .select("id")
      .eq("user_id", userId)
      .eq("date", date)
      .eq("type", record.type)
      .eq("duration_minutes", record.duration_minutes)
      .limit(1);
    if (!existing?.length) {
      await supabase.from("garmin_activities").insert(record);
      stats.activities++;
    }
  }

  return { stats, since: { sleep: lastSleep, metrics: lastMetrics, activities: lastActivity } };
}

// Manual sync — triggered by the refresh button in the Journal header, scoped to
// the logged-in user's own session.
export async function POST() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  try {
    const result = await runSync(supabase, user.id);
    return NextResponse.json({ ok: true, ...result });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Sync failed" }, { status: 500 });
  }
}

// Daily cron — Vercel sends a GET request and, since CRON_SECRET is set on the
// project, an `Authorization: Bearer <CRON_SECRET>` header automatically. No
// user session exists for a cron invocation, so this runs against the (single)
// account on file via the service-role client instead.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const { data: tokenRow } = await admin.from("google_tokens").select("user_id").limit(1).single();
  if (!tokenRow) return NextResponse.json({ error: "Aucun utilisateur" }, { status: 500 });

  try {
    const result = await runSync(admin, tokenRow.user_id);
    return NextResponse.json({ ok: true, ...result });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Sync failed" }, { status: 500 });
  }
}
