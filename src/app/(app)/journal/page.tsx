"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Avatar from "@/components/Avatar";
import type { JournalCategory } from "@/types";

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

const categories: { value: JournalCategory; label: string; emoji: string }[] = [
  { value: "quotidien", label: "Quotidien", emoji: "📝" },
  { value: "sport", label: "Sport", emoji: "🏃" },
  { value: "psy", label: "Psy", emoji: "🧠" },
  { value: "medical", label: "Médical", emoji: "🩺" },
];

const moods = [
  { value: "super", emoji: "😄", label: "Super" },
  { value: "bien", emoji: "🙂", label: "Bien" },
  { value: "neutre", emoji: "😐", label: "Neutre" },
  { value: "irritable", emoji: "😤", label: "Irritable" },
  { value: "anxieux", emoji: "😰", label: "Anxieux" },
];

const activityIcons: Record<string, string> = {
  cycling: "🚴", running: "🏃", strength_training: "🏋️", windsurfing_v2: "🪁",
  walking: "🚶", hiking: "🥾", swimming: "🏊", yoga: "🧘", rowing: "🚣",
};

function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDateHeader(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

type TimelineItem = {
  date: string;
  sortKey: string;
  type: "activity" | "journal" | "sleep";
  icon: string;
  title: string;
  subtitle?: string;
  mood?: string | null;
  content?: string;
  category?: string;
};

export default function JournalPage() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [sleepData, setSleepData] = useState<Sleep[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [category, setCategory] = useState<JournalCategory>("quotidien");
  const [content, setContent] = useState("");
  const [mood, setMood] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const supabase = createClient();

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const [{ data: j }, { data: a }, { data: s }] = await Promise.all([
      supabase.from("journal_entries").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.from("garmin_activities").select("*").order("date", { ascending: false }).limit(100),
      supabase.from("garmin_sleep").select("*").order("date", { ascending: false }).limit(60),
    ]);
    setEntries(j || []);
    setActivities(a || []);
    setSleepData(s || []);
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim() && !mood) return;

    setSaving(true);
    const payload: Record<string, unknown> = {
      content: content.trim(),
      category,
    };
    if (category === "quotidien" && mood) {
      payload.mood = mood;
    }

    const { error } = await supabase.from("journal_entries").insert(payload);
    if (!error) {
      setContent("");
      setMood(null);
      setShowForm(false);
      await loadAll();
    }
    setSaving(false);
  }

  // Build timeline
  const timeline: TimelineItem[] = [];

  entries.forEach(j => {
    const catInfo = categories.find(c => c.value === j.category);
    const moodInfo = j.mood ? moods.find(m => m.value === j.mood) : null;
    timeline.push({
      date: j.created_at.split("T")[0],
      sortKey: j.created_at,
      type: "journal",
      icon: moodInfo?.emoji || catInfo?.emoji || "📝",
      title: catInfo?.label || j.category,
      subtitle: formatTime(j.created_at),
      mood: j.mood,
      content: j.content,
      category: j.category,
    });
  });

  activities.forEach(a => {
    const label = a.type.replace(/_/g, " ");
    timeline.push({
      date: a.date,
      sortKey: a.date + "T12:00:00",
      type: "activity",
      icon: activityIcons[a.type] || "🏅",
      title: label.charAt(0).toUpperCase() + label.slice(1),
      subtitle: `${a.duration_minutes} min · ${a.intensity || "—"} · ${a.calories} kcal`,
    });
  });

  sleepData.forEach(s => {
    const h = Math.floor(s.duration_hours);
    const m = Math.round((s.duration_hours % 1) * 60);
    timeline.push({
      date: s.date,
      sortKey: s.date + "T06:00:00",
      type: "sleep",
      icon: "😴",
      title: `${h}h${m ? String(m).padStart(2, "0") : ""} de sommeil`,
      subtitle: s.quality?.toLowerCase() || undefined,
    });
  });

  timeline.sort((a, b) => b.sortKey.localeCompare(a.sortKey));

  const grouped = new Map<string, TimelineItem[]>();
  timeline.forEach(item => {
    const existing = grouped.get(item.date) || [];
    existing.push(item);
    grouped.set(item.date, existing);
  });

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Avatar />
          <h1 className="text-xl font-bold tracking-tight">Journal</h1>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="bg-primary text-on-primary px-4 py-2 rounded-full text-xs font-semibold flex items-center gap-1"
          >
            + Nouvelle entrée
          </button>
        )}
      </div>

      {/* Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-5 shadow-[0px_10px_30px_rgba(94,139,126,0.08)] space-y-4">
          <div className="flex gap-2 flex-wrap">
            {categories.map((cat) => (
              <button
                key={cat.value}
                type="button"
                onClick={() => setCategory(cat.value)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  category === cat.value
                    ? "bg-primary text-on-primary"
                    : "bg-surface-container text-on-surface-variant"
                }`}
              >
                {cat.emoji} {cat.label}
              </button>
            ))}
          </div>

          {category === "quotidien" && (
            <div>
              <p className="text-xs font-semibold text-on-surface-variant mb-2">Comment tu te sens ?</p>
              <div className="flex justify-between">
                {moods.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setMood(mood === m.value ? null : m.value)}
                    className={`flex flex-col items-center gap-1 px-2 py-2 rounded-xl transition-colors ${
                      mood === m.value ? "bg-tertiary-container" : "hover:bg-surface-container"
                    }`}
                  >
                    <span className="text-2xl">{m.emoji}</span>
                    <span className="text-[10px] font-medium text-on-surface-variant">{m.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={category === "quotidien" ? "Comment s'est passée ta journée ?" : "Qu'est-ce que tu veux noter ?"}
            rows={3}
            className="w-full bg-surface border border-outline-variant rounded-xl px-4 py-3 text-sm placeholder:text-outline resize-none focus:outline-none focus:border-primary transition-colors"
          />

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => { setShowForm(false); setContent(""); setMood(null); }}
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

      {/* Timeline */}
      <div className="space-y-6">
        {Array.from(grouped.entries()).map(([date, items]) => (
          <div key={date}>
            <p className="text-xs font-semibold text-on-surface-variant mb-2.5 capitalize">
              {formatDateHeader(date)}
            </p>
            <div className="space-y-2.5">
              {items.map((item, i) => {
                if (item.type === "journal") {
                  const moodInfo = item.mood ? moods.find(m => m.value === item.mood) : null;
                  const itemId = `${item.sortKey}-${i}`;
                  const isLong = (item.content?.length || 0) > 150;
                  const isExpanded = expandedId === itemId;
                  return (
                    <div
                      key={itemId}
                      className="bg-white rounded-2xl px-5 py-4 shadow-[0px_10px_30px_rgba(94,139,126,0.08)] cursor-pointer active:scale-[0.99] transition-transform"
                      onClick={() => isLong ? setExpandedId(isExpanded ? null : itemId) : undefined}
                    >
                      <div className="flex items-start justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{item.icon}</span>
                          <span className="text-base font-bold">{item.title}</span>
                        </div>
                        <span className="text-xs text-on-surface-variant mt-1">{item.subtitle}</span>
                      </div>
                      {item.content && (
                        <p className="text-sm text-on-surface-variant leading-relaxed mt-2 whitespace-pre-line">
                          {isLong && !isExpanded ? item.content.slice(0, 150) + "…" : item.content}
                        </p>
                      )}
                      {moodInfo && (
                        <span className="inline-flex items-center gap-1 mt-3 text-xs font-semibold bg-tertiary-container text-on-tertiary-container px-3 py-1 rounded-full">
                          {moodInfo.emoji} {moodInfo.label}
                        </span>
                      )}
                    </div>
                  );
                }

                if (item.type === "activity") {
                  return (
                    <div
                      key={`${item.sortKey}-${i}`}
                      className="bg-secondary-container/40 rounded-2xl px-4 py-3 flex items-center gap-3"
                    >
                      <div className="w-10 h-10 rounded-full bg-secondary-container flex items-center justify-center text-lg">
                        {item.icon}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold">{item.title}</p>
                        <p className="text-xs text-on-surface-variant">{item.subtitle}</p>
                      </div>
                    </div>
                  );
                }

                // Sleep
                return (
                  <div
                    key={`${item.sortKey}-${i}`}
                    className="bg-surface-container-low rounded-2xl px-4 py-3 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-lg">{item.icon}</span>
                      <span className="text-sm font-medium">{item.title}</span>
                    </div>
                    {item.subtitle && (
                      <span className="text-xs font-medium text-on-surface-variant">{item.subtitle}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
