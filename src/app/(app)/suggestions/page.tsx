"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Avatar from "@/components/Avatar";

interface Suggestion {
  id: string;
  content: string;
  source: string;
  suggested_tag: string;
  accepted: boolean | null;
  created_at: string;
}

const tagColors: Record<string, string> = {
  "Snooze SAS": "bg-primary text-on-primary",
  "Admin & finance": "bg-tertiary-container text-on-tertiary-container",
  "Arpentons": "bg-secondary-container text-on-secondary-container",
  "La Grange": "bg-surface-container-highest text-on-surface",
  "LinkedIn": "bg-[#0a66c2]/10 text-[#0a66c2]",
  "Autres": "bg-outline-variant text-on-surface",
};

export default function SuggestionsPage() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("task_suggestions")
      .select("*")
      .is("accepted", null)
      .order("created_at", { ascending: false })
      .limit(20);
    setSuggestions(data || []);
    setLoading(false);
  }

  async function runReview() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/daily-review", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setSyncResult(data.error || "Erreur");
        return;
      }
      const count = data.suggestions?.length || 0;
      setSyncResult(
        count > 0
          ? `${count} suggestion${count > 1 ? "s" : ""} trouvée${count > 1 ? "s" : ""} (${data.events_count} événements, ${data.emails_count} emails analysés)`
          : `Rien à signaler (${data.events_count} événements, ${data.emails_count} emails analysés)`
      );
      await load();
    } catch {
      setSyncResult("Erreur réseau");
    } finally {
      setSyncing(false);
    }
  }

  async function accept(s: Suggestion) {
    await supabase.from("tasks").insert({
      content: s.content,
      tag: s.suggested_tag,
    });
    await supabase.from("task_suggestions").update({ accepted: true }).eq("id", s.id);
    setSuggestions(prev => prev.filter(x => x.id !== s.id));
  }

  async function dismiss(id: string) {
    await supabase.from("task_suggestions").update({ accepted: false }).eq("id", id);
    setSuggestions(prev => prev.filter(x => x.id !== id));
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Avatar />
          <h1 className="text-xl font-bold tracking-tight">Suggestions</h1>
        </div>
        <button
          onClick={runReview}
          disabled={syncing}
          className="bg-primary text-on-primary px-4 py-2 rounded-full text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
        >
          {syncing ? (
            <>
              <span className="w-3.5 h-3.5 border-2 border-on-primary border-t-transparent rounded-full animate-spin" />
              Analyse...
            </>
          ) : (
            "🔍 Revue du soir"
          )}
        </button>
      </div>

      {syncResult && (
        <div className="bg-surface-container rounded-2xl px-4 py-3 text-xs text-on-surface-variant">
          {syncResult}
        </div>
      )}

      {suggestions.length === 0 && !syncResult ? (
        <div className="text-center py-12">
          <p className="text-4xl mb-3">✨</p>
          <p className="text-sm text-on-surface-variant mb-1">Aucune suggestion en attente</p>
          <p className="text-xs text-outline">Lance la revue du soir pour analyser ton agenda et tes emails</p>
        </div>
      ) : (
        <div className="space-y-3">
          {suggestions.map(s => (
            <div key={s.id} className="bg-white rounded-2xl p-4 shadow-[0px_10px_30px_rgba(94,139,126,0.08)]">
              <div className="flex items-start justify-between gap-3 mb-3">
                <p className="text-sm font-medium flex-1">{s.content}</p>
                <span className="text-lg flex-shrink-0">{s.source === "gmail" ? "📧" : "📅"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full ${tagColors[s.suggested_tag] || "bg-surface-container text-on-surface-variant"}`}>
                  {s.suggested_tag}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => dismiss(s.id)}
                    className="px-3 py-1.5 rounded-full text-xs font-semibold text-on-surface-variant bg-surface-container"
                  >
                    Ignorer
                  </button>
                  <button
                    onClick={() => accept(s)}
                    className="px-3 py-1.5 rounded-full text-xs font-semibold bg-primary text-on-primary"
                  >
                    Ajouter
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
