import { pool } from '../db.js';

async function checkVideos() {
  try {
    // Primero verificar las columnas de la tabla
    const columnsResult = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'app'
        AND table_name = 'Ejercicios_Hipertrofia'
      ORDER BY ordinal_position
    `);

    console.log('📋 Columnas de app.Ejercicios_Hipertrofia:');
    columnsResult.rows.forEach((col) => {
      console.log(`  - ${col.column_name} (${col.data_type})`);
    });
    console.log('');

    // Ahora consultar algunos ejercicios
    const result = await pool.query(`
      SELECT
        exercise_id,
        nombre,
        nivel
      FROM app."Ejercicios_Hipertrofia"
      LIMIT 5
    `);

    console.log('📋 Ejercicios (primeros 5):');
    result.rows.forEach((row, idx) => {
      console.log(`${idx + 1}. ${row.nombre} (Nivel: ${row.nivel})`);
    });

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkVideos();
