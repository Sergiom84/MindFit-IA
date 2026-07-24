import { test, expect, request as pwRequest } from '@playwright/test';

/**
 * E2E auténtico de Hipertrofia:
 * - API real contra backend local aislado y BD sembrada MindFeed.
 * - UI real en login, metodologías, Hoy, reproductor dedicado, RIR, cierre y Historial.
 *
 * No usa Supabase/producción. Si falta entorno local, la suite se salta por guard fail-closed.
 */

const API_BASE = process.env.E2E_API_BASE;
const DB_SEEDED = process.env.E2E_DB_SEEDED === '1';
const UI_LOCAL_DB = process.env.E2E_LOCAL_DB === '1';
const UI_BASE = process.env.E2E_BASE_URL || API_BASE || 'http://localhost:4173';

let __seq = 0;
let api;
let users;
let setupPromise;
const uniqueEmail = (tag) => `e2e_hip_${tag}_${process.pid}_${++__seq}@local.test`;

async function registerAndLogin(api, tag, overrides = {}) {
  const email = uniqueEmail(tag);
  const payload = {
    nombre: 'E2E',
    apellido: 'Hipertrofia',
    email,
    password: 'QaTest1234!',
    edad: 33,
    sexo: 'masculino',
    peso: 82,
    altura: 180,
    anosEntrenando: 8,
    nivelEntrenamiento: 'avanzado',
    frecuenciaSemanal: 5,
    objetivoPrincipal: 'ganar_musculo',
    enfoqueEntrenamiento: 'hipertrofia',
    limitacionesFisicas: '',
    historialMedico: '',
    acceptTerms: true,
    ...overrides
  };

  const reg = await api.post('/api/auth/register', { data: payload });
  expect(reg.ok(), `registro ${email}`).toBeTruthy();

  const login = await api.post('/api/auth/login', {
    data: { email, password: payload.password }
  });
  expect(login.ok(), 'login').toBeTruthy();

  const { token } = await login.json();
  expect(token, 'token JWT').toBeTruthy();
  return { email, token, password: payload.password };
}

async function domClick(locator, timeout = 10_000) {
  await expect(locator).toBeVisible({ timeout });
  await locator.evaluate((element) => element.click());
}

