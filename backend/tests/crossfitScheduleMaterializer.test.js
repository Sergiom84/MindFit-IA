import assert from 'node:assert/strict';
import test from 'node:test';

import { generateCrossfitPlanV2 } from '../services/crossfit/generator/planGenerator.js';
import { presentCrossfitPlanV2 } from '../services/crossfit/integration/legacyPresentationAdapter.js';
import { materializeCrossfitSchedule } from '../services/crossfit/integration/scheduleMaterializer.js';
import { getMethodologyScheduleAdapter } from '../services/methodologyScheduleAdapters.js';
import {
  allCrossfitEquipment,
  allCrossfitSkillPermissions,
  loadCrossfitCatalogFixture
} from './helpers/crossfitCatalogFixture.js';

const catalog = loadCrossfitCatalogFixture();

function plan() {
  const generated = generateCrossfitPlanV2({
    request_id: 'req_schedule',
    idempotency_key: 'idem_schedule',
    user_id: 'usr_schedule',
    classification_id: 'cfc_schedule',
    seed: 'schedule-materializer',
    generated_at: '2026-07-22T10:00:00.000Z',
    start_date: '2026-07-27',
    level: 'beginner',
    frequency: 3,
    catalog,
    profile: { available_equipment: allCrossfitEquipment(catalog) },
    skill_permissions: allCrossfitSkillPermissions(catalog)
  });
  assert.equal(generated.ok, true);
  return presentCrossfitPlanV2(generated.plan, catalog);
}

function fakeClient() {
  const calls = [];
  return {
    calls,
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (sql === 'SAVEPOINT crossfit_v2_schedule') throw new Error('sin transacción');
      return { rowCount: 1, rows: [] };
    }
  };
}

test('registro selecciona adaptador solo para envelope CrossFit v2 completo', () => {
  const valid = plan();
  assert.equal(getMethodologyScheduleAdapter(valid)?.version, 'crossfit-plan/v2');
  assert.equal(getMethodologyScheduleAdapter({ schema_version: 'crossfit-plan/v2' }), null);
  assert.equal(getMethodologyScheduleAdapter({ schema_version: 'otra/v1' }), null);
});

test('materializa 8 semanas rodantes completas sin recortar ni clonar WODs', async () => {
  const source = plan();
  const originalFirstDate = source.crossfit_v2.weeks[0].sessions[0].date;
  const client = fakeClient();
  const result = await materializeCrossfitSchedule({
    client,
    userId: 'usr_schedule',
    methodologyPlanId: 91,
    planData: source,
    startDate: new Date('2026-08-03T00:00:00')
  });

  const workoutInserts = client.calls.filter((call) => /INSERT INTO app\.workout_schedule/.test(call.sql));
  const dayInserts = client.calls.filter((call) => /INSERT INTO app\.methodology_plan_days/.test(call.sql));
  assert.equal(result.total_days, 56);
  assert.equal(result.total_sessions, 24);
  assert.equal(workoutInserts.length, 24);
  assert.equal(dayInserts.length, 56);
  assert.equal(workoutInserts[0].params[6], '2026-08-03');
  assert.equal(source.crossfit_v2.weeks[0].sessions[0].date, originalFirstDate);

  const firstTrainingDay = dayInserts.find((call) => call.params.length === 7);
  const metadata = JSON.parse(firstTrainingDay.params[6]);
  assert.equal(metadata.session_load.contract_version, 'training-load/v1');
  assert.equal(metadata.session_metadata.crossfit_v2_session.schema_version, 'crossfit-session/v2');
  assert.equal(metadata.session_metadata.crossfit_v2_session.date, '2026-08-03');
  assert.equal(metadata.session_metadata.crossfit_v2.db_day_id, 1);
  assert.equal(client.calls.some((call) => call.sql === 'BEGIN'), true);
  assert.equal(client.calls.at(-1).sql, 'COMMIT');
});

test('contrato inválido falla antes de borrar calendario existente', async () => {
  const invalid = plan();
  invalid.crossfit_v2.schema_version = 'crossfit-plan/v1';
  const client = fakeClient();
  await assert.rejects(
    materializeCrossfitSchedule({
      client,
      userId: 'usr_schedule',
      methodologyPlanId: 91,
      planData: invalid,
      startDate: '2026-08-03'
    }),
    (error) => error.code === 'CROSSFIT_MATERIALIZATION_CONTRACT_INVALID'
  );
  assert.equal(client.calls.length, 0);
});
