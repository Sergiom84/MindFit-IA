import "./helpers/muteConsole.js";
import test from "node:test";
import assert from "node:assert/strict";

import { generateCalisteniaSingleDay } from "../services/singleDay/calisteniaSingleDay.js";
import {
  wristInjuryProfile,
  healthyBeginnerProfile,
  buildCalisteniaExercisePool,
  makeSingleDayDbMock
} from "./fixtures/calisteniaProfiles.js";

/**
 * PR-CAL-01 (corrección de Sergio, punto 7): single-day debe compartir el MISMO assessment
 * determinista que el flujo multi-semana, no una normalización de nivel duplicada. Flag ON por
 * defecto (isCalisthenicsAssessmentEnabled sin env var -> true).
 */

test("single-day: painStatus 'acute' -> refer (422 tipado), no genera sesión", async () => {
  const db = makeSingleDayDbMock(buildCalisteniaExercisePool());
  await assert.rejects(
    () => generateCalisteniaSingleDay(db, wristInjuryProfile.userId, "Intermedio", true, {
      selectionMode: "full_body",
      profileLoader: async () => wristInjuryProfile,
      assessmentInput: { painStatus: "acute" }
    }),
    (err) => {
      assert.equal(err.statusCode, 422);
      assert.equal(err.code, "CALISTHENICS_ASSESSMENT_REFER");
      assert.equal(err.publicEvaluation.decision, "refer");
      return true;
    }
  );
});

test("single-day: sin nivel/demonstratedLevel/self-report y sin nivel explícito -> 422 CALISTHENICS_LEVEL_REQUIRED (nunca 'Principiante' silencioso)", async () => {
  const db = makeSingleDayDbMock(buildCalisteniaExercisePool());
  await assert.rejects(
    () => generateCalisteniaSingleDay(db, 900098, null, true, {
      selectionMode: "full_body",
      profileLoader: async () => { throw new Error("perfil no disponible"); },
      assessmentInput: {}
    }),
    (err) => {
      assert.equal(err.statusCode, 422);
      assert.equal(err.code, "CALISTHENICS_LEVEL_REQUIRED");
      return true;
    }
  );
});

test("single-day: rawNivel reconocible ('Intermedio') se acepta como self-report válido -> decision 'ok', level_source='assessment'", async () => {
  const db = makeSingleDayDbMock(buildCalisteniaExercisePool());
  const { workout } = await generateCalisteniaSingleDay(db, healthyBeginnerProfile.userId, "Intermedio", true, {
    selectionMode: "full_body",
    profileLoader: async () => { throw new Error("perfil no disponible"); },
    assessmentInput: {}
  });
  assert.equal(workout.level_source, "assessment");
  assert.equal(workout.assessment.decision, "ok");
  assert.equal(workout.nivel, "Intermedio");
  assert.ok(workout.exercises.length > 0);
});

test("single-day: rawNivel explícito pero NO reconocible por el registry -> 422 CALISTHENICS_LEVEL_INVALID (nunca 'Principiante' silencioso)", async () => {
  const db = makeSingleDayDbMock(buildCalisteniaExercisePool());
  await assert.rejects(
    () => generateCalisteniaSingleDay(db, 900097, "nivel-raro-del-selector-legacy", true, {
      selectionMode: "full_body",
      profileLoader: async () => { throw new Error("perfil no disponible"); },
      assessmentInput: {}
    }),
    (err) => {
      assert.equal(err.statusCode, 422);
      assert.equal(err.code, "CALISTHENICS_LEVEL_INVALID");
      return true;
    }
  );
});

test("single-day: rawNivel explícito VÁLIDO no reconocido por el assessment (self-report distinto) -> user_selected, nivel canónico", async () => {
  // El assessment recibe un selfReportedLevel inválido -> insufficient_data, pero rawNivel es un
  // nivel válido del selector -> se acepta como fallback user_selected (nunca 422).
  const db = makeSingleDayDbMock(buildCalisteniaExercisePool());
  const { workout } = await generateCalisteniaSingleDay(db, 900097, "avanzado", true, {
    selectionMode: "full_body",
    profileLoader: async () => { throw new Error("perfil no disponible"); },
    assessmentInput: { selfReportedLevel: "nivel-invalido" }
  });
  assert.equal(workout.level_source, "user_selected");
  assert.equal(workout.assessment.decision, "insufficient_data");
  assert.equal(workout.nivel, "Avanzado");
  assert.ok(workout.exercises.length > 0);
});

test("single-day: selfReportedLevel válido -> assessment 'ok', level_source='assessment'", async () => {
  const db = makeSingleDayDbMock(buildCalisteniaExercisePool());
  const { workout } = await generateCalisteniaSingleDay(db, healthyBeginnerProfile.userId, null, true, {
    selectionMode: "full_body",
    profileLoader: async () => healthyBeginnerProfile,
    assessmentInput: { selfReportedLevel: "avanzado", demonstratedLevel: "avanzado" }
  });
  assert.equal(workout.level_source, "assessment");
  assert.equal(workout.nivel, "Avanzado");
  assert.equal(workout.assessment.decision, "ok");
});

test("single-day: rollback de flag (CALISTHENICS_ASSESSMENT_V1_ENABLED=false) -> comportamiento legacy fuzzy, sin refer", async () => {
  const saved = process.env.CALISTHENICS_ASSESSMENT_V1_ENABLED;
  process.env.CALISTHENICS_ASSESSMENT_V1_ENABLED = "false";
  try {
    const db = makeSingleDayDbMock(buildCalisteniaExercisePool());
    // Con el flag OFF, un painStatus 'acute' NO debe bloquear (comportamiento legacy, sin gate).
    const { workout } = await generateCalisteniaSingleDay(db, wristInjuryProfile.userId, "Intermedio", true, {
      selectionMode: "full_body",
      profileLoader: async () => wristInjuryProfile,
      assessmentInput: { painStatus: "acute" }
    });
    assert.equal(workout.level_source, "legacy_resolution");
    assert.equal(workout.assessment, null);
  } finally {
    if (saved === undefined) delete process.env.CALISTHENICS_ASSESSMENT_V1_ENABLED;
    else process.env.CALISTHENICS_ASSESSMENT_V1_ENABLED = saved;
  }
});
