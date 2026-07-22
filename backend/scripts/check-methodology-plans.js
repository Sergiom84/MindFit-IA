import { pool } from '../db.js';

async function checkPlans() {
  try {
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'app'
        AND table_name = 'methodology_plans'
      ORDER BY ordinal_position
    `);

    console.log('📋 Columnas de app.methodology_plans:');
    result.rows.forEach((col) => {
      console.log(`  - ${col.column_name} (${col.data_type}) ${col.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'}`);
    });

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkPlans();
