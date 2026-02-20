/**
 * QA rápido de hard rules sobre 200 muestras sintéticas de selección de recetas.
 *
 * Salidas:
 * - backend/tests/fixtures/menu_hard_rules_qa_200.json
 * - docs/menus_profesional/qa_hard_rules_200.md
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "../db.js";
import {
  computePairingPenaltyForRecipe,
  evaluateRecipeHardRules
} from "../services/menuHardRulesEngine.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURE_PATH = path.resolve(__dirname, "../tests/fixtures/menu_hard_rules_qa_200.json");
const DOC_PATH = path.resolve(__dirname, "../../docs/menus_profesional/qa_hard_rules_200.md");
const TOTAL_SAMPLES = Number.parseInt(process.env.QA_MENU_SAMPLES || "200", 10);

function pickFromList(items, seed) {
  if (!Array.isArray(items) || items.length === 0) return null;
  const index = Math.abs(seed) % items.length;
  return items[index];
}

function hashString(input) {
  const text = String(input || "");
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function toMapByRecipe(rows) {
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.recipe_id)) {
      map.set(row.recipe_id, {
        recipe_id: row.recipe_id,
        recipe_code: row.recipe_code,
        recipe_name: row.recipe_name,
        meal_type: row.meal_type,
        day_context: row.day_context,
        diet_allowed: row.diet_allowed,
        items: []
      });
    }

    map.get(row.recipe_id).items.push({
      role: row.role,
      slot_order: row.slot_order,
      food: {
        id: row.food_id,
        slug: row.food_slug,
        nombre: row.food_name,
        processing_level: row.processing_level,
        is_snack_only: row.is_snack_only,
        is_main_dish_allowed: row.is_main_dish_allowed,
        meal_suitability: row.meal_suitability,
        culinary_family: row.culinary_family
      }
    });
  }
  return [...map.values()];
}

function buildDoc({
  generatedAt,
  totals,
  byMealType,
  blockedRuleCounts,
  blockedExamples,
  pairingPenalty
}) {
  const lines = [];
  lines.push("# QA hard rules (200 muestras)");
  lines.push("");
  lines.push(`Fecha: ${generatedAt}`);
  lines.push(`Muestras: ${totals.samples}`);
  lines.push("");
  lines.push("## Resultado global");
  lines.push("");
  lines.push(`- Pass: ${totals.pass}`);
  lines.push(`- Fail: ${totals.fail}`);
  lines.push(`- Pass rate: ${totals.pass_rate_pct}%`);
  lines.push("");
  lines.push("## Resultado por meal_type");
  lines.push("");
  Object.entries(byMealType).forEach(([mealType, metric]) => {
    lines.push(`- ${mealType}: ${metric.pass}/${metric.total} pass (${metric.pass_rate_pct}%)`);
  });
  lines.push("");
  lines.push("## Pairing penalty (soft rules)");
  lines.push("");
  lines.push(`- Samples with penalty: ${pairingPenalty.samples_with_penalty}`);
  lines.push(`- Total penalty accumulated: ${pairingPenalty.total_penalty}`);
  lines.push(`- Avg penalty per sample: ${pairingPenalty.avg_penalty_per_sample}`);
  lines.push(`- Avg penalty when applied: ${pairingPenalty.avg_penalty_when_applied}`);
  lines.push("");
  lines.push("## Reglas bloqueantes más frecuentes");
  lines.push("");
  Object.entries(blockedRuleCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([code, count]) => {
      lines.push(`- ${code}: ${count}`);
    });
  lines.push("");
  lines.push("## Ejemplos bloqueados");
  lines.push("");
  blockedExamples.slice(0, 15).forEach((item) => {
    lines.push(`- ${item.recipe_code} (${item.meal_type}): ${item.blocked_codes.join(", ")}`);
  });
  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function run() {
  const client = await pool.connect();
  try {
    const recipesRows = await client.query(`
      SELECT
        r.id AS recipe_id,
        r.recipe_code,
        COALESCE(r.name_normalized, r.name) AS recipe_name,
        r.meal_type,
        r.day_context,
        r.diet_allowed,
        ri.slot_order,
        ri.role,
        f.id AS food_id,
        f.slug AS food_slug,
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
    const recipes = toMapByRecipe(recipesRows.rows);

    const mealRulesRows = await client.query(`
      SELECT
        id,
        meal_type,
        diet_type,
        max_processed_items,
        forbidden_families,
        required_families,
        notes
      FROM app.meal_acceptability_rules
      WHERE is_active = TRUE;
    `);

    const pairingRulesRows = await client.query(`
      SELECT
        id,
        food_slug_a,
        food_slug_b,
        rule_type,
        penalty,
        contexts,
        reason
      FROM app.food_pairing_rules
      WHERE is_active = TRUE
        AND rule_type IN ('forbidden', 'penalty');
    `);

    const mealRuleMap = new Map();
    mealRulesRows.rows.forEach((row) => {
      mealRuleMap.set(`${row.meal_type}|${row.diet_type}`, row);
    });

    const pairingRules = pairingRulesRows.rows;
    const mealsOrder = ["DESAYUNO", "SNACK", "COMIDA", "CENA"];
    const dietOrder = ["AMBOS", "VEG"];

    const byMealType = {};
    const blockedRuleCounts = {};
    const blockedExamples = [];
    let pass = 0;
    let samplesWithPenalty = 0;
    let totalPenalty = 0;

    for (let i = 0; i < TOTAL_SAMPLES; i += 1) {
      const mealType = mealsOrder[i % mealsOrder.length];
      const dietType = dietOrder[i % dietOrder.length];

      if (!byMealType[mealType]) {
        byMealType[mealType] = { total: 0, pass: 0, fail: 0, pass_rate_pct: 0 };
      }
      byMealType[mealType].total += 1;

      const candidates = recipes.filter((recipe) => {
        if (recipe.meal_type !== mealType) return false;
        if (dietType === "VEG") {
          return recipe.diet_allowed === "VEG";
        }
        return recipe.diet_allowed === "AMBOS" || recipe.diet_allowed === "VEG";
      });

      const selected = pickFromList(candidates, hashString(`${mealType}|${dietType}|${i}`));
      if (!selected) {
        byMealType[mealType].fail += 1;
        blockedRuleCounts.no_candidate_recipe = (blockedRuleCounts.no_candidate_recipe || 0) + 1;
        continue;
      }

      const mealRule = mealRuleMap.get(`${mealType}|${dietType}`)
        || mealRuleMap.get(`${mealType}|AMBOS`)
        || null;

      const relevantSlugs = new Set(
        selected.items
          .map((item) => normalizeText(item.food.slug))
          .filter(Boolean)
      );
      const relevantPairingRules = pairingRules.filter((rule) => {
        const slugA = normalizeText(rule.food_slug_a);
        const slugB = normalizeText(rule.food_slug_b);
        return relevantSlugs.has(slugA) || relevantSlugs.has(slugB);
      });

      const evaluation = evaluateRecipeHardRules({
        mealType,
        recipeCode: selected.recipe_code,
        recipeItems: selected.items,
        varietyContext: null,
        mealAcceptabilityRule: mealRule,
        pairingRules: relevantPairingRules
      });
      const penaltyResult = computePairingPenaltyForRecipe({
        mealType,
        recipeItems: selected.items,
        pairingRules: relevantPairingRules
      });
      if (penaltyResult.totalPenalty > 0) {
        samplesWithPenalty += 1;
        totalPenalty += penaltyResult.totalPenalty;
      }

      if (evaluation.isAllowed) {
        pass += 1;
        byMealType[mealType].pass += 1;
      } else {
        byMealType[mealType].fail += 1;
        evaluation.blockedRules.forEach((rule) => {
          blockedRuleCounts[rule.code] = (blockedRuleCounts[rule.code] || 0) + 1;
        });
        if (blockedExamples.length < 30) {
          blockedExamples.push({
            recipe_code: selected.recipe_code,
            meal_type: mealType,
            blocked_codes: [...new Set(evaluation.blockedRules.map((rule) => rule.code))]
          });
        }
      }
    }

    Object.values(byMealType).forEach((metric) => {
      metric.pass_rate_pct = metric.total > 0
        ? Number(((metric.pass / metric.total) * 100).toFixed(2))
        : 0;
    });

    const totals = {
      samples: TOTAL_SAMPLES,
      pass,
      fail: TOTAL_SAMPLES - pass,
      pass_rate_pct: TOTAL_SAMPLES > 0 ? Number(((pass / TOTAL_SAMPLES) * 100).toFixed(2)) : 0
    };

    const payload = {
      generated_at: new Date().toISOString(),
      totals,
      pairing_penalty: {
        samples_with_penalty: samplesWithPenalty,
        total_penalty: Number(totalPenalty.toFixed(4)),
        avg_penalty_per_sample: TOTAL_SAMPLES > 0
          ? Number((totalPenalty / TOTAL_SAMPLES).toFixed(4))
          : 0,
        avg_penalty_when_applied: samplesWithPenalty > 0
          ? Number((totalPenalty / samplesWithPenalty).toFixed(4))
          : 0
      },
      by_meal_type: byMealType,
      blocked_rule_counts: blockedRuleCounts,
      blocked_examples: blockedExamples
    };

    fs.mkdirSync(path.dirname(FIXTURE_PATH), { recursive: true });
    fs.mkdirSync(path.dirname(DOC_PATH), { recursive: true });
    fs.writeFileSync(FIXTURE_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    fs.writeFileSync(
      DOC_PATH,
      buildDoc({
        generatedAt: payload.generated_at,
        totals,
        byMealType,
        blockedRuleCounts,
        blockedExamples,
        pairingPenalty: payload.pairing_penalty
      }),
      "utf8"
    );

    console.log("✅ QA hard rules completado");
    console.log(`   - Muestras: ${totals.samples}`);
    console.log(`   - Pass: ${totals.pass}`);
    console.log(`   - Pass rate: ${totals.pass_rate_pct}%`);
    console.log(`   - JSON: ${FIXTURE_PATH}`);
    console.log(`   - DOC: ${DOC_PATH}`);
  } catch (error) {
    console.error("❌ Error QA hard rules:", error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

run();
