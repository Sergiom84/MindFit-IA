// Matriz E2E: metodología × nivel × usuario. Cada combo: generar → confirmar →
// completar TODAS las sesiones → verificar progreso → borrar plan (deja usuarios limpios).
const path = require('path');
require(path.join(__dirname, '../../backend/node_modules/dotenv')).config({ path: path.join(__dirname, '../../backend/.env') });
const { Pool } = require(path.join(__dirname, '../../backend/node_modules/pg'));
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 });

const BASE = 'http://localhost:3010';
const USERS = {
  carlos: { email: 'carlos.calis.1782892677674@test.entrenaconia.local', banned: null },
  elena: { email: 'elena.calis.1782892677674@test.entrenaconia.local', banned: /flexi[oó]n|plancha|pino|handstand|fondo|dip|pike|push/i },
  diego: { email: 'diego.calis.1782892677674@test.entrenaconia.local', banned: /dominada|pull.?up|muscle.?up|fondo|dip|tr[ií]ceps|francesa|pushdown/i }
};
const COMBOS = [
  // Reintento de los 3 que fallaron por agotamiento del pool de conexiones
  ['halterofilia', 'intermedio', 'elena'],
  ['halterofilia', 'avanzado', 'diego'],
  ['hipertrofiav2', 'principiante', 'carlos']
];

async function api(method, p, token, body) {
  const r = await fetch(BASE + p, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  let j = {};
  try { j = await r.json(); } catch {}
  return { status: r.status, j };
}

async function deletePlan(id) {
  for (const q of [
    'DELETE FROM app.hypertrophy_set_logs WHERE session_id IN (SELECT id FROM app.methodology_exercise_sessions WHERE methodology_plan_id=$1)',
    'DELETE FROM app.exercise_session_tracking WHERE methodology_session_id IN (SELECT id FROM app.methodology_exercise_sessions WHERE methodology_plan_id=$1)',
    'DELETE FROM app.methodology_exercise_sessions WHERE methodology_plan_id=$1',
    'DELETE FROM app.workout_schedule WHERE methodology_plan_id=$1',
    'DELETE FROM app.methodology_plan_days WHERE plan_id=$1',
    'DELETE FROM app.plan_start_config WHERE methodology_plan_id=$1',
    'DELETE FROM app.methodology_plans WHERE id=$1'
  ]) await pool.query(q, [id]).catch(() => {});
}

const DAY_FULL = { Lun: 'Lunes', Mar: 'Martes', Mie: 'Miercoles', 'Mié': 'Miercoles', Jue: 'Jueves', Vie: 'Viernes', Sab: 'Sabado', 'Sáb': 'Sabado', Dom: 'Domingo' };

async function runCombo(methodology, level, userKey) {
  const u = USERS[userKey];
  const tag = `${methodology}/${level}/${userKey}`;
  const login = await api('POST', '/api/auth/login', null, { email: u.email, password: 'QaTest1234!' });
  const token = login.j.token;
  if (!token) return { tag, verdict: 'LOGIN_FAIL' };

  const gen = await api('POST', '/api/methodology/generate', token, {
    mode: 'manual', methodology, selectedLevel: level, nivel: level,
    goals: '', selectedMuscleGroups: [], source: 'manual_selection', version: '5.0'
  });
  const planId = gen.j.methodology_plan_id || gen.j.planId || gen.j.plan?.methodology_plan_id;
  if (!planId) return { tag, verdict: `GEN_FAIL ${gen.status} ${JSON.stringify(gen.j).slice(0, 140)}` };

  const conf = await api('POST', '/api/routines/confirm-plan', token, { methodology_plan_id: planId });
  if (conf.status !== 200) { await deletePlan(planId); return { tag, planId, verdict: `CONFIRM_FAIL ${conf.status}` }; }

  const cal = await api('GET', `/api/routines/calendar-schedule/${planId}`, token);
  const semanas = cal.j.plan?.semanas || [];
  const sessions = semanas.flatMap(w => (w.sesiones || []).map(s => ({
    date: String(s.fecha).slice(0, 10), week: w.semana || w.numero, day: DAY_FULL[s.dia] || s.dia
  }))).filter(s => s.date && s.date !== 'undefined');

  let ok = 0, fails = 0; const hits = new Set();
  for (const s of sessions) {
    const start = await api('POST', '/api/routines/sessions/start', token, {
      methodology_plan_id: planId, session_date: s.date, week_number: s.week, day_name: s.day
    });
    const sid = start.j.session_id || start.j.sessionId;
    if (!sid) { fails++; continue; }
    const prog = await api('GET', `/api/routines/sessions/${sid}/progress`, token);
    for (const ex of (prog.j.exercises || [])) {
      if (u.banned && u.banned.test(ex.exercise_name || '')) hits.add(ex.exercise_name);
      await api('PUT', `/api/routines/sessions/${sid}/exercise/${ex.exercise_order}`, token, {
        series_completed: Number(ex.planned_sets) || 3, status: 'completed', time_spent_seconds: 120
      });
    }
    const fin = await api('POST', `/api/routines/sessions/${sid}/finish`, token);
    if (fin.status === 200) ok++; else fails++;
  }

  const pd = await api('GET', `/api/routines/progress-data?methodology_plan_id=${planId}`, token);
  const d = pd.j.data || pd.j;
  const weeks100 = (d.weeklyProgress || []).filter(w => Number(w.completed) === Number(w.sessions) && Number(w.sessions) > 0).length;

  await deletePlan(planId);
  const verdict = (fails === 0 && ok === sessions.length && sessions.length > 0 && hits.size === 0)
    ? `OK ${ok}/${sessions.length} sesiones · ${d.totalWeeks} sem · ${weeks100} sem al 100%`
    : `REVISAR ok=${ok}/${sessions.length} fails=${fails} weeks100=${weeks100}${hits.size ? ' ⛔' + [...hits].join(',') : ''}`;
  return { tag, planId, verdict };
}

(async () => {
  for (const [m, l, u] of COMBOS) {
    try {
      const r = await runCombo(m, l, u);
      console.log(`${r.verdict.startsWith('OK') ? '✅' : '❌'} ${r.tag} → ${r.verdict}`);
    } catch (e) {
      console.log(`❌ ${m}/${l}/${u} → EXCEPTION ${e.message.slice(0, 120)}`);
    }
  }
  await pool.end();
})();
