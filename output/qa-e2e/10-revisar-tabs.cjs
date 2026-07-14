// Revisa pestañas Hoy/Calendario/Progreso/Historial con fecha falseada.
// Uso: node 10-revisar-tabs.cjs 2026-09-05
const { launch, shot, report, BASE } = require('./lib.cjs');
const jwt = require('C:/Users/sergi/Desktop/Aplicaciones/Entrenaconia/backend/node_modules/jsonwebtoken');
require('dotenv').config({ path: 'C:/Users/sergi/Desktop/Aplicaciones/Entrenaconia/backend/.env' });

const DATE = process.argv[2] || '2026-09-05';
const TAG = DATE.replaceAll('-', '');

(async () => {
  const { browser, page, issues } = await launch({ dateAt: `${DATE}T10:00:00`, useState: false });
  const short = async () => (await page.locator('body').innerText()).replace(/\n+/g, ' | ');
  try {
    // Token de larga duración (la fecha falseada haría expirar el JWT de 7 días)
    const fakeNowSec = Math.floor(new Date(`${DATE}T09:00:00`).getTime() / 1000);
    const token = jwt.sign(
      { userId: 1075, email: 'lucia.ferrero.qa@entrenaconia-test.com', iat: fakeNowSec, exp: fakeNowSec + 7 * 86400 },
      process.env.JWT_SECRET
    );
    await page.addInitScript(([t]) => {
      localStorage.setItem('authToken', t);
      localStorage.setItem('token', t);
      localStorage.setItem('user', JSON.stringify({ id: 1075, email: 'lucia.ferrero.qa@entrenaconia-test.com', nombre: 'Lucía' }));
    }, [token]);
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(6000);
    console.log('=== DASHBOARD ===');
    console.log((await short()).slice(0, 900));
    await shot(page, `10-${TAG}-dashboard`);

    await page.getByText('Rutinas', { exact: true }).last().click();
    // esperar carga
    for (let i = 0; i < 15; i++) {
      await page.waitForTimeout(3000);
      const t = await page.locator('body').innerText();
      if (!/Cargando plan/i.test(t)) break;
    }
    console.log('\n=== HOY ===');
    console.log((await short()).slice(0, 1200));
    await shot(page, `10-${TAG}-hoy`);

    for (const tab of ['Calendario', 'Progreso', 'Historial']) {
      const t = page.getByText(tab, { exact: true });
      if (await t.count()) {
        await t.last().click();
        await page.waitForTimeout(5000);
        console.log(`\n=== ${tab.toUpperCase()} ===`);
        console.log((await short()).slice(0, 2200));
        await shot(page, `10-${TAG}-${tab.toLowerCase()}`);
        // en calendario, avanzar un par de meses hacia atrás/adelante si hay flechas
        if (tab === 'Calendario') {
          const prev = page.getByRole('button', { name: /anterior|</i });
          if (await prev.count()) {
            await prev.first().click();
            await page.waitForTimeout(2000);
            console.log('\n--- CALENDARIO mes anterior ---');
            console.log((await short()).slice(0, 1400));
            await shot(page, `10-${TAG}-calendario-prev`);
          }
        }
      } else {
        console.log(`(pestaña ${tab} no encontrada)`);
      }
    }
  } finally {
    report(issues);
    await browser.close();
  }
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
