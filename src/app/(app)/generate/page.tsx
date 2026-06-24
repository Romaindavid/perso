"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { GenerationType } from "@/types";
import { createClient } from "@/lib/supabase/client";

const types: { value: GenerationType; label: string; emoji: string; description: string }[] = [
  { value: "sport", label: "Séance sport", emoji: "🏋️", description: "Programme adapté à ton état actuel" },
  { value: "psy", label: "Bilan psy", emoji: "🧠", description: "Synthèse de ton état mental récent" },
  { value: "medical", label: "Rapport médical", emoji: "🩺", description: "Résumé santé pour ton médecin" },
];

interface Report {
  id: string;
  created_at: string;
  type: string;
  title: string | null;
  content: string;
}

export default function GeneratePage() {
  const [type, setType] = useState<GenerationType | null>(null);
  const [context, setContext] = useState("");
  const [energy, setEnergy] = useState(3);
  const [duration, setDuration] = useState("45");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [reports, setReports] = useState<Report[]>([]);
  const [openReport, setOpenReport] = useState<Report | null>(null);

  const supabase = createClient();

  useEffect(() => { loadReports(); }, []);

  async function loadReports() {
    const { data } = await supabase
      .from("generated_reports")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);
    if (data) setReports(data);
  }

  async function handleGenerate() {
    if (!type) return;
    setLoading(true);
    setResult("");

    const body: Record<string, unknown> = { type, context };
    if (type === "sport") {
      body.energy = energy;
      body.duration = duration;
    }

    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    const content = data.result || data.error || "Erreur";
    setResult(content);

    if (data.result) {
      const firstLine = data.result.split("\n")[0].replace(/^#+\s*/, "").slice(0, 100);
      await supabase.from("generated_reports").insert({
        type,
        title: firstLine,
        content: data.result,
      });
      await loadReports();
    }

    setLoading(false);
  }

  const typeInfo = (t: string) => types.find(x => x.value === t);

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
    });
  }

  // Full-screen report view
  if (openReport) {
    return (
      <div className="min-h-screen">
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => setOpenReport(null)}
            className="flex items-center gap-2 text-sm font-medium text-on-surface-variant"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            Retour
          </button>
          <span className="text-xs text-on-surface-variant">{formatDate(openReport.created_at)}</span>
        </div>
        <div className="bg-white rounded-2xl p-5 shadow-[0px_10px_30px_rgba(94,139,126,0.08)]">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-lg">{typeInfo(openReport.type)?.emoji}</span>
            <span className="text-sm font-semibold text-on-surface-variant">{typeInfo(openReport.type)?.label}</span>
          </div>
          <div className="prose prose-sm max-w-none prose-headings:text-on-surface prose-headings:font-semibold prose-p:text-on-surface-variant prose-strong:text-on-surface prose-li:text-on-surface-variant prose-table:text-sm">
            <ReactMarkdown>{openReport.content}</ReactMarkdown>
          </div>
        </div>
      </div>
    );
  }

  // Result just generated
  if (result) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => { setResult(""); setType(null); setContext(""); }}
          className="flex items-center gap-2 text-sm font-medium text-on-surface-variant"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Nouveau rapport
        </button>
        <div className="bg-white rounded-2xl p-5 shadow-[0px_10px_30px_rgba(94,139,126,0.08)]">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-lg">{type ? typeInfo(type)?.emoji : ""}</span>
            <span className="text-sm font-semibold text-on-surface-variant">{type ? typeInfo(type)?.label : ""}</span>
          </div>
          <div className="prose prose-sm max-w-none prose-headings:text-on-surface prose-headings:font-semibold prose-p:text-on-surface-variant prose-strong:text-on-surface prose-li:text-on-surface-variant prose-table:text-sm">
            <ReactMarkdown>{result}</ReactMarkdown>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold tracking-tight">Assistant</h1>

      {/* Type selection */}
      <div className="space-y-3">
        {types.map((t) => (
          <button
            key={t.value}
            onClick={() => setType(type === t.value ? null : t.value)}
            className={`w-full text-left p-4 rounded-2xl transition-all ${
              type === t.value
                ? "bg-white shadow-[0px_10px_30px_rgba(94,139,126,0.08)] ring-2 ring-primary"
                : "bg-surface-container-low"
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">{t.emoji}</span>
              <div>
                <p className="text-sm font-semibold">{t.label}</p>
                <p className="text-xs text-on-surface-variant">{t.description}</p>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Sport options */}
      {type === "sport" && (
        <div className="bg-white rounded-2xl p-4 shadow-[0px_10px_30px_rgba(94,139,126,0.08)] space-y-4">
          <div>
            <label className="text-sm font-medium text-on-surface-variant">
              Temps disponible (minutes)
            </label>
            <input
              type="number"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="w-full mt-1 bg-surface border border-outline-variant rounded-xl px-4 py-2 text-base focus:outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-on-surface-variant">
              Énergie du jour : {energy}/5
            </label>
            <input
              type="range"
              min={1}
              max={5}
              value={energy}
              onChange={(e) => setEnergy(Number(e.target.value))}
              className="w-full mt-1 accent-primary"
            />
          </div>
        </div>
      )}

      {/* Context + generate */}
      {type && (
        <>
          <textarea
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="Contexte supplémentaire (optionnel)"
            rows={2}
            className="w-full bg-surface border border-outline-variant rounded-xl px-4 py-3 text-sm placeholder:text-outline resize-none focus:outline-none focus:border-primary transition-colors"
          />

          <button
            onClick={handleGenerate}
            disabled={loading}
            className="w-full bg-primary text-on-primary py-3 rounded-full font-semibold text-sm disabled:opacity-50 transition-opacity"
          >
            {loading ? "Génération en cours..." : "Générer"}
          </button>
        </>
      )}

      {/* Rapports précédents */}
      {reports.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-on-surface-variant mb-3">Rapports précédents</h2>
          <div className="space-y-2">
            {reports.map((r) => (
              <button
                key={r.id}
                onClick={() => setOpenReport(r)}
                className="w-full text-left bg-surface-container-low rounded-2xl px-4 py-3 flex items-center gap-3 hover:bg-surface-container transition-colors"
              >
                <span className="text-lg">{typeInfo(r.type)?.emoji || "📄"}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{r.title || typeInfo(r.type)?.label}</p>
                  <p className="text-[11px] text-on-surface-variant">{formatDate(r.created_at)}</p>
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
