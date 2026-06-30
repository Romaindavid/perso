import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const redirectTo = searchParams.get("redirect") || "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { data } = await supabase.auth.exchangeCodeForSession(code);

    if (data.session?.provider_token) {
      const { createClient: createAdmin } = await import("@supabase/supabase-js");
      const admin = createAdmin(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      await admin.from("google_tokens").upsert({
        user_id: data.session.user.id,
        access_token: data.session.provider_token,
        refresh_token: data.session.provider_refresh_token || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
    }
  }

  return NextResponse.redirect(`${origin}${redirectTo}`);
}
