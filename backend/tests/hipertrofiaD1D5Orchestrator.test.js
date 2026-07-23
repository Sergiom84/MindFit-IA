import test from 'node:test';
import assert from 'node:assert/strict';

import { generateAndPersistD1D5Plan } from '../services/hipertrofia/d1d5Orchestrator.js';

test('orquestador D1-D5: ejecuta una limpieza pregen y una limpieza transaccional única', async () => {
  const calls = [];
  const fakeClient = {
    async query(sql) {
      calls.push(String(sql));
      return { rows: [], rowCount: 0 };
    },
    release() {
      calls.push('release');
    }
  };

  const fakePool = {
    async connect() {
      calls.push('connect');
      return fakeClient;
    }
  };

  const result = await generateAndPersistD1D5Plan(
    77,
    {
      nivel: 'Intermedio',
      totalWeeks: 12,
      startConfig: { startDate: 'today' },
      includeWeek0: true
    },
    {
      pool: fakePool,
      cleanupUserStaleSessions: async (userId) => {
        calls.push(`cleanup:${userId}`);
        return { cleaned: 2 };
      },
      buildD1D5Plan: async (poolArg, config) => {
        calls.push(`build:${config.userId}:${config.nivel}`);
        assert.equal(poolArg, fakePool);
        return { userId: config.userId, planData: { metodologia: 'HipertrofiaV2_MindFeed' } };
      },
      cleanUserDrafts: async (userId, clientArg) => {
        calls.push(`drafts:${userId}`);
        assert.equal(clientArg, fakeClient);
        return 1;
      },
      persistD1D5Plan: async (clientArg, builtArg) => {
        calls.push('persist');
        assert.equal(clientArg, fakeClient);
        assert.equal(builtArg.userId, 77);
        return {
          plan: { metodologia: 'HipertrofiaV2_MindFeed' },
          methodologyPlanId: 1234,
          planId: 4321
        };
      }
    }
  );

  assert.equal(result.methodologyPlanId, 1234);
  assert.equal(result.planId, 4321);
  assert.deepEqual(calls, [
    'cleanup:77',
    'build:77:Intermedio',
    'connect',
    'BEGIN',
    'drafts:77',
    'persist',
    'COMMIT',
    'release'
  ]);
});
