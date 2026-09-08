"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Avatar from "@/components/Avatar";

interface JournalEntry {
  id: string;
  created_at: string;
  category: string;
  content: string;
  mood: string | null;
}

interface Activity {
  date: string;
  type: string;
  duration_minutes: number;
  intensity: string | null;
  calories: number;
}

interface Sleep {
  date: string;
  duration_hours: number;
  quality: string | null;
}

interface CompletedTodo {
  id: string;
  content: string;
  completed_at: string;
  project_name?: string;
  tag?: string;
}

interface CalendarEvent {
  summary: string;
}

interface OnThisDayEntry {
  year: number;
  date: string; // ISO
  dateLabel: string; // "samedi 2 septembre 2018"
  agoLabel: string; // "Il y a 8 ans"
  content: string;
}

const CALENDAR_WINDOW_DAYS = 30;

const moods = [
  { value: "super", emoji: "😄", label: "Super" },
  { value: "bien", emoji: "🙂", label: "Bien" },
  { value: "neutre", emoji: "😐", label: "Neutre" },
  { value: "irritable", emoji: "😤", label: "Irritable" },
  { value: "anxieux", emoji: "😰", label: "Anxieux" },
];

const activityLabels: Record<string, string> = {
  cycling: "vélo", running: "course", strength_training: "muscu", windsurfing_v2: "windsurf",
  walking: "marche", hiking: "rando", swimming: "natation", yoga: "yoga", rowing: "rameur",
};

function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function dayHeader(dateStr: string, today: string, yesterday: string): { primary: string; secondary: string | null } {
  const longDate = capitalize(
    new Date(dateStr + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })
  );
  if (dateStr === today) return { primary: "Aujourd'hui", secondary: longDate };
  if (dateStr === yesterday) return { primary: "Hier", secondary: longDate };
  return { primary: longDate, secondary: null };
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

// Même mois+jour, années antérieures. Une entrée par année (la plus longue si
// plusieurs ce jour-là), triées de la plus ancienne à la plus récente.
function buildOnThisDay(allEntries: { created_at: string; content: string }[], today: Date): OnThisDayEntry[] {
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const currentYear = today.getFullYear();

  const byYear = new Map<number, { date: string; content: string }>();
  allEntries.forEach(e => {
    const [y, m, d] = e.created_at.slice(0, 10).split("-");
    if (m !== mm || d !== dd) return;
    const year = Number(y);
    if (year >= currentYear) return;
    const existing = byYear.get(year);
    if (!existing || e.content.length > existing.content.length) {
      byYear.set(year, { date: e.created_at, content: e.content });
    }
  });

  return [...byYear.entries()]
    .map(([year, { date, content }]) => {
      const ago = currentYear - year;
      return {
        year,
        date,
        dateLabel: capitalize(new Date(date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })),
        agoLabel: `Il y a ${ago} an${ago > 1 ? "s" : ""}`,
        content,
      };
    })
    .sort((a, b) => a.year - b.year);
}

