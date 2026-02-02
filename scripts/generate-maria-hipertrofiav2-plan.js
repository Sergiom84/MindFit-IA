/**
 * Script para generar plan HipertrofiaV2 para María
 * Simula la generación desde la app
 * Usuario: María (ciclo@ciclo.com) - user_id: 39
 */

import fetch from 'node-fetch';

const API_URL = 'http://localhost:3010';
const USER_ID = 39;
const USER_EMAIL = 'ciclo@ciclo.com';

// Token JWT de María (generado manualmente o desde login)
// Para testing, podríamos usar un token real o crear uno temporal
const AUTH_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjM5LCJlbWFpbCI6ImNpY2xvQGNpY2xvLmNvbSIsImlhdCI6MTczODQzMzI4NCwiZXhwIjoxNzM4NTE5Njg0fQ.xyz'; // Placeholder

async function generateHipertrofiaV2Plan() {
  console.log('🚀 Iniciando generación de plan HipertrofiaV2 para María...\n');

  try {
    // Paso 1: Evaluar perfil con el especialista
    console.log('📊 Paso 1: Evaluando perfil con especialista de calistenia...');

    const evaluateResponse = await fetch(`${API_URL}/api/routine-generation/specialist/calistenia/evaluate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AUTH_TOKEN}`
      },
      body: JSON.stringify({
        userId: USER_ID,
        perfil: {
          sexo: 'femenino',
          peso: 60,
          altura: 165,
          nivel_entrenamiento: 'Intermedio',
          objetivo_principal: 'tonificar',
          dias_disponibles: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'],
          semanas_deseadas: 4,
          ejercicios_por_dia: 8
        }
      })
    });

    if (!evaluateResponse.ok) {
      const errorText = await evaluateResponse.text();
      console.error('❌ Error en evaluación:', evaluateResponse.status, errorText);
      return;
    }

    const evaluation = await evaluateResponse.json();
    console.log('✅ Evaluación completada:', evaluation.nivel_asignado);
    console.log('   Nivel asignado:', evaluation.nivel_asignado);
    console.log('   Días de entrenamiento:', evaluation.dias_entrenamiento);
    console.log('   Semanas:', evaluation.semanas_totales);
    console.log('');

    // Paso 2: Generar plan D1-D5 con HipertrofiaV2
    console.log('🏋️ Paso 2: Generando plan D1-D5 con HipertrofiaV2...');

    const generateResponse = await fetch(`${API_URL}/api/hipertrofiav2/generate-plan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AUTH_TOKEN}`
      },
      body: JSON.stringify({
        userId: USER_ID,
        nivel: evaluation.nivel_asignado || 'Intermedio',
        semanas: evaluation.semanas_totales || 4,
        planStartDate: '2026-02-02' // Mañana (día 17 del ciclo)
      })
    });

    if (!generateResponse.ok) {
      const errorText = await generateResponse.text();
      console.error('❌ Error en generación:', generateResponse.status, errorText);
      return;
    }

    const plan = await generateResponse.json();
    console.log('✅ Plan generado exitosamente!');
    console.log('   Plan ID:', plan.methodologyPlanId);
    console.log('   Fecha de inicio:', plan.planStartDate);
    console.log('   Número de semanas:', plan.plan?.semanas?.length || 0);
    console.log('   Ejercicios totales:', plan.plan?.totalExercises || 'N/A');
    console.log('');

    // Paso 3: Confirmar el plan (marcar como activo)
    console.log('✅ Paso 3: Confirmando plan...');

    const confirmResponse = await fetch(`${API_URL}/api/routines/confirm-plan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AUTH_TOKEN}`
      },
      body: JSON.stringify({
        userId: USER_ID,
        methodologyPlanId: plan.methodologyPlanId,
        planStartDate: '2026-02-02'
      })
    });

    if (!confirmResponse.ok) {
      const errorText = await confirmResponse.text();
      console.error('❌ Error confirmando plan:', confirmResponse.status, errorText);
      return;
    }

    const confirmed = await confirmResponse.json();
    console.log('✅ Plan confirmado y activado!');
    console.log('');

    // Resumen final
    console.log('═══════════════════════════════════════════════');
    console.log('📋 RESUMEN DEL PLAN GENERADO');
    console.log('═══════════════════════════════════════════════');
    console.log(`Usuario: María (ID: ${USER_ID})`);
    console.log(`Plan ID: ${plan.methodologyPlanId}`);
    console.log(`Nivel: ${evaluation.nivel_asignado || 'Intermedio'}`);
    console.log(`Inicio: 2 de febrero 2026 (Día 17 del ciclo menstrual)`);
    console.log(`Fase del ciclo: Lútea temprana`);
    console.log(`Duración: ${plan.plan?.semanas?.length || 4} semanas`);
    console.log(`Días de entrenamiento: D1-D5 (5 días/semana)`);
    console.log('');
    console.log('🔍 Estado del ciclo menstrual:');
    console.log('   - Último período: 17 de enero 2026');
    console.log('   - Día del ciclo actual: 16 (1 febrero)');
    console.log('   - Día del ciclo al empezar: 17 (2 febrero)');
    console.log('   - Próximo período esperado: 14 de febrero 2026');
    console.log('');
    console.log('⚠️  Ejercicios con restricciones menstruales:');
    console.log('   - Durante menstruación (14-17 feb): filtrado activo');
    console.log('   - Ejercicios pesados/core serán adaptados');
    console.log('   - Intensidad reducida automáticamente');
    console.log('═══════════════════════════════════════════════');

  } catch (error) {
    console.error('❌ Error fatal:', error.message);
    console.error(error.stack);
  }
}

// Ejecutar script
generateHipertrofiaV2Plan();
