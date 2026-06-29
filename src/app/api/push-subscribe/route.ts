import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const subscription = await request.json();

  await supabase.from("push_subscriptions").upsert(
    { user_id: user.id, subscription },
    { onConflict: "user_id" }
  );

  return NextResponse.json({ ok: true });
}
