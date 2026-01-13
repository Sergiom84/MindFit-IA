/**
 * Script de diagnóstico para sesiones de usuario
 * Ejecutar con: node scripts/diagnose-user-sessions.js
 */

import pg from 'pg';
const { Pool } = pg;

// Configuración - ajusta según tu .env
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const USER_EMAIL = 'cal@bas.com';

async function diagnose() {
  const client = await pool.connect();
  
  try {
    console.log('🔍 Diagnóstico de sesiones para:', USER_EMAIL);
    console.log('='.repeat(60));
    
    // 1. Buscar usuario
    const userResult = await client.query(
      `SELECT id, email, created_at FROM app.users WHERE email = $1`,
      [USER_EMAIL]
    );
    
    if (userResult.rows.length === 0) {
      console.log('❌ Usuario no encontrado');
      return;
    }
    
    const userId = userResult.rows[0].id;
    console.log('\n📧 Usuario encontrado:');
    console.log('   ID:', userId);
    console.log('   Email:', userResult.rows[0].email);
    
    // 2. Planes del usuario
    const plansResult = await client.query(`
      SELECT id, methodology_type, status, created_at, updated_at
      FROM app.methodology_plans 
      WHERE user_id = $1 
      ORDER BY created_at DESC
    `, [userId]);
    
    console.log('\n📋 Planes del usuario:', plansResult.rows.length);
    plansResult.rows.forEach((plan, i) => {
      console.log(`   ${i+1}. Plan ID: ${plan.id}`);
      console.log(`      Tipo: ${plan.methodology_type}`);
      console.log(`      Estado: ${plan.status}`);
      console.log(`      Creado: ${plan.created_at}`);
    });
    
    // 3. Sesiones por plan
    console.log('\n📊 Sesiones por plan:');
    for (const plan of plansResult.rows) {
      const sessionsResult = await client.query(`
        SELECT id, week_number, day_name, session_status, created_at
        FROM app.methodology_exercise_sessions 
        WHERE methodology_plan_id = $1
        ORDER BY week_number, id
      `, [plan.id]);
      
      console.log(`\n   Plan ${plan.id} (${plan.methodology_type} - ${plan.status}):`);
      console.log(`   Total sesiones: ${sessionsResult.rows.length}`);
      
      if (sessionsResult.rows.length > 0) {
        // Agrupar por semana
        const byWeek = {};
        sessionsResult.rows.forEach(s => {
          if (!byWeek[s.week_number]) byWeek[s.week_number] = [];
          byWeek[s.week_number].push(s);
        });
        
        Object.keys(byWeek).forEach(week => {
          console.log(`     Semana ${week}:`, byWeek[week].map(s => 
            `${s.day_name}(${s.session_status || 'pending'})`
          ).join(', '));
        });
      }
    }
    
    // 4. Workout schedule
    console.log('\n📅 Workout Schedule:');
    const scheduleResult = await client.query(`
      SELECT ws.id, ws.methodology_plan_id, ws.week_number, ws.day_name, ws.scheduled_date
      FROM app.workout_schedule ws
      JOIN app.methodology_plans mp ON ws.methodology_plan_id = mp.id
      WHERE mp.user_id = $1
      ORDER BY ws.methodology_plan_id, ws.week_number, ws.scheduled_date
    `, [userId]);
    
    console.log('   Total entradas:', scheduleResult.rows.length);
    
    // Agrupar por plan
    const scheduleByPlan = {};
    scheduleResult.rows.forEach(s => {
      if (!scheduleByPlan[s.methodology_plan_id]) scheduleByPlan[s.methodology_plan_id] = [];
      scheduleByPlan[s.methodology_plan_id].push(s);
    });
    
    Object.keys(scheduleByPlan).forEach(planId => {
      const entries = scheduleByPlan[planId];
      console.log(`   Plan ${planId}: ${entries.length} días programados`);
      
      // Mostrar primeros y últimos
      if (entries.length > 0) {
        console.log(`     Primera: Sem ${entries[0].week_number}, ${entries[0].day_name} (${entries[0].scheduled_date?.toISOString().split('T')[0]})`);
        console.log(`     Última:  Sem ${entries[entries.length-1].week_number}, ${entries[entries.length-1].day_name} (${entries[entries.length-1].scheduled_date?.toISOString().split('T')[0]})`);
      }
    });
    
    // 5. Verificar plan 161 específicamente
    console.log('\n🎯 Diagnóstico específico del plan 161:');
    const plan161Sessions = await client.query(`
      SELECT id, week_number, day_name, session_status, created_at
      FROM app.methodology_exercise_sessions 
      WHERE methodology_plan_id = 161
      ORDER BY week_number, day_name
    `);
    
    if (plan161Sessions.rows.length === 0) {
      console.log('   ⚠️ No hay sesiones para el plan 161');
    } else {
      console.log('   Sesiones existentes:');
      plan161Sessions.rows.forEach(s => {
        console.log(`     - Sem ${s.week_number}, ${s.day_name}: ${s.session_status || 'pending'} (ID: ${s.id})`);
      });
    }
    
    // 6. Verificar workout_schedule para plan 161
    const schedule161 = await client.query(`
      SELECT week_number, day_name, scheduled_date
      FROM app.workout_schedule 
      WHERE methodology_plan_id = 161
      ORDER BY week_number, scheduled_date
    `);
    
    console.log('\n   Programación (workout_schedule):');
    if (schedule161.rows.length === 0) {
      console.log('   ⚠️ No hay programación para el plan 161');
    } else {
      schedule161.rows.forEach(s => {
        console.log(`     - Sem ${s.week_number}, ${s.day_name}: ${s.scheduled_date?.toISOString().split('T')[0]}`);
      });
    }
    
    // 7. Verificar si hay Martes en la semana 3
    const martesSem3 = schedule161.rows.find(s => s.week_number === 3 && s.day_name === 'Mar');
    if (martesSem3) {
      console.log('\n   ✅ Hay programación para Martes Semana 3');
    } else {
      console.log('\n   ❌ NO hay programación para Martes Semana 3 - Este es el problema!');
      console.log('   El plan probablemente no tiene entrenamiento para Martes.');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

diagnose();
