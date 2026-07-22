/**
 * Script para ejecutar migraciones de base de datos
 * Uso: node scripts/run-migration.js <migration-file>
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration(migrationFile) {
  const migrationPath = path.join(__dirname, '..', 'migrations', migrationFile);

  if (!fs.existsSync(migrationPath)) {
    console.error(`❌ Archivo de migración no encontrado: ${migrationPath}`);
    process.exit(1);
  }

  const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

  console.log(`🚀 Ejecutando migración: ${migrationFile}`);

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query(migrationSQL);
    await client.query('COMMIT');

    console.log('✅ Migración ejecutada exitosamente');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error ejecutando migración:', error);
    process.exit(1);
  } finally {
    client.release();
  }
}

// Obtener el archivo de migración desde argumentos de línea de comandos
const migrationFile = process.argv[2];

if (!migrationFile) {
  console.error('❌ Uso: node scripts/run-migration.js <migration-file>');
  console.error('📝 Ejemplo: node scripts/run-migration.js add_missing_plan_start_config_columns.sql');
  process.exit(1);
}

runMigration(migrationFile).catch(console.error);