import test from 'node:test';
import assert from 'node:assert/strict';

import {
  validateTrainingLoad
} from '../services/trainingLoad/trainingLoadContract.js';
import {
  resolveDayNutritionTargets,
  resolvePeriodizationModeForUser,
  getPeriodizationQaUserIds
} from '../services/nutritionPeriodizationService.js';
import {
  isKnownMethodology,
  methodologyEmitsTrainingLoad
} from '../services/routineGeneration/methodologies/methodologyRegistry.js';
import {
  SCHEDULE_DAY_ID_SQL,
  PERIODIZATION_CONFIDENCE_SQL,
  OUTBOX_HEALTH_SQL,
  DUPLICATE_DECISIONS_SQL,
  WEEKLY_DRIFT_SQL,
  pct,
  collectPhase0Metrics
} from '../services/trainingLoad/phase0Metrics.js';

/**
 * PR6 (doc04, Nutrición Fase 0) — ACTIVACIÓN CONTROLADA (spec §16 PR6, §17.6, §18).
 *
 * Cubre: matriz contractual de 99 casos (§17.6), rollout por usuario QA (§16), gate por
 * metodología `emits_training_load` (§16 punto 3) y forma de las métricas de observabilidad
 * (§18.1). Todo puro / con mocks: NO toca BD de producción.
 */

// Las 11 metodologías canónicas de la matriz §17.6 (gimnasio legacy excluido).
const MATRIX_METHODOLOGIES = [
  'calistenia', 'crossfit', 'funcional', 'casa', 'heavy-duty', 'powerlifting',
  'halterofilia', 'bomberos', 'guardia-civil', 'policia-nacional', 'policia-local'
];
const LEVELS = ['principiante', 'intermedio', 'avanzado'];
const DAY_TYPES = ['D0', 'D1', 'D2'];

const BASE = { protein_g: 180, carbs_g: 300, fat_g: 90 }; // baseKcal = 2730
const KCAL = 2730;
const WEIGHT = 80;
// Suelo de grasa: mayor de 0.6 g/kg (48) o 20% kcal (2730*0.2/9=60.7→61) = 61 g.
const FAT_MIN = 61;

function buildContract(methodologyId, level, dayType) {
  const tier = dayType === 'D0' ? 'rest' : dayType === 'D2' ? 'high' : 'moderate';
  return {
    contract_version: 'training-load/v1',
    methodology_id: methodologyId,
    methodology_level: level,
    session_type: dayType === 'D0' ? 'rest' : 'session',
    status: 'planned',
    day_type: dayType,
    load_tier: tier,
    provenance: { source: 'methodology_engine', confidence: 'high' }
  };
}

// ── §17.6: matriz contractual de 99 casos (11 × 3 × 3) ────────────────────────────
test('§17.6 · 99 contratos sintéticos: strict válido + invariantes de periodización', () => {
  let count = 0;
  // Para fijar "misma demanda → mismas macros aunque cambie methodology_id/level".
  const macrosByDayType = new Map();

  for (const methodologyId of MATRIX_METHODOLOGIES) {
    assert.ok(isKnownMethodology(methodologyId), `${methodologyId} debe existir en el registro`);
    for (const level of LEVELS) {
      for (const dayType of DAY_TYPES) {
        count += 1;
        const contract = buildContract(methodologyId, level, dayType);

        // 1) Transporte: el validador strict acepta el contrato coherente.
        const validation = validateTrainingLoad(contract, { mode: 'strict' });
        assert.equal(validation.valid, true, `strict debe validar ${methodologyId}/${level}/${dayType}: ${validation.errors?.join('; ')}`);

        // 2) Periodización autoritativa (active) con la metodología emitiendo carga válida.
        const r = resolveDayNutritionTargets({
          baseMacros: BASE, kcalTarget: KCAL, weightKg: WEIGHT,
          sessionLoad: contract, mode: 'active', methodologyEmitsLoad: true
        });

        // day_type respetado.
        assert.equal(r.day_type, dayType, `day_type respetado ${methodologyId}/${level}/${dayType}`);
        // Proteína fija.
        assert.equal(r.macros.protein_g, BASE.protein_g, 'proteína fija');
        // Grasa >= mínimo.
        assert.ok(r.macros.fat_g >= FAT_MIN, `grasa ${r.macros.fat_g} >= ${FAT_MIN} en ${methodologyId}/${dayType}`);
        // kcal del día coherente (isocalórico ±1%).
        assert.ok(Math.abs(r.macros.kcal - KCAL) / KCAL <= 0.01, `kcal ${r.macros.kcal} fuera de ±1% en ${methodologyId}/${dayType}`);

        // Misma demanda → mismas macros aunque cambie methodology_id/level.
        const key = dayType;
        const sig = JSON.stringify(r.macros);
        if (!macrosByDayType.has(key)) macrosByDayType.set(key, sig);
        else assert.equal(sig, macrosByDayType.get(key), `mismas macros para demanda ${dayType} (indep. de metodología/nivel)`);
      }
    }
  }
  assert.equal(count, 99, 'la matriz debe ejecutar exactamente 99 casos');
  // Las tres demandas producen firmas distintas entre sí.
  assert.notEqual(macrosByDayType.get('D0'), macrosByDayType.get('D1'));
  assert.notEqual(macrosByDayType.get('D1'), macrosByDayType.get('D2'));
});

