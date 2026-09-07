"use client";

import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import Avatar from "@/components/Avatar";
import { createClient } from "@/lib/supabase/client";

interface Recap {
  id: string;
  week_start: string;
  week_end: string;
  content: string;
  created_at: string;
}

interface RecapQuestion {
  key: string; // `${recapId}::${questionText}`
  question: string;
  theme: string;
  weekLabel: string;
  date: string; // ISO — fin de période du récap qui l'a produite
  prompt: string;
}

interface ConcernWindow {
  label: string;
  count: number;
}

interface Concern {
  theme: string;
  sentence?: string;
  count: number; // questions ouvertes du thème, toutes dates confondues
  windows: ConcernWindow[]; // buckets exclusifs, du plus ancien (gauche) au plus récent (droite) — la somme vaut toujours `count`
}

// Trois buckets exclusifs et contigus — pas des fenêtres cumulatives — pour que la
// somme des trois corresponde toujours au nombre total de questions du thème :
// "plus de 30 jours" / "8 à 30 jours" / "7 derniers jours", ancrés sur aujourd'hui.
// Ordre gauche → droite : du plus ancien au plus récent.
function buildConcerns(active: RecapQuestion[], summaries: Record<string, string>): Concern[] {
  if (active.length === 0) return [];

  const today = new Date();
  const cutoff7 = new Date(today);
  cutoff7.setDate(cutoff7.getDate() - 7);
  const cutoff30 = new Date(today);
  cutoff30.setDate(cutoff30.getDate() - 30);
  const c7 = cutoff7.toISOString().slice(0, 10);
  const c30 = cutoff30.toISOString().slice(0, 10);

  const byTheme = new Map<string, RecapQuestion[]>();
  active.forEach(q => byTheme.set(q.theme, [...(byTheme.get(q.theme) || []), q]));

  return [...byTheme.entries()]
    .map(([theme, items]) => {
      const recent = items.filter(q => q.date >= c7).length;
      const mid = items.filter(q => q.date >= c30 && q.date < c7).length;
      const older = items.length - recent - mid; // reste, quelle que soit son ancienneté — garantit une somme exacte
      return {
        theme,
        sentence: summaries[theme],
        count: items.length,
        windows: [
          { label: "90 j", count: older },
          { label: "30 j", count: mid },
          { label: "7 j", count: recent },
        ],
      };
    })
    .sort((a, b) => b.count - a.count)
    .sort((a, b) => (a.theme === "Sans thème" ? 1 : 0) - (b.theme === "Sans thème" ? 1 : 0))
    .slice(0, 4);
}

const CONCERN_TINTS = [
  { bg: "#ffdf96", fg: "#1b1c1a", sub: "#735802", bar: "115,88,2" },
  { bg: "#386458", fg: "#f4fffa", sub: "rgba(244,255,250,.75)", bar: "244,255,250" },
  { bg: "#b9ecee", fg: "#1b1c1a", sub: "#3c6c6e", bar: "60,108,110" },
  { bg: "#efeeea", fg: "#404845", sub: "#717975", bar: "113,121,117" },
];

type Kind = "semaine" | "mois" | "annee";

