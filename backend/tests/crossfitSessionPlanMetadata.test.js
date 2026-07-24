import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildHydratedSessionMetadata,
  hydrateSessionPlanMetadata,
  isCrossfitV2PlanData
} from '../services/trainingLoad/sessionPlanMetadataService.js';

const plannedLoad = {
  contract_version: 'training-load/v1',
  methodology_id: 'crossfit',
  methodology_level: 'beginner',
  session_type: 'mixed',
  status: 'planned',
  day_type: 'D1',
  load_tier: 'moderate',
  provenance: { source: 'methodology_engine', confidence: 'high' }
};

const sessionContract = {
  schema_version: 'crossfit-session/v2',
  request_id: 'req_1'
};

function dbWithMetadata(metadata) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      if (/SELECT metadata/.test(sql)) return { rowCount: 1, rows: [{ metadata }] };
      if (/UPDATE app\.methodology_exercise_sessions/.test(sql)) return { rowCount: 1, rows: [] };
      throw new Error(`SQL inesperado: ${sql}`);
    }
  };
}

test('detecta únicamente el envelope completo crossfit-plan/v2', () => {
  assert.equal(isCrossfitV2PlanData({ schema_version: 'crossfit-plan/v2', crossfit_v2: { schema_version: 'crossfit-plan/v2' } }), true);
  assert.equal(isCrossfitV2PlanData({ schema_version: 'crossfit-plan/v2' }), false);
  assert.equal(isCrossfitV2PlanData({}), false);
});

test('fusiona metadata persistida y carga planificada con nombres de sesión estables', () => {
  assert.deepEqual(buildHydratedSessionMetadata({
    session_metadata: { crossfit_v2_session: sessionContract, crossfit_v2: { level: 'beginner' } },
    session_load: plannedLoad
  }), {
    crossfit_v2_session: sessionContract,
    crossfit_v2: { level: 'beginner' },
    planned_session_load: plannedLoad
  });
});

test('hidrata por plan_id + day_id y actualiza metodología sin lookup por nombre', async () => {
  const db = dbWithMetadata({
    session_metadata: { crossfit_v2_session: sessionContract },
    session_load: plannedLoad
  });
  const result = await hydrateSessionPlanMetadata(db, {
    session: { id: 9, day_id: 17 },
    planId: 4,
    weekNumber: 3,
    dayName: 'Mié',
    methodologyType: 'CrossFit',
    methodologyLevel: 'Principiante',
    required: true
  });

  assert.equal(result.applied, true);
  assert.equal(result.source, 'day_id');
  assert.match(db.calls[0].sql, /plan_id = \$1 AND day_id = \$2/);
  assert.deepEqual(db.calls[0].params, [4, 17]);
  assert.equal(db.calls[1].params[2], 'CrossFit');
});

test('falla cerrado si CrossFit v2 pierde sesión o training-load canónicos', async () => {
  const db = dbWithMetadata({ session_metadata: { crossfit_v2_session: sessionContract } });
  await assert.rejects(
    hydrateSessionPlanMetadata(db, {
      session: { id: 9, day_id: 17 },
      planId: 4,
      required: true
    }),
    (error) => error.code === 'CROSSFIT_SESSION_METADATA_REQUIRED'
      && error.reasonCode === 'TRACE_MISSING'
  );
  assert.equal(db.calls.length, 1);
});
