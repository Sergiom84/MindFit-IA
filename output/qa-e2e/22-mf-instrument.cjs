// Instrumenta el flujo de series de MindFeed para ver por qué tras el 1er save-set
// los siguientes no disparan la petición. Captura consola + red + localStorage.
const path = require('path');
const { launch, shot, saveState, BASE } = require('./lib.cjs');
const { registerMobileUser } = require('./ui-user-helpers.cjs');
require(path.join(__dirname, '../../backend/node_modules/dotenv')).config({ path: path.join(__dirname, '../../backend/.env') });
const jwt = require(path.join(__dirname, '../../backend/node_modules/jsonwebtoken'));
const API = 'http://localhost:3010';
const mint = (t) => { const p = jwt.decode(t) || {}; return jwt.sign({ userId: p.userId, email: p.email }, process.env.JWT_SECRET, { expiresIn: '365d' }); };
const short = async (p) => (await p.locator('body').innerText()).replace(/\n+/g, ' | ');
const clickIf = async (p, rx, w = 0) => { const b = p.getByRole('button', { name: rx }); if (await b.count() && await b.first().isEnabled().catch(() => false)) { await b.first().click({ force: true }).catch(() => {}); if (w) await p.waitForTimeout(w); return true; } return false; };

async function lsState(page) {
  return await page.evaluate(() => ({
    token: (localStorage.getItem('authToken') || localStorage.getItem('token') || '').slice(-10),
    user: (() => { try { return JSON.parse(localStorage.getItem('user'))?.id ?? JSON.parse(localStorage.getItem('userProfile'))?.id ?? null; } catch { return null; } })()
  }));
}

// Un set: Entendido → Off → Comenzar → Avanzar → (modal RIR) reps+RIR2+Guardar Serie.
async function doOneSet(page, n) {
  await clickIf(page, /^Entendido$/i, 400);
  // arrancar
  if (await page.getByRole('button', { name: /^Comenzar$/i }).count()) {
    await clickIf(page, /^Off$/i, 200);
    await clickIf(page, /^Comenzar$/i, 400);
  }
  await clickIf(page, /^Avanzar$/i, 600);
  // modal RIR
  const save = page.getByRole('button', { name: /Guardar Serie/i });
  if (await save.count()) {
    const reps = page.locator('input[placeholder="10"]:visible').first();
    if (await reps.count()) await reps.fill('10').catch(() => {});
    const nums = page.locator('input[type="number"]:visible'); const nn = await nums.count();
    for (let i = 0; i < nn; i++) { const v = await nums.nth(i).inputValue().catch(() => 'x'); if (!v) await nums.nth(i).fill('20').catch(() => {}); }
    await clickIf(page, /^2$/, 200);
    console.log(`  SET ${n}: click Guardar Serie (ls=${JSON.stringify(await lsState(page))})`);
    await save.first().click({ force: true }).catch(() => {});
    await page.getByRole('button', { name: /Guardar Serie/i }).first().waitFor({ state: 'hidden', timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(2000);
    return true;
  }
  console.log(`  SET ${n}: NO había modal RIR (btns=${JSON.stringify((await page.getByRole('button').allTextContents()).filter(Boolean).slice(5, 14))})`);
  return false;
}

(async () => {
  // Registro por API (la UI de registro está flaky hoy) + inyección de auth completa.
  const email = `qa.mf.instr.${Date.now()}@test.entrenaconia.local`;
  const reg = await fetch(`${API}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre: 'QA', apellido: 'Instr', email, password: 'QaTest2026!', edad: 29, sexo: 'femenino', peso: 64, altura: 167, nivelEntrenamiento: 'principiante', anosEntrenando: 1, frecuenciaSemanal: 4, nivelActividad: 'moderado', metodologiaPreferida: 'bodybuilding' }) }).then(x => x.json());
  const token = reg.token; const user = reg.user;
  const longToken = mint(token);
  const gen = await fetch(`${API}/api/methodology/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ mode: 'manual', methodology: 'hipertrofiav2', selectedLevel: 'principiante', nivel: 'principiante', goals: '', selectedMuscleGroups: [], source: 'manual_selection', version: '5.0' }) }).then(x => x.json());
  const pid = gen.methodology_plan_id || gen.planId;
  await fetch(`${API}/api/routines/confirm-plan`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ methodology_plan_id: pid }) });
  const cal = await fetch(`${API}/api/routines/calendar-schedule/${pid}`, { headers: { Authorization: 'Bearer ' + token } }).then(x => x.json());
  const first = (cal.plan?.semanas || []).flatMap(w => (w.sesiones || []).map(s => ({ d: String(s.fecha).slice(0, 10) }))).sort((a, b) => a.d.localeCompare(b.d))[0];
  console.log('PLAN', pid, 'user', user.id, 'primera', first.d);

  const { browser, page } = await launch({ dateAt: `${first.d}T08:00:00`, speed: true, useState: false, injectAuth: { token: longToken, user } });
  const saveSetPosts = [];
  page.on('console', m => { const t = m.text(); if (/Serie guardada|Error guardando|Faltan datos|tracking|save-set|Payload|❌|✅ Serie|Token inv/i.test(t)) console.log('  [CONSOLE]', t.replace(/\n/g, ' ').slice(0, 200)); });
  page.on('pageerror', e => console.log('  [PAGEERROR]', String(e).slice(0, 200)));
  page.on('request', r => { if (/save-set/.test(r.url())) saveSetPosts.push(r.method()); });
  page.on('response', async r => { if (/save-set/.test(r.url())) console.log(`  [NET save-set] ${r.status()}`); });

  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);
  await page.getByText('Rutinas', { exact: true }).last().click().catch(() => {});
  await page.waitForTimeout(3000);
  console.log('LS inicial:', JSON.stringify(await lsState(page)));
  await clickIf(page, /Iniciar Entrenamiento/i, 4000);
  await clickIf(page, /Saltar calentamiento/i, 2500);

  for (let n = 1; n <= 5; n++) {
    if (/Sesión completada|Entrenamiento completado|¡Enhorabuena|Resumen/i.test(await short(page))) { console.log('SESIÓN COMPLETADA en set', n); break; }
    await doOneSet(page, n);
  }
  console.log('TOTAL POSTs a /save-set:', saveSetPosts.length);
  await shot(page, '22-mf-instrument-final');
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
