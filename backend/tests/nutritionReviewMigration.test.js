import "./helpers/muteConsole.js"; // PRIMERO: silencia logs (evita flake IPC del runner)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { pool } from "../db.js";

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
    "../migrations/20260210_daily_nutrition_log_day_type_noise_flags.sql"
  );
  const sql = fs.readFileSync(migrationPath, "utf8");
  await pool.query(sql);
}

test("migration: daily_nutrition_log tiene day_type y noise_flags + constraint", async () => {
  requireNotProduction();
  await applyMigrationIfNeeded();

  const { rows: cols } = await pool.query(`
    SELECT column_name, data_type, udt_name, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'app'
      AND table_name = 'daily_nutrition_log'
      AND column_name IN ('day_type', 'noise_flags')
    ORDER BY column_name;
  `);

  assert.equal(cols.length, 2);

  const byName = Object.fromEntries(cols.map(r => [r.column_name, r]));
  assert.equal(byName.day_type.data_type, "text");
  assert.equal(byName.day_type.is_nullable, "NO");
  assert.ok(String(byName.day_type.column_default || "").includes("'normal'"));

  // En Postgres, los arrays suelen reportar data_type='ARRAY' y udt_name='_text' (text[]).
  assert.equal(byName.noise_flags.data_type, "ARRAY");
  assert.equal(byName.noise_flags.udt_name, "_text");
  assert.equal(byName.noise_flags.is_nullable, "NO");
  assert.ok(
    String(byName.noise_flags.column_default || "").includes("'{}'") ||
      String(byName.noise_flags.column_default || "").includes("ARRAY[]")
  );

  const { rows: cons } = await pool.query(`
    SELECT conname, pg_get_constraintdef(c.oid) as def
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'app'
      AND t.relname = 'daily_nutrition_log'
      AND c.conname = 'daily_nutrition_log_day_type_check'
    LIMIT 1;
  `);
  assert.equal(cons.length, 1);
  assert.ok(cons[0].def.includes("day_type"));
});

test("migration: defaults se aplican al insertar (day_type='normal', noise_flags vacio)", async () => {
  requireNotProduction();
  await applyMigrationIfNeeded();

  // No hay FK en app.daily_nutrition_log, así que podemos usar un user_id artificial.
  const userId = 900_000_000 + Math.floor(Math.random() * 50_000_000);
  const logDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  try {
    await pool.query(
      `
        INSERT INTO app.daily_nutrition_log (user_id, log_date, calories, protein, carbs, fat)
        VALUES ($1, $2, 2000, 150, 200, 70)
        ON CONFLICT (user_id, log_date)
        DO NOTHING;
      `,
      [userId, logDate]
    );

    const { rows } = await pool.query(
      `
        SELECT day_type, noise_flags
        FROM app.daily_nutrition_log
        WHERE user_id = $1 AND log_date = $2
        LIMIT 1;
      `,
      [userId, logDate]
    );

    assert.equal(rows.length, 1);
    assert.equal(rows[0].day_type, "normal");
    assert.deepEqual(rows[0].noise_flags, []);
  } finally {
    await pool.query(`DELETE FROM app.daily_nutrition_log WHERE user_id = $1 AND log_date = $2`, [
      userId,
      logDate,
    ]);
  }
});

test.after(async () => {
  await pool.end();
});
