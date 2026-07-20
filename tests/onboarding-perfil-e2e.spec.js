import { test, expect } from '@playwright/test';

/**
 * F5 (ONB-P2-06) — Gate E2E del recorrido completo del auditor de Onboarding/Perfil.
 *
 * Recorrido: onboarding con usuario adversarial (sexo Otro + metodología funcional +
 * enfoque HIIT + historial médico + lesión + alergia + medicamento) → Perfil muestra
 * esos valores sin transformarlos → se edita la lesión → la lesión NUEVA persiste como
 * campo canónico → una segunda cuenta NO ve los datos de la primera (aislamiento).
 *
 * ⚠️ SEGURIDAD (nunca prod): este test CREA usuarios reales vía el backend. El backend
 * de este repo apunta por defecto a la BD de PRODUCCIÓN (backend/.env), así que el test
 * se SALTA salvo que se declare explícitamente que se corre contra un stack LOCAL/staging
 * con BD no productiva, mediante `E2E_LOCAL_DB=1`. Igual que el guard fail-closed de
 * db.js para los tests de integración.
 *
 * Cómo correrlo (local): levanta una BD no productiva (arnés efímero
 * `scripts/arch002-test-db.ps1`, Docker 127.0.0.1:55432), arranca el backend apuntando
 * a ella y el frontend (preview 4173), y ejecuta:
 *   E2E_LOCAL_DB=1 E2E_BASE_URL=http://localhost:4173 npx playwright test --project=onboarding-e2e
 *
 * Gotcha M-04 (doc 03, NO se arregla aquí): `npm --prefix backend start` desde la raíz
 * puede no ver las variables por carga tardía de dotenv. Workaround: arrancar el backend
 * desde `backend/` (o con `npm run dev:backend`, que carga el entorno correctamente).
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:4173';
const LOCAL_DB_OK = process.env.E2E_LOCAL_DB === '1';

// Email único por corrida sin depender de Date.now()/Math.random (deterministas por PID+contador).
let __seq = 0;
const uniqueEmail = (tag) => `e2e_${tag}_${process.pid}_${++__seq}@local.test`;

const ADVERSARIAL = {
  nombre: 'Adversario',
  apellido: 'Auditor',
  password: 'QaTest1234!',
  edad: '34',
  sexo: 'otro',
  peso: '82',
  altura: '181',
  metodologia: 'funcional',
  enfoque: 'hiit',
  objetivo: 'perder_peso',
  historial: 'Hipertensión controlada; cirugía de menisco 2019',
  lesion: 'rodilla',
  alergia: 'Lactosa',
  medicamento: 'Enalapril'
};

// Rellena un input/select controlado por React (setter nativo + eventos).
async function setField(page, name, value, tag = 'input') {
  await page.evaluate(({ name, value, tag }) => {
    const el = globalThis.document.querySelector(`[name="${name}"]`);
    if (!el) throw new Error(`campo no encontrado: ${name}`);
    const proto = tag === 'select'
      ? globalThis.HTMLSelectElement.prototype
      : globalThis.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    el.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
    el.dispatchEvent(new globalThis.Event('change', { bubbles: true }));
  }, { name, value, tag });
}

async function clickButtonByText(page, text) {
  await page.getByRole('button', { name: text, exact: true }).first().click();
}

async function registerAdversarialUser(page, email) {
  await page.goto(`${BASE_URL}/register`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Registrarse' }).first().click().catch(() => {});

  // Paso Básicos
  await setField(page, 'nombre', ADVERSARIAL.nombre);
  await setField(page, 'apellido', ADVERSARIAL.apellido);
  await setField(page, 'email', email);
  await setField(page, 'password', ADVERSARIAL.password);
  await setField(page, 'edad', ADVERSARIAL.edad);
  await setField(page, 'sexo', ADVERSARIAL.sexo, 'select');
  await setField(page, 'peso', ADVERSARIAL.peso);
  await setField(page, 'altura', ADVERSARIAL.altura);
  await setField(page, 'metodologiaPreferida', ADVERSARIAL.metodologia, 'select');
  await clickButtonByText(page, 'Siguiente');

  // Paso Composición (opcional) → avanzar
  await clickButtonByText(page, 'Siguiente');

  // Paso Salud
  await setField(page, 'historialMedico', ADVERSARIAL.historial, 'input').catch(async () => {
    // historial puede ser textarea
    await setField(page, 'historialMedico', ADVERSARIAL.historial, 'input');
  });
  // limitaciones/alergias/medicamentos usan TagsInput: se teclea + Enter.
  await addTag(page, 'limitacionesFisicas', ADVERSARIAL.lesion);
  await addTag(page, 'alergias', ADVERSARIAL.alergia);
  await addTag(page, 'medicamentos', ADVERSARIAL.medicamento);
  await clickButtonByText(page, 'Siguiente');

  // Paso Objetivos
  await setField(page, 'objetivoPrincipal', ADVERSARIAL.objetivo, 'select');
  await setField(page, 'enfoqueEntrenamiento', ADVERSARIAL.enfoque, 'select');
  await page.locator('[name="acceptTerms"]').check();
  await clickButtonByText(page, 'Guardar Perfil');

  // Auto-login → navega fuera de /register.
  await page.waitForURL((url) => !url.pathname.includes('/register'), { timeout: 15000 });
}

// TagsInput no siempre expone name; se localiza por el placeholder/etiqueta cercana.
async function addTag(page, fieldName, value) {
  const input = page.locator(`[name="${fieldName}"]`).first();
  if (await input.count()) {
    await input.fill(value);
    await input.press('Enter');
  }
}

test.describe('F5 · Recorrido completo Onboarding→Perfil (adversarial)', () => {
  test.skip(!LOCAL_DB_OK,
    'Requiere stack LOCAL con BD no productiva. Exporta E2E_LOCAL_DB=1 (nunca contra prod).');

  test('adversarial: alta → Perfil representa los valores → edita lesión → aislamiento', async ({ page, context }) => {
    const emailA = uniqueEmail('a');

    // 1) Alta adversarial.
    await registerAdversarialUser(page, emailA);

    // 2) Perfil representa los valores sin transformarlos.
    await page.goto(`${BASE_URL}/perfil`, { waitUntil: 'domcontentloaded' }).catch(async () => {
      await page.goto(`${BASE_URL}/profile`, { waitUntil: 'domcontentloaded' });
    });
    // Sexo "Otro", metodología "Entrenamiento Funcional", enfoque "HIIT" (no "Pérdida de Peso").
    await expect(page.getByText('Otro', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('Entrenamiento Funcional', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('HIIT', { exact: false }).first()).toBeVisible();
    // Historial médico visible (F1), lesión, alergia y medicamento.
    await page.getByRole('button', { name: /Salud/i }).first().click().catch(() => {});
    await expect(page.getByText(ADVERSARIAL.lesion, { exact: false }).first()).toBeVisible();
    await expect(page.getByText(ADVERSARIAL.alergia, { exact: false }).first()).toBeVisible();
    await expect(page.getByText(ADVERSARIAL.medicamento, { exact: false }).first()).toBeVisible();
    await expect(page.getByText(/menisco/i).first()).toBeVisible();

    // 3) Edita la lesión a una NUEVA (rodilla → hombro) y guarda; verifica que persiste
    //    como campo canónico limitaciones_fisicas vía la API (input real del motor).
    const token = await page.evaluate(() =>
      globalThis.localStorage.getItem('authToken') || globalThis.localStorage.getItem('token'));
    const userId = await page.evaluate(() => {
      for (const k of ['user', 'userProfile', 'userData']) {
        try {
          const p = JSON.parse(globalThis.localStorage.getItem(k) || 'null');
          const id = p?.id ?? p?.user?.id;
          if (id) return id;
        } catch { /* noop */ }
      }
      return null;
    });
    expect(token, 'token de sesión').toBeTruthy();
    expect(userId, 'id de usuario').toBeTruthy();

    const putResp = await page.evaluate(async ({ userId, token }) => {
      const r = await globalThis.fetch(`/api/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ limitaciones_fisicas: ['hombro'] })
      });
      return { ok: r.ok, body: await r.json() };
    }, { userId, token });
    expect(putResp.ok).toBeTruthy();
    // El motor lee limitaciones_fisicas (canónico). La lesión NUEVA está; la vieja no.
    const limit = JSON.stringify(putResp.body?.user?.limitaciones_fisicas ?? []);
    expect(limit).toContain('hombro');
    expect(limit).not.toContain('rodilla');

    // 4) Aislamiento: una segunda cuenta no ve datos de la primera.
    const page2 = await context.newPage();
    const emailB = uniqueEmail('b');
    await registerAdversarialUser(page2, emailB);
    await page2.goto(`${BASE_URL}/perfil`, { waitUntil: 'domcontentloaded' }).catch(async () => {
      await page2.goto(`${BASE_URL}/profile`, { waitUntil: 'domcontentloaded' });
    });
    // El email de la cuenta A no debe aparecer en el Perfil de B.
    await expect(page2.getByText(emailA, { exact: false })).toHaveCount(0);
  });
});
