/**
 * Backfill de semántica de catálogo para motor de menús profesional.
 *
 * Rellena en app.foods:
 * - meal_suitability
 * - processing_level
 * - culinary_family
 * - is_snack_only
 * - is_main_dish_allowed
 * - palatability_score
 *
 * Uso:
 *   node scripts/backfill-food-semantics.mjs
 *   DRY_RUN=true node scripts/backfill-food-semantics.mjs
 */

import { pool } from "../db.js";

const DRY_RUN = String(process.env.DRY_RUN || "false").toLowerCase() === "true";

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function parseTags(raw) {
  if (Array.isArray(raw)) {
    return raw.map((value) => normalizeText(value)).filter(Boolean);
  }

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parseTags(parsed);
      }
    } catch {
      return trimmed
        .split(",")
        .map((value) => normalizeText(value))
        .filter(Boolean);
    }
  }

  return [];
}

function hasAnyToken(baseText, tokens) {
  return tokens.some((token) => baseText.includes(token));
}

function inferCulinaryFamily(food) {
  const explicit = normalizeText(food.culinary_family);
  if (explicit) return explicit;

  const nombre = normalizeText(food.nombre);
  const categoria = normalizeText(food.categoria);
  const detalle = normalizeText(food.categoria_detalle);

  if (hasAnyToken(nombre, ["barrita", "galleta", "granola", "bizcocho"])) return "snack_dulce";
  if (hasAnyToken(nombre, ["crema de cacao", "untable", "margarina"])) return "untable_industrial";
  if (hasAnyToken(nombre, ["whey", "gainer", "proteina"])) return "suplemento";
  if (hasAnyToken(nombre, ["aceite"])) return "aceite";
  if (hasAnyToken(nombre, ["arroz", "pasta", "quinoa", "cuscus", "avena"])) return "cereal";
  if (hasAnyToken(nombre, ["patata", "boniato", "yuca"])) return "tuberculo";
  if (hasAnyToken(nombre, ["pan", "bagel", "tortilla de trigo"])) return "pan";
  if (categoria === "vegetal") return "verdura";
  if (categoria === "fruta") return "fruta";
  if (categoria === "grasa") return "grasa";
  if (categoria === "lacteo") return "lacteo";
  if (categoria === "proteina") {
    if (food.is_vegan === true || detalle.includes("vegetal")) return "proteina_vegetal";
    if (detalle.includes("huevo")) return "huevo";
    return "proteina_animal";
  }
  if (detalle.includes("proteina animal")) return "proteina_animal";
  if (detalle.includes("proteina vegetal")) return "proteina_vegetal";
  if (detalle.includes("huevo")) return "huevo";
  if (detalle.includes("legumbre")) return "legumbre";

  return "general";
}

function inferProcessingLevel(food, family, tags) {
  const explicit = normalizeText(food.processing_level);
  if (["minimo", "procesado", "ultraprocesado"].includes(explicit)) {
    return explicit;
  }

  const nombre = normalizeText(food.nombre);
  const metodo = normalizeText(food.metodo_preparacion);
  const joinedTags = tags.join(" ");
  const combined = `${nombre} ${metodo} ${joinedTags}`.trim();

  if (
    family === "snack_dulce"
    || family === "untable_industrial"
    || hasAnyToken(combined, ["ultraprocesado", "barrita", "galleta", "margarina", "crema de cacao", "bolleria"])
  ) {
    return "ultraprocesado";
  }

  if (
    family === "suplemento"
    || family === "pan"
    || hasAnyToken(combined, ["procesado", "ahumado", "enlatado", "fiambre", "queso batido", "yogur", "kefir", "bagel"])
  ) {
    return "procesado";
  }

  return "minimo";
}

function inferSnackOnly(food, family, processingLevel) {
  if (food.is_snack_only === true) return true;

  if (family === "snack_dulce" || family === "suplemento" || family === "untable_industrial") {
    return true;
  }

  return processingLevel === "ultraprocesado";
}

function inferMainDishAllowed(food, snackOnly, family) {
  if (food.is_main_dish_allowed === false) return false;

  if (snackOnly) return false;
  if (family === "untable_industrial") return false;

  return true;
}

