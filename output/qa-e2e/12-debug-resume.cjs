// Debug: qué pasa en el DOM al pulsar "Reanudar Entrenamiento" (sábado real)
const { launch, shot, report, BASE } = require('./lib.cjs');

(async () => {
  const { browser, page, issues } = await launch({ speed: true, useState: false });
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
    for (let i = 0; i < 15; i++) {
      await page.waitForTimeout(3000);
      if (await page.getByRole('button', { name: /Reanudar Entrenamiento/i }).count()) break;
    }
    console.log('ANTES:', (await short()).slice(0, 250));

    await page.getByRole('button', { name: /Reanudar Entrenamiento/i }).first().click();
    console.log('CLICK Reanudar (1º)');
    await page.waitForTimeout(4000);

    const dom = await page.evaluate(() => {
      const overlays = [...document.querySelectorAll('div')].filter(d => {
        const s = getComputedStyle(d);
        return s.position === 'fixed' && s.zIndex !== 'auto';
      });
      return {
        overlays: overlays.map(d => ({
          z: getComputedStyle(d).zIndex,
          visible: d.offsetHeight > 0 && getComputedStyle(d).visibility !== 'hidden' && getComputedStyle(d).opacity !== '0',
          h: d.offsetHeight,
          txt: (d.innerText || '').slice(0, 80).replace(/\n+/g, ' | ')
        })),
        hasWarmupText: /calentamiento/i.test(document.body.innerText)
      };
    });
    console.log('DOM tras click:', JSON.stringify(dom, null, 1));
    await shot(page, '12-tras-click');
    console.log('TXT:', (await short()).slice(0, 400));
  } finally {
    report(issues);
    await browser.close();
  }
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
