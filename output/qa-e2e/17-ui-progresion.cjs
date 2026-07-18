// UI real (Playwright + iPhone emulado): valida el enganche RIR→progresión en
// el reproductor. Pre-siembra 2 sesiones fáciles vía API (decision=progress) y
// conduce la 3ª sesión por UI verificando:
//  - las prescripciones llegan AJUSTADAS (nota 📈 / reps subidas)
//  - save-set responde 200 (RIR por serie)
//  - al terminar aparece el modal de esfuerzo y llama a /effort (idempotente)
// Uso: node 17-ui-progresion.cjs [methodology] [level]
const { launch, shot, report } = require('./lib.cjs');
const API = process.env.QA_API || 'http://localhost:3010';
const METHODOLOGY = process.argv[2] || 'calistenia';
const LEVEL = process.argv[3] || 'Principiante';

async function api(method, path, token, body) {
  const r = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let j = {}; try { j = await r.json(); } catch {}
  return { status: r.status, j };
}
function parseReps(reps) { const m = String(reps || '').match(/^(\d+)/); return m ? parseInt(m[1], 10) : null; }

async function clickName(p, rx, wait = 600) {
  const b = p.getByRole('button', { name: rx });
  if (await b.count()) {
    const el = b.first();
    if (await el.isEnabled().catch(() => false)) {
      const t = (await el.textContent() || '').trim();
      await el.click({ force: true, timeout: 6000 }).catch(() => {});
      if (wait) await p.waitForTimeout(wait);
      return t;
    }
  }
  return null;
}

