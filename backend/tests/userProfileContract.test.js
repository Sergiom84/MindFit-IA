import test from "node:test";
import assert from "node:assert/strict";

import {
  buildProfileAwarePlanData,
  getProfileTrainingGoal,
  normalizeUserObjective,
  normalizeUserSex,
  recommendMethodologyFromProfile,
  resolveTrainingFrequency,
  validateOnboardingProfile
} from "../services/userProfileContract.js";
import {
  mapUserObjectiveToNutritionGoal,
  normalizeSexo
} from "../services/nutritionV2/userProfileNormalizers.js";
import { calculateBMRAudit } from "../services/nutritionCalculator.js";
import {
  buildFoodFiltersFromUserPreferences,
  matchesFoodFilters
} from "../services/nutritionV2/mealSelectionHelpers.js";

test("perfil: canoniza todos los objetivos ofrecidos por el onboarding", () => {
  assert.equal(normalizeUserObjective("fuerza"), "ganar_fuerza");
  assert.equal(normalizeUserObjective("ganar_fuerza"), "ganar_fuerza");
  assert.equal(normalizeUserObjective("mantener_forma"), "mantenimiento");
  assert.equal(normalizeUserObjective("mantenimiento"), "mantenimiento");
  assert.equal(normalizeUserObjective("ganar_musculo"), "ganar_masa_muscular");
});

test("perfil: conserva sexo otro y nutrición usa una fórmula neutra", () => {
  assert.equal(normalizeUserSex("otro"), "otro");
  assert.equal(normalizeSexo("otro"), "otro");

  const audit = calculateBMRAudit({
    sexo: "otro",
    peso_kg: 80,
    altura_cm: 175,
    edad: 30,
    actividad: "moderado"
  });

  assert.equal(audit.formula, "tinsley");
  assert.equal(audit.reason, "sex_neutral_profile");
  assert.equal(audit.bmr, 1994);
});

test("onboarding: exige un perfil completo y valida rangos antes de crear la cuenta", () => {
  const valid = validateOnboardingProfile({
    edad: "32",
    sexo: "otro",
    peso: "78",
    altura: "180",
    objetivoPrincipal: "fuerza",
    enfoqueEntrenamiento: "funcional"
  });

  assert.deepEqual(valid.invalidFields, []);
  assert.deepEqual(valid.normalized, {
    edad: 32,
    sexo: "otro",
    peso: 78,
    altura: 180,
    objetivoPrincipal: "ganar_fuerza",
    // ONB-P2-02: el enfoque conserva su valor real (antes 'funcional'→'general').
    enfoqueEntrenamiento: "funcional"
  });

  const invalid = validateOnboardingProfile({
    edad: 10,
    sexo: "",
    peso: 10,
    altura: 90,
    objetivoPrincipal: "desconocido",
    enfoqueEntrenamiento: "desconocido"
  });
  assert.deepEqual(invalid.invalidFields, [
    "edad",
    "sexo",
    "peso",
    "altura",
    "objetivoPrincipal",
    "enfoqueEntrenamiento"
  ]);
});

test("ONB-P2-02: el enfoque de entrenamiento conserva su valor real (HIIT no se transforma)", () => {
  for (const focus of ["fuerza", "hipertrofia", "resistencia", "funcional", "hiit", "mixto"]) {
    const { normalized, invalidFields } = validateOnboardingProfile({
      edad: 30, sexo: "masculino", peso: 75, altura: 178,
      objetivoPrincipal: "perder_peso", enfoqueEntrenamiento: focus
    });
    assert.deepEqual(invalidFields, []);
    assert.equal(normalized.enfoqueEntrenamiento, focus, `${focus} debe conservarse`);
  }
  // Alias de lectura legacy siguen siendo válidos.
  assert.equal(
    validateOnboardingProfile({ edad: 30, sexo: "masculino", peso: 75, altura: 178, objetivoPrincipal: "perder_peso", enfoqueEntrenamiento: "perdida_peso" }).normalized.enfoqueEntrenamiento,
    "perdida_peso"
  );
});

test("perfil: generación automática selecciona metodología y contexto del usuario", () => {
  const profile = {
    objetivo_principal: "ganar_fuerza",
    nivel_entrenamiento: "avanzado",
    frecuencia_semanal: 4
  };

  assert.equal(recommendMethodologyFromProfile(profile), "powerlifting");
  assert.equal(getProfileTrainingGoal(profile), "Aumentar fuerza");
  assert.deepEqual(buildProfileAwarePlanData({}, profile), {
    methodology: "powerlifting",
    selectedLevel: "avanzado",
    goals: "Aumentar fuerza",
    frecuencia_semanal: 4
  });
});

test("perfil: metodología preferida tiene prioridad y la frecuencia se adapta al motor", () => {
  assert.equal(
    recommendMethodologyFromProfile({
      metodologia_preferida: "calistenia",
      objetivo_principal: "ganar_fuerza"
    }),
    "calistenia"
  );
  assert.equal(resolveTrainingFrequency(2, 4, [3, 4, 5]), 3);
  assert.equal(resolveTrainingFrequency(6, 4, [3, 4, 5]), 5);
  assert.equal(resolveTrainingFrequency(4, 3, [3, 4, 5]), 4);
});

test("nutrición: fuerza se traduce a mantenimiento y respeta alimentos excluidos", () => {
  assert.equal(mapUserObjectiveToNutritionGoal("ganar_fuerza"), "mant");

  const filters = buildFoodFiltersFromUserPreferences({
    preferencias: { alimentos_excluidos: ["salmón"] },
    alergias: []
  });

  assert.equal(matchesFoodFilters({ nombre: "Salmón al horno" }, filters), false);
  assert.equal(matchesFoodFilters({ nombre: "Merluza al horno" }, filters), true);
});
