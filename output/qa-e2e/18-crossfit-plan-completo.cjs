// Plan COMPLETO de CrossFit por UI (reproductor WOD real), "engañando" la fecha.
// Registra usuario nuevo → genera plan manual el lunes → completa TODAS las sesiones
// (un contexto por día con Date desplazado) → revisa Progreso e Historial.
//
// Uso: node 18-crossfit-plan-completo.cjs [YYYY-MM-DD lunes] [nivel]
const path = require('path');
const { launch, shot, saveState, report, BASE } = require('./lib.cjs');
const { registerMobileUser } = require('./ui-user-helpers.cjs');
require(path.join(__dirname, '../../backend/node_modules/dotenv')).config({ path: path.join(__dirname, '../../backend/.env') });
const jwt = require(path.join(__dirname, '../../backend/node_modules/jsonwebtoken'));

// Acuña un JWT de expiración lejana a partir del token real (mismo secreto),
// para que la sesión sobreviva a la fecha falseada (evita logout por exp).
function mintLongToken(realToken) {
  const p = jwt.decode(realToken) || {};
  return jwt.sign({ userId: p.userId, email: p.email }, process.env.JWT_SECRET, { expiresIn: '365d' });
}

const MONDAY = process.argv[2] || '2026-07-13';
const LEVEL = process.argv[3] || 'principiante';
const API = 'http://localhost:3010';
const PASSWORD = 'QaTest2026!';

const short = async (page) => (await page.locator('body').innerText()).replace(/\n+/g, ' | ');
const btns = async (page) => (await page.getByRole('button').allTextContents()).filter(Boolean);
const DONE_RX = /Sesión completada|Entrenamiento completado|WOD completado|¡Enhorabuena|Felicidades|Resumen de la sesión|Sesión Finalizada|Registrado hoy|ya has entrenado/i;

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

// Completa la parte de WOD + modal de esfuerzo si están presentes.
async function handleWod(page) {
  const txt = await short(page);
  // Modal de esfuerzo post-WOD
  if (/¿Cómo fue el WOD\?/i.test(txt)) {
    await clickIf(page, /^Sí$/i, { wait: 300 });
    await clickIf(page, /^8(\s|$)/, { wait: 200 }); // RPE 8 (Duro)
    await clickIf(page, /^Scaled$/i, { wait: 200 });
    await clickIf(page, /^(Me gustó|Normal)$/i, { wait: 200 });
    await clickIf(page, /^Guardar$/i, { wait: 1800 });
    await clickIf(page, /^Continuar$/i, { wait: 1200 });
    return 'esfuerzo-guardado';
  }
  // Pantalla del WOD (tiene "Terminar WOD")
  const terminar = page.getByRole('button', { name: /Terminar WOD/i });
  if (await terminar.count()) {
    await clickIf(page, /^Scaled$/i, { wait: 200 });
    await clickIf(page, /^Iniciar$/i, { wait: 1200 });
    await clickIf(page, /Terminar WOD/i, { wait: 800 });
    // handleFinish() registra N movimientos (await) antes de abrir el modal de
    // esfuerzo. Esperar aquí a que aparezca evita que el walker clique "Reanudar"
    // en la pantalla de fondo y aborte el cierre.
    for (let i = 0; i < 12; i++) {
      await page.waitForTimeout(900);
      if (/¿Cómo fue el WOD\?/i.test(await short(page))) break;
    }
    return 'wod-terminado';
  }
  return null;
}

