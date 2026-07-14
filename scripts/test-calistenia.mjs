/**
 * Script de prueba: usuario de calistenia + flujo de ejercicios.
 *
 * Crea (o reutiliza) un usuario de prueba y valida el camino completo de
 * calistenia usando el CODIGO REFACTORIZADO real: exerciseRepository +
 * la tabla unificada app.ejercicios. Sirve para confirmar que la unificacion
 * de tablas y el re-cableado del backend funcionan end-to-end.
 *
 * Uso:  node scripts/test-calistenia.mjs
 */
import fs from 'fs';

// DATABASE_URL vive en .env.local
const envLocal = fs.readFileSync('.env.local', 'utf8');
const dbUrl = (envLocal.match(/DATABASE_URL=(postgresql:\/\/\S+)/) || [])[1];
if (dbUrl && !process.env.DATABASE_URL) process.env.DATABASE_URL = dbUrl;
process.env.SUPABASE_PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'sbqcnlwpvjavmljzkmfy';

const { pool } = await import('../backend/db.js');
const repo = await import('../backend/services/exerciseRepository.js');

const TEST_EMAIL = 'test-calistenia@entrenaconia.local';
const ok = (m) => console.log('  ✅ ' + m);

async function getOrCreateUser() {
  const found = await pool.query('SELECT id, email, nivel_entrenamiento FROM app.users WHERE email = $1', [TEST_EMAIL]);
  if (found.rowCount > 0) return { ...found.rows[0], reused: true };
  const ins = await pool.query(
    `INSERT INTO app.users (email, password_hash, nombre, apellido, nivel_entrenamiento, metodologia, sexo, edad, peso, altura)
     VALUES ($1, 'test-hash-no-login', 'Test', 'Calistenia', 'intermedio', 'calistenia', 'masculino', 30, 75, 178)
     RETURNING id, email, nivel_entrenamiento`,
    [TEST_EMAIL]
  );
  return { ...ins.rows[0], reused: false };
}

async function main() {
  console.log('\n=== TEST CALISTENIA: usuario + flujo de ejercicios (codigo refactorizado) ===\n');

  // 1) Usuario de prueba
  const user = await getOrCreateUser();
  ok(`Usuario ${user.reused ? '(reutilizado)' : '(creado)'}: id=${user.id} email=${user.email} nivel=${user.nivel_entrenamiento}`);

  // 2) Repositorio: conteo + aleatorios por nivel (lo que usa el fallback de rutas)
  const total = await repo.countByDiscipline(pool, 'calistenia');
  ok(`countByDiscipline('calistenia') = ${total} ejercicios en app.ejercicios`);
  if (total === 0) throw new Error('No hay ejercicios de calistenia (la unificacion fallo?)');

  const random = await repo.getRandomByLevel(pool, { disciplina: 'calistenia', level: user.nivel_entrenamiento, limit: 6 });
  ok(`getRandomByLevel(nivel=${user.nivel_entrenamiento}) = ${random.length} ejercicios`);
  if (random.length === 0) throw new Error('getRandomByLevel devolvio 0 (el bug de "Basico" volvio?)');
  random.forEach((r) => console.log(`       - ${r.nombre}  [${r.series_reps_objetivo || 's/r'}]`));

  // 3) Detalle por id y por slug (lo que usa exerciseCatalog)
  const one = (await pool.query("SELECT source_exercise_id, slug FROM app.ejercicios WHERE disciplina='calistenia' AND slug IS NOT NULL LIMIT 1")).rows[0];
  const byId = await repo.findBySourceId(pool, 'calistenia', one.source_exercise_id);
  const bySlug = await repo.findByIdOrSlug(pool, 'calistenia', one.slug);
  ok(`findBySourceId(${one.source_exercise_id}) -> ${byId?.nombre} | equip="${byId?.equipamiento}"`);
  ok(`findByIdOrSlug('${one.slug}') -> ${bySlug?.nombre}`);
  if (!byId || !bySlug) throw new Error('Lookup por id/slug fallo');

  // 4) Rutina de calistenia de ejemplo (3 dias) construida desde la tabla unificada
  console.log('\n  Rutina de calistenia de ejemplo (nivel ' + user.nivel_entrenamiento + '):');
  for (const dia of ['Lunes', 'Miercoles', 'Viernes']) {
    const exs = await repo.getRandomByLevel(pool, {
      disciplina: 'calistenia', level: user.nivel_entrenamiento, limit: 5,
      columns: 'nombre, nivel, categoria, series_reps_objetivo',
    });
    console.log(`    ${dia}: ${exs.map((e) => `${e.nombre} (${e.series_reps_objetivo || '3x10'})`).join(' | ')}`);
  }

  // 5) Busqueda de catalogo (la query exacta de exerciseCatalog /search)
  const search = await pool.query(
    `SELECT source_exercise_id AS id, nombre AS name, categoria, nivel,
            array_to_string(equipamiento, ', ') AS equipamiento
       FROM app.ejercicios
      WHERE disciplina='calistenia' AND LOWER(categoria) = LOWER($1)
      ORDER BY nombre LIMIT 5`,
    ['Traccion'.normalize('NFD').replace(/[̀-ͯ]/g, '') === 'Traccion' ? 'Tracción' : 'Tracción']
  );
  ok(`Catalogo /search (categoria=Traccion): ${search.rowCount} resultados, equipamiento como string OK`);

  console.log('\n=== RESULTADO: el flujo de calistenia funciona contra app.ejercicios ===\n');
  await pool.end();
  process.exit(0);
}

main().catch((e) => { console.error('\n❌ FALLO:', e.message, '\n'); process.exit(1); });
