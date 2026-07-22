import assert from 'node:assert/strict';
import test from 'node:test';

import { generateCrossfitSingleDayV2 } from '../services/crossfit/integration/singleDayService.js';
import { persistSingleDaySession } from '../services/singleDay/persistSingleDaySession.js';
import {
  allCrossfitEquipment,
  allCrossfitSkillPermissions,
  loadCrossfitCatalogFixture
} from './helpers/crossfitCatalogFixture.js';

const catalog = loadCrossfitCatalogFixture();
const equipment = allCrossfitEquipment(catalog);
const now = new Date('2026-07-25T09:00:00.000Z');

test('single-day v2 usa composer validado y persiste day_id, load y sesión canónica', async () => {
  let persisted = null;
  const result = await generateCrossfitSingleDayV2({
    db: { query: async () => { throw new Error('SQL no esperado con loaders inyectados'); } },
    userId: 'usr_single',
    options: { selectionMode: 'focus', focusGroup: 'Monostructural' },
    now,
    profileLoader: async () => ({ historial_medico: null }),
    equipmentLoader: async () => equipment,
    catalogLoader: async () => catalog,
    activeContextLoader: async () => ({
      level: 'beginner',
      classification: { classification_id: 'cfc_single', skill_permissions: allCrossfitSkillPermissions(catalog) }
    }),
    persistence: async (_db, params) => {
      persisted = params;
      return { sessionId: 44, planId: 33 };
    }
  });

  assert.equal(result.sessionId, 44);
  assert.equal(result.workout.schema_version, 'crossfit-session/v2');
  assert.ok(result.workout.exercises.length > 0);
  assert.equal(persisted.dayId, 1);
  assert.equal(persisted.startedAt, null);
  assert.equal(persisted.versionType, 'crossfit-session/v2');
  assert.equal(persisted.planDayMetadata.session_load.contract_version, 'training-load/v1');
  assert.equal(persisted.extraSessionMetadata.crossfit_v2_session.schema_version, 'crossfit-session/v2');
  assert.equal(persisted.extraSessionMetadata.planned_session_load.contract_version, 'training-load/v1');
  assert.equal(persisted.planData.schema_version, 'crossfit-single-day/v2');
});

test('single-day v2 bloquea red flags antes de catálogo o persistencia', async () => {
  let catalogLoaded = false;
  let persisted = false;
  await assert.rejects(
    generateCrossfitSingleDayV2({
      db: { query: async () => ({ rowCount: 0, rows: [] }) },
      userId: 'usr_blocked',
      options: { check_in: { red_flags: ['dolor torácico'] } },
      now,
      profileLoader: async () => ({}),
      equipmentLoader: async () => equipment,
      catalogLoader: async () => {
        catalogLoaded = true;
        return catalog;
      },
      persistence: async () => {
        persisted = true;
      }
    }),
    (error) => error.code === 'CROSSFIT_SINGLE_DAY_BLOCKED'
      && error.reasonCodes.includes('SAFETY_RED_FLAG')
  );
  assert.equal(catalogLoaded, false);
  assert.equal(persisted, false);
});

test('persistidor single-day conserva defaults legacy y permite extensión canónica', async () => {
  const calls = [];
  const client = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (/SELECT s\.id AS session_id/.test(sql)) return { rowCount: 0, rows: [] };
      if (/INSERT INTO app\.methodology_plans/.test(sql)) return { rowCount: 1, rows: [{ id: 12 }] };
      if (/INSERT INTO app\.methodology_exercise_sessions/.test(sql)) return { rowCount: 1, rows: [{ id: 21 }] };
      return { rowCount: 1, rows: [] };
    }
  };
  const date = new Date('2026-07-25T09:00:00.000Z');
  await persistSingleDaySession(client, {
    userId: 7,
    nivel: 'Principiante',
    nivelNormalized: 'basico',
    methodologyType: 'crossfit',
    exercises: [{ nombre: 'Air Squat', orden: 1, series: 1, reps_objetivo: '10', descanso_seg: 0 }],
    sessionLabel: 'WOD',
    planLabel: 'WOD hoy',
    currentDate: date,
    startedAt: null,
    dayId: 1,
    planDayMetadata: { session_load: { contract_version: 'training-load/v1' } },
    planData: { schema_version: 'crossfit-single-day/v2' },
    versionType: 'crossfit-session/v2'
  });

  const planInsert = calls.find((call) => /INSERT INTO app\.methodology_plans/.test(call.sql));
  const sessionInsert = calls.find((call) => /INSERT INTO app\.methodology_exercise_sessions/.test(call.sql));
  assert.equal(planInsert.params[8], 'crossfit-session/v2');
  assert.equal(sessionInsert.params[2], 1);
  assert.equal(sessionInsert.params[7], date);
  assert.equal(sessionInsert.params[11], null);
  assert.equal(calls.some((call) => /INSERT INTO app\.methodology_plan_days/.test(call.sql)), true);
});
