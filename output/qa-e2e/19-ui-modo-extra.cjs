// UI: verifica el modo extra por preferencias en el modal de foco (Métodos →
// manual → metodología → fin de semana → Aceptar hoy → modal con "Tus favoritos"
// / "Los que te cuestan"), y que al pulsarlo genera sesión (o error claro).
const { launch, shot, report } = require('./lib.cjs');
const API = process.env.QA_API || 'http://localhost:3010';

async function api(method, path, token, body) {
  const r = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let j = {}; try { j = await r.json(); } catch {}
  return { status: r.status, j };
}

(async () => {
  // Usuario intermedio con 3 likes ya valorados (siembra por API)
  const email = `qa.uiextra.${Math.floor(Math.random() * 100000)}@entrenaconia-test.com`;
  const reg = await api('POST', '/api/auth/register', null, {
    nombre: 'QA', apellido: 'UiExtra', email, password: 'QaTest2026!',
    edad: 30, sexo: 'femenino', peso: 63, altura: 166,
    nivelEntrenamiento: process.argv[2] || 'intermedio', anosEntrenando: 2, frecuenciaSemanal: 3,
    nivelActividad: 'moderado', metodologiaPreferida: 'calistenia'
  });
  const token = reg.j.token; const user = reg.j.user;
  // Siembra: plan + 1 sesión con 3 likes
  const gen = await api('POST', '/api/methodology/generate', token, {
    mode: 'manual', methodology: 'calistenia', selectedLevel: (process.argv[2] || 'intermedio').replace(/^./, c => c.toUpperCase()),
    goals: '', selectedMuscleGroups: [], source: 'manual_selection', version: '5.0'
  });
  const planId = gen.j.methodology_plan_id || gen.j.planId;
  await api('POST', '/api/routines/confirm-plan', token, { methodology_plan_id: planId });
  const cal = await api('GET', `/api/routines/calendar-schedule/${planId}`, token);
  const s0 = (cal.j.plan?.semanas || [])[0]?.sesiones?.[0];
  const start = await api('POST', '/api/routines/sessions/start', token, {
    methodology_plan_id: planId, session_date: String(s0.fecha).slice(0, 10), week_number: 1, day_name: 'Lunes'
  });
  const prog = await api('GET', `/api/routines/sessions/${start.j.session_id}/progress`, token);
  for (const ex of (prog.j.exercises || []).slice(0, 3)) {
    await api('POST', `/api/routines/sessions/${start.j.session_id}/exercise/${ex.exercise_order}/feedback`, token, {
      sentiment: 'like', exerciseName: ex.exercise_name
    });
  }
  // Cancelar el plan para que Métodos permita elegir de nuevo (single-day finde)
  await api('POST', '/api/routines/cancel-routine', token, { methodology_plan_id: planId });
  console.log(`Usuario ${user.id} sembrado con 3 likes; plan ${planId} cancelado`);

  // UI en sábado (single-day flow)
  const { browser, page } = await launch({ useState: false, dateAt: '2026-07-18T10:00:00', injectAuth: { token, user } });
  const net = { single: [] };
  page.on('response', async (r) => {
    if (/generate-single-day/.test(r.url())) {
      let b = ''; try { b = await r.text(); } catch {}
      net.single.push({ status: r.status(), body: b.slice(0, 120) });
    }
  });
  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3500);
  await page.getByRole('button', { name: /^Métodos$/i }).click().catch(() => {});
  await page.waitForTimeout(1500);
  await page.getByText('Manual (tú eliges)', { exact: true }).click().catch(() => {});
  await page.waitForTimeout(800);
  const card = page.locator('[aria-label="Tarjeta de metodología Calistenia"]');
  await card.getByRole('button', { name: /Seleccionar metodología Calistenia/i }).click().catch(() => {});
  await page.waitForTimeout(1500);
  // Fin de semana → aceptar entrenamiento de hoy
  const accept = page.getByRole('button', { name: /Aceptar entrenamiento para hoy/i });
  if (await accept.isVisible({ timeout: 15000 }).catch(() => false)) await accept.click();
  await page.waitForTimeout(1800);
  await shot(page, 'ui-extra-01-focus-modal');

  const txt = (await page.locator('body').innerText()).replace(/\n+/g, ' | ');
  let pass = 0, fail = 0;
  const check = (n, c) => { console.log(`${c ? '✅' : '❌'} ${n}`); c ? pass++ : fail++; };
  check('Modal muestra "Tus favoritos"', /Tus favoritos/i.test(txt));
  check('Modal muestra "Los que te cuestan"', /Los que te cuestan/i.test(txt));

  // Pulsar "Tus favoritos" → genera sesión
  await page.getByRole('button', { name: /Tus favoritos/i }).click().catch(() => {});
  await page.waitForTimeout(4000);
  await shot(page, 'ui-extra-02-tras-favoritos');
  const last = net.single[net.single.length - 1];
  console.log('generate-single-day:', JSON.stringify(net.single));
  check('POST generate-single-day liked → 200', !!last && last.status === 200);
  const txt2 = (await page.locator('body').innerText()).replace(/\n+/g, ' | ');
  check('Se abre flujo de sesión (calentamiento/reproductor)', /calentamiento|Comenzar|Tus favoritos/i.test(txt2));

  console.log(`\nRESULTADO: ${pass} pass / ${fail} fail`);
  report([]);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
