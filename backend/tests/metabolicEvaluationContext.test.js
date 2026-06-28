import test from "node:test";
import assert from "node:assert/strict";

import {
  buildMetabolicEvaluationContextFromRow,
  getMissingMetabolicEvaluationFields
} from "../services/metabolicEvaluationContext.js";

test("metabolic evaluation context: prioriza nutrition_profiles y hace fallback a users", () => {
  const context = buildMetabolicEvaluationContextFromRow({
    nutrition_sexo: "hombre",
    nutrition_edad: 36,
    altura_cm: 178,
    peso_kg: 82.4,
    nutrition_objetivo: "cut",
    kcal_objetivo: 2450,
    tdee: 2700,
    level: "intermedio",
    user_sexo: "mujer",
    user_edad: 45,
    user_altura_cm: 165,
    user_peso_kg: 71,
    user_objetivo_principal: "ganar_masa_muscular",
    user_training_days: 5,
    user_level: "avanzado"
  });

  assert.equal(context.userProfile.sexo, "hombre");
  assert.equal(context.userProfile.edad, 36);
  assert.equal(context.userProfile.altura_cm, 178);
  assert.equal(context.userProfile.peso_kg, 82.4);
  assert.equal(context.userProfile.objetivo, "cut");
  assert.equal(context.userProfile.kcal_objetivo, 2450);
  assert.equal(context.userProfile.tdee, 2700);
  assert.equal(context.userProfile.level, "intermedio");
});

test("metabolic evaluation context: usa fallback de users cuando faltan datos en nutricion", () => {
  const context = buildMetabolicEvaluationContextFromRow({
    nutrition_sexo: null,
    nutrition_edad: null,
    altura_cm: null,
    peso_kg: null,
    nutrition_objetivo: null,
    kcal_objetivo: null,
    tdee: 2300,
    level: null,
    user_sexo: "mujer",
    user_edad: 31,
    user_altura_cm: 169,
    user_peso_kg: 63.5,
    user_objetivo_principal: "perder_peso",
    user_training_days: 4,
    user_level: "principiante"
  });

  assert.equal(context.userProfile.sexo, "mujer");
  assert.equal(context.userProfile.edad, 31);
  assert.equal(context.userProfile.altura_cm, 169);
  assert.equal(context.userProfile.peso_kg, 63.5);
  assert.equal(context.userProfile.objetivo, "cut");
  assert.equal(context.userProfile.training_days, 4);
  assert.equal(context.userProfile.level, "principiante");
});

test("metabolic evaluation context: detecta campos mínimos ausentes", () => {
  const missing = getMissingMetabolicEvaluationFields({
    peso_kg: null,
    objetivo: null
  });

  assert.deepEqual(missing, ["peso", "objetivo"]);
});
