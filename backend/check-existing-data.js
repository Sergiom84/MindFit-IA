import pool from './db.js';

async function checkData() {
  try {
    console.log('🔍 Verificando datos existentes en app.plan_start_config...\n');

    const count = await pool.query(`
      SELECT COUNT(*) as total
      FROM app.plan_start_config;
    `);

    console.log('Total de registros:', count.rows[0].total);

    if (parseInt(count.rows[0].total) > 0) {
      console.log('\n⚠️  HAY DATOS EXISTENTES');
      console.log('La migración necesita un enfoque especial para no perder datos.');

      const sample = await pool.query(`
        SELECT *
        FROM app.plan_start_config
        LIMIT 3;
      `);

      console.log('\n📊 Muestra de datos:');
      console.log(JSON.stringify(sample.rows, null, 2));
    } else {
      console.log('\n✅ Tabla vacía, migración segura');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkData();
