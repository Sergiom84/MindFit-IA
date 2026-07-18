// E2E de la feature me gusta / no me gusta / difícil + modo extra por preferencias.
// Usuario nuevo → plan calistenia → sesión con feedback like/dislike/hard →
// GET /routines/exercise-preferences → single-day selectionMode 'liked'.
const BASE = 'http://localhost:3010';

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
  const email = `qa.pref.${Math.floor(Math.random() * 100000)}@entrenaconia-test.com`;
  const reg = await api('POST', '/api/auth/register', null, {
    nombre: 'QA', apellido: 'Pref', email, password: 'QaTest2026!',
    edad: 30, sexo: 'femenino', peso: 62, altura: 165,
    nivelEntrenamiento: 'intermedio', anosEntrenando: 2, frecuenciaSemanal: 3,
    nivelActividad: 'moderado', objetivoPrincipal: 'ganar_masa_muscular', enfoqueEntrenamiento: 'hipertrofia', metodologiaPreferida: 'calistenia'
  });
  const token = reg.j.token;
  if (!token) { console.error('REGISTER FAIL', JSON.stringify(reg.j).slice(0, 200)); process.exit(1); }

  const gen = await api('POST', '/api/methodology/generate', token, {
    mode: 'manual', methodology: 'calistenia', selectedLevel: 'Intermedio',
    goals: '', selectedMuscleGroups: [], source: 'manual_selection', version: '5.0'
  });
  const planId = gen.j.methodology_plan_id || gen.j.planId;
  await api('POST', '/api/routines/confirm-plan', token, { methodology_plan_id: planId });

  const cal = await api('GET', `/api/routines/calendar-schedule/${planId}`, token);
  const s = (cal.j.plan?.semanas || [])[0]?.sesiones?.[0];
  const start = await api('POST', '/api/routines/sessions/start', token, {
    methodology_plan_id: planId, session_date: String(s.fecha).slice(0, 10),
    week_number: 1, day_name: 'Lunes'
  });
  const sid = start.j.session_id;
  const prog = await api('GET', `/api/routines/sessions/${sid}/progress`, token);
  const exercises = prog.j.exercises || [];
  console.log(`Sesión ${sid} con ${exercises.length} ejercicios`);

  // Feedback variado: 3 like, 2 dislike, resto hard
  const sentiments = ['like', 'like', 'like', 'dislike', 'dislike', 'hard', 'hard'];
  for (let i = 0; i < exercises.length && i < sentiments.length; i++) {
    const ex = exercises[i];
    const fb = await api('POST', `/api/routines/sessions/${sid}/exercise/${ex.exercise_order}/feedback`, token, {
      sentiment: sentiments[i], exerciseName: ex.exercise_name, comment: 'qa'
    });
    console.log(`  feedback ${sentiments[i]} → "${ex.exercise_name}" (${fb.status})`);
  }

  let pass = 0, fail = 0;
  const check = (name, cond) => { console.log(`${cond ? '✅' : '❌'} ${name}`); cond ? pass++ : fail++; };

  // 1) Agregado de preferencias
  const prefs = await api('GET', '/api/routines/exercise-preferences', token);
  console.log('PREFERENCIAS:', JSON.stringify(prefs.j.summary));
  check('GET exercise-preferences responde con summary', prefs.status === 200 && prefs.j.summary?.like >= 3);
  const liked = await api('GET', '/api/routines/exercise-preferences?sentiment=like', token);
  check('Filtro sentiment=like devuelve solo likes', liked.j.preferences?.every(p => p.sentiment === 'like') && liked.j.preferences.length >= 3);

  // 2) Modo extra "liked"
  const likedDay = await api('POST', '/api/methodology-session/generate-single-day', token, {
    methodology: 'calistenia', nivel: 'Intermedio', selectionMode: 'liked'
  });
  const names = (likedDay.j.workout?.exercises || []).map(e => e.nombre);
  console.log('MODO LIKED:', likedDay.status, JSON.stringify(names));
  const likedNames = new Set(liked.j.preferences.map(p => p.exercise_name));
  check('Single-day liked genera sesión', likedDay.status === 200 && names.length >= 3);
  check('Todos los ejercicios servidos son de los que te gustan', names.length > 0 && names.every(n => likedNames.has(n)));

  // 3) Modo extra "disliked" (dislike+hard = 4 valorados)
  const dislikedDay = await api('POST', '/api/methodology-session/generate-single-day', token, {
    methodology: 'calistenia', nivel: 'Intermedio', selectionMode: 'disliked'
  });
  const dNames = (dislikedDay.j.workout?.exercises || []).map(e => e.nombre);
  const dCount = (prefs.j.summary?.dislike || 0) + (prefs.j.summary?.hard || 0);
  console.log('MODO DISLIKED:', dislikedDay.status, JSON.stringify(dNames), `(valorados negativos: ${dCount})`);
  check('Single-day disliked coherente con nº de valoraciones',
    dCount >= 3
      ? (dislikedDay.status === 200 && dNames.length >= 3)
      : (dislikedDay.status !== 200 && /valorado/i.test(String(dislikedDay.j.details || dislikedDay.j.error))));

  // 4) Usuario sin valoraciones → error claro
  const email2 = `qa.pref.vacio.${Math.floor(Math.random() * 100000)}@entrenaconia-test.com`;
  const reg2 = await api('POST', '/api/auth/register', null, {
    nombre: 'QA', apellido: 'Vacio', email: email2, password: 'QaTest2026!',
    edad: 30, sexo: 'masculino', peso: 75, altura: 178,
    nivelEntrenamiento: 'principiante', anosEntrenando: 0, frecuenciaSemanal: 3,
    nivelActividad: 'ligero', objetivoPrincipal: 'ganar_masa_muscular', enfoqueEntrenamiento: 'hipertrofia', metodologiaPreferida: 'calistenia'
  });
  const empty = await api('POST', '/api/methodology-session/generate-single-day', reg2.j.token, {
    methodology: 'calistenia', nivel: 'Principiante', selectionMode: 'liked'
  });
  console.log('SIN VALORACIONES:', empty.status, String(empty.j.details || empty.j.error).slice(0, 90));
  check('Sin valoraciones devuelve error explicativo (no 200)', empty.status !== 200 && /valorado/i.test(String(empty.j.details || empty.j.error)));

  console.log(`\nRESULTADO: ${pass} pass / ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
