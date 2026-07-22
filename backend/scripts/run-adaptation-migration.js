/**
 * Script para ejecutar la migración del Bloque de Adaptación
 *
 * Crea las tablas y funciones necesarias para el sistema de adaptación
 * inicial antes del ciclo D1-D5 de HipertrofiaV2
 */

import { pool } from '../db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  try {
    console.log('🚀 Iniciando migración: Bloque de Adaptación\n');

    // Leer el archivo SQL
    const migrationPath = path.join(__dirname, '../migrations/create_adaptation_block_tables.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('📄 Ejecutando SQL...');

    // Ejecutar la migración
    await pool.query(migrationSQL);

    console.log('✅ Migración ejecutada exitosamente\n');

    // Verificar tablas creadas
    console.log('🔍 Verificando tablas creadas...\n');

    const tables = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'app'
      AND table_name IN (
        'adaptation_blocks',
        'adaptation_criteria_tracking',
        'adaptation_technique_flags'
      )
      ORDER BY table_name;
    `);

    console.log('📊 Tablas creadas:');
    tables.rows.forEach(row => {
      console.log(`   ✓ app.${row.table_name}`);
    });

    // Verificar funciones creadas
    console.log('\n🔍 Verificando funciones creadas...\n');

    const functions = await pool.query(`
      SELECT routine_name
      FROM information_schema.routines
      WHERE routine_schema = 'app'
      AND routine_name IN (
        'evaluate_adaptation_completion',
        'transition_to_hypertrophy'
      )
      ORDER BY routine_name;
    `);

    console.log('⚙️  Funciones creadas:');
    functions.rows.forEach(row => {
      console.log(`   ✓ app.${row.routine_name}()`);
    });

    // Verificar vista creada
    console.log('\n🔍 Verificando vistas creadas...\n');

    const views = await pool.query(`
      SELECT table_name
      FROM information_schema.views
      WHERE table_schema = 'app'
      AND table_name = 'adaptation_progress_summary';
    `);

    console.log('👁️  Vistas creadas:');
    views.rows.forEach(row => {
      console.log(`   ✓ app.${row.table_name}`);
    });

    console.log('\n✅ MIGRACIÓN COMPLETADA CON ÉXITO\n');
    console.log('📝 Próximos pasos:');
    console.log('   1. Implementar rutas de backend (generate-adaptation, evaluate, transition)');
    console.log('   2. Implementar componentes de frontend');
    console.log('   3. Integrar en flujo de HipertrofiaV2\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error ejecutando migración:', error);
    console.error('\nDetalles:', error.message);
    process.exit(1);
  }
}

runMigration();
