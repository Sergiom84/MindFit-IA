import { pool } from '../db.js';

async function checkProgressTables() {
  try {
    const result = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'app'
        AND (table_name LIKE '%progress%' OR table_name LIKE '%tracking%')
      ORDER BY table_name
    `);

    console.log('📋 Tablas de progreso/tracking:');
    result.rows.forEach((row) => {
      console.log(`  - ${row.table_name}`);
    });

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkProgressTables();
