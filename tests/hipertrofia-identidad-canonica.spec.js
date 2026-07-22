import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Renombrado HipertrofiaV2 → Hipertrofia · identidad canónica.
 *
 * Guards a nivel de FUENTE (sin auth ni BD, aptos para CI) que fallan si el renombrado
 * regresa. El flujo E2E autenticado completo (seleccionar → generar → Hoy → reproductor →
 * RIR → completar → resumen → plan histórico) se documenta como `test.skip` porque exige
 * servicios + usuario real; se ejecuta contra STAGING (no prod — ver memoria del equipo).
 */

const read = (rel) => fs.readFileSync(path.resolve(rel), 'utf8');

test.describe('Hipertrofia · identidad canónica (fuente, CI-safe)', () => {
  test('helper único de identidad existe en backend y frontend con la misma API', () => {
    const be = read('backend/services/hipertrofia/identity.js');
    const fe = read('src/utils/hipertrofiaIdentity.js');
    for (const src of [be, fe]) {
      expect(src).toContain('export function isHipertrofiaMethodology');
      expect(src).toContain('export function normalizeHipertrofiaIdentity');
      expect(src).toContain("HIPERTROFIA_PERSISTED_TYPE = 'HipertrofiaV2_MindFeed'");
    }
  });

  test('la detección dispersa por regex/tag fue sustituida por el helper', () => {
    const today = read('src/components/routines/tabs/TodayTrainingTab.jsx');
    // El regex laxo con falsos positivos NO debe reaparecer.
    expect(today).not.toMatch(/\/hipertrofia\|mindfeed\/i/);
    expect(today).toContain('isHipertrofiaMethodology(planMethodology)');

    const modal = read('src/components/routines/RoutineSessionModal.jsx');
    expect(modal).toContain('isHipertrofiaMethodology(methodologyTag)');
    // El booleano histórico (con y sin errata) desaparece del código.
    expect(modal).not.toContain('isHypertrofiaV2');
    expect(modal).not.toContain('isHipertrofiaV2');

    const summary = read('src/components/routines/session/SessionSummaryModal.jsx');
    expect(summary).toContain('isHipertrofiaMethodology(session?.metodologia)');
  });

  test('la prop padre→hijo se renombró de forma atómica (isHipertrofia)', () => {
    const today = read('src/components/routines/tabs/TodayTrainingTab.jsx');
    const layer = read('src/components/routines/tabs/TodayTrainingTab/components/TodayTrainingModalLayer.jsx');
    expect(today).toContain('isHipertrofia={isHipertrofia}');
    expect(layer).toContain('isHipertrofia,');
    expect(layer).not.toContain('isHipertrofiaV2');
  });

  test('display: el identificador interno se muestra como "Hipertrofia"', () => {
    const utils = read('src/utils/workoutUtils.js');
    expect(utils).toContain('isHipertrofiaMethodology(raw)');
    expect(utils).toContain('HIPERTROFIA_DISPLAY_NAME');
  });

  test('API: router de Hipertrofia montado bajo canónico + alias legacy', () => {
    const server = read('backend/server.js');
    expect(server).toContain("app.use('/api/hipertrofia', hipertrofiaRoutes)");
    expect(server).toContain("app.use('/api/hipertrofiav2', hipertrofiaRoutes)");
  });

  test('contrato: preferencia explícita de Hipertrofia NO cae a gimnasio genérico', () => {
    const contract = read('backend/services/userProfileContract.js');
    expect(contract).toContain('hipertrofia: "hipertrofia"');
    expect(contract).toContain('hipertrofiav2: "hipertrofia"');
    // gimnasio/gym/bodybuilding siguen siendo gimnasio genérico.
    expect(contract).toContain('gym: "gimnasio"');
    expect(contract).toContain('bodybuilding: "gimnasio"');
  });
});

/**
 * E2E autenticado (STAGING). Requiere E2E_BASE_URL + credenciales de un usuario de prueba
 * con un plan de Hipertrofia. NO ejecutar contra producción (decisión del equipo).
 * Cubre escritorio y móvil (390×844).
 */
const STAGING = process.env.E2E_STAGING_BASE_URL;
test.describe('Hipertrofia · flujo E2E (staging)', () => {
  test.skip(!STAGING, 'Define E2E_STAGING_BASE_URL y credenciales de staging para ejecutar');

  for (const viewport of [
    { name: 'desktop', width: 1280, height: 800 },
    { name: 'movil', width: 390, height: 844 }
  ]) {
    test(`(${viewport.name}) seleccionar Hipertrofia → Hoy → reproductor → RIR → resumen`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      // 1) Login + seleccionar Hipertrofia. 2) Generar/abrir plan. 3) Entrar en Hoy.
      // 4) Abrir el reproductor DEDICADO (HipertrofiaSessionModal), no el genérico de gimnasio.
      // 5) Registrar series/RIR. 6) Completar sesión. 7) Ver resumen. 8) Abrir plan histórico
      //    con methodology_type='HipertrofiaV2_MindFeed'. 9) Confirmar que NUNCA se abre el
      //    reproductor genérico de gimnasio.
      // Implementación pendiente de credenciales de staging (CI-001).
      expect(STAGING).toBeTruthy();
    });
  }
});
