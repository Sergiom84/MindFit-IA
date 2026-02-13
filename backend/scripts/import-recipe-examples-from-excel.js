/**
 * Importa la hoja "Ejemplos" de Biblioteca_Platos_Plantillas_MindFeed_v2_2_final.xlsx
 * a app.recipes + app.recipe_items + app.recipe_tags.
 *
 * Uso:
 *   cd backend
 *   node scripts/import-recipe-examples-from-excel.js
 *
 * Variables opcionales:
 *   EXCEL_PATH=/ruta/al/archivo.xlsx
 *   DRY_RUN=true
 *   RECIPES_ACTIVE=true|false  (default: true)
 */

import XLSX from "xlsx";
import fs from "fs";
import path from "path";
import { pool } from "../db.js";

const DEFAULT_EXCEL_PATH = "/Users/miguelangelbatistaruiz/Downloads/Biblioteca_Platos_Plantillas_MindFeed_v2_2_final.xlsx";
const EXCEL_PATH = process.env.EXCEL_PATH || DEFAULT_EXCEL_PATH;
const DRY_RUN = String(process.env.DRY_RUN || "false").toLowerCase() === "true";
const RECIPES_ACTIVE = String(process.env.RECIPES_ACTIVE || "true").toLowerCase() !== "false";

function normText(value) {
  return String(value || "").trim();
}

function parseIngredientsExample(value) {
  const raw = normText(value);
  if (!raw) return [];

  const chunks = raw.split(/\s+\+\s+/g).map((part) => part.trim()).filter(Boolean);
  return chunks
    .map((chunk) => {
      // Captura la última pareja "(slug)" para soportar nombres tipo "Avena (copos) (avena_copos)"
      const match = chunk.match(/^(.*)\(([^()]+)\)\s*$/);
      if (!match) {
        return null;
      }
      const displayName = normText(match[1]).replace(/\s+$/, "");
      const slug = normText(match[2]).toLowerCase();
      if (!slug) return null;
      return { displayName, slug };
    })
    .filter(Boolean);
}

function parseSheet(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error(`No existe la hoja "${sheetName}" en el Excel`);
  }
  return XLSX.utils.sheet_to_json(sheet, { defval: "" });
}

function resolveRoleForIndex(slotRoles, index, fallbackRole = "CARBO_BASE") {
  if (!Array.isArray(slotRoles) || slotRoles.length === 0) {
    return fallbackRole;
  }
  if (index < slotRoles.length) {
    return slotRoles[index];
  }
  return slotRoles[slotRoles.length - 1] || fallbackRole;
}

