import { pool } from '../db.js';

async function checkHipertrofiaV2Tables() {
  try {
    console.log('🔍 VERIFICACIÓN DE TABLAS HIPERTROFIA V2\n');

    // 1. Listar todas las tablas relacionadas con hipertrofia
    console.log('📋 1. TABLAS DE HIPERTROFIA V2:');
    const tables = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'app'
        AND (table_name LIKE '%hipertrofia%' OR table_name LIKE '%hypertrophy%')
      ORDER BY table_name
    `);

    tables.rows.forEach((row) => {
      console.log(`  ✅ ${row.table_name}`);
    });

    // 2. Verificar estructura de hipertrofia_v2_session_config
    console.log('\n📊 2. ESTRUCTURA DE hipertrofia_v2_session_config:');
    const sessionConfig = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'app' AND table_name = 'hipertrofia_v2_session_config'
      ORDER BY ordinal_position
    `);

    if (sessionConfig.rows.length > 0) {
      sessionConfig.rows.forEach((col) => {
        console.log(`  - ${col.column_name}: ${col.data_type} ${col.is_nullable === 'NO' ? '(NOT NULL)' : ''}`);
      });
    } else {
      console.log('  ❌ Tabla no encontrada');
    }

    // 3. Verificar datos de configuración D1-D5
    console.log('\n🎯 3. CONFIGURACIÓN D1-D5:');
    const d1d5Config = await pool.query(`
      SELECT cycle_day, session_name, default_sets, default_reps_range,
             default_rir_target, intensity_percentage, is_heavy_day
      FROM app.hipertrofia_v2_session_config
      ORDER BY cycle_day
    `);

    if (d1d5Config.rows.length > 0) {
      d1d5Config.rows.forEach((row) => {
        console.log(`  D${row.cycle_day} (${row.session_name}): ${row.default_sets} series × ${row.default_reps_range} reps, RIR ${row.default_rir_target}, ${row.intensity_percentage}% (${row.is_heavy_day ? 'PESADO' : 'LIGERO'})`);
      });
    } else {
      console.log('  ❌ No hay datos configurados');
    }

    // 4. Verificar estructura de hipertrofia_v2_state
    console.log('\n🔄 4. ESTRUCTURA DE hipertrofia_v2_state:');
    const stateStructure = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'app' AND table_name = 'hipertrofia_v2_state'
      ORDER BY ordinal_position
    `);

    if (stateStructure.rows.length > 0) {
      stateStructure.rows.forEach((col) => {
        console.log(`  - ${col.column_name}: ${col.data_type} ${col.is_nullable === 'NO' ? '(NOT NULL)' : ''}`);
      });
    } else {
      console.log('  ❌ Tabla no encontrada');
    }

    // 5. Verificar estructura de hypertrophy_set_logs
    console.log('\n📝 5. ESTRUCTURA DE hypertrophy_set_logs:');
    const setLogsStructure = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'app' AND table_name = 'hypertrophy_set_logs'
      ORDER BY ordinal_position
    `);

    if (setLogsStructure.rows.length > 0) {
      setLogsStructure.rows.forEach((col) => {
        console.log(`  - ${col.column_name}: ${col.data_type} ${col.is_nullable === 'NO' ? '(NOT NULL)' : ''}`);
      });
    } else {
      console.log('  ❌ Tabla no encontrada');
    }

    // 6. Verificar estructura de fatigue_flags
    console.log('\n🚩 6. ESTRUCTURA DE fatigue_flags:');
    const fatigueFlagsStructure = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'app' AND table_name = 'fatigue_flags'
      ORDER BY ordinal_position
    `);

    if (fatigueFlagsStructure.rows.length > 0) {
      fatigueFlagsStructure.rows.forEach((col) => {
        console.log(`  - ${col.column_name}: ${col.data_type} ${col.is_nullable === 'NO' ? '(NOT NULL)' : ''}`);
      });
    } else {
      console.log('  ❌ Tabla no encontrada');
    }

    // 7. Verificar funciones SQL de hipertrofia
    console.log('\n⚙️ 7. FUNCIONES SQL DE HIPERTROFIA V2:');
    const functions = await pool.query(`
      SELECT routine_name
      FROM information_schema.routines
      WHERE routine_schema = 'app'
        AND routine_type = 'FUNCTION'
        AND (routine_name LIKE '%cycle%'
             OR routine_name LIKE '%progression%'
             OR routine_name LIKE '%fatigue%'
             OR routine_name LIKE '%deload%'
             OR routine_name LIKE '%priority%'
             OR routine_name LIKE '%overlap%')
      ORDER BY routine_name
    `);

    if (functions.rows.length > 0) {
      functions.rows.forEach((row) => {
        console.log(`  ✅ ${row.routine_name}()`);
      });
    } else {
      console.log('  ❌ No se encontraron funciones');
    }

    // 8. Verificar catálogo de ejercicios
    console.log('\n💪 8. CATÁLOGO DE EJERCICIOS HIPERTROFIA:');
    const catalogStructure = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'app' AND table_name = 'Ejercicios_Hipertrofia'
      ORDER BY ordinal_position
    `);

    if (catalogStructure.rows.length > 0) {
      console.log('  Columnas:');
      catalogStructure.rows.forEach((col) => {
        console.log(`  - ${col.column_name}: ${col.data_type}`);
      });

      // Contar ejercicios por nivel
      const exerciseCount = await pool.query(`
        SELECT nivel, COUNT(*) as total
        FROM app."Ejercicios_Hipertrofia"
        GROUP BY nivel
        ORDER BY nivel
      `);

      console.log('\n  Ejercicios por nivel:');
      exerciseCount.rows.forEach((row) => {
        console.log(`  - ${row.nivel}: ${row.total} ejercicios`);
      });

      // Contar ejercicios por categoría (Principiante)
      const categoryCount = await pool.query(`
        SELECT categoria, COUNT(*) as total
        FROM app."Ejercicios_Hipertrofia"
        WHERE nivel = 'Principiante'
        GROUP BY categoria
        ORDER BY categoria
      `);

      console.log('\n  Ejercicios Principiante por categoría:');
      categoryCount.rows.forEach((row) => {
        console.log(`  - ${row.categoria}: ${row.total} ejercicios`);
      });
    } else {
      console.log('  ❌ Tabla no encontrada');
    }

    console.log('\n✅ Verificación completada');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

checkHipertrofiaV2Tables();
