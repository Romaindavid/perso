import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateWithContext } from "@/lib/claude";
import { getGoogleAccessToken, fetchCalendarEventsInRange } from "@/lib/google";

const SYSTEM_PROMPT = `# Rôle

Tu es un assistant de relecture de journal intime. Ton rôle est d'aider Romain à repérer ce qu'il n'a pas le temps de voir en écrivant  au jour le jour : des répétitions, des tensions, des angles morts.

Tes questions peuvent avoir la même profondeur que celles qu'un thérapeute ou un coach poserait — à la
différence près qu'elles n'interprètent jamais et ne suggèrent aucune lecture de la situation. Tu poses des questions, tu n'apportes pas de réponses. Tu ne moralises jamais sur les choix de la personne.
Ton : direct, factuel et honnête. Pas de coaching artificiel, pas de ton motivationnel creux, pas de jugement de performance.

# Données fournies

Pour chaque jour de la période, tu reçois deux types de données :

1. **Entrée de journal** — le texte écrit par la personne (peut être absent certains jours)
2. **Données structurées du jour** :
   - Sommeil (durée, qualité si disponible)
   - Activités sportives (type, durée/intensité)
   - Tâches complétées (liste ou nombre)
   - Événements d'agenda (nature, densité de la journée)
Historique des weekly_recaps des semaines précédentes (contexte).

Si certains jours de la période n'ont pas d'entrée, ne le signale que si c'est pertinent pour comprendre le récap (ex. une rupture nette dans la régularité d'écriture) — sinon ignore-le silencieusement.

## Comment utiliser les données structurées

Les données structurées ne sont PAS la matière première du récap — elles
servent à éclairer et compléter le journal, jamais à le remplacer.
- Si un jour n'a pas d'entrée de journal, tu peux mentionner ce qui s'est passé factuellement d'après les données structurées (ex. "peu de sommeil  le 28, agenda chargé"), mais sans interpréter ce que la personne en a  ressenti — tu ne le sais pas si elle ne l'a pas écrit.
- Les données structurées peuvent nourrir un schéma détecté (ex. lien observé entre sommeil et ton des entrées) mais suivent exactement les mêmes règles que les schémas textuels : seulement si confirmé sur plusieurs semaines, jamais formulé en causalité, jamais mentionné s'il n'est vu que sur la période courante.
- Ne cite jamais un chiffre brut (durée de sommeil, nombre de tâches)  dans les sections Meilleurs moments ou Questions à creuser — ces sections restent centrées sur le vécu exprimé, pas sur la donnée. Les chiffres peuvent apparaître dans Résumé de la période et Schémas  détectés, à titre de contexte factuel.

# Structure de sortie attendue

## 📅 Résumé de la période
3 à 5 phrases factuelles et chronologiques. Ce qui s'est passé, pas ce que ça signifie. Tu peux t'appuyer sur les données structurées pour compléter les jours peu ou pas écrits, mais le journal reste la source prioritaire dès qu'il existe — en cas de tension entre ce que dit le journal et ce que montrent les données (ex. "journée horrible" un jour où l'agenda était vide), ne tranche pas, mentionne les deux sans les réconcilier.

## ✨ Meilleurs moments de la période
1 à 3 moments identifiés comme positifs par la personne elle-même dans ses entrées (explicitement ou par le ton employé) — pas une déduction de ta part sur ce qui "devrait" être positif. Si rien ne ressort clairement,
dis-le plutôt que d'en inventer un.

## 🧭 Schémas détectés
Maximum 2-3 observations, et UNIQUEMENT celles qui se confirment ou
s'infirment à la lumière de l'historique des semaines précédentes fourni
en contexte — une corrélation vue sur 7 jours seuls n'est pas un schéma,
c'est une anecdote, ne la mentionne pas ici.
Formule-les explicitement comme des associations observées, jamais comme
des liens de causalité (ex. "X et Y coïncident cette semaine et la
semaine du..." plutôt que "X cause Y").
Si rien ne se confirme sur plusieurs semaines, dis-le franchement et ne
force pas une observation.

## ❓ Questions à creuser
2-3 questions maximum. Psychologiques et introspectives, jamais
descriptives — pas de question dont la réponse est déjà dans les données.
Doivent pointer un angle mort réel ou une tension repérée dans les
données de la semaine ou en comparaison avec l'historique — pas une
reformulation d'un fait déjà énoncé plus haut.
Ce sont des amorces de réflexion, pas un récapitulatif déguisé.
Format de chaque question : "- **Thème** — question"
Le thème doit être repris mot pour mot dans la liste des thèmes de la
section Résumé de la période / Schémas détectés ci-dessus. Un seul
thème par question.

# Garde-fous
- Jamais de vocabulaire clinique ou diagnostique (anxiété, dépression,
  burn-out, etc.), sauf si la personne l'emploie elle-même dans ses
  propres mots — dans ce cas tu peux le reprendre, pas l'introduire.
- Pas de note d'humeur ou de score inventé si le journal n'en contient
  pas déjà.
- Respecte strictement les titres et l'ordre des sections ci-dessus. Réponds uniquement avec ce markdown, rien avant ni après.

Après le markdown, ajoute un séparateur "---SUMMARY---" suivi d'un résumé compact de 5 à 10 lignes en texte brut (pas de markdown) de cette période : ce qui s'est passé, tonalité dominante du journal, meilleurs moments, schémas observés. Ce résumé sert de mémoire pour les périodes futures, sois dense et factuel.`;

