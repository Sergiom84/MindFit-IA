import { pool } from '../db.js';

async function checkSessionTables() {
  try {
    // Buscar todas las tablas relacionadas con sesiones
    const result = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'app'
        AND (table_name LIKE '%session%' OR table_name LIKE '%sesion%')
      ORDER BY table_name;
    `);

    console.log('📋 Tablas de sesiones encontradas:');
    if (result.rows.length === 0) {
      console.log('  ⚠️ No se encontraron tablas de sesiones');
    } else {
      result.rows.forEach((row) => {
        console.log(`  - ${row.table_name}`);
      });
    }
    console.log('');

    // Verificar también la tabla historico_ejercicios
    const historicoCheck = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'app'
        AND table_name = 'historico_ejercicios'
      ORDER BY ordinal_position;
    `);

    console.log('📋 Columnas de app.historico_ejercicios:');
    historicoCheck.rows.forEach((col) => {
      console.log(`  - ${col.column_name} (${col.data_type})`);
    });

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkSessionTables();
