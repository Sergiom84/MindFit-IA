import test from "node:test";
import assert from "node:assert/strict";

import {
  computePairingPenaltyForRecipe,
  evaluateRecipeHardRules,
  isProcessedFood,
  normalizeProcessingLevel
} from "../services/menuHardRulesEngine.js";

function buildItem({
  id,
  nombre,
  slug = null,
  role,
  processing_level = "minimo",
  is_snack_only = false,
  is_main_dish_allowed = true,
  meal_suitability = { desayuno: true, comida: true, cena: true, snack: true },
  culinary_family = "general"
}) {
  return {
    role,
    food: {
      id,
      nombre,
      slug,
      processing_level,
      is_snack_only,
      is_main_dish_allowed,
      meal_suitability,
      culinary_family
    }
  };
}

test("menu hard rules: bloquea snack_only en comida principal", () => {
  const result = evaluateRecipeHardRules({
    mealType: "COMIDA",
    recipeCode: "R001",
    recipeItems: [
      buildItem({
        id: "f1",
        nombre: "Barrita proteica",
        role: "PROTEINA_ANIMAL_MAGRA",
        processing_level: "ultraprocesado",
        is_snack_only: true,
        is_main_dish_allowed: false,
        meal_suitability: { desayuno: true, comida: false, cena: false, snack: true },
        culinary_family: "snack_dulce"
      })
    ],
    varietyContext: null
  });

  assert.equal(result.isAllowed, false);
  assert.equal(result.blockedRules.some((rule) => rule.code === "snack_only_in_main_meal"), true);
});

test("menu hard rules: permite snack_only en SNACK", () => {
  const result = evaluateRecipeHardRules({
    mealType: "SNACK",
    recipeCode: "R002",
    recipeItems: [
      buildItem({
        id: "f2",
        nombre: "Barrita de cereal sin azúcar",
        role: "CARBO_BASE",
        processing_level: "ultraprocesado",
        is_snack_only: true,
        is_main_dish_allowed: false,
        meal_suitability: { desayuno: true, comida: false, cena: false, snack: true },
        culinary_family: "snack_dulce"
      })
    ],
    varietyContext: null
  });

  assert.equal(result.isAllowed, true);
});

test("menu hard rules: bloquea ultraprocesado como rol principal en cena", () => {
  const result = evaluateRecipeHardRules({
    mealType: "CENA",
    recipeCode: "R003",
    recipeItems: [
      buildItem({
        id: "f3",
        nombre: "Galletas tipo María",
        role: "CARBO_BASE",
        processing_level: "ultraprocesado",
        is_snack_only: false,
        is_main_dish_allowed: true,
        meal_suitability: { desayuno: true, comida: true, cena: true, snack: true },
        culinary_family: "snack_dulce"
      })
    ],
    varietyContext: null
  });

  assert.equal(result.isAllowed, false);
  assert.equal(result.blockedRules.some((rule) => rule.code === "ultraprocessed_main_role"), true);
});

test("menu hard rules: aplica limite diario de procesados", () => {
  const result = evaluateRecipeHardRules({
    mealType: "SNACK",
    recipeCode: "R004",
    recipeItems: [
      buildItem({
        id: "f4",
        nombre: "Queso batido",
        role: "LACTEO_PROTEICO_MAGRO",
        processing_level: "procesado",
        is_snack_only: false,
        is_main_dish_allowed: true,
        meal_suitability: { desayuno: true, comida: true, cena: true, snack: true },
        culinary_family: "lacteo"
      })
    ],
    varietyContext: {
      sameDayProcessedFoodIds: new Set(["already-processed-id"])
    },
    maxProcessedItemsPerDay: 1
  });

  assert.equal(result.isAllowed, false);
  assert.equal(result.blockedRules.some((rule) => rule.code === "daily_processed_limit"), true);
});

test("menu hard rules: normaliza nivel de procesado e identifica alimentos procesados", () => {
  assert.equal(normalizeProcessingLevel("ULTRAPROCESADO"), "ultraprocesado");
  assert.equal(normalizeProcessingLevel(null), "minimo");
  assert.equal(isProcessedFood({ processing_level: "procesado" }), true);
  assert.equal(isProcessedFood({ processing_level: "minimo" }), false);
});

