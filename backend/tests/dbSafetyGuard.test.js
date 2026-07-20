// CI-001: verifica el guard fail-closed anti-producción de db.js.
//
// El guard (db.js §2.2) aborta la CARGA del módulo si NODE_ENV=test y DATABASE_URL
// apunta a una BD que parece producción (Supabase gestionado), salvo override
// explícito ALLOW_PROD_DB_TESTS=1. Se lanza ANTES de crear el pool o intentar
// conectar, así que estos casos NO tocan ninguna BD real: usan hosts sintéticos y
// solo observan si el módulo se niega a cargar.
//
// Es un test UNIT (no está en DB_TESTS de run-tests.mjs): corre en CI sin BD.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.join(__dirname, '..');
const dbUrlHref = pathToFileURL(path.join(backendDir, 'db.js')).href;

const PROD_DOMAIN = 'postgresql://u:pw@db.sbqcnlwpvjavmljzkmfy.supabase.co:5432/postgres';
const PROD_POOLER = 'postgresql://u:pw@aws-1-eu-west-1.pooler.supabase.com:5432/postgres';
const GUARD_MARK = '[test-safety]';

// Importa db.js en un proceso hijo con env controlado. exit 0 = módulo cargó;
// exit 1 = lanzó (mensaje en stderr). Nunca espera a la conexión (testConnection
// es fire-and-forget; process.exit corre en cuanto resuelve el import).
function importDbWith(envOverrides) {
  const env = { ...process.env };
  delete env.NODE_ENV;
  delete env.DATABASE_URL;
  delete env.ALLOW_PROD_DB_TESTS;
  Object.assign(env, envOverrides);

  const script =
    `import(${JSON.stringify(dbUrlHref)})` +
    `.then(() => process.exit(0))` +
    `.catch((e) => { process.stderr.write(String((e && e.message) || e)); process.exit(1); });`;

  const res = spawnSync(process.execPath, ['-e', script], {
    cwd: backendDir,
    env,
    encoding: 'utf8',
    timeout: 20000,
  });
  return { status: res.status, stderr: res.stderr || '', stdout: res.stdout || '' };
}

test('aborta con NODE_ENV=test contra host de producción (.supabase.co) sin override', () => {
  const r = importDbWith({ NODE_ENV: 'test', DATABASE_URL: PROD_DOMAIN });
  assert.notEqual(r.status, 0, 'debería salir con código != 0');
  assert.ok(r.stderr.includes(GUARD_MARK), `stderr debería contener ${GUARD_MARK}: ${r.stderr}`);
});

test('aborta con NODE_ENV=test contra el pooler de producción (.pooler.supabase.com)', () => {
  const r = importDbWith({ NODE_ENV: 'test', DATABASE_URL: PROD_POOLER });
  assert.notEqual(r.status, 0, 'debería salir con código != 0');
  assert.ok(r.stderr.includes(GUARD_MARK), `stderr debería contener ${GUARD_MARK}: ${r.stderr}`);
});

test('con override ALLOW_PROD_DB_TESTS=1 el guard NO aborta', () => {
  const r = importDbWith({ NODE_ENV: 'test', DATABASE_URL: PROD_DOMAIN, ALLOW_PROD_DB_TESTS: '1' });
  assert.ok(!r.stderr.includes(GUARD_MARK), `el guard no debería dispararse: ${r.stderr}`);
});

test('sin NODE_ENV=test (modo unit) el guard NO aborta aunque la URL parezca prod', () => {
  const r = importDbWith({ DATABASE_URL: PROD_DOMAIN });
  assert.ok(!r.stderr.includes(GUARD_MARK), `el guard solo aplica en NODE_ENV=test: ${r.stderr}`);
});
