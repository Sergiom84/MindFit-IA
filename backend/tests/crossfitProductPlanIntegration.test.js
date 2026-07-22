import assert from 'node:assert/strict';
import test from 'node:test';

import { validateCrossfitPlan, validateCrossfitSession } from '../services/crossfit/contracts/schemas.js';
import { generateCrossfitPlanV2 } from '../services/crossfit/generator/planGenerator.js';
import {
  generateCrossfitProductPlan,
  resolveCrossfitStartDate
} from '../services/crossfit/integration/productPlanService.js';
import { presentCrossfitPlanV2 } from '../services/crossfit/integration/legacyPresentationAdapter.js';
import {
  allCrossfitEquipment,
  allCrossfitSkillPermissions,
  loadCrossfitCatalogFixture
} from './helpers/crossfitCatalogFixture.js';

const catalog = loadCrossfitCatalogFixture();
const equipment = allCrossfitEquipment(catalog);
const skillPermissions = allCrossfitSkillPermissions(catalog);
const now = new Date('2026-07-22T10:00:00.000Z');

function generatedPlan() {
  const result = generateCrossfitPlanV2({
    request_id: 'req_product_presentation',
    idempotency_key: 'idem_product_presentation',
    user_id: 'usr_product_presentation',
    classification_id: 'cfc_product_presentation',
    seed: 'product-presentation',
    generated_at: now.toISOString(),
    start_date: '2026-07-27',
    level: 'beginner',
    frequency: 3,
    catalog,
    profile: { available_equipment: equipment },
    skill_permissions: skillPermissions
  });
  assert.equal(result.ok, true);
  return result.plan;
}

function fakeDb({ existing = null } = {}) {
  const calls = [];
  return {
    calls,
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (/SELECT id, plan_data/.test(sql)) {
        return existing
          ? { rowCount: 1, rows: [{ id: 31, plan_data: existing }] }
          : { rowCount: 0, rows: [] };
      }
      if (/INSERT INTO app\.methodology_plans/.test(sql)) {
        return { rowCount: 1, rows: [{ id: 73 }] };
      }
      throw new Error(`SQL inesperado: ${sql}`);
    }
  };
}

function advancedAssessment() {
  const dimensionScores = Object.fromEntries([
    'technique', 'strength', 'aerobic', 'gymnastics',
    'weightlifting', 'pacing', 'volume', 'recovery'
  ].map((key) => [key, 3]));
  const dimensions = Object.fromEntries(
    Object.keys(dimensionScores).map((key) => [key, { observed_at: '2026-07-15T10:00:00.000Z' }])
  );
  return {
    dimension_scores: dimensionScores,
    skill_permissions: skillPermissions,
    adherence_rate: 0.9,
    evidence: {
      dimensions,
      comparable_sessions: 6,
      comparable_exposures_per_dimension: 3,
      technique_verified: true,
      weeks_in_level: 12
    }
  };
}

test('el adaptador presenta el plan v2 sin perder el contrato canónico', () => {
  const plan = generatedPlan();
  const firstMovementId = plan.weeks[0].sessions[0].wod.movements[0].canonical_movement_id;
  const catalogWithUnverifiedUrl = catalog.map((movement) => movement.canonical_id === firstMovementId
    ? { ...movement, media: [{ status: 'existing_unverified', url: 'https://example.invalid/unverified.gif' }] }
    : movement);
  const presented = presentCrossfitPlanV2(plan, catalogWithUnverifiedUrl);
  const first = presented.semanas[0].sesiones[0];

  assert.deepEqual(presented.crossfit_v2, plan);
  assert.equal(validateCrossfitPlan(presented.crossfit_v2).valid, true);
  assert.equal(validateCrossfitSession(first.metadata.persisted_session_metadata.crossfit_v2_session).valid, true);
  assert.deepEqual(first.session_load, plan.weeks[0].sessions[0].training_load);
  assert.equal(first.ejercicios[0].gif_url, null);
  assert.equal(first.ejercicios[0].exercise_id, null);
});

test('resuelve today y next_monday con fecha local antes de generar', () => {
  assert.equal(resolveCrossfitStartDate({ startConfig: { startDate: 'today' } }, now), '2026-07-22');
  assert.equal(resolveCrossfitStartDate({ startConfig: { startDate: 'next_monday' } }, now), '2026-07-27');
  assert.equal(resolveCrossfitStartDate({ start_date: '2026-08-10' }, now), '2026-08-10');
});

test('sin evaluación dimensional clasifica principiante provisional aunque se solicite avanzado', async () => {
  const db = fakeDb();
  const result = await generateCrossfitProductPlan({
    userId: 'usr_provisional',
    planData: { level: 'advanced', frecuencia_semanal: 3, start_date: '2026-07-27' },
    db,
    profileLoader: async () => ({ frecuencia_semanal: 3, limitaciones_fisicas: 'ninguna' }),
    catalogLoader: async () => catalog,
    equipmentLoader: async () => equipment,
    now
  });

  assert.equal(result.classification.global_level, 'beginner');
  assert.equal(result.classification.status, 'provisional');
  assert.equal(result.plan.crossfit_v2.level, 'beginner');
  assert.equal(result.plan.nivel, 'Principiante');
  assert.equal(result.planId, 73);
});

test('evidencia objetiva completa permite avanzado y persiste un contrato válido', async () => {
  const db = fakeDb();
  const result = await generateCrossfitProductPlan({
    userId: 'usr_advanced',
    planData: {
      frecuencia_semanal: 5,
      start_date: '2026-07-27',
      crossfitAssessment: advancedAssessment()
    },
    db,
    profileLoader: async () => ({ frecuencia_semanal: 5 }),
    catalogLoader: async () => catalog,
    equipmentLoader: async () => equipment,
    now
  });

  assert.equal(result.classification.global_level, 'advanced');
  assert.equal(validateCrossfitPlan(result.plan.crossfit_v2).valid, true);
  const insert = db.calls.find((call) => /INSERT INTO app\.methodology_plans/.test(call.sql));
  assert.ok(insert);
  assert.equal(insert.params[0], 'usr_advanced');
  assert.equal(insert.params[1], 'avanzado');
});

test('red flag bloquea antes de buscar borrador o escribir el plan', async () => {
  const db = fakeDb();
  await assert.rejects(
    generateCrossfitProductPlan({
      userId: 'usr_red_flag',
      planData: { check_in: { red_flags: ['dolor torácico'] } },
      db,
      profileLoader: async () => ({}),
      catalogLoader: async () => catalog,
      equipmentLoader: async () => equipment,
      now
    }),
    (error) => error.code === 'CROSSFIT_GENERATION_BLOCKED'
      && error.details.reason_codes.includes('SAFETY_RED_FLAG')
  );
  assert.equal(db.calls.length, 0);
});

test('la misma idempotency key devuelve el draft existente sin regenerar ni insertar', async () => {
  const existing = { schema_version: 'crossfit-plan/v2', marker: 'existing' };
  const db = fakeDb({ existing });
  const result = await generateCrossfitProductPlan({
    userId: 'usr_replay',
    planData: { idempotency_key: 'idem_replay' },
    db,
    profileLoader: async () => ({}),
    catalogLoader: async () => {
      throw new Error('no debe cargar catálogo en replay');
    },
    equipmentLoader: async () => equipment,
    now
  });

  assert.equal(result.idempotentReplay, true);
  assert.equal(result.planId, 31);
  assert.deepEqual(result.plan, existing);
  assert.equal(db.calls.some((call) => /INSERT INTO/.test(call.sql)), false);
});
