"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { JournalCategory, JournalEntry } from "@/types";

const categories: { value: JournalCategory; label: string; emoji: string }[] = [
  { value: "sport", label: "Sport", emoji: "🏃" },
  { value: "psy", label: "Psy", emoji: "🧠" },
  { value: "medical", label: "Médical", emoji: "🩺" },
  { value: "quotidien", label: "Quotidien", emoji: "📝" },
];

export default function JournalPage() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [content, setContent] = useState("");
  const [category, setCategory] = useState<JournalCategory>("quotidien");
  const [saving, setSaving] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    loadEntries();
  }, []);

  async function loadEntries() {
    const { data } = await supabase
      .from("journal_entries")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);
    if (data) setEntries(data);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;

    setSaving(true);
    const { error } = await supabase
      .from("journal_entries")
      .insert({ content: content.trim(), category });

    if (!error) {
      setContent("");
      await loadEntries();
    }
    setSaving(false);
  }

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Journal</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex gap-2 flex-wrap">
          {categories.map((cat) => (
            <button
              key={cat.value}
              type="button"
              onClick={() => setCategory(cat.value)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                category === cat.value
                  ? "bg-primary text-on-primary"
                  : "bg-surface-container text-on-surface-variant"
              }`}
            >
              {cat.emoji} {cat.label}
            </button>
          ))}
        </div>

        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Comment tu te sens ?"
          rows={4}
          className="w-full bg-surface-container-low border border-outline-variant rounded-2xl px-4 py-3 text-base placeholder:text-outline resize-none focus:outline-none focus:border-primary transition-colors"
        />

        <button
          type="submit"
          disabled={saving || !content.trim()}
          className="w-full bg-primary text-on-primary py-3 rounded-full font-medium text-base disabled:opacity-50 transition-opacity"
        >
          {saving ? "Enregistrement..." : "Enregistrer"}
        </button>
      </form>

      <div className="space-y-3">
        {entries.map((entry) => {
          const cat = categories.find((c) => c.value === entry.category);
          return (
            <div
              key={entry.id}
              className="bg-surface-container-low rounded-2xl p-4 space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-primary">
                  {cat?.emoji} {cat?.label}
                </span>
                <span className="text-xs text-on-surface-variant">
                  {formatDate(entry.created_at)}
                </span>
              </div>
              <p className="text-sm leading-relaxed">{entry.content}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
