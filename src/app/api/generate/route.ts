import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateWithContext } from "@/lib/claude";
import type { GenerationType } from "@/types";

const BASE_PROMPTS: Record<GenerationType, string> = {
  sport: process.env.SPORT_SYSTEM_PROMPT || `Tu es un coach sportif personnel.
Tu génères des séances adaptées à l'état physique actuel de l'utilisateur.
Sois concret : exercices, séries, repos, tempo. Adapte l'intensité.`,

  psy: process.env.PSY_SYSTEM_PROMPT || `Tu es un compagnon bienveillant pour un bilan psychologique personnel.
Tu lis les entrées journal de l'utilisateur et en fais une synthèse empathique.
Identifie les tendances, les thèmes récurrents, l'évolution de l'humeur.
Ne joue pas au thérapeute — reflète ce que tu observes.`,

  medical: `Tu es un assistant qui prépare un résumé santé pour consultation médicale.
Tu compiles les données objectives (Garmin) et les notes subjectives (journal médical).
Format structuré : métriques clés, symptômes reportés, tendances.`,
};

function buildProfileContext(profile: Record<string, unknown> | null, type: GenerationType): string {
  if (!profile) return "";

  const parts: string[] = ["## Profil utilisateur"];

  const age = profile.birth_date
    ? Math.floor((Date.now() - new Date(profile.birth_date as string).getTime()) / 31557600000)
    : null;

  if (age) parts.push(`Âge : ${age} ans`);
  if (profile.height_cm) parts.push(`Taille : ${(profile.height_cm as number) / 100}m`);
  if (profile.gender) parts.push(`Genre : ${profile.gender === "male" ? "Homme" : "Femme"}`);
  if (profile.weight_auto) parts.push(`Poids actuel : ${profile.weight_auto} kg (auto Garmin)`);

  if (type === "sport" || type === "medical") {
    const bodyFat = profile.body_fat_auto || profile.body_fat_pct;
    const muscleMass = profile.muscle_mass_auto || profile.skeletal_muscle_kg;
    if (bodyFat) parts.push(`Masse grasse : ${bodyFat}%`);
    if (muscleMass) parts.push(`Masse musc. squelettique : ${muscleMass} kg`);
    const hrRest = profile.hr_rest_auto || profile.hr_rest;
    if (hrRest) parts.push(`FC repos : ${hrRest} bpm`);
    if (profile.hr_max) parts.push(`FC max : ${profile.hr_max} bpm`);
    if (profile.hrv_auto) parts.push(`HRV : ${profile.hrv_auto} ms`);
  }

  if (type === "sport") {
    if (profile.sport_goals) parts.push(`\n## Objectifs\n${profile.sport_goals}`);
    if (profile.sport_equipment) parts.push(`\n## Matériel disponible\n${profile.sport_equipment}`);
    if (profile.sport_routine) parts.push(`\n## Routine quotidienne (DÉJÀ FAITE — NE PAS inclure)\n${profile.sport_routine}`);
  }

  if (type === "medical") {
    const boneMass = profile.bone_mass_auto || profile.bone_mass_kg;
    const waterPct = profile.water_pct_auto || profile.water_pct;
    if (boneMass) parts.push(`Masse osseuse : ${boneMass} kg`);
    if (waterPct) parts.push(`Masse hydrique : ${waterPct}%`);
    if (profile.medical_notes) parts.push(`\n## Notes médicales\n${profile.medical_notes}`);
  }

  return parts.join("\n");
}

async function getContext(type: GenerationType, supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const since = new Date();
  since.setDate(since.getDate() - 14);
  const sinceStr = since.toISOString().split("T")[0];

  const parts: string[] = [];

  // Fetch profile + latest Garmin data
  const [{ data: profile }, { data: latestWeight }, { data: latestMetric }, { data: latestBody }] = await Promise.all([
    supabase.from("user_profile").select("*").eq("id", userId).single(),
    supabase.from("garmin_metrics").select("weight").not("weight", "is", null).order("date", { ascending: false }).limit(1).single(),
    supabase.from("garmin_metrics").select("resting_hr, hrv").not("resting_hr", "is", null).order("date", { ascending: false }).limit(1).single(),
    supabase.from("garmin_metrics").select("body_fat_pct, muscle_mass_kg, bone_mass_kg, water_pct").not("body_fat_pct", "is", null).order("date", { ascending: false }).limit(1).single(),
  ]);

  const profileWithAuto = profile ? {
    ...profile,
    weight_auto: latestWeight?.weight,
    hr_rest_auto: latestMetric?.resting_hr,
    hrv_auto: latestMetric?.hrv,
    body_fat_auto: latestBody?.body_fat_pct,
    muscle_mass_auto: latestBody?.muscle_mass_kg,
    bone_mass_auto: latestBody?.bone_mass_kg,
    water_pct_auto: latestBody?.water_pct,
  } : null;
  const profileContext = buildProfileContext(profileWithAuto, type);
  if (profileContext) parts.push(profileContext);

  if (type === "sport" || type === "medical") {
    const [{ data: activities }, { data: sleep }, { data: metrics }] = await Promise.all([
      supabase.from("garmin_activities").select("*").gte("date", sinceStr).order("date", { ascending: false }),
      supabase.from("garmin_sleep").select("*").gte("date", sinceStr).order("date", { ascending: false }),
      supabase.from("garmin_metrics").select("*").gte("date", sinceStr).order("date", { ascending: false }),
    ]);

    if (activities?.length) parts.push(`## Activités récentes\n${JSON.stringify(activities, null, 2)}`);
    if (sleep?.length) parts.push(`## Sommeil récent\n${JSON.stringify(sleep, null, 2)}`);
    if (metrics?.length) parts.push(`## Métriques récentes\n${JSON.stringify(metrics, null, 2)}`);
  }

  const categoryFilter = type === "sport"
    ? ["sport", "quotidien"]
    : type === "psy"
    ? ["psy", "quotidien"]
    : ["medical"];

  const { data: entries } = await supabase
    .from("journal_entries")
    .select("*")
    .in("category", categoryFilter)
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false });

  if (entries?.length) parts.push(`## Entrées journal\n${JSON.stringify(entries, null, 2)}`);

  return parts.join("\n\n---\n\n");
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const body = await request.json();
  const type = body.type as GenerationType;

  if (!BASE_PROMPTS[type]) {
    return NextResponse.json({ error: "Type invalide" }, { status: 400 });
  }

  const context = await getContext(type, supabase, user.id);

  let userMessage = context ? `Voici mon contexte:\n\n${context}` : "Je n'ai pas encore de données.";

  if (type === "sport") {
    userMessage += `\n\nTemps disponible : ${body.duration || 45} minutes\nÉnergie du jour : ${body.energy || 3}/5`;
  }

  if (body.context) {
    userMessage += `\n\nContexte supplémentaire : ${body.context}`;
  }

  userMessage += `\n\nGénère ${
    type === "sport" ? "une séance adaptée" : type === "psy" ? "un bilan" : "un rapport médical"
  }.`;

  const result = await generateWithContext(BASE_PROMPTS[type], userMessage);

  return NextResponse.json({ result });
}
