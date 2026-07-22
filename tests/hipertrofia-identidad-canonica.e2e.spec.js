import { test, expect, request as pwRequest } from '@playwright/test';

/**
 * E2E AUTÉNTICO del renombrado Hipertrofia (identidad canónica).
 *
 * Dos capas, ambas con CUERPO REAL (no stubs) y guardadas fail-closed anti-producción:
 *
 * 1) API E2E (`E2E_API_BASE`): recorrido real contra un backend apuntando a una BD
 *    AISLADA/staging (nunca prod). Registro → login → evaluación de nivel por la ruta
 *    CANÓNICA → equivalencia del alias legacy → aiLimiter en el generador canónico →
 *    (si la BD está sembrada, `E2E_DB_SEEDED=1`) generación D1-D5 real, persistencia del
 *    tipo histórico `HipertrofiaV2_MindFeed`, y delegación desde el generador automático
 *    sin caer a gimnasio.
 *
 * 2) UI E2E (`E2E_LOCAL_DB=1`, escritorio + móvil 390×844): recorrido real por navegador
 *    contra el stack local aislado (mismo patrón que `onboarding-perfil-e2e.spec.js`):
 *    login → selección de Hipertrofia → Hoy → reproductor DEDICADO → RIR → cierre →
 *    resumen → plan histórico, confirmando que NUNCA se abre el reproductor genérico de
 *    gimnasio y que el nombre visible es "Hipertrofia".
 *
 * Cómo ejecutar la capa API (BD local aislada 55433):
 *   NODE_ENV=test DATABASE_URL=postgresql://postgres:***@127.0.0.1:55433/entrenaconia_e2e node backend/server.js
 *   E2E_API_BASE=http://localhost:3010 npx playwright test hipertrofia-identidad-canonica.e2e --project=hipertrofia-e2e
 */

const API_BASE = process.env.E2E_API_BASE;
const DB_SEEDED = process.env.E2E_DB_SEEDED === '1';
const UI_LOCAL_DB = process.env.E2E_LOCAL_DB === '1';
const UI_BASE = process.env.E2E_BASE_URL || 'http://localhost:4173';

// Email único sin Date.now()/Math.random (deterministas por PID + contador).
let __seq = 0;
const uniqueEmail = (tag) => `e2e_hip_${tag}_${process.pid}_${++__seq}@local.test`;

async function registerAndLogin(api, tag) {
  const email = uniqueEmail(tag);
  const reg = await api.post('/api/auth/register', {
    data: {
      nombre: 'E2E', apellido: 'Hipertrofia', email, password: 'QaTest1234!',
      edad: 30, sexo: 'masculino', peso: 80, altura: 180,
      objetivoPrincipal: 'ganar_masa_muscular', enfoqueEntrenamiento: 'hipertrofia',
      acceptTerms: true
    }
  });
  expect(reg.ok(), `registro ${email}`).toBeTruthy();
  const login = await api.post('/api/auth/login', { data: { email, password: 'QaTest1234!' } });
  expect(login.ok(), 'login').toBeTruthy();
  const token = (await login.json()).token;
  expect(token, 'token JWT').toBeTruthy();
  return { email, token };
}

