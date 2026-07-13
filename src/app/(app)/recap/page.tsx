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
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/weekly-recap");
    const data = await res.json();
    setRecaps(data.recaps || []);
    setLoading(false);
  }

  async function generate() {
    if (!dateFrom || !dateTo) {
      setError("Choisis une date de début et une date de fin");
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/weekly-recap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart: dateFrom, weekEnd: dateTo }),
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

  async function deleteRecap(id: string) {
    const res = await fetch(`/api/weekly-recap?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      setRecaps(prev => prev.filter(r => r.id !== id));
      if (openRecap?.id === id) setOpenRecap(null);
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
          <div className="flex items-center gap-3">
            <span className="text-xs text-on-surface-variant">{formatWeek(openRecap.week_start, openRecap.week_end)}</span>
            <button
              onClick={() => {
                if (confirm("Supprimer ce récap ?")) deleteRecap(openRecap.id);
              }}
              className="text-outline hover:text-error transition-colors"
              title="Supprimer"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
            </button>
          </div>
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

      <div className="bg-white rounded-2xl p-4 shadow-[0px_10px_30px_rgba(94,139,126,0.08)] space-y-3">
        <div className="flex gap-2 items-center">
          <div className="flex-1 space-y-1">
            <p className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider">Du</p>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="w-full bg-surface border border-outline-variant rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary"
            />
          </div>
          <div className="flex-1 space-y-1">
            <p className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider">Au</p>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="w-full bg-surface border border-outline-variant rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary"
            />
          </div>
        </div>
        <button
          onClick={generate}
          disabled={generating}
          className="w-full bg-primary text-on-primary py-2.5 rounded-full font-semibold text-sm disabled:opacity-50 transition-opacity"
        >
          {generating ? "Génération en cours..." : "📊 Générer"}
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
              <div key={r.id} className="bg-surface-container-low rounded-2xl px-4 py-3 flex items-center gap-3">
                <button
                  onClick={() => setOpenRecap(r)}
                  className="flex items-center gap-3 flex-1 text-left"
                >
                  <span className="text-lg">📊</span>
                  <p className="text-sm font-medium flex-1">{formatWeek(r.week_start, r.week_end)}</p>
                  <svg className="w-4 h-4 text-outline flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </button>
                <button
                  onClick={() => { if (confirm("Supprimer ce récap ?")) deleteRecap(r.id); }}
                  className="text-outline hover:text-error transition-colors flex-shrink-0"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
