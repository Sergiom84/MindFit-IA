// Paso 3: aceptar entrenamiento suelto de hoy (sábado) y explorar el player
const { launch, shot, saveState, report, BASE } = require('./lib.cjs');

(async () => {
  const { browser, context, page, issues } = await launch();
  const dump = async (tag, len = 1500) => {
    const t = (await page.locator('body').innerText()).replace(/\n+/g, ' | ').slice(0, len);
    console.log(`\n=== ${tag} ===\n${t}`);
  };
  try {
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.getByText('Métodos', { exact: true }).last().click();
    await page.waitForTimeout(2500);

    // Seleccionar Calistenia otra vez → modal fin de semana
    const btn = page.getByRole('button', { name: /Seleccionar/ });
    const n = await btn.count();
    for (let i = 0; i < n; i++) {
      const b = btn.nth(i);
      const inCal = await b.evaluate(el => {
        let p = el; for (let k = 0; k < 6 && p; k++) { p = p.parentElement; if (p && /Calistenia/i.test(p.innerText) && p.innerText.length < 2000) return true; }
        return false;
      });
      if (inCal) { await b.click(); break; }
    }
    await page.waitForTimeout(2000);
    await shot(page, '03-modal-sabado');

    // Aceptar entrenamiento para hoy
    await page.getByRole('button', { name: /Aceptar entrenamiento para hoy/i }).click();
    console.log('CLICK aceptar entrenamiento hoy');

    // La generación puede tardar (IA) — esperar hasta 120s a que cambie la UI
    for (let i = 0; i < 24; i++) {
      await page.waitForTimeout(5000);
      const txt = await page.locator('body').innerText();
      if (!/Generando|Analizamos|Cargando|Preparando/i.test(txt.slice(0, 3000)) || i === 23) {
        console.log('iteracion', i);
        break;
      }
    }
    await shot(page, '03-tras-generacion');
    await dump('TRAS GENERACION', 2500);

    const buttons = await page.getByRole('button').allTextContents();
    console.log('BOTONES:', JSON.stringify(buttons.slice(0, 40)));

    await saveState(context);
  } finally {
    report(issues);
    await browser.close();
  }
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
