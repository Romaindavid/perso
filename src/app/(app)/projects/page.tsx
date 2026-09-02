"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import Avatar from "@/components/Avatar";

interface Project {
  id: string;
  name: string;
  icon: string | null;
  cadence: string | null;
  last_edition: string | null;
  next_edition: string | null;
}

interface ProjectTodo {
  id: string;
  project_id: string;
  content: string;
  done: boolean;
}

interface Task {
  id: string;
  content: string;
  tag: string | null;
  done: boolean;
}

const TAGS = ["Snooze SAS", "Admin & finance", "Arpentons", "La Grange", "LinkedIn", "Autres"];

// Fond actif, texte actif, fond inactif, texte inactif
const TAG_STYLE: Record<string, { activeBg: string; activeText: string }> = {
  "Snooze SAS": { activeBg: "#386458", activeText: "#ffffff" },
  "Admin & finance": { activeBg: "#ffdf96", activeText: "#735802" },
  "Arpentons": { activeBg: "#b9ecee", activeText: "#3c6c6e" },
  "La Grange": { activeBg: "#e4e2de", activeText: "#1b1c1a" },
  "LinkedIn": { activeBg: "#dce8f6", activeText: "#0a66c2" },
  "Autres": { activeBg: "#c0c8c4", activeText: "#1b1c1a" },
};