test("menu hard rules: aplica forbidden_families desde regla DB", () => {
  const result = evaluateRecipeHardRules({
    mealType: "COMIDA",
    recipeCode: "R005",
    recipeItems: [
      buildItem({
        id: "f5",
        slug: "barrita-proteica",
        nombre: "Barrita proteica",
        role: "CARBO_BASE",
        processing_level: "procesado",
        culinary_family: "snack_dulce"
      })
    ],
    mealAcceptabilityRule: {
      forbidden_families: ["snack_dulce"]
    }
  });

  assert.equal(result.isAllowed, false);
  assert.equal(result.blockedRules.some((rule) => rule.code === "forbidden_family_by_rule"), true);
});

test("menu hard rules: aplica required_families desde regla DB", () => {
  const result = evaluateRecipeHardRules({
    mealType: "COMIDA",
    recipeCode: "R006",
    recipeItems: [
      buildItem({
        id: "f6",
        slug: "arroz-basmati",
        nombre: "Arroz basmati",
        role: "CARBO_BASE",
        processing_level: "minimo",
        culinary_family: "cereal"
      })
    ],
    mealAcceptabilityRule: {
      required_families: ["proteina_animal", "proteina_vegetal"]
    }
  });

  assert.equal(result.isAllowed, false);
  assert.equal(result.blockedRules.some((rule) => rule.code === "missing_required_family"), true);
});

test("menu hard rules: bloquea pairing prohibido desde DB", () => {
  const result = evaluateRecipeHardRules({
    mealType: "COMIDA",
    recipeCode: "R007",
    recipeItems: [
      buildItem({
        id: "f7a",
        slug: "aceite-linaza",
        nombre: "Aceite de linaza",
        role: "GRASA_BASE",
        culinary_family: "aceite"
      }),
      buildItem({
        id: "f7b",
        slug: "queso-cottage",
        nombre: "Queso cottage",
        role: "LACTEO_PROTEICO_MAGRO",
        culinary_family: "lacteo"
      })
    ],
    pairingRules: [
      {
        id: "rule-1",
        food_slug_a: "aceite-linaza",
        food_slug_b: "queso-cottage",
        rule_type: "forbidden",
        contexts: ["COMIDA"],
        reason: "Pairing no recomendado"
      }
    ]
  });

  assert.equal(result.isAllowed, false);
  assert.equal(result.blockedRules.some((rule) => rule.code === "forbidden_pairing_rule"), true);
});

test("menu hard rules: calcula penalty por pairing aplicable", () => {
  const result = computePairingPenaltyForRecipe({
    mealType: "SNACK",
    recipeItems: [
      buildItem({
        id: "p1",
        slug: "proteina_vegetal_soja",
        nombre: "Proteína vegetal (soja)",
        role: "SUPLEMENTO_PROTEINA",
        culinary_family: "suplemento"
      }),
      buildItem({
        id: "p2",
        slug: "galletas_tipo_maria",
        nombre: "Galletas tipo María",
        role: "CARBO_RAPIDO",
        culinary_family: "snack_dulce"
      })
    ],
    pairingRules: [
      {
        id: "penalty-1",
        food_slug_a: "proteina_vegetal_soja",
        food_slug_b: "galletas_tipo_maria",
        rule_type: "penalty",
        penalty: 30,
        contexts: ["SNACK"],
        reason: "Combinación poco apetecible"
      }
    ]
  });

  assert.equal(result.totalPenalty, 30);
  assert.equal(result.appliedPenaltyRules.length, 1);
});

test("menu hard rules: ignora penalty si contexto no aplica", () => {
  const result = computePairingPenaltyForRecipe({
    mealType: "COMIDA",
    recipeItems: [
      buildItem({
        id: "p3",
        slug: "aceite_de_linaza",
        nombre: "Aceite de linaza",
        role: "GRASA_BASE",
        culinary_family: "aceite"
      }),
      buildItem({
        id: "p4",
        slug: "queso_cottage",
        nombre: "Queso cottage",
        role: "LACTEO_PROTEICO_MAGRO",
        culinary_family: "lacteo"
      })
    ],
    pairingRules: [
      {
        id: "penalty-2",
        food_slug_a: "aceite_de_linaza",
        food_slug_b: "queso_cottage",
        rule_type: "penalty",
        penalty: 12,
        contexts: ["DESAYUNO", "SNACK"],
        reason: "Baja palatabilidad"
      }
    ]
  });

  assert.equal(result.totalPenalty, 0);
  assert.equal(result.appliedPenaltyRules.length, 0);
});
