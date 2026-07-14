// Paso 4: recorrer calentamiento + entrenamiento del día hasta completar la sesión.
// Uso: node 04-completar-sesion.cjs [maxSteps] — explorador genérico de player.
const { launch, shot, saveState, report, BASE } = require('./lib.cjs');

const MAX_STEPS = Number(process.argv[2] || 60);
const NO_CLOCK = process.argv[3] === 'noclock';

(async () => {
  const { browser, context, page, issues } = await launch(NO_CLOCK ? {} : { clockAt: new Date().toISOString() });
  const short = async () => (await page.locator('body').innerText()).replace(/\n+/g, ' | ');
  try {
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(4000);
    if (/Accede a tu cuenta/i.test(await page.locator('body').innerText())) {
      console.log('LOGIN requerido → re-login');
      await page.locator('input[type="email"], input[name="email"]').first().fill('lucia.ferrero.qa@entrenaconia-test.com');
      await page.locator('input[type="password"]').first().fill('QaCalis2026!');
      await page.getByRole('button', { name: /^Iniciar Sesión$/ }).last().click();
      await page.waitForTimeout(5000);
    }
    console.log('=== DASHBOARD TRAS RELOAD ===');
    console.log((await short()).slice(0, 800));
    await shot(page, '04-00-dashboard-reload');

    // ¿Dónde está la sesión de hoy? Probar Inicio → botón de sesión, o Rutinas → Hoy
    let inPlayer = false;
    const tryEnterSession = async () => {
      const t = await short();
      if (/Calentamiento|Ejercicio \d+ de \d+/i.test(t)) { inPlayer = true; return; }
      // buscar CTA en dashboard
      for (const rx of [/Continuar sesión/i, /Reanudar/i, /Empezar sesión/i, /Iniciar sesión de hoy/i, /Entrenamiento de hoy/i]) {
        const b = page.getByRole('button', { name: rx });
        if (await b.count()) { await b.first().click(); await page.waitForTimeout(2500); inPlayer = true; return; }
      }
      // ir a Rutinas
      await page.getByText('Rutinas', { exact: true }).last().click();
      await page.waitForTimeout(3000);
      console.log('=== RUTINAS ===');
      console.log((await short()).slice(0, 1500));
      await shot(page, '04-01-rutinas');
      for (const rx of [/Continuar/i, /Reanudar/i, /Iniciar/i, /Comenzar/i, /Empezar/i]) {
        const b = page.getByRole('button', { name: rx });
        if (await b.count()) {
          console.log('CLICK entrar sesión:', JSON.stringify(await b.first().textContent()));
          await b.first().click(); await page.waitForTimeout(3000); inPlayer = true; return;
        }
      }
      // último recurso: volver a seleccionar Calistenia (modal fin de semana)
      const selBtn = page.getByRole('button', { name: /Seleccionar/ });
      const nSel = await selBtn.count();
      for (let i = 0; i < nSel; i++) {
        const b = selBtn.nth(i);
        const inCal = await b.evaluate(el => {
          let p = el; for (let k = 0; k < 6 && p; k++) { p = p.parentElement; if (p && /Calistenia/i.test(p.innerText) && p.innerText.length < 2000) return true; }
          return false;
        });
        if (inCal) { console.log('CLICK Seleccionar Calistenia (reintento)'); await b.click(); break; }
      }
      await page.waitForTimeout(2000);
      console.log('=== TRAS RESELECCION ===');
      console.log((await short()).slice(0, 1200));
      await shot(page, '04-01b-reseleccion');
      const acc = page.getByRole('button', { name: /Aceptar entrenamiento para hoy|Reanudar|Continuar/i });
      if (await acc.count()) {
        console.log('CLICK:', JSON.stringify(await acc.first().textContent()));
        await acc.first().click();
        await page.waitForTimeout(8000);
        inPlayer = true;
      }
    };
    await tryEnterSession();
    await shot(page, '04-02-entrada-sesion');
    console.log('=== ESTADO ENTRADA ===');
    console.log((await short()).slice(0, 1500));

    // Bucle caminante genérico
    let lastSig = '';
    let stuckCount = 0;
    for (let step = 0; step < MAX_STEPS; step++) {
      await page.waitForTimeout(800);
      const txt = await short();
      const sig = txt.slice(0, 400);
      const btns = (await page.getByRole('button').allTextContents()).filter(Boolean);

      // Si nos echó al login, re-loguear y seguir
      if (/Accede a tu cuenta/i.test(txt)) {
        console.log(`[${step}] DESLOGUEADO → re-login`);
        await shot(page, `04-deslogueado-${step}`);
        await page.locator('input[type="email"], input[name="email"]').first().fill('lucia.ferrero.qa@entrenaconia-test.com');
        await page.locator('input[type="password"]').first().fill('QaCalis2026!');
        await page.getByRole('button', { name: /^Iniciar Sesión$/ }).last().click();
        await page.waitForTimeout(4000);
        await tryEnterSession();
        continue;
      }

      if (/Sesión completada|Entrenamiento completado|¡Enhorabuena|Felicidades|Resumen de la sesión/i.test(txt)) {
        console.log(`\n[${step}] SESION COMPLETADA`);
        await shot(page, `04-99-completada`);
        console.log(txt.slice(0, 1800));
        break;
      }

      // Modal "Registrar Serie": rellenar reps + RIR + guardar
      if (/Registrar Serie/i.test(txt)) {
        const inputs = page.locator('input:visible');
        const nIn = await inputs.count();
        if (nIn) {
          const repsInput = inputs.nth(nIn - 1); // último input = Repeticiones Completadas
          await repsInput.fill('10').catch(e => console.log('reps fill fail', e.message.split('\n')[0]));
        }
        const rir2 = page.getByRole('button', { name: /^2$/ });
        if (await rir2.count()) await rir2.first().click({ force: true, timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(300);
        const save = page.getByRole('button', { name: /Guardar Serie/i });
        if (await save.count() && await save.first().isEnabled().catch(() => false)) {
          await save.first().click({ force: true, timeout: 5000 }).catch(e => console.log('guardar fail', e.message.split('\n')[0]));
          console.log(`[${step}] Registrar Serie → reps 10, RIR 2, guardada`);
          lastSig = sig;
          continue;
        } else {
          console.log(`[${step}] Guardar Serie sigue deshabilitado`);
          await shot(page, `04-serie-disabled-${step}`);
        }
      }

      // Prioridad de clicks del player
      const prio = [
        /Guardar Serie/i,
        /Comenzar Entrenamiento Principal/i,
        /^Finalizar( entrenamiento| sesión)?$/i,
        /Guardar y continuar/i,
        /Serie completada|Completar serie/i,
        /^Completar( ejercicio)?$/i,
        /Siguiente ejercicio/i,
        /^Continuar$/i,
        /^Comenzar$/i,
        /^Iniciar$/i,
        /^Empezar$/i,
        /^Siguiente$/i,
        /^Listo$/i,
        /^Hecho$/i,
        /Saltar descanso/i,
        /Omitir descanso/i,
        /^(Fácil|Óptimo|Bien|Normal)$/i,
        /Guardar valoración/i,
        /^Enviar$/i
      ];
      let clicked = null;
      for (const rx of prio) {
        const b = page.getByRole('button', { name: rx });
        const cnt = await b.count();
        if (cnt) {
          const el = b.first();
          if (await el.isEnabled().catch(() => false)) {
            clicked = (await el.textContent() || '').trim();
            await el.click().catch(e => console.log('click fail', e.message.split('\n')[0]));
            break;
          }
        }
      }

      // RIR / esfuerzo: botones numéricos 0-4 en un modal
      if (!clicked) {
        const rirBtn = page.getByRole('button', { name: /^[0-4]$/ });
        if (await rirBtn.count() >= 3) {
          await rirBtn.nth(2).click();
          clicked = 'RIR~2';
        }
      }

      if (!clicked) {
        // ¿Temporizador en marcha (Pausar visible) o descanso? → avanzar reloj
        if (btns.some(b => /Pausar|Descanso/i.test(b)) || /Descanso|0:\d\d/.test(txt)) {
          if (NO_CLOCK) {
            const m0 = txt.match(/Ejercicio (\d+) de (\d+)/);
            console.log(`[${step}] esperando timer real ej=${m0 ? m0[1] : '?'}`);
            await page.waitForTimeout(5000);
            lastSig = sig;
            continue;
          }
          await page.clock.fastForward(20000);
          // simular actividad del usuario para no disparar el logout por inactividad
          await page.mouse.move(180 + (step % 30), 60).catch(() => {});
          const m = txt.match(/Ejercicio (\d+) de (\d+)/);
          const s = txt.match(/Serie (\d+)\s*\/?\s*(?:de )?(\d+)/);
          console.log(`[${step}] fastForward 20s  ej=${m ? m[1] + '/' + m[2] : '?'} serie=${s ? s[1] + '/' + s[2] : '?'} btns=${JSON.stringify(btns.slice(0, 8))}`);
          if (step % 40 === 0) await shot(page, `04-ff-${step}`);
          stuckCount = 0;
          lastSig = sig;
          continue;
        }
        console.log(`\n[${step}] SIN BOTON CONOCIDO. Botones:`, JSON.stringify(btns.slice(0, 25)));
        console.log('TXT:', txt.slice(0, 900));
        await shot(page, `04-stuck-${step}`);
        stuckCount = sig === lastSig ? stuckCount + 1 : 0;
        if (stuckCount >= 2) break;
      } else {
        stuckCount = 0;
        console.log(`[${step}] click: ${clicked}`);
        if (step % 5 === 0) await shot(page, `04-step-${String(step).padStart(2, '0')}`);
      }
      lastSig = sig;
    }

    await shot(page, '04-final');
    console.log('\n=== FINAL ===');
    console.log((await short()).slice(0, 1500));
    await saveState(context);
  } finally {
    report(issues);
    await browser.close();
  }
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
