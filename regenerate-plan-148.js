// Script para regenerar workout_schedule del plan 148
import { pool } from './backend/db.js';
import { ensureWorkoutScheduleV3 } from './backend/utils/ensureScheduleV3.js';

async function regeneratePlan148() {
  const client = await pool.connect();

  try {
    console.log('\n🔄 === REGENERANDO PLAN 148 ===\n');

    // 1. Obtener datos del plan
    console.log('1️⃣ Obteniendo datos del plan...');
    const planResult = await client.query(`
      SELECT
        id,
        user_id,
        plan_data,
        methodology_type,
        created_at
      FROM app.methodology_plans
      WHERE id = 148
    `);

    if (planResult.rows.length === 0) {
      throw new Error('Plan 148 no encontrado');
    }

    const plan = planResult.rows[0];
    console.log('✅ Plan encontrado:', {
      id: plan.id,
      userId: plan.user_id,
      metodologia: plan.methodology_type
    });

    // 2. Obtener configuración de inicio
    console.log('\n2️⃣ Obteniendo configuración de inicio...');
    const configResult = await client.query(`
      SELECT * FROM app.plan_start_config
      WHERE methodology_plan_id = 148
    `);

    const startConfig = configResult.rows[0];
    console.log('✅ Configuración encontrada:', {
      firstWeekPattern: startConfig?.first_week_pattern,
      startDate: startConfig?.start_date,
      includeSaturdays: startConfig?.include_saturdays
    });

    // 3. Actualizar first_week_pattern a 5 días Y corregir start_date
    console.log('\n3️⃣ Actualizando configuración a D1-D5...');
    // Plan D1-D5: Comenzar el lunes 17 (HOY) con las 5 sesiones completas
    await client.query(`
      UPDATE app.plan_start_config
      SET
        first_week_pattern = 'Lun-Mar-Mie-Jue-Vie',
        start_date = '2025-11-17',  -- Lunes 17 (HOY)
        start_day_of_week = 1,      -- Lunes
        updated_at = NOW()
      WHERE methodology_plan_id = 148
    `);
    console.log('✅ Configuración actualizada: Lunes 17 inicio con patrón D1-D5');

    // 4. Eliminar workout_schedule antiguo
    console.log('\n4️⃣ Eliminando workout_schedule antiguo...');
    const deleteResult = await client.query(`
      DELETE FROM app.workout_schedule
      WHERE methodology_plan_id = 148
      RETURNING id
    `);
    console.log(`✅ Eliminadas ${deleteResult.rowCount} sesiones`);

    // 5. Eliminar methodology_plan_days antiguo
    console.log('\n5️⃣ Eliminando methodology_plan_days antiguo...');
    const deleteDaysResult = await client.query(`
      DELETE FROM app.methodology_plan_days
      WHERE plan_id = 148
    `);
    console.log(`✅ Eliminados ${deleteDaysResult.rowCount} días`);

    // 6. Regenerar workout_schedule
    console.log('\n6️⃣ Regenerando workout_schedule...');

    // Recargar config actualizada
    const updatedConfigResult = await client.query(`
      SELECT * FROM app.plan_start_config
      WHERE methodology_plan_id = 148
    `);
    const updatedConfig = updatedConfigResult.rows[0];

    await ensureWorkoutScheduleV3(
      client,
      plan.user_id,
      plan.id,
      plan.plan_data,
      new Date(startConfig.start_date),
      updatedConfig
    );

    console.log('✅ workout_schedule regenerado');

    // 7. Verificar resultado
    console.log('\n7️⃣ Verificando resultado...');
    const verifyResult = await client.query(`
      SELECT
        week_number,
        COUNT(*) as sesiones,
        string_agg(day_abbrev, '-' ORDER BY scheduled_date) as patron
      FROM app.workout_schedule
      WHERE methodology_plan_id = 148
      GROUP BY week_number
      ORDER BY week_number
    `);

    console.table(verifyResult.rows);

    // Verificar semana 1 específicamente
    const week1Result = await client.query(`
      SELECT
        day_abbrev,
        scheduled_date::text,
        session_title
      FROM app.workout_schedule
      WHERE methodology_plan_id = 148
        AND week_number = 1
      ORDER BY scheduled_date
    `);

    console.log('\n📅 Detalle Semana 1:');
    console.table(week1Result.rows);

    if (week1Result.rows.length === 5) {
      console.log('\n✅ ¡ÉXITO! Semana 1 tiene 5 sesiones D1-D5');
    } else {
      console.log(`\n❌ ERROR: Semana 1 tiene ${week1Result.rows.length} sesiones (esperadas: 5)`);
    }

    console.log('\n✅ Regeneración completada\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    client.release();
    await pool.end();
  }
}

regeneratePlan148();