async function run() {
  try {
    if (!fs.existsSync(EXCEL_PATH)) {
      throw new Error(`No se encontró el archivo Excel: ${EXCEL_PATH}`);
    }

    console.log("📂 Leyendo Excel:", EXCEL_PATH);
    const workbook = XLSX.readFile(EXCEL_PATH);

    const templatesRows = parseSheet(workbook, "Plantillas");
    const slotsRows = parseSheet(workbook, "Slots");
    const examplesRows = parseSheet(workbook, "Ejemplos");

    const templateById = new Map();
    for (const row of templatesRows) {
      const templateId = normText(row.template_id);
      if (!templateId) continue;
      templateById.set(templateId, {
        template_id: templateId,
        template_name: normText(row.template_name),
        meal_type: normText(row.meal_type).toUpperCase(),
        diet_allowed: normText(row.diet_allowed).toUpperCase() || "AMBOS",
        day_context: normText(row.day_context).toUpperCase() || "AMBOS"
      });
    }

    const slotRolesByTemplate = new Map();
    for (const row of slotsRows) {
      const templateId = normText(row.template_id);
      const slotRole = normText(row.slot_role).toUpperCase();
      const slotOrder = Number.parseInt(row.slot_order, 10);
      if (!templateId || !slotRole || !Number.isFinite(slotOrder)) continue;
      if (!slotRolesByTemplate.has(templateId)) {
        slotRolesByTemplate.set(templateId, []);
      }
      slotRolesByTemplate.get(templateId).push({ slotOrder, slotRole });
    }
    for (const [templateId, rows] of slotRolesByTemplate.entries()) {
      rows.sort((a, b) => a.slotOrder - b.slotOrder);
      slotRolesByTemplate.set(templateId, rows.map((row) => row.slotRole));
    }

    const parsedExamples = [];
    const allSlugs = new Set();

    for (const row of examplesRows) {
      const templateId = normText(row.template_id);
      const exampleN = Number.parseInt(row.example_n, 10);
      const mealType = normText(row.meal_type).toUpperCase();
      const dayContext = normText(row.day_context).toUpperCase();
      const dietAllowed = normText(row.diet_allowed).toUpperCase();
      const ingredientsRaw = normText(row.ingredients_example);
      const notes = normText(row.notes);

      if (!templateId || !Number.isFinite(exampleN) || !ingredientsRaw) {
        continue;
      }

      const parsedIngredients = parseIngredientsExample(ingredientsRaw);
      if (parsedIngredients.length === 0) {
        continue;
      }

      parsedIngredients.forEach((item) => allSlugs.add(item.slug));

      const template = templateById.get(templateId) || null;
      parsedExamples.push({
        templateId,
        exampleN,
        mealType: mealType || template?.meal_type || "SNACK",
        dayContext: dayContext || template?.day_context || "AMBOS",
        dietAllowed: dietAllowed || template?.diet_allowed || "AMBOS",
        templateName: template?.template_name || `Plantilla ${templateId}`,
        notes,
        ingredients: parsedIngredients
      });
    }

    if (parsedExamples.length === 0) {
      throw new Error("No se pudieron parsear ejemplos válidos del Excel");
    }

    const foodRows = await pool.query(
      `
        SELECT id, slug, nombre
        FROM app.foods
        WHERE slug = ANY($1::text[]);
      `,
      [[...allSlugs]]
    );
    const foodBySlug = new Map(foodRows.rows.map((row) => [String(row.slug).trim().toLowerCase(), row]));

    const missingSlugs = [...allSlugs].filter((slug) => !foodBySlug.has(slug));
    if (missingSlugs.length > 0) {
      throw new Error(
        `Hay ${missingSlugs.length} food_slug del Excel sin match en app.foods. Ejemplos: ${missingSlugs.slice(0, 20).join(", ")}`
      );
    }

    let importedRecipes = 0;
    let importedItems = 0;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      for (const example of parsedExamples) {
        const recipeCode = `EX_${example.templateId}_${example.exampleN}`;
        const recipeName = `${example.templateName} (Ejemplo ${example.exampleN})`;

        const recipeResult = await client.query(
          `
            INSERT INTO app.recipes (
              recipe_code, name, meal_type, diet_allowed, day_context,
              template_code, source, is_active
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (recipe_code) DO UPDATE SET
              name = EXCLUDED.name,
              meal_type = EXCLUDED.meal_type,
              diet_allowed = EXCLUDED.diet_allowed,
              day_context = EXCLUDED.day_context,
              template_code = EXCLUDED.template_code,
              source = EXCLUDED.source,
              is_active = EXCLUDED.is_active,
              updated_at = NOW()
            RETURNING id;
          `,
          [
            recipeCode,
            recipeName,
            example.mealType,
            example.dietAllowed === "VEG" ? "VEG" : "AMBOS",
            example.dayContext || "AMBOS",
            example.templateId,
            "excel_v2_2_examples",
            RECIPES_ACTIVE
          ]
        );

        const recipeId = recipeResult.rows[0].id;
        importedRecipes += 1;

        await client.query("DELETE FROM app.recipe_items WHERE recipe_id = $1", [recipeId]);
        await client.query("DELETE FROM app.recipe_tags WHERE recipe_id = $1", [recipeId]);

        const slotRoles = slotRolesByTemplate.get(example.templateId) || [];
        for (let index = 0; index < example.ingredients.length; index += 1) {
          const ingredient = example.ingredients[index];
          const food = foodBySlug.get(ingredient.slug);
          const role = resolveRoleForIndex(slotRoles, index);
          await client.query(
            `
              INSERT INTO app.recipe_items (
                recipe_id, food_id, slot_order, role, notes
              )
              VALUES ($1, $2, $3, $4, $5);
            `,
            [
              recipeId,
              food.id,
              index + 1,
              role,
              ingredient.displayName || null
            ]
          );
          importedItems += 1;
        }

        const tags = [
          `template:${example.templateId}`,
          `context:${example.dayContext}`,
          `diet:${example.dietAllowed}`,
          "source:excel_v2_2_examples"
        ];
        for (const tag of tags) {
          await client.query(
            `
              INSERT INTO app.recipe_tags (recipe_id, tag)
              VALUES ($1, $2)
              ON CONFLICT (recipe_id, tag) DO NOTHING;
            `,
            [recipeId, tag]
          );
        }
      }

      if (DRY_RUN) {
        await client.query("ROLLBACK");
        console.log("🧪 DRY_RUN=true → rollback ejecutado.");
      } else {
        await client.query("COMMIT");
      }
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    console.log("✅ Importación completada");
    console.log(`   - Recetas procesadas: ${importedRecipes}`);
    console.log(`   - Ítems procesados:   ${importedItems}`);
    console.log(`   - Recetas activas:    ${RECIPES_ACTIVE ? "sí" : "no"}`);
    console.log(`   - Modo dry-run:       ${DRY_RUN ? "sí" : "no"}`);

    const check = await pool.query(`
      SELECT meal_type, COUNT(*)::int AS total
      FROM app.recipes
      WHERE source = 'excel_v2_2_examples'
      GROUP BY meal_type
      ORDER BY meal_type;
    `);
    console.log("📊 Recetas importadas por meal_type:");
    check.rows.forEach((row) => {
      console.log(`   - ${row.meal_type}: ${row.total}`);
    });

    process.exit(0);
  } catch (error) {
    console.error("❌ Error importando recetas de ejemplos:", error.message);
    process.exit(1);
  }
}

run();
