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
      if (/FROM app\.methodology_plans/.test(sql) && /idempotency_key/.test(sql)) {
        return existing
          ? { rowCount: 1, rows: [{ id: 31, status: 'draft', plan_data: existing }] }
          : { rowCount: 0, rows: [] };
      }
      if (/INSERT INTO app\.methodology_plans/.test(sql)) {
        return { rowCount: 1, rows: [{ id: 73 }] };
      }
      throw new Error(`SQL inesperado: ${sql}`);
    }
  };
}

function regenerationDb(sourcePlan, { status = 'draft', sessionCount = 0 } = {}) {
  const calls = [];
  const client = {
    calls,
    released: false,
    async query(sql, params = []) {
      calls.push({ sql: String(sql), params });
      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) return { rowCount: 0, rows: [] };
      if (/FROM app\.methodology_plans/.test(sql) && /FOR UPDATE/.test(sql)) {
        return { rowCount: 1, rows: [{ id: 81, status, plan_data: sourcePlan }] };
      }
      if (/FROM app\.methodology_exercise_sessions/.test(sql)) {
        return { rowCount: 1, rows: [{ session_count: sessionCount }] };
      }
      if (/FROM app\.methodology_plans/.test(sql) && /idempotency_key/.test(sql)) {
        return { rowCount: 0, rows: [] };
      }
      if (/INSERT INTO app\.methodology_plans/.test(sql)) {
        return { rowCount: 1, rows: [{ id: 82 }] };
      }
      if (/UPDATE app\.methodology_plans/.test(sql) && /superseded/.test(sql)) {
        return { rowCount: 1, rows: [{ id: 81 }] };
      }
      throw new Error(`SQL inesperado: ${sql}`);
    },
    release() {
      this.released = true;
    }
  };
  return {
    calls,
    client,
    async query(...args) {
      return client.query(...args);
    },
    async connect() {
      return client;
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

test('resuelve medianoche y DST con calendario Europe/Madrid independiente del proceso', () => {
  const mondayInMadrid = new Date('2026-07-26T22:30:00.000Z');
  const sundayInMadrid = new Date('2026-07-26T21:30:00.000Z');
  const dstMidnight = new Date('2026-03-29T22:30:00.000Z');

  assert.equal(
    resolveCrossfitStartDate({ startConfig: { startDate: 'today' } }, mondayInMadrid),
    '2026-07-27'
  );
  assert.equal(
    resolveCrossfitStartDate({ startConfig: { startDate: 'next_monday' } }, sundayInMadrid),
    '2026-07-27'
  );
  assert.equal(
    resolveCrossfitStartDate({ startConfig: { startDate: 'next_monday' } }, mondayInMadrid),
    '2026-08-03'
  );
  assert.equal(
    resolveCrossfitStartDate({ startConfig: { startDate: 'today' } }, dstMidnight),
    '2026-03-30'
  );
  assert.equal(
    resolveCrossfitStartDate({
      time_zone: 'Invalid/Time_Zone',
      startConfig: { startDate: 'today' }
    }, mondayInMadrid),
    '2026-07-27'
  );
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

test('la frecuencia incompatible no se sustituye silenciosamente', async () => {
  const db = fakeDb();
  await assert.rejects(
    generateCrossfitProductPlan({
      userId: 'usr_frequency',
      planData: { frecuencia_semanal: 5, start_date: '2026-07-27' },
      db,
      profileLoader: async () => ({ frecuencia_semanal: 5 }),
      catalogLoader: async () => catalog,
      equipmentLoader: async () => equipment,
      now
    }),
    (error) => error.code === 'FREQUENCY_UNSUPPORTED'
      && error.status === 422
      && error.details.level === 'beginner'
      && error.details.supported_frequencies.join(',') === '2,3'
  );
  assert.equal(db.calls.some((call) => /INSERT INTO/.test(call.sql)), false);
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
  const planData = { idempotency_key: 'idem_replay', available_minutes: 55 };
  const firstDb = fakeDb();
  await generateCrossfitProductPlan({
    userId: 'usr_replay',
    planData,
    db: firstDb,
    profileLoader: async () => ({}),
    catalogLoader: async () => catalog,
    equipmentLoader: async () => equipment,
    now
  });
  const insert = firstDb.calls.find((call) => /INSERT INTO app\.methodology_plans/.test(call.sql));
  const existing = JSON.parse(insert.params[2]);
  const db = fakeDb({ existing });
  const result = await generateCrossfitProductPlan({
    userId: 'usr_replay',
    planData,
    db,
    profileLoader: async () => {
      throw new Error('no debe recargar perfil en replay');
    },
    catalogLoader: async () => {
      throw new Error('no debe cargar catálogo en replay');
    },
    equipmentLoader: async () => {
      throw new Error('no debe recargar equipamiento en replay');
    },
    now
  });

  assert.equal(result.idempotentReplay, true);
  assert.equal(result.planId, 31);
  assert.deepEqual(result.plan, existing);
  assert.equal(db.calls.some((call) => /INSERT INTO/.test(call.sql)), false);
});

test('acepta el assessment_id snake_case del contrato frontend', async () => {
  const db = fakeDb();
  const result = await generateCrossfitProductPlan({
    userId: 'usr_assessment_alias',
    planData: { crossfit_assessment_id: 'cfx_assessment_alias' },
    db,
    profileLoader: async () => ({}),
    catalogLoader: async () => catalog,
    equipmentLoader: async () => equipment,
    now
  });

  assert.equal(result.plan.crossfit_assessment_id, 'cfx_assessment_alias');
});

test('una idempotency key reutilizada con otra entrada falla cerrada', async () => {
  const initialData = { idempotency_key: 'idem_collision', available_minutes: 55 };
  const firstDb = fakeDb();
  await generateCrossfitProductPlan({
    userId: 'usr_collision',
    planData: initialData,
    db: firstDb,
    profileLoader: async () => ({}),
    catalogLoader: async () => catalog,
    equipmentLoader: async () => equipment,
    now
  });
  const insert = firstDb.calls.find((call) => /INSERT INTO app\.methodology_plans/.test(call.sql));
  const existing = JSON.parse(insert.params[2]);
  await assert.rejects(
    generateCrossfitProductPlan({
      userId: 'usr_collision',
      planData: { ...initialData, available_minutes: 70 },
      db: fakeDb({ existing }),
      profileLoader: async () => ({}),
      catalogLoader: async () => catalog,
      equipmentLoader: async () => equipment,
      now
    }),
    (error) => error.code === 'IDEMPOTENCY_BROKEN' && error.status === 409
  );
});

test('regenera un draft como revisión inmutable y supersede el origen en transacción', async () => {
  const source = presentCrossfitPlanV2(generatedPlan(), catalog);
  source.configuracion.generation_request_hash = 'source-hash';
  const db = regenerationDb(source);
  const result = await generateCrossfitProductPlan({
    userId: 'usr_regeneration',
    planData: {
      mode: 'regenerate',
      previous_plan_id: 81,
      expected_revision: 0,
      regeneration_reasons: ['dont_like', 'change_focus'],
      request_id: 'crossfit_regeneration_request_1',
      idempotency_key: 'crossfit_regeneration_idempotency_1'
    },
    db,
    profileLoader: async () => ({}),
    catalogLoader: async () => catalog,
    equipmentLoader: async () => equipment,
    now
  });

  assert.equal(result.planId, 82);
  assert.equal(result.plan.crossfit_v2.generation.revision, 1);
  assert.equal(result.plan.crossfit_v2.generation.supersedes, source.crossfit_v2.plan_id);
  assert.deepEqual(result.plan.configuracion.regeneration.reasons, ['change_focus', 'dont_like']);
  assert.ok(result.plan.crossfit_v2.decision_trace.some((item) => item.reason_code === 'PLAN_REGENERATED'));
  assert.deepEqual(db.calls.filter((call) => ['BEGIN', 'COMMIT'].includes(call.sql)).map((call) => call.sql), ['BEGIN', 'COMMIT']);
  assert.ok(db.calls.some((call) => /status = 'superseded'/.test(call.sql)));
  assert.equal(db.client.released, true);
});

test('regeneración rechaza revisión obsoleta, plan activo o sesiones materializadas', async () => {
  const source = presentCrossfitPlanV2(generatedPlan(), catalog);
  const base = {
    mode: 'regenerate',
    previous_plan_id: 81,
    expected_revision: 0,
    regeneration_reasons: ['too_difficult'],
    request_id: 'crossfit_regeneration_request_2',
    idempotency_key: 'crossfit_regeneration_idempotency_2'
  };
  const common = {
    userId: 'usr_regeneration_reject',
    profileLoader: async () => ({}),
    catalogLoader: async () => catalog,
    equipmentLoader: async () => equipment,
    now
  };

  await assert.rejects(
    generateCrossfitProductPlan({ ...common, planData: { ...base, expected_revision: 1 }, db: regenerationDb(source) }),
    (error) => error.code === 'IDEMPOTENCY_BROKEN'
  );
  await assert.rejects(
    generateCrossfitProductPlan({ ...common, planData: base, db: regenerationDb(source, { status: 'active' }) }),
    (error) => error.code === 'HISTORY_IMMUTABLE'
  );
  await assert.rejects(
    generateCrossfitProductPlan({ ...common, planData: base, db: regenerationDb(source, { sessionCount: 1 }) }),
    (error) => error.code === 'HISTORY_IMMUTABLE'
  );
});
