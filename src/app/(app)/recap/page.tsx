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
}

interface ConcernWindow {
  label: string;
  count: number;
}

const CONCERN_TINTS = [
  { bg: "#ffdf96", fg: "#1b1c1a", sub: "#735802", bar: "115,88,2" },
  { bg: "#386458", fg: "#f4fffa", sub: "rgba(244,255,250,.75)", bar: "244,255,250" },
  { bg: "#b9ecee", fg: "#1b1c1a", sub: "#3c6c6e", bar: "60,108,110" },
  { bg: "#efeeea", fg: "#404845", sub: "#717975", bar: "113,121,117" },
];

function isoOffset(base: Date, days: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Trois fenêtres disjointes (pas cumulatives) sur la date des questions, pour que
// les barres se lisent comme une répartition dans le temps plutôt qu'une baisse
// artificielle : 31-90j / 8-30j / 7 derniers jours.
function computeWindows(items: RecapQuestion[]): ConcernWindow[] {
  const today = new Date();
  const c7 = isoOffset(today, -7);
  const c30 = isoOffset(today, -30);
  const c90 = isoOffset(today, -90);
  const recent = items.filter(q => q.date >= c7).length;
  const mid = items.filter(q => q.date >= c30 && q.date < c7).length;
  const older = items.filter(q => q.date >= c90 && q.date < c30).length;
  return [
    { label: "avant", count: older },
    { label: "ce mois", count: mid },
    { label: "7 j", count: recent },
  ];
}

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

// Le prochain index (>0) sans récap ; sinon la période en cours (0).
function defaultPeriodIndex(periods: Period[]): number {
  const idx = periods.findIndex((p, i) => i > 0 && !p.alreadyGenerated);
  return idx === -1 ? 0 : idx;
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

function extractGlance(content: string): string {
  const match =
    content.match(/##[^\n]*Résumé de la période\s*\n([\s\S]*?)(?=\n##|$)/) ||
    content.match(/##[^\n]*En un coup d'œil\s*\n([\s\S]*?)(?=\n##|$)/);
  const text = (match ? match[1] : content).replace(/[#*_>-]/g, " ").replace(/\s+/g, " ").trim();
  return text;
}

// Texte jusqu'au premier point, markdown nettoyé — jamais tronqué à un nombre de
// caractères fixe, c'est l'ellipse CSS qui coupe à l'affichage.
function firstSentence(content: string): string {
  const text = extractGlance(content);
  const dot = text.indexOf(".");
  return dot === -1 ? text : text.slice(0, dot + 1);
}

function dayRange(r: Recap): string {
  const s = new Date(r.week_start + "T12:00:00").getDate();
  const e = new Date(r.week_end + "T12:00:00").getDate();
  return `${s} → ${e}`;
}

function monthKey(r: Recap): string {
  return r.week_start.slice(0, 7);
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
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
  const [summaries, setSummaries] = useState<Record<string, string>>({});

  const [expandedTheme, setExpandedTheme] = useState<string | null>(null);
  const [showAllFor, setShowAllFor] = useState<Set<string>>(new Set());
  const [showDoneFor, setShowDoneFor] = useState<Set<string>>(new Set());
  const [historyExpanded, setHistoryExpanded] = useState(false);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("semaine");
  const [periodIndex, setPeriodIndex] = useState(0);
  const [periodCounts, setPeriodCounts] = useState<Record<string, number>>({});
  const [customMode, setCustomMode] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [reminderCount, setReminderCount] = useState<number | null>(null);

  const supabase = createClient();
  const today = useMemo(() => new Date(), []);

  useEffect(() => {
    setArchived(loadArchived());
    load();
  }, []);

  // A backgrounded PWA tab can stay mounted for days without a real reload —
  // refetch whenever the page becomes visible again so a new recap (or one
  // generated from another device) actually shows up instead of a frozen view.
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") load();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const periods = useMemo(() => computePeriods(kind, recaps, today), [kind, recaps, today]);
  const selected = periods[periodIndex] || periods[0];

  // Présélection à l'ouverture de la feuille ou au changement d'onglet : la
  // dernière période complète sans récap, sinon la période en cours. Ne se
  // redéclenche pas sur un simple refetch en arrière-plan pendant que la
  // feuille est ouverte, pour ne pas écraser le choix de l'utilisateur.
  useEffect(() => {
    if (!sheetOpen) return;
    setPeriodIndex(defaultPeriodIndex(computePeriods(kind, recaps, today)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, sheetOpen]);

  useEffect(() => {
    if (!sheetOpen) return;
    let cancelled = false;
    Promise.all(
      periods.map(p =>
        supabase
          .from("journal_entries")
          .select("id", { count: "exact", head: true })
          .gte("created_at", p.start + "T00:00:00")
          .lte("created_at", p.end + "T23:59:59")
          .then(({ count }) => [`${p.start}|${p.end}`, count ?? 0] as const)
      )
    ).then(entries => { if (!cancelled) setPeriodCounts(Object.fromEntries(entries)); });
    return () => { cancelled = true; };
  }, [sheetOpen, periods]);

  // Rappel : la dernière semaine complète (toujours "semaine", indépendamment
  // de l'onglet choisi dans la feuille) n'a pas de récap et contient des entrées.
  const lastCompleteWeek = useMemo(() => computePeriods("semaine", recaps, today)[1], [recaps, today]);
  useEffect(() => {
    if (!lastCompleteWeek || lastCompleteWeek.alreadyGenerated) { setReminderCount(null); return; }
    let cancelled = false;
    supabase
      .from("journal_entries")
      .select("id", { count: "exact", head: true })
      .gte("created_at", lastCompleteWeek.start + "T00:00:00")
      .lte("created_at", lastCompleteWeek.end + "T23:59:59")
      .then(({ count }) => { if (!cancelled) setReminderCount(count ?? 0); });
    return () => { cancelled = true; };
  }, [lastCompleteWeek?.start, lastCompleteWeek?.end, lastCompleteWeek?.alreadyGenerated]);

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
      setSheetOpen(false);
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
  const sortedThemes = [...byTheme.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .sort((a, b) => (a[0] === "Sans thème" ? 1 : 0) - (b[0] === "Sans thème" ? 1 : 0))
    .map(([theme, items], i) => ({
      theme,
      items,
      tint: CONCERN_TINTS[i % CONCERN_TINTS.length],
      sentence: summaries[theme],
      windows: computeWindows(items),
    }));

  // Reste toujours un seul thème "déplié" — se recale sur le premier dès que
  // celui en cours disparaît (dernière question cochée) ou au premier rendu.
  useEffect(() => {
    if (sortedThemes.length === 0) { setExpandedTheme(null); return; }
    if (!sortedThemes.some(t => t.theme === expandedTheme)) {
      setExpandedTheme(sortedThemes[0].theme);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedThemes.map(t => t.theme).join("|")]);

  const monthsSorted = useMemo(() => {
    const map = new Map<string, Recap[]>();
    recaps.forEach(r => { const k = monthKey(r); map.set(k, [...(map.get(k) || []), r]); });
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [recaps]);
  const visibleMonths = historyExpanded ? monthsSorted : monthsSorted.slice(0, 3);

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
        <h1 className="flex-1 text-[22px] font-bold -tracking-[0.02em] text-on-surface">Récaps</h1>
        <button
          onClick={() => setSheetOpen(true)}
          className="rounded-full bg-[#1b1c1a] text-[#fbf9f5] text-[13px] font-bold px-4 py-2.5"
        >
          + Synthèse
        </button>
      </div>

      {/* Rappel */}
      {lastCompleteWeek && !lastCompleteWeek.alreadyGenerated && (reminderCount ?? 0) > 0 && (
        <div className="mt-4 bg-[#efeeea] rounded-full pl-4 pr-1.5 py-1.5 flex items-center justify-between gap-2">
          <span className="text-[12.5px] text-on-surface-variant">Semaine du {shortDate(new Date(lastCompleteWeek.start + "T12:00:00"))} prête à synthétiser</span>
          <button
            onClick={() => { setKind("semaine"); setPeriodIndex(1); setSheetOpen(true); }}
            className="flex-none rounded-full bg-[#fbf9f5] text-on-surface text-[12.5px] font-bold px-3.5 py-1.5"
          >
            Générer
          </button>
        </div>
      )}

      {/* En ce moment */}
      {sortedThemes.length > 0 && (
        <div className="mt-5">
          <div className="flex items-baseline justify-between mx-1 mb-3.5">
            <h2 className="text-sm font-bold text-on-surface-variant">En ce moment</h2>
            <span className="text-xs text-outline">{activeQuestions.length} question{activeQuestions.length > 1 ? "s" : ""} ouvertes</span>
          </div>

          <div className="flex flex-col gap-2.5">
            {sortedThemes.map((t, i) => {
              const isExpanded = t.theme === expandedTheme;
              const rich = i < 2 || isExpanded;
              const max = Math.max(...t.windows.map(w => w.count), 1);
              const doneForTheme = archivedQuestions.filter(q => q.theme === t.theme);
              const showAll = showAllFor.has(t.theme);
              const showDone = showDoneFor.has(t.theme);
              const visibleItems = showAll ? t.items : t.items.slice(0, 3);

              if (!rich) {
                return (
                  <button
                    key={t.theme}
                    onClick={() => setExpandedTheme(t.theme)}
                    aria-expanded={false}
                    className="min-h-[44px] rounded-[26px] px-5 py-3 flex items-center gap-2"
                    style={{ background: t.tint.bg }}
                  >
                    <span className="text-[13px] font-bold tracking-[-0.01em]" style={{ color: t.tint.fg }}>{t.theme}</span>
                    <span className="text-[11px] font-bold" style={{ color: t.tint.sub }}>{t.items.length} question{t.items.length > 1 ? "s" : ""}</span>
                    <span className="flex-1" />
                    <span className="text-[11px] font-bold" style={{ color: t.tint.sub }}>↓</span>
                  </button>
                );
              }

              return (
                <div
                  key={t.theme}
                  role="button"
                  aria-expanded={isExpanded}
                  onClick={() => setExpandedTheme(t.theme)}
                  className="rounded-[26px] p-5 cursor-pointer"
                  style={{ background: t.tint.bg }}
                >
                  <div className="flex items-baseline gap-2">
                    <span className="text-[13px] font-bold tracking-[-0.01em]" style={{ color: t.tint.fg }}>{t.theme}</span>
                    <span className="text-[11px] font-bold" style={{ color: t.tint.sub }}>{t.items.length} question{t.items.length > 1 ? "s" : ""}</span>
                    <span className="flex-1" />
                    <span className="text-[11px] font-bold" style={{ color: t.tint.sub }}>{isExpanded ? "↑" : "↓"}</span>
                  </div>

                  {t.sentence && (
                    <p className="text-[15px] leading-[23px] font-medium mt-2.5 [text-wrap:pretty]" style={{ color: t.tint.fg }}>
                      {t.sentence}
                    </p>
                  )}

                  <div className="grid grid-cols-3 gap-2 mt-4">
                    {t.windows.map(w => (
                      <div key={w.label} className="flex flex-col items-center gap-1">
                        <div
                          className="w-full rounded-[5px] max-h-[16px]"
                          style={{
                            height: Math.max(4, Math.round((w.count / max) * 16)),
                            background: `rgba(${t.tint.bar},${w.label === "avant" ? 0.3 : w.label === "ce mois" ? 0.55 : 1})`,
                          }}
                        />
                        <span className="text-[10.5px]" style={{ color: t.tint.sub }}>{w.label} · {w.count}</span>
                      </div>
                    ))}
                  </div>

                  {isExpanded && (
                    <>
                      <div className="h-px my-4" style={{ background: t.tint.sub, opacity: 0.2 }} />
                      <div className="flex flex-col gap-3">
                        {visibleItems.map(q => (
                          <div key={q.key} className="flex gap-3 items-start">
                            <button
                              onClick={(e) => { e.stopPropagation(); archiveQuestion(q.key); }}
                              aria-label="Marquer comme traitée"
                              className="flex-none w-5 h-5 mt-0.5 rounded-[7px] border-[1.5px] bg-transparent"
                              style={{ borderColor: t.tint.sub }}
                            />
                            <p className="flex-1 text-[15px] leading-[23px] font-medium [text-wrap:pretty]" style={{ color: t.tint.fg }}>
                              {q.question}
                            </p>
                          </div>
                        ))}
                      </div>

                      <div className="flex items-center justify-between mt-3">
                        {!showAll && t.items.length > 3 ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); setShowAllFor(prev => new Set(prev).add(t.theme)); }}
                            className="text-[11.5px] font-bold"
                            style={{ color: t.tint.fg }}
                          >
                            + {t.items.length - 3} autres
                          </button>
                        ) : <span />}
                        {doneForTheme.length > 0 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowDoneFor(prev => {
                                const next = new Set(prev);
                                next.has(t.theme) ? next.delete(t.theme) : next.add(t.theme);
                                return next;
                              });
                            }}
                            className="text-[11.5px] font-bold"
                            style={{ color: t.tint.sub }}
                          >
                            {doneForTheme.length} traitées
                          </button>
                        )}
                      </div>

                      {showDone && (
                        <div className="flex flex-col gap-2 mt-3">
                          {doneForTheme.map(q => (
                            <div key={q.key} className="flex items-center gap-3">
                              <p className="flex-1 text-[13.5px] leading-5 line-through opacity-60" style={{ color: t.tint.fg }}>
                                {q.question}
                              </p>
                              <button
                                onClick={(e) => { e.stopPropagation(); unarchiveQuestion(q.key); }}
                                className="flex-none text-[11px] font-bold"
                                style={{ color: t.tint.fg }}
                              >
                                Rouvrir
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {error && (
        <div className="mt-3 bg-error/10 rounded-2xl px-4 py-3 text-xs text-on-surface-variant">
          {error}
        </div>
      )}

      {/* Historique */}
      <div className="mt-[26px]">
        <p className="text-sm font-bold text-on-surface-variant mb-3">Historique</p>
        {recaps.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-4xl mb-3">📊</p>
            <p className="text-sm text-on-surface-variant">Aucun récap pour l'instant</p>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-5">
              {visibleMonths.map(([key, monthRecaps]) => {
                const monthly = monthRecaps.find(r => inferKind(r.week_start, r.week_end) === "Mois");
                const weekly = monthRecaps.filter(r => r !== monthly).sort((a, b) => b.week_start.localeCompare(a.week_start));
                return (
                  <div key={key}>
                    <p className="text-[11px] uppercase tracking-[0.08em] text-outline font-semibold mb-2">{monthLabel(key)}</p>
                    {monthly && (
                      <button
                        onClick={() => setOpenRecap(monthly)}
                        className="w-full text-left bg-surface-container rounded-[20px] px-4 py-3 mb-1.5 flex items-baseline gap-2"
                      >
                        <span className="flex-none text-[13px] font-bold text-on-surface">Mois</span>
                        <span className="flex-1 text-[13px] text-on-surface-variant truncate">{firstSentence(monthly.content)}</span>
                      </button>
                    )}
                    <div>
                      {weekly.map((r, i) => (
                        <button
                          key={r.id}
                          onClick={() => setOpenRecap(r)}
                          className={`w-full text-left grid grid-cols-[92px_minmax(0,1fr)] items-center gap-2 py-3 ${i > 0 ? "border-t border-black/[.06]" : ""}`}
                        >
                          <span className="text-[13px] font-bold text-on-surface">{dayRange(r)}</span>
                          <span className="text-[13px] text-[#404845] truncate">{firstSentence(r.content)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            {!historyExpanded && monthsSorted.length > 3 && (
              <button
                onClick={() => setHistoryExpanded(true)}
                className="mt-4 text-[12.5px] font-bold text-primary"
              >
                Plus ancien
              </button>
            )}
          </>
        )}
      </div>

      <div className="h-8" />

      {/* Feuille "Nouvelle synthèse" */}
      {sheetOpen && (
        <div className="fixed inset-0 z-30">
          <div
            className="absolute inset-0 bg-[rgba(27,28,26,.35)]"
            onClick={() => setSheetOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 max-w-lg mx-auto bg-[#fbf9f5] rounded-t-[32px] px-5 pt-3 pb-6 max-h-[85vh] overflow-y-auto">
            <div className="w-10 h-[5px] rounded-full bg-[#c0c8c4] mx-auto mb-4" />
            <p className="text-lg font-bold text-on-surface mb-4">Nouvelle synthèse</p>

            {!customMode ? (
              <>
                <div className="bg-surface-container rounded-full p-1 flex gap-1 mb-3.5">
                  {(["semaine", "mois", "annee"] as Kind[]).map(k => (
                    <button
                      key={k}
                      onClick={() => setKind(k)}
                      className={`flex-1 rounded-full py-2.5 text-[12.5px] font-bold ${
                        kind === k ? "bg-[#1b1c1a] text-[#fffbff]" : "bg-transparent text-on-surface-variant"
                      }`}
                    >
                      {k === "annee" ? "Année" : capitalize(k)}
                    </button>
                  ))}
                </div>

                <div className="flex flex-col gap-2 mb-3.5">
                  {periods.map((p, i) => {
                    const count = periodCounts[`${p.start}|${p.end}`];
                    const sel = periodIndex === i;
                    return (
                      <button
                        key={p.start}
                        onClick={() => setPeriodIndex(i)}
                        className={`w-full flex items-center gap-3 rounded-2xl px-4 py-3 ${sel ? "bg-[#ffdf96]" : "bg-[#efeeea]"}`}
                      >
                        <span className={`flex-none w-5 h-5 rounded-full border-2 flex items-center justify-center ${sel ? "border-[#1b1c1a]" : "border-[#c0c8c4]"}`}>
                          {sel && <span className="w-2.5 h-2.5 rounded-full bg-[#1b1c1a]" />}
                        </span>
                        <span className="flex-1 text-left text-sm font-semibold text-on-surface">
                          {p.label}{p.isCurrent ? " · en cours" : ""}
                        </span>
                        <span className="text-xs text-outline">
                          {p.alreadyGenerated ? "déjà fait" : count === undefined ? "…" : `${count} entrée${count === 1 ? "" : "s"}`}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={() => setCustomMode(true)}
                  className="text-[12.5px] text-outline mb-3.5 underline underline-offset-2"
                >
                  Autre période…
                </button>
              </>
            ) : (
              <div className="mb-3.5 space-y-3">
                <div className="flex gap-2 items-center">
                  <div className="flex-1 space-y-1">
                    <p className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider">Du</p>
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={e => setDateFrom(e.target.value)}
                      className="w-full bg-surface-container border-0 rounded-xl px-3 py-2 text-sm focus:outline-none"
                    />
                  </div>
                  <div className="flex-1 space-y-1">
                    <p className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider">Au</p>
                    <input
                      type="date"
                      value={dateTo}
                      onChange={e => setDateTo(e.target.value)}
                      className="w-full bg-surface-container border-0 rounded-xl px-3 py-2 text-sm focus:outline-none"
                    />
                  </div>
                </div>
                <button
                  onClick={() => setCustomMode(false)}
                  className="text-[12.5px] text-outline underline underline-offset-2"
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
        </div>
      )}
    </div>
  );
}