(async () => {
  // --- Fase API: usuario + plan + 2 sesiones fáciles (decision=progress) ---
  const email = `qa.ui.rir.${Math.floor(Math.random() * 100000)}@entrenaconia-test.com`;
  const reg = await api('POST', '/api/auth/register', null, {
    nombre: 'QA', apellido: 'UiRir', email, password: 'QaTest2026!',
    edad: 28, sexo: 'femenino', peso: 62, altura: 166,
    nivelEntrenamiento: LEVEL.toLowerCase(), anosEntrenando: 1, frecuenciaSemanal: 3,
    nivelActividad: 'moderado', objetivoPrincipal: 'ganar_masa_muscular', enfoqueEntrenamiento: 'hipertrofia', metodologiaPreferida: METHODOLOGY.toLowerCase()
  });
  const token = reg.j.token; const user = reg.j.user;
  if (!token) { console.error('REGISTER FAIL', JSON.stringify(reg.j).slice(0, 200)); process.exit(1); }
  const gen = await api('POST', '/api/methodology/generate', token, {
    mode: 'manual', methodology: METHODOLOGY, selectedLevel: LEVEL,
    goals: '', selectedMuscleGroups: [], source: 'manual_selection', version: '5.0'
  });
  const planId = gen.j.methodology_plan_id || gen.j.planId;
  await api('POST', '/api/routines/confirm-plan', token, { methodology_plan_id: planId });
  const cal = await api('GET', `/api/routines/calendar-schedule/${planId}`, token);
  const DAY_FULL = { Lun: 'Lunes', Mar: 'Martes', Mie: 'Miercoles', 'Mié': 'Miercoles', Jue: 'Jueves', Vie: 'Viernes', Sab: 'Sabado', 'Sáb': 'Sabado', Dom: 'Domingo' };
  const sessions = (cal.j.plan?.semanas || []).flatMap(w => (w.sesiones || []).map(s => ({
    date: String(s.fecha).slice(0, 10), week: w.semana || w.numero, day: DAY_FULL[s.dia] || s.dia
  }))).filter(s => s.date);
  console.log(`PLAN ${planId} — ${sessions.length} sesiones. Pre-siembro 2 fáciles por API...`);

  const baseline = {};
  for (let i = 0; i < 2; i++) {
    const s = sessions[i];
    const start = await api('POST', '/api/routines/sessions/start', token, {
      methodology_plan_id: planId, session_date: s.date, week_number: s.week, day_name: s.day
    });
    const sid = start.j.session_id;
    const prog = await api('GET', `/api/routines/sessions/${sid}/progress`, token);
    for (const ex of (prog.j.exercises || [])) {
      if (baseline[ex.exercise_name] == null) baseline[ex.exercise_name] = parseReps(ex.repeticiones);
      const sets = Number(ex.series_total) || 3;
      for (let sn = 1; sn <= sets; sn++) {
        await api('POST', '/api/hipertrofiav2/save-set', token, {
          userId: user.id, methodologyPlanId: planId, sessionId: sid,
          exercise_id: ex.exercise_id || null, exercise_name: ex.exercise_name,
          set_number: sn, weight: 0, reps: parseReps(ex.repeticiones) || 10, rir: 3
        });
      }
      await api('PUT', `/api/routines/sessions/${sid}/exercise/${ex.exercise_order}`, token, {
        series_completed: sets, status: 'completed', time_spent_seconds: 60
      });
    }
    const eff = await api('POST', `/api/routines/sessions/${sid}/effort`, token, { feeling: 'facil' });
    console.log(`  [seed ${i}] ${s.date} → decision=${eff.j.decision}`);
  }

  // --- Fase UI: sesión 3 con progresión aplicada ---
  const target = sessions[2];
  console.log(`UI: sesión del ${target.date} (${METHODOLOGY} ${LEVEL})`);
  const { browser, page } = await launch({
    useState: false,
    dateAt: `${target.date}T08:00:00`,
    speed: true,
    injectAuth: { token, user }
  });

  const net = { saveSet: [], effort: [], startProgression: null };
  page.on('response', async (r) => {
    const u = r.url();
    if (!u.includes('/api/')) return;
    if (/save-set/.test(u)) net.saveSet.push(r.status());
    if (/\/effort$/.test(u)) { let b = ''; try { b = await r.text(); } catch {}; net.effort.push({ status: r.status(), body: b.slice(0, 200) }); }
    if (/sessions\/start/.test(u)) { try { const j = JSON.parse(await r.text()); net.startProgression = j.progression || null; } catch {} }
  });

  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3500);
  await page.getByText('Rutinas', { exact: true }).last().click().catch(() => {});
  await page.waitForTimeout(3000);
  await shot(page, 'ui-rir-01-rutinas');

  await clickName(page, /Iniciar Entrenamiento|Reanudar Entrenamiento/i, 2500);
  await clickName(page, /Saltar calentamiento/i, 1500);
  await clickName(page, /Comenzar Entrenamiento Principal|Comenzar Entrenamiento$/i, 2000);
  // Control nativo "Off" (tiempo por serie manual): sin esperas de timer
  await clickName(page, /^Off$/i, 800);
  await shot(page, 'ui-rir-02-player');

  const bodyTxt = async () => (await page.locator('body').innerText()).replace(/\n+/g, ' | ');
  let series = 0, ejercicios = 0, sawProgressNote = false, sawEffortModal = false, decisionShown = '';

  // 900 pasos x 500ms+ de espera se quedaba corto: con "Off" el descanso
  // sigue teniendo un suelo real de 30s en el frontend (useExerciseTimer.js
  // clampa restDuration a Math.max(30,...) pase lo que pase por API), así
  // que 4 ejercicios x 3 series ya son ~6min solo de descansos reales.
  for (let step = 0; step < 2400; step++) {
    await page.waitForTimeout(500);
    const txt = await bodyTxt();
    if (/Progresión|entrenador sabe que puedes/i.test(txt)) sawProgressNote = true;

    // Modal de esfuerzo tras completar la sesión
    if (/¿Cómo (ha ido|fue) la sesión|Cómo te has sentido|esfuerzo de la sesión|RIR medio|¿Qué tal la sesión/i.test(txt) && /fácil|facil|normal|difícil|dificil/i.test(txt)) {
      sawEffortModal = true;
      await shot(page, 'ui-rir-04-effort-modal');
      await clickName(page, /Normal/i, 800);
      await clickName(page, /Guardar|Enviar|Confirmar/i, 2500);
      const txt2 = await bodyTxt();
      const m = txt2.match(/progres|manten|descarga|deload|sube|aumenta/i);
      decisionShown = m ? m[0] : '';
      await shot(page, 'ui-rir-05-decision');
      break;
    }

    const repInput = page.locator('input[placeholder="10"]:visible').first();
    if (await repInput.count()) {
      await repInput.fill('12').catch(() => {});
      // Peso: si el ejercicio NO se detectó como "peso corporal" (bodyweight),
      // el campo "Peso Utilizado (kg)" es obligatorio y "Guardar Serie" queda
      // deshabilitado (disabled, opacity-50) hasta rellenarlo — un click
      // (incluso programático) sobre un <button disabled> es un no-op real,
      // así que la sesión se quedaba congelada en la 1ª serie para siempre.
      const weightInput = page.locator('input[placeholder="75.0"]:visible').first();
      if (await weightInput.count()) {
        await weightInput.fill('20').catch(() => {});
      }
      const rir = page.getByRole('button', { name: /^3$/ });
      if (await rir.count()) await rir.first().click({ force: true }).catch(() => {});
      await page.waitForTimeout(250);
      const saveBtn = page.getByRole('button', { name: /Guardar Serie/i }).first();
      if (await saveBtn.count()) {
        await saveBtn.scrollIntoViewIfNeeded().catch(() => {});
        // Ya no hace falta click programático (fix db73b2d: AudioBubble ya no
        // tapa el botón) — click real, que además falla visiblemente si algo
        // lo bloquea, en vez de fallar en silencio.
        await saveBtn.click({ timeout: 4000 }).catch(async () => {
          await saveBtn.evaluate(el => el.click()).catch(() => {});
        });
        await page.waitForTimeout(1600);
        series = net.saveSet.length;
      }
      continue;
    }

    if (/Sesión completada|¡Bien hecho|Resumen de la sesión|Entrenamiento completado/i.test(txt)) {
      await clickName(page, /Finalizar|Cerrar|Terminar/i, 2000);
      continue;
    }

    let acted = null;
    for (const rx of [/Registrar Serie/i, /Avanzar|Serie completada|Completar serie/i, /^Comenzar$/i, /Iniciar ejercicio/i, /Completar ejercicio actual/i, /Siguiente Ejercicio|^Siguiente$/i, /Finalizar|Terminar sesión/i, /Reanudar Entrenamiento/i, /Saltar calentamiento/i, /Comenzar Entrenamiento Principal|Comenzar Entrenamiento$/i, /^Off$/i]) {
      const hit = await clickName(page, rx, 900);
      if (hit) { acted = hit; if (/Completar ejercicio/i.test(hit)) ejercicios++; break; }
    }
    if (!acted) {
      if (/Descanso|Preparando|Cargando|¡Listo!/i.test(txt)) { await page.waitForTimeout(1000); continue; }
      await clickName(page, /Avanzar/i, 800);
    }
  }

  await shot(page, 'ui-rir-06-final');

  console.log('\n===== VERIFICACIÓN UI =====');
  let pass = 0, fail = 0;
  const check = (n, c) => { console.log(`${c ? '✅' : '❌'} ${n}`); c ? pass++ : fail++; };
  check(`sessions/start devolvió progression meta (${JSON.stringify(net.startProgression)})`, !!net.startProgression?.applied);
  check(`Nota de progresión visible en el reproductor`, sawProgressNote);
  check(`save-set 200 (${net.saveSet.length} series, estados: ${[...new Set(net.saveSet)]})`, net.saveSet.length > 0 && net.saveSet.every(s => s === 200));
  check(`Modal de esfuerzo apareció al completar`, sawEffortModal);
  check(`POST /effort llamado y 200 (${JSON.stringify(net.effort.map(e => e.status))})`, net.effort.length > 0 && net.effort.every(e => e.status === 200));
  console.log('Decision mostrada al usuario:', decisionShown || '(no capturada)');
  console.log(`Series UI: ${series} | ejercicios: ${ejercicios}`);
  console.log(`\nRESULTADO: ${pass} pass / ${fail} fail`);
  report([]);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e.message, e.stack); process.exit(1); });
