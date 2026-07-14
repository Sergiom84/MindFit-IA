// E2E ciclo de vida COMPLETO por metodología y nivel:
// registro de usuario → generación MANUAL del plan (apartado metodologías) →
// confirmación → completar TODAS las sesiones (con RIR por serie) → finalización.
// Verifica al final que el progreso refleja el plan completo.
// Uso: node 18-e2e-ciclo-completo.cjs <methodology> <level>
const BASE = process.env.QA_API || 'http://localhost:3010';
const [METHODOLOGY, LEVEL] = process.argv.slice(2);
if (!METHODOLOGY || !LEVEL) { console.error('Uso: methodology level'); process.exit(1); }

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
function parseReps(reps) { const m = String(reps || '').match(/^(\d+)/); return m ? parseInt(m[1], 10) : null; }

(async () => {
  // 1) REGISTRO
  const email = `qa.ciclo.${METHODOLOGY.toLowerCase()}.${LEVEL.toLowerCase()}.${Math.floor(Math.random() * 100000)}@entrenaconia-test.com`;
  const reg = await api('POST', '/api/auth/register', null, {
    nombre: 'QA', apellido: 'Ciclo', email, password: 'QaTest2026!',
    edad: 29, sexo: 'masculino', peso: 76, altura: 179,
    nivelEntrenamiento: LEVEL.toLowerCase(), anosEntrenando: LEVEL === 'Principiante' ? 0 : LEVEL === 'Intermedio' ? 2 : 5,
    frecuenciaSemanal: 3, nivelActividad: 'moderado', metodologiaPreferida: METHODOLOGY.toLowerCase()
  });
  const token = reg.j.token; const user = reg.j.user;
  if (!token) { console.error('REGISTRO FAIL', reg.status, JSON.stringify(reg.j).slice(0, 200)); process.exit(1); }
  console.log(`REGISTRO OK ${email} (id=${user?.id})`);

  // 2) GENERACIÓN MANUAL (selección manual en metodologías)
  const gen = await api('POST', '/api/methodology/generate', token, {
    mode: 'manual', methodology: METHODOLOGY, selectedLevel: LEVEL,
    goals: '', selectedMuscleGroups: [], source: 'manual_selection', version: '5.0'
  });
  const planId = gen.j.methodology_plan_id || gen.j.planId;
  if (!planId) { console.error('GENERACIÓN FAIL', gen.status, JSON.stringify(gen.j).slice(0, 300)); process.exit(1); }

  // 3) CONFIRMACIÓN
  const conf = await api('POST', '/api/routines/confirm-plan', token, { methodology_plan_id: planId });
  console.log(`PLAN ${planId} generado y confirmado (${conf.status})`);

  const cal = await api('GET', `/api/routines/calendar-schedule/${planId}`, token);
  const DAY_FULL = { Lun: 'Lunes', Mar: 'Martes', Mie: 'Miercoles', 'Mié': 'Miercoles', Jue: 'Jueves', Vie: 'Viernes', Sab: 'Sabado', 'Sáb': 'Sabado', Dom: 'Domingo' };
  const sessions = (cal.j.plan?.semanas || []).flatMap(w => (w.sesiones || []).map(s => ({
    date: String(s.fecha).slice(0, 10), week: w.semana || w.numero, day: DAY_FULL[s.dia] || s.dia
  }))).filter(s => s.date);
  console.log(`SESIONES programadas: ${sessions.length}`);
  if (!sessions.length) { console.error('SIN CALENDARIO'); process.exit(1); }

  // 4) COMPLETAR TODO EL PLAN (RIR realista: alterna 3/2/1 → ejercita autorregulación)
  let ok = 0, fails = 0, decisions = { progress: 0, hold: 0, deload: 0 };
  for (let i = 0; i < sessions.length; i++) {
    const s = sessions[i];
    const rir = [3, 2, 1][i % 3];
    const start = await api('POST', '/api/routines/sessions/start', token, {
      methodology_plan_id: planId, session_date: s.date, week_number: s.week, day_name: s.day
    });
    const sid = start.j.session_id;
    if (!sid) { fails++; console.log(`  [${i}] ${s.date} start FAIL ${start.status} ${String(start.j.error).slice(0, 80)}`); continue; }

    const prog = await api('GET', `/api/routines/sessions/${sid}/progress`, token);
    const exercises = prog.j.exercises || [];
    let lastAutoreg = null;
    for (const ex of exercises) {
      const sets = Number(ex.series_total) || 3;
      for (let sn = 1; sn <= sets; sn++) {
        await api('POST', '/api/hipertrofiav2/save-set', token, {
          userId: user.id, methodologyPlanId: planId, sessionId: sid,
          exercise_id: ex.exercise_id || null, exercise_name: ex.exercise_name,
          set_number: sn, weight: 0, reps: parseReps(ex.repeticiones) || 10, rir
        });
      }
      const put = await api('PUT', `/api/routines/sessions/${sid}/exercise/${ex.exercise_order}`, token, {
        series_completed: sets, status: 'completed', time_spent_seconds: 90
      });
      if (put.j.autoreg) lastAutoreg = put.j.autoreg;
    }
    const fin = await api('POST', `/api/routines/sessions/${sid}/finish`, token);
    const decision = lastAutoreg?.decision || fin.j.autoreg?.decision;
    if (decision && decisions[decision] != null) decisions[decision]++;
    if (fin.status === 200) ok++; else { fails++; console.log(`  [${i}] ${s.date} finish FAIL ${fin.status}`); }
    if (i % 6 === 0) console.log(`  [${i}/${sessions.length}] ${s.date} ok (decision=${decision || '—'})`);
  }

  // 5) VERIFICACIÓN FINAL
  const pd = await api('GET', `/api/routines/progress-data?methodology_plan_id=${planId}`, token);
  const d = pd.j.data || pd.j;
  const weeks100 = (d.weeklyProgress || []).filter(w => Number(w.completed) === Number(w.sessions) && Number(w.sessions) > 0).length;

  console.log('\n=== VERIFICACIÓN ===');
  let pass = 0, fail = 0;
  const check = (n, c) => { console.log(`${c ? '✅' : '❌'} ${n}`); c ? pass++ : fail++; };
  check(`Todas las sesiones completadas (${ok}/${sessions.length}, fails=${fails})`, ok === sessions.length && fails === 0);
  check(`Progreso refleja el plan (completadas ${d.completedSessions}/${d.totalSessions})`,
    Number(d.completedSessions) >= sessions.length && Number(d.totalSessions) >= sessions.length);
  check(`Semanas al 100%: ${weeks100}/${d.totalWeeks}`, weeks100 >= Number(d.totalWeeks) - 1);
  check(`Autorregulación activa durante el plan (${JSON.stringify(decisions)})`,
    decisions.progress + decisions.hold + decisions.deload > 0);

  console.log(`\nRESULTADO: ${pass} pass / ${fail} fail — ${METHODOLOGY} ${LEVEL} plan ${planId} (${sessions.length} sesiones)`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
