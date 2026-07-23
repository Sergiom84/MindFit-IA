// Suite de regresión E2E por API: matriz metodología × nivel × usuario (sano / lesionado).
// Faithful port del arnés output/qa-e2e/15-matriz.cjs a Playwright formal.
//
// Cada combo: registrar-o-reusar usuario → generar plan manual → confirmar →
// completar TODAS las sesiones → verificar progreso y filtro de lesiones → limpiar plan.
//
// Requisitos: backend en http://localhost:3010 y DATABASE_URL en backend/.env.
// Uso:
//   npx playwright test regresion-metodologias --project=regresion-api
//   MATRIX_QUICK=1 ...   → solo la primera semana de cada combo (humo rápido)
//   MATRIX_ONLY=calistenia,crossfit ...  → filtra por metodología
//
// Corre en serie (workers=1) para no agotar el pooler de Supabase.
//
// ⚠️ POOLER: contra la BD de producción (Supabase, pool_size=15) ejecutar los 13 combos
// de una vez satura el pooler a partir de ~7 combos (EMAXCONNSESSION). Para una corrida
// verde completa contra prod, ejecuta por lotes con MATRIX_ONLY, p. ej.:
//   MATRIX_ONLY=calistenia,crossfit,casa npx playwright test --project=regresion-api
//   MATRIX_ONLY=funcional,halterofilia,powerlifting,heavy_duty,hipertrofiav2 ...
// El pooler se recupera solo entre lotes. QUICK reduce sesiones pero no la presión de picos.

import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND = path.join(__dirname, '..', 'backend');
require(path.join(BACKEND, 'node_modules', 'dotenv')).config({ path: path.join(BACKEND, '.env') });
const { Pool } = require(path.join(BACKEND, 'node_modules', 'pg'));

const BASE = process.env.QA_BASE || 'http://localhost:3010';
const QUICK = !!process.env.MATRIX_QUICK;
const ONLY = (process.env.MATRIX_ONLY || '').split(',').map(s => s.trim()).filter(Boolean);

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 });
// El pooler de Supabase cierra conexiones idle; sin este handler el evento 'error'
// del cliente revienta el test aunque la query tenga su propio .catch.
pool.on('error', () => {});

// --- Usuarios canónicos de la suite (se crean si no existen) ---
const PASSWORD = 'QaTest1234!';
const USERS = {
  sano: {
    email: 'qa.regresion.sano@test.entrenaconia.local',
    limitaciones: '', banned: null,
    perfil: { nombre: 'QA', apellido: 'Sano', nivelEntrenamiento: 'intermedio', frecuenciaSemanal: 4 },
  },
  muneca: {
    email: 'qa.regresion.muneca@test.entrenaconia.local',
    limitaciones: 'Lesión de muñeca', banned: /flexi[oó]n|plancha|pino|handstand|fondo|dip|pike|push/i,
    perfil: { nombre: 'QA', apellido: 'Muneca', nivelEntrenamiento: 'intermedio', frecuenciaSemanal: 4 },
  },
  codo: {
    email: 'qa.regresion.codo@test.entrenaconia.local',
    limitaciones: 'Lesión de codo', banned: /dominada|pull.?up|muscle.?up|fondo|dip|tr[ií]ceps|francesa|pushdown/i,
    perfil: { nombre: 'QA', apellido: 'Codo', nivelEntrenamiento: 'intermedio', frecuenciaSemanal: 4 },
  },
};

// Matriz metodología × nivel × usuario (13 combos representativos).
let COMBOS = [
  ['calistenia', 'principiante', 'sano'],
  ['calistenia', 'intermedio', 'muneca'],
  ['calistenia', 'avanzado', 'codo'],
  ['crossfit', 'principiante', 'sano'],
  ['crossfit', 'intermedio', 'muneca'],
  ['crossfit', 'avanzado', 'codo'],
  ['casa', 'principiante', 'sano'],
  ['funcional', 'intermedio', 'muneca'],
  ['halterofilia', 'intermedio', 'muneca'],
  ['halterofilia', 'avanzado', 'codo'],
  ['powerlifting', 'intermedio', 'muneca'],
  ['heavy_duty', 'avanzado', 'codo'],
  ['hipertrofiav2', 'principiante', 'sano'],
];
if (ONLY.length) COMBOS = COMBOS.filter(([m]) => ONLY.includes(m));

