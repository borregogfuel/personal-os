"use client";

import { useState, useEffect, useCallback, useRef, createContext, useContext } from "react";
import {
  getTasks, createTask as createTaskDB, updateTask, deleteTask as deleteTaskDB,
  getHabits, createHabit, updateHabit, deleteHabitsByName,
  getProjects, createProject as createProjectDB, updateProject as updateProjectDB, deleteProject as deleteProjectDB,
  getNotes, createNote, deleteNote as deleteNoteDB,
} from "@/lib/db";
import type { Task as DBTask, Habit as DBHabit, Project as DBProject, Note as DBNote } from "@/lib/types";
import { supabase } from "@/lib/supabase";

// ─── Static data ──────────────────────────────────────────────────────────────

const D = { user: { name: "Guillermo" } };

// ─── Theme tokens ─────────────────────────────────────────────────────────────

type Tokens = {
  page: string; bg: string; raised: string; sheet: string;
  ink: string; dim: string; faint: string; line: string; urgent: string;
};

function tokens(dark: boolean): Tokens {
  return dark ? {
    page: "#0e0c08", bg: "#16130d", raised: "#1f1b14", sheet: "#241f17",
    ink: "#f2ede2", dim: "#9a907e", faint: "#5c5547", line: "#2c271e", urgent: "#e0705f",
  } : {
    page: "#efece4", bg: "#faf8f3", raised: "#ffffff", sheet: "#fffdf8",
    ink: "#211e1a", dim: "#8c857a", faint: "#b8b1a5", line: "#e7e2d8", urgent: "#b23b2e",
  };
}

const TITLE_FONTS: Record<string, string> = {
  newsreader: "'Newsreader', Georgia, serif",
  caslon: "'Libre Caslon Display', Georgia, serif",
  spectral: "'Spectral', Georgia, serif",
  bricolage: "'Bricolage Grotesque', system-ui, sans-serif",
  hanken: "'Hanken Grotesk', system-ui, sans-serif",
};

const ACCENTS = ["#4f9e6e", "#c2683f", "#4f6fd0", "#8d5fb0"];
const PROJECT_COLORS = ["#4f9e6e", "#e8a838", "#ff9900", "#4f6fd0", "#8d5fb0", "#c0544d"];
const sans = "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";
const WEEK_DAYS = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"];

const getTodayIdx = () => (new Date().getDay() + 6) % 7;
const toISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// ─── Theme context ────────────────────────────────────────────────────────────

type ThemeCtxValue = { C: Tokens; titleFont: string; accent: string; dark: boolean };
const ThemeCtx = createContext<ThemeCtxValue>({} as ThemeCtxValue);
const useTheme = () => useContext(ThemeCtx);

// ─── App-level types ──────────────────────────────────────────────────────────

type FocusTask = { id: number; t: string; project: string; tag: string | null };
type AppTask   = { id: number; t: string; done: boolean; urgent: boolean; categoria: string };
type AppWeekDay = { day: string; date: number; today: boolean; isoDate: string; tasks: AppTask[] };
type AppHabitDay = { id: number | null; done: boolean };
type AppHabit  = { name: string; streak: number; days: AppHabitDay[] };
type AppProject = { id: number; name: string; pct: number; deadline: string; due: string; urgent: boolean; color: string | null };
type AppNote   = { id: number; project: string; title: string; body: string; time: string };

// ─── Data-mapping helpers ─────────────────────────────────────────────────────

function getWeekISOs(): string[] {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const monday = new Date(today);
  monday.setDate(today.getDate() - getTodayIdx());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday); d.setDate(monday.getDate() + i); return toISO(d);
  });
}

function buildWeek(tasks: DBTask[]): AppWeekDay[] {
  const todayISO = toISO(new Date());
  return getWeekISOs().map((isoDate, i) => {
    const d = new Date(isoDate + "T12:00:00");
    return {
      day: WEEK_DAYS[i], date: d.getDate(),
      today: isoDate === todayISO, isoDate,
      tasks: tasks
        .filter(t => t.dia === isoDate)
        .map(t => ({ id: t.id, t: t.texto, done: t.completada, urgent: false, categoria: t.categoria })),
    };
  });
}

function buildHabits(entries: DBHabit[]): AppHabit[] {
  const weekISOs = getWeekISOs();
  const names = [...new Set(entries.map(e => e.nombre))];
  return names.map(name => {
    const byDate = new Map(entries.filter(e => e.nombre === name).map(e => [e.fecha, e]));
    const days: AppHabitDay[] = weekISOs.map(iso => {
      const e = byDate.get(iso);
      return { id: e?.id ?? null, done: e?.completado ?? false };
    });
    const completedSet = new Set(
      entries.filter(e => e.nombre === name && e.completado).map(e => e.fecha)
    );
    let streak = 0;
    const d = new Date(); d.setHours(0, 0, 0, 0);
    while (completedSet.has(toISO(d))) { streak++; d.setDate(d.getDate() - 1); }
    return { name, streak, days };
  });
}

function formatDue(isoDeadline: string | null): { deadline: string; due: string; urgent: boolean } {
  if (!isoDeadline) return { deadline: "—", due: "—", urgent: false };
  const dl = new Date(isoDeadline + "T12:00:00");
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((dl.getTime() - today.getTime()) / 86400000);
  const deadline = dl.toLocaleDateString("es-MX", { day: "numeric", month: "short" }).replace(".", "");
  const due = diff === 0 ? "hoy" : diff < 0 ? `hace ${-diff}d` : `en ${diff} días`;
  return { deadline, due, urgent: diff >= 0 && diff <= 3 };
}

function relativeTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (diff === 0) return "hoy";
  if (diff === 1) return "ayer";
  return `${diff}d`;
}

function mapProjects(rows: DBProject[]): AppProject[] {
  return rows.map(p => ({ id: p.id, name: p.nombre, pct: p.progreso, color: p.color, ...formatDue(p.deadline) }));
}

function mapNotes(rows: DBNote[], projectMap: Map<number, string>): AppNote[] {
  return rows.map(n => {
    const [firstLine, ...rest] = n.contenido.split("\n");
    return {
      id: n.id,
      project: n.project_id ? (projectMap.get(n.project_id) ?? "Proyecto") : "Personal",
      title: firstLine,
      body: rest.join("\n").trim(),
      time: relativeTime(n.created_at),
    };
  });
}

// ─── Shared state ─────────────────────────────────────────────────────────────

