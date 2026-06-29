import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { getGoogleAccessToken, fetchCalendarEvents, fetchRecentEmails } from "@/lib/google";
import webpush from "web-push";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const anthropic = new Anthropic();

webpush.setVapidDetails(
  "mailto:romaindavidcollin@gmail.com",
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

const TAGS = ["Snooze SAS", "Admin & finance", "Arpentons", "La Grange", "LinkedIn", "Autres"];

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: tokens } = await supabase.from("google_tokens").select("user_id");
  if (!tokens?.length) {
    return NextResponse.json({ message: "No users with Google tokens" });
  }

  const { data: projects } = await supabase.from("projects").select("name");
  const projectNames = (projects || []).map((p: any) => p.name);

  for (const { user_id } of tokens) {
    try {
      await processUser(user_id, projectNames);
    } catch (e) {
      console.error(`Daily review failed for ${user_id}:`, e);
    }
  }

  return NextResponse.json({ ok: true });
}

async function processUser(userId: string, projectNames: string[]) {
  const accessToken = await getGoogleAccessToken(userId);
  if (!accessToken) return;

  const [events, emails] = await Promise.all([
    fetchCalendarEvents(accessToken, 2),
    fetchRecentEmails(accessToken, 7),
  ]);

  if (events.length === 0 && emails.length === 0) {
    await sendPushNotification(userId, "N'oublie pas ton journal du soir !", "/journal");
    return;
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
    await supabase.from("task_suggestions").insert(
      suggestions.map((s) => ({
        user_id: userId,
        content: s.content,
        source: s.source,
        suggested_tag: s.suggested_tag,
      }))
    );
  }

  const count = suggestions.length;
  const message = count > 0
    ? `${count} tâche${count > 1 ? "s" : ""} suggérée${count > 1 ? "s" : ""} pour toi`
    : "N'oublie pas ton journal du soir !";

  await sendPushNotification(userId, message, count > 0 ? "/suggestions" : "/journal");
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

async function sendPushNotification(userId: string, body: string, url: string) {
  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("subscription")
    .eq("user_id", userId);

  if (!subs?.length) return;

  const payload = JSON.stringify({
    title: "Perso",
    body,
    url,
  });

  for (const { subscription } of subs) {
    try {
      await webpush.sendNotification(subscription, payload);
    } catch (e: any) {
      if (e.statusCode === 410) {
        await supabase.from("push_subscriptions").delete().eq("subscription", subscription);
      }
    }
  }
}
