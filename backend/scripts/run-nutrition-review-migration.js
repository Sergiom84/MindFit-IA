/**
 * Script para ejecutar la migración de Nutrición: day_type + noise_flags.
 *
 * Uso:
 *   cd backend
 *   node scripts/run-nutrition-review-migration.js
 */

import { pool } from "../db.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  try {
    console.log("🚀 Iniciando migración: daily_nutrition_log (day_type + noise_flags)\n");

    const migrationPath = path.join(
      __dirname,
      "../migrations/20260210_daily_nutrition_log_day_type_noise_flags.sql"
    );
    const migrationSQL = fs.readFileSync(migrationPath, "utf8");

    console.log("📄 Ejecutando SQL...");
    await pool.query(migrationSQL);
    console.log("✅ Migración ejecutada exitosamente\n");

    console.log("🔍 Verificando columnas/constraints...\n");

    const cols = await pool.query(`
      SELECT column_name, data_type, udt_name, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'app'
        AND table_name = 'daily_nutrition_log'
        AND column_name IN ('day_type', 'noise_flags')
      ORDER BY column_name;
    `);

    if (cols.rows.length !== 2) {
      throw new Error(
        `Columnas esperadas no encontradas. Encontradas: ${cols.rows
          .map(r => r.column_name)
          .join(", ")}`
      );
    }

    const cons = await pool.query(`
      SELECT conname
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'app'
        AND t.relname = 'daily_nutrition_log'
        AND conname = 'daily_nutrition_log_day_type_check'
      LIMIT 1;
    `);

    if (cons.rows.length === 0) {
      throw new Error("Constraint daily_nutrition_log_day_type_check no encontrada");
    }

    console.log("✅ Verificación OK:");
    cols.rows.forEach(row => {
      console.log(
        `   ✓ ${row.column_name} (${row.data_type}${row.udt_name ? `/${row.udt_name}` : ""}) default=${row.column_default}`
      );
    });
    console.log("   ✓ daily_nutrition_log_day_type_check\n");

    console.log("✅ MIGRACIÓN COMPLETADA CON ÉXITO\n");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error ejecutando migración:", error.message);
    process.exit(1);
  }
}

runMigration();

