export type Task = {
  id: string;
  texto: string;
  categoria: string;
  dia: string; // ISO date string, e.g. "2026-05-28"
  completada: boolean;
  created_at: string;
};

export type Habit = {
  id: string;
  nombre: string;
  completado: boolean;
  fecha: string; // ISO date string
  created_at: string;
};

export type Project = {
  id: string;
  nombre: string;
  deadline: string | null; // ISO date string
  progreso: number; // 0–100
  color: string | null;
  created_at: string;
};

export type Note = {
  id: string;
  contenido: string;
  project_id: string | null;
  created_at: string;
};

// Insert payloads (omit server-generated fields)
export type NewTask = Omit<Task, "id" | "created_at">;
export type NewHabit = Omit<Habit, "id" | "created_at">;
export type NewProject = Omit<Project, "id" | "created_at">;
export type NewNote = Omit<Note, "id" | "created_at">;

// Update payloads (all fields optional except id)
export type UpdateTask = Partial<NewTask>;
export type UpdateHabit = Partial<NewHabit>;
export type UpdateProject = Partial<NewProject>;
export type UpdateNote = Partial<NewNote>;