async function walkSession(page, tag, maxSteps = 120) {
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

    const wod = await handleWod(page);
    if (wod) { console.log(`  [${step}] ${wod}`); stuck = 0; lastSig = sig; continue; }

    // OJO: NO incluir "Reanudar Entrenamiento" — tras terminar el WOD aparece
    // transitoriamente en la pantalla de fondo y clicarlo aborta el cierre (bucle).
    // Cada día arranca fresco con "Iniciar Entrenamiento".
    const prio = [
      /Saltar calentamiento/i, /Comenzar Entrenamiento Principal/i,
      /Iniciar sesión de hoy/i, /Iniciar entrenamiento/i, /Comenzar entrenamiento/i,
      /Empezar sesión/i, /^Entrenar$/i,
      /^Continuar$/i, /^Comenzar$/i, /^Siguiente$/i, /^Iniciar$/i, /^Empezar$/i, /^Listo$/i,
    ];
    let clicked = null;
    for (const rx of prio) { clicked = await clickIf(page, rx); if (clicked) break; }

    if (clicked) { console.log(`  [${step}] click: ${clicked}`); stuck = 0; }
    else if (/Cargando|Preparando|Generando/i.test(txt)) {
      await page.waitForTimeout(2500); stuck = 0; lastSig = sig; continue;
    }
    else {
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

async function apiGen(token, methodology, level) {
  const r = await fetch(`${API}/api/methodology/generate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ mode: 'manual', methodology, selectedLevel: level, nivel: level, goals: '', selectedMuscleGroups: [], source: 'manual_selection', version: '5.0' }),
  }).then(x => x.json());
  return r.methodology_plan_id || r.planId || r.plan?.methodology_plan_id;
}
async function apiConfirm(token, planId) {
  const r = await fetch(`${API}/api/routines/confirm-plan`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ methodology_plan_id: planId }),
  });
  return r.status;
}

(async () => {
  const results = [];
  // === 1) Registro (domingo real, la fecha no afecta al registro) ===
  const reg = await registerMobileUser({ slug: 'crossfit-full', preferredMethodology: 'crossfit', focus: 'hiit', speed: true });
  const email = reg.email;
  const token = await reg.page.evaluate(() => localStorage.getItem('authToken') || localStorage.getItem('token'));
  await saveState(reg.context);
  await reg.browser.close();
  const longToken = mintLongToken(token);
  console.log('REGISTRADO', email, 'token?', !!token, 'longToken?', !!longToken);

  // === 2) Plan por API (la generación por UI manual de CrossFit está bloqueada por la
  //        key de OpenAI: evaluate-profile 500 → cola offline). El objetivo aquí es el
  //        REPRODUCTOR, así que dejamos el plan listo por API y validamos el player por UI. ===
  const planId = await apiGen(token, 'crossfit', LEVEL);
  console.log('PLAN_ID', planId, 'confirm=', planId ? await apiConfirm(token, planId) : 'n/a');
  if (!planId) { console.error('No se pudo generar el plan por API'); process.exit(1); }
  const sessions = await fetchCalendar(token, planId);
  console.log('SESIONES', sessions.length, JSON.stringify(sessions.slice(0, 6)));
  let rest = sessions.sort((a, b) => a.date.localeCompare(b.date));
  const MAX_DAYS = Number(process.env.CF_MAX_DAYS || 0);
  if (MAX_DAYS > 0) rest = rest.slice(0, MAX_DAYS);

  // === 3) Todas las sesiones por UI (reproductor WOD), una por día con fecha desplazada ===
  for (const s of rest) {
    const { browser, context, page, issues } = await launch({ dateAt: `${s.date}T08:00:00`, speed: true, useState: true, injectToken: longToken });
    try {
      await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(3000);
      await page.getByText('Rutinas', { exact: true }).last().click().catch(() => {});
      await page.waitForTimeout(3000);
      const res = await walkSession(page, `18-cf-${s.date}`, 140);
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

  // === 4) Progreso + Historial ===
  {
    const lastDate = rest.length ? rest[rest.length - 1].date : MONDAY;
    const { browser, page } = await launch({ dateAt: `${lastDate}T20:00:00`, speed: false, useState: true, injectToken: longToken });
    try {
      await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(3000);
      await page.getByText('Rutinas', { exact: true }).last().click().catch(() => {});
      await page.waitForTimeout(2500);
      for (const tab of ['Progreso', 'Historial', 'Calendario']) {
        const t = page.getByText(tab, { exact: true }).last();
        if (await t.count()) { await t.click().catch(() => {}); await page.waitForTimeout(2500); await shot(page, `18-cf-tab-${tab.toLowerCase()}`); console.log(`\n=== ${tab} ===\n`, (await short(page)).slice(0, 1200)); }
      }
    } finally {
      await browser.close();
    }
  }

  console.log('\n===== RESUMEN CROSSFIT PLAN COMPLETO =====');
  results.forEach(r => console.log('  ', r));
  const okCount = results.filter(r => /COMPLETADA/.test(r)).length;
  console.log(`TOTAL: ${okCount}/${results.length} sesiones COMPLETADAS`);
})().catch(e => { console.error('FATAL', e.message, e.stack); process.exit(1); });
