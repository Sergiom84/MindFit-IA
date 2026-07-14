// E2E por API para cualquier usuario/metodología/nivel:
// genera plan manual → confirma (inicio lunes) → completa TODAS las sesiones → verifica progreso.
// Uso: node 14-e2e-nivel.cjs <email> <password> <methodology> <level> [bannedRegex]
const BASE = 'http://localhost:3010';
const [EMAIL, PASS, METHODOLOGY, LEVEL, BANNED] = process.argv.slice(2);
if (!EMAIL || !METHODOLOGY || !LEVEL) { console.error('Uso: email pass methodology level [bannedRegex]'); process.exit(1); }
const banned = BANNED ? new RegExp(BANNED, 'i') : null;

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
  const login = await api('POST', '/api/auth/login', null, { email: EMAIL, password: PASS });
  const token = login.j.token;
  if (!token) { console.error('LOGIN FAIL', JSON.stringify(login.j).slice(0, 150)); process.exit(1); }
  console.log(`LOGIN OK (${EMAIL.split('@')[0]})`);

  // 1) Generar plan manual
  const gen = await api('POST', '/api/methodology/generate', token, {
    mode: 'manual', methodology: METHODOLOGY, selectedLevel: LEVEL,
    goals: '', selectedMuscleGroups: [], source: 'manual_selection', version: '5.0'
  });
  const planId = gen.j.methodology_plan_id || gen.j.planId;
  if (!planId) { console.error('GEN FAIL', gen.status, JSON.stringify(gen.j).slice(0, 300)); process.exit(1); }
  console.log(`PLAN generado: ${planId} (${METHODOLOGY} ${LEVEL})`);

  // 2) Confirmar (sin startConfig → con el fix, en finde ancla al próximo lunes)
  const conf = await api('POST', '/api/routines/confirm-plan', token, { methodology_plan_id: planId });
  console.log('CONFIRM:', conf.status, conf.j.status || conf.j.error || '');

  // 3) Calendario de sesiones
  const cal = await api('GET', `/api/routines/calendar-schedule/${planId}`, token);
  const semanas = cal.j.plan?.semanas || [];
  const DAY_FULL = { Lun: 'Lunes', Mar: 'Martes', Mie: 'Miercoles', 'Mié': 'Miercoles', Jue: 'Jueves', Vie: 'Viernes', Sab: 'Sabado', 'Sáb': 'Sabado', Dom: 'Domingo' };
  const sessions = semanas.flatMap(w => (w.sesiones || []).map(s => ({
    scheduled_date: s.fecha,
    week_number: w.semana || w.numero,
    day_name: DAY_FULL[s.dia] || s.dia
  }))).filter(s => s.scheduled_date);
  console.log(`SESIONES programadas: ${sessions.length}`);
  if (!sessions.length) { console.error('SIN CALENDARIO', JSON.stringify(cal.j).slice(0, 300)); process.exit(1); }

  // 4) Completar todas
  let ok = 0, fails = 0; const injuryHits = new Set(); let exercisesSeen = new Set();
  for (const s of sessions) {
    const date = String(s.scheduled_date).slice(0, 10);
    const start = await api('POST', '/api/routines/sessions/start', token, {
      methodology_plan_id: planId,
      session_date: date,
      week_number: s.week_number,
      day_name: s.day_name
    });
    const sid = start.j.session_id || start.j.sessionId;
    if (!sid) { fails++; console.log(`  ${date} start FAIL ${start.status} ${String(start.j.error).slice(0, 80)}`); continue; }
    const prog = await api('GET', `/api/routines/sessions/${sid}/progress`, token);
    const exercises = prog.j.exercises || [];
    for (const ex of exercises) {
      exercisesSeen.add(ex.exercise_name);
      if (banned && banned.test(ex.exercise_name || '')) injuryHits.add(ex.exercise_name);
      await api('PUT', `/api/routines/sessions/${sid}/exercise/${ex.exercise_order}`, token, {
        series_completed: Number(ex.planned_sets) || 3, status: 'completed', time_spent_seconds: 120
      });
    }
    const fin = await api('POST', `/api/routines/sessions/${sid}/finish`, token);
    if (fin.status === 200) ok++; else { fails++; console.log(`  ${date} finish FAIL ${fin.status}`); }
  }
  console.log(`COMPLETADAS: ${ok}/${sessions.length} (fails: ${fails})`);
  console.log(`EJERCICIOS únicos vistos: ${exercisesSeen.size}`);
  console.log(banned ? (injuryHits.size ? `⛔ CONTRAINDICADOS SERVIDOS: ${[...injuryHits].join(', ')}` : '✅ Ninguna sesión sirvió ejercicios contraindicados') : '(sin patrón de lesión)');

  // 5) Verificar progreso
  const pd = await api('GET', `/api/routines/progress-data?methodology_plan_id=${planId}`, token);
  const d = pd.j.data || pd.j;
  console.log('PROGRESO:', JSON.stringify({
    totalWeeks: d.totalWeeks, completedSessions: d.completedSessions, totalSessions: d.totalSessions,
    semanas100: (d.weeklyProgress || []).filter(w => Number(w.completed) === Number(w.sessions) && Number(w.sessions) > 0).length
  }));
  console.log('PLAN_ID_FINAL=' + planId);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
