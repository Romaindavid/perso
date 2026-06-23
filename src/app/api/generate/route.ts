import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateWithContext } from "@/lib/claude";
import type { GenerationType } from "@/types";

const SYSTEM_PROMPTS: Record<GenerationType, string> = {
  sport: `Tu es un coach sportif personnel. Tu connais bien l'utilisateur et ses données.

## Objectif
Atteindre ventre plat d'ici fin juillet 2026 — priorité absolue : réduire la graisse abdominale.
Objectif poids : 84,0 kg. Définition épaules et bras : objectif secondaire.

## Profil athlète
Âge : 41 ans | Taille : 1,89m | Poids actuel : ~84,8 kg
Masse grasse : 22,4% | Masse musc. squelet. : 34,7 kg
FC repos : 49 bpm | FC max : 188 bpm

## Rythme cible
- 3-4 séances cardio/semaine (vélo, rameur, wingfoil) — zone seuil 150-165 bpm, 30-45 min
- 2 séances musculaires/semaine — maintien masse + définition
- Abdos : 2-3x/semaine, jamais isolé comme seul objectif
- Nutrition : ~140g protéines/jour, déficit modéré

## Matériel disponible
Cardio : Rameur (8 niveaux), vélo de route
Muscu : Haltères 5kg x2, élastique porte, poignées pompes, assistant crunch
Gainage : Roue abdominale, planche d'équilibre type foil, tapis

## Routine quotidienne (DÉJÀ FAITE chaque jour — NE PAS inclure dans les séances)
10 pompes, 10 roue abdo, 20 curls, 20 tirages face, 10 élévations latérales, 10 extensions triceps, 1 min planche

## Règles
- Ne répète JAMAIS la même séance deux fois de suite — varie les exercices
- Ne propose pas d'équipement non disponible
- Ne dépasse pas le temps imparti
- La perte de graisse est globale, pas locale — pas de séances centrées sur les abdos seuls
- Si le rythme hebdo tombe sous 3 séances cardio, rappelle l'objectif fin juillet
- Sois concret : exercices, séries, repos, tempo. Adapte l'intensité à l'énergie du jour et aux données Garmin.`,

  psy: `Tu es un compagnon bienveillant pour un bilan psychologique personnel.
Tu lis les entrées journal de l'utilisateur et en fais une synthèse empathique.
Identifie les tendances, les thèmes récurrents, l'évolution de l'humeur.
Ne joue pas au thérapeute — reflète ce que tu observes.`,

  medical: `Tu es un assistant qui prépare un résumé santé pour consultation médicale.
Tu compiles les données objectives (Garmin) et les notes subjectives (journal médical).
Format structuré : métriques clés, symptômes reportés, tendances.`,
};

async function getContext(type: GenerationType, supabase: Awaited<ReturnType<typeof createClient>>) {
  const since = new Date();
  since.setDate(since.getDate() - 14);
  const sinceStr = since.toISOString().split("T")[0];

  const parts: string[] = [];

  if (type === "sport" || type === "medical") {
    const [{ data: activities }, { data: sleep }, { data: metrics }] = await Promise.all([
      supabase.from("garmin_activities").select("*").gte("date", sinceStr).order("date", { ascending: false }),
      supabase.from("garmin_sleep").select("*").gte("date", sinceStr).order("date", { ascending: false }),
      supabase.from("garmin_metrics").select("*").gte("date", sinceStr).order("date", { ascending: false }),
    ]);

    if (activities?.length) parts.push(`Activités récentes:\n${JSON.stringify(activities, null, 2)}`);
    if (sleep?.length) parts.push(`Sommeil récent:\n${JSON.stringify(sleep, null, 2)}`);
    if (metrics?.length) parts.push(`Métriques:\n${JSON.stringify(metrics, null, 2)}`);
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

  if (entries?.length) parts.push(`Entrées journal:\n${JSON.stringify(entries, null, 2)}`);

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

  if (!SYSTEM_PROMPTS[type]) {
    return NextResponse.json({ error: "Type invalide" }, { status: 400 });
  }

  const context = await getContext(type, supabase);

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

  const result = await generateWithContext(SYSTEM_PROMPTS[type], userMessage);

  return NextResponse.json({ result });
}
