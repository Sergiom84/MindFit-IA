// Runner de tests portable (Windows + CI Linux, cualquier versión de Node).
// Separa tests UNIT (seguros, sin BD) de INTEGRATION (tocan la BD vía pool).
//
// Uso: node scripts/run-tests.mjs [unit|integration]
//   unit         -> ejecuta todo MENOS los tests de BD (lo que corre el CI)
//   integration  -> ejecuta SOLO los tests de BD, con NODE_ENV=test para activar
//                   el guard de seguridad de db.js (aborta contra producción).

import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.join(__dirname, '..');
const testsDir = path.join(backendDir, 'tests');

// Tests que requieren base de datos (leen/escriben vía pool de db.js).
const DB_TESTS = new Set([
  'nutritionAdjustmentsV2.test.js',
  'nutritionDailyV2.test.js',
  'nutritionReviewV2.test.js',
  'nutritionUndoV2.test.js',
  'nutritionReviewMigration.test.js',
  'routineGenerationEngine.test.js',
  'crossfitDatabaseIntegration.test.js',
]);

const mode = process.argv[2] || 'unit';
const all = readdirSync(testsDir).filter((f) => f.endsWith('.test.js'));

let files;
if (mode === 'unit') {
  files = all.filter((f) => !DB_TESTS.has(f));
} else if (mode === 'integration') {
  files = all.filter((f) => DB_TESTS.has(f));
} else {
  console.error(`Modo desconocido: "${mode}". Usa 'unit' o 'integration'.`);
  process.exit(2);
}

if (files.length === 0) {
  console.log(`No hay tests para el modo "${mode}".`);
  process.exit(0);
}

const env = { ...process.env };
if (mode === 'integration') {
  // Activa el guard de db.js: si DATABASE_URL es de producción, abortará.
  env.NODE_ENV = 'test';
} else if (mode === 'unit' && !env.DATABASE_URL) {
  // Los tests UNIT no tocan la BD (usan mocks), pero algunos importan servicios que a
  // su vez importan db.js, que LANZA al cargar si falta DATABASE_URL. En CI no hay .env,
  // así que damos un placeholder inofensivo: el pool es lazy y nunca llega a conectar.
  env.DATABASE_URL = 'postgresql://127.0.0.1:5432/placeholder_unit_no_connect';
}

console.log(`▶ Ejecutando ${files.length} tests (${mode}):`);
const args = ['--test', ...files.map((f) => path.join('tests', f))];
const res = spawnSync(process.execPath, args, {
  cwd: backendDir,
  stdio: 'inherit',
  env,
});
process.exit(res.status ?? 1);
