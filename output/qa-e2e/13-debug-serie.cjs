// Debug: estado real del modal "Registrar Serie"
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
    await page.getByRole('button', { name: /Reanudar Entrenamiento/i }).first().click();
    await page.waitForTimeout(3000);

    // Completar/saltar warmup y esperar al modal de registro (timer real de 45s)
    for (let i = 0; i < 90; i++) {
      const modalBtn = page.getByRole('button', { name: /Guardar Serie/i });
      if (await modalBtn.count()) { console.log('MODAL REGISTRO ABIERTO en iter', i); break; }
      let did = false;
      for (const rx of [/Comenzar Entrenamiento Principal/i, /^Comenzar$/, /^Siguiente$/, /Saltar calentamiento/i]) {
        const b = page.getByRole('button', { name: rx });
        if (await b.count() && await b.first().isEnabled().catch(() => false)) {
          await b.first().click({ force: true }).catch(() => {});
          did = true; break;
        }
      }
      if (!did) await page.waitForTimeout(2000);
    }

    await shot(page, '13-registrar');
    const modal = await page.evaluate(() => {
      const inputs = [...document.querySelectorAll('input')].map(i => ({
        type: i.type, placeholder: i.placeholder, value: i.value,
        visible: i.offsetHeight > 0
      }));
      const btns = [...document.querySelectorAll('button')].filter(b => /Guardar/i.test(b.innerText)).map(b => ({
        text: b.innerText.trim(), disabled: b.disabled, visible: b.offsetHeight > 0
      }));
      return { inputs, btns };
    });
    console.log('MODAL:', JSON.stringify(modal, null, 1));

    // Rellenar como el walker y observar
    const repsIn = page.locator('input[placeholder="10"]:visible').first();
    if (await repsIn.count()) { await repsIn.fill('10'); console.log('reps rellenado'); }
    await page.waitForTimeout(600);
    const modal2 = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find(b => /Guardar/i.test(b.innerText));
      return { btnDisabled: btn?.disabled, btnText: btn?.innerText.trim() };
    });
    console.log('TRAS RELLENAR:', JSON.stringify(modal2));
    const save = page.getByRole('button', { name: /Guardar Serie/i });
    if (await save.count()) {
      await save.first().evaluate(el => el.click());
      console.log('CLICK Guardar Serie');
      await page.waitForTimeout(3000);
      console.log('TXT tras guardar:', (await short()).slice(0, 300));
      const errs = await page.evaluate(() => [...document.querySelectorAll('p,div')].filter(e => /repeticiones|RIR|error/i.test(e.innerText) && e.children.length === 0).map(e => e.innerText.slice(0, 80)));
      console.log('ERRORES visibles:', JSON.stringify(errs.slice(0, 5)));
    }
    await shot(page, '13-tras-guardar');
  } finally {
    report(issues);
    await browser.close();
  }
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
