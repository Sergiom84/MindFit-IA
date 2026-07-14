// Debug: qué pasa exactamente al pulsar "Comenzar Entrenamiento Principal"
const { launch, shot, report, BASE } = require('./lib.cjs');

(async () => {
  const { browser, page, issues } = await launch({ dateAt: '2026-07-13T08:00:00', speed: true, useState: false });
  const short = async () => (await page.locator('body').innerText()).replace(/\n+/g, ' | ');
  try {
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(4000);
    if (/Accede a tu cuenta/i.test(await page.locator('body').innerText())) {
      await page.locator('input[type="email"]').first().fill('lucia.ferrero.qa@entrenaconia-test.com');
      await page.locator('input[type="password"]').first().fill('QaCalis2026!');
      await page.getByRole('button', { name: /^Iniciar Sesión$/ }).last().click();
      await page.waitForTimeout(5000);
    }
    await page.getByText('Rutinas', { exact: true }).last().click();

    // Esperar a que la pestaña Hoy muestre el CTA (hasta 60s)
    let started = false;
    for (let i = 0; i < 20 && !started; i++) {
      await page.waitForTimeout(3000);
      const txt = await short();
      if (i % 4 === 0) console.log(`[hoy ${i}]`, txt.slice(0, 250));
      for (const rx of [/Iniciar Entrenamiento/i, /Iniciar sesión de hoy/i, /Reanudar/i, /Continuar entrenamiento/i]) {
        const b = page.getByRole('button', { name: rx });
        if (await b.count()) { console.log('CLICK', rx); await b.first().click(); started = true; break; }
      }
    }
    if (!started) { console.log('NO CTA de inicio. TXT:', (await short()).slice(0, 800)); await shot(page, '08-sin-cta'); return; }
    await page.waitForTimeout(3000);

    // Completar calentamiento con clicks Comenzar/Siguiente
    for (let i = 0; i < 30; i++) {
      const txt = await short();
      if (/Comenzar Entrenamiento Principal/i.test(txt)) break;
      let did = false;
      for (const rx of [/^Comenzar$/, /^Siguiente$/]) {
        const b = page.getByRole('button', { name: rx });
        if (await b.count() && await b.first().isEnabled().catch(() => false)) {
          await b.first().click({ force: true }).catch(() => {});
          did = true; break;
        }
      }
      if (!did) await page.waitForTimeout(1500);
    }
    console.log('=== EN PANTALLA FINAL DE WARMUP ===');
    await shot(page, '08-antes-click');

    // UN solo click
    await page.getByRole('button', { name: /Comenzar Entrenamiento Principal/i }).first().click({ force: true });
    console.log('CLICK único en Comenzar Entrenamiento Principal');

    for (const wait of [2000, 4000, 6000]) {
      await page.waitForTimeout(wait);
      const overlays = await page.evaluate(() => {
        const els = [...document.querySelectorAll('div')].filter(d => {
          const s = getComputedStyle(d);
          return s.position === 'fixed' && d.offsetHeight > 200 && s.zIndex !== 'auto';
        });
        return els.map(d => ({
          z: getComputedStyle(d).zIndex,
          txt: (d.innerText || '').slice(0, 120).replace(/\n+/g, ' | ')
        }));
      });
      console.log(`\n--- tras espera ---`);
      console.log('OVERLAYS:', JSON.stringify(overlays, null, 1));
      console.log('TXT:', (await short()).slice(0, 400));
    }
    await shot(page, '08-despues-click');
  } finally {
    report(issues);
    await browser.close();
  }
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
