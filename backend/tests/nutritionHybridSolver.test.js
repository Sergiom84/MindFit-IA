import test from "node:test";
import assert from "node:assert/strict";

import { solveHybridMenu } from "../services/nutritionHybridSolver.js";

const selectedFoods = [
  {
    id: "a1",
    slug: "pollo",
    nombre: "Pechuga de pollo",
    grupo_factor: "carne",
    estado_pesado_base: "crudo",
    estado_pesado_mostrado_default: "cocido",
    macros_100g: { protein_g: 31, carbs_g: 0, fat_g: 3.5, kcal: 165 }
  },
  {
    id: "b2",
    slug: "arroz-cocido",
    nombre: "Arroz cocido",
    grupo_factor: "cereal",
    estado_pesado_base: "cocido",
    estado_pesado_mostrado_default: "cocido",
    macros_100g: { protein_g: 2.7, carbs_g: 28, fat_g: 0.3, kcal: 130 }
  },
  {
    id: "c3",
    slug: "brocoli",
    nombre: "Brócoli",
    grupo_factor: "verdura",
    estado_pesado_base: "tal_cual",
    estado_pesado_mostrado_default: "tal_cual",
    macros_100g: { protein_g: 2.8, carbs_g: 7, fat_g: 0.4, kcal: 34 }
  },
  {
    id: "d4",
    slug: "aceite-oliva",
    nombre: "Aceite de oliva",
    grupo_factor: "aceite",
    estado_pesado_base: "tal_cual",
    estado_pesado_mostrado_default: "tal_cual",
    macros_100g: { protein_g: 0, carbs_g: 0, fat_g: 100, kcal: 900 }
  }
];

test("hybrid solver: genera menú con validación y errores acotados", () => {
  const meal = {
    nombre: "Comida",
    kcal: 720,
    macros: { protein_g: 50, carbs_g: 72, fat_g: 22 }
  };

  const result = solveHybridMenu({
    meal,
    selectedFoods,
    conversionFactors: [
      {
        grupo_factor: "carne",
        estado_base: "crudo",
        estado_objetivo: "cocido",
        factor_base_objetivo: 0.75
      }
    ]
  });

  assert.equal(Array.isArray(result.menu.items), true);
  assert.ok(result.menu.items.length >= 3);

  const validation = result.menu.validacion;
  const maxError = Math.max(
    validation.error_kcal_porcentaje,
    validation.error_protein_porcentaje,
    validation.error_carbs_porcentaje,
    validation.error_fat_porcentaje
  );

  assert.ok(maxError <= 35);
});

test("hybrid solver: bloquea conversión cuando falta factor y fuerza estado base", () => {
  const meal = {
    nombre: "Comida",
    kcal: 650,
    macros: { protein_g: 45, carbs_g: 55, fat_g: 20 }
  };

  const result = solveHybridMenu({
    meal,
    selectedFoods,
    conversionFactors: []
  });

  const pollo = result.menu.items.find((item) => item.food_slug === "pollo");
  assert.ok(pollo);
  assert.equal(pollo.estado_pesado_base, "crudo");
  assert.equal(pollo.estado_pesado_mostrado, "crudo");
  assert.equal(pollo.cantidad_g_mostrada, pollo.cantidad_g_base);
  assert.equal(pollo.conversion_blocked_reason, "missing_conversion_factor");
});