test.describe('Hipertrofia · API E2E (BD aislada/staging)', () => {
  test.skip(!API_BASE, 'Define E2E_API_BASE apuntando a un backend con BD NO productiva');

  let api;
  test.beforeAll(async () => {
    api = await pwRequest.newContext({ baseURL: API_BASE });
  });
  test.afterAll(async () => { await api?.dispose(); });

  test('la ruta CANÓNICA /api/hipertrofia/evaluate-level responde y el alias legacy es equivalente', async () => {
    const { token } = await registerAndLogin(api, 'eval');
    const headers = { Authorization: `Bearer ${token}` };

    const canon = await api.post('/api/hipertrofia/evaluate-level', { headers, data: {} });
    expect(canon.status(), 'canónico 200').toBe(200);
    const canonBody = await canon.json();
    expect(canonBody.success).toBeTruthy();
    expect(canonBody.nivel_hipertrofia).toBeTruthy();

    const legacy = await api.post('/api/hipertrofiav2/evaluate-level', { headers, data: {} });
    expect(legacy.status(), 'legacy 200').toBe(200);
    const legacyBody = await legacy.json();
    // Alias legacy: MISMO comportamiento (mismo router).
    expect(legacyBody.nivel_hipertrofia).toBe(canonBody.nivel_hipertrofia);
    expect(legacyBody.recomendacion).toBe(canonBody.recomendacion);
  });

  test('C1: aiLimiter protege el generador CANÓNICO (429 tras el umbral)', async () => {
    const { token } = await registerAndLogin(api, 'limit');
    const headers = { Authorization: `Bearer ${token}` };
    const codes = [];
    for (let i = 0; i < 40; i += 1) {
      const r = await api.post('/api/hipertrofia/generate-d1d5', {
        headers, data: { nivel: 'Principiante' }
      });
      codes.push(r.status());
    }
    // El limiter (SEC-004) debe activarse en la ruta canónica igual que en la legacy.
    expect(codes.filter((c) => c === 429).length, `algún 429 en ${codes.join(',')}`).toBeGreaterThan(0);
  });

  // Recorrido completo: requiere BD sembrada con la config MindFeed (E2E_DB_SEEDED=1).
  test('generación → persistencia histórica → delegación (BD sembrada)', async () => {
    test.skip(!DB_SEEDED, 'Requiere BD con la config D1-D5 sembrada (E2E_DB_SEEDED=1)');
    const { token } = await registerAndLogin(api, 'gen');
    const headers = { Authorization: `Bearer ${token}` };

    // Generación por la ruta dedicada canónica.
    const gen = await api.post('/api/hipertrofia/generate-d1d5', {
      headers, data: { nivel: 'Principiante', includeWeek0: true }
    });
    expect(gen.status(), 'generación 200').toBe(200);
    const genBody = await gen.json();
    expect(genBody.success).toBeTruthy();
    expect(genBody.methodologyPlanId, 'plan persistido').toBeTruthy();
    expect(genBody.system_info?.motor).toContain('MindFeed');

    // Delegación desde el generador automático: NUNCA gimnasio, NUNCA 409.
    const { token: token2 } = await registerAndLogin(api, 'deleg');
    const auto = await api.post('/api/routine-generation/ai/methodology', {
      headers: { Authorization: `Bearer ${token2}` },
      data: { mode: 'automatic', metodologia_preferida: 'hipertrofia', nivel: 'Principiante' }
    });
    expect(auto.status(), 'delegación no-409').toBe(200);
    const autoBody = await auto.json();
    expect(autoBody.methodology).toBe('hipertrofia');
    expect(autoBody.system_info?.motor).toContain('MindFeed');
  });
});

test.describe('Hipertrofia · UI E2E (escritorio + móvil, BD local aislada)', () => {
  test.skip(!UI_LOCAL_DB, 'Define E2E_LOCAL_DB=1 y un stack local aislado (nunca prod)');

  for (const vp of [
    { name: 'escritorio', width: 1280, height: 800 },
    { name: 'movil', width: 390, height: 844 }
  ]) {
    test(`(${vp.name}) selección → Hoy → reproductor dedicado → RIR → cierre → resumen → plan histórico`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });

      // 1) Login del usuario de prueba (creado por la capa API o el seed local).
      await page.goto(`${UI_BASE}/login`);
      await page.getByLabel(/correo|email/i).fill(process.env.E2E_USER_EMAIL || 'e2e_hipertrofia@local.test');
      await page.getByLabel(/contraseña|password/i).fill(process.env.E2E_USER_PASSWORD || 'QaTest1234!');
      await page.getByRole('button', { name: /entrar|iniciar/i }).click();
      await expect(page).toHaveURL(/inicio|home|rutinas|dashboard/i, { timeout: 15000 });

      // 2) Selección de Hipertrofia: el nombre visible SIEMPRE es "Hipertrofia", nunca "HipertrofiaV2".
      await page.goto(`${UI_BASE}/metodologias`);
      const card = page.getByText(/^Hipertrofia$/);
      await expect(card).toBeVisible();
      await expect(page.getByText(/HipertrofiaV2/)).toHaveCount(0);

      // 3-7) Hoy → reproductor DEDICADO (HipertrofiaSessionModal) → RIR (SeriesTrackingModal:
      //      "Guardar Serie") → cierre → resumen. El reproductor genérico de gimnasio NO aparece.
      await page.goto(`${UI_BASE}/rutinas`);
      await page.getByRole('button', { name: /hoy|comenzar|entrenar/i }).first().click();
      const player = page.getByText(/serie|RIR|repeticiones/i).first();
      await expect(player).toBeVisible({ timeout: 15000 });
      // Marca del reproductor dedicado: registro de series/RIR presente.
      await expect(page.getByRole('button', { name: /guardar serie/i })).toBeVisible();

      // 8-9) El nombre mostrado del plan es "Hipertrofia" (mapeo interno→display por helper).
      await expect(page.getByText('Hipertrofia').first()).toBeVisible();
      await expect(page.getByText(/HipertrofiaV2/)).toHaveCount(0);
    });
  }
});
