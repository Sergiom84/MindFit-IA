/**
 * Verificaciones basicas de DB para ciclo menstrual v3.
 * Ejecutar con: node scripts/test-menstrual-cycle-db.mjs
 */
import pg from "pg";
const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("❌ DATABASE_URL no definido.");
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

const REQUIRED_COLUMNS = {
  "app.user_menstrual_config": [
    "contraception_type",
    "cycle_confidence",
    "last_bleed_start_date",
    "bleed_length_days",
    "cycle_length_days",
    "luteal_length_days",
    "joint_laxity_risk"
  ],
  "app.menstrual_daily_log": [
    "pain_0_3",
    "fatigue_0_3",
    "sleep_0_3",
    "stress_0_3",
    "pain_next_day_0_10",
    "session_quality_0_10"
  ],
  "app.menstrual_cycle_history": [
    "user_id",
    "bleed_start_date",
    "cycle_length_days",
    "created_at"
  ],
  "app.exercise_tags": [
    "exercise_id",
    "source_table",
    "pattern",
    "equipment",
    "impact_level",
    "axial_load_level",
    "cod_level",
    "overhead"
  ]
};

const REQUIRED_CONSTRAINTS = [
  "user_menstrual_config_contraception_type_check",
  "user_menstrual_config_cycle_confidence_check",
  "user_menstrual_config_bleed_length_days_check",
  "user_menstrual_config_cycle_length_days_check",
  "user_menstrual_config_luteal_length_days_check",
  "menstrual_daily_log_pain_0_3_check",
  "menstrual_daily_log_fatigue_0_3_check",
  "menstrual_daily_log_sleep_0_3_check",
  "menstrual_daily_log_stress_0_3_check",
  "menstrual_daily_log_pain_next_day_0_10_check",
  "menstrual_daily_log_session_quality_0_10_check"
];

async function main() {
  const client = await pool.connect();
  try {
    console.log("🔍 Verificando columnas v3...");

    for (const [table, columns] of Object.entries(REQUIRED_COLUMNS)) {
      const [schema, name] = table.split(".");
      const result = await client.query(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = $2`,
        [schema, name]
      );
      const existing = new Set(result.rows.map(row => row.column_name));
      const missing = columns.filter(col => !existing.has(col));
      if (missing.length > 0) {
        console.error(`❌ Faltan columnas en ${table}: ${missing.join(", ")}`);
        process.exitCode = 1;
      } else {
        console.log(`✅ ${table}: columnas OK (${columns.length})`);
      }
    }

    console.log("\n🔍 Verificando constraints clave...");
    const constraintResult = await client.query(
      `SELECT conname
       FROM pg_constraint
       WHERE connamespace = 'app'::regnamespace`
    );
    const existingConstraints = new Set(constraintResult.rows.map(row => row.conname));
    const missingConstraints = REQUIRED_CONSTRAINTS.filter(name => !existingConstraints.has(name));
    if (missingConstraints.length > 0) {
      console.error(`❌ Faltan constraints: ${missingConstraints.join(", ")}`);
      process.exitCode = 1;
    } else {
      console.log("✅ Constraints OK");
    }

    console.log("\n✅ Verificacion DB completada.");
  } catch (error) {
    console.error("❌ Error en verificacion DB:", error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
