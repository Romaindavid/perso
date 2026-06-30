import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateWithContext } from "@/lib/claude";

const SYSTEM_PROMPT = `Tu es un assistant qui rédige un récap hebdomadaire personnel à partir de données de santé, journal et tâches.

Objectif double :
- Clarté : résumé factuel, lisible en 2-3 minutes MAXIMUM pour l'ensemble du document — vise plus court que ce que tu penses suffisant
- Insight : faire émerger des associations entre les sources (sommeil ↔ humeur, charge sportive ↔ énergie, tâches accomplies ↔ satisfaction) — pas un dashboard de chiffres bruts

Ton : direct, factuel et honnête. Pas de coaching artificiel, pas de ton motivationnel creux, pas de jugement de performance.

Forme :
- Un seul emoji discret en préfixe de chaque titre de section, aucun emoji dans le corps du texte
- Phrases courtes, listes à puces plutôt que paragraphes denses
- Pas de reconstitution jour par jour — synthétise

Structure markdown stricte, avec ces sections exactes :

## 📍 En un coup d'œil
3-4 lignes, résumé ultra-condensé.

## 💪 Activité physique & corps
Chiffres clés uniquement (sommeil moyen, FC, charge sportive, poids si pesée) — pas de détail jour par jour, c'est déjà dans Garmin.
Indique en première ligne : "Renforcement musculaire : X/7 jours" (donnée fournie dans le contexte, ne pas recalculer).

## 📓 Journal & état d'esprit
Tonalité dominante + 1-2 faits marquants. Pas de reconstitution jour par jour.

## ✅ Productivité perso
Tâches faites / loupées, en bref.

## 🔍 Schémas détectés
Maximum 2-3 observations, et UNIQUEMENT celles qui se confirment ou s'infirment à la lumière de l'historique des semaines précédentes fourni en contexte — une corrélation vue sur 7 jours seuls n'est pas un schéma, c'est une anecdote, ne la mentionne pas ici.
Formule-les explicitement comme des associations observées, jamais comme des liens de causalité (ex: "X et Y coïncident cette semaine et la semaine du..." plutôt que "X cause Y").
Si rien ne se confirme sur plusieurs semaines, dis-le franchement et ne force pas une observation.

## 🧭 Questions à creuser
2-3 questions maximum. Psychologiques et introspectives, jamais descriptives — pas de question dont la réponse est déjà dans les données.
Doivent pointer un angle mort réel ou une tension repérée dans les données de la semaine ou en comparaison avec l'historique — pas une reformulation d'un fait déjà énoncé plus haut.
Ce sont des amorces de réflexion, pas un récapitulatif déguisé.

Réponds uniquement avec ce markdown, rien avant ni après.

Après le markdown, ajoute un séparateur "---SUMMARY---" suivi d'un résumé compact de 5 à 10 lignes en texte brut (pas de markdown) de cette semaine : moyennes clés (sommeil, charge sportive, poids si dispo), tonalité dominante du journal, taux de réussite renforcement musculaire (X/7). Ce résumé sert de mémoire pour les semaines futures, sois dense et factuel.`;

function mondayOf(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

interface Activity {
  date: string;
  type: string;
  duration_minutes: number;
  intensity: string | null;
  calories: number;
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
  const dateEnd = nowIso.split("T")[0];

  const [
    { data: activities },
    { data: sleep },
    { data: metrics },
    { data: journalEntries },
    { data: completedTodos },
    { data: completedTasks },
    { data: pastRecaps },
  ] = await Promise.all([
    supabase.from("garmin_activities").select("*").gte("date", weekStartStr).lte("date", dateEnd).order("date"),
    supabase.from("garmin_sleep").select("*").gte("date", weekStartStr).lte("date", dateEnd).order("date"),
    supabase.from("garmin_metrics").select("*").gte("date", weekStartStr).lte("date", dateEnd).order("date"),
    supabase.from("journal_entries").select("*").gte("created_at", weekStart.toISOString()).lte("created_at", nowIso).order("created_at"),
    supabase.from("project_todos").select("*, projects(name)").eq("done", true).gte("completed_at", weekStart.toISOString()).lte("completed_at", nowIso),
    supabase.from("tasks").select("*").eq("done", true).gte("completed_at", weekStart.toISOString()).lte("completed_at", nowIso),
    supabase.from("weekly_recaps").select("week_start, compact_summary").order("week_start", { ascending: false }).limit(8),
  ]);

  const allActivities: Activity[] = activities || [];
  const isRoutine = (a: Activity) => a.type === "strength_training" && a.duration_minutes < 10;
  const isMuscu = (a: Activity) => a.type === "strength_training" && a.duration_minutes >= 10;
  const cardioActivities = allActivities.filter(a => a.type !== "strength_training");
  const muscuActivities = allActivities.filter(isMuscu);
  const routineDays = new Set(allActivities.filter(isRoutine).map(a => a.date));

  const parts: string[] = [];

  parts.push(`## Renforcement musculaire (routine quotidienne)\nJours réussis : ${routineDays.size}/7\nJours : ${[...routineDays].sort().join(", ") || "aucun"}`);

  if (cardioActivities.length) parts.push(`## Activités cardio\n${JSON.stringify(cardioActivities, null, 2)}`);
  if (muscuActivities.length) parts.push(`## Séances de musculation (≥10 min)\n${JSON.stringify(muscuActivities, null, 2)}`);
  if (sleep?.length) parts.push(`## Sommeil\n${JSON.stringify(sleep, null, 2)}`);
  if (metrics?.length) parts.push(`## Métriques (poids, FC, HRV)\n${JSON.stringify(metrics, null, 2)}`);
  if (journalEntries?.length) parts.push(`## Entrées journal\n${JSON.stringify(journalEntries, null, 2)}`);

  const tasksDone = [
    ...(completedTodos || []).map((t: any) => ({ content: t.content, project: t.projects?.name })),
    ...(completedTasks || []).map((t: any) => ({ content: t.content, tag: t.tag })),
  ];
  if (tasksDone.length) parts.push(`## Tâches complétées\n${JSON.stringify(tasksDone, null, 2)}`);

  if (pastRecaps?.length) {
    const history = pastRecaps
      .map((r: any) => `Semaine du ${r.week_start} :\n${r.compact_summary || "(pas de résumé)"}`)
      .join("\n\n");
    parts.push(`## Historique des semaines précédentes (pour contextualiser les schémas — comparer, pas répéter)\n${history}`);
  }

  if (parts.length <= 1 && !journalEntries?.length && !tasksDone.length) {
    return NextResponse.json({ error: "Aucune donnée cette semaine pour générer un récap" }, { status: 400 });
  }

  const userMessage = `Voici les données de la semaine du ${weekStartStr} (lundi 00h00) au ${dateEnd} :\n\n${parts.join("\n\n---\n\n")}\n\nGénère le récap hebdomadaire.`;

  const raw = await generateWithContext(SYSTEM_PROMPT, userMessage);
  const [content, compactSummary] = raw.split("---SUMMARY---").map(s => s.trim());

  const { data: saved, error } = await supabase
    .from("weekly_recaps")
    .insert({
      user_id: user.id,
      week_start: weekStartStr,
      week_end: dateEnd,
      content: content || raw,
      compact_summary: compactSummary || null,
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
