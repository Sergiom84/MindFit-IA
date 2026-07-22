import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { parseCsv } from "../services/crossfit/catalog/csv.js";
import { validateCrossfitPlan } from "../services/crossfit/contracts/schemas.js";
import { generateCrossfitPlanV2, resolveCrossfitPlanGeneration } from "../services/crossfit/generator/planGenerator.js";
import { CROSSFIT_INVARIANT_DEFINITIONS, validateGeneratedCrossfitPlan } from "../services/crossfit/generator/planValidator.js";
import {
  allCrossfitEquipment,
  allCrossfitSkillPermissions,
  loadCrossfitCatalogFixture
} from "./helpers/crossfitCatalogFixture.js";

const catalog = loadCrossfitCatalogFixture();
const profile = { available_equipment: allCrossfitEquipment(catalog) };
const skillPermissions = allCrossfitSkillPermissions(catalog);

function input(overrides = {}) {
  return {
    request_id: "req_generator_test",
    idempotency_key: "idem_generator_test",
    user_id: "usr_generator_test",
    classification_id: "cfc_generator_test",
    seed: "generator-test-seed",
    generated_at: "2026-07-22T10:00:00.000Z",
    start_date: "2026-07-27",
    level: "beginner",
    frequency: 3,
    catalog,
    profile,
    skill_permissions: skillPermissions,
    ...overrides
  };
}

test("las 44 invariantes implementadas corresponden uno a uno al expediente", () => {
  const csv = parseCsv(fs.readFileSync(
    new URL("../../docs/crossfit/data/generator_invariants.csv", import.meta.url),
    "utf8"
  ));
  assert.equal(CROSSFIT_INVARIANT_DEFINITIONS.length, 44);
  assert.deepEqual(
    CROSSFIT_INVARIANT_DEFINITIONS.map((item) => item.id),
    csv.map((row) => row.id)
  );
  assert.deepEqual(
    CROSSFIT_INVARIANT_DEFINITIONS.map((item) => item.reason_code),
    csv.map((row) => row.reason_code)
  );
});

for (const [level, frequency] of [
  ["beginner", 2], ["beginner", 3],
  ["intermediate", 3], ["intermediate", 4],
  ["advanced", 4], ["advanced", 5]
]) {
  test(`genera y valida plan completo ${level}/${frequency}`, () => {
    const result = generateCrossfitPlanV2(input({ level, frequency, seed: `${level}-${frequency}` }));

    assert.equal(result.ok, true, JSON.stringify(result.validation?.findings ?? result, null, 2));
    assert.equal(result.plan.weeks.length, { beginner: 8, intermediate: 10, advanced: 12 }[level]);
    assert.equal(result.plan.weeks.every((week) => week.sessions.length === frequency), true);
    assert.equal(validateCrossfitPlan(result.plan).valid, true);
    assert.equal(validateGeneratedCrossfitPlan(result.plan, {
      catalog,
      frequency,
      profile,
      skill_permissions: skillPermissions
    }).hard_violations.length, 0);
  });
}

test("misma entrada produce JSON idéntico y cambios de seed cambian la revisión material", () => {
  const stableInput = input();
  const first = generateCrossfitPlanV2(stableInput);
  const second = generateCrossfitPlanV2(stableInput);
  const changed = generateCrossfitPlanV2(input({ seed: "different-seed" }));

  assert.deepEqual(first, second);
  assert.notEqual(first.plan.plan_id, changed.plan.plan_id);
  assert.notDeepEqual(first.plan.weeks, changed.plan.weeks);
});

test("flag generation apagado conserva el comportamiento sin generar", () => {
  const result = resolveCrossfitPlanGeneration(input(), {});
  assert.deepEqual(result, { enabled: false, generated: false, plan: null, reason_codes: [] });
});

test("falla cerrado ante equipo insuficiente y seguridad bloqueante", () => {
  const equipment = generateCrossfitPlanV2(input({
    catalog: catalog.filter((movement) => movement.canonical_id === "front_squat"),
    profile: { available_equipment: [] }
  }));
  const redFlag = generateCrossfitPlanV2(input({ check_in: { red_flags: ["dolor torácico"] } }));

  assert.equal(equipment.ok, false);
  assert.ok(equipment.reason_codes.some((code) => ["EQUIPMENT_UNAVAILABLE", "WOD_PAIRING_PROHIBITED"].includes(code)));
  assert.equal(redFlag.ok, false);
  assert.ok(redFlag.reason_codes.includes("SAFETY_RED_FLAG"));
});

test("requiere timestamp y claves explícitas para idempotencia", () => {
  assert.deepEqual(generateCrossfitPlanV2(input({ generated_at: undefined })).reason_codes, ["IDEMPOTENCY_BROKEN"]);
  assert.deepEqual(generateCrossfitPlanV2(input({ idempotency_key: "" })).reason_codes, ["IDEMPOTENCY_BROKEN"]);
});

test("ningún plan contiene Elite ni movimientos fuera de catálogo activo", () => {
  const result = generateCrossfitPlanV2(input({ level: "advanced", frequency: 5 }));
  const active = new Set(catalog.filter((movement) => movement.active).map((movement) => movement.canonical_id));
  const movementIds = result.plan.weeks.flatMap((week) => week.sessions)
    .flatMap((session) => session.wod.movements)
    .map((movement) => movement.canonical_movement_id);

  assert.ok(movementIds.every((id) => active.has(id)));
  assert.equal(result.plan.level, "advanced");
});

test("los validadores detectan cap, stop rules, equipo y secuencia D2 manipulados", () => {
  const generated = generateCrossfitPlanV2(input());
  const invalid = structuredClone(generated.plan);
  invalid.weeks[0].sessions[0].wod.time_cap_seconds = 1;
  invalid.weeks[0].sessions[0].wod.stop_rules = [];
  invalid.weeks[0].sessions[1].training_load.day_type = "D2";
  invalid.weeks[0].sessions[1].training_load.load_tier = "high";
  invalid.weeks[0].sessions[2].training_load.day_type = "D2";
  invalid.weeks[0].sessions[2].training_load.load_tier = "high";
  const validation = validateGeneratedCrossfitPlan(invalid, {
    catalog,
    frequency: 3,
    profile: { available_equipment: [] },
    skill_permissions: skillPermissions
  });
  const ids = new Set(validation.hard_violations.map((finding) => finding.id));

  assert.ok(ids.has("CF-WOD-002"));
  assert.ok(ids.has("CF-SES-005"));
  assert.ok(ids.has("CF-EX-002"));
  assert.ok(ids.has("CF-WEEK-001") || ids.has("CF-WEEK-002"));
});
