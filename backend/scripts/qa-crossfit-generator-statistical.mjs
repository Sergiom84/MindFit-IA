import os from "node:os";
import { isMainThread, parentPort, workerData, Worker } from "node:worker_threads";

import { generateCrossfitPlanV2 } from "../services/crossfit/generator/planGenerator.js";
import { stableCrossfitJson } from "../services/crossfit/generator/deterministic.js";
import { crossfitEquipmentAvailable } from "../services/crossfit/generator/wodComposer.js";
import { evaluateCrossfitSafety } from "../services/crossfit/safety/safetyEvaluator.js";
import {
  allCrossfitEquipment,
  allCrossfitSkillPermissions,
  loadCrossfitCatalogFixture
} from "../tests/helpers/crossfitCatalogFixture.js";

const LEVELS = ["beginner", "intermediate", "advanced"];
const FREQUENCIES = Object.freeze({ beginner: [2, 3], intermediate: [3, 4], advanced: [4, 5] });

function numberArg(name, fallback) {
  const prefix = `--${name}=`;
  const value = process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length);
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} debe ser entero positivo`);
  return parsed;
}

function profileFor(index, allEquipment) {
  const variant = index % 4;
  if (variant === 1) return { profile: { available_equipment: [] }, check_in: {} };
  if (variant === 2) {
    return {
      profile: { available_equipment: ["dumbbells", "box", "jump_rope", "space", "band"] },
      check_in: {}
    };
  }
  if (variant === 3) {
    return {
      profile: { available_equipment: allEquipment },
      check_in: { pain: { score: 3, locations: ["hombro"] } }
    };
  }
  return { profile: { available_equipment: allEquipment }, check_in: {} };
}

function emptySummary() {
  return {
    generated: 0,
    blocked_expected: 0,
    invalid: 0,
    non_reproducible: 0,
    unavailable_equipment: 0,
    contraindicated: 0,
    generation_failures: {},
    failure_samples: [],
    hard_violations: {},
    formats: {},
    frequencies: {}
  };
}

function increment(object, key, value = 1) {
  object[key] = (object[key] ?? 0) + value;
}

function mergeSummary(target, source) {
  for (const key of [
    "generated", "blocked_expected", "invalid", "non_reproducible", "unavailable_equipment", "contraindicated"
  ]) target[key] += source[key];
  for (const key of ["generation_failures", "hard_violations", "formats", "frequencies"]) {
    for (const [name, count] of Object.entries(source[key])) increment(target[key], name, count);
  }
  target.failure_samples.push(...source.failure_samples.slice(0, Math.max(0, 10 - target.failure_samples.length)));
}

function validateSelectedMovements(plan, catalogById, profile, checkIn, summary) {
  for (const prescribed of plan.weeks.flatMap((week) => week.sessions)
    .flatMap((session) => session.wod.movements)) {
    const movement = catalogById.get(prescribed.canonical_movement_id);
    const available = profile.available_equipment ?? [];
    if (!movement || !crossfitEquipmentAvailable(movement.equipment, available)) {
      summary.unavailable_equipment += 1;
      continue;
    }
    const safety = evaluateCrossfitSafety({ profile, movement, checkIn });
    if (safety.blocked || !safety.movement_allowed) summary.contraindicated += 1;
  }
}

function runWorker({ jobs, perLevel }) {
  const catalog = loadCrossfitCatalogFixture();
  const catalogById = new Map(catalog.map((movement) => [movement.canonical_id, movement]));
  const allEquipment = allCrossfitEquipment(catalog);
  const skillPermissions = allCrossfitSkillPermissions(catalog);
  const summary = Object.fromEntries(LEVELS.map((level) => [level, emptySummary()]));
  for (let job = workerData?.workerIndex ?? 0; job < jobs; job += workerData?.workerCount ?? 1) {
    const levelIndex = Math.floor(job / perLevel);
    const index = job % perLevel;
    const level = LEVELS[levelIndex];
    const frequency = FREQUENCIES[level][index % 2];
    const scenario = profileFor(index, allEquipment);
    const seed = `stat-${level}-${frequency}-${index}`;
    const input = {
      request_id: `req_${level}_${index}`,
      idempotency_key: `idem_${level}_${index}`,
      user_id: `synthetic_${level}_${index}`,
      classification_id: `classification_${level}_${index}`,
      seed,
      generated_at: "2026-07-22T12:00:00.000Z",
      start_date: "2026-07-27",
      level,
      frequency,
      catalog,
      profile: scenario.profile,
      check_in: scenario.check_in,
      skill_permissions: skillPermissions,
      include_validation_warnings: false
    };
    const first = generateCrossfitPlanV2(input);
    const second = generateCrossfitPlanV2(input);
    const levelSummary = summary[level];
    increment(levelSummary.frequencies, String(frequency));
    if (!first.ok || !second.ok) {
      levelSummary.invalid += 1;
      for (const code of first.reason_codes ?? ["UNKNOWN_GENERATION_FAILURE"]) {
        increment(levelSummary.generation_failures, code);
      }
      if (levelSummary.failure_samples.length < 10) {
        levelSummary.failure_samples.push({ index, frequency, reason_codes: first.reason_codes ?? [] });
      }
      for (const finding of first.validation?.hard_violations ?? []) {
        increment(levelSummary.hard_violations, finding.id);
      }
      continue;
    }
    levelSummary.generated += 1;
    if (stableCrossfitJson(first.plan) !== stableCrossfitJson(second.plan)) levelSummary.non_reproducible += 1;
    validateSelectedMovements(first.plan, catalogById, scenario.profile, scenario.check_in, levelSummary);
    for (const session of first.plan.weeks.flatMap((week) => week.sessions)) {
      increment(levelSummary.formats, session.wod.format);
    }
  }
  return summary;
}

if (!isMainThread) {
  parentPort.postMessage(runWorker(workerData));
} else {
  const perLevel = numberArg("per-level", 10000);
  const requestedWorkers = numberArg("workers", Math.max(1, Math.min(8, os.availableParallelism() - 1)));
  const workerCount = Math.min(requestedWorkers, perLevel * LEVELS.length);
  const jobs = perLevel * LEVELS.length;
  const startedAt = Date.now();
  const results = await Promise.all(Array.from({ length: workerCount }, (_, workerIndex) =>
    new Promise((resolve, reject) => {
      const worker = new Worker(new URL(import.meta.url), {
        workerData: { workerIndex, workerCount, jobs, perLevel }
      });
      worker.once("message", resolve);
      worker.once("error", reject);
      worker.once("exit", (code) => {
        if (code !== 0) reject(new Error(`worker ${workerIndex} terminó con código ${code}`));
      });
    })));
  const summary = Object.fromEntries(LEVELS.map((level) => [level, emptySummary()]));
  for (const result of results) {
    for (const level of LEVELS) mergeSummary(summary[level], result[level]);
  }
  const failed = LEVELS.some((level) => {
    const item = summary[level];
    return item.generated !== perLevel
      || item.invalid > 0
      || item.non_reproducible > 0
      || item.unavailable_equipment > 0
      || item.contraindicated > 0
      || Object.keys(item.hard_violations).length > 0
      || FREQUENCIES[level].some((frequency) => !item.frequencies[frequency]);
  });
  const output = {
    gate_version: "crossfit-statistical-gate/2.0.0",
    per_level: perLevel,
    total_plans: perLevel * LEVELS.length,
    regenerated_plans: perLevel * LEVELS.length,
    workers: workerCount,
    duration_ms: Date.now() - startedAt,
    status: failed ? "failed" : "passed",
    levels: summary
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (failed) process.exitCode = 1;
}
