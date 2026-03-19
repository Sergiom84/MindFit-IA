import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const email = process.env.ECIA_EMAIL;
const password = process.env.ECIA_PASSWORD;
const baseUrl = 'http://localhost:5173';
const apiUrl = 'http://127.0.0.1:3010';
const outDir = path.join(process.cwd(), 'test-results', 'manual-qa-macros-perfil-fase');
await fs.mkdir(outDir, { recursive: true });

const report = {
  startedAt: new Date().toISOString(),
  baseUrl,
  apiUrl,
  checks: [],
  screenshots: [],
  api: {},
  console: [],
  pageErrors: []
};

function addCheck(name, ok, details = {}) {
  report.checks.push({ name, ok, ...details });
  console.log(`${ok ? '✅' : '❌'} ${name}${details.summary ? ` - ${details.summary}` : ''}`);
}

async function saveScreenshot(page, name) {
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  report.screenshots.push(file);
  console.log(`📸 ${file}`);
}

async function apiFetch(token, method, route, body) {
  const response = await fetch(`${apiUrl}${route}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }

  return {
    status: response.status,
    ok: response.ok,
    body: json
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sameTemplate(a, b) {
  return Boolean(a && b) &&
    Number(a.protein_pct) === Number(b.protein_pct) &&
    Number(a.carbs_pct) === Number(b.carbs_pct) &&
    Number(a.fat_pct) === Number(b.fat_pct);
}

const questionnaireAnswers = [
  ['Somnolencia o bajada de energía tras comidas altas en carbohidratos', /^Sí/],
  ['Energía estable tras comidas con carbohidratos (sin somnolencia)', /^No \(0\)$/],
  ['Despertarse por la noche con hambre tras cena con carbohidratos simples', /^Sí/],
  ['Duerme mejor si consume fruta o carbohidratos antes de dormir', /^No \(0\)$/],
  ['Preferencia marcada por alimentos grasos y salados frente a dulces', /^Sí/],
  ['Preferencia marcada por alimentos dulces frente a salados', /^No \(0\)$/],
  ['Acumulación de grasa abdominal con facilidad (patrón central)', /^Sí/],
  ['Puede estar varias horas sin comer sin síntomas negativos', /^No \(0\)$/],
  ['Cansancio matutino frecuente o sensación de sueño prolongado', /^Sí/],
  ['Responde bien a hidratos (no acumula grasa con facilidad en fases previas)', /^No \(0\)$/]
];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 2200 } });
const page = await context.newPage();
page.on('console', (msg) => {
  report.console.push({ type: msg.type(), text: msg.text() });
});
page.on('pageerror', (error) => {
  report.pageErrors.push({ message: error.message, stack: error.stack });
});

let token = null;

try {
  console.log('➡️ Login');
  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.locator('input[name="email"]').waitFor({ state: 'visible', timeout: 15000 });
  await saveScreenshot(page, '01-login');

  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);

  await Promise.all([
    page.waitForFunction(() => Boolean(localStorage.getItem('authToken') || localStorage.getItem('token')), { timeout: 20000 }),
    page.locator('form button[type="submit"]').click()
  ]);
  await page.waitForTimeout(1500);
  token = await page.evaluate(() => localStorage.getItem('authToken') || localStorage.getItem('token'));
  assert(token, 'No se obtuvo token tras el login');
  addCheck('Login autenticado', true, { summary: `URL final: ${page.url()}` });

  console.log('➡️ Abrir pantalla de nutrición');
  await page.goto(`${baseUrl}/nutrition`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.getByRole('heading', { name: /Nutrición Deportiva/i }).waitFor({ timeout: 30000 });
  await page.getByRole('heading', { name: /Generar Plan Nutricional/i }).waitFor({ timeout: 30000 });
  await saveScreenshot(page, '02-nutrition-initial');
  addCheck('Pantalla de nutrición cargada', true);

  const currentBefore = await apiFetch(token, 'GET', '/api/metabolic-profile/current');
  const distributions = await apiFetch(token, 'GET', '/api/metabolic-profile/distributions');
  report.api.metabolic_current_before = currentBefore.body;
  report.api.distributions = distributions.body;
  assert(distributions.ok, 'GET /api/metabolic-profile/distributions no respondió OK');
  assert(distributions.body?.ruleset === 'mindfeed_macro_phase_v2', 'Ruleset inesperado en /distributions');
  assert(distributions.body?.phase_table?.intolerante?.bulk?.fat_pct === 40, 'Tabla bulk intolerante incorrecta');
  addCheck('Distribuciones canónicas disponibles', true, { summary: distributions.body.ruleset });

  console.log('➡️ Guardar configuración nutricional en fase bulk');
  await page.getByRole('button', { name: /^Volumen/i }).click();
  await page.getByRole('button', { name: /Guardar configuracion/i }).scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: /Guardar configuracion/i }).click();
  await page.getByText(/Perfil nutricional guardado correctamente/i).waitFor({ timeout: 30000 });
  await saveScreenshot(page, '03-profile-saved');
  addCheck('Configuración nutricional guardada', true, { summary: 'Objetivo bulk persistido' });

  console.log('➡️ Cuestionario metabólico');
  await page.getByRole('button', { name: /Preciso \(con cuestionario\)/i }).click();
  await page.getByText(/Cuestionario metabolico/i).waitFor({ timeout: 15000 });

  for (const [label, buttonName] of questionnaireAnswers) {
    const questionText = page.getByText(label, { exact: true });
    await questionText.scrollIntoViewIfNeeded();
    const questionCard = questionText.locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]');
    await questionCard.getByRole('button', { name: buttonName }).click();
  }

  await page.getByText(/Hambre\/rendimiento bajo en definición/i).click();
  await page.getByRole('button', { name: /ICG amarillo\/rojo/i }).click();

  let lastCurrent = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    console.log(`➡️ Evaluación metabólica intento ${attempt}`);
    const evalResponsePromise = page.waitForResponse(
      (response) => response.url().includes('/api/metabolic-profile/evaluate') && response.request().method() === 'POST',
      { timeout: 30000 }
    );
    await page.getByRole('button', { name: /Calcular perfil metabólico/i }).scrollIntoViewIfNeeded();
    await page.getByRole('button', { name: /Calcular perfil metabólico/i }).click();
    const evalResponse = await evalResponsePromise;
    assert(evalResponse.ok(), `POST /api/metabolic-profile/evaluate falló en intento ${attempt}`);
    await page.getByText(/Perfil aplicado:/i).waitFor({ timeout: 30000 });
    await page.waitForTimeout(1000);
    await saveScreenshot(page, `04-metabolic-attempt-${attempt}`);
    lastCurrent = await apiFetch(token, 'GET', '/api/metabolic-profile/current');
    report.api[`metabolic_current_after_attempt_${attempt}`] = lastCurrent.body;
    assert(lastCurrent.ok, `GET /api/metabolic-profile/current falló tras intento ${attempt}`);
  }

  const appliedProfile = lastCurrent?.body?.profile?.metabolicProfile;
  assert(appliedProfile, 'No se obtuvo perfil metabólico aplicado tras evaluar');
  const pendingChange = lastCurrent.body?.reEvaluation?.pendingChange || null;
  addCheck('Cuestionario metabólico persistido', true, {
    summary: `Perfil aplicado: ${appliedProfile}${pendingChange ? ` | pendiente: ${pendingChange}` : ''}`
  });

  console.log('➡️ Generar plan nutricional');
  await page.getByRole('button', { name: /Generar plan nutricional/i }).scrollIntoViewIfNeeded();
  const planResponsePromise = page.waitForResponse(
    (response) => response.url().includes('/api/nutrition-v2/generate-plan') && response.request().method() === 'POST',
    { timeout: 45000 }
  );
  await page.getByRole('button', { name: /Generar plan nutricional/i }).click();
  const lowMealConfirm = page.getByRole('button', { name: /Entendido y generar plan/i });
  if (await lowMealConfirm.isVisible({ timeout: 2500 }).catch(() => false)) {
    await lowMealConfirm.click();
  }
  const planResponse = await planResponsePromise;
  assert(planResponse.ok(), 'POST /api/nutrition-v2/generate-plan devolvió error');
  await page.getByRole('heading', { name: /Plan Nutricional Activo/i }).waitFor({ timeout: 45000 });
  await page.waitForTimeout(1500);
  await saveScreenshot(page, '05-calendar-active-plan');
  addCheck('Plan generado y plan activo visible', true);

  const activePlan = await apiFetch(token, 'GET', '/api/nutrition-v2/active-plan');
  report.api.active_plan = activePlan.body;
  assert(activePlan.ok, 'GET /api/nutrition-v2/active-plan no respondió OK');
  const macroAudit = activePlan.body?.calculation_audit?.macros || activePlan.body?.macros_objetivo;
  assert(macroAudit, 'El plan activo no expone macros auditables');
  const expectedTemplate = distributions.body.phase_table?.[macroAudit.applied_profile]?.[macroAudit.applied_phase];
  assert(expectedTemplate, 'No se encontró plantilla esperada en distributions');
  assert(sameTemplate(macroAudit.template_pct, expectedTemplate), 'template_pct del plan activo no coincide con la tabla canónica');
  assert(macroAudit.ruleset === 'mindfeed_macro_phase_v2', 'Ruleset incorrecto en calculation_audit.macros');
  addCheck('Plan activo alineado con tabla perfil+fase', true, {
    summary: `${macroAudit.applied_profile} + ${macroAudit.applied_phase}`
  });

  const planHeaderCard = page.getByRole('heading', { name: /Plan Nutricional Activo/i }).locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]');
  const planHeaderText = await planHeaderCard.textContent();
  assert(planHeaderText.includes(`${activePlan.body.kcal_objetivo} kcal`), 'La UI no muestra las kcal del plan activo');
  assert(planHeaderText.includes(`${activePlan.body.macros_objetivo.protein_g}g`), 'La UI no muestra la proteína del plan activo');
  assert(planHeaderText.includes(`${activePlan.body.macros_objetivo.carbs_g}g`), 'La UI no muestra los carbos del plan activo');
  assert(planHeaderText.includes(`${activePlan.body.macros_objetivo.fat_g}g`), 'La UI no muestra las grasas del plan activo');
  addCheck('Paridad UI/API en resumen de macros', true, {
    summary: `P ${activePlan.body.macros_objetivo.protein_g} · C ${activePlan.body.macros_objetivo.carbs_g} · G ${activePlan.body.macros_objetivo.fat_g}`
  });

  const weekLabel = await page.getByText(/Semana \d+ de \d+/).first().textContent();
  addCheck('Vista calendario cargada', true, { summary: weekLabel?.trim() || 'Semana visible' });

  console.log('➡️ Probar bridge override');
  const bridgeOverride = await apiFetch(token, 'POST', '/api/bridge/training-summary', {
    methodology: 'hipertrofia',
    calendar: [],
    weekly_cls: 50,
    performance: 'mantiene',
    flags: {},
    session_data: null,
    override_kcal: 2500,
    objective_phase: 'bulk'
  });
  report.api.bridge_override = bridgeOverride.body;
  assert(bridgeOverride.ok, 'POST /api/bridge/training-summary con override falló');
  assert(bridgeOverride.body?.nutrition?.kcal_objetivo === 2500, 'El bridge no respetó override_kcal');
  const bridgeMacros = bridgeOverride.body?.nutrition?.macros_base;
  assert(bridgeMacros?.applied_profile, 'El bridge override no devolvió macros_base canónico');
  const expectedBridgeTemplate = distributions.body.phase_table?.[bridgeMacros.applied_profile]?.[bridgeMacros.applied_phase];
  assert(sameTemplate(bridgeMacros.template_pct, expectedBridgeTemplate), 'El bridge override no usa la plantilla canónica esperada');
  addCheck('Bridge override preserva perfil y fase canónicos', true, {
    summary: `${bridgeMacros.applied_profile} + ${bridgeMacros.applied_phase} @ 2500 kcal`
  });

  await page.getByRole('button', { name: /Generar Plan/i }).click();
  await page.getByRole('heading', { name: /Generar Plan Nutricional/i }).waitFor({ timeout: 15000 });
  await saveScreenshot(page, '06-return-generate-plan');
  addCheck('Navegación entre tabs estable', true);

  report.finishedAt = new Date().toISOString();
  report.success = true;
} catch (error) {
  report.finishedAt = new Date().toISOString();
  report.success = false;
  report.failure = {
    message: error.message,
    stack: error.stack
  };
  addCheck('QA manual Playwright', false, { summary: error.message });
  try {
    await saveScreenshot(page, '99-failure-state');
  } catch {}
  console.error(error);
  process.exitCode = 1;
} finally {
  await fs.writeFile(path.join(outDir, 'qa-report.json'), JSON.stringify(report, null, 2));
  await browser.close();
  console.log(`📝 Reporte guardado en ${path.join(outDir, 'qa-report.json')}`);
}
