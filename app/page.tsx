"use client";

import { useState, useEffect, useCallback, createContext, useContext } from "react";

// ─── Data ────────────────────────────────────────────────────────────────────

const D = {
  user: { name: "Guillermo", date: "JUE 28 MAY", clock: "9:41" },
  now: {
    task: "Hero section de hackmty.com — arreglar responsive en mobile",
    project: "HackMTY",
    tag: "Dev",
    timer: "1:20",
    queue: [
      { t: "Deploy landing v2 a Vercel", project: "HackMTY" },
      { t: "Mandar mockups a Sofía (sponsor deck)", project: "AWS Club" },
      { t: "LeetCode daily — #146 LRU Cache", project: "LeetCode" },
    ],
  },
  week: [
    { day: "LUN", date: 25, today: false, tasks: [
      { t: "Standup HackMTY 9am", done: true, urgent: false },
      { t: "Leg day", done: true, urgent: false },
      { t: "Leer cap. 4 Probabilidad", done: false, urgent: false },
    ]},
    { day: "MAR", date: 26, today: false, tasks: [
      { t: "Clase EDOs 7am", done: true, urgent: false },
      { t: "Prep workshop AWS", done: true, urgent: false },
      { t: "LeetCode #141", done: true, urgent: false },
    ]},
    { day: "MIÉ", date: 27, today: false, tasks: [
      { t: "Junta sponsors HackMTY 4pm", done: true, urgent: false },
      { t: "Push day", done: false, urgent: false },
    ]},
    { day: "JUE", date: 28, today: true, tasks: [
      { t: "Hero hackmty.com responsive", done: false, urgent: false },
      { t: "Deploy landing v2", done: false, urgent: false },
      { t: "Cita con Ana 8pm", done: false, urgent: false },
    ]},
    { day: "VIE", date: 29, today: false, tasks: [
      { t: "Entrega freelance — landing dentista", done: false, urgent: true },
      { t: "Review PRs del club", done: false, urgent: false },
    ]},
    { day: "SÁB", date: 30, today: false, tasks: [
      { t: "Grabar demo HackMTY", done: false, urgent: false },
      { t: "Pull day", done: false, urgent: false },
    ]},
    { day: "DOM", date: 31, today: false, tasks: [
      { t: "Planear semana", done: false, urgent: false },
      { t: "Descanso", done: false, urgent: false },
    ]},
  ],
  habits: [
    { name: "Gimnasio", streak: 12, week: [1, 1, 1, 0, 1, 1, 0] },
    { name: "Creatina", streak: 34, week: [1, 1, 1, 1, 1, 1, 0] },
    { name: "LeetCode daily", streak: 7, week: [1, 1, 1, 0, 1, 0, 0] },
    { name: "Dev hackmty.com", streak: 4, week: [0, 0, 1, 1, 1, 0, 0] },
  ],
  projects: [
    { name: "HackMTY", role: "Director", pct: 62, deadline: "22 Ago", due: "en 86 días", urgent: false },
    { name: "AWS Cloud Club", role: "Presidente", pct: 40, deadline: "10 Jun", due: "en 13 días", urgent: false },
    { name: "Landing dentista", role: "Freelance", pct: 80, deadline: "30 May", due: "en 2 días", urgent: true },
    { name: "Universidad — 6º sem", role: "Exámenes", pct: 55, deadline: "6 Jun", due: "en 9 días", urgent: false },
    { name: "Rep de carrera", role: "Representante", pct: 30, deadline: "15 Jun", due: "en 18 días", urgent: false },
  ],
  notes: [
    { project: "HackMTY", title: "Tracks 2026", body: "AI agents, fintech, healthtech. Pedir feedback a mentores antes del viernes.", time: "hoy" },
    { project: "AWS Club", title: "Sponsors pendientes", body: "Follow-up AWS LATAM. Falta firmar convenio con Oracle.", time: "ayer" },
    { project: "Freelance", title: "Dentista — copy", body: "Cliente quiere tono cálido. Fotos del consultorio llegan el viernes.", time: "2d" },
    { project: "Personal", title: "Aniversario Ana", body: "Reservar cena. 14 jun. Ver disponibilidad Pangea.", time: "3d" },
  ],
};

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
const TODAY_IDX = 6;
const sans = "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";

