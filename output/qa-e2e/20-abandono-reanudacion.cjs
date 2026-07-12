// Punto 3: casos reales de abandono / reanudación / cancelación / cambio de metodología.
// Plan generado por API (evita el bloqueo de la key OpenAI en la generación por UI);
// toda la interacción de sesión es por UI, "engañando" la fecha por día.
const { launch, shot, saveState, report, BASE } = require('./lib.cjs');
const { registerMobileUser } = require('./ui-user-helpers.cjs');

const MONDAY = process.argv[2] || '2026-07-13';
const API = 'http://localhost:3010';

const short = async (page) => (await page.locator('body').innerText()).replace(/\n+/g, ' | ');
const btns = async (page) => (await page.getByRole('button').allTextContents()).filter(Boolean);

async function clickIf(page, rx, { wait = 0 } = {}) {
  const b = page.getByRole('button', { name: rx });
  if (await b.count()) {
    const el = b.first();
    if (await el.isEnabled().catch(() => false)) {
      const t = (await el.textContent() || '').trim();
      await el.click({ force: true, timeout: 8000 }).catch(() => {});
      if (wait) await page.waitForTimeout(wait);
      return t;
    }
  }
  return null;
}

async function apiJson(method, p, token, body) {
  const r = await fetch(API + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let j = {}; try { j = await r.json(); } catch {}
  return { status: r.status, j };
}

async function gotoRutinas(page) {
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);
  await page.getByText('Rutinas', { exact: true }).last().click().catch(() => {});
  await page.waitForTimeout(3000);
}

// Entra a la sesión de hoy y registra UNA sola serie del primer ejercicio, luego para.
async function startAndPartial(page) {
  for (let step = 0; step < 40; step++) {
    await page.waitForTimeout(700);
    const txt = await short(page);
    if (/Registrar Serie/i.test(txt)) {
      const reps = page.locator('input[placeholder="10"]:visible, input[type="number"]:visible').first();
      if (await reps.count()) await reps.fill('10').catch(() => {});
      const rir2 = page.getByRole('button', { name: /^2$/ });
      if (await rir2.count()) await rir2.first().click({ force: true }).catch(() => {});
      await page.waitForTimeout(250);
      await clickIf(page, /Guardar Serie/i, { wait: 1200 });
      return 'SERIE_GUARDADA';
    }
    if (/Cargando|Preparando/i.test(txt)) { await page.waitForTimeout(2000); continue; }
    const clicked = await clickIf(page, /Iniciar Entrenamiento|Iniciar sesión de hoy|Comenzar Entrenamiento Principal|Saltar calentamiento|^Comenzar$|^Siguiente$|^Iniciar$/i);
    if (!clicked && /Descanso|0:\d\d/.test(txt)) { await page.waitForTimeout(2500); continue; }
  }
  return 'NO_LLEGO_A_SERIE';
}

