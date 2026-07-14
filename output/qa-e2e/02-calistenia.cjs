// Paso 2: Metodologías → manual → Calistenia (nivel principiante) → generar plan
const { launch, shot, saveState, report, BASE } = require('./lib.cjs');

(async () => {
  const { browser, context, page, issues } = await launch();
  const dump = async (tag) => {
    const t = (await page.locator('body').innerText()).replace(/\n+/g, ' | ').slice(0, 1200);
    console.log(`\n=== ${tag} ===\n${t}`);
  };
  try {
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Ir a Métodos (nav inferior)
    await page.getByText('Métodos', { exact: true }).last().click();
    await page.waitForTimeout(2500);
    await shot(page, '02-metodos-pantalla');
    await dump('PANTALLA METODOS');

    // Buscar tarjeta Calistenia y su botón Seleccionar
    const card = page.locator('div,article,section').filter({ hasText: /Calistenia/i }).last();
    // Estrategia: botón "Seleccionar" más cercano a texto Calistenia
    const buttons = await page.getByRole('button').allTextContents();
    console.log('BOTONES VISIBLES:', JSON.stringify(buttons.slice(0, 40)));

    // Scroll hasta Calistenia
    await page.getByText(/^Calistenia$/i).first().scrollIntoViewIfNeeded().catch(() => {});
    await shot(page, '02-card-calistenia');

    // Click en Seleccionar dentro de la tarjeta que contiene "Calistenia"
    const calCard = page.locator('[class*="card"], div').filter({ has: page.getByText(/^Calistenia$/i) });
    let clicked = false;
    for (const sel of ['Seleccionar', 'Elegir', 'Comenzar']) {
      const btn = page.getByRole('button', { name: new RegExp(sel, 'i') });
      const n = await btn.count();
      if (n > 0) {
        // encontrar el botón asociado a la tarjeta Calistenia: probamos por orden en el DOM
        for (let i = 0; i < n; i++) {
          const b = btn.nth(i);
          const cardText = await b.evaluate(el => {
            let p = el; for (let k = 0; k < 6 && p; k++) { p = p.parentElement; if (p && /Calistenia/i.test(p.innerText) && p.innerText.length < 2000) return p.innerText.slice(0, 100); }
            return null;
          });
          if (cardText) { await b.click(); clicked = true; console.log('CLICK Seleccionar en tarjeta:', cardText.replace(/\n/g, ' ')); break; }
        }
      }
      if (clicked) break;
    }
    if (!clicked) { console.log('NO ENCONTRÉ botón Seleccionar de Calistenia'); await dump('SIN BOTON'); }

    await page.waitForTimeout(2500);
    await shot(page, '02-modal-calistenia');
    await dump('MODAL CALISTENIA');

    await saveState(context);
  } finally {
    report(issues);
    await browser.close();
  }
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
