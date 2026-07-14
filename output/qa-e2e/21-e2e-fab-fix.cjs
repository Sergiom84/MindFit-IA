// Regresión del bug reportado por Codex: AudioBubble (burbuja de música
// flotante) tapaba "Guardar Serie" y otros CTA del reproductor de forma
// PERMANENTE e inclickable, porque quedaba fuera del contenedor
// `relative z-10` que envuelve el contenido de cada pantalla (RoutineScreen
// y 7 más) — su z-40/z-50 competía a nivel raíz contra ESE contenedor
// completo (que pinta como bloque a "10"), no contra el z-[60] interno del
// modal. Fix: bajar la burbuja idle a z-[5] (src/components/AudioBubble.jsx).
//
// Este test usa clicks REALES de Playwright SIN `force: true` en el CTA
// crítico: si algo lo tapa visualmente, Playwright falla el "actionability
// check" y el test lo detecta (a diferencia del harness 17, que usa force
// en todos los clicks y por eso no detectó el bug).
const { launch, shot, report } = require('./lib.cjs');
const API = process.env.QA_API || 'http://localhost:3010';

async function api(method, path, token, body) {
  const r = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let j = {}; try { j = await r.json(); } catch {}
  return { status: r.status, j };
}

(async () => {
  const email = `qa.fabfix.${Math.floor(Math.random() * 100000)}@entrenaconia-test.com`;
  const reg = await api('POST', '/api/auth/register', null, {
    nombre: 'QA', apellido: 'FabFix', email, password: 'QaTest2026!',
    edad: 28, sexo: 'femenino', peso: 62, altura: 166,
    nivelEntrenamiento: 'principiante', anosEntrenando: 0, frecuenciaSemanal: 3,
    nivelActividad: 'moderado', metodologiaPreferida: 'calistenia'
  });
  const token = reg.j.token; const user = reg.j.user;
  const gen = await api('POST', '/api/methodology/generate', token, {
    mode: 'manual', methodology: 'calistenia', selectedLevel: 'Principiante',
    goals: '', selectedMuscleGroups: [], source: 'manual_selection', version: '5.0'
  });
  const planId = gen.j.methodology_plan_id || gen.j.planId;
  await api('POST', '/api/routines/confirm-plan', token, { methodology_plan_id: planId });

  const { browser, page } = await launch({ useState: false, injectAuth: { token, user } });
  const netSaveSet = [];
  page.on('response', (r) => { if (/save-set/.test(r.url())) netSaveSet.push(r.status()); });

  await page.goto('http://localhost:5173/routines', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);

  const start = page.getByRole('button', { name: /Iniciar Entrenamiento|Reanudar Entrenamiento/i });
  await start.waitFor({ state: 'visible', timeout: 15000 });
  await start.click(); // click REAL, sin force
  await page.waitForTimeout(1500);

  const skipWarmup = page.getByRole('button', { name: /Saltar calentamiento/i });
  if (await skipWarmup.isVisible({ timeout: 5000 }).catch(() => false)) {
    await skipWarmup.click();
    await page.waitForTimeout(1000);
  }

  // Modo manual (Off) para no esperar el timer de ejercicio
  const off = page.getByRole('button', { name: /^Off$/i });
  await off.waitFor({ state: 'visible', timeout: 10000 });
  await off.click();
  await page.waitForTimeout(300);

  const comenzar = page.getByRole('button', { name: /^Comenzar$/i });
  await comenzar.click();
  await page.waitForTimeout(500);

  const avanzar = page.getByRole('button', { name: /Avanzar/i });
  await avanzar.waitFor({ state: 'visible', timeout: 10000 });
  await avanzar.click(); // pasa a descanso → abre "Registrar Serie"
  await page.waitForTimeout(800);

  await shot(page, 'fabfix-01-tracking-modal-con-burbuja');

  const repsInput = page.getByPlaceholder('10');
  await repsInput.waitFor({ state: 'visible', timeout: 10000 });
  await repsInput.fill('10');
  // Peso: si el ejercicio no se detectó como "peso corporal" (bodyweight),
  // el campo "Peso Utilizado (kg)" es obligatorio y el botón queda
  // deshabilitado (opacity-50) hasta rellenarlo. Cubrir ambos casos.
  const weightInput = page.getByPlaceholder(/^75\.0$|peso corporal/i);
  if (await weightInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    const ph = await weightInput.getAttribute('placeholder');
    if (/^75/.test(ph || '')) await weightInput.fill('20');
  }

  const guardarSerie = page.getByRole('button', { name: /Guardar Serie/i });
  await guardarSerie.waitFor({ state: 'visible', timeout: 10000 });

  let pass = 0, fail = 0;
  const check = (n, c) => { console.log(`${c ? '✅' : '❌'} ${n}`); c ? pass++ : fail++; };

  // El check crítico: Playwright SIN force debe poder clickear. Si algo lo
  // tapa (la burbuja, antes del fix), esto lanza un TimeoutError.
  let clickOk = false;
  try {
    await guardarSerie.click({ timeout: 8000 }); // SIN force: falla si algo lo tapa
    clickOk = true;
  } catch (e) {
    console.log('  click() SIN force falló:', e.message.split('\n')[0]);
  }
  check('Click NORMAL (sin force) en "Guardar Serie" tuvo éxito (nada lo tapa)', clickOk);

  await page.waitForTimeout(1200);
  await shot(page, 'fabfix-02-tras-guardar');

  check(`save-set respondió 200 (${JSON.stringify(netSaveSet)})`, netSaveSet.length > 0 && netSaveSet.every(s => s === 200));

  // Verificar que el modal se cerró (avanzó de serie) tras el guardado real
  const modalStillOpen = await page.getByText('Registrar Serie 1/3', { exact: false }).isVisible().catch(() => false);
  check('El modal de tracking avanzó/cerró tras guardar (no se quedó en Serie 1/3)', !modalStillOpen);

  console.log(`\nRESULTADO: ${pass} pass / ${fail} fail`);
  report([]);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
