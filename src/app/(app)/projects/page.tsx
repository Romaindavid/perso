"use client";

import { useEffect, useState } from "react";
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

const TAGS = ["Snooze SAS", "Admin & finance", "Arpentons", "La Grange"];

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [todos, setTodos] = useState<ProjectTodo[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  // New todo per project
  const [newTodo, setNewTodo] = useState<Record<string, string>>({});

  // New task
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

  // Project todo actions
  async function addTodo(projectId: string) {
    const text = newTodo[projectId]?.trim();
    if (!text) return;
    await supabase.from("project_todos").insert({ project_id: projectId, content: text });
    setNewTodo(prev => ({ ...prev, [projectId]: "" }));
    await loadAll();
  }

  async function toggleTodo(id: string, done: boolean) {
    await supabase.from("project_todos").update({ done: !done }).eq("id", id);
    setTodos(prev => prev.map(t => t.id === id ? { ...t, done: !done } : t));
  }

  async function deleteTodo(id: string) {
    await supabase.from("project_todos").delete().eq("id", id);
    setTodos(prev => prev.filter(t => t.id !== id));
  }

  // Task actions
  async function addTask() {
    if (!newTaskContent.trim()) return;
    await supabase.from("tasks").insert({ content: newTaskContent.trim(), tag: newTaskTag });
    setNewTaskContent("");
    await loadAll();
  }

  async function toggleTask(id: string, done: boolean) {
    await supabase.from("tasks").update({ done: !done }).eq("id", id);
    setTasks(prev => prev.map(t => t.id === id ? { ...t, done: !done } : t));
  }

  const filteredTasks = filterTag ? tasks.filter(t => t.tag === filterTag) : tasks;

  const tagColors: Record<string, string> = {
    "Snooze SAS": "bg-primary text-on-primary",
    "Admin & finance": "bg-tertiary-container text-on-tertiary-container",
    "Arpentons": "bg-secondary-container text-on-secondary-container",
    "La Grange": "bg-surface-container-highest text-on-surface",
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Avatar />
          <h1 className="text-xl font-bold tracking-tight">Projets</h1>
        </div>
      </div>

      {/* Projets cadencés */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-sm font-semibold text-on-surface-variant">Projets cadencés</h2>
          <span className="text-xs font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-full">
            {projects.length} actifs
          </span>
        </div>

        <div className="space-y-3">
          {projects.map(project => {
            const projectTodos = todos.filter(t => t.project_id === project.id);
            return (
              <div key={project.id} className="bg-white rounded-2xl p-5 shadow-[0px_10px_30px_rgba(94,139,126,0.08)]">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg">{project.icon}</span>
                  <span className="text-base font-bold">{project.name}</span>
                  {project.cadence && (
                    <span className="text-[10px] font-semibold bg-secondary-container text-on-secondary-container px-2 py-0.5 rounded-full ml-auto">
                      {project.cadence}
                    </span>
                  )}
                </div>

                <div className="flex gap-4 text-xs text-on-surface-variant mb-3">
                  <span>🕐 Dernière : {formatDate(project.last_edition)}</span>
                  <span className="text-primary font-medium">📅 Prochaine : {formatDate(project.next_edition)}</span>
                </div>

                {projectTodos.length > 0 && (
                  <div className="mb-3">
                    <p className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider mb-2">
                      To-do prochaine édition
                    </p>
                    <div className="space-y-1.5">
                      {projectTodos.map(todo => (
                        <div key={todo.id} className="flex items-center gap-2.5 group">
                          <button
                            onClick={() => toggleTodo(todo.id, todo.done)}
                            className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                              todo.done ? "bg-primary border-primary" : "border-outline-variant"
                            }`}
                          >
                            {todo.done && (
                              <svg className="w-3 h-3 text-on-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                              </svg>
                            )}
                          </button>
                          <span className={`text-sm flex-1 ${todo.done ? "line-through text-outline" : ""}`}>{todo.content}</span>
                          <button
                            onClick={() => deleteTodo(todo.id)}
                            className="opacity-0 group-hover:opacity-100 text-outline hover:text-error text-xs transition-opacity"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newTodo[project.id] || ""}
                    onChange={(e) => setNewTodo(prev => ({ ...prev, [project.id]: e.target.value }))}
                    onKeyDown={(e) => e.key === "Enter" && addTodo(project.id)}
                    placeholder="Ajouter une tâche..."
                    className="flex-1 bg-surface border border-outline-variant rounded-xl px-3 py-1.5 text-sm placeholder:text-outline focus:outline-none focus:border-primary"
                  />
                  <button
                    onClick={() => addTodo(project.id)}
                    className="text-primary text-sm font-semibold px-2"
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tâches */}
      <div>
        <h2 className="text-sm font-semibold text-on-surface-variant mb-3">Tâches</h2>

        {/* Add task */}
        <div className="bg-white rounded-2xl p-4 shadow-[0px_10px_30px_rgba(94,139,126,0.08)] mb-3 space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={newTaskContent}
              onChange={(e) => setNewTaskContent(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addTask()}
              placeholder="Ajouter une tâche..."
              className="flex-1 bg-surface border border-outline-variant rounded-xl px-3 py-2 text-sm placeholder:text-outline focus:outline-none focus:border-primary"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            {TAGS.map(tag => (
              <button
                key={tag}
                onClick={() => setNewTaskTag(tag)}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                  newTaskTag === tag ? tagColors[tag] || "bg-primary text-on-primary" : "bg-surface-container text-on-surface-variant"
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
          <button
            onClick={addTask}
            disabled={!newTaskContent.trim()}
            className="w-full bg-primary text-on-primary py-2 rounded-full text-xs font-semibold disabled:opacity-50"
          >
            Ajouter
          </button>
        </div>

        {/* Filter */}
        <div className="flex gap-2 flex-wrap mb-3">
          <button
            onClick={() => setFilterTag(null)}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
              !filterTag ? "bg-on-surface text-surface" : "bg-surface-container text-on-surface-variant"
            }`}
          >
            Tout
          </button>
          {TAGS.map(tag => (
            <button
              key={tag}
              onClick={() => setFilterTag(filterTag === tag ? null : tag)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                filterTag === tag ? tagColors[tag] || "bg-primary text-on-primary" : "bg-surface-container text-on-surface-variant"
              }`}
            >
              {tag}
            </button>
          ))}
        </div>

        {/* Task list */}
        <div className="space-y-2">
          {filteredTasks.map(task => (
            <div
              key={task.id}
              className="bg-white rounded-2xl px-4 py-3 shadow-[0px_10px_30px_rgba(94,139,126,0.08)] flex items-center gap-3"
            >
              <button
                onClick={() => toggleTask(task.id, task.done)}
                className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                  task.done ? "bg-primary border-primary" : "border-outline-variant"
                }`}
              >
                {task.done && (
                  <svg className="w-3 h-3 text-on-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                )}
              </button>
              <span className={`flex-1 text-sm ${task.done ? "line-through text-outline" : ""}`}>{task.content}</span>
              {task.tag && (
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${tagColors[task.tag] || "bg-surface-container text-on-surface-variant"}`}>
                  {task.tag}
                </span>
              )}
            </div>
          ))}
          {filteredTasks.length === 0 && (
            <p className="text-sm text-outline text-center py-6">Aucune tâche</p>
          )}
        </div>
      </div>
    </div>
  );
}
