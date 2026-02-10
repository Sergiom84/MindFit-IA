import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { pool } from "../db.js";
import { upsertDailyNutritionLogV2 } from "../services/nutritionDailyLogV2.js";
import { getNutritionReview } from "../services/nutritionReviewService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function requireNotProduction() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to run DB-mutation tests with NODE_ENV=production");
  }
}

async function applyMigrationsIfNeeded() {
  const paths = [
    "../migrations/20260210_daily_nutrition_log_day_type_noise_flags.sql",
    "../migrations/20260210_nutrition_adjustment_actions.sql",
  ].map((p) => path.join(__dirname, p));

  for (const migrationPath of paths) {
    const sql = fs.readFileSync(migrationPath, "utf8");
    await pool.query(sql);
  }
}

function addDaysIso(baseIso, deltaDays) {
  const [y, m, d] = baseIso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return dt.toISOString().slice(0, 10);
}

async function createTestUser() {
  const email = `test+nrv2_${Date.now()}_${Math.floor(Math.random() * 1e6)}@example.com`;
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
      ON CONFLICT (user_id) DO UPDATE SET
        objetivo = EXCLUDED.objetivo,
        updated_at = NOW();
    `,
    [userId, objetivo]
  );
}

async function seedActivePlan(userId, { meta = "cut", kcal = 2000, createdAtIso = "2026-01-20" } = {}) {
  await pool.query(
    `
      INSERT INTO app.nutrition_plans_v2
        (user_id, plan_name, tipo, kcal_objetivo, macros_objetivo, meta, duracion_dias, fuente, version_reglas, created_at, updated_at)
      VALUES
        ($1, 'Plan Test', 'activo', $2, $3, $4, 14, 'determinista', 'v1', $5::timestamptz, $5::timestamptz)
      RETURNING id;
    `,
    [userId, kcal, JSON.stringify({ protein_g: 160, carbs_g: 200, fat_g: 70 }), meta, `${createdAtIso}T00:00:00Z`]
  );
}

async function seedMeasurements(userId, measurements) {
  for (const m of measurements) {
    await pool.query(
      `
        INSERT INTO app.body_measurements (user_id, measurement_date, weight_kg, waist_cm, is_validated)
        VALUES ($1, $2, $3, $4, TRUE)
        ON CONFLICT (user_id, measurement_date)
        DO UPDATE SET weight_kg = EXCLUDED.weight_kg, waist_cm = EXCLUDED.waist_cm, is_validated = TRUE, updated_at = NOW();
      `,
      [userId, m.date, m.weight, m.waist]
    );
  }
}

async function cleanupUser(userId) {
  await pool.query(`DELETE FROM app.daily_nutrition_log WHERE user_id = $1`, [userId]);
  await pool.query(`DELETE FROM app.users WHERE id = $1`, [userId]);
  await pool.query(`DELETE FROM app.nutrition_plans_v2 WHERE user_id = $1`, [userId]);
}

test.before(async () => {
  requireNotProduction();
  await applyMigrationsIfNeeded();
});

test("review v2: modo SIMPLE (sin registro de comidas/kcal) pero con pesajes da feedback semanal", async () => {
  requireNotProduction();

  const userId = await createTestUser();
  const today = "2026-02-10";

  try {
    await seedNutritionProfile(userId, "cut");
    await seedActivePlan(userId, { meta: "cut", kcal: 2000, createdAtIso: "2026-01-20" });

    const prevDates = ["2026-01-28", "2026-01-30", "2026-02-01", "2026-02-03"];
    const currDates = ["2026-02-04", "2026-02-06", "2026-02-08", "2026-02-10"];
    const measurements = [
      ...prevDates.map(d => ({ date: d, weight: 80.0, waist: 80.0 })),
      ...currDates.map(d => ({ date: d, weight: 79.6, waist: 79.7 })),
    ];
    await seedMeasurements(userId, measurements);

    const review = await getNutritionReview(userId, { today });
    assert.equal(review.success, true);
    assert.equal(review.mode, "simple");
    assert.equal(review.phase, "definicion");
    assert.ok(review.weekly_review);
    assert.notEqual(review.weekly_review.status, "insufficient");
    assert.ok(review.biweekly_review);
    assert.equal(review.biweekly_review.status, "insufficient");
  } finally {
    await cleanupUser(userId);
  }
});

test("review v2: sin pesajes => weekly insuficiente y quincenal insuficiente aunque haya registros", async () => {
  requireNotProduction();

  const userId = await createTestUser();
  const today = "2026-02-10";

  try {
    await seedNutritionProfile(userId, "cut");
    await seedActivePlan(userId, { meta: "cut", kcal: 2000, createdAtIso: "2026-01-20" });

    // Registro completo (para que el bloqueo venga por falta de pesajes, no por adherencia).
    for (let i = -13; i <= 0; i++) {
      const date = addDaysIso(today, i);
      await upsertDailyNutritionLogV2(userId, { date, calories: 1950, day_type: "normal" });
    }

    const review = await getNutritionReview(userId, { today });
    assert.equal(review.success, true);
    assert.equal(review.weekly_review.status, "insufficient");
    assert.equal(review.biweekly_review.status, "insufficient");
  } finally {
    await cleanupUser(userId);
  }
});

test("review v2: modo FINO pero compliance bajo => no ajustar, explicar", async () => {
  requireNotProduction();

  const userId = await createTestUser();
  const today = "2026-02-10";

  try {
    await seedNutritionProfile(userId, "cut");
    await seedActivePlan(userId, { meta: "cut", kcal: 2000, createdAtIso: "2026-01-20" });

    // Pesajes suficientes
    const prevDates = ["2026-01-28", "2026-01-30", "2026-02-01", "2026-02-03"];
    const currDates = ["2026-02-04", "2026-02-06", "2026-02-08", "2026-02-10"];
    const measurements = [
      ...prevDates.map(d => ({ date: d, weight: 80.0, waist: 80.0 })),
      ...currDates.map(d => ({ date: d, weight: 79.95, waist: 80.1 })),
    ];
    await seedMeasurements(userId, measurements);

    // Registro completo pero lejos del objetivo (+30%)
    for (let i = -13; i <= 0; i++) {
      const date = addDaysIso(today, i);
      await upsertDailyNutritionLogV2(userId, { date, calories: 2600, day_type: "normal" });
    }

    const review = await getNutritionReview(userId, { today });
    assert.equal(review.success, true);
    assert.equal(review.mode, "fino");
    assert.equal(review.biweekly_review.status, "compliance_low");
    assert.equal(review.biweekly_review.recommended_delta_kcal, null);
  } finally {
    await cleanupUser(userId);
  }
});

test("review v2: modo FINO + sin ruido + elegible => recomienda ajuste (definicion lenta)", async () => {
  requireNotProduction();

  const userId = await createTestUser();
  const today = "2026-02-10";

  try {
    await seedNutritionProfile(userId, "cut");
    await seedActivePlan(userId, { meta: "cut", kcal: 2000, createdAtIso: "2026-01-20" });

    // Pesajes con pérdida lenta (<0.3%/sem)
    const prevDates = ["2026-01-28", "2026-01-30", "2026-02-01", "2026-02-03"];
    const currDates = ["2026-02-04", "2026-02-06", "2026-02-08", "2026-02-10"];
    const measurements = [
      ...prevDates.map(d => ({ date: d, weight: 80.0, waist: 80.0 })),
      ...currDates.map(d => ({ date: d, weight: 79.9, waist: 79.9 })),
    ];
    await seedMeasurements(userId, measurements);

    // Registro completo y compliance alto (dentro +-10%)
    for (let i = -13; i <= 0; i++) {
      const date = addDaysIso(today, i);
      await upsertDailyNutritionLogV2(userId, { date, calories: 1950, day_type: "normal" });
    }

    const review = await getNutritionReview(userId, { today });
    assert.equal(review.success, true);
    assert.equal(review.mode, "fino");
    assert.equal(review.biweekly_review.status, "recommend_adjustment");
    assert.ok(typeof review.biweekly_review.recommended_delta_kcal === "number");
    assert.ok(review.biweekly_review.recommended_delta_kcal < 0); // bajar kcal
  } finally {
    await cleanupUser(userId);
  }
});

test("review v2: noise activo bloquea ajuste", async () => {
  requireNotProduction();

  const userId = await createTestUser();
  const today = "2026-02-10";

  try {
    await seedNutritionProfile(userId, "cut");
    await seedActivePlan(userId, { meta: "cut", kcal: 2000, createdAtIso: "2026-01-20" });

    const prevDates = ["2026-01-28", "2026-01-30", "2026-02-01", "2026-02-03"];
    const currDates = ["2026-02-04", "2026-02-06", "2026-02-08", "2026-02-10"];
    const measurements = [
      ...prevDates.map(d => ({ date: d, weight: 80.0, waist: 80.0 })),
      ...currDates.map(d => ({ date: d, weight: 79.9, waist: 80.0 })),
    ];
    await seedMeasurements(userId, measurements);

    for (let i = -13; i <= 0; i++) {
      const date = addDaysIso(today, i);
      const payload = { date, calories: 2000, day_type: "normal" };
      if (date === "2026-02-09") payload.noise_flags = ["viaje"];
      await upsertDailyNutritionLogV2(userId, payload);
    }

    const review = await getNutritionReview(userId, { today });
    assert.equal(review.success, true);
    assert.equal(review.mode, "fino");
    assert.equal(review.metrics.noise.active, true);
    assert.equal(review.biweekly_review.status, "blocked_by_noise");
  } finally {
    await cleanupUser(userId);
  }
});

test("review v2: expone último ajuste deshechable (si existe) para UI", async () => {
  requireNotProduction();

  const userId = await createTestUser();
  const today = "2026-02-10";

  try {
    await seedNutritionProfile(userId, "cut");
    await seedActivePlan(userId, { meta: "cut", kcal: 2000, createdAtIso: "2026-01-20" });

    const prevPlan = await pool.query(
      `SELECT id FROM app.nutrition_plans_v2 WHERE user_id = $1 AND tipo = 'activo' ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    assert.equal(prevPlan.rowCount, 1);
    const previousPlanId = prevPlan.rows[0].id;

    const newPlan = await pool.query(
      `
        INSERT INTO app.nutrition_plans_v2
          (user_id, plan_name, tipo, kcal_objetivo, macros_objetivo, meta, duracion_dias, fuente, version_reglas, created_at, updated_at)
        VALUES
          ($1, 'Plan New', 'archivado', 1800, $2, 'cut', 14, 'determinista', 'v1', NOW(), NOW())
        RETURNING id;
      `,
      [userId, JSON.stringify({ protein_g: 160, carbs_g: 200, fat_g: 70 })]
    );
    const newPlanId = newPlan.rows[0].id;

    await pool.query(
      `
        INSERT INTO app.nutrition_adjustment_actions (
          user_id, mode, source,
          previous_plan_id, new_plan_id,
          previous_kcal, new_kcal, delta_kcal,
          reason, metrics,
          undo_expires_at,
          applied_at
        ) VALUES (
          $1, 'quincenal', 'manual',
          $2, $3,
          2000, 1800, -200,
          'Test action', '{}'::jsonb,
          NOW() + INTERVAL '24 hours',
          NOW()
        );
      `,
      [userId, previousPlanId, newPlanId]
    );

    const review = await getNutritionReview(userId, { today });
    assert.equal(review.success, true);
    assert.ok(review.last_adjustment_action);
    assert.equal(review.last_adjustment_action.delta_kcal, -200);
    assert.equal(review.last_adjustment_action.undo_available, true);
  } finally {
    await cleanupUser(userId);
  }
});

