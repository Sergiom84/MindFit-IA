/**
 * Script para ejecutar migraciones SQL en Supabase
 * Uso: node backend/scripts/run-migrations.js
 */

import { pool } from '../db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIGRATIONS_DIR = path.join(__dirname, '../../supabase/migrations');
const VERSIONED_MIGRATION_REGEX = /^(\d{14})_(.+)\.sql$/i;

function getVersionedMigrationFiles() {
  const allFiles = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  const versioned = [];
  const ignored = [];
  const versions = new Map();

  for (const file of allFiles) {
    const match = file.match(VERSIONED_MIGRATION_REGEX);
    if (!match) {
      ignored.push(file);
      continue;
    }

    const version = match[1];
    const name = match[2];

    if (versions.has(version)) {
      throw new Error(`Versión de migración duplicada: ${version} (${versions.get(version)} y ${file})`);
    }

    versions.set(version, file);
    versioned.push({ file, version, name });
  }

  return { versioned, ignored };
}

async function runMigrations() {
  console.log('🚀 Iniciando ejecución de migraciones...\n');

  try {
    // Obtener migraciones versionadas y detectar duplicados
    const { versioned, ignored } = getVersionedMigrationFiles();
    const files = versioned.map((m) => m.file);

    if (files.length === 0) {
      console.log('⚠️  No se encontraron archivos de migración en:', MIGRATIONS_DIR);
      return;
    }

    console.log(`📁 Encontradas ${files.length} migraciones:\n`);
    files.forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
    console.log();

    if (ignored.length > 0) {
      console.log('ℹ️  Archivos .sql ignorados (sin prefijo de versión):');
      ignored.forEach((f) => console.log(`   - ${f}`));
      console.log();
    }

    // Ejecutar cada migración
    for (const file of files) {
      const filePath = path.join(MIGRATIONS_DIR, file);
      const sql = fs.readFileSync(filePath, 'utf8');

      console.log(`⏳ Ejecutando: ${file}...`);

      try {
        await pool.query(sql);
        console.log(`✅ Completado: ${file}\n`);
      } catch (error) {
        console.error(`❌ Error en ${file}:`);
        console.error(`   ${error.message}`);
        console.error(`   Detalle: ${error.detail || 'N/A'}`);
        console.error(`   Hint: ${error.hint || 'N/A'}\n`);

        // Continuar con las siguientes migraciones (algunas pueden ser idempotentes)
        console.log('⚠️  Continuando con la siguiente migración...\n');
      }
    }

    console.log('═══════════════════════════════════════════════════════');
    console.log('✅ Proceso de migraciones completado');
    console.log('═══════════════════════════════════════════════════════\n');

    // Verificar que todo se aplicó correctamente
    await verifyMigrations();

  } catch (error) {
    console.error('❌ Error al ejecutar migraciones:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

async function verifyMigrations() {
  console.log('🔍 Verificando migraciones aplicadas...\n');

  try {
    // Verificar campos en app.foods
    const foodsColumns = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'app'
        AND table_name = 'foods'
        AND column_name IN (
          'slug', 'fibra_100g', 'porcion_tipica_g',
          'estado_pesado_base', 'estado_pesado_mostrado_default',
          'grupo_factor', 'categoria_detalle', 'is_vegetarian', 'is_vegan'
        )
      ORDER BY column_name;
    `);

    console.log('📊 Campos añadidos a app.foods:');
    if (foodsColumns.rows.length > 0) {
      foodsColumns.rows.forEach(col => {
        console.log(`   ✓ ${col.column_name} (${col.data_type})`);
      });
    } else {
      console.log('   ⚠️  No se encontraron los campos nuevos');
    }
    console.log();

    // Verificar tabla food_conversion_factors
    const factorsTable = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'app'
          AND table_name = 'food_conversion_factors'
      ) as exists;
    `);

    console.log('📊 Tabla app.food_conversion_factors:');
    if (factorsTable.rows[0].exists) {
      const factorsCount = await pool.query(`
        SELECT COUNT(*) as count FROM app.food_conversion_factors;
      `);
      console.log(`   ✓ Creada con ${factorsCount.rows[0].count} factores de conversión`);
    } else {
      console.log('   ⚠️  No se encontró la tabla');
    }
    console.log();

    // Verificar campos en nutrition_meal_items (si existe)
    const mealItemsTable = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'app'
          AND table_name = 'nutrition_meal_items'
      ) as exists;
    `);

    console.log('📊 Tabla app.nutrition_meal_items:');
    if (mealItemsTable.rows[0].exists) {
      const mealItemsColumns = await pool.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'app'
          AND table_name = 'nutrition_meal_items'
          AND column_name IN (
            'food_id', 'estado_pesado_base', 'estado_pesado_mostrado',
            'cantidad_g_base', 'cantidad_g_mostrada'
          )
        ORDER BY column_name;
      `);

      if (mealItemsColumns.rows.length > 0) {
        mealItemsColumns.rows.forEach(col => {
          console.log(`   ✓ ${col.column_name} (${col.data_type})`);
        });
      } else {
        console.log('   ⚠️  Tabla existe pero faltan campos nuevos');
      }
    } else {
      console.log('   ℹ️  Tabla no existe aún (se creará con Fase 4)');
    }
    console.log();

  } catch (error) {
    console.error('❌ Error al verificar migraciones:', error.message);
  }
}

// Ejecutar
runMigrations();
