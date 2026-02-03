/**
 * Test básico del swap engine con datos temporales (ROLLBACK).
 * Ejecutar con: node scripts/test-menstrual-cycle-swaps.mjs
 */
import pg from 'pg';
import dotenv from 'dotenv';
import assert from 'node:assert/strict';
import { findSwapCandidate } from '../backend/services/menstrualCycle/swapEngine.js';

dotenv.config();
dotenv.config({ path: 'backend/.env', override: false });

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('❌ DATABASE_URL no definido.');
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

const main = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const exercises = await client.query(
      `SELECT exercise_id
       FROM app."Ejercicios_Hipertrofia"
       ORDER BY exercise_id ASC
       LIMIT 2`
    );

    assert.ok(exercises.rows.length === 2, 'No hay suficientes ejercicios para test');
    const [ex1, ex2] = exercises.rows.map(row => Number(row.exercise_id));

    await client.query(
      `INSERT INTO app.exercise_tags
        (exercise_id, source_table, pattern, equipment, impact_level, axial_load_level, cod_level, overhead)
       VALUES
        ($1, 'Ejercicios_Hipertrofia', 'squat', ARRAY['barra'], 3, 3, 0, false),
        ($2, 'Ejercicios_Hipertrofia', 'squat', ARRAY['barra'], 1, 1, 0, false)
       ON CONFLICT (exercise_id, source_table)
       DO UPDATE SET
         pattern = EXCLUDED.pattern,
         equipment = EXCLUDED.equipment,
         impact_level = EXCLUDED.impact_level,
         axial_load_level = EXCLUDED.axial_load_level,
         cod_level = EXCLUDED.cod_level,
         overhead = EXCLUDED.overhead,
         updated_at = NOW()`,
      [ex1, ex2]
    );

    const candidate = await findSwapCandidate(client, {
      pattern: 'squat',
      equipment: ['barra'],
      maxImpact: 1,
      maxAxial: 1,
      maxCod: null,
      excludeIds: [ex1]
    });

    assert.ok(candidate, 'No se encontró candidato');
    assert.equal(Number(candidate.exercise_id), ex2);

    await client.query('ROLLBACK');
    console.log('✅ Swap engine test OK (rollback aplicado).');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Swap engine test FAIL:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
};

main();
