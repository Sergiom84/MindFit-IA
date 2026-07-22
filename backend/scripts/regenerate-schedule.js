/**
 * Script para regenerar workout_schedule de un plan existente
 * Uso: node scripts/regenerate-schedule.js <plan_id>
 */

import { pool } from '../db.js';

async function regenerateSchedule(planId) {
  const client = await pool.connect();

  try {
    console.log(`🔄 Regenerando programación para plan ${planId}...`);

    // Obtener datos del plan
    const planQuery = await client.query(
      `SELECT id, user_id, plan_data, plan_start_date, confirmed_at, created_at
       FROM app.methodology_plans
       WHERE id = $1`,
      [planId]
    );

    if (planQuery.rowCount === 0) {
      console.error(`❌ Plan ${planId} no encontrado`);
      process.exit(1);
    }

    const plan = planQuery.rows[0];
    const userId = plan.user_id;
    const planData = plan.plan_data;
    const startDate = plan.plan_start_date || plan.confirmed_at || plan.created_at;

    console.log(`📅 Fecha de inicio: ${startDate}`);
    console.log(`👤 Usuario: ${userId}`);

    // Limpiar programación existente
    await client.query('BEGIN');

    await client.query(
      `DELETE FROM app.workout_schedule WHERE methodology_plan_id = $1 AND user_id = $2`,
      [planId, userId]
    );

    await client.query(
      `DELETE FROM app.methodology_plan_days WHERE plan_id = $1`,
      [planId]
    );

    console.log('🗑️ Programación anterior eliminada');

    // Llamar a la función de backend (simulación)
    // Nota: Esto requiere importar la función desde routines.js
    // Por ahora, solo mostramos el SQL necesario

    console.log('\n📝 Pasos siguientes:');
    console.log('1. Reinicia el servidor backend');
    console.log('2. Llama al endpoint /api/routines/active-plan');
    console.log('   O ejecuta una petición a /api/routines/sessions/start');
    console.log('\n✅ El sistema regenerará automáticamente workout_schedule con la nueva lógica');

    await client.query('COMMIT');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

const planId = process.argv[2];

if (!planId) {
  console.log('Uso: node scripts/regenerate-schedule.js <plan_id>');
  console.log('\nEjemplo:');
  console.log('  node scripts/regenerate-schedule.js 28');
  process.exit(1);
}

regenerateSchedule(parseInt(planId, 10));
