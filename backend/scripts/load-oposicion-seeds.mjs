/**
 * Siembra los catálogos de ejercicios de las oposiciones (Guardia Civil,
 * Policía Nacional, Policía Local) en sus tablas app."Ejercicios_<Oposicion>".
 * Idempotente: TRUNCATE + reinsert desde los JSON de output/catalog-audit/seeds/.
 *
 * Uso: node backend/scripts/load-oposicion-seeds.mjs
 * Requiere DATABASE_URL en backend/.env.
 */
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const SEEDS_DIR = path.join(__dirname, '..', 'output', 'catalog-audit', 'seeds');
const COLS = [
  'nombre', 'nivel', 'categoria', 'tipo_prueba', 'baremo_hombres', 'baremo_mujeres',
  'series_reps_objetivo', 'intensidad', 'descanso_seg', 'equipamiento', 'notas',
  'ejecucion', 'consejos', 'errores_evitar', 'gif_url'
];
const MAP = {
  guardia_civil: 'Ejercicios_Guardia_Civil',
  policia_nacional: 'Ejercicios_Policia_Nacional',
  policia_local: 'Ejercicios_Policia_Local'
};

const { Client } = pg;

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    for (const [file, table] of Object.entries(MAP)) {
      const arr = JSON.parse(fs.readFileSync(path.join(SEEDS_DIR, `${file}.json`), 'utf8'));
      await c.query(`TRUNCATE app."${table}" RESTART IDENTITY`);
      const placeholders = COLS.map((_, i) => `$${i + 1}`).join(',');
      const colList = COLS.map((k) => `"${k}"`).join(',');
      for (const e of arr) {
        const vals = COLS.map((k) => (k in e ? e[k] : null));
        await c.query(`INSERT INTO app."${table}" (${colList}) VALUES (${placeholders})`, vals);
      }
      const { rows } = await c.query(
        `SELECT count(*) c, count(*) FILTER (WHERE tipo_prueba='Oficial') oficial FROM app."${table}"`
      );
      console.log(`✅ ${table}: ${rows[0].c} ejercicios (${rows[0].oficial} oficiales)`);
    }
  } finally {
    await c.end();
  }
}

main().catch((e) => {
  console.error('❌', e.message);
  process.exit(1);
});