// ── §16 PR6: rollout por usuario QA (matriz global-mode × qa-user) ────────────────
test('§16 PR6 · resolvePeriodizationModeForUser escala solo para usuarios QA', () => {
  const qa = new Set([42, 7]);
  const cases = [
    ['legacy', 100, 'legacy'], ['legacy', 42, 'shadow'],
    ['shadow', 100, 'shadow'], ['shadow', 42, 'active'],
    ['active', 100, 'active'], ['active', 42, 'active']
  ];
  for (const [globalMode, userId, expected] of cases) {
    assert.equal(
      resolvePeriodizationModeForUser(userId, { globalMode, qaUsers: qa }),
      expected,
      `global=${globalMode} user=${userId} → ${expected}`
    );
  }
  // userId inválido → modo global (sin escalar).
  assert.equal(resolvePeriodizationModeForUser(null, { globalMode: 'shadow', qaUsers: qa }), 'shadow');
  assert.equal(resolvePeriodizationModeForUser('abc', { globalMode: 'legacy', qaUsers: qa }), 'legacy');
});

// ── §16 PR6: parseo de NUTRITION_PERIODIZATION_QA_USERS y default seguro ──────────
test('§16 PR6 · lista QA vacía por defecto → nadie escala (cero cambio observable)', () => {
  const prev = process.env.NUTRITION_PERIODIZATION_QA_USERS;
  delete process.env.NUTRITION_PERIODIZATION_QA_USERS;
  try {
    assert.equal(getPeriodizationQaUserIds().size, 0);
    // Sin lista QA y global legacy (default) → legacy para cualquiera.
    assert.equal(resolvePeriodizationModeForUser(999, { globalMode: 'legacy' }), 'legacy');

    process.env.NUTRITION_PERIODIZATION_QA_USERS = ' 42, 7 ,,abc, -3, 7 ';
    const ids = getPeriodizationQaUserIds();
    assert.deepEqual([...ids].sort((a, b) => a - b), [7, 42]);
  } finally {
    if (prev === undefined) delete process.env.NUTRITION_PERIODIZATION_QA_USERS;
    else process.env.NUTRITION_PERIODIZATION_QA_USERS = prev;
  }
});

// ── §16 PR6 (punto 3): gate por metodología emits_training_load ───────────────────
test('§16 PR6 · metodología que NO emite carga cae a política conservadora', () => {
  // En Fase 0 NINGUNA metodología emite todavía.
  for (const id of MATRIX_METHODOLOGIES) {
    assert.equal(methodologyEmitsTrainingLoad(id), false, `${id} no debe emitir carga en Fase 0`);
  }
  assert.equal(methodologyEmitsTrainingLoad('desconocida'), false);

  const d2Contract = buildContract('powerlifting', 'intermedio', 'D2'); // day_type D2, tier high

  // Con emits=false, un contrato D2 explícito NO se honra: cae a D1 baja confianza.
  const gated = resolveDayNutritionTargets({
    baseMacros: BASE, kcalTarget: KCAL, weightKg: WEIGHT,
    sessionLoad: d2Contract, mode: 'active', methodologyEmitsLoad: false
  });
  assert.equal(gated.day_type, 'D1');
  assert.equal(gated.audit.source_confidence, 'low');
  assert.ok(gated.audit.reason_codes.includes('NON_EMITTING_METHODOLOGY'));

  // Con emits=true, el mismo contrato D2 SÍ se honra.
  const honored = resolveDayNutritionTargets({
    baseMacros: BASE, kcalTarget: KCAL, weightKg: WEIGHT,
    sessionLoad: d2Contract, mode: 'active', methodologyEmitsLoad: true
  });
  assert.equal(honored.day_type, 'D2');

  // Un descanso con emits=false sigue siendo D0 (no se pierde el descanso real).
  const restContract = buildContract('powerlifting', 'intermedio', 'D0'); // tier rest
  const restGated = resolveDayNutritionTargets({
    baseMacros: BASE, sessionLoad: restContract, mode: 'active', methodologyEmitsLoad: false
  });
  assert.equal(restGated.day_type, 'D0');

  // Default (sin pasar el flag) = honrar el contrato: no cambia el comportamiento de PR4.
  const defaultHonored = resolveDayNutritionTargets({
    baseMacros: BASE, kcalTarget: KCAL, weightKg: WEIGHT, sessionLoad: d2Contract, mode: 'active'
  });
  assert.equal(defaultHonored.day_type, 'D2');
});

