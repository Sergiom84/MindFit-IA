// Verifica que al finalizar, total_duration_seconds = suma de tiempos de ejercicios (+warmup).
require('../../backend/node_modules/dotenv').config({ path: '../../backend/.env' });
const { Pool } = require('../../backend/node_modules/pg');
const API = 'http://localhost:3010';
async function api(m, p, t, b) { const r = await fetch(API + p, { method: m, headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) }, body: b ? JSON.stringify(b) : undefined }); let j = {}; try { j = await r.json(); } catch {} return { status: r.status, j }; }
(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 }); pool.on('error', () => {});
  const t = (await api('POST', '/api/auth/login', null, { email: 'qa.regresion.sano@test.entrenaconia.local', password: 'QaTest1234!' })).j.token;
  const gen = await api('POST', '/api/methodology/generate', t, { mode: 'manual', methodology: 'calistenia', selectedLevel: 'principiante', nivel: 'principiante', goals: '', selectedMuscleGroups: [], source: 'manual_selection', version: '5.0' });
  const pid = gen.j.methodology_plan_id || gen.j.planId;
  await api('POST', '/api/routines/confirm-plan', t, { methodology_plan_id: pid });
  const cal = await api('GET', `/api/routines/calendar-schedule/${pid}`, t);
  const s0 = (cal.j.plan?.semanas || []).flatMap(w => (w.sesiones || []).map(s => ({ d: String(s.fecha).slice(0, 10), dia: s.dia, sem: w.semana })))[0];
  const start = await api('POST', '/api/routines/sessions/start', t, { methodology_plan_id: pid, session_date: s0.d, week_number: s0.sem, day_name: { Lun: 'Lunes', Mar: 'Martes', Mie: 'Miercoles', Jue: 'Jueves', Vie: 'Viernes', Sab: 'Sabado', Dom: 'Domingo' }[s0.dia] || s0.dia });
  const sid = start.j.session_id || start.j.sessionId;
  // warmup 90s ANTES de los ejercicios (como en el flujo real)
  await api('PUT', `/api/routines/sessions/${sid}/warmup-time`, t, { warmup_time_seconds: 90 });
  const prog = await api('GET', `/api/routines/sessions/${sid}/progress`, t);
  let expected = 90;
  for (const ex of (prog.j.exercises || [])) { await api('PUT', `/api/routines/sessions/${sid}/exercise/${ex.exercise_order}`, t, { series_completed: Number(ex.planned_sets) || 3, status: 'completed', time_spent_seconds: 120 }); expected += 120; }
  await api('POST', `/api/routines/sessions/${sid}/finish`, t);
  const row = (await pool.query('SELECT total_duration_seconds FROM app.methodology_exercise_sessions WHERE id=$1', [sid])).rows[0];
  console.log(`Esperado (suma ejercicios ${expected - 90} + warmup 90) = ${expected}s | total_duration_seconds = ${row.total_duration_seconds}s`);
  console.log(Number(row.total_duration_seconds) >= expected ? '✅ Duración refleja el tiempo real de entrenamiento' : '❌ Duración sigue mal');
  // limpiar
  await pool.query('DELETE FROM app.hypertrophy_set_logs WHERE session_id IN (SELECT id FROM app.methodology_exercise_sessions WHERE methodology_plan_id=$1)', [pid]).catch(() => {});
  await pool.query('DELETE FROM app.methodology_exercise_progress WHERE methodology_session_id=$1', [sid]).catch(() => {});
  await pool.query('DELETE FROM app.methodology_exercise_sessions WHERE methodology_plan_id=$1', [pid]).catch(() => {});
  for (const q of ['DELETE FROM app.workout_schedule WHERE methodology_plan_id=$1', 'DELETE FROM app.methodology_plan_days WHERE plan_id=$1', 'DELETE FROM app.plan_start_config WHERE methodology_plan_id=$1', 'DELETE FROM app.methodology_plans WHERE id=$1']) await pool.query(q, [pid]).catch(() => {});
  await pool.end();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
