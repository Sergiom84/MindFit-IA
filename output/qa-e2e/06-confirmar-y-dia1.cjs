// Paso 6: (lunes falseado) generar plan manual, confirmarlo y completar la sesión del día 1
const { launch, shot, saveState, report, BASE } = require('./lib.cjs');

const CLOCK = process.argv[2] || '2026-07-13T08:00:00';
const MAX_STEPS = Number(process.argv[3] || 900);

(async () => {
  const { browser, context, page, issues } = await launch({ clockAt: CLOCK });
  const short = async () => (await page.locator('body').innerText()).replace(/\n+/g, ' | ');
  const dump = async (tag, len = 1200) => console.log(`\n=== ${tag} ===\n${(await short()).slice(0, len)}`);
  const clickBtn = async (rx, label) => {
    const b = page.getByRole('button', { name: rx });
    if (await b.count()) {
      console.log('CLICK', label || String(rx));
      await b.first().click({ timeout: 8000 }).catch(e => console.log('fail click', e.message.split('\n')[0]));
      return true;
    }
    return false;
  };
  const loginIfNeeded = async () => {
    if (/Accede a tu cuenta/i.test(await page.locator('body').innerText())) {
      console.log('re-login');
      await page.locator('input[type="email"], input[name="email"]').first().fill('lucia.ferrero.qa@entrenaconia-test.com');
      await page.locator('input[type="password"]').first().fill('QaCalis2026!');
      await page.getByRole('button', { name: /^Iniciar Sesión$/ }).last().click();
      await page.waitForTimeout(5000);
    }
  };
  try {
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(4000);
    await loginIfNeeded();

    // === GENERAR PLAN ===
    await page.getByText('Métodos', { exact: true }).last().click();
    await page.waitForTimeout(2500);
    const selBtn = page.getByRole('button', { name: /Seleccionar/ });
    const nSel = await selBtn.count();
    for (let i = 0; i < nSel; i++) {
      const b = selBtn.nth(i);
      const inCal = await b.evaluate(el => {
        let p = el; for (let k = 0; k < 6 && p; k++) { p = p.parentElement; if (p && /Calistenia/i.test(p.innerText) && p.innerText.length < 2000) return true; }
        return false;
      });
      if (inCal) { console.log('CLICK Seleccionar Calistenia'); await b.click(); break; }
    }
    for (let i = 0; i < 12; i++) {
      const t = await page.locator('body').innerText();
      if (/Elegir Nivel Manualmente|Selecciona tu nivel actual|Generar Plan con IA/i.test(t)) break;
      await page.waitForTimeout(2500);
    }
    await clickBtn(/Elegir Nivel Manualmente/i, 'Elegir Nivel Manualmente');
    await page.waitForTimeout(1500);
    const levelCard = page.locator('h4', { hasText: /Principiante/i }).first();
    if (await levelCard.count()) { await levelCard.click(); console.log('CLICK nivel Principiante'); }
    await page.waitForTimeout(1000);
    await clickBtn(/Generar Plan Manual/i, 'Generar Plan Manual');

    // esperar "¡Plan de Entrenamiento Listo!"
    for (let i = 0; i < 36; i++) {
      await page.waitForTimeout(5000);
      if (/Plan de Entrenamiento Listo/i.test(await page.locator('body').innerText())) break;
    }
    await shot(page, '06-plan-listo');
    await dump('PLAN LISTO', 800);

    // === CONFIRMAR ===
    await clickBtn(/Comenzar Entrenamiento$/i, 'Comenzar Entrenamiento');
    await page.waitForTimeout(6000);
    await shot(page, '06-tras-confirmar');
    await dump('TRAS CONFIRMAR', 1500);
    console.log('BOTONES:', JSON.stringify((await page.getByRole('button').allTextContents()).filter(Boolean).slice(0, 25)));

    // === ENTRENAR DÍA 1 (walker) ===
    let lastSig = '', stuckCount = 0;
    for (let step = 0; step < MAX_STEPS; step++) {
      await page.waitForTimeout(800);
      const txt = await short();
      const sig = txt.slice(0, 400);
      const btns = (await page.getByRole('button').allTextContents()).filter(Boolean);

      if (/Accede a tu cuenta/i.test(txt)) { console.log(`[${step}] deslogueado → login`); await loginIfNeeded(); continue; }

      if (/Sesión completada|Entrenamiento completado|¡Enhorabuena|Felicidades|Resumen de la sesión|Sesión Finalizada/i.test(txt)) {
        console.log(`\n[${step}] SESION COMPLETADA`);
        await shot(page, '06-completada');
        console.log(txt.slice(0, 1800));
        break;
      }

      if (/Registrar Serie/i.test(txt)) {
        const inputs = page.locator('input:visible');
        const nIn = await inputs.count();
        if (nIn) await inputs.nth(nIn - 1).fill('10').catch(() => {});
        const rir2 = page.getByRole('button', { name: /^2$/ });
        if (await rir2.count()) await rir2.first().click({ force: true, timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(300);
        const save = page.getByRole('button', { name: /Guardar Serie/i });
        if (await save.count() && await save.first().isEnabled().catch(() => false)) {
          await save.first().click({ force: true, timeout: 5000 }).catch(e => console.log('guardar fail', e.message.split('\n')[0]));
          console.log(`[${step}] Serie guardada (reps 10, RIR 2)`);
          lastSig = sig; continue;
        }
      }

      const prio = [
        /Guardar Serie/i, /Comenzar Entrenamiento Principal/i,
        /^Finalizar( entrenamiento| sesión)?$/i, /Guardar y continuar/i,
        /Serie completada|Completar serie/i, /^Completar( ejercicio)?$/i,
        /Siguiente ejercicio/i, /^Continuar$/i, /^Comenzar$/i, /^Iniciar$/i,
        /Iniciar sesión de hoy/i, /Empezar sesión/i, /^Empezar$/i, /^Siguiente$/i,
        /^Listo$/i, /^Hecho$/i, /Saltar descanso/i, /Omitir descanso/i,
        /^(Fácil|Óptimo|Bien|Normal)$/i, /Guardar valoración/i, /^Enviar$/i
      ];
      let clicked = null;
      for (const rx of prio) {
        const b = page.getByRole('button', { name: rx });
        if (await b.count()) {
          const el = b.first();
          if (await el.isEnabled().catch(() => false)) {
            clicked = (await el.textContent() || '').trim();
            await el.click({ timeout: 8000 }).catch(e => console.log('click fail', e.message.split('\n')[0]));
            break;
          }
        }
      }

      if (!clicked) {
        if (btns.some(b => /Pausar|Descanso/i.test(b)) || /Descanso|0:\d\d/.test(txt)) {
          await page.clock.fastForward(20000);
          await page.mouse.move(180 + (step % 30), 60).catch(() => {});
          const m = txt.match(/Ejercicio (\d+) de (\d+)/);
          if (step % 15 === 0) console.log(`[${step}] ff ej=${m ? m[1] + '/' + m[2] : '?'}`);
          lastSig = sig; stuckCount = 0; continue;
        }
        console.log(`\n[${step}] SIN BOTON. Botones:`, JSON.stringify(btns.slice(0, 20)));
        console.log('TXT:', txt.slice(0, 700));
        await shot(page, `06-stuck-${step}`);
        stuckCount = sig === lastSig ? stuckCount + 1 : 0;
        if (stuckCount >= 2) break;
      } else {
        stuckCount = 0;
        console.log(`[${step}] click: ${clicked}`);
      }
      lastSig = sig;
    }

    await shot(page, '06-final');
    await dump('FINAL', 1200);
    await saveState(context);
  } finally {
    report(issues);
    await browser.close();
  }
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
