// Verifica el ciclo cancelar rutina por API: gen → confirm → active-plan → cancel → active-plan.
const API = 'http://localhost:3010';
async function api(m, p, t, b) {
  const r = await fetch(API + p, { method: m, headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) }, body: b ? JSON.stringify(b) : undefined });
  let j = {}; try { j = await r.json(); } catch {}
  return { status: r.status, j };
}
(async () => {
  const login = await api('POST', '/api/auth/login', null, { email: 'qa.regresion.sano@test.entrenaconia.local', password: 'QaTest1234!' });
  const t = login.j.token;
  const gen = await api('POST', '/api/methodology/generate', t, { mode: 'manual', methodology: 'calistenia', selectedLevel: 'principiante', nivel: 'principiante', goals: '', selectedMuscleGroups: [], source: 'manual_selection', version: '5.0' });
  const pid = gen.j.methodology_plan_id || gen.j.planId;
  await api('POST', '/api/routines/confirm-plan', t, { methodology_plan_id: pid });
  const before = await api('GET', '/api/routines/active-plan', t);
  const activeBefore = before.j.plan?.methodology_plan_id || before.j.methodology_plan_id || before.j.plan?.id || null;
  console.log('planId', pid, '| active-plan ANTES de cancelar:', activeBefore, '(status', before.status + ')');
  const cancel = await api('POST', '/api/routines/cancel-routine', t, { methodology_plan_id: pid });
  console.log('cancel-routine:', cancel.status, JSON.stringify(cancel.j).slice(0, 120));
  const after = await api('GET', '/api/routines/active-plan', t);
  const activeAfter = after.j.plan?.methodology_plan_id || after.j.methodology_plan_id || after.j.plan?.id || null;
  console.log('active-plan DESPUÉS de cancelar:', activeAfter, '(status', after.status + ')');
  console.log(activeAfter && String(activeAfter) === String(pid) ? '❌ SIGUE ACTIVO → bug real' : '✅ Cancelación efectiva (plan ya no activo)');
})().catch(e => { console.error(e.message); process.exit(1); });
