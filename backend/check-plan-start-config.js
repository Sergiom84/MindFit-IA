import pool from './db.js';

async function checkTable() {
  try {
    console.log('🔍 Verificando estructura de app.plan_start_config...\n');

    // Verificar si la tabla existe
    const tableExists = await pool.query(`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'app'
        AND table_name = 'plan_start_config'
      );
    `);

    console.log('Tabla existe:', tableExists.rows[0].exists);

    if (tableExists.rows[0].exists) {
      // Ver columnas actuales
      const columns = await pool.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'app'
        AND table_name = 'plan_start_config'
        ORDER BY ordinal_position;
      `);

      console.log('\n📋 Columnas actuales:');
      columns.rows.forEach(col => {
        console.log(`  - ${col.column_name} (${col.data_type}) ${col.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'}`);
      });

      // Ver constraints
      const constraints = await pool.query(`
        SELECT constraint_name, constraint_type
        FROM information_schema.table_constraints
        WHERE table_schema = 'app'
        AND table_name = 'plan_start_config';
      `);

      console.log('\n🔒 Constraints:');
      constraints.rows.forEach(c => {
        console.log(`  - ${c.constraint_name} (${c.constraint_type})`);
      });
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkTable();
