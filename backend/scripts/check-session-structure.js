import { pool } from '../db.js';

async function checkStructure() {
  try {
    const tables = [
      'exercise_session_tracking',
      'home_training_sessions',
      'methodology_exercise_sessions',
      'user_sessions'
    ];

    for (const table of tables) {
      console.log(`\n📋 Estructura de app.${table}:`);
      const result = await pool.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'app'
          AND table_name = $1
        ORDER BY ordinal_position;
      `, [table]);

      if (result.rows.length === 0) {
        console.log('  ⚠️ Tabla no encontrada o sin columnas');
      } else {
        result.rows.forEach((col) => {
          console.log(`  - ${col.column_name} (${col.data_type}) ${col.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'}`);
        });
      }
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkStructure();