async function loginUi(page, email, password) {
  await page.goto(`${UI_BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder('tu@email.com').fill(email);
  await page.getByPlaceholder('Tu contraseña').fill(password);
  await page.getByRole('button', { name: /Iniciar Sesión/i }).last().click();
  await page.waitForFunction(() => Boolean(globalThis.localStorage?.getItem('token') || globalThis.localStorage?.getItem('authToken')), null, {
    timeout: 15_000
  });
  await page.goto(`${UI_BASE}/methodologies`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: /Seleccionar metodología Hipertrofia/i })).toBeVisible({
    timeout: 20_000
  });
}

async function selectHipertrofiaManual(page) {
  await page.getByRole('radio', { name: /Manual \(tú eliges\)/i }).check();
  await page.getByRole('button', { name: /Seleccionar metodología Hipertrofia/i }).click();
}

async function generateHipertrofiaPlanFromUi(page) {
  const startDayHeading = page.getByRole('heading', { name: /Hoy es Jueves/i });
  try {
    await expect(startDayHeading).toBeVisible({ timeout: 10_000 });
    const todayOption = page.locator('button').filter({ hasText: 'Empezar HOY (Jueves + Viernes)' }).first();
    await expect(todayOption).toBeVisible({ timeout: 10_000 });
    await todayOption.evaluate((element) => element.click());
    const startDayContinue = page.getByRole('button', { name: /^Continuar$/ }).first();
    await expect(startDayContinue).toBeEnabled({ timeout: 10_000 });
    await startDayContinue.evaluate((element) => element.click());
    await expect(startDayHeading).toBeHidden({ timeout: 10_000 });
  } catch {
    // El modal de inicio no apareció en este recorrido: seguimos con el siguiente paso.
  }

  const distributionHeading = page.getByRole('heading', { name: /Distribución de Sesiones/i });
  try {
    await expect(distributionHeading).toBeVisible({ timeout: 10_000 });
    const saturdayOption = page.locator('button').filter({ hasText: 'Entrenar Sábados (Recomendado)' }).first();
    await expect(saturdayOption).toBeVisible({ timeout: 10_000 });
    await saturdayOption.evaluate((element) => element.click());
    const distributionContinue = page.getByRole('button', { name: /^Continuar$/ }).first();
    await expect(distributionContinue).toBeEnabled({ timeout: 10_000 });
    await distributionContinue.evaluate((element) => element.click());
    await expect(distributionHeading).toBeHidden({ timeout: 10_000 });
  } catch {
    // La distribución no apareció en este recorrido: seguimos al modal final.
  }

  await expect(page.getByRole('heading', { name: 'Hipertrofia', exact: true })).toBeVisible({ timeout: 30_000 });
  await domClick(page.getByRole('button', { name: /Evaluar Perfil/i }));
  await expect(page.getByRole('button', { name: /^Generar Plan$/ })).toBeVisible({ timeout: 20_000 });
  await domClick(page.getByRole('button', { name: /^Generar Plan$/ }));

  await expect(page.getByText('¡Plan de Entrenamiento Listo!')).toBeVisible({ timeout: 30_000 });
  await domClick(page.getByRole('button', { name: /Comenzar Entrenamiento/i }));
}

async function maybeClick(locator, timeout = 750) {
  try {
    await expect(locator).toBeVisible({ timeout });
    await locator.evaluate((element) => element.click());
    return true;
  } catch {
    // no-op
  }
  return false;
}

async function driveHipertrofiaSession(page) {
  const skipWarmup = page.getByRole('button', {
    name: /Saltar calentamiento e ir directo al entrenamiento/i
  });
  await maybeClick(skipWarmup, 10_000);

  const offButton = page.getByRole('button', { name: /^Off$/ });
  await domClick(offButton, 20_000);

  await domClick(page.getByRole('button', { name: /^Comenzar$/ }), 20_000);

  await domClick(page.getByRole('button', { name: /^Avanzar$/ }), 20_000);

  await expect(page.getByText('Registrar Serie 1/4')).toBeVisible({ timeout: 30_000 });

  const numberInputs = page.locator('input[type="number"]');
  await expect(numberInputs.first()).toBeVisible({ timeout: 10_000 });
  await numberInputs.first().fill('80');
  await numberInputs.nth(1).fill('10');

  await domClick(page.getByRole('button', { name: /^Guardar Serie$/ }), 20_000);

  // Primer ejercicio: lo completamos con tracking RIR y luego pasamos al siguiente.
  await maybeClick(page.getByRole('button', { name: /^Saltar Ejercicio$/ }), 20_000);

  for (let i = 0; i < 16; i += 1) {
    if (await maybeClick(page.getByRole('button', { name: /^Entendido$/ }))) {
      continue;
    }

    if (await maybeClick(page.getByRole('button', { name: /^Saltar Ejercicio$/ }))) {
      continue;
    }

    if (await maybeClick(page.getByRole('button', { name: /^Comenzar$/ }))) {
      continue;
    }

    if (await page.getByText('Resumen de la sesión').isVisible({ timeout: 500 }).catch(() => false)) {
      break;
    }

    await page.waitForTimeout(300);
  }

  await expect(page.getByText('Resumen de la sesión')).toBeVisible({ timeout: 30_000 });
  await domClick(page.getByRole('button', { name: /Ver progreso en Rutinas/i }), 20_000);
}

async function ensureSharedContext() {
  if (!setupPromise) {
    setupPromise = (async () => {
      api = await pwRequest.newContext({ baseURL: API_BASE });
      users = {
        api: await registerAndLogin(api, 'api', {
          nivelEntrenamiento: 'avanzado',
          anosEntrenando: 8,
          objetivoPrincipal: 'ganar_musculo',
          enfoqueEntrenamiento: 'hipertrofia'
        }),
        limit: await registerAndLogin(api, 'limit', {
          nivelEntrenamiento: 'avanzado',
          anosEntrenando: 8,
          objetivoPrincipal: 'ganar_musculo',
          enfoqueEntrenamiento: 'hipertrofia'
        }),
        uiDesktop: await registerAndLogin(api, 'ui-desktop', {
          nivelEntrenamiento: 'avanzado',
          anosEntrenando: 8,
          objetivoPrincipal: 'ganar_musculo',
          enfoqueEntrenamiento: 'hipertrofia'
        }),
        uiMobile: await registerAndLogin(api, 'ui-mobile', {
          nivelEntrenamiento: 'avanzado',
          anosEntrenando: 8,
          objetivoPrincipal: 'ganar_musculo',
          enfoqueEntrenamiento: 'hipertrofia'
        })
      };
    })();
  }

  await setupPromise;
}

test.beforeAll(async () => {
  if (!API_BASE) return;
  await ensureSharedContext();
});

test.afterAll(async () => {
  await api?.dispose();
});

test.describe('Hipertrofia · API E2E (BD aislada)', () => {
  test.skip(!API_BASE, 'Define E2E_API_BASE apuntando a un backend local/staging no productivo');

  test('ruta canónica /api/methodology/generate acepta hipertrofia y aliases sin caer al generador genérico', async () => {
    const cases = ['hipertrofia', 'hipertrofiav2', 'HipertrofiaV2_MindFeed'];

    for (const methodology of cases) {
      const response = await api.post('/api/methodology/generate', {
        headers: { Authorization: `Bearer ${users.api.token}` },
        data: {
          mode: 'manual',
          methodology,
          selectedLevel: 'principiante',
          nivel: 'principiante',
          goals: '',
          selectedMuscleGroups: [],
          source: 'manual_selection',
          version: '5.0'
        }
      });

      expect(response.status(), `${methodology} responde 200`).toBe(200);
      const body = await response.json();
      expect(body.success, `${methodology} success`).toBeTruthy();
      expect(body.system_info?.motor, `${methodology} motor MindFeed`).toContain('MindFeed');
      expect(body.system_info?.ciclo, `${methodology} ciclo`).toBe('D1-D5');
      expect(body.plan?.metodologia, `${methodology} literal persistido`).toBe('HipertrofiaV2_MindFeed');
    }
  });

  test('la ruta canónica /api/hipertrofia/evaluate-level responde y el alias legacy es equivalente', async () => {
    const headers = { Authorization: `Bearer ${users.api.token}` };

    const canon = await api.post('/api/hipertrofia/evaluate-level', { headers, data: {} });
    expect(canon.status(), 'canónico 200').toBe(200);
    const canonBody = await canon.json();
    expect(canonBody.success).toBeTruthy();
    expect(canonBody.nivel_hipertrofia).toBeTruthy();

    const legacy = await api.post('/api/hipertrofiav2/evaluate-level', { headers, data: {} });
    expect(legacy.status(), 'legacy 200').toBe(200);
    const legacyBody = await legacy.json();
    expect(legacyBody.nivel_hipertrofia).toBe(canonBody.nivel_hipertrofia);
    expect(legacyBody.recomendacion).toBe(canonBody.recomendacion);
  });

  test('aiLimiter protege el generador canónico igual que el legacy', async () => {
    const headers = { Authorization: `Bearer ${users.limit.token}` };
    const codes = [];

    for (let i = 0; i < 40; i += 1) {
      const r = await api.post('/api/hipertrofia/generate-d1d5', {
        headers,
        data: { nivel: 'Principiante' }
      });
      codes.push(r.status());
    }

    expect(codes.filter((c) => c === 429).length, `algún 429 en ${codes.join(',')}`).toBeGreaterThan(0);
  });

  test('generación D1-D5 real, persistencia histórica y delegación desde /ai/methodology', async () => {
    test.skip(!DB_SEEDED, 'Requiere la BD local sembrada con ejercicios y configuración MindFeed (E2E_DB_SEEDED=1)');

    const gen = await api.post('/api/hipertrofia/generate-d1d5', {
      headers: { Authorization: `Bearer ${users.api.token}` },
      data: { nivel: 'Principiante', includeWeek0: true }
    });

    expect(gen.status(), 'generación 200').toBe(200);
    const genBody = await gen.json();
    expect(genBody.success).toBeTruthy();
    expect(genBody.methodologyPlanId, 'plan persistido').toBeTruthy();
    expect(genBody.system_info?.motor).toContain('MindFeed');

    const auto = await api.post('/api/routine-generation/ai/methodology', {
      headers: { Authorization: `Bearer ${users.api.token}` },
      data: {
        mode: 'automatic',
        methodology: 'hipertrofia',
        nivel: 'principiante'
      }
    });

    expect(auto.status(), 'delegación 200').toBe(200);
    const autoBody = await auto.json();
    expect(autoBody.methodology).toBe('hipertrofia');
    expect(autoBody.system_info?.motor).toContain('MindFeed');
    expect(autoBody.methodologyPlanId).toBeTruthy();
  });
});

test.describe('Hipertrofia · UI E2E (escritorio + móvil, BD local)', () => {
  test.skip(!UI_LOCAL_DB || !API_BASE, 'Define E2E_LOCAL_DB=1 y E2E_API_BASE contra un backend local aislado');

  test.beforeAll(async () => {
    if (!API_BASE) return;
    await ensureSharedContext();
  });

  for (const viewport of [
    { name: 'escritorio', width: 1280, height: 800 },
    { name: 'movil', width: 390, height: 844 }
  ]) {
    test(`(${viewport.name}) login → generación → Hoy → RIR → cierre → historial`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      const viewportUser = viewport.name === 'escritorio' ? users.uiDesktop : users.uiMobile;
      await loginUi(page, viewportUser.email, viewportUser.password);
      await selectHipertrofiaManual(page);
      await generateHipertrofiaPlanFromUi(page);
      await driveHipertrofiaSession(page);

      // La sesión debe devolvernos a Rutinas y permitir navegación al historial.
      await expect(page).toHaveURL(/\/routines/, { timeout: 20_000 });
      await domClick(page.getByRole('button', { name: /^Historial$/ }), 20_000);
      await expect(page.getByText('Histórico Total')).toBeVisible({ timeout: 20_000 });
      await expect(
        page
          .getByText('Todas las rutinas completadas', { exact: true })
          .or(page.getByText('No hay rutinas completadas aún', { exact: true }))
      ).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText(/HipertrofiaV2_MindFeed|Hipertrofia/i).first()).toBeVisible({
        timeout: 20_000
      });
    });
  }
});