// ─── Theme context ────────────────────────────────────────────────────────────

type ThemeCtxValue = { C: Tokens; titleFont: string; accent: string; dark: boolean };
const ThemeCtx = createContext<ThemeCtxValue>({} as ThemeCtxValue);
const useTheme = () => useContext(ThemeCtx);

// ─── Shared state ─────────────────────────────────────────────────────────────

type FocusTask = { t: string; project: string; tag: string | null };
type WeekDay = typeof D.week[0];
type Habit = typeof D.habits[0];
type Note = { project: string; title: string; body: string; time: string };

function useOSState() {
  const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
  const [focusTasks, setFocusTasks] = useState<FocusTask[]>(() => [
    { t: D.now.task, project: D.now.project, tag: D.now.tag },
    ...D.now.queue.map((q) => ({ t: q.t, project: q.project, tag: null })),
  ]);
  const [pulse, setPulse] = useState(false);
  const [week, setWeek] = useState<WeekDay[]>(() => clone(D.week));
  const [habits, setHabits] = useState<Habit[]>(() => clone(D.habits));
  const [notes, setNotes] = useState<Note[]>(() => clone(D.notes));

  return {
    focusTasks, pulse, week, habits, notes,
    completeFocus: () => {
      setPulse(true);
      setTimeout(() => { setFocusTasks((x) => x.slice(1)); setPulse(false); }, 220);
    },
    skipFocus: () => setFocusTasks((x) => x.length > 1 ? [...x.slice(1), x[0]] : x),
    toggleWeek: (di: number, ti: number) =>
      setWeek((w) => w.map((d, i) => i !== di ? d : ({
        ...d,
        tasks: d.tasks.map((t, j) => j !== ti ? t : ({ ...t, done: !t.done })),
      }))),
    toggleHabit: (hi: number) => setHabits((hs) => hs.map((h, i) => {
      if (i !== hi) return h;
      const wk = h.week.slice(); const was = wk[TODAY_IDX]; wk[TODAY_IDX] = was ? 0 : 1;
      return { ...h, week: wk, streak: h.streak + (was ? -1 : 1) };
    })),
    addNote: (v: string) => setNotes((n) => [{ project: "Personal", title: v, body: "", time: "ahora" }, ...n]),
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
const countUrgent = () => D.projects.filter((p) => p.urgent || parseDue(p.due) <= 14).length;

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

function ViewHead({ title, right }: { title: string; right?: string }) {
  const { C } = useTheme();
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
      <TitleH size={46}>{title}</TitleH>
      {right && <Eyebrow style={{ paddingBottom: 8, marginBottom: 0 }}>{right}</Eyebrow>}
    </div>
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
        <span style={{ marginLeft: "auto", fontVariantNumeric: "tabular-nums" }}>⏱ {D.now.timer}</span>
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
  return (
    <Scroll>
      <TitleH size={38}>Esta semana</TitleH>
      <div style={{ display: "flex", flexDirection: "column", marginTop: 18 }}>
        {st.week.map((d, di) => (
          <div key={di} style={{ padding: "12px 0", borderBottom: `1px solid ${C.line}` }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: d.tasks.length ? 8 : 0 }}>
              <span style={{ fontFamily: titleFont, fontSize: 22, color: d.today ? accent : C.ink,
                lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{d.date}</span>
              <span style={{ fontSize: 11, letterSpacing: 1.5, color: d.today ? accent : C.dim,
                textTransform: "uppercase", fontWeight: 600 }}>{d.day}{d.today ? " · hoy" : ""}</span>
            </div>
            {d.tasks.map((t, ti) => (
              <div key={ti} onClick={() => st.toggleWeek(di, ti)} style={{ display: "flex", gap: 12,
                padding: "6px 0", alignItems: "flex-start", cursor: "pointer" }}>
                <Dot done={t.done} urgent={t.urgent} />
                <span style={{ flex: 1, fontSize: 14, lineHeight: 1.35,
                  color: t.done ? C.faint : t.urgent ? C.urgent : C.ink,
                  textDecoration: t.done ? "line-through" : "none", transition: "color .15s" }}>{t.t}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Scroll>
  );
}

function MobileHabits({ st }: { st: OSState }) {
  const { C, titleFont, accent } = useTheme();
  return (
    <Scroll>
      <TitleH size={38}>Hábitos</TitleH>
      <div style={{ fontSize: 12.5, color: C.dim, marginTop: 8, marginBottom: 10 }}>Toca el cuadro de hoy para marcar.</div>
      {st.habits.map((h, hi) => (
        <div key={hi} style={{ padding: "18px 0", borderBottom: `1px solid ${C.line}`,
          display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, marginBottom: 10, color: C.ink }}>{h.name}</div>
            <div style={{ display: "flex", gap: 6 }}>
              {h.week.map((v, j) => {
                const isToday = j === TODAY_IDX;
                return (
                  <span key={j} onClick={() => isToday && st.toggleHabit(hi)}
                    style={{ width: 13, height: 13, borderRadius: "50%",
                      background: v ? accent : "transparent",
                      border: v ? "none" : `1.5px solid ${C.line}`,
                      opacity: v && isToday ? 0.55 : 1,
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
    </Scroll>
  );
}

function MobileProjects() {
  const { C, titleFont, accent } = useTheme();
  return (
    <Scroll>
      <TitleH size={38}>Proyectos</TitleH>
      <div style={{ marginTop: 18 }}>
        {D.projects.map((p, i) => (
          <div key={i} style={{ padding: "16px 0", borderBottom: `1px solid ${C.line}` }}>
            <div style={{ display: "flex", alignItems: "baseline", marginBottom: 11 }}>
              <span style={{ fontSize: 16, flex: 1, color: C.ink }}>{p.name}</span>
              <span style={{ fontFamily: titleFont, fontSize: 24, lineHeight: 1, fontVariantNumeric: "tabular-nums",
                color: p.urgent ? C.urgent : C.ink }}>{p.pct}<span style={{ fontSize: 14 }}>%</span></span>
            </div>
            <div style={{ height: 3, background: C.line, borderRadius: 2, overflow: "hidden" }}>
              <div style={{ width: p.pct + "%", height: "100%", background: p.urgent ? C.urgent : accent }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 9, fontSize: 11.5 }}>
              <span style={{ color: C.dim }}>{p.role}</span>
              <span style={{ color: p.urgent ? C.urgent : C.dim }}>{p.deadline} · {p.due}</span>
            </div>
          </div>
        ))}
      </div>
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
        {st.notes.map((nt, i) => (
          <div key={i} style={{ borderBottom: `1px solid ${C.line}`, paddingBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 5 }}>
              <span style={{ fontSize: 10.5, letterSpacing: 1, textTransform: "uppercase", color: accent, fontWeight: 600 }}>{nt.project}</span>
              <span style={{ marginLeft: "auto", fontSize: 11, color: C.faint }}>{nt.time}</span>
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
  const today = st.week.find((d) => d.today)!;
  const todayIdx = st.week.findIndex((d) => d.today);
  const deadlines = [...D.projects].sort((a, b) => parseDue(a.due) - parseDue(b.due)).slice(0, 4);
  const greet = greeting();

  return (
    <View>
      <div style={{ marginBottom: 30 }}>
        <TitleH size={46}>{greet}, {D.user.name}.</TitleH>
        <div style={{ fontSize: 15, color: C.dim, marginTop: 10 }}>
          {fmtDateLong()} · {st.focusTasks.length} {st.focusTasks.length === 1 ? "tarea" : "tareas"} en cola · {countUrgent()} deadline{countUrgent() === 1 ? "" : "s"} apretando
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
                  <span style={{ marginLeft: "auto", fontVariantNumeric: "tabular-nums" }}>⏱ {D.now.timer}</span>
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
              <div key={ti} onClick={() => st.toggleWeek(todayIdx, ti)} style={{ display: "flex", gap: 12,
                padding: "9px 0", alignItems: "flex-start", cursor: "pointer" }}>
                <Dot done={t.done} urgent={t.urgent} />
                <span style={{ flex: 1, fontSize: 14, lineHeight: 1.35, color: t.done ? C.faint : t.urgent ? C.urgent : C.ink,
                  textDecoration: t.done ? "line-through" : "none" }}>{t.t}</span>
              </div>
            ))}
          </Card>

          <Card title="Hábitos hoy">
            {st.habits.map((h, hi) => (
              <div key={hi} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0" }}>
                <Dot done={!!h.week[TODAY_IDX]} onClick={() => st.toggleHabit(hi)} />
                <span style={{ flex: 1, fontSize: 14, color: h.week[TODAY_IDX] ? C.dim : C.ink }}>{h.name}</span>
                <span style={{ fontSize: 13, color: accent, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{h.streak}</span>
                <span style={{ fontSize: 13 }}>🔥</span>
              </div>
            ))}
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
  const days = ["L", "M", "M", "J", "V", "S", "D"];
  return (
    <View>
      <ViewHead title="Esta semana" right="25–31 May" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 0, marginTop: 26,
        border: `1px solid ${C.line}`, borderRadius: 18, overflow: "hidden", background: C.raised }}>
        {st.week.map((d, di) => (
          <div key={di} style={{ borderLeft: di ? `1px solid ${C.line}` : "none", minHeight: 460,
            background: d.today ? (dark ? "rgba(255,255,255,.03)" : "rgba(0,0,0,.015)") : "transparent" }}>
            <div style={{ padding: "16px 14px 12px", borderBottom: `1px solid ${C.line}` }}>
              <div style={{ fontFamily: titleFont, fontSize: 26, color: d.today ? accent : C.ink,
                lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{d.date}</div>
              <div style={{ fontSize: 10.5, letterSpacing: 1.2, textTransform: "uppercase", marginTop: 5,
                color: d.today ? accent : C.dim, fontWeight: 600 }}>{d.day}{d.today ? " · hoy" : ""}</div>
            </div>
            <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
              {d.tasks.map((t, ti) => (
                <div key={ti} onClick={() => st.toggleWeek(di, ti)} style={{ display: "flex", gap: 8,
                  padding: "6px 0", alignItems: "flex-start", cursor: "pointer" }}>
                  <Dot done={t.done} urgent={t.urgent} />
                  <span style={{ flex: 1, fontSize: 12.5, lineHeight: 1.3, color: t.done ? C.faint : t.urgent ? C.urgent : C.ink,
                    textDecoration: t.done ? "line-through" : "none" }}>{t.t}</span>
                </div>
              ))}
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
  return (
    <View>
      <ViewHead title="Hábitos" right="Streaks" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginTop: 26 }}>
        {st.habits.map((h, hi) => (
          <Card key={hi} pad={26}>
            <div style={{ display: "flex", alignItems: "flex-start", marginBottom: 20 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 17, color: C.ink, marginBottom: 4 }}>{h.name}</div>
                <div style={{ fontSize: 12, color: C.dim }}>Toca hoy para marcar</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: titleFont, fontSize: 40, lineHeight: 0.9, color: accent, fontVariantNumeric: "tabular-nums" }}>{h.streak}</div>
                <div style={{ fontSize: 9.5, letterSpacing: 1.5, textTransform: "uppercase", color: C.dim, marginTop: 4 }}>días 🔥</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {h.week.map((v, j) => {
                const isToday = j === TODAY_IDX;
                return (
                  <div key={j} style={{ flex: 1, textAlign: "center" }}>
                    <div onClick={() => isToday && st.toggleHabit(hi)} style={{ height: 38, borderRadius: 9,
                      background: v ? accent : "transparent", border: v ? "none" : `1.5px solid ${C.line}`,
                      opacity: v && isToday ? 0.6 : 1, cursor: isToday ? "pointer" : "default",
                      boxShadow: isToday ? `inset 0 0 0 2px ${C.raised}, 0 0 0 1.5px ${v ? accent : C.faint}` : "none",
                      transition: "all .15s" }} />
                    <div style={{ fontSize: 10, color: isToday ? accent : C.faint, marginTop: 5, fontWeight: isToday ? 700 : 400 }}>{days[j]}</div>
                  </div>
                );
              })}
            </div>
          </Card>
        ))}
      </div>
    </View>
  );
}

function DesktopProjects() {
  const { C, titleFont, accent } = useTheme();
  return (
    <View>
      <ViewHead title="Proyectos" right={`${D.projects.length} activos`} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginTop: 26 }}>
        {D.projects.map((p, i) => (
          <Card key={i} pad={26}>
            <div style={{ display: "flex", alignItems: "flex-start", marginBottom: 18 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 19, color: C.ink, marginBottom: 4 }}>{p.name}</div>
                <div style={{ fontSize: 12, letterSpacing: 0.5, textTransform: "uppercase", color: C.dim }}>{p.role}</div>
              </div>
              <div style={{ fontFamily: titleFont, fontSize: 38, lineHeight: 0.9, fontVariantNumeric: "tabular-nums",
                color: p.urgent ? C.urgent : C.ink }}>{p.pct}<span style={{ fontSize: 18, color: C.dim }}>%</span></div>
            </div>
            <div style={{ height: 4, background: C.line, borderRadius: 2, overflow: "hidden", marginBottom: 12 }}>
              <div style={{ width: p.pct + "%", height: "100%", background: p.urgent ? C.urgent : accent }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
              <span style={{ color: C.dim }}>{p.deadline}</span>
              <span style={{ color: p.urgent ? C.urgent : C.dim, fontWeight: p.urgent ? 600 : 400 }}>{p.due}</span>
            </div>
          </Card>
        ))}
      </div>
    </View>
  );
}

function DesktopNotes({ st }: { st: OSState }) {
  const { C, titleFont, accent } = useTheme();
  const [draft, setDraft] = useState("");
  const add = () => { const v = draft.trim(); if (!v) return; st.addNote(v); setDraft(""); };
  return (
    <View>
      <ViewHead title="Notas" right="Dump" />
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
        {st.notes.map((nt, i) => (
          <div key={i} style={{ breakInside: "avoid", marginBottom: 20 }}>
            <Card pad={22}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 10.5, letterSpacing: 1, textTransform: "uppercase", color: accent, fontWeight: 600 }}>{nt.project}</span>
                <span style={{ marginLeft: "auto", fontSize: 11, color: C.faint }}>{nt.time}</span>
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
  projects: DesktopProjects as React.ComponentType<{ st: OSState }>, notes: DesktopNotes,
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

export default function OSApp() {
  const [tweaks, setTweaksRaw] = useState(TWEAK_DEFAULTS);
  const setTweak = useCallback((key: string, value: string) =>
    setTweaksRaw((prev) => ({ ...prev, [key]: value })), []);

  const [screen, setScreen] = useState("focus");
  const [clock, setClock] = useState(fmtClock);
  const [wide, setWide] = useState(false);
  const st = useOSState();

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
      <Frame
        screen={screen} setScreen={setScreen} st={st} clock={clock}
        theme={tweaks.theme} cycleTheme={cycleTheme} dark={dark} accent={accent} C={C}
      />
    </ThemeCtx.Provider>
  );
}
