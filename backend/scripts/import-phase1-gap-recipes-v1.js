/**
 * Importa las recetas de:
 * docs/PROPUESTA_MENUS_FALTANTES_FASE1_V1.md
 * a app.recipes + app.recipe_items + app.recipe_tags.
 *
 * Idempotente por recipe_code.
 *
 * Uso:
 *   node scripts/import-phase1-gap-recipes-v1.js
 *
 * Variables opcionales:
 *   DRY_RUN=true
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "../db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SOURCE = "manual_phase1_gap_v1";
const TEMPLATE_CODE = "GAP_FASE1_V1";
const DOC_PATH = path.resolve(__dirname, "../../docs/PROPUESTA_MENUS_FALTANTES_FASE1_V1.md");
const DRY_RUN = String(process.env.DRY_RUN || "false").toLowerCase() === "true";

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parseRecipesFromMarkdown(markdown) {
  const lines = markdown.split(/\r?\n/);
  const recipes = [];
  let current = null;

  for (const line of lines) {
    const headingMatch = line.match(/^###\s+([A-Z0-9]+)\s+\(([^,]+),\s*([^)]+)\)/);
    if (headingMatch) {
      if (current) {
        recipes.push(current);
      }
      current = {
        recipeCode: headingMatch[1].trim(),
        mealType: headingMatch[2].trim().toUpperCase(),
        dayContext: headingMatch[3].trim().toUpperCase(),
        name: "",
        ingredients: []
      };
      continue;
    }

    if (!current) continue;

    const titleMatch = line.match(/^\*\*(.+)\*\*$/);
    if (titleMatch) {
      current.name = titleMatch[1].trim();
      continue;
    }

    const ingredientMatch = line.match(/^\d+\.\s+(.+?)\s+-\s+([\d.,]+)\s*g\b/);
    if (ingredientMatch) {
      current.ingredients.push({
        rawName: ingredientMatch[1].trim(),
        grams: Number.parseFloat(String(ingredientMatch[2]).replace(",", ".")) || null
      });
    }
  }

  if (current) {
    recipes.push(current);
  }

  return recipes.filter((recipe) => recipe.recipeCode && recipe.mealType && recipe.dayContext && recipe.name);
}

function inferRole(foodNameNorm) {
  if (
    foodNameNorm.includes("aceite")
    || foodNameNorm.includes("mantequilla de cacahuete")
    || foodNameNorm.includes("almendra")
    || foodNameNorm.includes("nuez")
    || foodNameNorm.includes("chia")
    || foodNameNorm.includes("aguacate")
  ) return "GRASA_BASE";

  if (
    foodNameNorm.includes("arroz")
    || foodNameNorm.includes("pasta")
    || foodNameNorm.includes("pan")
    || foodNameNorm.includes("avena")
    || foodNameNorm.includes("cuscus")
    || foodNameNorm.includes("bagel")
    || foodNameNorm.includes("patata")
    || foodNameNorm.includes("boniato")
    || foodNameNorm.includes("tortilla de trigo")
  ) return "CARBO_BASE";

  if (
    foodNameNorm.includes("pollo")
    || foodNameNorm.includes("pavo")
    || foodNameNorm.includes("ternera")
    || foodNameNorm.includes("atun")
    || foodNameNorm.includes("salmon")
    || foodNameNorm.includes("merluza")
    || foodNameNorm.includes("huevo")
    || foodNameNorm.includes("whey")
    || foodNameNorm.includes("queso cottage")
    || foodNameNorm.includes("queso fresco batido")
    || foodNameNorm.includes("skyr")
    || foodNameNorm.includes("yogur")
    || foodNameNorm.includes("kefir")
    || foodNameNorm.includes("requeson")
  ) return "PROTEINA_ANIMAL_MAGRA";

  if (
    foodNameNorm.includes("tomate")
    || foodNameNorm.includes("lechuga")
    || foodNameNorm.includes("pepino")
    || foodNameNorm.includes("calabacin")
    || foodNameNorm.includes("esparrago")
    || foodNameNorm.includes("pimiento")
    || foodNameNorm.includes("zanahoria")
    || foodNameNorm.includes("espinaca")
    || foodNameNorm.includes("rucula")
    || foodNameNorm.includes("cebolla")
  ) return "VERDURA";

  if (
    foodNameNorm.includes("platano")
    || foodNameNorm.includes("naranja")
    || foodNameNorm.includes("kiwi")
    || foodNameNorm.includes("mango")
    || foodNameNorm.includes("pera")
    || foodNameNorm.includes("manzana")
    || foodNameNorm.includes("fresa")
    || foodNameNorm.includes("frambuesa")
    || foodNameNorm.includes("pina")
  ) return "FRUTA";

  return "CARBO_BASE";
}

function classifySnackSlot(name) {
  const value = normalize(name);
  const lunchTokens = [
    "sandwich",
    "tostada",
    "tosta",
    "wrap",
    "hummus",
    "atun",
    "pavo",
    "pollo",
    "huevo",
    "ensalada"
  ];
  return lunchTokens.some((token) => value.includes(token)) ? "slot:almuerzo" : "slot:merienda";
}

const INGREDIENT_ALIASES = {
  "huevo": ["huevo entero"],
  "avena en copos": ["avena (copos)"],
  "atun al natural": ["atun enlatado al natural", "atun en lata al natural"],
  "frutos rojos": ["frambuesas", "fresas", "arandanos"],
  "granola": ["avena (copos)"],
  "tortilla integral": ["tortilla de trigo"],
  "espinaca": ["espinacas"],
  "kefir natural": ["kefir"],
  "pina natural": ["piña"],
  "boniato": ["boniato asado"],
  "patata": ["patata cocida", "patata asada"],
  "tomate cherry": ["tomate"],
  "queso light en lonchas": ["queso fresco tipo burgos", "queso fresco", "queso crema light"],
  "garbanzo cocido": ["garbanzos cocidos", "garbanzo en conserva (escurrido)"],
  "queso semicurado": ["queso manchego curado", "queso cheddar"],
  "proteina whey": ["proteina whey aislada 90%"],
  "limon": [],
  "miel": [],
  "canela": [],
  "albahaca": []
};

function resolveAliases(rawName) {
  const key = normalize(rawName);
  if (!(key in INGREDIENT_ALIASES)) {
    return [rawName];
  }

  const aliases = INGREDIENT_ALIASES[key];
  if (!Array.isArray(aliases) || aliases.length === 0) {
    return [];
  }

  return aliases;
}

async function run() {
  if (!fs.existsSync(DOC_PATH)) {
    throw new Error(`No existe el documento: ${DOC_PATH}`);
  }

  const markdown = fs.readFileSync(DOC_PATH, "utf8");
  const recipes = parseRecipesFromMarkdown(markdown);
  if (recipes.length === 0) {
    throw new Error("No se pudieron parsear recetas del documento");
  }

  const foodsResult = await pool.query(`
    SELECT id, slug, nombre
    FROM app.foods
    WHERE is_verified = TRUE
  `);

  const foodByKey = new Map();
  for (const food of foodsResult.rows) {
    const keys = [food.nombre, food.slug]
      .filter(Boolean)
      .map((value) => normalize(value));
    for (const key of keys) {
      if (!foodByKey.has(key)) {
        foodByKey.set(key, food);
      }
    }
  }

  const rolesResult = await pool.query(`
    SELECT food_id, role
    FROM app.food_roles
    WHERE food_id IS NOT NULL
  `);
  const rolesByFoodId = new Map();
  for (const row of rolesResult.rows) {
    if (!rolesByFoodId.has(row.food_id)) {
      rolesByFoodId.set(row.food_id, []);
    }
    rolesByFoodId.get(row.food_id).push(String(row.role || "").toUpperCase());
  }

  const chooseRole = (food) => {
    const roles = rolesByFoodId.get(food.id) || [];
    const preferredOrder = [
      "PROTEINA_ANIMAL_MAGRA",
      "PROTEINA_ANIMAL_GRASA",
      "PROTEINA_ANIMAL",
      "PROTEINA_VEGETAL",
      "HUEVO",
      "LACTEO_PROTEICO_MAGRO",
      "LACTEO_BASE",
      "SUPLEMENTO_PROTEINA",
      "CARBO_BASE",
      "CARBO_COCIDO",
      "CARBO_PAN",
      "CARBO_AVENA",
      "CARBO_RAPIDO",
      "LEGUMBRE",
      "FRUTA",
      "VERDURA",
      "GRASA_BASE",
      "GRASA_ACEITE",
      "GRASA_FRUTOS_SECOS",
      "GRASA_CREMAS",
      "GRASA_SEMILLAS"
    ];
    for (const wanted of preferredOrder) {
      if (roles.includes(wanted)) return wanted;
    }
    return inferRole(normalize(food.nombre || food.slug || ""));
  };

  const unresolved = [];
  const skippedIngredients = [];
  const prepared = [];

  for (const recipe of recipes) {
    const resolvedItems = [];
    for (const ingredient of recipe.ingredients) {
      const raw = ingredient.rawName;
      const aliasCandidates = resolveAliases(raw);

      if (aliasCandidates.length === 0) {
        skippedIngredients.push({ recipeCode: recipe.recipeCode, ingredient: raw, reason: "no_disponible_condimento" });
        continue;
      }

      let matchedFood = null;
      for (const alias of aliasCandidates) {
        const key = normalize(alias);
        if (foodByKey.has(key)) {
          matchedFood = foodByKey.get(key);
          break;
        }
      }

      if (!matchedFood) {
        unresolved.push({ recipeCode: recipe.recipeCode, ingredient: raw, aliases: aliasCandidates });
        continue;
      }

      resolvedItems.push({
        food: matchedFood,
        role: chooseRole(matchedFood),
        notes: `${raw}${ingredient.grams ? ` (${ingredient.grams}g)` : ""}`
      });
    }

    prepared.push({ ...recipe, items: resolvedItems });
  }

  if (unresolved.length > 0) {
    console.error("❌ Ingredientes sin resolver:");
    unresolved.forEach((item) => {
      console.error(` - ${item.recipeCode}: ${item.ingredient} (aliases: ${item.aliases.join(", ")})`);
    });
    throw new Error(`Hay ${unresolved.length} ingredientes sin resolver`);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let recipesUpserted = 0;
    let itemsInserted = 0;
    let tagsInserted = 0;

    for (const recipe of prepared) {
      const recipeCode = recipe.recipeCode;
      const recipeName = recipe.name;
      const mealType = recipe.mealType;
      const dayContext = recipe.dayContext;

      const recipeResult = await client.query(
        `
          INSERT INTO app.recipes (
            recipe_code, name, name_normalized, meal_type, diet_allowed, day_context, template_code, source, is_active
          )
          VALUES ($1, $2, $3, $4, 'AMBOS', $5, $6, $7, TRUE)
          ON CONFLICT (recipe_code) DO UPDATE SET
            name = EXCLUDED.name,
            name_normalized = EXCLUDED.name_normalized,
            meal_type = EXCLUDED.meal_type,
            diet_allowed = EXCLUDED.diet_allowed,
            day_context = EXCLUDED.day_context,
            template_code = EXCLUDED.template_code,
            source = EXCLUDED.source,
            is_active = EXCLUDED.is_active,
            updated_at = NOW()
          RETURNING id;
        `,
        [recipeCode, recipeName, recipeName, mealType, dayContext, TEMPLATE_CODE, SOURCE]
      );

      const recipeId = recipeResult.rows[0].id;
      recipesUpserted += 1;

      await client.query("DELETE FROM app.recipe_items WHERE recipe_id = $1", [recipeId]);
      await client.query("DELETE FROM app.recipe_tags WHERE recipe_id = $1 AND tag LIKE 'slot:%'", [recipeId]);

      let slotOrder = 1;
      for (const item of recipe.items) {
        await client.query(
          `
            INSERT INTO app.recipe_items (
              recipe_id, food_id, slot_order, role, notes
            )
            VALUES ($1, $2, $3, $4, $5);
          `,
          [recipeId, item.food.id, slotOrder, item.role, item.notes]
        );
        slotOrder += 1;
        itemsInserted += 1;
      }

      const tags = [
        `context:${dayContext}`,
        "diet:AMBOS",
        `source:${SOURCE}`,
        `template:${TEMPLATE_CODE}`
      ];
      if (mealType === "SNACK") {
        tags.push("slot:snack");
        tags.push(classifySnackSlot(recipeName));
      }

      for (const tag of tags) {
        const result = await client.query(
          `
            INSERT INTO app.recipe_tags (recipe_id, tag)
            VALUES ($1, $2)
            ON CONFLICT (recipe_id, tag) DO NOTHING;
          `,
          [recipeId, tag]
        );
        tagsInserted += result.rowCount;
      }
    }

    if (DRY_RUN) {
      await client.query("ROLLBACK");
      console.log("🧪 DRY_RUN=true -> rollback aplicado.");
    } else {
      await client.query("COMMIT");
    }

    console.log("✅ Importación de recetas gap Fase1 completada");
    console.log(`   - Recetas procesadas: ${recipesUpserted}`);
    console.log(`   - Ítems insertados:   ${itemsInserted}`);
    console.log(`   - Tags insertados:    ${tagsInserted}`);
    console.log(`   - Condimentos omitidos: ${skippedIngredients.length}`);

    if (skippedIngredients.length > 0) {
      const grouped = skippedIngredients.reduce((acc, item) => {
        const key = item.ingredient;
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});
      console.log("ℹ️ Ingredientes omitidos (no disponibles en catálogo):");
      Object.entries(grouped).forEach(([ingredient, count]) => {
        console.log(`   - ${ingredient}: ${count}`);
      });
    }
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Error importando recetas gap Fase1:", error.message);
    process.exit(1);
  });