interface Period {
  start: string;
  end: string;
  label: string;
  isCurrent: boolean;
  alreadyGenerated: boolean;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function toISODate(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function mondayOf(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function shortDate(d: Date) {
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function computePeriods(kind: Kind, recaps: Recap[], today: Date): Period[] {
  const todayStr = toISODate(today);
  const exists = (start: string, end: string) => recaps.some(r => r.week_start === start && r.week_end === end);

  if (kind === "semaine") {
    const thisMonday = mondayOf(today);
    return Array.from({ length: 4 }, (_, i) => {
      const start = new Date(thisMonday);
      start.setDate(start.getDate() - i * 7);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      const startStr = toISODate(start);
      const endStr = toISODate(end);
      return {
        start: startStr,
        end: endStr,
        label: `${shortDate(start)} → ${shortDate(end)}`,
        isCurrent: i === 0,
        alreadyGenerated: exists(startStr, endStr),
      };
    });
  }

  if (kind === "mois") {
    return Array.from({ length: 4 }, (_, i) => {
      const ref = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const start = new Date(ref.getFullYear(), ref.getMonth(), 1);
      let end = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
      if (i === 0 && end > today) end = new Date(today);
      const startStr = toISODate(start);
      const endStr = toISODate(end);
      return {
        start: startStr,
        end: endStr,
        label: capitalize(ref.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })),
        isCurrent: i === 0,
        alreadyGenerated: exists(startStr, endStr),
      };
    });
  }

  // annee
  return Array.from({ length: 2 }, (_, i) => {
    const year = today.getFullYear() - i;
    const start = new Date(year, 0, 1);
    let end = new Date(year, 11, 31);
    if (i === 0 && end > today) end = new Date(today);
    const startStr = toISODate(start);
    const endStr = toISODate(end);
    return {
      start: startStr,
      end: endStr,
      label: String(year),
      isCurrent: i === 0,
      alreadyGenerated: exists(startStr, endStr),
    };
  });
}

function inferKind(start: string, end: string): "Semaine" | "Mois" | "Année" {
  const days = (new Date(end + "T00:00:00").getTime() - new Date(start + "T00:00:00").getTime()) / 86400000 + 1;
  if (days <= 9) return "Semaine";
  if (days <= 32) return "Mois";
  return "Année";
}

function shortLabel(r: Recap): string {
  const kind = inferKind(r.week_start, r.week_end);
  const start = new Date(r.week_start + "T12:00:00");
  const end = new Date(r.week_end + "T12:00:00");
  if (kind === "Semaine") return `${shortDate(start)} → ${shortDate(end)}`;
  if (kind === "Mois") return capitalize(start.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }));
  return String(start.getFullYear());
}

