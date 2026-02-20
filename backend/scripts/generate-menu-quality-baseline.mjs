/**
 * Genera baseline de calidad de recetas activas para el plan de menús profesional.
 *
 * Salida:
 * - backend/tests/fixtures/menu_quality_baseline.json
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "../db.js";
import { evaluateRecipeHardRules } from "../services/menuHardRulesEngine.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUTPUT_PATH = path.resolve(__dirname, "../tests/fixtures/menu_quality_baseline.json");

function incrementCounter(map, key) {
  map[key] = (map[key] || 0) + 1;
}

async function run() {
  const client = await pool.connect();
  try {
    const recipesResult = await client.query(`
      SELECT
        r.id AS recipe_id,
        r.recipe_code,
        r.name,
        r.meal_type,
        r.day_context,
        r.diet_allowed,
        ri.slot_order,
        ri.role,
        f.id AS food_id,
        f.nombre AS food_name,
        f.processing_level,
        f.is_snack_only,
        f.is_main_dish_allowed,
        f.meal_suitability,
        f.culinary_family
      FROM app.recipes r
      JOIN app.recipe_items ri ON ri.recipe_id = r.id
      JOIN app.foods f ON f.id = ri.food_id
      WHERE r.is_active = TRUE
      ORDER BY r.meal_type, r.recipe_code, ri.slot_order;
    `);

    const byRecipeId = new Map();
    for (const row of recipesResult.rows) {
      if (!byRecipeId.has(row.recipe_id)) {
        byRecipeId.set(row.recipe_id, {
          recipe_id: row.recipe_id,
          recipe_code: row.recipe_code,
          name: row.name,
          meal_type: row.meal_type,
          day_context: row.day_context,
          diet_allowed: row.diet_allowed,
          items: []
        });
      }

      byRecipeId.get(row.recipe_id).items.push({
        role: row.role,
        slot_order: row.slot_order,
        food: {
          id: row.food_id,
          nombre: row.food_name,
          processing_level: row.processing_level,
          is_snack_only: row.is_snack_only,
          is_main_dish_allowed: row.is_main_dish_allowed,
          meal_suitability: row.meal_suitability,
          culinary_family: row.culinary_family
        }
      });
    }

    const recipes = [...byRecipeId.values()];
    const blockedRuleCounts = {};
    const byMealType = {};
    const blockedSamples = [];

    let hardRulesPass = 0;

    for (const recipe of recipes) {
      if (!byMealType[recipe.meal_type]) {
        byMealType[recipe.meal_type] = {
          total: 0,
          hard_rules_pass: 0,
          hard_rules_fail: 0
        };
      }
      byMealType[recipe.meal_type].total += 1;

      const evaluation = evaluateRecipeHardRules({
        mealType: recipe.meal_type,
        recipeCode: recipe.recipe_code,
        recipeItems: recipe.items,
        varietyContext: null,
        maxProcessedItemsPerDay: Number.POSITIVE_INFINITY
      });

      if (evaluation.isAllowed) {
        hardRulesPass += 1;
        byMealType[recipe.meal_type].hard_rules_pass += 1;
      } else {
        byMealType[recipe.meal_type].hard_rules_fail += 1;
        evaluation.blockedRules.forEach((rule) => incrementCounter(blockedRuleCounts, rule.code));
        if (blockedSamples.length < 20) {
          blockedSamples.push({
            recipe_code: recipe.recipe_code,
            meal_type: recipe.meal_type,
            blocked_codes: [...new Set(evaluation.blockedRules.map((rule) => rule.code))]
          });
        }
      }
    }

    const payload = {
      generated_at: new Date().toISOString(),
      totals: {
        active_recipes: recipes.length,
        hard_rules_pass: hardRulesPass,
        hard_rules_fail: recipes.length - hardRulesPass,
        hard_rules_pass_rate_pct: recipes.length > 0
          ? Number(((hardRulesPass / recipes.length) * 100).toFixed(2))
          : 0
      },
      by_meal_type: byMealType,
      blocked_rule_counts: blockedRuleCounts,
      blocked_samples: blockedSamples
    };

    fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
    fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

    console.log("✅ Baseline generado");
    console.log(`   - Recetas activas: ${payload.totals.active_recipes}`);
    console.log(`   - Pass hard rules: ${payload.totals.hard_rules_pass}`);
    console.log(`   - Pass rate: ${payload.totals.hard_rules_pass_rate_pct}%`);
    console.log(`   - Archivo: ${OUTPUT_PATH}`);
  } catch (error) {
    console.error("❌ Error generando baseline de calidad:", error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

run();