test("review v2: day_type=cheat activa ruido y bloquea ajuste", async () => {
  requireNotProduction();

  const userId = await createTestUser();
  const today = "2026-02-10";

  try {
    await seedNutritionProfile(userId, "cut");
    await seedActivePlan(userId, { meta: "cut", kcal: 2000, createdAtIso: "2026-01-20" });

    // Pesajes suficientes con pérdida lenta (para que, sin ruido, recomendaría bajar kcal).
    const prevDates = ["2026-01-28", "2026-01-30", "2026-02-01", "2026-02-03"];
    const currDates = ["2026-02-04", "2026-02-06", "2026-02-08", "2026-02-10"];
    const measurements = [
      ...prevDates.map((d) => ({ date: d, weight: 80.0, waist: 80.0 })),
      ...currDates.map((d) => ({ date: d, weight: 79.9, waist: 79.9 })),
    ];
    await seedMeasurements(userId, measurements);

    // Registro completo y compliance alto.
    for (let i = -13; i <= 0; i++) {
      const date = addDaysIso(today, i);
      const payload = { date, calories: 1950, day_type: "normal" };
      if (date === "2026-02-09") payload.day_type = "cheat";
      await upsertDailyNutritionLogV2(userId, payload);
    }

    const review = await getNutritionReview(userId, { today });
    assert.equal(review.success, true);
    assert.equal(review.mode, "fino");
    assert.equal(review.metrics.noise.active, true);
    assert.ok(review.metrics.noise.reasons.includes("cheat"));
    assert.equal(review.biweekly_review.status, "blocked_by_noise");
  } finally {
    await cleanupUser(userId);
  }
});