// Project block tints, stable per project by index. sauge / sarcelle / neutre / or, repeating.
const PROJECT_TINTS = [
  { bg: "#386458", fg: "#f4fffa", sub: "rgba(244,255,250,.7)", dash: "rgba(244,255,250,.35)", iconBg: "rgba(244,255,250,.16)", tickBg: "#f4fffa" },
  { bg: "#b9ecee", fg: "#1b1c1a", sub: "#3c6c6e", dash: "#8fc9cb", iconBg: "rgba(255,255,255,.6)", tickBg: "#356668" },
  { bg: "#efeeea", fg: "#1b1c1a", sub: "#717975", dash: "#c0c8c4", iconBg: "rgba(255,255,255,.6)", tickBg: "#404845" },
  { bg: "#ffdf96", fg: "#1b1c1a", sub: "#735802", dash: "rgba(115,88,2,.35)", iconBg: "rgba(255,255,255,.6)", tickBg: "#735802" },
];

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [todos, setTodos] = useState<ProjectTodo[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  // New todo per project
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [newTodo, setNewTodo] = useState<Record<string, string>>({});

  async function updateProjectDate(id: string, field: "last_edition" | "next_edition", value: string) {
    await supabase.from("projects").update({ [field]: value || null }).eq("id", id);
    setProjects(prev => prev.map(p => p.id === id ? { ...p, [field]: value || null } : p));
  }

  // New free task
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [newTaskContent, setNewTaskContent] = useState("");
  const [newTaskTag, setNewTaskTag] = useState(TAGS[0]);
  const [filterTag, setFilterTag] = useState<string | null>(null);

  const supabase = createClient();

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const [{ data: p }, { data: t }, { data: tk }] = await Promise.all([
      supabase.from("projects").select("*").order("sort_order"),
      supabase.from("project_todos").select("*").order("created_at"),
      supabase.from("tasks").select("*").order("created_at", { ascending: false }),
    ]);
    setProjects(p || []);
    setTodos(t || []);
    setTasks(tk || []);
    setLoading(false);
  }

  async function addTodo(projectId: string) {
    const text = newTodo[projectId]?.trim();
    if (!text) return;
    await supabase.from("project_todos").insert({ project_id: projectId, content: text });
    setNewTodo(prev => ({ ...prev, [projectId]: "" }));
    setAddingFor(null);
    await loadAll();
  }

  async function toggleTodo(id: string, done: boolean) {
    const update = done
      ? { done: false, completed_at: null }
      : { done: true, completed_at: new Date().toISOString() };
    await supabase.from("project_todos").update(update).eq("id", id);
    setTodos(prev => prev.map(t => t.id === id ? { ...t, ...update } : t));
  }

  async function addTask() {
    if (!newTaskContent.trim()) return;
    await supabase.from("tasks").insert({ content: newTaskContent.trim(), tag: newTaskTag });
    setNewTaskContent("");
    setShowTaskForm(false);
    await loadAll();
  }

  async function toggleTask(id: string, done: boolean) {
    const update = done
      ? { done: false, completed_at: null }
      : { done: true, completed_at: new Date().toISOString() };
    await supabase.from("tasks").update(update).eq("id", id);
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...update } : t));
  }

  const [showDoneTasks, setShowDoneTasks] = useState(false);

  const filteredTasks = filterTag ? tasks.filter(t => t.tag === filterTag) : tasks;
  const activeTasks = filteredTasks.filter(t => !t.done);
  const doneTasks = filteredTasks.filter(t => t.done);

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
        <h1 className="flex-1 text-[22px] font-bold -tracking-[0.02em] text-on-surface">Tâches</h1>
        <Link
          href="/suggestions"
          className="rounded-full bg-surface-container text-primary text-[12.5px] font-bold px-[15px] py-2.5"
        >
          Importer
        </Link>
      </div>

      {/* Projets */}
      <div className="mt-5">
        <p className="text-sm font-bold text-on-surface-variant mb-3">Projets</p>
        <div className="flex flex-col gap-2.5">
          {projects.map((project, idx) => {
            const tint = PROJECT_TINTS[idx % PROJECT_TINTS.length];
            const projectTodos = todos.filter(t => t.project_id === project.id);
            const activeCount = projectTodos.filter(t => !t.done).length;
            return (
              <div key={project.id} className="rounded-[28px] p-5" style={{ background: tint.bg }}>
                <div className="flex items-center gap-3 mb-4">
                  <span
                    className="flex-none w-10 h-10 rounded-full flex items-center justify-center text-[19px]"
                    style={{ background: tint.iconBg }}
                  >
                    {project.icon}
                  </span>
                  <div className="flex-1">
                    <div className="text-[17px] font-bold -tracking-[0.01em]" style={{ color: tint.fg }}>{project.name}</div>
                    <label className="inline-block text-[11.5px] mt-0.5" style={{ color: tint.sub }}>
                      prochaine édition ·{" "}
                      <input
                        type="date"
                        value={project.next_edition || ""}
                        onChange={(e) => updateProjectDate(project.id, "next_edition", e.target.value)}
                        className="bg-transparent border-0 p-0 cursor-pointer"
                        style={{ color: tint.sub, colorScheme: "light" }}
                      />
                    </label>
                  </div>
                  {activeCount > 0 && (
                    <span className="text-[11.5px] font-bold flex-none" style={{ color: tint.sub }}>{activeCount} à faire</span>
                  )}
                </div>

                <div className="flex flex-col gap-0.5">
                  {projectTodos.filter(t => !t.done).map(todo => (
                    <button
                      key={todo.id}
                      onClick={() => toggleTodo(todo.id, todo.done)}
                      className="w-full text-left flex items-center gap-3 py-2.5"
                    >
                      <span
                        className="flex-none w-[22px] h-[22px] rounded-full"
                        style={{ border: `1.5px solid ${tint.sub}` }}
                      />
                      <span className="flex-1 text-[14.5px]" style={{ color: tint.fg }}>{todo.content}</span>
                    </button>
                  ))}
                  {projectTodos.filter(t => t.done).map(todo => (
                    <button
                      key={todo.id}
                      onClick={() => toggleTodo(todo.id, todo.done)}
                      className="w-full text-left flex items-center gap-3 py-2.5"
                    >
                      <span
                        className="flex-none w-[22px] h-[22px] rounded-full flex items-center justify-center text-[11px] font-bold"
                        style={{ background: tint.tickBg, color: tint.bg }}
                      >
                        ✓
                      </span>
                      <span className="flex-1 text-[14.5px] line-through opacity-50" style={{ color: tint.fg }}>{todo.content}</span>
                    </button>
                  ))}
                </div>

                {addingFor === project.id ? (
                  <div className="flex gap-2 mt-2">
                    <input
                      autoFocus
                      type="text"
                      value={newTodo[project.id] || ""}
                      onChange={(e) => setNewTodo(prev => ({ ...prev, [project.id]: e.target.value }))}
                      onKeyDown={(e) => e.key === "Enter" && addTodo(project.id)}
                      onBlur={() => !newTodo[project.id] && setAddingFor(null)}
                      placeholder="Nouvelle tâche..."
                      className="flex-1 bg-white/20 rounded-xl px-3 py-2 text-sm placeholder:opacity-60 focus:outline-none"
                      style={{ color: tint.fg }}
                    />
                  </div>
                ) : (
                  <button
                    onClick={() => setAddingFor(project.id)}
                    className="w-full mt-2 rounded-full py-[11px] text-[12.5px] font-semibold"
                    style={{ border: `1.5px dashed ${tint.dash}`, color: tint.sub }}
                  >
                    Ajouter une tâche
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Tâches libres */}
      <div className="mt-[26px]">
        <div className="flex items-baseline justify-between mb-3">
          <p className="text-sm font-bold text-on-surface-variant">Tâches libres</p>
          <p className="text-xs text-outline">{activeTasks.length} en cours</p>
        </div>

        <div className="chiprow flex gap-[7px] overflow-x-auto pb-3">
          <button
            onClick={() => setFilterTag(null)}
            className={`flex-none rounded-full px-[13px] py-[9px] text-[11.5px] font-bold ${
              !filterTag ? "bg-[#1b1c1a] text-[#fbf9f5]" : "bg-surface-container text-on-surface-variant"
            }`}
          >
            Tout
          </button>
          {TAGS.map(tag => {
            const active = filterTag === tag;
            const style = TAG_STYLE[tag];
            return (
              <button
                key={tag}
                onClick={() => setFilterTag(active ? null : tag)}
                className="flex-none rounded-full px-[13px] py-[9px] text-[11.5px] font-bold"
                style={active ? { background: style.activeBg, color: style.activeText } : { background: "#efeeea", color: "#404845" }}
              >
                {tag}
              </button>
            );
          })}
        </div>

        <div className="flex flex-col gap-2">
          {activeTasks.map(task => {
            const style = task.tag ? TAG_STYLE[task.tag] : null;
            return (
              <button
                key={task.id}
                onClick={() => toggleTask(task.id, task.done)}
                className="w-full text-left bg-white rounded-[22px] p-4 shadow-[0px_10px_30px_rgba(94,139,126,0.08)] flex items-center gap-3"
              >
                <span className="flex-none w-[22px] h-[22px] rounded-full border-[1.5px] border-[#c0c8c4]" />
                <span className="flex-1 text-[14.5px] text-on-surface [text-wrap:pretty]">{task.content}</span>
                {task.tag && (
                  <span
                    className="flex-none rounded-full px-2.5 py-1.5 text-[10.5px] font-bold"
                    style={style ? { background: style.activeBg, color: style.activeText } : { background: "#efeeea", color: "#404845" }}
                  >
                    {task.tag}
                  </span>
                )}
              </button>
            );
          })}
          {activeTasks.length === 0 && (
            <div className="bg-surface-container rounded-[22px] p-[22px] text-center text-[13.5px] text-outline">
              Rien sous cette étiquette
            </div>
          )}
        </div>

        {doneTasks.length > 0 && (
          <>
            <button
              onClick={() => setShowDoneTasks(prev => !prev)}
              className="w-full flex items-center gap-2.5 pt-4 pb-1.5"
            >
              <span className="text-[12.5px] font-semibold text-outline">Terminées ({doneTasks.length})</span>
              <span className="flex-1 h-px bg-surface-container-highest" />
              <svg className={`w-3 h-3 text-outline transition-transform ${showDoneTasks ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>
            {showDoneTasks && (
              <div className="flex flex-col gap-2 animate-[rise_.25s_ease-out]">
                {doneTasks.map(task => (
                  <div key={task.id} className="bg-surface-container rounded-[20px] px-4 py-3.5 flex items-center gap-3">
                    <span className="flex-none w-5 h-5 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center">✓</span>
                    <span className="flex-1 text-[13.5px] text-outline line-through">{task.content}</span>
                    <button
                      onClick={() => toggleTask(task.id, task.done)}
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
      </div>

      <div className="h-24" />

      {/* Task creation form (opened by FAB) */}
      {showTaskForm && (
        <div className="fixed inset-x-0 bottom-[98px] z-20 px-[18px]">
          <div className="max-w-lg mx-auto bg-white rounded-[26px] p-5 shadow-[0_12px_30px_rgba(56,100,88,.2)] space-y-3">
            <input
              autoFocus
              type="text"
              value={newTaskContent}
              onChange={(e) => setNewTaskContent(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addTask()}
              placeholder="Ajouter une tâche..."
              className="w-full bg-surface border border-outline-variant rounded-xl px-3 py-2 text-sm placeholder:text-outline focus:outline-none focus:border-primary"
            />
            <div className="flex gap-1.5 flex-wrap">
              {TAGS.map(tag => {
                const active = newTaskTag === tag;
                const style = TAG_STYLE[tag];
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setNewTaskTag(tag)}
                    className="px-2.5 py-1 rounded-full text-[10px] font-semibold"
                    style={active ? { background: style.activeBg, color: style.activeText } : { background: "#efeeea", color: "#404845" }}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setShowTaskForm(false); setNewTaskContent(""); }}
                className="flex-1 py-2.5 rounded-full text-xs font-semibold text-on-surface-variant bg-surface-container"
              >
                Annuler
              </button>
              <button
                onClick={addTask}
                className="flex-1 bg-primary text-on-primary py-2.5 rounded-full text-xs font-semibold"
              >
                Ajouter
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FAB */}
      {!showTaskForm && (
        <div className="fixed inset-x-0 bottom-[98px] pointer-events-none z-10">
          <div className="max-w-lg mx-auto relative h-0">
            <button
              onClick={() => setShowTaskForm(true)}
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