(async () => {
  const findings = [];
  const reg = await registerMobileUser({ slug: 'abandono', preferredMethodology: 'calistenia', focus: 'mixto', speed: true });
  const token = await reg.page.evaluate(() => localStorage.getItem('authToken') || localStorage.getItem('token'));
  await saveState(reg.context);
  await reg.browser.close();
  console.log('REGISTRADO', reg.email);

  // Plan por API
  const gen = await apiJson('POST', '/api/methodology/generate', token, { mode: 'manual', methodology: 'calistenia', selectedLevel: 'principiante', nivel: 'principiante', goals: '', selectedMuscleGroups: [], source: 'manual_selection', version: '5.0' });
  const planId = gen.j.methodology_plan_id || gen.j.planId;
  await apiJson('POST', '/api/routines/confirm-plan', token, { methodology_plan_id: planId });
  const cal = await apiJson('GET', `/api/routines/calendar-schedule/${planId}`, token);
  const sessions = (cal.j.plan?.semanas || []).flatMap(w => (w.sesiones || []).map(s => ({ date: String(s.fecha).slice(0, 10), week: w.semana, day: s.dia }))).filter(s => s.date && s.date !== 'undefined').sort((a, b) => a.date.localeCompare(b.date));
  console.log('PLAN', planId, 'sesiones', sessions.length);
  const d1 = sessions[0]?.date || MONDAY;
  const d2 = sessions[1]?.date;

  // ===== ESCENARIO A: abandono parcial (día 1) + reanudación (día 2) =====
  console.log('\n===== A) ABANDONO PARCIAL + REANUDACIÓN =====');
  {
    const { browser, context, page } = await launch({ dateAt: `${d1}T08:00:00`, speed: true, useState: true });
    await gotoRutinas(page);
    const r = await startAndPartial(page);
    await shot(page, '20-A-parcial-guardada');
    console.log('DÍA1 parcial:', r, '| btns:', JSON.stringify((await btns(page)).slice(0, 12)));
    await saveState(context);
    await browser.close(); // abandono: cierra la app sin finalizar
  }
  // Estado en BD tras abandono
  const stA1 = await apiJson('GET', `/api/routines/progress-data?methodology_plan_id=${planId}`, token);
  const dA1 = stA1.j.data || stA1.j;
  console.log('Tras abandono → sesiones completadas:', dA1.completedSessions ?? dA1.totalSessionsCompleted, '| series:', JSON.stringify((dA1.weeklyProgress || [])[0]));

  // Reanudación al día siguiente
  let resumeVerdict = 'N/A';
  if (d2) {
    const { browser, context, page } = await launch({ dateAt: `${d2}T08:00:00`, speed: true, useState: true });
    await gotoRutinas(page);
    await shot(page, '20-A-dia2-inicial');
    const txt2 = await short(page);
    const hasResume = /Reanudar/i.test(txt2);
    console.log('DÍA2 ofrece Reanudar?', hasResume, '| btns:', JSON.stringify((await btns(page)).slice(0, 12)));
    if (hasResume) {
      await clickIf(page, /Reanudar Entrenamiento|Reanudar/i, { wait: 3000 });
      await shot(page, '20-A-tras-reanudar');
      const after = await short(page);
      // ¿El día 1 abandonado quedó marcado como completado indebidamente?
      const st = await apiJson('GET', `/api/routines/progress-data?methodology_plan_id=${planId}`, token);
      const dd = st.j.data || st.j;
      const w1 = (dd.weeklyProgress || [])[0];
      resumeVerdict = `tras reanudar → semana1 sesiones ${w1?.completed}/${w1?.sessions}; pantalla: ${/Registrar Serie|Comenzar|Ejercicio/i.test(after) ? 'sesión activa' : 'otra'}`;
      console.log('REANUDACIÓN:', resumeVerdict);
    }
    await saveState(context);
    await browser.close();
  }
  findings.push(`A) Abandono+reanudación: día1=${d1}, día2=${d2}, ${resumeVerdict}`);

  // ===== ESCENARIO B: cancelar rutina a mitad de plan =====
  console.log('\n===== B) CANCELAR RUTINA =====');
  {
    const { browser, context, page } = await launch({ dateAt: `${d2 || d1}T09:00:00`, speed: true, useState: true });
    await gotoRutinas(page);
    const cancel = await clickIf(page, /Cancelar rutina|Cancelar plan|Cambiar de plan/i, { wait: 1500 });
    await shot(page, '20-B-modal-cancelar');
    const modalTxt = (await short(page)).slice(0, 500);
    console.log('Botón cancelar:', cancel, '| modal:', modalTxt.slice(0, 250));
    // Confirmar en el modal con el botón EXACTO (no el disparador "Cancelar rutina")
    const confirm = await clickIf(page, /Sí, cancelar rutina/i, { wait: 3000 })
      || await clickIf(page, /Confirmar|Eliminar|Aceptar/i, { wait: 3000 });
    await shot(page, '20-B-tras-cancelar');
    const ap = await apiJson('GET', '/api/routines/active-plan', token);
    const stillActive = !!(ap.j.plan?.methodology_plan_id || ap.j.methodology_plan_id);
    console.log('Confirmar:', confirm, '| ¿plan sigue activo tras cancelar?', stillActive, '| status', ap.status);
    findings.push(`B) Cancelar rutina: botón=${!!cancel}, confirm=${!!confirm}, planActivoDespués=${stillActive}`);
    await saveState(context);
    await browser.close();
  }

  // ===== ESCENARIO C: cambiar de metodología con plan activo =====
  console.log('\n===== C) CAMBIO DE METODOLOGÍA CON PLAN ACTIVO =====');
  {
    // Asegurar un plan activo de nuevo
    const g2 = await apiJson('POST', '/api/methodology/generate', token, { mode: 'manual', methodology: 'calistenia', selectedLevel: 'principiante', nivel: 'principiante', goals: '', selectedMuscleGroups: [], source: 'manual_selection', version: '5.0' });
    const p2 = g2.j.methodology_plan_id || g2.j.planId;
    if (p2) await apiJson('POST', '/api/routines/confirm-plan', token, { methodology_plan_id: p2 });
    const { browser, page } = await launch({ dateAt: `${d2 || d1}T10:00:00`, speed: true, useState: true });
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);
    await page.getByText('Métodos', { exact: true }).last().click().catch(() => {});
    await page.waitForTimeout(2500);
    const manual = page.getByText('Manual (tú eliges)', { exact: true });
    if (await manual.count()) await manual.click();
    await page.waitForTimeout(800);
    // Seleccionar una metodología DISTINTA (Funcional) y llegar hasta GENERAR:
    // el aviso "Plan activo detectado" salta al generar (runWithActivePlanGuard), no al seleccionar.
    const card = page.locator('[aria-label="Tarjeta de metodología Funcional"]');
    if (await card.count()) await card.getByRole('button', { name: /Seleccionar metodología Funcional/i }).click().catch(() => {});
    else await clickIf(page, /Seleccionar/i);
    await page.waitForTimeout(2500);
    await clickIf(page, /Elegir Nivel Manualmente/i, { wait: 1500 });
    const lvlC = page.locator('h4', { hasText: /Principiante/i }).first();
    if (await lvlC.count()) { await lvlC.click(); await page.waitForTimeout(800); }
    await clickIf(page, /Generar Plan Manual|Generar Plan/i, { wait: 3000 });
    await shot(page, '20-C-tras-generar-otra');
    const txt = (await short(page)).slice(0, 900);
    const warns = /Plan activo detectado|Ya tienes un plan activo|se cancelará y quedará|Generar nuevo y cancelar/i.test(txt);
    console.log('¿Avisa de plan activo al generar otra metodología?', warns);
    if (!warns) console.log('PANTALLA:', txt.slice(0, 400));
    findings.push(`C) Cambio de metodología: aviso "Plan activo detectado" al generar=${warns}`);
    await browser.close();
  }

  console.log('\n===== RESUMEN PUNTO 3 =====');
  findings.forEach(f => console.log('  ', f));
})().catch(e => { console.error('FATAL', e.message, e.stack); process.exit(1); });