function inferPalatabilityScore(food, family) {
  const numeric = Number.parseFloat(food.palatability_score);
  if (Number.isFinite(numeric) && numeric >= 0 && numeric <= 100) {
    return Number(numeric.toFixed(2));
  }

  const byFamily = {
    proteina_animal: 82,
    proteina_vegetal: 72,
    huevo: 78,
    cereal: 76,
    tuberculo: 74,
    pan: 73,
    verdura: 66,
    fruta: 80,
    lacteo: 77,
    legumbre: 71,
    grasa: 63,
    aceite: 58,
    snack_dulce: 70,
    suplemento: 62,
    untable_industrial: 60,
    general: 65
  };

  return Number((byFamily[family] ?? byFamily.general).toFixed(2));
}

function inferMealSuitability(food, family, snackOnly) {
  const base = {
    desayuno: true,
    comida: true,
    cena: true,
    snack: true
  };

  let explicit = null;
  if (food.meal_suitability && typeof food.meal_suitability === "object" && !Array.isArray(food.meal_suitability)) {
    explicit = food.meal_suitability;
  } else if (typeof food.meal_suitability === "string") {
    try {
      const parsed = JSON.parse(food.meal_suitability);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        explicit = parsed;
      }
    } catch {
      explicit = null;
    }
  }

  if (explicit) {
    ["desayuno", "comida", "cena", "snack"].forEach((key) => {
      if (typeof explicit[key] === "boolean") {
        base[key] = explicit[key];
      }
    });
  }

  if (snackOnly || family === "suplemento" || family === "untable_industrial") {
    base.comida = false;
    base.cena = false;
    base.snack = true;
  }

  return base;
}

async function run() {
  const client = await pool.connect();
  try {
    const foodsResult = await client.query(`
      SELECT
        id,
        nombre,
        categoria,
        categoria_detalle,
        tags,
        metodo_preparacion,
        meal_suitability,
        processing_level,
        culinary_family,
        is_snack_only,
        is_main_dish_allowed,
        palatability_score
      FROM app.foods
      WHERE is_verified = TRUE
      ORDER BY nombre;
    `);

    const foods = foodsResult.rows;
    if (foods.length === 0) {
      console.log("⚠️ No se encontraron alimentos verificados para backfill.");
      return;
    }

    const updates = foods.map((food) => {
      const tags = parseTags(food.tags);
      const family = inferCulinaryFamily(food);
      const processingLevel = inferProcessingLevel(food, family, tags);
      const snackOnly = inferSnackOnly(food, family, processingLevel);
      const mainDishAllowed = inferMainDishAllowed(food, snackOnly, family);
      const mealSuitability = inferMealSuitability(food, family, snackOnly);
      const palatabilityScore = inferPalatabilityScore(food, family);

      return {
        id: food.id,
        mealSuitability,
        processingLevel,
        family,
        snackOnly,
        mainDishAllowed,
        palatabilityScore
      };
    });

    if (!DRY_RUN) {
      await client.query("BEGIN");
      for (const row of updates) {
        await client.query(
          `
            UPDATE app.foods
            SET
              meal_suitability = $2::jsonb,
              processing_level = $3,
              culinary_family = $4,
              is_snack_only = $5,
              is_main_dish_allowed = $6,
              palatability_score = $7,
              updated_at = NOW()
            WHERE id = $1;
          `,
          [
            row.id,
            JSON.stringify(row.mealSuitability),
            row.processingLevel,
            row.family,
            row.snackOnly,
            row.mainDishAllowed,
            row.palatabilityScore
          ]
        );
      }
      await client.query("COMMIT");
    }

    const summary = updates.reduce((acc, row) => {
      acc.total += 1;
      acc.byProcessing[row.processingLevel] = (acc.byProcessing[row.processingLevel] || 0) + 1;
      if (row.snackOnly) acc.snackOnly += 1;
      if (!row.mainDishAllowed) acc.notMainDishAllowed += 1;
      return acc;
    }, {
      total: 0,
      snackOnly: 0,
      notMainDishAllowed: 0,
      byProcessing: {}
    });

    console.log(`✅ Backfill de semántica completado (${DRY_RUN ? "DRY_RUN" : "APLICADO"})`);
    console.log(`   - Alimentos procesados: ${summary.total}`);
    console.log(`   - Snack only: ${summary.snackOnly}`);
    console.log(`   - No aptos como base principal: ${summary.notMainDishAllowed}`);
    console.log(`   - Processing: ${JSON.stringify(summary.byProcessing)}`);
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback errors
    }
    console.error("❌ Error en backfill de semántica:", error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

run();
