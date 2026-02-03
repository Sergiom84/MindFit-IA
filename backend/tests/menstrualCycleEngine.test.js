import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildCycleAdjustment,
  clamp,
  combineMultipliers,
  computeCycleConfidence,
  computeCycleDay,
  computeCycleLengthEMA,
  computeCycleVariation,
  computeDominantDomain,
  computePhase,
  computeRestExtra,
  computeSeverity,
  determineMode,
  enforceNoDoubleIncrease,
  getPhaseMultipliers,
  getSymptomMultipliers,
  getWeightForConfidence
} from "../services/menstrualCycle/engine.js";

const approxEqual = (a, b, tolerance = 0.001) => Math.abs(a - b) <= tolerance;

const BASE_CONFIG = {
  contraception_type: "none",
  cycle_confidence: "high",
  last_bleed_start_date: "2026-01-10",
  bleed_length_days: 5,
  cycle_length_days: 28,
  luteal_length_days: 14
};

test("computeCycleLengthEMA usa alpha y devuelve promedio", () => {
  const result = computeCycleLengthEMA([28, 30], 0.3);
  assert.ok(approxEqual(result, 28.6));
});

test("computeCycleConfidence respeta variacion y degrada si hay <3 ciclos", () => {
  const highConfidence = computeCycleConfidence({
    cycleLengths: [28, 29, 30],
    hasLastBleedStartDate: true,
    hasRecentLogs: true,
    contraceptionType: "none"
  });
  assert.equal(highConfidence, "high");

  const degraded = computeCycleConfidence({
    cycleLengths: [28, 30],
    hasLastBleedStartDate: true,
    hasRecentLogs: true,
    contraceptionType: "none"
  });
  assert.equal(degraded, "medium");

  const forcedLow = computeCycleConfidence({
    cycleLengths: [28, 29, 30],
    hasLastBleedStartDate: false,
    hasRecentLogs: true,
    contraceptionType: "none"
  });
  assert.equal(forcedLow, "low");
});

test("determineMode respeta anticoncepcion y confianza", () => {
  assert.equal(
    determineMode({ contraceptionType: "combined", cycleConfidence: "high", lastBleedStartDate: "2026-01-10" }),
    "symptoms"
  );
  assert.equal(
    determineMode({ contraceptionType: "none", cycleConfidence: "low", lastBleedStartDate: "2026-01-10" }),
    "symptoms"
  );
  assert.equal(
    determineMode({ contraceptionType: "none", cycleConfidence: "high", lastBleedStartDate: "2026-01-10", hasRecentLogs: true }),
    "phase"
  );
});

test("computePhase devuelve fases esperadas", () => {
  const menstruation = computePhase({
    cycleDay: 2,
    bleedLengthDays: 5,
    cycleLengthDays: 28,
    lutealLengthDays: 14,
    confidence: "high"
  });
  assert.equal(menstruation, "menstruation");

  const ovulation = computePhase({
    cycleDay: 13,
    bleedLengthDays: 5,
    cycleLengthDays: 28,
    lutealLengthDays: 14,
    confidence: "medium"
  });
  assert.equal(ovulation, "ovulation");

  const lutealLate = computePhase({
    cycleDay: 26,
    bleedLengthDays: 5,
    cycleLengthDays: 28,
    lutealLengthDays: 14,
    confidence: "high"
  });
  assert.equal(lutealLate, "luteal_late");
});

test("computeSeverity y dominantDomain priorizan correctamente", () => {
  const severity = computeSeverity({ pain: 2, fatigue: 3, sleep: 1, stress: 0 });
  assert.equal(severity, 3);

  const dominant = computeDominantDomain({ pain: 2, fatigue: 3, sleep: 1, stress: 0 });
  assert.equal(dominant, "fatigue");

  const tieDominant = computeDominantDomain({ pain: 2, fatigue: 2, sleep: 2, stress: 2 });
  assert.equal(tieDominant, "pain");
});

test("combineMultipliers mezcla fase y sintomas y respeta clamp", () => {
  const phase = getPhaseMultipliers("luteal_late");
  const symptoms = getSymptomMultipliers(1);
  const { intensity, volume } = combineMultipliers({ phaseMultipliers: phase, symptomMultipliers: symptoms, weight: 0.5 });

  assert.ok(approxEqual(intensity, 0.965));
  assert.ok(approxEqual(volume, 0.925));
});

test("clamp y enforceNoDoubleIncrease funcionan", () => {
  assert.equal(clamp(1.2), 1.1);
  assert.equal(clamp(0.7), 0.8);

  const result = enforceNoDoubleIncrease(1.08, 1.02);
  assert.equal(result.volume, 1);
});

test("computeRestExtra suma fase+sympt y extra por sueno", () => {
  const rest = computeRestExtra({ phaseRest: 40, symptomRest: 15, sleep: 2, mode: "phase" });
  assert.equal(rest, 85);
});

test("buildCycleAdjustment modo sintomas por anticoncepcion", () => {
  const adjustment = buildCycleAdjustment({
    config: {
      ...BASE_CONFIG,
      contraception_type: "combined"
    },
    dailyLog: {
      pain_0_3: 0,
      fatigue_0_3: 0,
      sleep_0_3: 0,
      stress_0_3: 0
    },
    hasRecentLogs: true,
    today: "2026-02-02"
  });

  assert.equal(adjustment.mode, "symptoms");
  assert.equal(adjustment.phase, null);
  assert.ok(approxEqual(adjustment.multipliers.intensity, 1));
  assert.ok(approxEqual(adjustment.multipliers.volume, 1));
});

test("buildCycleAdjustment modo fase con lutea tardia + severidad 1", () => {
  const adjustment = buildCycleAdjustment({
    config: BASE_CONFIG,
    dailyLog: {
      pain_0_3: 1,
      fatigue_0_3: 1,
      sleep_0_3: 0,
      stress_0_3: 0
    },
    hasRecentLogs: true,
    today: "2026-02-04"
  });

  assert.equal(adjustment.mode, "phase");
  assert.equal(adjustment.phase, "luteal_late");
  assert.ok(adjustment.multipliers.volume < 1);
  assert.ok(adjustment.restExtraSeconds > 0);
});

