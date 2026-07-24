import test from "node:test";
import assert from "node:assert/strict";
import { buildShoppingList } from "../../src/components/nutrition/shoppingListBuilder.js";

function v2Plan() {
  return {
    days: [
      {
        day_index: 0,
        meals: [{
          nombre: "Comida",
          items: [
            {
              food_id: "food-rice",
              food_nombre: "Arroz",
              food_categoria: "cereal",
              cantidad_g_mostrada: 150,
              estado_pesado_mostrado: "cocido"
            },
            {
              food_id: "food-chicken",
              food_nombre: "Pavo sustituido",
              food_categoria: "proteina",
              cantidad_g_mostrada: 180,
              estado_pesado_mostrado: "cocido"
            }
          ]
        }]
      },
      {
        day_index: 1,
        meals: [{
          nombre: "Cena",
          items: [
            {
              food_id: "food-rice",
              food_nombre: "Arroz",
              food_categoria: "cereal",
              cantidad_g_mostrada: 100,
              estado_pesado_mostrado: "cocido"
            },
            {
              food_id: "food-rice",
              food_nombre: "Arroz",
              food_categoria: "cereal",
              cantidad_g_mostrada: 80,
              estado_pesado_mostrado: "seco"
            }
          ]
        }]
      }
    ]
  };
}

test("lista V2 agrega gramajes actuales y conserva la sustitución persistida", () => {
  const result = buildShoppingList(v2Plan());
  assert.equal(result.source, "nutrition-v2");
  assert.equal(result.itemCount, 3);
  assert.deepEqual(
    result.categories.carbohidratos.map((item) => item.totalAmount),
    ["250 g (cocido)", "80 g (seco)"]
  );
  assert.equal(result.categories.proteinas[0].name, "Pavo sustituido");
  assert.equal(result.categories.proteinas[0].totalAmount, "180 g (cocido)");
});

test("lista V2 es determinista y no mezcla estados de pesado", () => {
  const first = buildShoppingList(v2Plan());
  const second = buildShoppingList(v2Plan());
  assert.deepEqual(second, first);
  assert.equal(first.categories.carbohidratos.length, 2);
});

test("lista vacía informa cero ítems sin fabricar ingredientes", () => {
  assert.deepEqual(buildShoppingList({ days: [{ day_index: 0, meals: [] }] }), {
    categories: {},
    itemCount: 0,
    source: "nutrition-v2"
  });
});
