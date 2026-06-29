import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdmin } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { getGoogleAccessToken, fetchCalendarEvents, fetchRecentEmails } from "@/lib/google";

const admin = createAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const anthropic = new Anthropic();

const TAGS = ["Snooze SAS", "Admin & finance", "Arpentons", "La Grange", "LinkedIn", "Autres"];

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const accessToken = await getGoogleAccessToken(user.id);
  if (!accessToken) {
    return NextResponse.json({ error: "Google token missing — reconnecte-toi" }, { status: 400 });
  }

  const { data: projects } = await admin.from("projects").select("name");
  const projectNames = (projects || []).map((p: any) => p.name);

  const [calendarResult, emails] = await Promise.all([
    fetchCalendarEvents(accessToken, 2),
    fetchRecentEmails(accessToken, 7),
  ]);

  const { events, debug: calendarDebug } = calendarResult;

  if (events.length === 0 && emails.length === 0) {
    return NextResponse.json({ suggestions: [], message: "Aucun événement ni email récent", calendar_debug: calendarDebug, emails_count: 0 });
  }

  const prompt = buildPrompt(events, emails, projectNames);

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";

  let suggestions: { content: string; source: string; suggested_tag: string }[] = [];
  try {
    suggestions = JSON.parse(text);
  } catch {
    const match = text.match(/\[[\s\S]*\]/);
    if (match) suggestions = JSON.parse(match[0]);
  }

  if (suggestions.length > 0) {
    await admin.from("task_suggestions").insert(
      suggestions.map((s) => ({
        user_id: user.id,
        content: s.content,
        source: s.source,
        suggested_tag: s.suggested_tag,
      }))
    );
  }

  return NextResponse.json({
    suggestions,
    events_count: events.length,
    emails_count: emails.length,
    calendar_debug: calendarDebug,
  });
}

function buildPrompt(events: any[], emails: any[], projectNames: string[]): string {
  const tagsAndProjects = [...TAGS, ...projectNames].join(", ");

  return `Tu es un assistant personnel. Analyse l'agenda et les emails ci-dessous pour suggérer des tâches concrètes à ajouter.

## Agenda des 2 prochains jours
${events.length > 0 ? events.map(e => `- ${e.start}: ${e.summary}${e.description ? ` (${e.description})` : ""}`).join("\n") : "Aucun événement"}

## Emails des 7 derniers jours
${emails.length > 0 ? emails.map(e => `- De: ${e.from}\n  Sujet: ${e.subject}\n  Aperçu: ${e.snippet}`).join("\n\n") : "Aucun email"}

## Tags/projets disponibles
${tagsAndProjects}

## Règles
- Extrais uniquement des ACTIONS concrètes (pas des infos ou rappels vagues)
- Chaque tâche doit avoir un tag parmi la liste ci-dessus
- Source = "calendar" ou "gmail"
- Ignore les newsletters, spams, notifications automatiques
- Maximum 5 suggestions
- Si rien de pertinent, retourne un tableau vide []

Réponds UNIQUEMENT avec un JSON array, sans markdown :
[{"content": "...", "source": "calendar|gmail", "suggested_tag": "..."}]`;
}
