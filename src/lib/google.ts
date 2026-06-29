import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function getGoogleAccessToken(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("google_tokens")
    .select("access_token, refresh_token")
    .eq("user_id", userId)
    .single();

  if (!data) return null;

  const testRes = await fetch("https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=" + data.access_token);
  if (testRes.ok) return data.access_token;

  if (!data.refresh_token) return null;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: data.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) return null;

  const tokens = await res.json();
  await supabase.from("google_tokens").update({
    access_token: tokens.access_token,
    updated_at: new Date().toISOString(),
  }).eq("user_id", userId);

  return tokens.access_token;
}

export async function fetchCalendarEvents(accessToken: string, daysAhead: number): Promise<any[]> {
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() + 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + daysAhead);

  const params = new URLSearchParams({
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "50",
  });

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!res.ok) return [];
  const data = await res.json();
  return (data.items || []).map((e: any) => ({
    summary: e.summary,
    start: e.start?.dateTime || e.start?.date,
    end: e.end?.dateTime || e.end?.date,
    description: e.description?.slice(0, 200),
  }));
}

export async function fetchRecentEmails(accessToken: string, days: number): Promise<any[]> {
  const after = new Date();
  after.setDate(after.getDate() - days);
  const query = `after:${Math.floor(after.getTime() / 1000)}`;

  const listRes = await fetch(
    `https://www.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=30`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!listRes.ok) return [];
  const listData = await listRes.json();
  const messageIds: string[] = (listData.messages || []).map((m: any) => m.id);

  const emails = await Promise.all(
    messageIds.slice(0, 20).map(async (id) => {
      const res = await fetch(
        `https://www.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!res.ok) return null;
      const msg = await res.json();
      const headers = msg.payload?.headers || [];
      const get = (name: string) => headers.find((h: any) => h.name === name)?.value || "";
      return { subject: get("Subject"), from: get("From"), date: get("Date"), snippet: msg.snippet?.slice(0, 150) };
    })
  );

  return emails.filter(Boolean);
}
