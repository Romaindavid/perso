import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateWithContext } from "@/lib/claude";

const SYSTEM_PROMPT = `Tu es un assistant qui rédige un récap hebdomadaire personnel à partir de données de santé, journal et tâches.

Objectif double :
- Clarté : résumé factuel de la semaine, lisible en 2-3 minutes
- Insight : faire émerger des schémas/corrélations entre les sources (sommeil ↔ humeur, charge sportive ↔ énergie, tâches accomplies ↔ satisfaction) — pas un dashboard de chiffres bruts

Ton : direct, factuel et honnête, y compris sur les points faibles. Pas de coaching artificiel, pas de ton motivationnel creux.

Structure markdown stricte, avec ces sections exactes :

## En un coup d'œil
3-4 lignes, résumé ultra-condensé.

## Activité physique & corps
Sport, sommeil, poids — faits marquants, pas une liste exhaustive de chiffres.

## Journal & état d'esprit
Tonalité dominante de la semaine, hauts et bas.

## Productivité perso
Tâches faites / loupées.

## Schémas détectés
Les croisements entre sources. Si rien de notable, dis-le franchement.

## Points forts de la semaine

## Points de vigilance

## Questions à creuser
Questions ouvertes, sans réponse toute faite — pour alimenter la réflexion. Pas de conseils déguisés en questions.

## Un enseignement clé
Une seule phrase. Force la priorisation, pas de liste.

Réponds uniquement avec ce markdown, rien avant ni après.`;

function mondayOf(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const now = body.weekStart ? new Date(body.weekStart + "T12:00:00") : new Date();
  const weekStart = mondayOf(now);
  const weekStartStr = weekStart.toISOString().split("T")[0];
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);
  const periodEnd = body.weekStart ? weekEnd : now;
  const nowIso = periodEnd.toISOString();

  const [
    { data: activities },
    { data: sleep },
    { data: metrics },
    { data: journalEntries },
    { data: completedTodos },
    { data: completedTasks },
    { data: pastRecaps },
  ] = await Promise.all([
    supabase.from("garmin_activities").select("*").gte("date", weekStartStr).lte("date", nowIso.split("T")[0]).order("date"),
    supabase.from("garmin_sleep").select("*").gte("date", weekStartStr).lte("date", nowIso.split("T")[0]).order("date"),
    supabase.from("garmin_metrics").select("*").gte("date", weekStartStr).lte("date", nowIso.split("T")[0]).order("date"),
    supabase.from("journal_entries").select("*").gte("created_at", weekStart.toISOString()).lte("created_at", nowIso).order("created_at"),
    supabase.from("project_todos").select("*, projects(name)").eq("done", true).gte("completed_at", weekStart.toISOString()).lte("completed_at", nowIso),
    supabase.from("tasks").select("*").eq("done", true).gte("completed_at", weekStart.toISOString()).lte("completed_at", nowIso),
    supabase.from("weekly_recaps").select("week_start, key_takeaway, watch_points").order("week_start", { ascending: false }).limit(3),
  ]);

  const parts: string[] = [];

  if (activities?.length) parts.push(`## Activités cardio\n${JSON.stringify(activities, null, 2)}`);
  if (sleep?.length) parts.push(`## Sommeil\n${JSON.stringify(sleep, null, 2)}`);
  if (metrics?.length) parts.push(`## Métriques (poids, FC, HRV)\n${JSON.stringify(metrics, null, 2)}`);
  if (journalEntries?.length) parts.push(`## Entrées journal\n${JSON.stringify(journalEntries, null, 2)}`);

  const tasksDone = [
    ...(completedTodos || []).map((t: any) => ({ content: t.content, project: t.projects?.name })),
    ...(completedTasks || []).map((t: any) => ({ content: t.content, tag: t.tag })),
  ];
  if (tasksDone.length) parts.push(`## Tâches complétées\n${JSON.stringify(tasksDone, null, 2)}`);

  if (pastRecaps?.length) {
    const continuity = pastRecaps
      .map((r: any) => `Semaine du ${r.week_start} — Enseignement: ${r.key_takeaway || "—"} | Vigilance: ${r.watch_points || "—"}`)
      .join("\n");
    parts.push(`## Fil conducteur des semaines précédentes (pour repérer une récurrence, ne pas répéter)\n${continuity}`);
  }

  if (parts.length === 0) {
    return NextResponse.json({ error: "Aucune donnée cette semaine pour générer un récap" }, { status: 400 });
  }

  const userMessage = `Voici les données de la semaine du ${weekStartStr} (lundi 00h00) au ${periodEnd.toISOString().split("T")[0]} :\n\n${parts.join("\n\n---\n\n")}\n\nGénère le récap hebdomadaire.`;

  const content = await generateWithContext(SYSTEM_PROMPT, userMessage);

  const keyTakeawayMatch = content.match(/## Un enseignement clé\s*\n+(.+)/);
  const watchPointsMatch = content.match(/## Points de vigilance\s*\n+([\s\S]*?)(?=\n##|$)/);

  const { data: saved, error } = await supabase
    .from("weekly_recaps")
    .insert({
      user_id: user.id,
      week_start: weekStartStr,
      week_end: periodEnd.toISOString().split("T")[0],
      content,
      key_takeaway: keyTakeawayMatch?.[1]?.trim() || null,
      watch_points: watchPointsMatch?.[1]?.trim().slice(0, 500) || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ recap: saved });
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { data } = await supabase
    .from("weekly_recaps")
    .select("*")
    .order("week_start", { ascending: false })
    .limit(20);

  return NextResponse.json({ recaps: data || [] });
}
