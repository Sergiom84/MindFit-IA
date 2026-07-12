// ¿Se persiste warmup_time_seconds si se COMPLETA el calentamiento (sin saltar)?
const path = require('path');
const { launch, shot, saveState, BASE } = require('./lib.cjs');
const { registerMobileUser } = require('./ui-user-helpers.cjs');
require(path.join(__dirname, '../../backend/node_modules/dotenv')).config({ path: path.join(__dirname, '../../backend/.env') });
const jwt = require(path.join(__dirname, '../../backend/node_modules/jsonwebtoken'));
const { Pool } = require(path.join(__dirname, '../../backend/node_modules/pg'));
const API = 'http://localhost:3010';
const mint = (t) => { const p = jwt.decode(t) || {}; return jwt.sign({ userId: p.userId, email: p.email }, process.env.JWT_SECRET, { expiresIn: '365d' }); };
const short = async (p) => (await p.locator('body').innerText()).replace(/\n+/g, ' | ');
const clickIf = async (p, rx, w = 0) => { const b = p.getByRole('button', { name: rx }); if (await b.count() && await b.first().isEnabled().catch(() => false)) { await b.first().click({ force: true }).catch(() => {}); if (w) await p.waitForTimeout(w); return true; } return false; };

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 }); pool.on('error', () => {});
  // NO usar speed: queremos que el cronómetro de calentamiento corra de verdad
  const reg = await registerMobileUser({ slug: 'warmup', preferredMethodology: 'calistenia', focus: 'mixto', speed: false });
  const token = await reg.page.evaluate(() => localStorage.getItem('authToken') || localStorage.getItem('token'));
  const userId = jwt.decode(token).userId;
  await saveState(reg.context); await reg.browser.close();
  const longToken = mint(token);
  const gen = await fetch(`${API}/api/methodology/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ mode: 'manual', methodology: 'calistenia', selectedLevel: 'principiante', nivel: 'principiante', goals: '', selectedMuscleGroups: [], source: 'manual_selection', version: '5.0' }) }).then(x => x.json());
  const pid = gen.methodology_plan_id || gen.planId;
  await fetch(`${API}/api/routines/confirm-plan`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ methodology_plan_id: pid }) });
  console.log('Plan', pid, 'user', userId);

  const { browser, page } = await launch({ dateAt: '2026-07-13T08:00:00', speed: false, useState: true, injectToken: longToken });
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);
  await page.getByText('Rutinas', { exact: true }).last().click().catch(() => {});
  await page.waitForTimeout(3000);
  await clickIf(page, /Iniciar Entrenamiento/i, 4000);
  // Recorrer el calentamiento SIN saltar: Comenzar → dejar correr unos segundos → Siguiente × N → Completar
  await clickIf(page, /^Comenzar$/i, 1000);
  console.log('Calentamiento iniciado, dejando correr el cronómetro ~8s...');
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(1000);
    // avanzar de ejercicio de calentamiento pero sin saltar el modal completo
    await clickIf(page, /^Siguiente$/i, 200);
  }
  // Completar el calentamiento (NO "Saltar")
  const done = await clickIf(page, /Comenzar Entrenamiento Principal|Completar calentamiento|Finalizar calentamiento|Empezar entrenamiento|Ir al entrenamiento/i, 3000);
  console.log('¿Botón de completar calentamiento?', done, '| btns:', JSON.stringify((await page.getByRole('button').allTextContents()).filter(Boolean).slice(0, 14)));
  await shot(page, 'diag-warmup-tras-completar');
  await page.waitForTimeout(2500);

  // Comprobar en BD
  const r = await pool.query(`SELECT id, session_status, warmup_time_seconds FROM app.methodology_exercise_sessions WHERE user_id=$1 AND methodology_plan_id=$2 ORDER BY id DESC LIMIT 3`, [userId, pid]);
  console.log('=== sesiones en BD ===');
  r.rows.forEach(row => console.log(JSON.stringify(row)));
  await pool.end();
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
