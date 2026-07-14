// Completa sesiones del plan por API replicando las llamadas del reproductor.
// Uso: node 09-completar-por-api.cjs 2026-07-13 [2026-07-15 ...]  (o "all" para todas las programadas)
const BASE = 'http://localhost:3010';
const EMAIL = 'lucia.ferrero.qa@entrenaconia-test.com';
const PASS = 'QaCalis2026!';
const PLAN = 608;

async function api(method, path, token, body) {
  const r = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  let j = {};
  try { j = await r.json(); } catch {}
  return { status: r.status, j };
}

(async () => {
  const dates = process.argv.slice(2);
  if (!dates.length) { console.error('Falta fecha(s) YYYY-MM-DD'); process.exit(1); }

  const login = await api('POST', '/api/auth/login', null, { email: EMAIL, password: PASS });
  const token = login.j.token;
  if (!token) { console.error('LOGIN FAIL', JSON.stringify(login.j).slice(0, 200)); process.exit(1); }

  for (const date of dates) {
    console.log(`\n=== ${date} ===`);
    // 1) start (resolución por fecha)
    const d = new Date(date + 'T12:00:00');
    const startPlan = new Date('2026-07-13T12:00:00');
    const dayId = Math.round((d - startPlan) / 86400000) + 1;
    const weekNumber = Math.ceil(dayId / 7);
    const dayName = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'][d.getDay()];
    const start = await api('POST', '/api/routines/sessions/start', token, {
      methodology_plan_id: PLAN,
      session_date: date,
      day_id: dayId,
      week_number: weekNumber,
      day_name: dayName
    });
    let sid = start.j.session_id || start.j.sessionId;
    if (!sid && /ya existe/i.test(String(start.j.error))) sid = start.j.session_id;
    console.log('start:', start.status, 'sid=', sid, start.j.error || '');
    if (!sid) { console.log('  SIN SESION, salto'); continue; }

    // 2) progreso → ejercicios
    const prog = await api('GET', `/api/routines/sessions/${sid}/progress`, token);
    const exercises = prog.j.exercises || [];
    console.log('ejercicios:', exercises.length, exercises.map(e => `${e.exercise_order}:${(e.exercise_name || '').slice(0, 22)}`).join(' | '));

    // 3) completar cada ejercicio (3 series)
    for (const ex of exercises) {
      const series = Number(ex.planned_sets) || 3;
      const upd = await api('PUT', `/api/routines/sessions/${sid}/exercise/${ex.exercise_order}`, token, {
        series_completed: series,
        status: 'completed',
        time_spent_seconds: 60 * series
      });
      if (upd.status !== 200) console.log(`  ex${ex.exercise_order} FAIL ${upd.status}`, JSON.stringify(upd.j).slice(0, 120));
    }

    // 4) finish
    const fin = await api('POST', `/api/routines/sessions/${sid}/finish`, token);
    console.log('finish:', fin.status, JSON.stringify(fin.j).slice(0, 220));
  }
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
