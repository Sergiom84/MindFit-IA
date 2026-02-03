/**
 * Exporta template CSV para tagging manual de Ejercicios_Hipertrofia.
 * Ejecutar con: node scripts/export-hypertrofia-tags.mjs
 */
import fs from 'fs';
import path from 'path';
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

const normalize = (value = '') => {
  if (value === null || value === undefined) return '';
  return value
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
};

const splitEquipment = (value) => {
  if (!value) return [];
  const normalized = normalize(value);
  return normalized
    .split(/[\/,+]/)
    .flatMap(segment => segment.split(' y '))
    .flatMap(segment => segment.split(' o '))
    .map(segment => segment.trim())
    .filter(Boolean);
};

const determinePattern = ({ patronMovimiento = '', patron = '' }) => {
  const pm = normalize(patronMovimiento);
  const p = normalize(patron);

  if (pm.includes('empuje')) return 'push';
  if (pm.includes('traccion')) return 'pull';
  if (pm.includes('cuadriceps')) return 'squat';
  if (pm.includes('cadena_posterior')) return 'hinge';
  if (pm.includes('core')) return 'core';
  if (pm.includes('aislamiento_biceps')) return 'pull';
  if (pm.includes('aislamiento_triceps')) return 'push';
  if (pm.includes('aislamiento_pecho')) return 'push';
  if (pm.includes('aislamiento_hombro')) return 'push';

  if (p.includes('bisagra') || p.includes('extension de cadera') || p.includes('flexion de rodilla')) return 'hinge';
  if (p.includes('sentadilla') || p.includes('extension de rodilla') || p.includes('prensa') || p.includes('subida')) return 'squat';
  if (p.includes('flexo-extension de tobillo')) return 'squat';
  if (p.includes('flexion de codo')) return 'pull';
  if (p.includes('extension de codo')) return 'push';
  if (p.includes('apertura horizontal') || p.includes('rotacion externa') || p.includes('elevacion de hombros')) return 'pull';
  if (p.includes('empuje') || p.includes('aduccion') || p.includes('abduccion')) return 'push';
  if (p.includes('traccion') || p.includes('extension de hombro')) return 'pull';
  if (p.includes('anti') || p.includes('tronco')) return 'core';
  if (p.includes('agarre') || p.includes('estabilidad')) return 'carry';

  return null;
};

const csvEscape = (value) => {
  if (value === null || value === undefined) return '';
  const stringValue = String(value);
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
};

const main = async () => {
  const client = await pool.connect();
  try {
    const exercisesResult = await client.query(
      `SELECT exercise_id, nombre, patron_movimiento, patron, equipamiento
       FROM app."Ejercicios_Hipertrofia"
       ORDER BY exercise_id ASC`
    );

    const tagsResult = await client.query(
      `SELECT exercise_id, pattern, equipment, impact_level, axial_load_level, cod_level, overhead
       FROM app.exercise_tags
       WHERE source_table = 'Ejercicios_Hipertrofia'`
    );
    const tagsMap = new Map(tagsResult.rows.map(row => [Number(row.exercise_id), row]));

    const rows = [];
    rows.push([
      'exercise_id',
      'nombre',
      'patron_movimiento',
      'patron',
      'equipamiento',
      'pattern',
      'equipment',
      'impact_level',
      'axial_load_level',
      'cod_level',
      'overhead'
    ].join(','));

    for (const ex of exercisesResult.rows) {
      const exerciseId = Number(ex.exercise_id);
      const existing = tagsMap.get(exerciseId) || {};
      const pattern = existing.pattern || determinePattern({ patronMovimiento: ex.patron_movimiento, patron: ex.patron });
      const equipment = existing.equipment || splitEquipment(ex.equipamiento);

      rows.push([
        csvEscape(exerciseId),
        csvEscape(ex.nombre),
        csvEscape(ex.patron_movimiento),
        csvEscape(ex.patron),
        csvEscape(ex.equipamiento),
        csvEscape(pattern),
        csvEscape(Array.isArray(equipment) ? equipment.join('|') : ''),
        csvEscape(existing.impact_level ?? ''),
        csvEscape(existing.axial_load_level ?? ''),
        csvEscape(existing.cod_level ?? ''),
        csvEscape(existing.overhead ?? '')
      ].join(','));
    }

    const outputPath = path.join('docs', 'ciclo_menstrual', 'tags_hypertrofia_template.csv');
    fs.writeFileSync(outputPath, rows.join('\n'), 'utf8');
    console.log(`✅ Template exportado en ${outputPath}`);
  } catch (error) {
    console.error('❌ Error exportando template:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
};

main();
