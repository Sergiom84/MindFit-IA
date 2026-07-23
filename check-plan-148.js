// Script para verificar el estado del plan 148 en BD
import { pool } from './backend/db.js';

async function checkPlan148() {
  const client = await pool.connect();

  try {
    console.log('\n🔍 === VERIFICACIÓN PLAN 148 ===\n');

    // 1. Verificar plan_start_config
    console.log('1️⃣ Configuración de primera semana:');
    const configResult = await client.query(`
      SELECT *
      FROM app.plan_start_config
      WHERE methodology_plan_id = 148
    `);
    console.log(configResult.rows[0] || 'No encontrado');

    // 2. Verificar workout_schedule semana 1
    console.log('\n2️⃣ Sesiones en workout_schedule (Semana 1):');
    const scheduleResult = await client.query(`
      SELECT
        week_number,
        day_abbrev,
        scheduled_date::text,
        session_title,
        session_order
      FROM app.workout_schedule
      WHERE methodology_plan_id = 148
        AND user_id = 21
        AND week_number = 1
      ORDER BY scheduled_date
    `);
    console.table(scheduleResult.rows);
    console.log(`Total sesiones semana 1: ${scheduleResult.rows.length}`);

    // 3. Verificar workout_schedule semana 2 (para comparar)
    console.log('\n3️⃣ Sesiones en workout_schedule (Semana 2):');
    const schedule2Result = await client.query(`
      SELECT
        week_number,
        day_abbrev,
        scheduled_date::text,
        session_title,
        session_order
      FROM app.workout_schedule
      WHERE methodology_plan_id = 148
        AND user_id = 21
        AND week_number = 2
      ORDER BY scheduled_date
    `);
    console.table(schedule2Result.rows);
    console.log(`Total sesiones semana 2: ${schedule2Result.rows.length}`);

    // 4. Verificar estructura del plan (primeras 5 sesiones)
    console.log('\n4️⃣ Estructura del plan D1-D5:');
    const planResult = await client.query(`
      SELECT
        (sesion->>'nombre')::text as nombre_sesion,
        (sesion->>'dia')::text as dia_asignado,
        (sesion->>'ciclo_dia')::text as ciclo_dia
      FROM app.methodology_plans,
        jsonb_array_elements((plan_data->'semanas'->0->'sesiones')::jsonb) AS sesion
      WHERE id = 148
    `);
    console.table(planResult.rows);
    console.log(`Total sesiones D1-D5 en plan: ${planResult.rows.length}`);

    // 5. Verificar todas las semanas
    console.log('\n5️⃣ Resumen por semana:');
    const summaryResult = await client.query(`
      SELECT
        week_number,
        COUNT(*) as sesiones_programadas,
        string_agg(day_abbrev, '-' ORDER BY scheduled_date) as patron_dias
      FROM app.workout_schedule
      WHERE methodology_plan_id = 148
        AND user_id = 21
      GROUP BY week_number
      ORDER BY week_number
    `);
    console.table(summaryResult.rows);

    console.log('\n✅ Verificación completada\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

checkPlan148();