function useOSState() {
  const [loading, setLoading] = useState(true);
  const [focusTasks, setFocusTasks] = useState<FocusTask[]>([]);
  const [pulse, setPulse] = useState(false);
  const [week, setWeek] = useState<AppWeekDay[]>([]);
  const [habits, setHabits] = useState<AppHabit[]>([]);
  const [projects, setProjects] = useState<AppProject[]>([]);
  const [notes, setNotes] = useState<AppNote[]>([]);
  const rawProjectsRef = useRef<DBProject[]>([]);

  useEffect(() => {
    async function load() {
      const [rawTasks, rawHabits, rawProjects, rawNotes] = await Promise.all([
        getTasks(), getHabits(), getProjects(), getNotes(),
      ]);
      rawProjectsRef.current = rawProjects;
      const builtProjects = mapProjects(rawProjects);
      const projectMap = new Map(rawProjects.map(p => [p.id, p.nombre]));
      const builtWeek = buildWeek(rawTasks);
      const todayTasks = builtWeek.find(d => d.today)?.tasks ?? [];
      setWeek(builtWeek);
      setHabits(buildHabits(rawHabits));
      setProjects(builtProjects);
      setNotes(mapNotes(rawNotes, projectMap));
      setFocusTasks(
        todayTasks.filter(t => !t.done).map(t => ({ id: t.id, t: t.t, project: t.categoria, tag: null }))
      );
      setLoading(false);
    }
    load().catch(console.error);
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("personal-os-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, ({ eventType, new: n, old: o }) => {
        if (eventType === "INSERT") {
          const row = n as DBTask;
          if (!getWeekISOs().includes(row.dia)) return;
          const task: AppTask = { id: row.id, t: row.texto, done: row.completada, urgent: false, categoria: row.categoria };
          setWeek(w => {
            if (w.some(d => d.tasks.some(t => t.id === row.id))) return w;
            return w.map(d => d.isoDate !== row.dia ? d : { ...d, tasks: [...d.tasks, task] });
          });
          if (row.dia === toISO(new Date()) && !row.completada) {
            setFocusTasks(ft => {
              if (ft.some(f => f.id === row.id)) return ft;
              return [...ft, { id: row.id, t: row.texto, project: row.categoria, tag: null }];
            });
          }
        } else if (eventType === "UPDATE") {
          const row = n as DBTask;
          setWeek(w => w.map(d => ({
            ...d,
            tasks: d.tasks.map(t => t.id === row.id ? { ...t, t: row.texto, done: row.completada, categoria: row.categoria } : t),
          })));
          if (row.completada) setFocusTasks(ft => ft.filter(f => f.id !== row.id));
        } else if (eventType === "DELETE") {
          const id = (o as DBTask).id;
          setWeek(w => w.map(d => ({ ...d, tasks: d.tasks.filter(t => t.id !== id) })));
          setFocusTasks(ft => ft.filter(f => f.id !== id));
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "habits" }, () => {
        getHabits().then(rows => setHabits(buildHabits(rows))).catch(console.error);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, ({ eventType, new: n, old: o }) => {
        if (eventType === "INSERT") {
          const row = n as DBProject;
          rawProjectsRef.current = [...rawProjectsRef.current, row];
          const proj = mapProjects([row])[0];
          setProjects(ps => ps.some(p => p.id === row.id) ? ps : [...ps, proj]);
        } else if (eventType === "UPDATE") {
          const row = n as DBProject;
          rawProjectsRef.current = rawProjectsRef.current.map(p => p.id === row.id ? row : p);
          const proj = mapProjects([row])[0];
          setProjects(ps => ps.map(p => p.id === row.id ? proj : p));
        } else if (eventType === "DELETE") {
          const id = (o as DBProject).id;
          rawProjectsRef.current = rawProjectsRef.current.filter(p => p.id !== id);
          setProjects(ps => ps.filter(p => p.id !== id));
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "notes" }, ({ eventType, new: n, old: o }) => {
        const projectMap = new Map(rawProjectsRef.current.map(p => [p.id, p.nombre]));
        if (eventType === "INSERT") {
          const row = n as DBNote;
          const note = mapNotes([row], projectMap)[0];
          setNotes(ns => ns.some(nt => nt.id === row.id) ? ns : [note, ...ns]);
        } else if (eventType === "UPDATE") {
          const row = n as DBNote;
          const note = mapNotes([row], projectMap)[0];
          setNotes(ns => ns.map(nt => nt.id === row.id ? note : nt));
        } else if (eventType === "DELETE") {
          const id = (o as DBNote).id;
          setNotes(ns => ns.filter(nt => nt.id !== id));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  return {
    loading, focusTasks, pulse, week, habits, projects, notes,

    completeFocus: () => {
      if (!focusTasks.length) return;
      const task = focusTasks[0];
      setPulse(true);
      setTimeout(() => { setFocusTasks(x => x.slice(1)); setPulse(false); }, 220);
      setWeek(w => w.map(d => ({ ...d, tasks: d.tasks.map(t => t.id === task.id ? { ...t, done: true } : t) })));
      updateTask(task.id, { completada: true }).catch(console.error);
    },

    skipFocus: () => setFocusTasks(x => x.length > 1 ? [...x.slice(1), x[0]] : x),

    toggleWeek: (di: number, ti: number) => {
      const task = week[di]?.tasks[ti]; if (!task) return;
      const newDone = !task.done;
      setWeek(w => w.map((d, i) => i !== di ? d : ({
        ...d, tasks: d.tasks.map((t, j) => j !== ti ? t : { ...t, done: newDone }),
      })));
      if (newDone) setFocusTasks(ft => ft.filter(f => f.id !== task.id));
      else setFocusTasks(ft => [...ft, { id: task.id, t: task.t, project: task.categoria, tag: null }]);
      updateTask(task.id, { completada: newDone }).catch(console.error);
    },

    addTask: (text: string, categoria: string, dia: string) => {
      const todayISO = toISO(new Date());
      const optimistic: AppTask = { id: Date.now(), t: text, done: false, urgent: false, categoria };
      setWeek(w => w.map(d => d.isoDate !== dia ? d : { ...d, tasks: [...d.tasks, optimistic] }));
      if (dia === todayISO) {
        setFocusTasks(ft => [...ft, { id: optimistic.id, t: text, project: categoria, tag: null }]);
      }
      createTaskDB({ texto: text, categoria, dia, completada: false })
        .then(row => {
          setWeek(w => w.map(d => d.isoDate !== dia ? d : {
            ...d, tasks: d.tasks.map(t => t.id === optimistic.id ? { ...t, id: row.id } : t),
          }));
          if (dia === todayISO) {
            setFocusTasks(ft => ft.map(f => f.id === optimistic.id ? { ...f, id: row.id } : f));
          }
        })
        .catch(console.error);
    },

    removeTask: (id: number) => {
      setWeek(w => w.map(d => ({ ...d, tasks: d.tasks.filter(t => t.id !== id) })));
      setFocusTasks(ft => ft.filter(f => f.id !== id));
      deleteTaskDB(id).catch(console.error);
    },

    toggleHabit: (hi: number) => {
      const h = habits[hi]; const todayIdx = getTodayIdx();
      const entry = h.days[todayIdx]; const newDone = !entry.done;
      setHabits(hs => hs.map((hab, i) => {
        if (i !== hi) return hab;
        const newDays = hab.days.map((d, j) => j === todayIdx ? { ...d, done: newDone } : d);
        return { ...hab, days: newDays, streak: hab.streak + (newDone ? 1 : -1) };
      }));
      const todayISO = toISO(new Date());
      if (entry.id === null) {
        createHabit({ nombre: h.name, completado: true, fecha: todayISO })
          .then(row => setHabits(hs => hs.map((hab, i) => {
            if (i !== hi) return hab;
            const newDays = hab.days.map((d, j) => j === todayIdx ? { id: row.id, done: true } : d);
            return { ...hab, days: newDays };
          })))
          .catch(console.error);
      } else {
        updateHabit(entry.id, { completado: newDone }).catch(console.error);
      }
    },

    addHabit: (name: string) => {
      const todayISO = toISO(new Date());
      const todayIdx = getTodayIdx();
      const newHabit: AppHabit = { name, streak: 0, days: Array.from({ length: 7 }, () => ({ id: null, done: false })) };
      setHabits(hs => [...hs, newHabit]);
      createHabit({ nombre: name, completado: false, fecha: todayISO })
        .then(row => setHabits(hs => hs.map(h => h.name !== name ? h : {
          ...h, days: h.days.map((d, i) => i === todayIdx ? { id: row.id, done: false } : d),
        })))
        .catch(console.error);
    },

    removeHabit: (name: string) => {
      setHabits(hs => hs.filter(h => h.name !== name));
      deleteHabitsByName(name).catch(console.error);
    },

    addNote: (v: string) => {
      const optimistic: AppNote = { id: Date.now(), project: "Personal", title: v, body: "", time: "ahora" };
      setNotes(n => [optimistic, ...n]);
      createNote({ contenido: v, project_id: null })
        .then(row => setNotes(n => n.map(nt => nt.id === optimistic.id ? { ...nt, id: row.id } : nt)))
        .catch(console.error);
    },

    removeNote: (id: number) => {
      setNotes(ns => ns.filter(n => n.id !== id));
      deleteNoteDB(id).catch(console.error);
    },

    addProject: (data: { nombre: string; deadline: string | null; progreso: number; color: string }) => {
      const optimistic: AppProject = {
        id: Date.now(), name: data.nombre, pct: data.progreso, color: data.color,
        ...formatDue(data.deadline),
      };
      setProjects(ps => [...ps, optimistic]);
      createProjectDB(data)
        .then(row => setProjects(ps => ps.map(p => p.id === optimistic.id ? { ...p, id: row.id } : p)))
        .catch(console.error);
    },

    setProjectProgress: (id: number, pct: number) => {
      setProjects(ps => ps.map(p => p.id !== id ? p : { ...p, pct }));
      updateProjectDB(id, { progreso: pct }).catch(console.error);
    },

    removeProject: (id: number) => {
      setProjects(ps => ps.filter(p => p.id !== id));
      deleteProjectDB(id).catch(console.error);
    },
  };
}

// ─── Clock & date helpers ─────────────────────────────────────────────────────

const fmtClock = () => new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false });
const fmtDateShort = () => {
  const d = new Date();
  const wd = d.toLocaleDateString("es-MX", { weekday: "short" }).replace(".", "");
  const mo = d.toLocaleDateString("es-MX", { month: "short" }).replace(".", "");
  return `${wd} ${d.getDate()} ${mo}`.toUpperCase();
};
const fmtDateLong = () => {
  const d = new Date();
  const s = d.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
};
const parseDue = (s: string) => { const m = String(s).match(/\d+/); return m ? +m[0] : 999; };

// ─── Icons ────────────────────────────────────────────────────────────────────

const SunIcon = ({ c }: { c: string }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
  </svg>
);
const MoonIcon = ({ c }: { c: string }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 14.5A8 8 0 0 1 9.5 4 7 7 0 1 0 20 14.5z" />
  </svg>
);

const OSIcon = {
  focus: ({ s = 22, sw = 1.6 }: { s?: number; sw?: number }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none" />
    </svg>
  ),
  week: ({ s = 22, sw = 1.6 }: { s?: number; sw?: number }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw}>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <line x1="4" y1="9.5" x2="20" y2="9.5" />
      <line x1="9" y1="3" x2="9" y2="6.5" /><line x1="15" y1="3" x2="15" y2="6.5" />
    </svg>
  ),
  habits: ({ s = 22, sw = 1.6 }: { s?: number; sw?: number }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round">
      <line x1="6" y1="18" x2="6" y2="13" /><line x1="12" y1="18" x2="12" y2="8" /><line x1="18" y1="18" x2="18" y2="4" />
    </svg>
  ),
  projects: ({ s = 22, sw = 1.6 }: { s?: number; sw?: number }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw}>
      <rect x="4" y="4" width="16" height="6" rx="1.5" />
      <rect x="4" y="14" width="16" height="6" rx="1.5" />
    </svg>
  ),
  notes: ({ s = 22, sw = 1.6 }: { s?: number; sw?: number }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round">
      <rect x="5" y="4" width="14" height="16" rx="2" />
      <line x1="8.5" y1="9" x2="15.5" y2="9" /><line x1="8.5" y1="12.5" x2="15.5" y2="12.5" /><line x1="8.5" y1="16" x2="12.5" y2="16" />
    </svg>
  ),
};

const OS_TABS: [keyof typeof OSIcon, string][] = [
  ["focus", "Enfoque"],
  ["week", "Semana"],
  ["habits", "Hábitos"],
  ["projects", "Proyectos"],
  ["notes", "Notas"],
];

// ─── Shared atoms ─────────────────────────────────────────────────────────────

function Eyebrow({ children, color, style }: { children: React.ReactNode; color?: string; style?: React.CSSProperties }) {
  const { C } = useTheme();
  return (
    <div style={{ fontSize: 10.5, letterSpacing: 2, textTransform: "uppercase",
      color: color || C.dim, marginBottom: 8, fontWeight: 600, ...style }}>
      {children}
    </div>
  );
}

function TitleH({ children, size = 38, style }: { children: React.ReactNode; size?: number; style?: React.CSSProperties }) {
  const { C, titleFont } = useTheme();
  return (
    <div style={{ fontFamily: titleFont, fontSize: size, lineHeight: 1.0,
      letterSpacing: -0.4, color: C.ink, fontWeight: 500, ...style }}>
      {children}
    </div>
  );
}

function Dot({ done, urgent, onClick, ring }: { done: boolean; urgent?: boolean; onClick?: () => void; ring?: boolean }) {
  const { C, accent } = useTheme();
  return (
    <span onClick={onClick} style={{ flex: "0 0 auto", width: 18, height: 18, borderRadius: "50%", marginTop: 2,
      border: `1.5px solid ${done ? accent : urgent ? C.urgent : C.faint}`,
      background: done ? accent : "transparent", display: "flex", alignItems: "center",
      justifyContent: "center", cursor: onClick ? "pointer" : "default",
      boxShadow: ring ? `0 0 0 2px ${C.raised}, 0 0 0 3px ${C.faint}` : "none", transition: "all .15s" }}>
      {done && (
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke={C.bg} strokeWidth="1.8">
          <path d="M1.5 5L4 7.5L8.5 2" />
        </svg>
      )}
    </span>
  );
}

function DeleteBtn({ onClick }: { onClick: () => void }) {
  const { C } = useTheme();
  return (
    <button
      onClick={e => { e.stopPropagation(); onClick(); }}
      onMouseEnter={e => (e.currentTarget.style.color = C.urgent)}
      onMouseLeave={e => (e.currentTarget.style.color = C.faint)}
      style={{ border: "none", background: "transparent", color: C.faint, cursor: "pointer",
        padding: "0 3px", fontSize: 16, lineHeight: 1, borderRadius: 4, fontFamily: sans,
        transition: "color .15s", flex: "0 0 auto" }}>
      ×
    </button>
  );
}

// ─── Desktop Card ─────────────────────────────────────────────────────────────

function Card({ title, action, children, pad = 24, style }: {
  title?: string; action?: React.ReactNode; children: React.ReactNode;
  pad?: number; style?: React.CSSProperties;
}) {
  const { C } = useTheme();
  return (
    <div style={{ background: C.raised, border: `1px solid ${C.line}`, borderRadius: 20, padding: pad, ...style }}>
      {(title || action) && (
        <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
          <Eyebrow style={{ marginBottom: 0 }}>{title}</Eyebrow>
          {action && <div style={{ marginLeft: "auto" }}>{action}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

// ─── Mobile scroll wrapper ────────────────────────────────────────────────────

function Scroll({ children }: { children: React.ReactNode }) {
  return (
    <div className="os-scroll" style={{ height: "100%", overflowY: "auto", padding: "8px 24px 28px" }}>
      {children}
    </div>
  );
}

// ─── Desktop view wrapper ────────────────────────────────────────────────────

function View({ children }: { children: React.ReactNode }) {
  return (
    <div className="os-scroll" style={{ flex: 1, overflowY: "auto", padding: "44px 56px 56px" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>{children}</div>
    </div>
  );
}

function ViewHead({ title, right }: { title: string; right?: React.ReactNode }) {
  const { C } = useTheme();
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
      <TitleH size={46}>{title}</TitleH>
      {right && <div style={{ paddingBottom: 8 }}>{right}</div>}
    </div>
  );
}

// ─── Modal ───────────────────────────────────────────────────────────────────

function Modal({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const { C } = useTheme();
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)",
      zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.raised, border: `1px solid ${C.line}`,
        borderRadius: 20, padding: 28, width: "100%", maxWidth: 420 }}>
        {children}
      </div>
    </div>
  );
}

// ─── Project form modal ───────────────────────────────────────────────────────

function ProjectFormModal({ onClose, onAdd }: {
  onClose: () => void;
  onAdd: (data: { nombre: string; deadline: string | null; progreso: number; color: string }) => void;
}) {
  const { C, titleFont, accent } = useTheme();
  const [nombre, setNombre] = useState("");
  const [deadline, setDeadline] = useState("");
  const [progreso, setProgreso] = useState(0);
  const [color, setColor] = useState(PROJECT_COLORS[0]);

  const submit = () => {
    const n = nombre.trim();
    if (!n) return;
    onAdd({ nombre: n, deadline: deadline || null, progreso, color });
    onClose();
  };

  const inp: React.CSSProperties = {
    width: "100%", border: `1px solid ${C.line}`, borderRadius: 10,
    padding: "11px 14px", fontSize: 14, background: C.bg, color: C.ink,
    fontFamily: sans, outline: "none", boxSizing: "border-box",
  };

  return (
    <Modal onClose={onClose}>
      <div style={{ fontFamily: titleFont, fontSize: 22, color: C.ink, marginBottom: 22 }}>Nuevo proyecto</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <input autoFocus value={nombre} onChange={e => setNombre(e.target.value)}
          onKeyDown={e => e.key === "Enter" && submit()}
          placeholder="Nombre del proyecto" style={inp} />
        <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} style={inp} />
        <div>
          <div style={{ fontSize: 11, color: C.dim, marginBottom: 8, letterSpacing: 1.5, textTransform: "uppercase" }}>Color</div>
          <div style={{ display: "flex", gap: 8 }}>
            {PROJECT_COLORS.map(c => (
              <button key={c} onClick={() => setColor(c)} style={{ width: 26, height: 26, borderRadius: "50%",
                background: c, border: `2.5px solid ${c === color ? C.ink : "transparent"}`,
                cursor: "pointer", transition: "border .15s" }} />
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: C.dim, marginBottom: 8, letterSpacing: 1.5, textTransform: "uppercase" }}>
            Progreso: {progreso}%
          </div>
          <input type="range" min="0" max="100" value={progreso}
            onChange={e => setProgreso(+e.target.value)}
            style={{ width: "100%", accentColor: color }} />
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <button onClick={submit} style={{ flex: 1, padding: "12px 0", background: C.ink, color: C.bg,
            border: "none", borderRadius: 10, fontSize: 14, fontWeight: 600, fontFamily: sans, cursor: "pointer" }}>
            Crear
          </button>
          <button onClick={onClose} style={{ padding: "12px 18px", background: "transparent",
            border: `1px solid ${C.line}`, borderRadius: 10, color: C.dim, fontSize: 14,
            fontFamily: sans, cursor: "pointer" }}>
            Cancelar
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── State type ───────────────────────────────────────────────────────────────

type OSState = ReturnType<typeof useOSState>;

// ══════════════════════════════════════════════════════════════════════════════
// MOBILE SCREENS
// ══════════════════════════════════════════════════════════════════════════════

function MobileFocus({ st }: { st: OSState }) {
  const { C, titleFont, accent } = useTheme();
  if (!st.focusTasks.length) return (
    <Scroll>
      <Eyebrow>Ahorita</Eyebrow>
      <div style={{ marginTop: 60, textAlign: "center" }}>
        <div style={{ fontFamily: titleFont, fontSize: 40, color: C.ink, marginBottom: 10 }}>Todo hecho.</div>
        <div style={{ color: C.dim, fontSize: 15 }}>Cierra la laptop. Ve al gym.</div>
      </div>
    </Scroll>
  );
  const now = st.focusTasks[0], rest = st.focusTasks.slice(1);
  return (
    <Scroll>
      <Eyebrow>Ahorita</Eyebrow>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16, fontSize: 12.5, color: C.dim }}>
        <span style={{ color: accent, fontWeight: 600 }}>{now.project}</span>
        {now.tag && <><span>·</span><span>{now.tag}</span></>}
        <span style={{ marginLeft: "auto", fontVariantNumeric: "tabular-nums" }}>⏱ —</span>
      </div>
      <div style={{ fontFamily: titleFont, fontSize: 31, lineHeight: 1.14, letterSpacing: -0.3,
        color: C.ink, opacity: st.pulse ? 0.25 : 1, transform: st.pulse ? "translateY(-6px)" : "none",
        transition: "all .2s" }}>{now.t}</div>
      <div style={{ display: "flex", gap: 10, marginTop: 30 }}>
        <button onClick={st.completeFocus} style={{ flex: 1, padding: "14px 0", background: C.ink, color: C.bg,
          border: "none", borderRadius: 30, fontSize: 14, fontWeight: 600, fontFamily: sans, cursor: "pointer" }}>
          Hecho ✓
        </button>
        <button onClick={st.skipFocus} style={{ padding: "14px 22px", background: "transparent",
          border: `1px solid ${C.line}`, borderRadius: 30, color: C.dim, fontSize: 14, fontFamily: sans, cursor: "pointer" }}>
          Saltar
        </button>
      </div>
      {rest.length > 0 && (
        <>
          <div style={{ height: 1, background: C.line, margin: "30px 0 18px" }} />
          <Eyebrow>Después · {rest.length}</Eyebrow>
          {rest.map((q, i) => (
            <div key={i} style={{ display: "flex", gap: 14, padding: "13px 0",
              borderBottom: i < rest.length - 1 ? `1px solid ${C.line}` : "none", alignItems: "baseline" }}>
              <span style={{ fontFamily: titleFont, fontSize: 20, color: C.faint, width: 18 }}>{i + 1}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14.5, lineHeight: 1.3, color: C.ink }}>{q.t}</div>
                <div style={{ fontSize: 11.5, color: C.dim, marginTop: 2 }}>{q.project}</div>
              </div>
            </div>
          ))}
        </>
      )}
    </Scroll>
  );
}

function MobileWeek({ st }: { st: OSState }) {
  const { C, titleFont, accent } = useTheme();
  const [addingDay, setAddingDay] = useState<string | null>(null);
  const [taskDraft, setTaskDraft] = useState("");

  const submitTask = (isoDate: string) => {
    const v = taskDraft.trim();
    if (v) st.addTask(v, "Personal", isoDate);
    setTaskDraft("");
    setAddingDay(null);
  };

  return (
    <Scroll>
      <TitleH size={38}>Esta semana</TitleH>
      <div style={{ display: "flex", flexDirection: "column", marginTop: 18 }}>
        {st.week.map((d, di) => (
          <div key={di} style={{ padding: "12px 0", borderBottom: `1px solid ${C.line}` }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: d.tasks.length || addingDay === d.isoDate ? 8 : 0 }}>
              <span style={{ fontFamily: titleFont, fontSize: 22, color: d.today ? accent : C.ink,
                lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{d.date}</span>
              <span style={{ fontSize: 11, letterSpacing: 1.5, color: d.today ? accent : C.dim,
                textTransform: "uppercase", fontWeight: 600 }}>{d.day}{d.today ? " · hoy" : ""}</span>
            </div>
            {d.tasks.map((t, ti) => (
              <div key={ti} style={{ display: "flex", gap: 12, padding: "6px 0", alignItems: "flex-start" }}>
                <Dot done={t.done} urgent={t.urgent} onClick={() => st.toggleWeek(di, ti)} />
                <span onClick={() => st.toggleWeek(di, ti)} style={{ flex: 1, fontSize: 14, lineHeight: 1.35,
                  color: t.done ? C.faint : t.urgent ? C.urgent : C.ink,
                  textDecoration: t.done ? "line-through" : "none", transition: "color .15s", cursor: "pointer" }}>{t.t}</span>
                <DeleteBtn onClick={() => st.removeTask(t.id)} />
              </div>
            ))}
            {addingDay === d.isoDate ? (
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <input autoFocus value={taskDraft} onChange={e => setTaskDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") submitTask(d.isoDate); if (e.key === "Escape") setAddingDay(null); }}
                  onBlur={() => { if (!taskDraft.trim()) setAddingDay(null); }}
                  placeholder="Nueva tarea…"
                  style={{ flex: 1, border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 10px",
                    fontSize: 13, background: C.raised, color: C.ink, fontFamily: sans, outline: "none" }} />
                <button onClick={() => submitTask(d.isoDate)}
                  style={{ border: "none", background: accent, color: "#fff", borderRadius: 8,
                    padding: "0 12px", fontSize: 18, cursor: "pointer" }}>+</button>
              </div>
            ) : (
              <button onClick={() => { setAddingDay(d.isoDate); setTaskDraft(""); }}
                style={{ marginTop: 4, border: "none", background: "transparent", color: C.faint,
                  fontSize: 12, cursor: "pointer", padding: "2px 0", fontFamily: sans }}>
                + tarea
              </button>
            )}
          </div>
        ))}
      </div>
    </Scroll>
  );
}

function MobileHabits({ st }: { st: OSState }) {
  const { C, titleFont, accent } = useTheme();
  const [adding, setAdding] = useState(false);
  const [habitInput, setHabitInput] = useState("");

  const submitHabit = () => {
    const v = habitInput.trim();
    if (v) st.addHabit(v);
    setHabitInput("");
    setAdding(false);
  };

  return (
    <Scroll>
      <TitleH size={38}>Hábitos</TitleH>
      <div style={{ fontSize: 12.5, color: C.dim, marginTop: 8, marginBottom: 10 }}>Toca el cuadro de hoy para marcar.</div>
      {st.habits.map((h, hi) => (
        <div key={hi} style={{ padding: "18px 0", borderBottom: `1px solid ${C.line}`,
          display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 15, color: C.ink }}>{h.name}</span>
              <DeleteBtn onClick={() => st.removeHabit(h.name)} />
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {h.days.map((day, j) => {
                const isToday = j === getTodayIdx();
                return (
                  <span key={j} onClick={() => isToday && st.toggleHabit(hi)}
                    style={{ width: 13, height: 13, borderRadius: "50%",
                      background: day.done ? accent : "transparent",
                      border: day.done ? "none" : `1.5px solid ${C.line}`,
                      opacity: day.done && isToday ? 0.55 : 1,
                      boxShadow: isToday ? `0 0 0 2px ${C.bg}, 0 0 0 3px ${C.faint}` : "none",
                      cursor: isToday ? "pointer" : "default", transition: "all .15s",
                      display: "inline-block" }} />
                );
              })}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: titleFont, fontSize: 34, lineHeight: 0.9, color: accent,
              fontVariantNumeric: "tabular-nums" }}>{h.streak}</div>
            <div style={{ fontSize: 9.5, letterSpacing: 1.5, textTransform: "uppercase", color: C.dim, marginTop: 3 }}>días</div>
          </div>
        </div>
      ))}
      <div style={{ paddingTop: 16 }}>
        {adding ? (
          <div style={{ display: "flex", gap: 8 }}>
            <input autoFocus value={habitInput} onChange={e => setHabitInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") submitHabit(); if (e.key === "Escape") setAdding(false); }}
              onBlur={() => { if (!habitInput.trim()) setAdding(false); }}
              placeholder="Nombre del hábito…"
              style={{ flex: 1, border: `1px solid ${C.line}`, borderRadius: 10, padding: "12px 14px",
                fontSize: 14, background: C.raised, color: C.ink, fontFamily: sans, outline: "none" }} />
            <button onClick={submitHabit}
              style={{ border: "none", background: accent, color: "#fff", borderRadius: 10,
                width: 44, fontSize: 20, cursor: "pointer" }}>+</button>
          </div>
        ) : (
          <button onClick={() => setAdding(true)}
            style={{ border: `1px dashed ${C.line}`, background: "transparent", color: C.dim,
              borderRadius: 10, padding: "12px 0", width: "100%", fontSize: 14,
              fontFamily: sans, cursor: "pointer" }}>
            + hábito
          </button>
        )}
      </div>
    </Scroll>
  );
}

function MobileProjects({ st }: { st: OSState }) {
  const { C, titleFont, accent } = useTheme();
  const [showModal, setShowModal] = useState(false);
  return (
    <Scroll>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <TitleH size={38}>Proyectos</TitleH>
        <button onClick={() => setShowModal(true)}
          style={{ border: "none", background: accent, color: "#fff", borderRadius: 10,
            padding: "8px 14px", fontSize: 13, fontWeight: 600, fontFamily: sans, cursor: "pointer" }}>
          + nuevo
        </button>
      </div>
      <div>
        {st.projects.map((p) => (
          <div key={p.id} style={{ padding: "16px 0", borderBottom: `1px solid ${C.line}` }}>
            <div style={{ display: "flex", alignItems: "baseline", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, flex: 1 }}>
                {p.color && <span style={{ width: 8, height: 8, borderRadius: "50%", background: p.color, flex: "0 0 8px" }} />}
                <span style={{ fontSize: 16, color: C.ink }}>{p.name}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontFamily: titleFont, fontSize: 24, lineHeight: 1, fontVariantNumeric: "tabular-nums",
                  color: p.urgent ? C.urgent : C.ink }}>{p.pct}<span style={{ fontSize: 14 }}>%</span></span>
                <DeleteBtn onClick={() => st.removeProject(p.id)} />
              </div>
            </div>
            <div style={{ height: 3, background: C.line, borderRadius: 2, overflow: "hidden", marginBottom: 8 }}>
              <div style={{ width: p.pct + "%", height: "100%", background: p.urgent ? C.urgent : (p.color ?? accent) }} />
            </div>
            <input type="range" min="0" max="100" value={p.pct}
              onChange={e => st.setProjectProgress(p.id, +e.target.value)}
              style={{ width: "100%", accentColor: p.color ?? accent, display: "block", marginBottom: 6 }} />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5 }}>
              <span style={{ color: p.urgent ? C.urgent : C.dim }}>{p.deadline} · {p.due}</span>
            </div>
          </div>
        ))}
      </div>
      {showModal && (
        <ProjectFormModal onClose={() => setShowModal(false)} onAdd={st.addProject} />
      )}
    </Scroll>
  );
}

function MobileNotes({ st }: { st: OSState }) {
  const { C, titleFont, accent } = useTheme();
  const [draft, setDraft] = useState("");
  const add = () => { const v = draft.trim(); if (!v) return; st.addNote(v); setDraft(""); };
  return (
    <Scroll>
      <TitleH size={38}>Notas</TitleH>
      <div style={{ display: "flex", gap: 8, margin: "18px 0 22px" }}>
        <input value={draft} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()} placeholder="Captura una idea…"
          style={{ flex: 1, border: `1px solid ${C.line}`, borderRadius: 12, padding: "13px 15px",
            fontSize: 14, background: C.raised, color: C.ink, fontFamily: sans, outline: "none" }} />
        <button onClick={add} style={{ border: "none", background: accent, color: "#fff",
          borderRadius: 12, width: 46, fontSize: 22, cursor: "pointer", flex: "0 0 46px" }}>+</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {st.notes.map((nt) => (
          <div key={nt.id} style={{ borderBottom: `1px solid ${C.line}`, paddingBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 5 }}>
              <span style={{ fontSize: 10.5, letterSpacing: 1, textTransform: "uppercase", color: accent, fontWeight: 600 }}>{nt.project}</span>
              <span style={{ marginLeft: "auto", fontSize: 11, color: C.faint }}>{nt.time}</span>
              <DeleteBtn onClick={() => st.removeNote(nt.id)} />
            </div>
            <div style={{ fontFamily: titleFont, fontSize: 21, lineHeight: 1.1, marginBottom: nt.body ? 5 : 0, color: C.ink }}>{nt.title}</div>
            {nt.body && <div style={{ fontSize: 13, lineHeight: 1.5, color: C.dim }}>{nt.body}</div>}
          </div>
        ))}
      </div>
    </Scroll>
  );
}

