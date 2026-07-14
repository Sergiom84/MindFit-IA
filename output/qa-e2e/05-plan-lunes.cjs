// Paso 5: con reloj falseado en LUNES 13/07, generar plan completo manual de Calistenia (principiante)
const { launch, shot, saveState, report, BASE } = require('./lib.cjs');

const MONDAY = process.argv[2] || '2026-07-13T08:00:00';

(async () => {
  const { browser, context, page, issues } = await launch({ clockAt: MONDAY });
  const dump = async (tag, len = 1500) => {
    const t = (await page.locator('body').innerText()).replace(/\n+/g, ' | ').slice(0, len);
    console.log(`\n=== ${tag} ===\n${t}`);
  };
  const clickBtn = async (rx, label) => {
    const b = page.getByRole('button', { name: rx });
    if (await b.count()) {
      console.log('CLICK', label || rx);
      await b.first().click({ timeout: 8000 }).catch(e => console.log('fail click', e.message.split('\n')[0]));
      return true;
    }
    return false;
  };
  try {
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(4000);
    if (/Accede a tu cuenta/i.test(await page.locator('body').innerText())) {
      console.log('re-login');
      await page.locator('input[type="email"], input[name="email"]').first().fill('lucia.ferrero.qa@entrenaconia-test.com');
      await page.locator('input[type="password"]').first().fill('QaCalis2026!');
      await page.getByRole('button', { name: /^Iniciar Sesión$/ }).last().click();
      await page.waitForTimeout(5000);
    }
    await dump('DASHBOARD LUNES', 900);
    await shot(page, '05-dashboard-lunes');

    await page.getByText('Métodos', { exact: true }).last().click();
    await page.waitForTimeout(2500);

    // Seleccionar Calistenia
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
    await page.waitForTimeout(2500);
    await shot(page, '05-modal-calistenia-lunes');
    await dump('MODAL CALISTENIA LUNES', 2000);
    console.log('BOTONES:', JSON.stringify((await page.getByRole('button').allTextContents()).filter(Boolean).slice(0, 30)));

    // Esperar a que la evaluación IA termine (éxito o error) y pasar a selección manual
    for (let i = 0; i < 12; i++) {
      const t = await page.locator('body').innerText();
      if (/Elegir Nivel Manualmente|Selecciona tu nivel actual/i.test(t)) break;
      await page.waitForTimeout(2500);
    }
    await clickBtn(/Elegir Nivel Manualmente/i, 'Elegir Nivel Manualmente');
    await page.waitForTimeout(1500);
    await dump('TRAS ELEGIR MANUAL', 2000);
    await shot(page, '05-manual-niveles');
    console.log('BOTONES:', JSON.stringify((await page.getByRole('button').allTextContents()).filter(Boolean).slice(0, 30)));

    // Elegir nivel principiante (tarjeta div, no button)
    const levelCard = page.locator('h4', { hasText: /Principiante/i }).first();
    if (await levelCard.count()) {
      await levelCard.scrollIntoViewIfNeeded().catch(() => {});
      await levelCard.click();
      console.log('CLICK tarjeta nivel Principiante');
    } else console.log('NO encontré tarjeta Principiante');
    await page.waitForTimeout(1200);
    await shot(page, '05-nivel-elegido');

    // Generar
    await clickBtn(/Generar Plan Manual/i, 'Generar Plan Manual');

    // esperar generación (hasta 3 min)
    for (let i = 0; i < 36; i++) {
      await page.waitForTimeout(5000);
      const t = await page.locator('body').innerText();
      if (/Confirmar|Plan generado|semanas|Empezar|Comenzar plan|Aceptar/i.test(t) && !/Generando/i.test(t.slice(0, 2000))) break;
    }
    await shot(page, '05-tras-generar');
    await dump('TRAS GENERAR', 2500);
    console.log('BOTONES:', JSON.stringify((await page.getByRole('button').allTextContents()).filter(Boolean).slice(0, 30)));

    await saveState(context);
  } finally {
    report(issues);
    await browser.close();
  }
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
