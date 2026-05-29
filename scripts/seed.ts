// Node 20 lacks native WebSocket — polyfill before supabase loads realtime
import { WebSocket } from "ws";
(globalThis as Record<string, unknown>).WebSocket = WebSocket;

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY)");
  process.exit(1);
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn("⚠️  Using anon key — may fail if RLS is enabled. Add SUPABASE_SERVICE_ROLE_KEY to .env.local\n");
}

const sb = createClient(supabaseUrl, supabaseKey);

const today = new Date();
const localISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const iso = (offset: number) => {
  const d = new Date(today);
  d.setDate(d.getDate() + offset);
  return localISO(d);
};

// Monday of current week
const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon...
const daysFromMon = (dayOfWeek + 6) % 7;
const mon = (offset: number) => {
  const d = new Date(today);
  d.setDate(d.getDate() - daysFromMon + offset);
  return localISO(d);
};

async function clearAll() {
  console.log("Clearing existing data...");
  await sb.from("notes").delete().neq("id", 0);
  await sb.from("tasks").delete().neq("id", 0);
  await sb.from("habits").delete().neq("id", 0);
  await sb.from("projects").delete().neq("id", 0);
}

async function seedProjects() {
  console.log("Seeding projects...");
  const { data, error } = await sb.from("projects").insert([
    { nombre: "HackMTY", deadline: iso(47), progreso: 35, color: "#e8a838" },
    { nombre: "AWS Cloud Club", deadline: iso(14), progreso: 60, color: "#ff9900" },
    { nombre: "Dentista Website", deadline: iso(5), progreso: 80, color: "#4f9e6e" },
    { nombre: "Universidad 6to", deadline: iso(21), progreso: 50, color: "#7c6fcd" },
    { nombre: "Rep de Carrera", deadline: null, progreso: 40, color: "#c0544d" },
  ]).select();
  if (error) throw error;
  console.log(`  ✓ ${data.length} projects`);
  return data;
}

async function seedTasks(projects: { id: number; nombre: string }[]) {
  console.log("Seeding tasks...");
  const pm = new Map(projects.map(p => [p.nombre, p.nombre]));

  const tasks = [
    // Monday
    { texto: "Definir agenda del hackathon", categoria: pm.get("HackMTY")!, dia: mon(0), completada: true },
    { texto: "Revisar inscripciones", categoria: pm.get("HackMTY")!, dia: mon(0), completada: true },
    // Tuesday
    { texto: "Preparar presentación AWS", categoria: pm.get("AWS Cloud Club")!, dia: mon(1), completada: true },
    { texto: "Mandar form de patrocinios", categoria: pm.get("HackMTY")!, dia: mon(1), completada: false },
    // Wednesday (today or near)
    { texto: "Terminar sección hero dentista", categoria: pm.get("Dentista Website")!, dia: mon(2), completada: false },
    { texto: "Resolver ejercicio árboles LeetCode", categoria: "Personal", dia: mon(2), completada: false },
    // Thursday
    { texto: "Estudiar parcial cálculo", categoria: pm.get("Universidad 6to")!, dia: mon(3), completada: false },
    { texto: "Call con cliente dentista", categoria: pm.get("Dentista Website")!, dia: mon(3), completada: false },
    // Friday
    { texto: "Enviar minuta reunión carrera", categoria: pm.get("Rep de Carrera")!, dia: mon(4), completada: false },
    { texto: "Workshop AWS — confirmar speakers", categoria: pm.get("AWS Cloud Club")!, dia: mon(4), completada: false },
    // Saturday
    { texto: "Revisar PRs del repo HackMTY", categoria: pm.get("HackMTY")!, dia: mon(5), completada: false },
    // Sunday
    { texto: "Planear semana siguiente", categoria: "Personal", dia: mon(6), completada: false },
  ];

  const { data, error } = await sb.from("tasks").insert(tasks).select();
  if (error) throw error;
  console.log(`  ✓ ${data.length} tasks`);
}

async function seedHabits() {
  console.log("Seeding habits...");
  // 3 habits × last 7 days (some done, some not)
  const habitDefs = [
    { name: "Gym", pattern: [true, true, false, true, true, false, false] },
    { name: "LeetCode", pattern: [true, true, true, false, true, false, false] },
    { name: "Creatina", pattern: [true, true, true, true, true, false, false] },
  ];

  const rows: { nombre: string; completado: boolean; fecha: string }[] = [];
  for (const h of habitDefs) {
    for (let i = 0; i < 7; i++) {
      if (h.pattern[i]) {
        rows.push({ nombre: h.name, completado: true, fecha: mon(i) });
      }
    }
  }

  const { data, error } = await sb.from("habits").insert(rows).select();
  if (error) throw error;
  console.log(`  ✓ ${data.length} habit entries`);
}

async function seedNotes(projects: { id: number; nombre: string }[]) {
  console.log("Seeding notes...");
  const pid = (name: string) => projects.find(p => p.nombre === name)?.id ?? null;

  const { data, error } = await sb.from("notes").insert([
    {
      contenido: "HackMTY logística\nConfirmar venue con TEC el jueves.\nPedir cotización de playeras antes del viernes.",
      project_id: pid("HackMTY"),
    },
    {
      contenido: "Ideas workshop AWS\n- Demo de Lambda con API Gateway\n- Caso de uso S3 + CloudFront\n- Q&A al final 20 min",
      project_id: pid("AWS Cloud Club"),
    },
    {
      contenido: "Dentista — feedback cliente\nLe gustó la paleta de colores.\nQuiere agregar sección de testimonios.\nEntrega final: viernes.",
      project_id: pid("Dentista Website"),
    },
    {
      contenido: "Fórmulas cálculo parcial\n∫e^x dx = e^x + C\nRegla de la cadena: (f∘g)' = f'(g(x))·g'(x)",
      project_id: pid("Universidad 6to"),
    },
    {
      contenido: "Misc ideas\n- Automatizar recordatorios con cron en Supabase\n- Agregar gráfica de progreso semanal al OS",
      project_id: null,
    },
  ]).select();
  if (error) throw error;
  console.log(`  ✓ ${data.length} notes`);
}

async function main() {
  console.log("🌱 Seeding Supabase...\n");
  try {
    await clearAll();
    const projects = await seedProjects();
    await Promise.all([seedTasks(projects), seedHabits(), seedNotes(projects)]);
    console.log("\n✅ Done.");
  } catch (err) {
    console.error("\n❌ Error:", err);
    process.exit(1);
  }
}

main();
