// Paso 7: entrenar la sesión del día indicado (reloj falseado). Uso: node 07-entrenar-dia.cjs 2026-07-13
const { launch, shot, saveState, report, BASE } = require('./lib.cjs');

const DATE = process.argv[2];
if (!DATE) { console.error('Falta fecha YYYY-MM-DD'); process.exit(1); }
const CLOCK = `${DATE}T08:00:00`;
const MAX_STEPS = Number(process.argv[3] || 900);
const TAG = DATE.replaceAll('-', '');

(async () => {
  const { browser, context, page, issues } = await launch({ dateAt: CLOCK, speed: true, useState: false });
  const short = async () => (await page.locator('body').innerText()).replace(/\n+/g, ' | ');
  const clickBtn = async (rx) => {
    const b = page.getByRole('button', { name: rx });
    if (await b.count() && await b.first().isEnabled().catch(() => false)) {
      const t = (await b.first().textContent() || '').trim();
      await b.first().click({ timeout: 8000 }).catch(e => console.log('fail click', e.message.split('\n')[0]));
      return t;
    }
    return null;
  };
  const loginIfNeeded = async () => {
    if (/Accede a tu cuenta/i.test(await page.locator('body').innerText())) {
      await page.locator('input[type="email"], input[name="email"]').first().fill('lucia.ferrero.qa@entrenaconia-test.com');
      await page.locator('input[type="password"]').first().fill('QaCalis2026!');
      await page.getByRole('button', { name: /^Iniciar Sesión$/ }).last().click();
      await page.waitForTimeout(5000);
      console.log('re-login hecho');
    }
  };
  try {
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(4000);
    await loginIfNeeded();
    console.log(`=== DIA ${DATE} · DASHBOARD ===`);
    console.log((await short()).slice(0, 700));
    await shot(page, `07-${TAG}-dashboard`);

    // Ir a Rutinas (pestaña Hoy)
    await page.getByText('Rutinas', { exact: true }).last().click();
    await page.waitForTimeout(4000);
    console.log(`=== RUTINAS/HOY ===`);
    console.log((await short()).slice(0, 1500));
    await shot(page, `07-${TAG}-hoy`);
    console.log('BOTONES:', JSON.stringify((await page.getByRole('button').allTextContents()).filter(Boolean).slice(0, 25)));

    // Walker
    let lastSig = '', stuckCount = 0, done = false, warmupBtnClicks = 0;
    for (let step = 0; step < MAX_STEPS; step++) {
      await page.waitForTimeout(800);
      const txt = await short();
      const sig = txt.slice(0, 400);
      const btns = (await page.getByRole('button').allTextContents()).filter(Boolean);

      if (/Accede a tu cuenta/i.test(txt)) { console.log(`[${step}] deslogueado`); await loginIfNeeded(); continue; }

      if (/Sesión completada|Entrenamiento completado|¡Enhorabuena|Felicidades|Resumen de la sesión|Sesión Finalizada|completado el entrenamiento/i.test(txt)) {
        console.log(`\n[${step}] SESION COMPLETADA (${DATE})`);
        await shot(page, `07-${TAG}-completada`);
        console.log(txt.slice(0, 1500));
        done = true;
        // intentar cerrar resumen
        for (const rx of [/Cerrar/i, /Aceptar/i, /Continuar/i, /Volver/i, /Finalizar/i]) { if (await clickBtn(rx)) break; }
        break;
      }

      if (/Registrar Serie/i.test(txt)) {
        const repsIn = page.locator('input[placeholder="10"]:visible').first();
        if (await repsIn.count()) await repsIn.fill('10').catch(() => {});
        const weightIn = page.locator('input[placeholder*="75"]:visible, input[placeholder*="peso corporal"]:visible').first();
        if (await weightIn.count()) {
          const v = await weightIn.inputValue().catch(() => '');
          if (!v) await weightIn.fill('0').catch(() => {});
        }
        const rir2 = page.getByRole('button', { name: /^2$/ });
        if (await rir2.count()) await rir2.first().click({ force: true, timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(300);
        const save = page.getByRole('button', { name: /Guardar Serie/i });
        if (await save.count() && await save.first().isEnabled().catch(() => false)) {
          await save.first().evaluate(el => el.click());
          console.log(`[${step}] serie guardada`);
          lastSig = sig; continue;
        }
      }

      const prio = [
        /Comenzar Entrenamiento Principal/i,
        /^Finalizar( entrenamiento| sesión)?$/i, /Guardar y continuar/i,
        /Serie completada|Completar serie/i, /^Completar( ejercicio)?$/i,
        /Siguiente ejercicio/i, /Iniciar sesión de hoy/i, /Iniciar entrenamiento/i, /Empezar sesión/i,
        /^Continuar$/i, /^Comenzar$/i, /^Iniciar$/i, /^Empezar$/i, /^Siguiente$/i,
        /^Listo$/i, /^Hecho$/i, /Saltar descanso/i, /Omitir descanso/i,
        /^(Fácil|Óptimo|Bien|Normal)$/i, /Guardar valoración/i, /^Enviar$/i,
        /Reanudar Entrenamiento/i
      ];
      let clicked = null;
      for (const rx of prio) {
        const b = page.getByRole('button', { name: rx });
        if (await b.count()) {
          const el = b.first();
          if (await el.isEnabled().catch(() => false)) {
            clicked = (await el.textContent() || '').trim();
            await el.click({ force: true, timeout: 5000 }).catch(e => console.log('click fail', e.message.split('\n')[0]));
            break;
          }
        }
      }

      if (!clicked) {
        if (/Cargando|Preparando|Generando/i.test(txt) && stuckCount < 20) {
          console.log(`[${step}] pantalla de carga, espero…`);
          await page.waitForTimeout(5000);
          stuckCount = sig === lastSig ? stuckCount + 1 : 0;
          lastSig = sig;
          continue;
        }
        if (btns.some(b => /Pausar|Descanso/i.test(b)) || /Descanso|0:\d\d/.test(txt)) {
          // timers reales: solo esperar
          await page.waitForTimeout(4000);
          await page.mouse.move(180 + (step % 30), 60).catch(() => {});
          lastSig = sig; stuckCount = 0; continue;
        }
        console.log(`\n[${step}] SIN BOTON. Botones:`, JSON.stringify(btns.slice(0, 20)));
        console.log('TXT:', txt.slice(0, 700));
        await shot(page, `07-${TAG}-stuck-${step}`);
        stuckCount = sig === lastSig ? stuckCount + 1 : 0;
        if (stuckCount >= 2) break;
      } else {
        stuckCount = 0;
        console.log(`[${step}] click: ${clicked}`);
        // Workaround del bug warmup→main: si el botón no desaparece, recargar y reanudar
        if (/Comenzar Entrenamiento Principal/i.test(clicked)) {
          warmupBtnClicks++;
          if (warmupBtnClicks >= 4) {
            console.log(`[${step}] warmup atascado → reload + Reanudar`);
            warmupBtnClicks = 0;
            await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
            await page.waitForTimeout(4000);
            await loginIfNeeded();
            await page.getByText('Rutinas', { exact: true }).last().click();
            for (let w = 0; w < 15; w++) {
              await page.waitForTimeout(3000);
              const r = page.getByRole('button', { name: /Reanudar|Continuar entrenamiento/i });
              if (await r.count()) { console.log('CLICK Reanudar'); await r.first().click(); break; }
            }
            await page.waitForTimeout(3000);
          }
        } else if (!/^(Comenzar|Siguiente)$/.test(clicked)) {
          warmupBtnClicks = 0;
        }
      }
      lastSig = sig;
    }

    console.log('RESULTADO:', done ? 'COMPLETADA' : 'INCOMPLETA');
    await shot(page, `07-${TAG}-final`);
    await saveState(context);
  } finally {
    report(issues);
    await browser.close();
  }
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