const MOBILE_SCREENS: Record<string, React.ComponentType<{ st: OSState }>> = {
  focus: MobileFocus, week: MobileWeek, habits: MobileHabits,
  projects: MobileProjects as React.ComponentType<{ st: OSState }>, notes: MobileNotes,
};

// ══════════════════════════════════════════════════════════════════════════════
// DESKTOP SCREENS
// ══════════════════════════════════════════════════════════════════════════════

function DesktopFocus({ st }: { st: OSState }) {
  const { C, titleFont, accent } = useTheme();
  const now = st.focusTasks[0];
  const rest = st.focusTasks.slice(1);
  const today = st.week.find((d) => d.today);
  const todayIdx = st.week.findIndex((d) => d.today);
  if (!today) return null;
  const deadlines = [...st.projects].sort((a, b) => parseDue(a.due) - parseDue(b.due)).slice(0, 4);
  const urgentCount = st.projects.filter(p => p.urgent).length;
  const greet = greeting();

  return (
    <View>
      <div style={{ marginBottom: 30 }}>
        <TitleH size={46}>{greet}, {D.user.name}.</TitleH>
        <div style={{ fontSize: 15, color: C.dim, marginTop: 10 }}>
          {fmtDateLong()} · {st.focusTasks.length} {st.focusTasks.length === 1 ? "tarea" : "tareas"} en cola · {urgentCount} deadline{urgentCount === 1 ? "" : "s"} apretando
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 372px", gap: 24, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <Card pad={32}>
            {now ? (
              <>
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 18, fontSize: 13, color: C.dim }}>
                  <span style={{ color: accent, fontWeight: 600 }}>{now.project}</span>
                  {now.tag && <><span>·</span><span>{now.tag}</span></>}
                  <span style={{ marginLeft: "auto", fontVariantNumeric: "tabular-nums" }}>⏱ —</span>
                </div>
                <Eyebrow style={{ marginBottom: 12 }}>Ahorita</Eyebrow>
                <div style={{ fontFamily: titleFont, fontSize: 40, lineHeight: 1.1, letterSpacing: -0.5,
                  color: C.ink, opacity: st.pulse ? 0.25 : 1, transition: "opacity .2s" }}>{now.t}</div>
                <div style={{ display: "flex", gap: 12, marginTop: 30 }}>
                  <button onClick={st.completeFocus} style={{ padding: "14px 30px", background: C.ink, color: C.bg,
                    border: "none", borderRadius: 30, fontSize: 14.5, fontWeight: 600, font: "inherit", cursor: "pointer" }}>Hecho ✓</button>
                  <button onClick={st.skipFocus} style={{ padding: "14px 24px", background: "transparent",
                    border: `1px solid ${C.line}`, borderRadius: 30, color: C.dim, fontSize: 14.5, font: "inherit", cursor: "pointer" }}>Saltar</button>
                </div>
              </>
            ) : (
              <div style={{ padding: "30px 0", textAlign: "center" }}>
                <div style={{ fontFamily: titleFont, fontSize: 38, color: C.ink, marginBottom: 8 }}>Todo hecho.</div>
                <div style={{ color: C.dim, fontSize: 15 }}>Cierra la laptop. Ve al gym.</div>
              </div>
            )}
          </Card>

          {rest.length > 0 && (
            <Card title={`Después · ${rest.length}`}>
              {rest.map((q, i) => (
                <div key={i} style={{ display: "flex", gap: 16, padding: "14px 0",
                  borderTop: i ? `1px solid ${C.line}` : "none", alignItems: "baseline" }}>
                  <span style={{ fontFamily: titleFont, fontSize: 22, color: C.faint, width: 22 }}>{i + 1}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15.5, color: C.ink }}>{q.t}</div>
                    <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>{q.project}</div>
                  </div>
                </div>
              ))}
            </Card>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <Card title={`Hoy · ${today.day} ${today.date}`}>
            {today.tasks.map((t, ti) => (
              <div key={ti} style={{ display: "flex", gap: 12, padding: "9px 0", alignItems: "flex-start" }}>
                <Dot done={t.done} urgent={t.urgent} onClick={() => st.toggleWeek(todayIdx, ti)} />
                <span onClick={() => st.toggleWeek(todayIdx, ti)} style={{ flex: 1, fontSize: 14, lineHeight: 1.35,
                  color: t.done ? C.faint : t.urgent ? C.urgent : C.ink,
                  textDecoration: t.done ? "line-through" : "none", cursor: "pointer" }}>{t.t}</span>
              </div>
            ))}
          </Card>

          <Card title="Hábitos hoy">
            {st.habits.map((h, hi) => {
              const todayDone = h.days[getTodayIdx()]?.done ?? false;
              return (
                <div key={hi} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0" }}>
                  <Dot done={todayDone} onClick={() => st.toggleHabit(hi)} />
                  <span style={{ flex: 1, fontSize: 14, color: todayDone ? C.dim : C.ink }}>{h.name}</span>
                  <span style={{ fontSize: 13, color: accent, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{h.streak}</span>
                  <span style={{ fontSize: 13 }}>🔥</span>
                </div>
              );
            })}
          </Card>

          <Card title="Deadlines">
            {deadlines.map((p, i) => (
              <div key={i} style={{ padding: "10px 0", borderTop: i ? `1px solid ${C.line}` : "none" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 7 }}>
                  <span style={{ flex: 1, fontSize: 14, color: C.ink }}>{p.name}</span>
                  <span style={{ fontSize: 12, color: p.urgent ? C.urgent : C.dim, fontWeight: p.urgent ? 600 : 400 }}>{p.due}</span>
                </div>
                <div style={{ height: 3, background: C.line, borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ width: p.pct + "%", height: "100%", background: p.urgent ? C.urgent : accent }} />
                </div>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </View>
  );
}

function DesktopWeek({ st }: { st: OSState }) {
  const { C, titleFont, accent, dark } = useTheme();
  const [addingDay, setAddingDay] = useState<string | null>(null);
  const [taskDraft, setTaskDraft] = useState("");

  const submitTask = (isoDate: string) => {
    const v = taskDraft.trim();
    if (v) st.addTask(v, "Personal", isoDate);
    setTaskDraft("");
    setAddingDay(null);
  };

  return (
    <View>
      <ViewHead title="Esta semana" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 0, marginTop: 26,
        border: `1px solid ${C.line}`, borderRadius: 18, overflow: "hidden", background: C.raised }}>
        {st.week.map((d, di) => (
          <div key={di} style={{ borderLeft: di ? `1px solid ${C.line}` : "none", minHeight: 460,
            background: d.today ? (dark ? "rgba(255,255,255,.03)" : "rgba(0,0,0,.015)") : "transparent",
            display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "16px 14px 12px", borderBottom: `1px solid ${C.line}` }}>
              <div style={{ fontFamily: titleFont, fontSize: 26, color: d.today ? accent : C.ink,
                lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{d.date}</div>
              <div style={{ fontSize: 10.5, letterSpacing: 1.2, textTransform: "uppercase", marginTop: 5,
                color: d.today ? accent : C.dim, fontWeight: 600 }}>{d.day}{d.today ? " · hoy" : ""}</div>
            </div>
            <div style={{ padding: "10px 10px 8px", display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
              {d.tasks.map((t, ti) => (
                <div key={ti} style={{ display: "flex", gap: 5, padding: "5px 0", alignItems: "flex-start" }}>
                  <Dot done={t.done} urgent={t.urgent} onClick={() => st.toggleWeek(di, ti)} />
                  <span onClick={() => st.toggleWeek(di, ti)} style={{ flex: 1, fontSize: 12, lineHeight: 1.3,
                    color: t.done ? C.faint : t.urgent ? C.urgent : C.ink,
                    textDecoration: t.done ? "line-through" : "none", cursor: "pointer" }}>{t.t}</span>
                  <DeleteBtn onClick={() => st.removeTask(t.id)} />
                </div>
              ))}
              <div style={{ marginTop: 4 }}>
                {addingDay === d.isoDate ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <input autoFocus value={taskDraft} onChange={e => setTaskDraft(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") submitTask(d.isoDate); if (e.key === "Escape") setAddingDay(null); }}
                      onBlur={() => { if (!taskDraft.trim()) setAddingDay(null); }}
                      placeholder="Nueva tarea…"
                      style={{ width: "100%", border: `1px solid ${C.line}`, borderRadius: 6, padding: "6px 8px",
                        fontSize: 11.5, background: C.bg, color: C.ink, fontFamily: sans, outline: "none",
                        boxSizing: "border-box" }} />
                  </div>
                ) : (
                  <button onClick={() => { setAddingDay(d.isoDate); setTaskDraft(""); }}
                    style={{ border: "none", background: "transparent", color: C.faint, cursor: "pointer",
                      fontSize: 12, padding: "3px 0", fontFamily: sans, display: "block", width: "100%",
                      textAlign: "left", transition: "color .15s" }}
                    onMouseEnter={e => (e.currentTarget.style.color = accent)}
                    onMouseLeave={e => (e.currentTarget.style.color = C.faint)}>
                    + tarea
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </View>
  );
}

function DesktopHabits({ st }: { st: OSState }) {
  const { C, titleFont, accent } = useTheme();
  const days = ["L", "M", "M", "J", "V", "S", "D"];
  const [adding, setAdding] = useState(false);
  const [habitInput, setHabitInput] = useState("");

  const submitHabit = () => {
    const v = habitInput.trim();
    if (v) st.addHabit(v);
    setHabitInput("");
    setAdding(false);
  };

  return (
    <View>
      <ViewHead title="Hábitos" right={
        <Eyebrow style={{ marginBottom: 0, paddingBottom: 8 }}>Streaks</Eyebrow>
      } />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginTop: 26 }}>
        {st.habits.map((h, hi) => (
          <Card key={hi} pad={26}>
            <div style={{ display: "flex", alignItems: "flex-start", marginBottom: 20 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <div style={{ fontSize: 17, color: C.ink }}>{h.name}</div>
                  <DeleteBtn onClick={() => st.removeHabit(h.name)} />
                </div>
                <div style={{ fontSize: 12, color: C.dim }}>Toca hoy para marcar</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: titleFont, fontSize: 40, lineHeight: 0.9, color: accent, fontVariantNumeric: "tabular-nums" }}>{h.streak}</div>
                <div style={{ fontSize: 9.5, letterSpacing: 1.5, textTransform: "uppercase", color: C.dim, marginTop: 4 }}>días 🔥</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {h.days.map((day, j) => {
                const isToday = j === getTodayIdx();
                return (
                  <div key={j} style={{ flex: 1, textAlign: "center" }}>
                    <div onClick={() => isToday && st.toggleHabit(hi)} style={{ height: 38, borderRadius: 9,
                      background: day.done ? accent : "transparent", border: day.done ? "none" : `1.5px solid ${C.line}`,
                      opacity: day.done && isToday ? 0.6 : 1, cursor: isToday ? "pointer" : "default",
                      boxShadow: isToday ? `inset 0 0 0 2px ${C.raised}, 0 0 0 1.5px ${day.done ? accent : C.faint}` : "none",
                      transition: "all .15s" }} />
                    <div style={{ fontSize: 10, color: isToday ? accent : C.faint, marginTop: 5, fontWeight: isToday ? 700 : 400 }}>{days[j]}</div>
                  </div>
                );
              })}
            </div>
          </Card>
        ))}

        {adding ? (
          <div style={{ background: C.raised, border: `1px dashed ${C.line}`, borderRadius: 20, padding: 26,
            display: "flex", alignItems: "center", gap: 10 }}>
            <input autoFocus value={habitInput} onChange={e => setHabitInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") submitHabit(); if (e.key === "Escape") setAdding(false); }}
              onBlur={() => { if (!habitInput.trim()) setAdding(false); }}
              placeholder="Nombre del hábito…"
              style={{ flex: 1, border: `1px solid ${C.line}`, borderRadius: 10, padding: "11px 14px",
                fontSize: 15, background: C.bg, color: C.ink, fontFamily: sans, outline: "none" }} />
            <button onClick={submitHabit}
              style={{ border: "none", background: accent, color: "#fff", borderRadius: 10,
                padding: "11px 18px", fontSize: 16, cursor: "pointer", fontFamily: sans }}>+</button>
          </div>
        ) : (
          <button onClick={() => setAdding(true)}
            style={{ background: "transparent", border: `1px dashed ${C.line}`, borderRadius: 20, padding: 26,
              color: C.faint, fontSize: 15, fontFamily: sans, cursor: "pointer", textAlign: "center",
              transition: "all .15s" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = accent; e.currentTarget.style.color = accent; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.line; e.currentTarget.style.color = C.faint; }}>
            + hábito
          </button>
        )}
      </div>
    </View>
  );
}

function DesktopProjects({ st }: { st: OSState }) {
  const { C, titleFont, accent } = useTheme();
  const [showModal, setShowModal] = useState(false);
  return (
    <View>
      <ViewHead title="Proyectos" right={
        <div style={{ display: "flex", alignItems: "center", gap: 14, paddingBottom: 8 }}>
          <Eyebrow style={{ marginBottom: 0 }}>{st.projects.length} activos</Eyebrow>
          <button onClick={() => setShowModal(true)}
            style={{ border: "none", background: accent, color: "#fff", borderRadius: 10,
              padding: "7px 14px", fontSize: 13, fontWeight: 600, fontFamily: sans, cursor: "pointer" }}>
            + proyecto
          </button>
        </div>
      } />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginTop: 26 }}>
        {st.projects.map((p) => (
          <Card key={p.id} pad={26}>
            <div style={{ display: "flex", alignItems: "flex-start", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
                {p.color && <span style={{ width: 10, height: 10, borderRadius: "50%", background: p.color, flex: "0 0 10px" }} />}
                <div style={{ fontSize: 19, color: C.ink }}>{p.name}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{ fontFamily: titleFont, fontSize: 38, lineHeight: 0.9, fontVariantNumeric: "tabular-nums",
                  color: p.urgent ? C.urgent : C.ink }}>{p.pct}<span style={{ fontSize: 18, color: C.dim }}>%</span></div>
                <DeleteBtn onClick={() => st.removeProject(p.id)} />
              </div>
            </div>
            <div style={{ height: 4, background: C.line, borderRadius: 2, overflow: "hidden", marginBottom: 8 }}>
              <div style={{ width: p.pct + "%", height: "100%", background: p.urgent ? C.urgent : (p.color ?? accent) }} />
            </div>
            <input type="range" min="0" max="100" value={p.pct}
              onChange={e => st.setProjectProgress(p.id, +e.target.value)}
              style={{ width: "100%", accentColor: p.color ?? accent, display: "block", marginBottom: 10 }} />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
              <span style={{ color: C.dim }}>{p.deadline}</span>
              <span style={{ color: p.urgent ? C.urgent : C.dim, fontWeight: p.urgent ? 600 : 400 }}>{p.due}</span>
            </div>
          </Card>
        ))}
      </div>
      {showModal && (
        <ProjectFormModal onClose={() => setShowModal(false)} onAdd={st.addProject} />
      )}
    </View>
  );
}

function DesktopNotes({ st }: { st: OSState }) {
  const { C, titleFont, accent } = useTheme();
  const [draft, setDraft] = useState("");
  const add = () => { const v = draft.trim(); if (!v) return; st.addNote(v); setDraft(""); };
  return (
    <View>
      <ViewHead title="Notas" right={<Eyebrow style={{ marginBottom: 0, paddingBottom: 8 }}>Dump</Eyebrow>} />
      <div style={{ display: "flex", gap: 10, margin: "24px 0 26px", maxWidth: 720 }}>
        <input value={draft} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Captura una idea rápida…"
          style={{ flex: 1, border: `1px solid ${C.line}`, borderRadius: 12,
            padding: "14px 18px", fontSize: 15, background: C.raised, color: C.ink, font: "inherit", outline: "none" }} />
        <button onClick={add} style={{ border: "none", background: accent, color: "#fff",
          borderRadius: 12, padding: "0 22px", fontSize: 22, cursor: "pointer" }}>+</button>
      </div>
      <div style={{ columnWidth: 320, columnGap: 20 }}>
        {st.notes.map((nt) => (
          <div key={nt.id} style={{ breakInside: "avoid", marginBottom: 20 }}>
            <Card pad={22}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 10.5, letterSpacing: 1, textTransform: "uppercase", color: accent, fontWeight: 600 }}>{nt.project}</span>
                <span style={{ marginLeft: "auto", fontSize: 11, color: C.faint }}>{nt.time}</span>
                <DeleteBtn onClick={() => st.removeNote(nt.id)} />
              </div>
              <div style={{ fontFamily: titleFont, fontSize: 22, lineHeight: 1.12, color: C.ink, marginBottom: nt.body ? 8 : 0 }}>{nt.title}</div>
              {nt.body && <div style={{ fontSize: 13.5, lineHeight: 1.55, color: C.dim }}>{nt.body}</div>}
            </Card>
          </div>
        ))}
      </div>
    </View>
  );
}

const DESKTOP_SCREENS: Record<string, React.ComponentType<{ st: OSState }>> = {
  focus: DesktopFocus, week: DesktopWeek, habits: DesktopHabits,
  projects: DesktopProjects, notes: DesktopNotes,
};

// ══════════════════════════════════════════════════════════════════════════════
// DESKTOP SIDEBAR
// ══════════════════════════════════════════════════════════════════════════════

function Sidebar({ screen, setScreen, clock, theme, cycleTheme, dark, accent }: {
  screen: string; setScreen: (s: string) => void; clock: string;
  theme: string; cycleTheme: () => void; dark: boolean; accent: string;
}) {
  const { C, titleFont } = useTheme();
  return (
    <div style={{ width: 248, flex: "0 0 248px", borderRight: `1px solid ${C.line}`,
      display: "flex", flexDirection: "column", padding: "28px 18px 22px", background: C.bg }}>
      <div style={{ padding: "0 10px 28px" }}>
        <div style={{ fontFamily: titleFont, fontSize: 30, fontWeight: 600, letterSpacing: -1, color: C.ink, lineHeight: 1 }}>OS</div>
        <div style={{ fontSize: 10.5, letterSpacing: 1.5, textTransform: "uppercase", color: C.faint, marginTop: 4 }}>personal operating system</div>
      </div>
      <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {OS_TABS.map(([key, label]) => {
          const on = key === screen;
          const I = OSIcon[key];
          return (
            <button key={key} onClick={() => setScreen(key)} style={{ display: "flex", alignItems: "center",
              gap: 13, padding: "11px 12px", border: "none", borderRadius: 11, cursor: "pointer",
              background: on ? (dark ? "rgba(255,255,255,.06)" : "rgba(0,0,0,.04)") : "transparent",
              color: on ? C.ink : C.dim, font: "inherit", textAlign: "left", transition: "all .15s" }}>
              <span style={{ color: on ? accent : C.faint, display: "flex" }}><I s={20} sw={on ? 1.9 : 1.6} /></span>
              <span style={{ fontSize: 14.5, fontWeight: on ? 600 : 500 }}>{label}</span>
            </button>
          );
        })}
      </nav>
      <div style={{ marginTop: "auto", display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 10px", borderTop: `1px solid ${C.line}`, paddingTop: 18 }}>
        <div>
          <div style={{ fontSize: 19, fontWeight: 600, color: C.ink, fontVariantNumeric: "tabular-nums", letterSpacing: -0.3 }}>{clock}</div>
          <div style={{ fontSize: 10.5, letterSpacing: 1, textTransform: "uppercase", color: C.dim, marginTop: 2 }}>{fmtDateLong()}</div>
        </div>
        <button onClick={cycleTheme} title={`Tema: ${theme}`} style={{ border: `1px solid ${C.line}`,
          background: "transparent", borderRadius: 10, width: 36, height: 36, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
          {dark ? <MoonIcon c={C.dim} /> : <SunIcon c={C.dim} />}
          {theme === "auto" && (
            <span style={{ position: "absolute", top: 6, right: 6, width: 5, height: 5, borderRadius: "50%", background: accent }} />
          )}
        </button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// FRAMES
// ══════════════════════════════════════════════════════════════════════════════

function MobileFrame({ screen, setScreen, st, clock, theme, cycleTheme, dark, accent, C }: {
  screen: string; setScreen: (s: string) => void; st: OSState; clock: string;
  theme: string; cycleTheme: () => void; dark: boolean; accent: string; C: Tokens;
}) {
  const Screen = MOBILE_SCREENS[screen];
  return (
    <div style={{ height: "100dvh", display: "flex", flexDirection: "column",
      background: C.bg, color: C.ink, fontFamily: sans }}>
      <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "calc(12px + env(safe-area-inset-top)) 26px 8px", color: C.dim }}>
        <span style={{ fontWeight: 600, fontSize: 14, color: C.ink, fontVariantNumeric: "tabular-nums" }}>{clock}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontSize: 10.5, letterSpacing: 1.5 }}>{fmtDateShort()}</span>
          <button onClick={cycleTheme} title={`Tema: ${theme}`} style={{ border: "none", background: "transparent",
            padding: 4, cursor: "pointer", display: "flex", alignItems: "center", position: "relative" }}>
            {dark ? <MoonIcon c={C.dim} /> : <SunIcon c={C.dim} />}
            {theme === "auto" && (
              <span style={{ position: "absolute", bottom: 1, right: 1, width: 4, height: 4, borderRadius: "50%", background: accent }} />
            )}
          </button>
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}><Screen st={st} /></div>
      <div style={{ flex: "0 0 auto", display: "flex", borderTop: `1px solid ${C.line}`,
        padding: "8px 0 calc(10px + env(safe-area-inset-bottom))", background: C.bg }}>
        {OS_TABS.map(([key, label]) => {
          const on = key === screen;
          const I = OSIcon[key];
          return (
            <button key={key} onClick={() => setScreen(key)} style={{ flex: 1, display: "flex",
              flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 5,
              border: "none", background: "transparent", cursor: "pointer", paddingTop: 4,
              color: on ? C.ink : C.faint, transition: "color .15s" }}>
              <I s={21} sw={on ? 1.9 : 1.5} />
              <span style={{ fontSize: 9.5, letterSpacing: 0.2, fontWeight: on ? 600 : 400 }}>{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DesktopFrame({ screen, setScreen, st, clock, theme, cycleTheme, dark, accent }: {
  screen: string; setScreen: (s: string) => void; st: OSState; clock: string;
  theme: string; cycleTheme: () => void; dark: boolean; accent: string;
}) {
  const { C } = useTheme();
  const Screen = DESKTOP_SCREENS[screen];
  return (
    <div style={{ height: "100vh", display: "flex", background: C.bg, color: C.ink,
      fontFamily: sans, transition: "background .3s" }}>
      <Sidebar screen={screen} setScreen={setScreen} clock={clock}
        theme={theme} cycleTheme={cycleTheme} dark={dark} accent={accent} />
      <Screen st={st} />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ROOT APP
// ══════════════════════════════════════════════════════════════════════════════

const TWEAK_DEFAULTS = { theme: "auto", titleFont: "bricolage", accent: "#4f9e6e" };
const LS_KEY = "os-tweaks";

export default function OSApp() {
  const [tweaks, setTweaksRaw] = useState(TWEAK_DEFAULTS);
  const setTweak = useCallback((key: string, value: string) => {
    setTweaksRaw((prev) => {
      const next = { ...prev, [key]: value };
      try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const [screen, setScreen] = useState("focus");
  const [clock, setClock] = useState(fmtClock);
  const [wide, setWide] = useState(false);
  const st = useOSState();

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_KEY);
      if (saved) setTweaksRaw((prev) => ({ ...prev, ...JSON.parse(saved) }));
    } catch {}
  }, []);

  useEffect(() => {
    setWide(window.matchMedia("(min-width: 900px)").matches);
    const mq = window.matchMedia("(min-width: 900px)");
    const handler = (e: MediaQueryListEvent) => setWide(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setClock(fmtClock()), 20000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker?.getRegistrations().then((regs) =>
        regs.forEach((r) => r.unregister())
      );
      return;
    }
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.warn("SW no registrado:", err?.message);
      });
    }
  }, []);

  const hour = new Date().getHours();
  const dark = tweaks.theme === "auto" ? (hour >= 19 || hour < 7) : tweaks.theme === "dark";
  const C = tokens(dark);
  const titleFont = TITLE_FONTS[tweaks.titleFont] || TITLE_FONTS.bricolage;
  const accent = tweaks.accent;
  const cycleTheme = () =>
    setTweak("theme", tweaks.theme === "auto" ? "light" : tweaks.theme === "light" ? "dark" : "auto");

  useEffect(() => {
    const m = document.getElementById("theme-color");
    if (m) m.setAttribute("content", C.bg);
  }, [C.bg]);

  const Frame = wide ? DesktopFrame : MobileFrame;

  return (
    <ThemeCtx.Provider value={{ C, titleFont, accent, dark }}>
      {st.loading || !st.week.length ? (
        <div style={{ height: "100vh", background: C.bg, display: "flex",
          alignItems: "center", justifyContent: "center" }}>
          <div style={{ fontFamily: titleFont, fontSize: 32, color: C.faint, letterSpacing: -0.5 }}>OS</div>
        </div>
      ) : (
        <Frame
          screen={screen} setScreen={setScreen} st={st} clock={clock}
          theme={tweaks.theme} cycleTheme={cycleTheme} dark={dark} accent={accent} C={C}
        />
      )}
    </ThemeCtx.Provider>
  );
}
