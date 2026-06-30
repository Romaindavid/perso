"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import Avatar from "@/components/Avatar";

interface Recap {
  id: string;
  week_start: string;
  week_end: string;
  content: string;
  created_at: string;
}

function formatWeek(start: string, end: string) {
  const s = new Date(start + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  const e = new Date(end + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  return `${s} → ${e}`;
}

export default function RecapPage() {
  const [recaps, setRecaps] = useState<Recap[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openRecap, setOpenRecap] = useState<Recap | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/weekly-recap");
    const data = await res.json();
    setRecaps(data.recaps || []);
    setLoading(false);
  }

  async function generate(weekStart?: string) {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/weekly-recap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(weekStart ? { weekStart } : {}),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erreur");
        return;
      }
      setOpenRecap(data.recap);
      await load();
    } catch {
      setError("Erreur réseau");
    } finally {
      setGenerating(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (openRecap) {
    return (
      <div className="min-h-screen">
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => setOpenRecap(null)}
            className="flex items-center gap-2 text-sm font-medium text-on-surface-variant"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            Retour
          </button>
          <span className="text-xs text-on-surface-variant">{formatWeek(openRecap.week_start, openRecap.week_end)}</span>
        </div>
        <div className="bg-white rounded-2xl p-5 shadow-[0px_10px_30px_rgba(94,139,126,0.08)]">
          <div className="prose prose-sm max-w-none prose-headings:text-on-surface prose-headings:font-bold prose-h2:mt-7 prose-h2:mb-3 first:prose-h2:mt-0 prose-p:text-on-surface-variant prose-p:mb-4 prose-strong:text-on-surface prose-li:text-on-surface-variant prose-ul:mb-4">
            <ReactMarkdown>{openRecap.content}</ReactMarkdown>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Avatar />
          <h1 className="text-xl font-bold tracking-tight">Récap hebdo</h1>
        </div>
      </div>

      <button
        onClick={() => generate()}
        disabled={generating}
        className="w-full bg-primary text-on-primary py-3 rounded-full font-semibold text-sm disabled:opacity-50 transition-opacity"
      >
        {generating ? "Génération en cours..." : "📊 Générer le récap de la semaine en cours"}
      </button>

      <div className="flex items-center gap-2">
        <input
          type="date"
          id="weekStartPicker"
          className="flex-1 bg-surface border border-outline-variant rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary"
        />
        <button
          onClick={() => {
            const input = document.getElementById("weekStartPicker") as HTMLInputElement;
            if (input.value) generate(input.value);
          }}
          disabled={generating}
          className="bg-surface-container px-4 py-2 rounded-xl text-xs font-semibold disabled:opacity-50"
        >
          Semaine passée
        </button>
      </div>

      {error && (
        <div className="bg-error/10 rounded-2xl px-4 py-3 text-xs text-on-surface-variant">
          {error}
        </div>
      )}

      {recaps.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-4xl mb-3">📊</p>
          <p className="text-sm text-on-surface-variant">Aucun récap pour l'instant</p>
        </div>
      ) : (
        <div>
          <h2 className="text-sm font-semibold text-on-surface-variant mb-3">Historique</h2>
          <div className="space-y-2">
            {recaps.map((r) => (
              <button
                key={r.id}
                onClick={() => setOpenRecap(r)}
                className="w-full text-left bg-surface-container-low rounded-2xl px-4 py-3 flex items-center gap-3 hover:bg-surface-container transition-colors"
              >
                <span className="text-lg">📊</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Semaine du {formatWeek(r.week_start, r.week_end)}</p>
                </div>
                <svg className="w-4 h-4 text-outline flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
