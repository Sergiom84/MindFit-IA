import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateMacrosWithMetabolicProfile,
  processMetabolicEvaluation
} from "../services/metabolicProfileCalculator.js";
import { MACRO_RULESET_VERSION } from "../services/macroProfilePhaseResolver.js";

test("metabolicProfileCalculator: evaluation y wrapper comparten la misma salida de macros", () => {
  const userProfile = {
    peso_kg: 80,
    objetivo: "cut",
    training_type: "general",
    kcal_objetivo: 2400,
    level: "intermedio"
  };

  const answers = {
    somnolencia_carbs: "no",
    energia_estable_carbs: "no",
    hambre_nocturna: "no",
    dormir_mejor_fruta: "no",
    preferencia_graso_salado: "no",
    preferencia_dulces: "no",
    acumula_grasa_abdominal: "no",
    sin_comer_sin_sintomas: "no",
    cansancio_matutino: "no",
    responde_bien_hidratos: "no"
  };

  const wrapperResult = calculateMacrosWithMetabolicProfile(2400, 80, "mixto", "cut", "general", "intermedio", "alta");
  const evaluationResult = processMetabolicEvaluation(answers, userProfile);

  assert.equal(evaluationResult.appliedProfile, "mixto");
  assert.equal(evaluationResult.ruleset, MACRO_RULESET_VERSION);
  assert.deepEqual(evaluationResult.macros.template_pct, wrapperResult.template_pct);
  assert.deepEqual(evaluationResult.macros.final_pct, wrapperResult.final_pct);
  assert.equal(evaluationResult.macros.protein_g, wrapperResult.protein_g);
  assert.equal(evaluationResult.macros.carbs_g, wrapperResult.carbs_g);
  assert.equal(evaluationResult.macros.fat_g, wrapperResult.fat_g);
});

test("metabolicProfileCalculator: confianza baja sigue forzando mixto con la tabla nueva", () => {
  const userProfile = {
    peso_kg: 80,
    objetivo: "mant",
    training_type: "general",
    kcal_objetivo: 2400,
    level: "intermedio"
  };

  const answers = {
    somnolencia_carbs: "si",
    energia_estable_carbs: "no_se",
    hambre_nocturna: "no_se",
    dormir_mejor_fruta: "no_se",
    preferencia_graso_salado: "si",
    preferencia_dulces: "no_se",
    acumula_grasa_abdominal: "si",
    sin_comer_sin_sintomas: "no_se",
    cansancio_matutino: "no_se",
    responde_bien_hidratos: "no_se"
  };

  const evaluationResult = processMetabolicEvaluation(answers, userProfile);

  assert.equal(evaluationResult.confidence, "baja");
  assert.ok(evaluationResult.adjustedScore >= 4);
  assert.equal(evaluationResult.calculatedProfile, "mixto");
  assert.equal(evaluationResult.appliedProfile, "mixto");
  assert.deepEqual(evaluationResult.macros.template_pct, {
    protein_pct: 25,
    carbs_pct: 40,
    fat_pct: 35
  });
  assert.equal(evaluationResult.macros.ruleset, MACRO_RULESET_VERSION);
});
