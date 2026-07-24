import assert from "node:assert/strict";
import test from "node:test";

import { buildCrossfitProgramBlock } from "../services/crossfit/programming/blockBuilder.js";
import { CROSSFIT_PROGRAM_RULES } from "../services/crossfit/programming/programRules.js";

const START = "2026-07-27";

for (const [level, frequencies, weeks] of [
  ["beginner", [2, 3], 8],
  ["intermediate", [3, 4], 10],
  ["advanced", [4, 5], 12]
]) {
  for (const frequency of frequencies) {
    test(`construye bloque ${level} de ${frequency} días`, () => {
      const result = buildCrossfitProgramBlock({ level, frequency, start_date: START, seed: "table" });

      assert.equal(result.ok, true);
      assert.equal(result.block_weeks, weeks);
      assert.equal(result.weeks.length, weeks);
      assert.ok(result.weeks.every((week) => week.sessions.length === frequency));
      assert.equal(result.doubles_allowed, false);
      assert.equal(result.elite_in_scope, false);
      assert.ok(result.weeks.every((week) => week.sessions.every((session) => session.stop_rules_required)));
    });
  }
}

test("rechaza frecuencia, nivel y tiempo no soportados sin densificar", () => {
  const invalidFrequency = buildCrossfitProgramBlock({ level: "beginner", frequency: 4, start_date: START });
  const elite = buildCrossfitProgramBlock({ level: "Elite", frequency: 5, start_date: START });
  const short = buildCrossfitProgramBlock({
    level: "intermediate",
    frequency: 4,
    start_date: START,
    available_minutes: 40
  });

  assert.deepEqual(invalidFrequency.reason_codes, ["FREQUENCY_UNSUPPORTED"]);
  assert.deepEqual(invalidFrequency.supported_frequencies, [2, 3]);
  assert.deepEqual(elite.reason_codes, ["LEVEL_CONFIDENCE_LOW"]);
  assert.deepEqual(short.reason_codes, ["SESSION_TIME_EXCEEDED"]);
});

test("las descargas y reevaluaciones no introducen skills ni progresan variables", () => {
  for (const level of Object.keys(CROSSFIT_PROGRAM_RULES)) {
    const rules = CROSSFIT_PROGRAM_RULES[level];
    const result = buildCrossfitProgramBlock({
      level,
      frequency: rules.recommended_frequency,
      start_date: START
    });
    const deloads = result.weeks.filter((week) => week.is_deload);

    assert.ok(deloads.length >= 1);
    assert.ok(deloads.every((week) => week.new_skills_max === 0));
    assert.ok(deloads.every((week) => week.sessions.every((session) =>
      session.progress_variable === "none" && !session.new_skill_allowed)));
  }
});

test("respeta los límites de D2 de cada nivel y frecuencia", () => {
  for (const [level, frequency, expected] of [
    ["beginner", 2, 0],
    ["beginner", 3, 1],
    ["intermediate", 3, 2],
    ["intermediate", 4, 2],
    ["advanced", 4, 2],
    ["advanced", 5, 3]
  ]) {
    const result = buildCrossfitProgramBlock({ level, frequency, start_date: START });
    for (const week of result.weeks) {
      assert.ok(week.sessions.filter((session) => session.training_load_class === "D2").length <= expected);
    }
  }
});

test("el protocolo de retorno reduce volumen, elimina D2 y skills durante su ventana", () => {
  const result = buildCrossfitProgramBlock({
    level: "advanced",
    frequency: 5,
    start_date: START,
    return_protocol: {
      volume_reduction: 0.35,
      duration_weeks: 2,
      skill_tier_reduction: 1,
      requires_reassessment: false
    }
  });

  for (const week of result.weeks.slice(0, 2)) {
    assert.equal(week.new_skills_max, 0);
    assert.ok(week.volume_multiplier < CROSSFIT_PROGRAM_RULES.advanced.week_profiles[week.week_number - 1][1]);
    assert.ok(week.sessions.every((session) => session.training_load_class !== "D2"));
  }
  assert.deepEqual(result.reason_codes, ["RETURN_PROTOCOL_REQUIRED"]);
});

test("misma entrada produce bloque, sesiones y fechas idénticos", () => {
  const input = { level: "intermediate", frequency: 4, start_date: START, seed: "stable" };
  assert.deepEqual(buildCrossfitProgramBlock(input), buildCrossfitProgramBlock(input));
});

test("las fechas respetan separaciones del microciclo sin usar zona horaria local", () => {
  const result = buildCrossfitProgramBlock({ level: "beginner", frequency: 3, start_date: START });
  assert.deepEqual(
    result.weeks[0].sessions.map((session) => session.scheduled_date),
    ["2026-07-27", "2026-07-29", "2026-07-31"]
  );
  assert.equal(result.weeks[1].sessions[0].scheduled_date, "2026-08-03");
});
