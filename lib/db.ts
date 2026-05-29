import { supabase } from "./supabase";
import type {
  Task, NewTask, UpdateTask,
  Habit, NewHabit, UpdateHabit,
  Project, NewProject, UpdateProject,
  Note, NewNote, UpdateNote,
} from "./types";

// ─── Tasks ────────────────────────────────────────────────────────────────────

export async function getTasks(dia?: string): Promise<Task[]> {
  let q = supabase.from("tasks").select("*").order("created_at", { ascending: true });
  if (dia) q = q.eq("dia", dia);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function createTask(task: NewTask): Promise<Task> {
  const { data, error } = await supabase.from("tasks").insert(task).select().single();
  if (error) throw error;
  return data;
}

export async function updateTask(id: string, updates: UpdateTask): Promise<Task> {
  const { data, error } = await supabase.from("tasks").update(updates).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) throw error;
}

// ─── Habits ───────────────────────────────────────────────────────────────────

export async function getHabits(fecha?: string): Promise<Habit[]> {
  let q = supabase.from("habits").select("*").order("nombre", { ascending: true });
  if (fecha) q = q.eq("fecha", fecha);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function createHabit(habit: NewHabit): Promise<Habit> {
  const { data, error } = await supabase.from("habits").insert(habit).select().single();
  if (error) throw error;
  return data;
}

export async function updateHabit(id: string, updates: UpdateHabit): Promise<Habit> {
  const { data, error } = await supabase.from("habits").update(updates).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteHabit(id: string): Promise<void> {
  const { error } = await supabase.from("habits").delete().eq("id", id);
  if (error) throw error;
}

export async function deleteHabitsByName(nombre: string): Promise<void> {
  const { error } = await supabase.from("habits").delete().eq("nombre", nombre);
  if (error) throw error;
}

// ─── Projects ─────────────────────────────────────────────────────────────────

export async function getProjects(): Promise<Project[]> {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .order("deadline", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data;
}

export async function createProject(project: NewProject): Promise<Project> {
  const { data, error } = await supabase.from("projects").insert(project).select().single();
  if (error) throw error;
  return data;
}

export async function updateProject(id: string, updates: UpdateProject): Promise<Project> {
  const { data, error } = await supabase.from("projects").update(updates).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteProject(id: string): Promise<void> {
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) throw error;
}

// ─── Notes ────────────────────────────────────────────────────────────────────

export async function getNotes(projectId?: string): Promise<Note[]> {
  let q = supabase.from("notes").select("*").order("created_at", { ascending: false });
  if (projectId !== undefined) q = q.eq("project_id", projectId);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function createNote(note: NewNote): Promise<Note> {
  const { data, error } = await supabase.from("notes").insert(note).select().single();
  if (error) throw error;
  return data;
}

export async function updateNote(id: string, updates: UpdateNote): Promise<Note> {
  const { data, error } = await supabase.from("notes").update(updates).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteNote(id: string): Promise<void> {
  const { error } = await supabase.from("notes").delete().eq("id", id);
  if (error) throw error;
}
