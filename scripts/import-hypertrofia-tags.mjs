/**
 * Importa tags manuales desde CSV (docs/ciclo_menstrual/tags_hypertrofia_template.csv).
 * Ejecutar con: node scripts/import-hypertrofia-tags.mjs
 */
import fs from 'fs';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();
dotenv.config({ path: 'backend/.env', override: false });

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('❌ DATABASE_URL no definido.');
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

const INPUT_PATH = 'docs/ciclo_menstrual/tags_hypertrofia_template.csv';

const parseCsvLine = (line) => {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
};

const parseNullableInt = (value) => {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  if (!trimmed.length) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseBoolean = (value) => {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim().toLowerCase();
  if (!trimmed.length) return null;
  if (['true', '1', 'si', 'sí'].includes(trimmed)) return true;
  if (['false', '0', 'no'].includes(trimmed)) return false;
  return null;
};

const main = async () => {
  if (!fs.existsSync(INPUT_PATH)) {
    console.error(`❌ No se encontró ${INPUT_PATH}`);
    process.exit(1);
  }

  const content = fs.readFileSync(INPUT_PATH, 'utf8').split(/\r?\n/).filter(Boolean);
  if (content.length <= 1) {
    console.error('❌ CSV vacío.');
    process.exit(1);
  }

  const header = parseCsvLine(content[0]);
  const columnIndex = (name) => header.indexOf(name);

  const required = ['exercise_id', 'pattern', 'equipment', 'impact_level', 'axial_load_level', 'cod_level', 'overhead'];
  for (const col of required) {
    if (columnIndex(col) === -1) {
      console.error(`❌ Columna requerida no encontrada: ${col}`);
      process.exit(1);
    }
  }

  const client = await pool.connect();
  try {
    let updated = 0;

    for (let i = 1; i < content.length; i += 1) {
      const values = parseCsvLine(content[i]);
      const exerciseId = parseNullableInt(values[columnIndex('exercise_id')]);
      if (!exerciseId) continue;

      const pattern = values[columnIndex('pattern')]?.trim() || null;
      const equipmentRaw = values[columnIndex('equipment')]?.trim() || '';
      const equipment = equipmentRaw
        ? equipmentRaw.split('|').map(item => item.trim()).filter(Boolean)
        : null;

      const impactLevel = parseNullableInt(values[columnIndex('impact_level')]);
      const axialLevel = parseNullableInt(values[columnIndex('axial_load_level')]);
      const codLevel = parseNullableInt(values[columnIndex('cod_level')]);
      const overhead = parseBoolean(values[columnIndex('overhead')]);

      await client.query(
        `INSERT INTO app.exercise_tags (
           exercise_id,
           source_table,
           pattern,
           equipment,
           impact_level,
           axial_load_level,
           cod_level,
           overhead
         )
         VALUES ($1, 'Ejercicios_Hipertrofia', $2, $3, $4, $5, $6, $7)
         ON CONFLICT (exercise_id, source_table)
         DO UPDATE SET
           pattern = COALESCE(EXCLUDED.pattern, app.exercise_tags.pattern),
           equipment = COALESCE(EXCLUDED.equipment, app.exercise_tags.equipment),
           impact_level = COALESCE(EXCLUDED.impact_level, app.exercise_tags.impact_level),
           axial_load_level = COALESCE(EXCLUDED.axial_load_level, app.exercise_tags.axial_load_level),
           cod_level = COALESCE(EXCLUDED.cod_level, app.exercise_tags.cod_level),
           overhead = COALESCE(EXCLUDED.overhead, app.exercise_tags.overhead),
           updated_at = NOW()`,
        [exerciseId, pattern, equipment, impactLevel, axialLevel, codLevel, overhead]
      );

      updated += 1;
    }

    console.log(`✅ Import completado. Filas procesadas: ${updated}`);
  } catch (error) {
    console.error('❌ Error importando tags:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
};

main();
