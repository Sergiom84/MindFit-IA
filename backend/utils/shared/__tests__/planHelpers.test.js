/**
 * @fileoverview Tests unitarios para planHelpers.js
 * 
 * Ejecutar con: node --test backend/utils/shared/__tests__/planHelpers.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  findWeekInPlan,
  normalizePlanDays,
  deriveLevelFromPlan,
  getTotalWeeksInPlan,
  getSessionsForWeek,
  findSessionByDay
} from '../planHelpers.js';

// Mock plan data for testing
const mockPlan = {
  semanas: [
    {
      semana: 1,
      sesiones: [
        { dia: 'lunes', ejercicios: ['push-ups'] },
        { dia: 'miércoles', ejercicios: ['squats'] },
        { dia: 'viernes', ejercicios: ['pull-ups'] }
      ]
    },
    {
      semana: 2,
      sesiones: [
        { dia: 'martes', ejercicios: ['lunges'] },
        { dia: 'jueves', ejercicios: ['planks'] }
      ]
    }
  ]
};

describe('findWeekInPlan', () => {
  it('should find week by semana field', () => {
    const week = findWeekInPlan(mockPlan.semanas, 1);
    assert.ok(week);
    assert.strictEqual(week.semana, 1);
  });

  it('should find week by numero field', () => {
    const plan = [{ numero: 1, sesiones: [] }, { numero: 2, sesiones: [] }];
    const week = findWeekInPlan(plan, 2);
    assert.ok(week);
    assert.strictEqual(week.numero, 2);
  });

  it('should find week by week field', () => {
    const plan = [{ week: 1, sesiones: [] }, { week: 2, sesiones: [] }];
    const week = findWeekInPlan(plan, 1);
    assert.ok(week);
    assert.strictEqual(week.week, 1);
  });

  it('should return undefined for non-existent week', () => {
    const week = findWeekInPlan(mockPlan.semanas, 99);
    assert.strictEqual(week, undefined);
  });

  it('should handle empty array', () => {
    const week = findWeekInPlan([], 1);
    assert.strictEqual(week, undefined);
  });

  it('should handle null/undefined', () => {
    assert.strictEqual(findWeekInPlan(null, 1), undefined);
    assert.strictEqual(findWeekInPlan(undefined, 1), undefined);
    assert.strictEqual(findWeekInPlan(mockPlan.semanas, null), undefined);
  });

  it('should map calendar weeks onto 0-based plans (MindFeed: semana 0 = calibración)', () => {
    const plan = [
      { semana: 0, sesiones: [{ dia: 'lunes', ejercicios: ['calibración'] }] },
      { semana: 1, sesiones: [{ dia: 'martes', ejercicios: ['press'] }] },
      { semana: 2, sesiones: [{ dia: 'jueves', ejercicios: ['sentadilla'] }] }
    ];
    // La semana calendario 1 (workout_schedule/mes son 1-based) es la semana 0 del plan
    assert.strictEqual(findWeekInPlan(plan, 1)?.semana, 0);
    assert.strictEqual(findWeekInPlan(plan, 2)?.semana, 1);
    assert.strictEqual(findWeekInPlan(plan, 3)?.semana, 2);
    // Y no existe semana calendario 4
    assert.strictEqual(findWeekInPlan(plan, 4), undefined);
  });
});

describe('normalizePlanDays', () => {
  it('should normalize day names to abbreviations', () => {
    const normalized = normalizePlanDays(mockPlan);
    assert.strictEqual(normalized.semanas[0].sesiones[0].dia, 'Lun');
    assert.strictEqual(normalized.semanas[0].sesiones[1].dia, 'Mie');
    assert.strictEqual(normalized.semanas[0].sesiones[2].dia, 'Vie');
  });

  it('should preserve other properties', () => {
    const normalized = normalizePlanDays(mockPlan);
    assert.deepStrictEqual(normalized.semanas[0].sesiones[0].ejercicios, ['push-ups']);
  });

  it('should handle null/undefined', () => {
    assert.strictEqual(normalizePlanDays(null), null);
    assert.strictEqual(normalizePlanDays(undefined), undefined);
  });

  it('should handle plan without semanas', () => {
    const plan = { nombre: 'Test' };
    const result = normalizePlanDays(plan);
    assert.deepStrictEqual(result, plan);
  });
});

describe('deriveLevelFromPlan', () => {
  it('should derive level from selected_level', () => {
    assert.strictEqual(deriveLevelFromPlan({ selected_level: 'avanzado' }), 'avanzado');
    assert.strictEqual(deriveLevelFromPlan({ selected_level: 'Intermedio' }), 'intermedio');
  });

  it('should derive level from nivel', () => {
    assert.strictEqual(deriveLevelFromPlan({ nivel: 'basico' }), 'basico');
  });

  it('should derive level from nested perfil.nivel', () => {
    assert.strictEqual(deriveLevelFromPlan({ perfil: { nivel: 'avanzado' } }), 'avanzado');
  });

  it('should default to basico for unknown levels', () => {
    assert.strictEqual(deriveLevelFromPlan({}), 'basico');
    assert.strictEqual(deriveLevelFromPlan({ nivel: 'unknown' }), 'basico');
  });

  it('should handle null/undefined', () => {
    assert.strictEqual(deriveLevelFromPlan(null), 'basico');
    assert.strictEqual(deriveLevelFromPlan(undefined), 'basico');
  });
});

describe('getTotalWeeksInPlan', () => {
  it('should return correct week count', () => {
    assert.strictEqual(getTotalWeeksInPlan(mockPlan), 2);
  });

  it('should return 0 for empty plan', () => {
    assert.strictEqual(getTotalWeeksInPlan({}), 0);
    assert.strictEqual(getTotalWeeksInPlan({ semanas: [] }), 0);
  });
});

describe('getSessionsForWeek', () => {
  it('should return sessions for existing week', () => {
    const sessions = getSessionsForWeek(mockPlan, 1);
    assert.strictEqual(sessions.length, 3);
  });

  it('should return empty array for non-existent week', () => {
    const sessions = getSessionsForWeek(mockPlan, 99);
    assert.deepStrictEqual(sessions, []);
  });
});

describe('findSessionByDay', () => {
  it('should find session by day name', () => {
    const session = findSessionByDay(mockPlan, 1, 'lunes');
    assert.ok(session);
    assert.deepStrictEqual(session.ejercicios, ['push-ups']);
  });

  it('should return undefined for non-existent day', () => {
    const session = findSessionByDay(mockPlan, 1, 'domingo');
    assert.strictEqual(session, undefined);
  });
});

