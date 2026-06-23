"use client";

import { useState } from "react";
import type { GenerationType } from "@/types";

const types: { value: GenerationType; label: string; emoji: string; description: string }[] = [
  { value: "sport", label: "Séance sport", emoji: "🏋️", description: "Programme adapté à ton état actuel" },
  { value: "psy", label: "Bilan psy", emoji: "🧠", description: "Synthèse de ton état mental récent" },
  { value: "medical", label: "Rapport médical", emoji: "🩺", description: "Résumé santé pour ton médecin" },
];

export default function GeneratePage() {
  const [type, setType] = useState<GenerationType | null>(null);
  const [context, setContext] = useState("");
  const [energy, setEnergy] = useState(3);
  const [duration, setDuration] = useState("45");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);

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
    setResult(data.result || data.error || "Erreur");
    setLoading(false);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Générer</h1>

      <div className="space-y-3">
        {types.map((t) => (
          <button
            key={t.value}
            onClick={() => setType(t.value)}
            className={`w-full text-left p-4 rounded-2xl transition-colors ${
              type === t.value
                ? "bg-primary-container border-2 border-primary"
                : "bg-surface-container-low border-2 border-transparent"
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">{t.emoji}</span>
              <div>
                <p className="font-medium">{t.label}</p>
                <p className="text-sm text-on-surface-variant">{t.description}</p>
              </div>
            </div>
          </button>
        ))}
      </div>

      {type === "sport" && (
        <div className="space-y-4 bg-surface-container-low rounded-2xl p-4">
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

      {type && (
        <>
          <textarea
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="Contexte supplémentaire (optionnel)"
            rows={3}
            className="w-full bg-surface-container-low border border-outline-variant rounded-2xl px-4 py-3 text-base placeholder:text-outline resize-none focus:outline-none focus:border-primary transition-colors"
          />

          <button
            onClick={handleGenerate}
            disabled={loading}
            className="w-full bg-primary text-on-primary py-3 rounded-full font-medium text-base disabled:opacity-50 transition-opacity"
          >
            {loading ? "Génération en cours..." : "Générer"}
          </button>
        </>
      )}

      {result && (
        <div className="bg-surface-container-low rounded-2xl p-4">
          <div className="prose prose-sm max-w-none whitespace-pre-wrap">
            {result}
          </div>
        </div>
      )}
    </div>
  );
}
