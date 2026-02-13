/**
 * Script para ejecutar la migración de recetas de nutrición (recipe_examples).
 *
 * Uso:
 *   cd backend
 *   node scripts/run-nutrition-recipes-migration.js
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "../db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  try {
    console.log("🚀 Iniciando migración: recetas de nutrición (recipes/recipe_items/recipe_tags)\n");

    const migrationFiles = [
      "../migrations/20260213_nutrition_recipe_examples_tables.sql",
      "../migrations/20260213_nutrition_recipe_examples_drop_food_unique.sql",
      "../migrations/20260213_nutrition_recipe_examples_add_name_normalized.sql"
    ];

    console.log("📄 Ejecutando SQL...");
    for (const relativePath of migrationFiles) {
      const migrationPath = path.join(__dirname, relativePath);
      const migrationSQL = fs.readFileSync(migrationPath, "utf8");
      await pool.query(migrationSQL);
    }
    console.log("✅ Migración ejecutada\n");

    const check = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'app'
        AND table_name IN ('recipes', 'recipe_items', 'recipe_tags')
      ORDER BY table_name;
    `);

    const found = check.rows.map((row) => row.table_name);
    const expected = ["recipe_items", "recipe_tags", "recipes"];
    const missing = expected.filter((table) => !found.includes(table));

    if (missing.length > 0) {
      throw new Error(`Faltan tablas tras migración: ${missing.join(", ")}`);
    }

    console.log("✅ Verificación OK:");
    found.forEach((table) => console.log(`   ✓ app.${table}`));
    console.log("\n✅ MIGRACIÓN COMPLETADA CON ÉXITO\n");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error ejecutando migración:", error.message);
    process.exit(1);
  }
}

runMigration();