// Reintenta SOLO ante error de red transitorio (ECONNRESET por reinicio de nodemon en
// dev). NO reintenta 5xx: cuando el pooler de Supabase se agota (pool_size=15) los 500
// no se recuperan dentro del run y reintentar agrava la saturación (retry storm).
async function api(method, p, token, body, attempt = 0) {
  try {
    const r = await fetch(BASE + p, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
    let j = {};
    try { j = await r.json(); } catch { /* respuesta sin cuerpo JSON */ }
    return { status: r.status, j };
  } catch (e) {
    if (attempt < 2) { await new Promise(res => setTimeout(res, 600 * (attempt + 1))); return api(method, p, token, body, attempt + 1); }
    throw e;
  }
}

// Registra el usuario si aún no existe; devuelve token.
async function ensureUser(key) {
  const u = USERS[key];
  const login = await api('POST', '/api/auth/login', null, { email: u.email, password: PASSWORD });
  if (login.j.token) return login.j.token;
  const reg = await api('POST', '/api/auth/register', null, {
    ...u.perfil,
    email: u.email, password: PASSWORD,
    edad: 30, sexo: 'masculino', peso: 78, altura: 178,
    anosEntrenando: 3, nivelActividad: 'moderado',
    limitacionesFisicas: u.limitaciones,
    objetivoPrincipal: 'ganar_musculo', enfoqueEntrenamiento: 'mixto',
  });
  if (!reg.j.token) throw new Error(`No se pudo crear/loguear ${u.email}: ${reg.status} ${JSON.stringify(reg.j).slice(0, 160)}`);
  return reg.j.token;
}

async function deletePlan(id) {
  const run = async (q) => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try { await pool.query(q, [id]); return; }
      catch { await new Promise(r => setTimeout(r, 500)); }
    }
  };
  for (const q of [
    'DELETE FROM app.hypertrophy_set_logs WHERE session_id IN (SELECT id FROM app.methodology_exercise_sessions WHERE methodology_plan_id=$1)',
    'DELETE FROM app.exercise_session_tracking WHERE methodology_session_id IN (SELECT id FROM app.methodology_exercise_sessions WHERE methodology_plan_id=$1)',
    'DELETE FROM app.methodology_exercise_sessions WHERE methodology_plan_id=$1',
    'DELETE FROM app.workout_schedule WHERE methodology_plan_id=$1',
    'DELETE FROM app.methodology_plan_days WHERE plan_id=$1',
    'DELETE FROM app.plan_start_config WHERE methodology_plan_id=$1',
    'DELETE FROM app.methodology_plans WHERE id=$1',
  ]) await run(q);
}

const DAY_FULL = { Lun: 'Lunes', Mar: 'Martes', Mie: 'Miercoles', 'Mié': 'Miercoles', Jue: 'Jueves', Vie: 'Viernes', Sab: 'Sabado', 'Sáb': 'Sabado', Dom: 'Domingo' };

test('hipertrofia manual: el proxy acepta canónico y aliases sin caer al generador genérico', async () => {
  test.setTimeout(180_000);
  const token = await ensureUser('sano');
  const createdPlans = [];
  try {
    for (const methodology of ['hipertrofia', 'hipertrofiav2', 'HipertrofiaV2_MindFeed']) {
      const gen = await api('POST', '/api/methodology/generate', token, {
        mode: 'manual',
        methodology,
        selectedLevel: 'principiante',
        nivel: 'principiante',
        goals: '',
        selectedMuscleGroups: [],
        source: 'manual_selection',
        version: '5.0',
      });

      const planId = gen.j.methodology_plan_id || gen.j.planId || gen.j.plan?.methodology_plan_id;
      expect(gen.status, `${methodology} responde 200`).toBe(200);
      expect(gen.j.success, `${methodology} success`).toBeTruthy();
      expect(gen.j.message, `${methodology} usa el motor dedicado`).toBe('Plan MindFeed D1-D5 generado exitosamente');
      expect(gen.j.system_info?.ciclo, `${methodology} ciclo dedicado`).toBe('D1-D5');
      expect(gen.j.system_info?.motor, `${methodology} motor MindFeed`).toContain('MindFeed');
      expect(planId, `${methodology} plan persistido`).toBeTruthy();
      createdPlans.push(planId);
    }
  } finally {
    for (const planId of createdPlans) {
      await deletePlan(planId);
    }
  }
});

