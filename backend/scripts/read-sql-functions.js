import { pool } from '../db.js';

async function readSQLFunctions() {
  try {
    console.log('⚙️ LEYENDO CÓDIGO SQL DE FUNCIONES HIPERTROFIA V2\n');

    const functionsToRead = [
      'activate_muscle_priority',
      'deactivate_muscle_priority',
      'apply_microcycle_progression',
      'advance_cycle_day',
      'check_deload_trigger',
      'apply_fatigue_adjustments',
      'detect_neural_overlap'
    ];

    for (const funcName of functionsToRead) {
      console.log(`\n${'='.repeat(80)}`);
      console.log(`📜 FUNCIÓN: ${funcName}()`);
      console.log('='.repeat(80));

      const result = await pool.query(`
        SELECT pg_get_functiondef(p.oid) AS function_definition
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'app' AND p.proname = $1
        LIMIT 1
      `, [funcName]);

      if (result.rows.length > 0) {
        console.log(result.rows[0].function_definition);
      } else {
        console.log(`❌ Función no encontrada`);
      }
    }

    console.log('\n\n✅ Lectura completada');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

readSQLFunctions();
