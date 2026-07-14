// Paso 1: registro de usuaria principiante
const { launch, shot, saveState, report, BASE } = require('./lib.cjs');

const USER = {
  nombre: 'Lucía', apellido: 'Ferrero',
  email: 'lucia.ferrero.qa@entrenaconia-test.com',
  password: 'QaCalis2026!',
  edad: '27', sexo: 'femenino', peso: '63', altura: '166',
  nivelEntrenamiento: 'principiante', anosEntrenando: '0', frecuenciaSemanal: '3',
  metodologiaPreferida: 'calistenia', nivelActividad: 'ligero',
  cintura: '70', pecho: '88', brazos: '26', muslo: '52', cuello: '32', antebrazos: '22',
  historialMedico: 'Sin antecedentes relevantes',
  limitacionesFisicas: '', alergias: '', medicamentos: '',
  objetivoPrincipal: 'tonificar', metaPeso: '60', metaGrasaCorporal: '22',
  enfoqueEntrenamiento: 'funcional', horarioPreferido: 'tarde',
  suplementacion: 'Ninguna', alimentosExcluidos: ''
};

(async () => {
  const { browser, context, page, issues } = await launch({ useState: false });
  try {
    await page.goto(BASE + '/register', { waitUntil: 'networkidle' });
    await shot(page, '01-register-step1-vacio');

    const fill = async (name, val) => {
      const el = page.locator(`[name="${name}"]`).first();
      if (await el.count() === 0) { console.log('CAMPO NO ENCONTRADO:', name); return; }
      const tag = await el.evaluate(e => e.tagName);
      if (tag === 'SELECT') await el.selectOption(val).catch(async e => console.log('SELECT FAIL', name, e.message.split('\n')[0]));
      else await el.fill(val);
    };

    // Paso 1: Básicos
    for (const k of ['nombre','apellido','email','password','edad','sexo','peso','altura','nivelEntrenamiento','anosEntrenando','frecuenciaSemanal','metodologiaPreferida','nivelActividad']) {
      await fill(k, USER[k]);
    }
    await shot(page, '01-register-step1-relleno');
    await page.getByRole('button', { name: /Siguiente/ }).click();
    await page.waitForTimeout(600);

    // Paso 2: Composición (opcional)
    for (const k of ['cintura','pecho','brazos','muslo','cuello','antebrazos']) await fill(k, USER[k]);
    await shot(page, '01-register-step2-composicion');
    await page.getByRole('button', { name: /Siguiente/ }).click();
    await page.waitForTimeout(600);

    // Paso 3: Salud
    for (const k of ['historialMedico','limitacionesFisicas','alergias','medicamentos']) await fill(k, USER[k]);
    await shot(page, '01-register-step3-salud');
    await page.getByRole('button', { name: /Siguiente/ }).click();
    await page.waitForTimeout(600);

    // Paso 4: Objetivos
    for (const k of ['objetivoPrincipal','metaPeso','metaGrasaCorporal','enfoqueEntrenamiento','horarioPreferido','suplementacion','alimentosExcluidos']) {
      await fill(k, USER[k]);
    }
    // comidasPorDia: select con valores desconocidos → elegir el que contenga "3"
    const comidas = page.locator('[name="comidasPorDia"]');
    if (await comidas.count()) {
      const opts = await comidas.locator('option').allTextContents();
      console.log('OPCIONES comidasPorDia:', JSON.stringify(opts));
      const idx = opts.findIndex(o => /3/.test(o));
      if (idx >= 0) await comidas.selectOption({ index: idx });
    }
    // acceptTerms checkbox
    const terms = page.locator('[name="acceptTerms"]');
    if (await terms.count()) await terms.check().catch(() => terms.click());
    await shot(page, '01-register-step4-objetivos');

    await page.getByRole('button', { name: /Guardar Perfil/ }).click();
    await page.waitForTimeout(4000);
    await shot(page, '01-register-resultado');
    console.log('URL tras registro:', page.url());
    const bodyText = (await page.locator('body').innerText()).slice(0, 500).replace(/\n+/g, ' | ');
    console.log('TEXTO:', bodyText);

    await saveState(context);
  } finally {
    report(issues);
    await browser.close();
  }
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
