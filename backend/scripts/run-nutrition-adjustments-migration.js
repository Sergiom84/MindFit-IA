/**
 * Script para ejecutar la migración de Nutrición: nutrition_adjustment_actions (apply/undo).
 *
 * Uso:
 *   cd backend
 *   node scripts/run-nutrition-adjustments-migration.js
 */

import { pool } from "../db.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  try {
    console.log("🚀 Iniciando migración: nutrition_adjustment_actions\n");

    const migrationPath = path.join(__dirname, "../migrations/20260210_nutrition_adjustment_actions.sql");
    const migrationSQL = fs.readFileSync(migrationPath, "utf8");

    console.log("📄 Ejecutando SQL...");
    await pool.query(migrationSQL);
    console.log("✅ Migración ejecutada exitosamente\n");

    const tables = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'app' AND table_name = 'nutrition_adjustment_actions'
      LIMIT 1;
    `);

    if (tables.rows.length === 0) {
      throw new Error("Tabla app.nutrition_adjustment_actions no encontrada tras migración");
    }

    console.log("✅ Verificación OK: app.nutrition_adjustment_actions\n");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error ejecutando migración:", error.message);
    process.exit(1);
  }
}

runMigration();

