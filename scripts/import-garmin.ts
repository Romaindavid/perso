import { createClient } from "@supabase/supabase-js";
import Database from "better-sqlite3";
import { readFileSync } from "fs";
import { resolve } from "path";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const HOME = process.env.HOME!;
const DB_PATH = resolve(HOME, "HealthData/DBs/garmin.db");
const ACTIVITIES_JSON = resolve(HOME, "HealthData/activities_json/activities.json");

async function getUser() {
  const { data } = await supabase.auth.admin.listUsers();
  const user = data?.users?.[0];
  if (!user) throw new Error("No user found in Supabase");
  console.log(`Using user: ${user.email} (${user.id})`);
  return user.id;
}

async function importSleep(userId: string) {
  const db = new Database(DB_PATH, { readonly: true });
  const rows = db.prepare(`
    SELECT day, total_sleep, deep_sleep, rem_sleep, qualifier
    FROM sleep WHERE day >= '2026-01-01' ORDER BY day
  `).all() as Array<{
    day: string; total_sleep: string; deep_sleep: string;
    rem_sleep: string; qualifier: string;
  }>;
  db.close();

  function timeToMinutes(t: string | null): number | null {
    if (!t) return null;
    const parts = t.split(":");
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
  }

  const records = rows.map((r) => ({
    user_id: userId,
    date: r.day.split(" ")[0],
    duration_hours: Math.round(((timeToMinutes(r.total_sleep) || 0) / 60) * 100) / 100,
    quality: r.qualifier || null,
    deep_sleep_minutes: timeToMinutes(r.deep_sleep),
    rem_sleep_minutes: timeToMinutes(r.rem_sleep),
  }));

  for (let i = 0; i < records.length; i += 50) {
    const batch = records.slice(i, i + 50);
    const { error } = await supabase.from("garmin_sleep").upsert(batch, { onConflict: "user_id,date" });
    if (error) console.error("Sleep error:", error.message);
  }
  console.log(`Sleep: ${records.length} rows imported`);
}

async function importMetrics(userId: string) {
  const db = new Database(DB_PATH, { readonly: true });

  const rhr = db.prepare(`
    SELECT day, resting_heart_rate FROM resting_hr WHERE day >= '2026-01-01'
  `).all() as Array<{ day: string; resting_heart_rate: number }>;

  const hrv = db.prepare(`
    SELECT day, weekly_avg, status FROM hrv WHERE day >= '2026-01-01'
  `).all() as Array<{ day: string; weekly_avg: number; status: string }>;

  const weight = db.prepare(`
    SELECT day, weight FROM weight WHERE day >= '2026-01-01'
  `).all() as Array<{ day: string; weight: number }>;

  db.close();

  const byDate = new Map<string, { resting_hr: number | null; hrv: number | null; weight: number | null }>();

  for (const r of rhr) {
    const d = r.day.split(" ")[0];
    byDate.set(d, { resting_hr: r.resting_heart_rate, hrv: null, weight: null });
  }
  for (const r of hrv) {
    const d = r.day.split(" ")[0];
    const existing = byDate.get(d) || { resting_hr: null, hrv: null, weight: null };
    existing.hrv = r.weekly_avg;
    byDate.set(d, existing);
  }
  for (const r of weight) {
    const d = r.day.split(" ")[0];
    const existing = byDate.get(d) || { resting_hr: null, hrv: null, weight: null };
    existing.weight = r.weight;
    byDate.set(d, existing);
  }

  const records = Array.from(byDate.entries()).map(([date, m]) => ({
    user_id: userId,
    date,
    resting_hr: m.resting_hr,
    hrv: m.hrv,
    weight: m.weight,
  }));

  for (let i = 0; i < records.length; i += 50) {
    const batch = records.slice(i, i + 50);
    const { error } = await supabase.from("garmin_metrics").upsert(batch, { onConflict: "user_id,date" });
    if (error) console.error("Metrics error:", error.message);
  }
  console.log(`Metrics: ${records.length} rows imported`);
}

async function importActivities(userId: string) {
  const raw = JSON.parse(readFileSync(ACTIVITIES_JSON, "utf-8"));

  const records = raw
    .filter((a: any) => a.startTimeLocal >= "2026-01-01")
    .map((a: any) => ({
      user_id: userId,
      date: a.startTimeLocal?.split(" ")[0] || a.startTimeLocal?.split("T")[0],
      type: a.activityType?.typeKey || a.activityName || "unknown",
      duration_minutes: Math.round((a.duration || 0) / 60),
      intensity: a.averageHR
        ? a.averageHR > 150 ? "high" : a.averageHR > 120 ? "medium" : "low"
        : null,
      calories: a.calories || 0,
    }));

  for (let i = 0; i < records.length; i += 50) {
    const batch = records.slice(i, i + 50);
    const { error } = await supabase.from("garmin_activities").insert(batch);
    if (error) console.error("Activities error:", error.message);
  }
  console.log(`Activities: ${records.length} rows imported`);
}

async function main() {
  const userId = await getUser();
  await importSleep(userId);
  await importMetrics(userId);
  await importActivities(userId);
  console.log("Done!");
}

main().catch(console.error);