// ── §18.1: forma de las queries de métricas (constantes SQL asertables) ───────────
test('§18.1 · las queries de métricas son SOLO LECTURA y cubren las tablas esperadas', () => {
  assert.match(SCHEDULE_DAY_ID_SQL, /app\.workout_schedule/);
  assert.match(SCHEDULE_DAY_ID_SQL, /day_id IS NOT NULL/);
  assert.match(PERIODIZATION_CONFIDENCE_SQL, /app\.nutrition_plan_days/);
  assert.match(PERIODIZATION_CONFIDENCE_SQL, /d1_low_confidence/);
  assert.match(OUTBOX_HEALTH_SQL, /app\.bridge_event_outbox/);
  assert.match(OUTBOX_HEALTH_SQL, /pending_over_10min/);
  assert.match(OUTBOX_HEALTH_SQL, /attempts >= 5/);
  assert.match(DUPLICATE_DECISIONS_SQL, /app\.bridge_decision_logs/);
  assert.match(DUPLICATE_DECISIONS_SQL, /source_event_id/);
  assert.match(WEEKLY_DRIFT_SQL, /days_drift_over_1pct/);
  for (const sql of [SCHEDULE_DAY_ID_SQL, PERIODIZATION_CONFIDENCE_SQL, OUTBOX_HEALTH_SQL, DUPLICATE_DECISIONS_SQL, WEEKLY_DRIFT_SQL]) {
    assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|DROP|ALTER)\b/i, 'las métricas no deben mutar datos');
  }
  assert.equal(pct(50, 200), 25);
  assert.equal(pct(1, 0), null);
});

// ── §18.1: runner combina las filas y calcula alertas de umbral ───────────────────
test('§18.1 · collectPhase0Metrics agrega conteos y marca alertas', async () => {
  const rowsBySql = new Map([
    [SCHEDULE_DAY_ID_SQL, { schedule_total: 100, schedule_with_day_id: 80 }],
    // COR-F0-05: with_valid_contract se deriva de load_contract_status='valid' (status_valid),
    // no de la fuente del dato. 10 válidos de 40 periodizados → 25%.
    [PERIODIZATION_CONFIDENCE_SQL, {
      periodized_total: 40, status_valid: 10, status_degraded: 5,
      status_boolean_fallback: 20, status_no_load: 5, d1_low_confidence: 25
    }],
    [OUTBOX_HEALTH_SQL, {
      pending_over_10min: 2, failed_after_max_attempts: 1, pending_total: 3,
      processing_total: 0, failed_total: 1, completed_total: 90, skipped_total: 6
    }],
    [DUPLICATE_DECISIONS_SQL, { duplicate_decisions: 0 }],
    [WEEKLY_DRIFT_SQL, { days_with_macros: 40, days_drift_over_1pct: 0 }]
  ]);
  const db = { query: async (sql) => ({ rows: [rowsBySql.get(sql)] }) };

  const m = await collectPhase0Metrics(db);
  assert.equal(m.schedule.pct_with_day_id, 80);
  assert.equal(m.periodization.pct_with_valid_contract, 25);
  assert.equal(m.periodization.pct_d1_low_confidence, 62.5);
  assert.equal(m.outbox.pending_over_10min, 2);
  assert.equal(m.decisions.duplicate_decisions, 0);
  // Alertas: backlog y fallidos terminales activos; duplicados y drift limpios.
  assert.equal(m.alerts.outbox_pending_backlog, true);
  assert.equal(m.alerts.outbox_failed_terminal, true);
  assert.equal(m.alerts.duplicate_decisions, false);
  assert.equal(m.alerts.weekly_drift, false);
});

// ── Regresión: con el default (legacy, sin QA) la salida al usuario no cambia ──────
test('regresión · sin flags el modo por usuario es legacy y el reparto es el legado', () => {
  const prevMode = process.env.NUTRITION_LOAD_PERIODIZATION_MODE;
  const prevQa = process.env.NUTRITION_PERIODIZATION_QA_USERS;
  delete process.env.NUTRITION_LOAD_PERIODIZATION_MODE;
  delete process.env.NUTRITION_PERIODIZATION_QA_USERS;
  try {
    assert.equal(resolvePeriodizationModeForUser(1234), 'legacy');
    const legacy = resolveDayNutritionTargets({ baseMacros: BASE, sessionLoad: { is_training: true }, mode: 'legacy' });
    // Reparto legado: entreno = carbos ×1.10.
    assert.equal(legacy.macros.carbs_g, Math.round(BASE.carbs_g * 1.10));
  } finally {
    if (prevMode === undefined) delete process.env.NUTRITION_LOAD_PERIODIZATION_MODE;
    else process.env.NUTRITION_LOAD_PERIODIZATION_MODE = prevMode;
    if (prevQa === undefined) delete process.env.NUTRITION_PERIODIZATION_QA_USERS;
    else process.env.NUTRITION_PERIODIZATION_QA_USERS = prevQa;
  }
});
