/**
 * Script para verificar que las migraciones se aplicaron correctamente
 */

import { pool } from '../db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATIONS_DIR = path.join(__dirname, '../../supabase/migrations');
const VERSIONED_MIGRATION_REGEX = /^(\d{14})_(.+)\.sql$/i;

function readLocalMigrationVersions() {
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const versions = new Map();
  const ignored = [];

  for (const file of files) {
    const match = file.match(VERSIONED_MIGRATION_REGEX);
    if (!match) {
      ignored.push(file);
      continue;
    }

    const version = match[1];
    if (versions.has(version)) {
      throw new Error(`Versión local duplicada ${version}: ${versions.get(version)} y ${file}`);
    }

    versions.set(version, file);
  }

  return { versions, ignored };
}

async function verifyMigrations() {
  console.log('🔍 VERIFICACIÓN DE MIGRACIONES APLICADAS');
  console.log('═══════════════════════════════════════════════════════\n');

  try {
    // 0. Detectar deriva entre carpeta local y tabla de migraciones de Supabase
    const { versions: localVersions, ignored } = readLocalMigrationVersions();

    const remoteMigrations = await pool.query(`
      SELECT version, name
      FROM supabase_migrations.schema_migrations
      ORDER BY version;
    `);

    const remoteVersionSet = new Set(remoteMigrations.rows.map((r) => String(r.version)));
    const localVersionSet = new Set(localVersions.keys());

    const onlyLocal = [...localVersionSet].filter((v) => !remoteVersionSet.has(v)).sort();
    const onlyRemote = [...remoteVersionSet].filter((v) => !localVersionSet.has(v)).sort();

    console.log('🧭 Deriva de migraciones (local vs Supabase):');
    console.log(`   ✓ Versiones locales detectadas: ${localVersionSet.size}`);
    console.log(`   ✓ Versiones remotas detectadas: ${remoteVersionSet.size}`);

    if (ignored.length > 0) {
      console.log(`   ℹ️  Archivos locales ignorados (sin prefijo versión): ${ignored.join(', ')}`);
    }

    if (onlyLocal.length > 0) {
      console.log(`   ⚠️  Versiones locales NO registradas en supabase_migrations: ${onlyLocal.join(', ')}`);
    }

    if (onlyRemote.length > 0) {
      console.log(`   ℹ️  Versiones remotas sin archivo local: ${onlyRemote.slice(-8).join(', ')}${onlyRemote.length > 8 ? ' ...' : ''}`);
    }

    if (onlyLocal.length === 0 && onlyRemote.length === 0) {
      console.log('   ✓ Sin deriva detectada en versionado de migraciones');
    }
    console.log();

    // 1. Listar todas las tablas en el schema app
    console.log('📊 Tablas en schema app:');
    const tables = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'app'
      ORDER BY table_name;
    `);

    tables.rows.forEach(row => {
      console.log(`   ✓ ${row.table_name}`);
    });
    console.log();

    // 2. Verificar campos nuevos en app.foods
    console.log('📋 Campos MindFeed en app.foods:');
    const foodsColumns = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'app'
        AND table_name = 'foods'
        AND column_name IN (
          'slug', 'fibra_100g', 'porcion_tipica_g',
          'estado_pesado_base', 'estado_pesado_mostrado_default',
          'metodo_preparacion', 'grupo_factor', 'categoria_detalle',
          'is_vegetarian', 'is_vegan', 'medida_casera', 'tipo_dieta'
        )
      ORDER BY column_name;
    `);

    if (foodsColumns.rows.length > 0) {
      foodsColumns.rows.forEach(col => {
        console.log(`   ✓ ${col.column_name.padEnd(35)} ${col.data_type.padEnd(15)} ${col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
      });
      console.log(`\n   Total: ${foodsColumns.rows.length} campos nuevos añadidos`);
    } else {
      console.log('   ⚠️  No se encontraron campos MindFeed');
    }
    console.log();

    // 3. Verificar tabla food_conversion_factors
    console.log('🔄 Tabla app.food_conversion_factors:');
    const factorsTable = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'app'
          AND table_name = 'food_conversion_factors'
      ) as exists;
    `);

    if (factorsTable.rows[0].exists) {
      const factorsCount = await pool.query(`
        SELECT COUNT(*) as count FROM app.food_conversion_factors;
      `);

      const factors = await pool.query(`
        SELECT grupo_factor, estado_base, estado_objetivo, factor_base_objetivo, nota
        FROM app.food_conversion_factors
        ORDER BY grupo_factor, estado_base;
      `);

      console.log(`   ✓ Tabla creada con ${factorsCount.rows[0].count} factores de conversión:\n`);
      factors.rows.forEach(f => {
        console.log(`   ${f.grupo_factor.padEnd(15)} ${f.estado_base.padEnd(8)} → ${f.estado_objetivo.padEnd(8)} Factor: ${f.factor_base_objetivo}`);
      });
    } else {
      console.log('   ⚠️  Tabla no encontrada');
    }
    console.log();

    // 4. Verificar campos en nutrition_meal_items
    console.log('📦 Campos en app.nutrition_meal_items:');
    const mealItemsTable = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'app'
          AND table_name = 'nutrition_meal_items'
      ) as exists;
    `);

    if (mealItemsTable.rows[0].exists) {
      const mealItemsColumns = await pool.query(`
        SELECT column_name, data_type, is_nullable
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
          console.log(`   ✓ ${col.column_name.padEnd(25)} ${col.data_type.padEnd(15)} ${col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
        });
        console.log(`\n   Total: ${mealItemsColumns.rows.length} campos preparados para items`);
      } else {
        console.log('   ⚠️  Tabla existe pero faltan campos nuevos');
      }
    } else {
      console.log('   ℹ️  Tabla no existe aún (se creará cuando sea necesario)');
    }
    console.log();

    // 5. Verificar biblioteca de plantillas
    console.log('📚 Biblioteca determinista (plantillas/roles):');
    const libraryCounts = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM app.meal_templates) AS templates_count,
        (SELECT COUNT(*) FROM app.meal_template_slots) AS slots_count,
        (SELECT COUNT(*) FROM app.food_roles) AS roles_count;
    `);

    const library = libraryCounts.rows[0];
    console.log(`   ✓ app.meal_templates      ${library.templates_count}`);
    console.log(`   ✓ app.meal_template_slots ${library.slots_count}`);
    console.log(`   ✓ app.food_roles          ${library.roles_count}`);
    console.log();

    // 6. Verificar índices creados
    console.log('🔍 Índices creados:');
    const indexes = await pool.query(`
      SELECT
        t.relname as table_name,
        i.relname as index_name,
        array_to_string(array_agg(a.attname), ', ') as column_names
      FROM
        pg_class t,
        pg_class i,
        pg_index ix,
        pg_attribute a,
        pg_namespace n
      WHERE
        t.oid = ix.indrelid
        AND i.oid = ix.indexrelid
        AND a.attrelid = t.oid
        AND a.attnum = ANY(ix.indkey)
        AND t.relnamespace = n.oid
        AND n.nspname = 'app'
        AND t.relname IN ('foods', 'food_conversion_factors', 'meal_templates', 'meal_template_slots', 'food_roles')
        AND i.relname LIKE 'idx_%'
      GROUP BY t.relname, i.relname
      ORDER BY t.relname, i.relname;
    `);

    if (indexes.rows.length > 0) {
      indexes.rows.forEach(idx => {
        console.log(`   ✓ ${idx.table_name}.${idx.index_name} (${idx.column_names})`);
      });
    } else {
      console.log('   ℹ️  No se encontraron índices específicos de MindFeed');
    }
    console.log();

    console.log('═══════════════════════════════════════════════════════');
    console.log('✅ VERIFICACIÓN COMPLETADA');
    console.log('═══════════════════════════════════════════════════════');

  } catch (error) {
    console.error('❌ Error al verificar migraciones:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Ejecutar
verifyMigrations();
