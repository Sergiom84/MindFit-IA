/**
 * Test de autoajuste y deload (ROLLBACK).
 * Ejecutar con: node scripts/test-menstrual-cycle-deload.mjs
 */
import pg from 'pg';
import dotenv from 'dotenv';
import assert from 'node:assert/strict';
import {
  applyAutoAdjustFromLog,
  getActiveDeloadState,
  getPatternAutoAdjustments
} from '../backend/services/menstrualCycle/autoAdjustService.js';

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

const toDateString = (date) => date.toISOString().split('T')[0];

const ensureColumnExists = async (client, column) => {
  const result = await client.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'app' AND table_name = 'methodology_exercise_sessions'
       AND column_name = $1`,
    [column]
  );
  return result.rows.length > 0;
};

const main = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const hasSessionDate = await ensureColumnExists(client, 'session_date');
    const hasExercisesData = await ensureColumnExists(client, 'exercises_data');
    const hasExercises = await ensureColumnExists(client, 'exercises');
    if (!hasSessionDate) {
      throw new Error('La columna app.methodology_exercise_sessions.session_date no existe.');
    }
    if (!hasExercisesData && !hasExercises) {
      throw new Error('No existe columna exercises_data ni exercises en methodology_exercise_sessions.');
    }

    const sessionResult = await client.query(
      `SELECT id, user_id
       FROM app.methodology_exercise_sessions
       ORDER BY created_at DESC
       LIMIT 1`
    );

    if (sessionResult.rows.length === 0) {
      throw new Error('No hay sesiones en methodology_exercise_sessions para probar.');
    }

    const sessionId = sessionResult.rows[0].id;
    const userId = sessionResult.rows[0].user_id;

    const baseDate = new Date();
    const logDates = [];

    for (let i = 0; i < 3; i += 1) {
      const sessionDate = new Date(baseDate);
      sessionDate.setDate(sessionDate.getDate() - (2 - i));
      const logDate = new Date(sessionDate);
      logDate.setDate(logDate.getDate() + 1);

      const sessionDateStr = toDateString(sessionDate);
      const logDateStr = toDateString(logDate);
      logDates.push(logDateStr);

      const exercisePayload = JSON.stringify([{ patron_movimiento: 'empuje' }]);
      const exercisesColumn = hasExercisesData ? 'exercises_data' : 'exercises';
      await client.query(
        `UPDATE app.methodology_exercise_sessions
         SET session_date = $2,
             session_status = 'completed',
             ${exercisesColumn} = $3
         WHERE id = $1`,
        [sessionId, sessionDateStr, exercisePayload]
      );

      await applyAutoAdjustFromLog(client, {
        userId,
        logDate: logDateStr,
        painNextDay: 8,
        sessionQuality: 3
      });
    }

    const autoAdjust = await getPatternAutoAdjustments(client, userId, ['push']);
    assert.equal(autoAdjust.painTriggered, true, 'No se activo painTriggered');
    assert.equal(autoAdjust.qualityTriggered, true, 'No se activo qualityTriggered');
    assert.ok(autoAdjust.volumeMultiplier < 1, 'volumeMultiplier no redujo');
    assert.ok(autoAdjust.intensityMultiplier < 1, 'intensityMultiplier no redujo');
    assert.ok(autoAdjust.restExtraSeconds > 0, 'restExtraSeconds no aumento');

    const deloadState = await getActiveDeloadState(client, userId, logDates[2]);
    assert.ok(deloadState, 'No se creo estado de deload');

    await client.query('ROLLBACK');
    console.log('✅ Autoajuste + deload OK (rollback aplicado).');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Autoajuste + deload FAIL:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
};

main();
