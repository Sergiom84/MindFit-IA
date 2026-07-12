// Verifica el aviso "Plan activo detectado" al GENERAR otra metodología con plan activo.
const path = require('path');
const { launch, shot, saveState, BASE } = require('./lib.cjs');
const { registerMobileUser } = require('./ui-user-helpers.cjs');
require(path.join(__dirname, '../../backend/node_modules/dotenv')).config({ path: path.join(__dirname, '../../backend/.env') });
const jwt = require(path.join(__dirname, '../../backend/node_modules/jsonwebtoken'));
const API = 'http://localhost:3010';
const mint = (t) => { const p = jwt.decode(t) || {}; return jwt.sign({ userId: p.userId, email: p.email }, process.env.JWT_SECRET, { expiresIn: '365d' }); };
const short = async (p) => (await p.locator('body').innerText()).replace(/\n+/g, ' | ');
const clickIf = async (p, rx, w = 0) => { const b = p.getByRole('button', { name: rx }); if (await b.count() && await b.first().isEnabled().catch(() => false)) { await b.first().click({ force: true }).catch(() => {}); if (w) await p.waitForTimeout(w); return true; } return false; };

(async () => {
  const reg = await registerMobileUser({ slug: 'cambio-met', preferredMethodology: 'calistenia', focus: 'mixto', speed: true });
  const token = await reg.page.evaluate(() => localStorage.getItem('authToken') || localStorage.getItem('token'));
  await saveState(reg.context); await reg.browser.close();
  const longToken = mint(token);
  // Plan activo por API
  const gen = await fetch(`${API}/api/methodology/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ mode: 'manual', methodology: 'calistenia', selectedLevel: 'principiante', nivel: 'principiante', goals: '', selectedMuscleGroups: [], source: 'manual_selection', version: '5.0' }) }).then(x => x.json());
  const pid = gen.methodology_plan_id || gen.planId;
  await fetch(`${API}/api/routines/confirm-plan`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ methodology_plan_id: pid }) });
  console.log('Plan activo creado:', pid);

  const { browser, page } = await launch({ dateAt: '2026-07-13T10:00:00', speed: true, useState: true, injectToken: longToken });
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);
  await page.getByText('Métodos', { exact: true }).last().click().catch(() => {});
  await page.waitForTimeout(2500);
  const manual = page.getByText('Manual (tú eliges)', { exact: true });
  if (await manual.count()) await manual.click();
  await page.waitForTimeout(800);
  // Seleccionar Funcional (distinta de la activa Calistenia)
  const card = page.locator('[aria-label="Tarjeta de metodología Funcional"]');
  if (await card.count()) await card.getByRole('button', { name: /Seleccionar metodología Funcional/i }).click().catch(() => {});
  else await clickIf(page, /Seleccionar/i);
  await page.waitForTimeout(2500);
  await clickIf(page, /Elegir Nivel Manualmente/i, 1500);
  const lvl = page.locator('h4', { hasText: /Principiante/i }).first();
  if (await lvl.count()) { await lvl.click(); await page.waitForTimeout(800); }
  // AQUÍ es donde debe saltar el aviso: al pulsar Generar
  await clickIf(page, /Generar Plan Manual|Generar Plan/i, 3000);
  await shot(page, 'diag-cambio-tras-generar');
  const txt = await short(page);
  const warn = /Plan activo detectado|Ya tienes un plan activo|se cancelará y quedará|Generar nuevo y cancelar/i.test(txt);
  console.log('¿Aparece aviso "Plan activo detectado" al generar?', warn ? '✅ SÍ' : '❌ NO');
  if (!warn) console.log('PANTALLA:', txt.slice(0, 500));
  else console.log('BOTONES:', JSON.stringify((await page.getByRole('button').allTextContents()).filter(Boolean).slice(0, 12)));
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
