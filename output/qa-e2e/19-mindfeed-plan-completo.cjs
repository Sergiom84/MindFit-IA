// Plan COMPLETO de HipertrofiaV2 / MindFeed por UI (reproductor propio), fecha desplazada.
// Registra usuario → genera plan manual el lunes → completa TODAS las sesiones
// (un contexto por día) → revisa Progreso e Historial.
//
// Uso: node 19-mindfeed-plan-completo.cjs [YYYY-MM-DD lunes] [nivel]
const { launch, shot, saveState, report, BASE } = require('./lib.cjs');
const { registerMobileUser } = require('./ui-user-helpers.cjs');

const MONDAY = process.argv[2] || '2026-07-13';
const LEVEL = process.argv[3] || 'principiante';
const API = 'http://localhost:3010';

const short = async (page) => (await page.locator('body').innerText()).replace(/\n+/g, ' | ');
const btns = async (page) => (await page.getByRole('button').allTextContents()).filter(Boolean);
const DONE_RX = /Sesión completada|Entrenamiento completado|¡Enhorabuena|Felicidades|Resumen de la sesión|Sesión Finalizada|Registrado hoy|ya has entrenado/i;

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

// Registrar Serie: reps + RIR 2 + Guardar Serie.
async function handleSerie(page) {
  const txt = await short(page);
  if (!/Registrar Serie/i.test(txt)) return null;
  const reps = page.locator('input[placeholder="10"]:visible, input[type="number"]:visible').first();
  if (await reps.count()) await reps.fill('10').catch(() => {});
  const weight = page.locator('input[placeholder*="75"]:visible, input[placeholder*="peso"]:visible').first();
  if (await weight.count()) { const v = await weight.inputValue().catch(() => ''); if (!v) await weight.fill('20').catch(() => {}); }
  const rir2 = page.getByRole('button', { name: /^2$/ });
  if (await rir2.count()) await rir2.first().click({ force: true, timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(250);
  const save = page.getByRole('button', { name: /Guardar Serie/i });
  if (await save.count() && await save.first().isEnabled().catch(() => false)) {
    await save.first().click({ force: true }).catch(() => {});
    return 'serie-guardada';
  }
  return null;
}

async function walkSession(page, tag, maxSteps = 200) {
  let stuck = 0, lastSig = '';
  for (let step = 0; step < maxSteps; step++) {
    await page.waitForTimeout(700);
    const txt = await short(page);
    const sig = txt.slice(0, 300);

    if (/Accede a tu cuenta/i.test(txt)) return 'DESLOGUEADO';
    if (DONE_RX.test(txt)) {
      await shot(page, `${tag}-completada`);
      for (const rx of [/^Continuar$/i, /Cerrar/i, /Aceptar/i, /Volver/i, /Finalizar/i]) if (await clickIf(page, rx, { wait: 800 })) break;
      return 'COMPLETADA';
    }

    const serie = await handleSerie(page);
    if (serie) { console.log(`  [${step}] ${serie}`); stuck = 0; lastSig = sig; continue; }

    const prio = [
      /Saltar calentamiento/i, /Comenzar Entrenamiento Principal/i,
      /Iniciar sesión de hoy/i, /Iniciar entrenamiento/i, /Comenzar entrenamiento/i,
      /Empezar sesión/i, /^Entrenar$/i, /Reanudar Entrenamiento/i,
      /Siguiente ejercicio/i, /^Completar( ejercicio)?$/i, /Serie completada/i,
      /^Continuar$/i, /^Comenzar$/i, /^Siguiente$/i, /^Iniciar$/i, /^Empezar$/i, /^Listo$/i,
      /Saltar descanso/i, /Omitir descanso/i, /^(Fácil|Óptimo|Bien|Normal)$/i, /Guardar valoración/i,
    ];
    let clicked = null;
    for (const rx of prio) { clicked = await clickIf(page, rx); if (clicked) break; }

    if (clicked) { console.log(`  [${step}] click: ${clicked}`); stuck = 0; }
    else {
      // Descanso con timer real: esperar
      if ((await btns(page)).some(b => /Pausar|Descanso/i.test(b)) || /Descanso|0:\d\d/.test(txt)) {
        await page.waitForTimeout(3000); await page.mouse.move(180 + (step % 20), 60).catch(() => {});
        stuck = 0; lastSig = sig; continue;
      }
      if (/Cargando|Preparando|Generando/i.test(txt)) { await page.waitForTimeout(2500); stuck = 0; lastSig = sig; continue; }
      stuck = sig === lastSig ? stuck + 1 : 0;
      if (stuck >= 6) {
        await shot(page, `${tag}-stuck-${step}`);
        console.log(`  [${step}] SIN BOTÓN. btns=`, JSON.stringify((await btns(page)).slice(0, 18)));
        console.log('  TXT:', txt.slice(0, 500));
        return 'ATASCADA';
      }
    }
    lastSig = sig;
  }
  return 'MAX_STEPS';
}

async function fetchCalendar(token, planId) {
  const r = await fetch(`${API}/api/routines/calendar-schedule/${planId}`, { headers: { Authorization: 'Bearer ' + token } });
  const j = await r.json();
  const DAY = { Lun: 'Lunes', Mar: 'Martes', Mie: 'Miercoles', 'Mié': 'Miercoles', Jue: 'Jueves', Vie: 'Viernes', Sab: 'Sabado', 'Sáb': 'Sabado', Dom: 'Domingo' };
  return (j.plan?.semanas || []).flatMap(w => (w.sesiones || []).map(s => ({
    date: String(s.fecha).slice(0, 10), week: w.semana || w.numero, day: DAY[s.dia] || s.dia,
  }))).filter(s => s.date && s.date !== 'undefined');
}

(async () => {
  const results = [];
  const reg = await registerMobileUser({ slug: 'mindfeed-full', preferredMethodology: 'bodybuilding', focus: 'hipertrofia', speed: true });
  const email = reg.email;
  const token = await reg.page.evaluate(() => localStorage.getItem('authToken') || localStorage.getItem('token'));
  await saveState(reg.context);
  await reg.browser.close();
  console.log('REGISTRADO', email, 'token?', !!token);

  let planId = null;
  {
    const { browser, context, page, issues } = await launch({ dateAt: `${MONDAY}T08:00:00`, speed: true, useState: true });
    try {
      await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(3500);
      await page.getByText('Métodos', { exact: true }).last().click();
      await page.waitForTimeout(2500);
      const manual = page.getByText('Manual (tú eliges)', { exact: true });
      if (await manual.count()) await manual.click();
      await page.waitForTimeout(800);
      const card = page.locator('[aria-label="Tarjeta de metodología Hipertrofia"]');
      if (await card.count()) await card.getByRole('button', { name: /Seleccionar metodología Hipertrofia/i }).click();
      else await clickIf(page, /Seleccionar/i);
      await page.waitForTimeout(2500);
      await clickIf(page, /Elegir Nivel Manualmente/i, { wait: 1500 });
      const lvl = LEVEL[0].toUpperCase() + LEVEL.slice(1);
      const levelCard = page.locator('h4', { hasText: new RegExp(lvl, 'i') }).first();
      if (await levelCard.count()) { await levelCard.click(); await page.waitForTimeout(800); }
      await clickIf(page, /Generar Plan Manual|Generar Plan/i);
      for (let i = 0; i < 36; i++) {
        await page.waitForTimeout(4000);
        if (/Plan de Entrenamiento Listo|Plan listo|semanas/i.test(await page.locator('body').innerText())) break;
      }
      await shot(page, '19-mf-plan-listo');
      await clickIf(page, /Comenzar Entrenamiento$/i, { wait: 6000 });
      await shot(page, '19-mf-tras-confirmar');
      const r1 = await walkSession(page, '19-mf-dia1', 220);
      results.push(`${MONDAY} (día1): ${r1}`);
      console.log('DIA1', r1);
      await saveState(context);
    } finally {
      report(issues);
      await browser.close();
    }
  }

  const ap = await fetch(`${API}/api/routines/active-plan`, { headers: { Authorization: 'Bearer ' + token } }).then(x => x.json()).catch(() => ({}));
  planId = ap.plan?.methodology_plan_id || ap.methodology_plan_id || ap.plan?.id || null;
  console.log('PLAN_ID', planId);
  const sessions = planId ? await fetchCalendar(token, planId) : [];
  console.log('SESIONES', sessions.length, JSON.stringify(sessions.slice(0, 6)));
  let rest = sessions.filter(s => s.date > MONDAY).sort((a, b) => a.date.localeCompare(b.date));
  const MAX_DAYS = Number(process.env.MF_MAX_DAYS || 0);
  if (MAX_DAYS > 0) rest = rest.slice(0, MAX_DAYS);

  for (const s of rest) {
    const { browser, context, page, issues } = await launch({ dateAt: `${s.date}T08:00:00`, speed: true, useState: true });
    try {
      await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(3000);
      await page.getByText('Rutinas', { exact: true }).last().click().catch(() => {});
      await page.waitForTimeout(3000);
      const res = await walkSession(page, `19-mf-${s.date}`, 200);
      results.push(`${s.date} (S${s.week}/${s.day}): ${res}`);
      console.log(`DIA ${s.date} → ${res}`);
      await saveState(context);
    } catch (e) {
      results.push(`${s.date}: EXCEPTION ${e.message.slice(0, 80)}`);
    } finally {
      if (issues.length) report(issues);
      await browser.close();
    }
  }

  {
    const lastDate = rest.length ? rest[rest.length - 1].date : MONDAY;
    const { browser, page } = await launch({ dateAt: `${lastDate}T20:00:00`, speed: false, useState: true });
    try {
      await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(3000);
      await page.getByText('Rutinas', { exact: true }).last().click().catch(() => {});
      await page.waitForTimeout(2500);
      for (const tab of ['Progreso', 'Historial', 'Calendario']) {
        const t = page.getByText(tab, { exact: true }).last();
        if (await t.count()) { await t.click().catch(() => {}); await page.waitForTimeout(2500); await shot(page, `19-mf-tab-${tab.toLowerCase()}`); console.log(`\n=== ${tab} ===\n`, (await short(page)).slice(0, 1200)); }
      }
    } finally {
      await browser.close();
    }
  }

  console.log('\n===== RESUMEN MINDFEED PLAN COMPLETO =====');
  results.forEach(r => console.log('  ', r));
  const okCount = results.filter(r => /COMPLETADA/.test(r)).length;
  console.log(`TOTAL: ${okCount}/${results.length} sesiones COMPLETADAS`);
})().catch(e => { console.error('FATAL', e.message, e.stack); process.exit(1); });