// Tests independientes ejecutados en serie por `workers: 1` (no 'serial' mode:
// así un combo que falle no aborta el resto y el informe cubre toda la matriz).
test.afterAll(async () => { await pool.end().catch(() => {}); });

for (const [methodology, level, userKey] of COMBOS) {
  test(`${methodology} · ${level} · ${userKey}`, async () => {
    test.setTimeout(QUICK ? 120_000 : 600_000);
    const u = USERS[userKey];
    const token = await ensureUser(userKey);

    // 1) Generar plan manual
    const gen = await api('POST', '/api/methodology/generate', token, {
      mode: 'manual', methodology, selectedLevel: level, nivel: level,
      goals: '', selectedMuscleGroups: [], source: 'manual_selection', version: '5.0',
    });
    const planId = gen.j.methodology_plan_id || gen.j.planId || gen.j.plan?.methodology_plan_id;
    expect(planId, `generación de plan (${gen.status} ${JSON.stringify(gen.j).slice(0, 160)})`).toBeTruthy();

    try {
      // 2) Confirmar plan
      const conf = await api('POST', '/api/routines/confirm-plan', token, { methodology_plan_id: planId });
      expect(conf.status, 'confirmar plan').toBe(200);

      // 3) Leer calendario
      const cal = await api('GET', `/api/routines/calendar-schedule/${planId}`, token);
      const semanas = cal.j.plan?.semanas || [];
      let sessions = semanas.flatMap(w => (w.sesiones || []).map(s => ({
        date: String(s.fecha).slice(0, 10), week: w.semana || w.numero, day: DAY_FULL[s.dia] || s.dia,
      }))).filter(s => s.date && s.date !== 'undefined');
      expect(sessions.length, 'el plan debe tener sesiones programadas').toBeGreaterThan(0);
      if (QUICK) {
        const firstWeek = sessions[0].week;
        sessions = sessions.filter(s => s.week === firstWeek);
      }

      // 4) Completar todas las sesiones
      let ok = 0, fails = 0;
      const injuryHits = new Set();
      for (const s of sessions) {
        const start = await api('POST', '/api/routines/sessions/start', token, {
          methodology_plan_id: planId, session_date: s.date, week_number: s.week, day_name: s.day,
        });
        const sid = start.j.session_id || start.j.sessionId;
        if (!sid) { fails++; continue; }
        const prog = await api('GET', `/api/routines/sessions/${sid}/progress`, token);
        for (const ex of (prog.j.exercises || [])) {
          if (u.banned && u.banned.test(ex.exercise_name || '')) injuryHits.add(ex.exercise_name);
          await api('PUT', `/api/routines/sessions/${sid}/exercise/${ex.exercise_order}`, token, {
            series_completed: Number(ex.planned_sets) || 3, status: 'completed', time_spent_seconds: 120,
          });
        }
        const fin = await api('POST', `/api/routines/sessions/${sid}/finish`, token);
        if (fin.status === 200) ok++; else fails++;
      }

      // 5) Verificaciones
      expect([...injuryHits], `ejercicios contraindicados servidos a "${userKey}"`).toEqual([]);
      expect(fails, 'sesiones con fallo al iniciar/finalizar').toBe(0);
      expect(ok, 'todas las sesiones completadas').toBe(sessions.length);

      if (!QUICK) {
        const pd = await api('GET', `/api/routines/progress-data?methodology_plan_id=${planId}`, token);
        const d = pd.j.data || pd.j;
        const weeks100 = (d.weeklyProgress || []).filter(w => Number(w.completed) === Number(w.sessions) && Number(w.sessions) > 0).length;
        expect(weeks100, 'semanas al 100% en Progreso').toBe(Number(d.totalWeeks));
      }
    } finally {
      await deletePlan(planId);
    }
  });
}
