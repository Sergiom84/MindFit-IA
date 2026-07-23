import "./helpers/muteConsole.js"; // PRIMERO: silencia logs (evita flake IPC del runner)
import test from "node:test";
import assert from "node:assert/strict";

import { pool } from "../db.js";
import {
  getDailyNutritionLogV2,
  isNutritionDayRegistered,
  upsertDailyNutritionLogV2,
} from "../services/nutritionDailyLogV2.js";

function requireNotProduction() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to run DB-mutation tests with NODE_ENV=production");
  }
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

test("daily v2: guardar solo kcal cuenta como registrado", async () => {
  requireNotProduction();

  const userId = 910_000_000 + Math.floor(Math.random() * 50_000_000);
  const date = todayIso();

  try {
    const saved = await upsertDailyNutritionLogV2(userId, { date, calories: 2100 });
    assert.equal(saved.date, date);
    assert.equal(saved.calories, 2100);
    assert.equal(saved.day_type, "normal");
    assert.deepEqual(saved.noise_flags, []);
    assert.ok(saved.daily_log);
    assert.ok(Object.prototype.hasOwnProperty.call(saved.daily_log, "mealProgress"));

    assert.equal(isNutritionDayRegistered(saved), true);

    const fetched = await getDailyNutritionLogV2(userId, date);
    assert.equal(fetched.exists, true);
    assert.equal(fetched.daily.calories, 2100);
    assert.equal(isNutritionDayRegistered(fetched.daily), true);
  } finally {
    await pool.query(`DELETE FROM app.daily_nutrition_log WHERE user_id = $1 AND log_date = $2`, [
      userId,
      date,
    ]);
  }
});

test("daily v2: day_type=cheat con kcal 0 cuenta como registrado", async () => {
  requireNotProduction();

  const userId = 920_000_000 + Math.floor(Math.random() * 50_000_000);
  const date = todayIso();

  try {
    const saved = await upsertDailyNutritionLogV2(userId, { date, calories: 0, day_type: "cheat" });
    assert.equal(saved.day_type, "cheat");
    assert.equal(saved.calories, 0);
    assert.equal(isNutritionDayRegistered(saved), true);

    const fetched = await getDailyNutritionLogV2(userId, date);
    assert.equal(fetched.exists, true);
    assert.equal(fetched.daily.day_type, "cheat");
    assert.equal(isNutritionDayRegistered(fetched.daily), true);
  } finally {
    await pool.query(`DELETE FROM app.daily_nutrition_log WHERE user_id = $1 AND log_date = $2`, [
      userId,
      date,
    ]);
  }
});

test("daily v2: noise_flags se persisten y se leen igual (no cuenta como registrado por si solo)", async () => {
  requireNotProduction();

  const userId = 930_000_000 + Math.floor(Math.random() * 50_000_000);
  const date = todayIso();

  try {
    const saved = await upsertDailyNutritionLogV2(userId, {
      date,
      noise_flags: ["viaje", "viaje", "  "],
    });
    assert.deepEqual(saved.noise_flags, ["viaje"]);
    assert.equal(saved.day_type, "normal");
    assert.equal(saved.calories, null);
    assert.equal(isNutritionDayRegistered(saved), false);

    const fetched = await getDailyNutritionLogV2(userId, date);
    assert.deepEqual(fetched.daily.noise_flags, ["viaje"]);
  } finally {
    await pool.query(`DELETE FROM app.daily_nutrition_log WHERE user_id = $1 AND log_date = $2`, [
      userId,
      date,
    ]);
  }
});

test("daily v2: day_type inválido falla", async () => {
  requireNotProduction();

  const userId = 940_000_000 + Math.floor(Math.random() * 50_000_000);
  const date = todayIso();

  await assert.rejects(
    () => upsertDailyNutritionLogV2(userId, { date, day_type: "xxx" }),
    /day_type inválido/
  );
});

test.after(async () => {
  await pool.end();
});
