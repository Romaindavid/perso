"use client";

import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const handleLogin = async () => {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback`,
        scopes: "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.readonly",
        queryParams: { access_type: "offline", prompt: "consent" },
      },
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center space-y-8">
        <div>
          <h1 className="text-[32px] font-bold leading-tight">Perso</h1>
          <p className="text-on-surface-variant mt-2">
            Ta santé, un seul endroit
          </p>
        </div>
        <button
          onClick={handleLogin}
          className="bg-primary text-on-primary px-8 py-3 rounded-full font-medium text-base hover:opacity-90 transition-opacity"
        >
          Continuer avec Google
        </button>
      </div>
    </div>
  );
}
