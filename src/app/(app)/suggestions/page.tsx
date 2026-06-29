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
      <div className="flex items-center gap-3">
        <Avatar />
        <h1 className="text-xl font-bold tracking-tight">Suggestions</h1>
      </div>

      {suggestions.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-4xl mb-3">✨</p>
          <p className="text-sm text-on-surface-variant">Aucune suggestion en attente</p>
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
