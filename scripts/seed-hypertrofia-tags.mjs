/**
 * Seed inicial de tags (pattern + equipment) para Ejercicios_Hipertrofia.
 * Ejecutar con: node scripts/seed-hypertrofia-tags.mjs
 */
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

const upsertTag = async (client, row) => {
  await client.query(
    `INSERT INTO app.exercise_tags (exercise_id, source_table, pattern, equipment)
     VALUES ($1, 'Ejercicios_Hipertrofia', $2, $3)
     ON CONFLICT (exercise_id, source_table)
     DO UPDATE SET
       pattern = COALESCE(app.exercise_tags.pattern, EXCLUDED.pattern),
       equipment = COALESCE(app.exercise_tags.equipment, EXCLUDED.equipment),
       updated_at = NOW()`,
    [row.exercise_id, row.pattern, row.equipment]
  );
};

const main = async () => {
  const client = await pool.connect();
  try {
    const exercisesResult = await client.query(
      `SELECT exercise_id, nombre, patron_movimiento, patron, equipamiento
       FROM app."Ejercicios_Hipertrofia"
       ORDER BY exercise_id ASC`
    );

    const existingResult = await client.query(
      `SELECT exercise_id, pattern, equipment
       FROM app.exercise_tags
       WHERE source_table = 'Ejercicios_Hipertrofia'`
    );

    const existingMap = new Map(existingResult.rows.map(row => [Number(row.exercise_id), row]));

    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const ex of exercisesResult.rows) {
      const exerciseId = Number(ex.exercise_id);
      const pattern = determinePattern({ patronMovimiento: ex.patron_movimiento, patron: ex.patron });
      const equipment = splitEquipment(ex.equipamiento);
      const existing = existingMap.get(exerciseId);

      const needsUpdate = !existing || (!existing.pattern && pattern) || (!existing.equipment && equipment.length > 0);
      if (!needsUpdate) {
        skipped += 1;
        continue;
      }

      await upsertTag(client, {
        exercise_id: exerciseId,
        pattern,
        equipment
      });

      if (!existing) inserted += 1;
      else updated += 1;
    }

    console.log('✅ Seed completado.');
    console.log(`- Insertados: ${inserted}`);
    console.log(`- Actualizados: ${updated}`);
    console.log(`- Sin cambios: ${skipped}`);
  } catch (error) {
    console.error('❌ Error en seed de tags:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
};

main();
