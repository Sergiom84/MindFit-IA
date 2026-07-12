// Verifica que el endpoint PUT /sessions/:id/warmup-time persiste warmup_time_seconds.
const path = require('path');
require(path.join(__dirname, '../../backend/node_modules/dotenv')).config({ path: path.join(__dirname, '../../backend/.env') });
const { Pool } = require(path.join(__dirname, '../../backend/node_modules/pg'));
const API = 'http://localhost:3010';
async function api(m, p, t, b) { const r = await fetch(API + p, { method: m, headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) }, body: b ? JSON.stringify(b) : undefined }); let j = {}; try { j = await r.json(); } catch {} return { status: r.status, j }; }

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 }); pool.on('error', () => {});
  const login = await api('POST', '/api/auth/login', null, { email: 'qa.regresion.sano@test.entrenaconia.local', password: 'QaTest1234!' });
  const t = login.j.token;
  const gen = await api('POST', '/api/methodology/generate', t, { mode: 'manual', methodology: 'calistenia', selectedLevel: 'principiante', nivel: 'principiante', goals: '', selectedMuscleGroups: [], source: 'manual_selection', version: '5.0' });
  const pid = gen.j.methodology_plan_id || gen.j.planId;
  await api('POST', '/api/routines/confirm-plan', t, { methodology_plan_id: pid });
  const cal = await api('GET', `/api/routines/calendar-schedule/${pid}`, t);
  const s0 = (cal.j.plan?.semanas || []).flatMap(w => (w.sesiones || []).map(s => ({ d: String(s.fecha).slice(0, 10), dia: s.dia, sem: w.semana })))[0];
  const start = await api('POST', '/api/routines/sessions/start', t, { methodology_plan_id: pid, session_date: s0.d, week_number: s0.sem, day_name: { Lun: 'Lunes', Mar: 'Martes', Mie: 'Miercoles', Jue: 'Jueves', Vie: 'Viernes', Sab: 'Sabado', Dom: 'Domingo' }[s0.dia] || s0.dia });
  const sid = start.j.session_id || start.j.sessionId;
  console.log('Sesión creada:', sid);

  const before = await pool.query('SELECT warmup_time_seconds FROM app.methodology_exercise_sessions WHERE id=$1', [sid]);
  console.log('warmup ANTES:', before.rows[0]?.warmup_time_seconds);

  const put = await api('PUT', `/api/routines/sessions/${sid}/warmup-time`, t, { warmup_time_seconds: 187 });
  console.log('PUT warmup-time:', put.status, JSON.stringify(put.j).slice(0, 120));

  const after = await pool.query('SELECT warmup_time_seconds, total_duration_seconds FROM app.methodology_exercise_sessions WHERE id=$1', [sid]);
  console.log('warmup DESPUÉS:', JSON.stringify(after.rows[0]));
  console.log(Number(after.rows[0]?.warmup_time_seconds) === 187 ? '✅ Endpoint persiste warmup_time_seconds correctamente' : '❌ NO persiste');

  // limpiar
  await pool.query('DELETE FROM app.methodology_exercise_progress WHERE methodology_session_id=$1', [sid]).catch(() => {});
  await pool.query('DELETE FROM app.methodology_exercise_sessions WHERE id=$1', [sid]).catch(() => {});
  for (const q of ['DELETE FROM app.workout_schedule WHERE methodology_plan_id=$1', 'DELETE FROM app.methodology_plan_days WHERE plan_id=$1', 'DELETE FROM app.plan_start_config WHERE methodology_plan_id=$1', 'DELETE FROM app.methodology_plans WHERE id=$1']) await pool.query(q, [pid]).catch(() => {});
  await pool.end();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
