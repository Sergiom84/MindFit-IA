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
  page.on('console', m => { if (m.type() === 'error') console.log('  [console.error]', m.text().replace(/\n/g, ' ').slice(0, 220)); });
  page.on('pageerror', e => console.log('  [pageerror]', String(e).replace(/\n/g, ' ').slice(0, 220)));
  page.on('response', async r => {
    if (r.status() >= 400) {
      let body = ''; try { body = (await r.text()).slice(0, 200); } catch {}
      console.log(`  [NET ${r.status()}] ${r.url().replace(/^.*\/api/, '/api').slice(0, 80)} → ${body.replace(/\n/g, ' ')}`);
    }
  });
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);
  await page.getByText('Rutinas', { exact: true }).last().click().catch(() => {});
  await page.waitForTimeout(3500);

  console.log('\n>>> CLICK Iniciar Entrenamiento');
  await page.getByRole('button', { name: /Iniciar Entrenamiento/i }).first().click({ force: true }).catch(() => {});
  await page.waitForTimeout(3000);
  console.log('>>> CLICK Saltar calentamiento');
  await page.getByRole('button', { name: /Saltar calentamiento/i }).first().click({ force: true }).catch(() => {});
  await page.waitForTimeout(2500);
  // ¿Qué elemento cubre el botón "Comenzar"?
  const cover = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(b => /Comenzar/.test(b.textContent) && !/Entrenamiento|Principal/.test(b.textContent));
    if (!btn) return { found: false };
    const r = btn.getBoundingClientRect();
    const cx = Math.round(r.x + r.width / 2), cy = Math.round(r.y + r.height / 2);
    const top = document.elementFromPoint(cx, cy);
    const chain = []; let el = top;
    for (let i = 0; i < 6 && el; i++) { chain.push(`${el.tagName}.${(el.className && el.className.toString ? el.className.toString().slice(0, 40) : '')}`); el = el.parentElement; }
    const cs = window.getComputedStyle(btn);
    return { found: true, rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }, cx, cy, btnIsTop: top === btn || btn.contains(top), topChain: chain, pointerEvents: cs.pointerEvents, vw: window.innerWidth, vh: window.innerHeight };
  });
  console.log('COVER:', JSON.stringify(cover, null, 0));
  console.log('>>> CLICK Comenzar (force)');
  await page.getByRole('button', { name: /Comenzar/i }).last().click({ force: true }).catch(() => {});
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(2500);
    const bs = await btns(page);
    const tx = await short(page);
    const err = /Error cargando datos: ([^|]+)/.exec(tx);
    console.log(`[${i * 2.5}s] reg=${bs.some(x => /Registrar Serie/i.test(x))} pausar=${bs.some(x => /Pausar/i.test(x))} ${err ? 'ERROR=' + err[1].trim() : ''} btns=${JSON.stringify(bs.slice(5, 12))}`);
    if (err) { console.log('   BODY:', tx.slice(0, 700)); break; }
  }
  await shot(page, '21-mf-secuencia');
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
