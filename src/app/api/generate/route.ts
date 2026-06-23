import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateWithContext } from "@/lib/claude";
import type { GenerationType } from "@/types";

const SYSTEM_PROMPTS: Record<GenerationType, string> = {
  sport: `Tu es un coach sportif personnel. Tu connais bien l'utilisateur et ses données.
Tu génères des séances adaptées à son état physique actuel (données Garmin), son sommeil récent, et son niveau d'énergie du jour.
Sois concret : exercices, séries, repos. Adapte l'intensité.`,

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