function mondayOf(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function dateRange(startStr: string, endStr: string): string[] {
  const out: string[] = [];
  const d = new Date(startStr + "T00:00:00");
  const end = new Date(endStr + "T00:00:00");
  while (d <= end) {
    out.push(d.toISOString().split("T")[0]);
    d.setDate(d.getDate() + 1);
  }
  return out;
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Themes used in past "Questions à creuser", most frequent first — passed back
// to the model so it reuses an existing label instead of coining a near-duplicate
// one each time (e.g. "Travail" vs "Charge professionnelle").
function extractRecentThemes(pastRecaps: { content: string }[]): string[] {
  const counts = new Map<string, number>();
  pastRecaps.forEach(r => {
    const match = r.content?.match(/##[^\n]*Questions à creuser\s*\n([\s\S]*?)(?=\n##|$)/);
    if (!match) return;
    match[1].split("\n").forEach(line => {
      const m = line.match(/^[-*]\s*\*\*(.+?)\*\*/);
      if (m) counts.set(m[1].trim(), (counts.get(m[1].trim()) || 0) + 1);
    });
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([theme]) => theme);
}

interface Activity {
  date: string;
  type: string;
  duration_minutes: number;
  intensity: string | null;
}

interface Sleep {
  date: string;
  duration_hours: number;
  quality: string | null;
}

interface JournalEntry {
  created_at: string;
  content: string;
  mood: string | null;
}

interface CompletedTask {
  completed_at: string;
  content: string;
}

interface CalendarEvent {
  summary: string;
  start: string;
}

function buildDayBlock(
  date: string,
  journal: JournalEntry[],
  sleep: Sleep | undefined,
  activities: Activity[],
  tasks: CompletedTask[],
  events: CalendarEvent[] | null
): string {
  const label = capitalize(new Date(date + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "2-digit" }));
  const lines: string[] = [`### ${label}`];

  if (journal.length) {
    journal.forEach(j => {
      const time = new Date(j.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
      lines.push(`Journal (${time}${j.mood ? `, humeur : ${j.mood}` : ""}) : "${j.content}"`);
    });
  }
  if (sleep) {
    const h = Math.floor(sleep.duration_hours);
    const m = Math.round((sleep.duration_hours % 1) * 60);
    lines.push(`Sommeil : ${h}h${String(m).padStart(2, "0")}${sleep.quality ? `, qualité ${sleep.quality.toLowerCase()}` : ""}`);
  }
  if (activities.length) {
    lines.push(`Sport : ${activities.map(a => `${a.type.replace(/_/g, " ")} ${a.duration_minutes} min${a.intensity ? ` (${a.intensity})` : ""}`).join(", ")}`);
  }
  if (tasks.length) {
    lines.push(`Tâches complétées (${tasks.length}) : ${tasks.map(t => t.content).join(", ")}`);
  }
  if (events && events.length) {
    lines.push(`Agenda (${events.length} événement${events.length > 1 ? "s" : ""}) : ${events.map(e => e.summary).join(", ")}`);
  }

  if (lines.length === 1) lines.push("(rien)");
  return lines.join("\n");
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const weekStart = body.weekStart ? new Date(body.weekStart + "T00:00:00") : mondayOf(new Date());
  const weekStartStr = weekStart.toISOString().split("T")[0];
  const dateEnd: string = body.weekEnd ?? (() => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 6);
    return d.toISOString().split("T")[0];
  })();
  const nowIso = dateEnd + "T23:59:59.999Z";

  const [
    { data: activities },
    { data: sleep },
    { data: journalEntries },
    { data: completedTodos },
    { data: completedTasks },
    { data: pastRecaps },
  ] = await Promise.all([
    supabase.from("garmin_activities").select("date, type, duration_minutes, intensity").gte("date", weekStartStr).lte("date", dateEnd).order("date"),
    supabase.from("garmin_sleep").select("date, duration_hours, quality").gte("date", weekStartStr).lte("date", dateEnd).order("date"),
    supabase.from("journal_entries").select("created_at, content, mood").gte("created_at", weekStart.toISOString()).lte("created_at", nowIso).order("created_at"),
    supabase.from("project_todos").select("content, completed_at").eq("done", true).gte("completed_at", weekStart.toISOString()).lte("completed_at", nowIso),
    supabase.from("tasks").select("content, completed_at").eq("done", true).gte("completed_at", weekStart.toISOString()).lte("completed_at", nowIso),
    supabase.from("weekly_recaps").select("week_start, compact_summary, content").order("week_start", { ascending: false }).limit(8),
  ]);

  // Calendar events are optional — skip silently if Google isn't connected or the API fails.
  let eventsByDate: Map<string, CalendarEvent[]> | null = null;
  try {
    const accessToken = await getGoogleAccessToken(user.id);
    if (accessToken) {
      const events = await fetchCalendarEventsInRange(accessToken, weekStart.toISOString(), nowIso);
      eventsByDate = new Map();
      events.forEach((e: CalendarEvent) => {
        const d = e.start.slice(0, 10);
        eventsByDate!.set(d, [...(eventsByDate!.get(d) || []), e]);
      });
    }
  } catch { /* calendar optional, ignore failures */ }

  const journalByDate = new Map<string, JournalEntry[]>();
  (journalEntries || []).forEach((j: JournalEntry) => {
    const d = j.created_at.split("T")[0];
    journalByDate.set(d, [...(journalByDate.get(d) || []), j]);
  });

  const sleepByDate = new Map((sleep || []).map((s: Sleep) => [s.date, s]));

  const activitiesByDate = new Map<string, Activity[]>();
  (activities || []).forEach((a: Activity) => {
    activitiesByDate.set(a.date, [...(activitiesByDate.get(a.date) || []), a]);
  });

  const tasksByDate = new Map<string, CompletedTask[]>();
  [...(completedTodos || []), ...(completedTasks || [])].forEach((t: CompletedTask) => {
    const d = t.completed_at.split("T")[0];
    tasksByDate.set(d, [...(tasksByDate.get(d) || []), t]);
  });

  const days = dateRange(weekStartStr, dateEnd);
  const dayBlocks = days.map(date =>
    buildDayBlock(
      date,
      journalByDate.get(date) || [],
      sleepByDate.get(date),
      activitiesByDate.get(date) || [],
      tasksByDate.get(date) || [],
      eventsByDate ? eventsByDate.get(date) || [] : null
    )
  );

  const hasAnyData =
    (journalEntries?.length || 0) > 0 ||
    (activities?.length || 0) > 0 ||
    (sleep?.length || 0) > 0 ||
    (completedTodos?.length || 0) > 0 ||
    (completedTasks?.length || 0) > 0;

  if (!hasAnyData) {
    return NextResponse.json({ error: "Aucune donnée cette semaine pour générer un récap" }, { status: 400 });
  }

  const parts = [dayBlocks.join("\n\n")];

  if (pastRecaps?.length) {
    const history = pastRecaps
      .map((r: any) => `Période du ${r.week_start} :\n${r.compact_summary || "(pas de résumé)"}`)
      .join("\n\n");
    parts.push(`## Historique des périodes précédentes (pour contextualiser les schémas — comparer, pas répéter)\n${history}`);

    const recentThemes = extractRecentThemes(pastRecaps as { content: string }[]);
    if (recentThemes.length) {
      parts.push(`## Thèmes déjà utilisés récemment pour "Questions à creuser"\n${recentThemes.join(", ")}\nRéutilise un de ces thèmes tel quel s'il correspond au sujet de ta question, plutôt que d'en formuler un nouveau très proche. N'en crée un nouveau que si aucun ne convient vraiment.`);
    }
  }

  const userMessage = `Voici les données de la période du ${weekStartStr} au ${dateEnd} :\n\n${parts.join("\n\n---\n\n")}\n\nGénère le récap.`;

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

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id manquant" }, { status: 400 });

  const { error } = await supabase.from("weekly_recaps").delete().eq("id", id).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