export default function JournalPage() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [sleepData, setSleepData] = useState<Sleep[]>([]);
  const [completedTodos, setCompletedTodos] = useState<CompletedTodo[]>([]);
  const [agendaByDate, setAgendaByDate] = useState<Record<string, CalendarEvent[]>>({});
  const [onThisDayEntries, setOnThisDayEntries] = useState<{ created_at: string; content: string }[]>([]);
  const [onThisDayYear, setOnThisDayYear] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [content, setContent] = useState("");
  const [mood, setMood] = useState<string | null>(null);
  const [entryDate, setEntryDate] = useState(localDate(new Date()));
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const supabase = createClient();

  useEffect(() => { loadAll(); }, []);

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await fetch("/api/garmin/sync", { method: "POST" });
      const result = await res.json();
      if (result.ok) await loadAll();
    } catch { /* ignore */ }
    setSyncing(false);
  }

  async function loadAll() {
    setLoading(true);
    const [{ data: j }, { data: a }, { data: s }, { data: pt }, { data: tk }, { data: allJ }] = await Promise.all([
      supabase.from("journal_entries").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.from("garmin_activities").select("*").order("date", { ascending: false }).limit(100),
      supabase.from("garmin_sleep").select("*").order("date", { ascending: false }).limit(60),
      supabase.from("project_todos").select("*, projects(name)").eq("done", true).not("completed_at", "is", null).order("completed_at", { ascending: false }).limit(50),
      supabase.from("tasks").select("*").eq("done", true).not("completed_at", "is", null).order("completed_at", { ascending: false }).limit(50),
      supabase.from("journal_entries").select("created_at, content"),
    ]);
    setEntries(j || []);
    setActivities(a || []);
    setSleepData(s || []);
    setOnThisDayEntries(allJ || []);

    const todos: CompletedTodo[] = [];
    pt?.forEach((t: any) => {
      todos.push({ id: t.id, content: t.content, completed_at: t.completed_at, project_name: t.projects?.name });
    });
    tk?.forEach((t: any) => {
      if (t.completed_at) todos.push({ id: t.id, content: t.content, completed_at: t.completed_at, tag: t.tag });
    });
    setCompletedTodos(todos);
    setLoading(false);

    // Calendar events: recent window only, optional (silently empty if Google isn't connected)
    const end = localDate(new Date());
    const start = localDate(new Date(Date.now() - (CALENDAR_WINDOW_DAYS - 1) * 86400000));
    fetch(`/api/calendar?start=${start}&end=${end}`)
      .then(r => r.json())
      .then(data => setAgendaByDate(data.events || {}))
      .catch(() => {});
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim() && !mood) return;

    setSaving(true);
    const payload: Record<string, unknown> = {
      content: content.trim(),
      category: "quotidien",
      created_at: new Date(entryDate + "T12:00:00").toISOString(),
    };
    if (mood) payload.mood = mood;

    const { error } = await supabase.from("journal_entries").insert(payload);
    if (!error) {
      setContent("");
      setMood(null);
      setEntryDate(localDate(new Date()));
      setShowForm(false);
      await loadAll();
    }
    setSaving(false);
  }

  // Group everything by date
  const today = localDate(new Date());
  const yesterday = localDate(new Date(Date.now() - 86400000));

  const dates = new Set<string>();
  entries.forEach(e => dates.add(e.created_at.split("T")[0]));
  activities.forEach(a => dates.add(a.date));
  sleepData.forEach(s => dates.add(s.date));
  completedTodos.forEach(t => dates.add(t.completed_at.split("T")[0]));

  const sortedDates = Array.from(dates).sort((a, b) => b.localeCompare(a));

  const onThisDay = buildOnThisDay(onThisDayEntries, new Date());
  const currentOnThisDay = onThisDay.find(e => e.year === onThisDayYear) || onThisDay[0];

  const onThisDayCard = currentOnThisDay && (
    <div className="bg-[#efeeea] rounded-[26px] p-5">
      <div className="flex items-baseline gap-2">
        <span className="text-xs font-bold text-[#404845] tracking-[-0.01em]">{currentOnThisDay.agoLabel}</span>
        <span className="text-[11.5px] text-[#717975]">{currentOnThisDay.dateLabel}</span>
      </div>

      <p className="text-[15px] leading-6 text-[#1b1c1a] mt-3 [text-wrap:pretty] whitespace-pre-line">
        {currentOnThisDay.content}
      </p>

      {onThisDay.length > 1 && (
        <div className="flex items-center gap-1.5 mt-4">
          {onThisDay.map(e => (
            <button
              key={e.year}
              onClick={() => setOnThisDayYear(e.year)}
              className={
                e.year === currentOnThisDay.year
                  ? "text-[11.5px] font-bold text-[#1b1c1a] bg-[#fbf9f5] rounded-full px-3 py-[7px]"
                  : "text-[11.5px] font-semibold text-[#717975] px-2.5 py-[7px]"
              }
            >
              {e.year}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const sleepByDate = new Map(sleepData.map(s => [s.date, s]));
  const activitiesByDate = new Map<string, Activity>();
  activities.forEach(a => { if (!activitiesByDate.has(a.date)) activitiesByDate.set(a.date, a); });

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3">
        <Avatar />
        <h1 className="flex-1 text-[22px] font-bold -tracking-[0.02em] text-on-surface">Journal</h1>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="w-10 h-10 rounded-full bg-surface-container text-on-surface-variant flex items-center justify-center transition-colors disabled:opacity-50"
          title="Synchroniser Garmin"
        >
          <svg className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182M20.016 4.356v4.992" />
          </svg>
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="mt-5 bg-white rounded-[26px] p-5 shadow-[0px_10px_30px_rgba(94,139,126,0.08)] space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold text-on-surface-variant">Nouvelle entrée</p>
            <input
              type="date"
              value={entryDate}
              onChange={e => setEntryDate(e.target.value)}
              className="bg-surface border border-outline-variant rounded-xl px-2.5 py-1.5 text-xs focus:outline-none focus:border-primary"
            />
          </div>

          <div>
            <p className="text-xs font-semibold text-on-surface-variant mb-2">Comment tu te sens ?</p>
            <div className="flex justify-between">
              {moods.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMood(mood === m.value ? null : m.value)}
                  className={`flex flex-col items-center gap-1 px-2 py-2 rounded-xl transition-colors ${
                    mood === m.value ? "bg-[#ffdf96]" : "hover:bg-surface-container"
                  }`}
                >
                  <span className="text-2xl">{m.emoji}</span>
                  <span className="text-[10px] font-medium text-on-surface-variant">{m.label}</span>
                </button>
              ))}
            </div>
          </div>

          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Qu'est-ce que tu veux noter ?"
            rows={3}
            className="w-full bg-surface border border-outline-variant rounded-xl px-4 py-3 text-sm placeholder:text-outline resize-none focus:outline-none focus:border-primary transition-colors"
          />

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => { setShowForm(false); setContent(""); setMood(null); setEntryDate(localDate(new Date())); }}
              className="flex-1 py-2.5 rounded-full text-xs font-semibold text-on-surface-variant bg-surface-container"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving || (!content.trim() && !mood)}
              className="flex-1 bg-primary text-on-primary py-2.5 rounded-full text-xs font-semibold disabled:opacity-50 transition-opacity"
            >
              {saving ? "..." : "Enregistrer"}
            </button>
          </div>
        </form>
      )}

      {/* Aujourd'hui n'a pas forcément de groupe (rien encore écrit ce jour) — l'encart
          "il y a N ans" a quand même besoin d'un endroit où s'afficher. */}
      {!sortedDates.includes(today) && currentOnThisDay && (
        <div className="mt-5">
          <div className="flex items-center gap-2.5 mb-3">
            <span className="text-[15px] font-bold text-on-surface">Aujourd&apos;hui</span>
            <span className="text-xs text-outline">
              {capitalize(new Date(today + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }))}
            </span>
          </div>
          {onThisDayCard}
        </div>
      )}

      {/* Timeline */}
      {sortedDates.map((date, dateIdx) => {
        const { primary, secondary } = dayHeader(date, today, yesterday);
        const dayEntries = entries.filter(e => e.created_at.split("T")[0] === date);
        const sleep = sleepByDate.get(date);
        const activity = activitiesByDate.get(date);
        const dayTodos = completedTodos.filter(t => t.completed_at.split("T")[0] === date);
        const agenda = agendaByDate[date] || [];

        return (
          <div key={date} className={dateIdx === 0 ? "mt-5" : "mt-[26px]"}>
            <div className="flex items-center gap-2.5 mb-3">
              <span className="text-[15px] font-bold text-on-surface">{primary}</span>
              {secondary && <span className="text-xs text-outline">{secondary}</span>}
            </div>

            {date === today && onThisDayCard && (
              <div className="mb-2">{onThisDayCard}</div>
            )}

            <div className="flex flex-col gap-2">
              {dayEntries.map(entry => {
                const moodInfo = entry.mood ? moods.find(m => m.value === entry.mood) : null;
                const isLong = entry.content.length > 150;
                const isExpanded = expandedId === entry.id;
                return (
                  <div
                    key={entry.id}
                    className="bg-white rounded-[26px] p-5 shadow-[0px_10px_30px_rgba(94,139,126,0.08)] cursor-pointer active:scale-[0.99] transition-transform"
                    onClick={() => isLong ? setExpandedId(isExpanded ? null : entry.id) : undefined}
                  >
                    <div className="flex items-start gap-3">
                      <p className="flex-1 text-base leading-[26px] text-on-surface [text-wrap:pretty] whitespace-pre-line">
                        {isLong && !isExpanded ? entry.content.slice(0, 150) + "…" : entry.content}
                      </p>
                      {moodInfo && <span className="flex-none text-[26px] leading-none">{moodInfo.emoji}</span>}
                    </div>
                    <p className="text-[11.5px] text-outline mt-3.5">{formatTime(entry.created_at)}</p>
                  </div>
                );
              })}

              {(sleep || activity) && (
                <div className="flex gap-2">
                  <div className="flex-1 bg-[#b9ecee] rounded-[22px] p-4">
                    <p className="text-[11px] font-bold text-[#3c6c6e] tracking-[0.04em] uppercase">sommeil</p>
                    <p className="text-[22px] font-bold text-on-surface mt-1.5 -tracking-[0.02em]">
                      {sleep ? `${Math.floor(sleep.duration_hours)}h${Math.round((sleep.duration_hours % 1) * 60) ? String(Math.round((sleep.duration_hours % 1) * 60)).padStart(2, "0") : "00"}` : "—"}
                    </p>
                    <p className="text-[11.5px] text-[#3c6c6e] mt-0.5">{sleep?.quality?.toLowerCase() || "pas de donnée"}</p>
                  </div>
                  <div className="flex-1 bg-surface-container rounded-[22px] p-4">
                    <p className="text-[11px] font-bold text-on-surface-variant tracking-[0.04em] uppercase">
                      {activity ? activityLabels[activity.type] || activity.type.replace(/_/g, " ") : "corps"}
                    </p>
                    <p className="text-[22px] font-bold text-on-surface mt-1.5 -tracking-[0.02em]">
                      {activity ? `${activity.duration_minutes} min` : "—"}
                    </p>
                    <p className="text-[11.5px] text-outline mt-0.5">
                      {activity ? `${activity.calories} kcal` : "pas d'activité"}
                    </p>
                  </div>
                </div>
              )}

              {agenda.length > 0 && (
                <div className="bg-surface-container rounded-[22px] p-4">
                  <p className="text-[11px] font-bold text-on-surface-variant tracking-[0.04em] uppercase">
                    agenda · {agenda.length} événement{agenda.length > 1 ? "s" : ""}
                  </p>
                  <p className="text-[13.5px] text-on-surface mt-1.5 [text-wrap:pretty]">
                    {agenda.map(e => e.summary).join(" · ")}
                  </p>
                </div>
              )}

              {dayTodos.map(todo => (
                <div key={todo.id} className="bg-[#ffdf96] rounded-[22px] px-[18px] py-[15px] flex items-center gap-3">
                  <span className="flex-none w-[22px] h-[22px] rounded-full bg-[#735802] text-[#fffbff] text-[11px] font-bold flex items-center justify-center">✓</span>
                  <div className="flex-1">
                    <p className="text-[13.5px] font-bold text-on-surface">{todo.content}</p>
                    <p className="text-[11.5px] text-[#735802] mt-0.5">{todo.project_name || todo.tag || "Tâche"}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <div className="h-24" />

      {/* FAB */}
      {!showForm && (
        <div className="fixed inset-x-0 bottom-[98px] pointer-events-none z-10">
          <div className="max-w-lg mx-auto relative h-0">
            <button
              onClick={() => setShowForm(true)}
              className="pointer-events-auto absolute right-[18px] bottom-0 w-[60px] h-[60px] rounded-full bg-primary text-white text-[26px] font-semibold flex items-center justify-center shadow-[0_12px_30px_rgba(56,100,88,0.34)]"
            >
              +
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