test("review v2: outlier de peso (>1.5% en 24-48h) activa ruido y bloquea ajuste", async () => {
  requireNotProduction();

  const userId = await createTestUser();
  const today = "2026-02-10";

  try {
    await seedNutritionProfile(userId, "cut");
    await seedActivePlan(userId, { meta: "cut", kcal: 2000, createdAtIso: "2026-01-20" });

    // Pesajes suficientes + un outlier fuerte en los últimos 2 días.
    const prevDates = ["2026-01-28", "2026-01-30", "2026-02-01", "2026-02-03"];
    const currDates = ["2026-02-04", "2026-02-06", "2026-02-08", "2026-02-09", "2026-02-10"];
    const measurements = [
      ...prevDates.map((d) => ({ date: d, weight: 80.0, waist: 80.0 })),
      // Semana actual estable y luego salto grande (ruido).
      { date: "2026-02-04", weight: 79.9, waist: 79.9 },
      { date: "2026-02-06", weight: 79.9, waist: 79.9 },
      { date: "2026-02-08", weight: 79.9, waist: 79.9 },
      { date: "2026-02-09", weight: 82.0, waist: 80.0 }, // +2.6% en 24h aprox
      { date: "2026-02-10", weight: 82.0, waist: 80.0 },
    ];
    await seedMeasurements(userId, measurements);

    // Registro completo y compliance alto.
    for (let i = -13; i <= 0; i++) {
      const date = addDaysIso(today, i);
      await upsertDailyNutritionLogV2(userId, { date, calories: 1950, day_type: "normal" });
    }

    const review = await getNutritionReview(userId, { today });
    assert.equal(review.success, true);
    assert.equal(review.mode, "fino");
    assert.equal(review.metrics.noise.active, true);
    assert.ok(review.metrics.noise.reasons.includes("weight_outlier"));
    assert.ok(review.metrics.noise.weight_outlier);
    assert.equal(review.biweekly_review.status, "blocked_by_noise");
  } finally {
    await cleanupUser(userId);
  }
});

test.after(async () => {
  await pool.end();
});
