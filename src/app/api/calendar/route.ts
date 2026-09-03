import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getGoogleAccessToken, fetchCalendarEventsInRange } from "@/lib/google";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  if (!start || !end) return NextResponse.json({ error: "start et end requis" }, { status: 400 });

  const accessToken = await getGoogleAccessToken(user.id);
  if (!accessToken) return NextResponse.json({ events: {} });

  try {
    const events = await fetchCalendarEventsInRange(accessToken, `${start}T00:00:00Z`, `${end}T23:59:59Z`);
    const byDate: Record<string, { summary: string }[]> = {};
    events.forEach((e: { summary: string; start: string }) => {
      const d = e.start.slice(0, 10);
      (byDate[d] ||= []).push({ summary: e.summary });
    });
    return NextResponse.json({ events: byDate });
  } catch {
    return NextResponse.json({ events: {} });
  }
}
