import "./helpers/muteConsole.js"; // PRIMERO: silencia logs (evita flake IPC del runner)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { pool } from "../db.js";
import { applyNutritionKcalAdjustment } from "../services/nutritionAdjustmentService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function requireNotProduction() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to run DB-mutation tests with NODE_ENV=production");
  }
}

async function applyMigrationIfNeeded() {
  const migrationPath = path.join(
    __dirname,
    "../migrations/20260210_nutrition_adjustment_actions.sql"
  );
  const sql = fs.readFileSync(migrationPath, "utf8");
  await pool.query(sql);
}

async function createTestUser() {
  const email = `test+nra_${Date.now()}_${Math.floor(Math.random() * 1e6)}@example.com`;
  const result = await pool.query(
    `
      INSERT INTO app.users (email, password_hash, nombre, apellido)
      VALUES ($1, $2, $3, $4)
      RETURNING id;
    `,
    [email, "x", "Test", "User"]
  );
  return result.rows[0].id;
}

async function seedNutritionProfile(userId, objetivo = "cut") {
  await pool.query(
    `
      INSERT INTO app.nutrition_profiles
        (user_id, sexo, edad, altura_cm, peso_kg, objetivo, actividad, comidas_dia, preferencias, alergias)
      VALUES
        ($1, 'hombre', 30, 180, 80, $2, 'moderado', 4, '{}'::jsonb, '[]'::jsonb)
      ON CONFLICT (user_id) DO UPDATE SET updated_at = NOW();
    `,
    [userId, objetivo]
  );
}

async function seedActivePlan(userId, { meta = "cut", kcal = 2000 } = {}) {
  const result = await pool.query(
    `
      INSERT INTO app.nutrition_plans_v2
        (user_id, plan_name, tipo, bmr, tdee, kcal_objetivo, macros_objetivo, meta, duracion_dias, training_type, comidas_por_dia, fuente, version_reglas)
      VALUES
        ($1, 'Plan Base', 'activo', 1600, 2200, $2, $3, $4, 14, 'general', 4, 'determinista', 'v1')
      RETURNING id;
    `,
    [userId, kcal, JSON.stringify({ protein_g: 160, carbs_g: 200, fat_g: 70 }), meta]
  );
  return result.rows[0].id;
}

async function cleanupAll(userId) {
  await pool.query(`DELETE FROM app.daily_nutrition_log WHERE user_id = $1`, [userId]);
  // Cascada: delete user => nutrition_profiles, body_measurements, nutrition_change_log, nutrition_adjustment_actions
  await pool.query(`DELETE FROM app.users WHERE id = $1`, [userId]);
  await pool.query(`DELETE FROM app.nutrition_plans_v2 WHERE user_id = $1`, [userId]);
}

test("adjustments v2: apply crea nuevo plan activo, archiva anterior y guarda acción reversible", async () => {
  requireNotProduction();
  await applyMigrationIfNeeded();

  const userId = await createTestUser();
  try {
    await seedNutritionProfile(userId, "cut");
    const previousPlanId = await seedActivePlan(userId, { meta: "cut", kcal: 2000 });

    const result = await applyNutritionKcalAdjustment(userId, {
      mode: "quincenal",
      source: "auto",
      delta_kcal: -200,
      reason: "Test ajuste quincenal",
      metrics: { test: true },
    });

    assert.equal(result.success, true);
    assert.equal(result.previous_plan_id, previousPlanId);
    assert.ok(result.new_plan_id);
    assert.equal(result.previous_kcal, 2000);
    assert.equal(result.new_kcal, 1800);
    assert.equal(result.delta_kcal, -200);
    assert.ok(result.action_id);
    assert.ok(result.undo_expires_at);

    const plans = await pool.query(
      `
        SELECT id, tipo, kcal_objetivo
        FROM app.nutrition_plans_v2
        WHERE user_id = $1
        ORDER BY created_at DESC;
      `,
      [userId]
    );

    const archived = plans.rows.find(p => p.id === previousPlanId);
    assert.equal(archived.tipo, "archivado");

    const active = plans.rows.find(p => p.tipo === "activo");
    assert.ok(active);
    assert.equal(active.kcal_objetivo, 1800);

    const days = await pool.query(
      `SELECT COUNT(*)::int as cnt FROM app.nutrition_plan_days WHERE plan_id = $1`,
      [active.id]
    );
    assert.equal(days.rows[0].cnt, 14);

    const action = await pool.query(
      `SELECT * FROM app.nutrition_adjustment_actions WHERE id = $1 LIMIT 1`,
      [result.action_id]
    );
    assert.equal(action.rowCount, 1);
    assert.equal(action.rows[0].previous_plan_id, previousPlanId);
    assert.equal(action.rows[0].new_plan_id, active.id);
  } finally {
    await cleanupAll(userId);
  }
});

test.after(async () => {
  await pool.end();
});
