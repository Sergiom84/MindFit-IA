// Plan COMPLETO de HipertrofiaV2 / MindFeed por UI (reproductor propio), fecha desplazada.
// Registra usuario → genera plan manual el lunes → completa TODAS las sesiones
// (un contexto por día) → revisa Progreso e Historial.
//
// ⚠️ BLOQUEADO (2026-07-12): con el plan hipertrofiav2 generado por API, el reproductor
// (ExerciseSessionView vía Hoy) NO arranca el set: "Comenzar" no es accionable (queda
// cubierto) y la sesión cae a estado de error "Reintentar". Codex sí validó MindFeed con
// plan generado por UI (flujo de finde), así que la sospecha es que el plan por API no
// trae la config que el player necesita. Requiere depurar RoutineSessionModal/ExerciseSessionView.
//
// Uso: node 19-mindfeed-plan-completo.cjs [YYYY-MM-DD lunes] [nivel]
const path = require('path');
const { launch, shot, saveState, report, BASE } = require('./lib.cjs');
const { registerMobileUser } = require('./ui-user-helpers.cjs');
require(path.join(__dirname, '../../backend/node_modules/dotenv')).config({ path: path.join(__dirname, '../../backend/.env') });
const jwt = require(path.join(__dirname, '../../backend/node_modules/jsonwebtoken'));

function mintLongToken(realToken) {
  const p = jwt.decode(realToken) || {};
  return jwt.sign({ userId: p.userId, email: p.email }, process.env.JWT_SECRET, { expiresIn: '365d' });
}
async function apiGen(token, methodology, level) {
  const r = await fetch(`http://localhost:3010/api/methodology/generate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ mode: 'manual', methodology, selectedLevel: level, nivel: level, goals: '', selectedMuscleGroups: [], source: 'manual_selection', version: '5.0' }),
  }).then(x => x.json());
  return r.methodology_plan_id || r.planId || r.plan?.methodology_plan_id;
}
async function apiConfirm(token, planId) {
  const r = await fetch(`http://localhost:3010/api/routines/confirm-plan`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ methodology_plan_id: planId }),
  });
  return r.status;
}

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

// Flujo de serie en ExerciseSessionView (MindFeed):
//  Comenzar → (timer) → Pausar para que aparezca "Registrar Serie (RIR)" →
//  abre modal → reps + RIR 2 + Guardar Serie.
async function handleSerie(page) {
  // 1) Modal de registro abierto → rellenar y guardar
  const save = page.getByRole('button', { name: /Guardar Serie/i });
  if (await save.count()) {
    const reps = page.locator('input[placeholder="10"]:visible, input[type="number"]:visible').first();
    if (await reps.count()) await reps.fill('10').catch(() => {});
    const weight = page.locator('input[placeholder*="75"]:visible, input[placeholder*="peso"]:visible').first();
    if (await weight.count()) { const v = await weight.inputValue().catch(() => ''); if (!v) await weight.fill('20').catch(() => {}); }
    const rir2 = page.getByRole('button', { name: /^2$/ });
    if (await rir2.count()) await rir2.first().click({ force: true, timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(250);
    if (await save.first().isEnabled().catch(() => false)) {
      await save.first().click({ force: true }).catch(() => {});
      return 'serie-guardada';
    }
  }
  // 2) Botón "Registrar Serie (RIR)" visible → abrir el modal
  const reg = page.getByRole('button', { name: /Registrar Serie/i });
  if (await reg.count() && await reg.first().isEnabled().catch(() => false)) {
    await reg.first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(600);
    return 'abrir-registro';
  }
  // 3) Set en marcha (timer): pausar para que aparezca "Registrar Serie"
  const pausar = page.getByRole('button', { name: /^Pausar$/i });
  if (await pausar.count() && await pausar.first().isEnabled().catch(() => false)) {
    await pausar.first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(400);
    return 'pausar';
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

    // OJO: NO incluir "Reanudar Entrenamiento" — queda en el fondo del player y, al ir
    // antes que "Comenzar", el walker lo clicaba en bucle sin arrancar la serie.
    const prio = [
      /Saltar calentamiento/i, /Comenzar Entrenamiento Principal/i,
      /Iniciar sesión de hoy/i, /Iniciar entrenamiento/i,
      /Empezar sesión/i, /^Entrenar$/i,
      /Siguiente ejercicio/i, /^Completar( ejercicio)?$/i, /Serie completada/i,
      /^Comenzar$/i, /^Continuar$/i, /^Siguiente$/i, /^Iniciar$/i, /^Empezar$/i, /^Listo$/i,
      /^Entendido$/i, /Saltar descanso/i, /Omitir descanso/i,
      /^(Fácil|Óptimo|Bien|Normal)$/i, /Guardar valoración/i,
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
  const longToken = mintLongToken(token);
  console.log('REGISTRADO', email, 'token?', !!token, 'longToken?', !!longToken);

  // Plan por API (consistente con CrossFit; evita depender de la generación por UI).
  const planId = await apiGen(token, 'hipertrofiav2', LEVEL);
  console.log('PLAN_ID', planId, 'confirm=', planId ? await apiConfirm(token, planId) : 'n/a');
  if (!planId) { console.error('No se pudo generar el plan por API'); process.exit(1); }
  const sessions = await fetchCalendar(token, planId);
  console.log('SESIONES', sessions.length, JSON.stringify(sessions.slice(0, 6)));
  let rest = sessions.sort((a, b) => a.date.localeCompare(b.date));
  const MAX_DAYS = Number(process.env.MF_MAX_DAYS || 0);
  if (MAX_DAYS > 0) rest = rest.slice(0, MAX_DAYS);

  for (const s of rest) {
    const { browser, context, page, issues } = await launch({ dateAt: `${s.date}T08:00:00`, speed: true, useState: true, injectToken: longToken });
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
    const { browser, page } = await launch({ dateAt: `${lastDate}T20:00:00`, speed: false, useState: true, injectToken: longToken });
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
