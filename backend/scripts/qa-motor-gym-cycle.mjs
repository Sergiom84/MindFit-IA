/**
 * Verificación de cierre de ciclo SIN pool pg propio (solo fetch), para no
 * añadir conexiones al pooler. Ejecuta las metodologías indicadas en QA_ONLY
 * (coma-separadas) o todas. generate → confirm → today → autoreg.
 */
import jwt from 'jsonwebtoken';

const BASE = process.env.QA_BASE || 'http://localhost:3013';
const SECRET = process.env.JWT_SECRET;
const ONLY = (process.env.QA_ONLY || 'gimnasio,casa,heavy-duty,powerlifting,halterofilia').split(',');

const USERS = {
  carlos: { id: 911, email: 'carlos.calis.1782892677674@test.entrenaconia.local', level: 'principiante' },
  elena:  { id: 912, email: 'elena.calis.1782892677674@test.entrenaconia.local',  level: 'intermedio' },
  diego:  { id: 913, email: 'diego.calis.1782892677674@test.entrenaconia.local',  level: 'avanzado' }
};
const PLAN = {
  gimnasio:     { user: 'carlos', autoreg: null },
  casa:         { user: 'elena',  equipmentLevel: 'basico', autoreg: { path: 'casa/session-result', body: { avgRir: 2, targetMet: true } } },
  'heavy-duty': { user: 'diego',  autoreg: { path: 'heavy-duty/session-result', body: { reachedFailure: true, targetMet: true } } },
  powerlifting: { user: 'carlos', autoreg: { path: 'powerlifting/session-result', body: { rpe: 8, targetMet: true, goodTechnique: true } } },
  halterofilia: { user: 'elena',  autoreg: { path: 'halterofilia/session-result', body: { rpe: 7, targetMet: true, goodTechnique: true } } }
};

const tok = (u) => jwt.sign({ userId: u.id, email: u.email }, SECRET, { expiresIn: '2h' });
async function api(method, path, token, body) {
  const res = await fetch(`${BASE}${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let fail = false;
for (const m of ONLY) {
  const step = PLAN[m]; if (!step) continue;
  const u = USERS[step.user]; const token = tok(u); const notes = []; let ok = true;
  const genBody = { methodology: m, selectedLevel: u.level }; if (step.equipmentLevel) genBody.equipmentLevel = step.equipmentLevel;
  const gen = await api('POST', `/api/routine-generation/specialist/${m}/generate`, token, genBody);
  const planId = gen.json?.planId || gen.json?.plan?.planId;
  if (gen.status !== 200 || !planId) { ok = false; notes.push(`generate ${gen.status} ${JSON.stringify(gen.json).slice(0,140)}`); }
  else notes.push(`gen#${planId}`);
  await sleep(400);
  if (planId) {
    const conf = await api('POST', '/api/routines/confirm-plan', token, { methodology_plan_id: planId, startConfig: { startDate: 'today' } });
    if (conf.status !== 200 || conf.json?.success === false) { ok = false; notes.push(`confirm ${conf.status}`); } else notes.push('confirmed');
    await sleep(400);
    const todayISO = new Date().toISOString().slice(0, 10);
    const today = await api('GET', `/api/routines/sessions/today-status?methodology_plan_id=${planId}&week_number=1&day_name=lunes&session_date=${todayISO}`, token);
    if (today.status === 200 || today.status === 404) notes.push(`today.${today.status}`); else { ok = false; notes.push(`today ${today.status}`); }
    await sleep(400);
  }
  if (step.autoreg) {
    const ar = await api('POST', `/api/methodology-session/${step.autoreg.path}`, token, step.autoreg.body);
    const d = ar.json?.decision;
    if (ar.status !== 200 || !d) { ok = false; notes.push(`autoreg ${ar.status} ${JSON.stringify(ar.json).slice(0,140)}`); } else notes.push(`autoreg.decision=${d}`);
  } else notes.push('autoreg=n/a');
  if (!ok) fail = true;
  console.log(`${ok ? '✅' : '❌'} ${m.padEnd(13)} ${notes.join(' | ')}`);
  await sleep(600);
}
console.log(fail ? '\n❌ FALLOS' : '\n✅ OK');
process.exit(fail ? 1 : 0);
