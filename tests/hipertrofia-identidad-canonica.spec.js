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

  test('runtime: los mapeos críticos de Hipertrofia usan helper canónico, no includes laxo', () => {
    const runtimeSources = [
      read('backend/services/nutritionV2/menuDataAccess.js'),
      read('backend/services/nutritionAdjustmentService.js'),
      read('backend/services/progression/planAutoregService.js'),
      read('backend/routes/homeTraining/preferences.js'),
      read('src/components/nutrition/nutritionPlanHelpers.js')
    ];

    for (const src of runtimeSources) {
      expect(src).toContain('isHipertrofiaMethodology');
      expect(src).not.toContain("includes('hipertrofia')");
      expect(src).not.toContain('includes("hipertrofia")');
    }
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

  test('C1: aiLimiter protege los generadores canónicos igual que los legacy', () => {
    const server = read('backend/server.js');
    for (const path of ['generate-d1d5', 'generate-fullbody', 'generate-single-day']) {
      expect(server).toContain(`app.use('/api/hipertrofia/${path}', aiLimiter)`);
      expect(server).toContain(`app.use('/api/hipertrofiav2/${path}', aiLimiter)`);
    }
  });

  test('C2: /ai/methodology DELEGA en el flujo dedicado (no devuelve 409)', () => {
    const route = read('backend/routes/routineGeneration.js');
    const aiBlock = route.split("router.post('/ai/methodology'")[1].split("router.post('/ai/gym-routine'")[0];
    expect(route).toContain('generateAndPersistD1D5Plan');
    // El error 409 stub ya no existe: el usuario recibe un plan real.
    expect(route).not.toContain('METHODOLOGY_REQUIRES_DEDICATED_FLOW');
    // El orquestador compartido existe y lo usa también la ruta dedicada.
    const orch = read('backend/services/hipertrofia/d1d5Orchestrator.js');
    expect(orch).toContain('export async function generateAndPersistD1D5Plan');
    const dedicated = read('backend/routes/hipertrofiaV2.js');
    expect(dedicated).toContain('generateAndPersistD1D5Plan');
    // Limpieza única: Hipertrofia IA delega primero y solo limpia drafts en el flujo genérico.
    expect(aiBlock).toContain('if (isHipertrofiaMethodology(personalizedPlanData.methodology))');
    expect(aiBlock.match(/await cleanUserDrafts\(userId\);/g) || []).toHaveLength(1);
    expect(aiBlock.indexOf('if (isHipertrofiaMethodology(personalizedPlanData.methodology))')).toBeLessThan(
      aiBlock.indexOf('await cleanUserDrafts(userId);')
    );
  });

  test('C4: el frontend llama a la ruta canónica /api/hipertrofia (no la legacy)', () => {
    const dirs = [
      'src/components/routines/RoutineSessionModal.jsx',
      'src/components/routines/session/SessionSummaryModal.jsx',
      'src/components/Methodologie/methodologies/Hipertrofia/HipertrofiaManualCard.jsx'
    ];
    for (const rel of dirs) {
      const src = read(rel);
      expect(src).not.toMatch(/hipertrofiav2\//); // ninguna URL legacy en minúsculas
    }
  });

  test('single-day: la detección de Hipertrofia usa el helper canónico, no includes laxo', () => {
    const singleDay = read('backend/routes/methodologySingleDay.js');
    expect(singleDay).toContain('isHipertrofiaMethodology');
    expect(singleDay).not.toContain("m.includes('hipertrofia')");
  });

  test('C5: no queda "HipertrofiaV2" en texto visible (mensaje post-adaptación)', () => {
    const transition = read('backend/routes/adaptation/transition.js');
    expect(transition).toContain('Genera tu plan D1-D5 de Hipertrofia');
    expect(transition).not.toContain('de HipertrofiaV2');
  });
});
