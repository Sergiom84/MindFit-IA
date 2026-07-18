const API = 'http://localhost:3010';
async function api(m, p, t, b) { const r = await fetch(API + p, { method: m, headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) }, body: b ? JSON.stringify(b) : undefined }); let j = {}; try { j = await r.json(); } catch {} return { status: r.status, j }; }
(async () => {
  const email = `qa.mf.setup.${Date.now()}@test.entrenaconia.local`;
  const reg = await api('POST', '/api/auth/register', null, { nombre: 'QA', apellido: 'Setup', email, password: 'QaTest2026!', edad: 29, sexo: 'femenino', peso: 64, altura: 167, nivelEntrenamiento: 'principiante', anosEntrenando: 1, frecuenciaSemanal: 4, nivelActividad: 'moderado', objetivoPrincipal: 'ganar_masa_muscular', enfoqueEntrenamiento: 'hipertrofia', metodologiaPreferida: 'bodybuilding' });
  console.log('register:', reg.status, 'user', reg.j.user?.id, 'token?', !!reg.j.token);
  const t = reg.j.token;
  const gen = await api('POST', '/api/methodology/generate', t, { mode: 'manual', methodology: 'hipertrofiav2', selectedLevel: 'principiante', nivel: 'principiante', goals: '', selectedMuscleGroups: [], source: 'manual_selection', version: '5.0' });
  console.log('generate:', gen.status, JSON.stringify(gen.j).slice(0, 200));
  const pid = gen.j.methodology_plan_id || gen.j.planId;
  const conf = await api('POST', '/api/routines/confirm-plan', t, { methodology_plan_id: pid });
  console.log('confirm:', conf.status, JSON.stringify(conf.j).slice(0, 150));
  const cal = await api('GET', `/api/routines/calendar-schedule/${pid}`, t);
  const semanas = cal.j.plan?.semanas || [];
  const sesiones = semanas.flatMap(w => w.sesiones || []);
  console.log('calendar:', cal.status, 'semanas', semanas.length, 'sesiones', sesiones.length, 'keys:', JSON.stringify(Object.keys(cal.j)).slice(0, 120));
  if (!sesiones.length) console.log('cal raw:', JSON.stringify(cal.j).slice(0, 300));
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
