/**
 * Curado de nombres de recetas con IA (receta por receta en lotes).
 * - Lee recetas + ingredientes de BD
 * - Pide a IA un titulo atractivo y natural por receta
 * - Guarda en app.recipes.name_normalized
 *
 * Uso:
 *   cd backend
 *   node scripts/curate-recipe-names.js
 *
 * Variables opcionales:
 *   RECIPE_SOURCE=excel_v2_2_examples
 *   DRY_RUN=true|false
 *   BATCH_SIZE=20
 *   NUTRITION_RECIPE_NAMER_MODEL=gpt-4o-mini
 */

import { pool } from "../db.js";
import { getOpenAIClient } from "../lib/openaiClient.js";

const RECIPE_SOURCE = String(process.env.RECIPE_SOURCE || "excel_v2_2_examples").trim();
const DRY_RUN = String(process.env.DRY_RUN || "false").toLowerCase() === "true";
const BATCH_SIZE = Math.max(5, Math.min(40, Number.parseInt(process.env.BATCH_SIZE || "20", 10) || 20));
const MODEL = process.env.NUTRITION_RECIPE_NAMER_MODEL || "gpt-4o-mini";

function stripFoodDecorators(foodName) {
  return String(foodName || "")
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function fallbackTitle(recipe) {
  const mealLabel =
    recipe.meal_type === "DESAYUNO" ? "Desayuno equilibrado"
      : recipe.meal_type === "COMIDA" ? "Comida equilibrada"
        : recipe.meal_type === "CENA" ? "Cena equilibrada"
          : "Snack equilibrado";
  return mealLabel;
}

function sanitizeGeneratedName(value) {
  let name = String(value || "")
    .replace(/\([^)]*ejemplo[^)]*\)/gi, "")
    .replace(/\bEX_[A-Z0-9_]+\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

  name = name.replace(/^(desayuno|comida|cena|snack|merienda)\s+de\s+/i, "");
  name = name.replace(/^(desayuno|comida|cena|snack|merienda)\s*:\s*/i, "");

  return name.trim();
}

function extractJson(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    // continue
  }
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

async function generateBatchNames(openai, batch) {
  const payload = batch.map((recipe) => ({
    recipe_code: recipe.recipe_code,
    meal_type: recipe.meal_type,
    day_context: recipe.day_context,
    ingredients: recipe.ingredients.map(stripFoodDecorators)
  }));

  const systemPrompt = `
Eres copywriter nutricional senior para una app fitness.
Tu tarea: crear un nombre atractivo, natural y corto para cada receta.

Reglas obligatorias:
1) Escribe en español natural.
2) El nombre debe sonar a plato real, no a formula tecnica.
3) Longitud: 4 a 10 palabras.
4) No uses codigos internos, parentesis, ni "Ejemplo".
5) Evita textos genericos: "Comida de...", "Desayuno de...", "Cena de...", "Snack de...".
   Formato preferido: "Ingrediente principal con acompañamiento".
6) Mantener coherencia con meal_type:
   - DESAYUNO: estilo desayuno (tostada, bowl, tortilla, porridge, etc.)
   - COMIDA: estilo plato principal
   - CENA: estilo cena ligera o principal
   - SNACK: estilo snack/merienda
7) Si un ingrediente suena raro (p.ej. caballo), usa un termino culinario aceptable (p.ej. carne magra).

Devuelve SOLO JSON valido con este esquema:
{
  "results": [
    { "recipe_code": "...", "name": "..." }
  ]
}
`;

  const userPrompt = JSON.stringify({
    instruction: "Nombra estas recetas",
    recipes: payload
  });

  const completion = await openai.chat.completions.create({
    model: MODEL,
    temperature: 0.2,
    max_tokens: 2500,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ]
  });

  const parsed = extractJson(completion.choices?.[0]?.message?.content);
  if (!parsed || !Array.isArray(parsed.results)) {
    throw new Error("La IA no devolvio JSON valido para curado de nombres");
  }

  const map = new Map();
  for (const row of parsed.results) {
    const code = String(row?.recipe_code || "").trim();
    const name = String(row?.name || "").trim().replace(/\s+/g, " ");
    if (!code || !name) continue;
    map.set(code, name);
  }
  return map;
}

async function run() {
  const client = await pool.connect();
  try {
    const recipesResult = await client.query(
      `
        SELECT
          r.id,
          r.recipe_code,
          r.meal_type,
          r.day_context,
          r.name
        FROM app.recipes r
        WHERE r.source = $1
        ORDER BY r.recipe_code;
      `,
      [RECIPE_SOURCE]
    );

    if (recipesResult.rows.length === 0) {
      console.log(`⚠️ No hay recetas para source='${RECIPE_SOURCE}'`);
      process.exit(0);
    }

    const recipeIds = recipesResult.rows.map((row) => row.id);
    const itemsResult = await client.query(
      `
        SELECT
          ri.recipe_id,
          ri.slot_order,
          f.nombre AS food_name
        FROM app.recipe_items ri
        JOIN app.foods f ON f.id = ri.food_id
        WHERE ri.recipe_id = ANY($1)
        ORDER BY ri.recipe_id, ri.slot_order;
      `,
      [recipeIds]
    );

    const itemsByRecipe = new Map();
    itemsResult.rows.forEach((row) => {
      if (!itemsByRecipe.has(row.recipe_id)) {
        itemsByRecipe.set(row.recipe_id, []);
      }
      itemsByRecipe.get(row.recipe_id).push(row.food_name);
    });

    const recipes = recipesResult.rows.map((recipe) => ({
      ...recipe,
      ingredients: itemsByRecipe.get(recipe.id) || []
    }));

    const openai = getOpenAIClient("nutrition");

    const updates = [];
    for (let start = 0; start < recipes.length; start += BATCH_SIZE) {
      const batch = recipes.slice(start, start + BATCH_SIZE);
      const namesMap = await generateBatchNames(openai, batch);

      for (const recipe of batch) {
        const generated = namesMap.get(recipe.recipe_code);
        const cleanName = sanitizeGeneratedName(generated || "");
        updates.push({
          id: recipe.id,
          recipe_code: recipe.recipe_code,
          name: cleanName || fallbackTitle(recipe)
        });
      }
      console.log(`✅ Batch ${Math.floor(start / BATCH_SIZE) + 1} procesado (${batch.length} recetas)`);
    }

    await client.query("BEGIN");
    for (const row of updates) {
      await client.query(
        `
          UPDATE app.recipes
          SET name_normalized = $2,
              updated_at = NOW()
          WHERE id = $1;
        `,
        [row.id, row.name]
      );
    }

    if (DRY_RUN) {
      await client.query("ROLLBACK");
      console.log("🧪 DRY_RUN=true -> rollback");
    } else {
      await client.query("COMMIT");
    }

    console.log(`✅ Curado completado. Recetas actualizadas: ${updates.length}`);
    updates.slice(0, 20).forEach((row) => {
      console.log(`- ${row.recipe_code}: ${row.name}`);
    });

    process.exit(0);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ Error en curado de nombres:", error.message);
    process.exit(1);
  } finally {
    client.release();
  }
}

run();