function extractQuestions(content: string): { theme: string; question: string }[] {
  const match = content.match(/##[^\n]*Questions à creuser\s*\n([\s\S]*?)(?=\n##|$)/);
  if (!match) return [];
  return match[1]
    .split("\n")
    .map(l => l.replace(/^[-*]\s*/, "").trim())
    .filter(l => l.length > 5)
    .map(l => {
      const m = l.match(/^\*\*(.+?)\*\*\s*[—–-]\s*(.+)$/);
      return m ? { theme: m[1].trim(), question: m[2].trim() } : { theme: "Sans thème", question: l };
    });
}

const THEME_TINTS = [
  { bg: "#386458", fg: "#f4fffa", sub: "rgba(244,255,250,.65)", check: "rgba(244,255,250,.45)", btn: "rgba(244,255,250,.16)" },
  { bg: "#b9ecee", fg: "#1b1c1a", sub: "#3c6c6e", check: "#8fc9cb", btn: "rgba(255,255,255,.6)" },
  { bg: "#ffdf96", fg: "#1b1c1a", sub: "#735802", check: "#d9b25e", btn: "rgba(255,251,255,.6)" },
  { bg: "#efeeea", fg: "#1b1c1a", sub: "#717975", check: "#c0c8c4", btn: "#ffffff" },
];

function tintOf(theme: string) {
  return THEME_TINTS[[...theme].reduce((n, c) => n + c.charCodeAt(0), 0) % THEME_TINTS.length];
}

function extractGlance(content: string): string {
  const match =
    content.match(/##[^\n]*Résumé de la période\s*\n([\s\S]*?)(?=\n##|$)/) ||
    content.match(/##[^\n]*En un coup d'œil\s*\n([\s\S]*?)(?=\n##|$)/);
  const text = (match ? match[1] : content).replace(/[#*_>-]/g, " ").replace(/\s+/g, " ").trim();
  return text.slice(0, 90);
}

const TINTS = ["#ffdf96", "#b9ecee", "#efeeea"];
function tintFor(id: string): string {
  const sum = [...id].reduce((s, c) => s + c.charCodeAt(0), 0);
  return TINTS[sum % TINTS.length];
}

function buildPrompt(question: string): string {
  return `J'ai une question qui m'a été soumise dans mon récap hebdo : "${question}"\n\nJ'aimerais creuser ça avec toi. Qu'est-ce que tu en perçois à la lumière de ce que tu sais de moi ?`;
}

const ARCHIVED_KEY = "recap_questions_archived";

function loadArchived(): Set<string> {
  try {
    const raw = localStorage.getItem(ARCHIVED_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch { return new Set(); }
}

function saveArchived(set: Set<string>) {
  localStorage.setItem(ARCHIVED_KEY, JSON.stringify([...set]));
}

export default function RecapPage() {
  const [recaps, setRecaps] = useState<Recap[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openRecap, setOpenRecap] = useState<Recap | null>(null);
  const [archived, setArchived] = useState<Set<string>>(new Set());
  const [showArchived, setShowArchived] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [summaries, setSummaries] = useState<Record<string, string>>({});

  const [kind, setKind] = useState<Kind>("semaine");
  const [periodIndex, setPeriodIndex] = useState(0);
  const [entryCount, setEntryCount] = useState<number | null>(null);
  const [customMode, setCustomMode] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const supabase = createClient();
  const today = useMemo(() => new Date(), []);

  useEffect(() => {
    setArchived(loadArchived());
    load();
  }, []);

  useEffect(() => { setPeriodIndex(0); }, [kind]);

  const periods = useMemo(() => computePeriods(kind, recaps, today), [kind, recaps, today]);
  const selected = periods[periodIndex] || periods[0];

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    supabase
      .from("journal_entries")
      .select("id", { count: "exact", head: true })
      .gte("created_at", selected.start + "T00:00:00")
      .lte("created_at", selected.end + "T23:59:59")
      .then(({ count }) => { if (!cancelled) setEntryCount(count ?? 0); });
    return () => { cancelled = true; };
  }, [selected?.start, selected?.end]);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/weekly-recap");
    const data = await res.json();
    setRecaps(data.recaps || []);
    setLoading(false);
  }

  async function generate() {
    const start = customMode ? dateFrom : selected?.start;
    const end = customMode ? dateTo : selected?.end;
    if (!start || !end) {
      setError("Choisis une période");
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/weekly-recap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart: start, weekEnd: end }),
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

  function archiveQuestion(key: string) {
    const next = new Set(archived);
    next.add(key);
    setArchived(next);
    saveArchived(next);
  }

  function unarchiveQuestion(key: string) {
    const next = new Set(archived);
    next.delete(key);
    setArchived(next);
    saveArchived(next);
  }

  async function copyPrompt(key: string, prompt: string) {
    await navigator.clipboard.writeText(prompt);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  }

  // Build questions list from all recaps
  const allQuestions: RecapQuestion[] = [];
  recaps.forEach(r => {
    const questions = extractQuestions(r.content);
    const weekLabel = shortLabel(r);
    questions.forEach(({ theme, question }) => {
      allQuestions.push({
        key: `${r.id}::${question}`,
        question,
        theme,
        weekLabel,
        date: r.week_end,
        prompt: buildPrompt(question),
      });
    });
  });

  const activeQuestions = allQuestions.filter(q => !archived.has(q.key));
  const archivedQuestions = allQuestions.filter(q => archived.has(q.key));

  const themeSummaryPayload = useMemo(() => {
    const byTheme = new Map<string, string[]>();
    activeQuestions.forEach(q => byTheme.set(q.theme, [...(byTheme.get(q.theme) || []), q.question]));
    return [...byTheme.entries()].map(([theme, questions]) => ({ theme, questions }));
  }, [activeQuestions]);

  const themeSummaryCacheKey = useMemo(
    () => JSON.stringify(themeSummaryPayload.map(t => [t.theme, [...t.questions].sort()])),
    [themeSummaryPayload]
  );

  useEffect(() => {
    if (!themeSummaryPayload.length) { setSummaries({}); return; }
    const cached = sessionStorage.getItem(`theme-summaries:${themeSummaryCacheKey}`);
    if (cached) { setSummaries(JSON.parse(cached)); return; }

    let alive = true;
    fetch("/api/theme-summaries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ themes: themeSummaryPayload }),
    })
      .then(r => r.json())
      .then(({ summaries }) => {
        if (!alive) return;
        sessionStorage.setItem(`theme-summaries:${themeSummaryCacheKey}`, JSON.stringify(summaries));
        setSummaries(summaries);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [themeSummaryCacheKey]);

  const byTheme = new Map<string, RecapQuestion[]>();
  activeQuestions.forEach(q => {
    byTheme.set(q.theme, [...(byTheme.get(q.theme) || []), q]);
  });
  const groups = [...byTheme.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .sort((a, b) => (a[0] === "Sans thème" ? 1 : 0) - (b[0] === "Sans thème" ? 1 : 0))
    .map(([theme, items]) => ({ theme, items, tint: tintOf(theme) }));

  const concerns = buildConcerns(activeQuestions, summaries);

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
            <span className="text-xs text-on-surface-variant">{shortLabel(openRecap)}</span>
            <button
              onClick={() => { if (confirm("Supprimer ce récap ?")) deleteRecap(openRecap.id); }}
              className="text-outline hover:text-error transition-colors"
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
    <div>
      {/* Header */}
      <div className="flex items-center gap-3">
        <Avatar />
        <h1 className="text-[22px] font-bold -tracking-[0.02em] text-on-surface">Récaps</h1>
      </div>

      {/* En ce moment — dérivé en live des questions ouvertes, non actionnable */}
      {concerns.length > 0 && (
        <div className="mt-5 mb-6">
          <div className="flex items-baseline justify-between mx-1 mb-3.5">
            <h2 className="text-sm font-bold text-on-surface-variant">En ce moment</h2>
            <span className="text-xs text-outline">d'après tes questions ouvertes</span>
          </div>

          <div className="flex flex-col gap-2.5">
            {concerns.map((c, i) => {
              const t = CONCERN_TINTS[i % CONCERN_TINTS.length];
              const max = Math.max(...c.windows.map(w => w.count), 1);
              return (
                <div key={c.theme} className="rounded-[26px] p-5" style={{ background: t.bg }}>
                  <div className="flex items-baseline gap-2">
                    <span className="text-[13px] font-bold tracking-[-0.01em]" style={{ color: t.fg }}>{c.theme}</span>
                    <span className="text-[11px] font-bold" style={{ color: t.sub }}>
                      {c.count} question{c.count > 1 ? "s" : ""}
                    </span>
                  </div>

                  {c.sentence && (
                    <p className="text-[15px] leading-[23px] font-medium mt-2.5 [text-wrap:pretty]" style={{ color: t.fg }}>
                      {c.sentence}
                    </p>
                  )}

                  <div className="flex items-end gap-4 mt-4">
                    {c.windows.map(w => (
                      <div key={w.label} className="flex-1 flex flex-col items-center gap-1.5">
                        <span className="text-[13px] font-bold" style={{ color: t.fg }}>{w.count}</span>
                        <div
                          className="w-full rounded-[4px]"
                          style={{ height: Math.max(6, Math.round((w.count / max) * 32)), background: `rgba(${t.bar},.45)` }}
                        />
                        <span className="text-[10.5px]" style={{ color: t.sub }}>{w.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* À garder en tête, groupé par thème */}
      <div className={concerns.length > 0 ? "" : "mt-5"}>
        <div className="flex items-baseline justify-between mx-1 mb-3.5">
          <h2 className="text-sm font-bold text-on-surface-variant">À garder en tête</h2>
          <span className="text-xs text-outline">
            {activeQuestions.length === 0 ? "aucune ouverte" : `${activeQuestions.length} ${activeQuestions.length > 1 ? "ouvertes" : "ouverte"}`}
          </span>
        </div>

        {activeQuestions.length === 0 ? (
          <div className="bg-surface-container rounded-[26px] p-5 text-sm text-on-surface-variant">
            Rien à creuser pour l'instant.
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {groups.map(({ theme, items, tint }) => (
              <div key={theme} className="rounded-[26px] p-5" style={{ background: tint.bg }}>
                <div className="flex items-baseline gap-2 mb-4">
                  <span className="text-[13px] font-bold tracking-[-0.01em]" style={{ color: tint.fg }}>{theme}</span>
                  <span className="text-[11px]" style={{ color: tint.sub }}>{items.length}</span>
                </div>

                <div className="flex flex-col gap-4">
                  {items.map(q => (
                    <div key={q.key} className="flex gap-[13px] items-start">
                      <button
                        onClick={() => archiveQuestion(q.key)}
                        aria-label="Marquer comme traitée"
                        className="flex-none w-6 h-6 mt-0.5 rounded-full border-[1.5px] bg-transparent"
                        style={{ borderColor: tint.check }}
                      />
                      <div className="flex-1">
                        <p className="text-[15px] leading-[23px] font-medium [text-wrap:pretty]" style={{ color: tint.fg }}>
                          {q.question}
                        </p>
                        <div className="flex items-center gap-2.5 mt-[9px]">
                          <span className="text-[10.5px]" style={{ color: tint.sub }}>{q.weekLabel}</span>
                          <button
                            onClick={() => copyPrompt(q.key, q.prompt)}
                            className="rounded-full px-[13px] py-[7px] text-[11px] font-bold"
                            style={{ background: tint.btn, color: tint.fg }}
                          >
                            {copiedKey === q.key ? "✓ Copié" : "Écrire là-dessus"}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {archivedQuestions.length > 0 && (
        <>
          <button
            onClick={() => setShowArchived(v => !v)}
            className="w-full flex items-center gap-2.5 pt-3.5 pb-2 px-1"
          >
            <span className="text-[12.5px] font-semibold text-outline">Traitées ({archivedQuestions.length})</span>
            <span className="flex-1 h-px bg-surface-container-highest" />
            <svg className={`w-3 h-3 text-outline transition-transform ${showArchived ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
          {showArchived && (
            <div className="flex flex-col gap-2 animate-[rise_.25s_ease-out]">
              {archivedQuestions.map(q => (
                <div key={q.key} className="bg-surface-container rounded-[20px] px-4 py-3.5 flex gap-3 items-start">
                  <div className="flex-1">
                    <p className="text-[13.5px] leading-5 text-on-surface-variant line-through [text-wrap:pretty]">{q.question}</p>
                    <p className="text-[11px] text-outline mt-1.5">{q.weekLabel}</p>
                  </div>
                  <button
                    onClick={() => unarchiveQuestion(q.key)}
                    className="flex-none text-[11.5px] font-bold text-primary"
                  >
                    Rouvrir
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Générateur */}
      <div className="mt-[22px] bg-[#ffdf96] rounded-[28px] p-5">
        <p className="text-[11px] font-bold tracking-[0.08em] uppercase text-[#735802] mb-3.5">nouvelle synthèse</p>

        {!customMode ? (
          <>
            <div className="bg-[rgba(255,251,255,.6)] rounded-full p-1 flex gap-1 mb-3.5">
              {(["semaine", "mois", "annee"] as Kind[]).map(k => (
                <button
                  key={k}
                  onClick={() => setKind(k)}
                  className={`flex-1 rounded-full py-2.5 text-[12.5px] font-bold capitalize ${
                    kind === k ? "bg-[#1b1c1a] text-[#fffbff]" : "bg-transparent text-[#735802]"
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>

            <div className="chiprow flex gap-2 overflow-x-auto pb-1">
              {periods.map((p, i) => (
                <button
                  key={p.start}
                  onClick={() => setPeriodIndex(i)}
                  className={`flex-none rounded-full px-3.5 py-2.5 text-[12.5px] font-semibold ${
                    periodIndex === i ? "bg-[#1b1c1a] text-[#fffbff]" : "bg-[rgba(255,251,255,.6)] text-[#735802]"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="flex items-baseline gap-2 py-3.5 px-0.5">
              <span className="text-[12.5px] font-bold text-on-surface">
                {selected ? `${shortDate(new Date(selected.start + "T12:00:00"))} – ${shortDate(new Date(selected.end + "T12:00:00"))}` : ""}
                {selected?.isCurrent ? " · en cours" : selected?.alreadyGenerated ? " · déjà généré" : " · jamais généré"}
              </span>
              <span className="flex-1" />
              <span className="text-[11.5px] text-[#735802]">
                {entryCount === null ? "…" : `${entryCount} entrée${entryCount === 1 ? "" : "s"}`}
              </span>
            </div>

            <button
              onClick={() => setCustomMode(true)}
              className="text-[12.5px] text-[#735802]/80 mb-3.5 underline underline-offset-2"
            >
              Autre période…
            </button>
          </>
        ) : (
          <div className="mb-3.5 space-y-3">
            <div className="flex gap-2 items-center">
              <div className="flex-1 space-y-1">
                <p className="text-[10px] font-semibold text-[#735802] uppercase tracking-wider">Du</p>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                  className="w-full bg-[rgba(255,251,255,.6)] border-0 rounded-xl px-3 py-2 text-sm focus:outline-none"
                />
              </div>
              <div className="flex-1 space-y-1">
                <p className="text-[10px] font-semibold text-[#735802] uppercase tracking-wider">Au</p>
                <input
                  type="date"
                  value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                  className="w-full bg-[rgba(255,251,255,.6)] border-0 rounded-xl px-3 py-2 text-sm focus:outline-none"
                />
              </div>
            </div>
            <button
              onClick={() => setCustomMode(false)}
              className="text-[12.5px] text-[#735802]/80 underline underline-offset-2"
            >
              Revenir aux périodes calendaires
            </button>
          </div>
        )}

        <button
          onClick={generate}
          disabled={generating}
          className="w-full bg-[#1b1c1a] text-[#fbf9f5] rounded-full py-[15px] text-[14.5px] font-semibold disabled:opacity-50 transition-opacity"
        >
          {generating ? "Génération en cours..." : selected?.alreadyGenerated && !customMode ? "Régénérer" : "Générer le récap"}
        </button>
      </div>

      {error && (
        <div className="mt-3 bg-error/10 rounded-2xl px-4 py-3 text-xs text-on-surface-variant">
          {error}
        </div>
      )}

      {/* Historique */}
      <div className="mt-[26px]">
        <p className="text-sm font-bold text-on-surface-variant mb-3">Déjà synthétisé</p>
        {recaps.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-4xl mb-3">📊</p>
            <p className="text-sm text-on-surface-variant">Aucun récap pour l'instant</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {recaps.map(r => (
              <button
                key={r.id}
                onClick={() => setOpenRecap(r)}
                className="text-left rounded-[24px] p-4 flex flex-col min-h-[118px]"
                style={{ background: tintFor(r.id) }}
              >
                <span className="text-[10.5px] font-bold tracking-[0.06em] uppercase text-outline">{inferKind(r.week_start, r.week_end)}</span>
                <span className="text-[15px] font-bold -tracking-[0.01em] text-on-surface leading-[21px] mt-1.5">{shortLabel(r)}</span>
                <span className="text-[11.5px] leading-[17px] text-on-surface-variant mt-auto">{extractGlance(r.content)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="h-8" />
    </div>
  );
}
