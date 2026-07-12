// Diagnóstico: qué muestra la pestaña Hoy de MindFeed en el día 1 y qué pasa al pulsar.
const path = require('path');
const { launch, shot, saveState, BASE } = require('./lib.cjs');
const { registerMobileUser } = require('./ui-user-helpers.cjs');
require(path.join(__dirname, '../../backend/node_modules/dotenv')).config({ path: path.join(__dirname, '../../backend/.env') });
const jwt = require(path.join(__dirname, '../../backend/node_modules/jsonwebtoken'));
const API = 'http://localhost:3010';
const mint = (t) => { const p = jwt.decode(t) || {}; return jwt.sign({ userId: p.userId, email: p.email }, process.env.JWT_SECRET, { expiresIn: '365d' }); };
const short = async (p) => (await p.locator('body').innerText()).replace(/\n+/g, ' | ');
const btns = async (p) => (await p.getByRole('button').allTextContents()).filter(Boolean);

(async () => {
  const reg = await registerMobileUser({ slug: 'mf-diag', preferredMethodology: 'bodybuilding', focus: 'hipertrofia', speed: true });
  const token = await reg.page.evaluate(() => localStorage.getItem('authToken') || localStorage.getItem('token'));
  await saveState(reg.context); await reg.browser.close();
  const longToken = mint(token);
  const gen = await fetch(`${API}/api/methodology/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ mode: 'manual', methodology: 'hipertrofiav2', selectedLevel: 'principiante', nivel: 'principiante', goals: '', selectedMuscleGroups: [], source: 'manual_selection', version: '5.0' }) }).then(x => x.json());
  const planId = gen.methodology_plan_id || gen.planId;
  await fetch(`${API}/api/routines/confirm-plan`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ methodology_plan_id: planId }) });
  const cal = await fetch(`${API}/api/routines/calendar-schedule/${planId}`, { headers: { Authorization: 'Bearer ' + token } }).then(x => x.json());
  const first = (cal.plan?.semanas || []).flatMap(w => (w.sesiones || []).map(s => ({ d: String(s.fecha).slice(0, 10), dia: s.dia, sem: w.semana }))).filter(s => s.d && s.d !== 'undefined').sort((a, b) => a.d.localeCompare(b.d))[0];
  console.log('PLAN', planId, 'primera sesión', JSON.stringify(first));

  const { browser, page } = await launch({ dateAt: `${first.d}T08:00:00`, speed: true, useState: true, injectToken: longToken });
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);
  await page.getByText('Rutinas', { exact: true }).last().click().catch(() => {});
  await page.waitForTimeout(3500);
  console.log('\n=== HOY (inicial) ===\nBTNS:', JSON.stringify(await btns(page)));
  console.log('TXT:', (await short(page)).slice(0, 900));
  await shot(page, '21-mf-hoy-inicial');

  // Entrar y volcar la secuencia cada 2s durante 24s
  const b = page.getByRole('button', { name: /Iniciar Entrenamiento/i }).first();
  console.log('\n>>> CLICK Iniciar Entrenamiento');
  await b.click({ force: true }).catch(() => {});
  await page.waitForTimeout(3000);
  console.log('>>> CLICK Saltar calentamiento');
  await page.getByRole('button', { name: /Saltar calentamiento/i }).first().click({ force: true }).catch((e) => console.log('  saltar fail', e.message.split('\n')[0]));
  await page.waitForTimeout(2000);
  console.log('>>> CLICK 45s (tiempo por serie)'); await page.getByRole('button', { name: /^45s$/i }).first().click({ force: true }).catch(() => {});
  await page.waitForTimeout(600);
  page.on('console', m => { if (m.type() === 'error') console.log('  [console.error]', m.text().slice(0, 160)); });
  page.on('pageerror', e => console.log('  [pageerror]', String(e).slice(0, 160)));
  console.log('>>> CLICK Comenzar (SIN force)');
  await page.getByRole('button', { name: /Comenzar/i }).last().click({ timeout: 5000 }).then(() => console.log('  click OK')).catch((e) => console.log('  CLICK FAIL:', e.message.split('\n')[0]));
  // Observar 60s: ¿aparece "Registrar Serie" solo (timer) o hay que pausar?
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(3000);
    const bs = await btns(page);
    const hasReg = bs.some(x => /Registrar Serie/i.test(x));
    const hasPause = bs.some(x => /Pausar/i.test(x));
    const timer = ((await short(page)).match(/\d:\d\d|\d\d:\d\d|--:--/g) || []).slice(0, 3);
    console.log(`[${i * 3}s] reg=${hasReg} pausar=${hasPause} timer=${JSON.stringify(timer)} btns=${JSON.stringify(bs.slice(5))}`);
    if (hasReg) {
      console.log('   >>> Registrar Serie visible → abrir');
      await page.getByRole('button', { name: /Registrar Serie/i }).first().click({ force: true }).catch(() => {});
      await page.waitForTimeout(1000);
      console.log('   modal btns:', JSON.stringify((await btns(page)).slice(5)));
      console.log('   inputs:', await page.locator('input:visible').count());
      break;
    }
    if (hasPause && i === 1) { console.log('   >>> pauso'); await page.getByRole('button', { name: /^Pausar$/i }).first().click({ force: true }).catch(() => {}); }
  }
  await shot(page, '21-mf-secuencia');
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
