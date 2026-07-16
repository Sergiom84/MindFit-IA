// Runner de migraciones con ledger (DB-001).
//
// Registra las migraciones aplicadas en app.schema_migrations para que el orden
// de aplicación sea reproducible y no se vuelva a DDL manual sin rastro.
//
// Comandos:
//   node scripts/migrate.mjs status     -> muestra aplicadas vs pendientes
//   node scripts/migrate.mjs baseline   -> marca TODAS las migraciones actuales
//                                          como aplicadas SIN ejecutarlas (para
//                                          adoptar el runner sobre una BD que ya
//                                          tiene el esquema). Idempotente.
//   node scripts/migrate.mjs up         -> aplica las migraciones PENDIENTES en
//                                          orden y las registra.
//   node scripts/migrate.mjs new <slug> -> crea un fichero de migración vacío
//                                          con prefijo de fecha.
//
// Convención: los ficheros nuevos usan prefijo AAAAMMDD_ para que el orden
// lexicográfico sea cronológico. Cada migración debe ser autónoma (si usa
// CREATE INDEX CONCURRENTLY no puede ir dentro de una transacción).

import pg from 'pg';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function listMigrationFiles() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));
}

function readMigration(file) {
  return fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
}

async function ensureLedger(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS app.schema_migrations (
      version     text PRIMARY KEY,
      checksum    text NOT NULL,
      applied_at  timestamptz NOT NULL DEFAULT now(),
      baseline    boolean NOT NULL DEFAULT false
    )
  `);
}

async function getApplied(client) {
  const { rows } = await client.query(
    'SELECT version, checksum, baseline FROM app.schema_migrations'
  );
  return new Map(rows.map((r) => [r.version, r]));
}

function connect() {
  const conn = process.env.DATABASE_URL;
  if (!conn) throw new Error('DATABASE_URL no está definida');
  return new pg.Client({ connectionString: conn });
}

async function cmdStatus() {
  const client = connect();
  await client.connect();
  try {
    await ensureLedger(client);
    const applied = await getApplied(client);
    const files = listMigrationFiles();
    const pending = files.filter((f) => !applied.has(f));

    console.log(`Ledger: ${applied.size} aplicadas | Ficheros: ${files.length} | Pendientes: ${pending.length}`);

    // Drift: ficheros aplicados cuyo checksum ya no coincide
    const drift = files.filter((f) => applied.has(f) && applied.get(f).checksum !== sha256(readMigration(f)));
    if (drift.length) {
      console.log(`\n⚠️  ${drift.length} migración(es) aplicadas con checksum distinto al fichero (editadas tras aplicar):`);
      drift.forEach((f) => console.log(`   ~ ${f}`));
    }
    if (pending.length) {
      console.log('\nPendientes (se aplicarían en este orden):');
      pending.forEach((f) => console.log(`   + ${f}`));
    } else {
      console.log('\n✅ Sin migraciones pendientes.');
    }
  } finally {
    await client.end();
  }
}

async function cmdBaseline() {
  const client = connect();
  await client.connect();
  try {
    await ensureLedger(client);
    const applied = await getApplied(client);
    const files = listMigrationFiles();
    const toMark = files.filter((f) => !applied.has(f));

    if (toMark.length === 0) {
      console.log('Nada que baselinar: todas las migraciones ya están en el ledger.');
      return;
    }
    for (const f of toMark) {
      await client.query(
        'INSERT INTO app.schema_migrations (version, checksum, baseline) VALUES ($1, $2, true) ON CONFLICT (version) DO NOTHING',
        [f, sha256(readMigration(f))]
      );
    }
    console.log(`✅ Baseline: ${toMark.length} migraciones marcadas como aplicadas (sin ejecutarlas).`);
  } finally {
    await client.end();
  }
}

async function cmdUp() {
  const client = connect();
  await client.connect();
  try {
    await ensureLedger(client);
    const applied = await getApplied(client);
    const pending = listMigrationFiles().filter((f) => !applied.has(f));

    if (pending.length === 0) {
      console.log('✅ Sin migraciones pendientes.');
      return;
    }
    console.log(`Aplicando ${pending.length} migración(es)...`);
    for (const f of pending) {
      const sql = readMigration(f);
      process.stdout.write(`  → ${f} ... `);
      try {
        // El fichero controla su propia transacción (BEGIN/COMMIT) o usa
        // CONCURRENTLY (que no admite transacción). Lo ejecutamos tal cual.
        await client.query(sql);
        await client.query(
          'INSERT INTO app.schema_migrations (version, checksum, baseline) VALUES ($1, $2, false)',
          [f, sha256(sql)]
        );
        console.log('OK');
      } catch (e) {
        console.log('FALLÓ');
        console.error(`\n❌ Error aplicando ${f}: ${e.message}`);
        console.error('   Se detiene el runner. Corrige y vuelve a ejecutar `up`.');
        process.exitCode = 1;
        return;
      }
    }
    console.log('✅ Migraciones aplicadas.');
  } finally {
    await client.end();
  }
}

function cmdNew(slug) {
  if (!slug) {
    console.error('Uso: node scripts/migrate.mjs new <slug>');
    process.exitCode = 1;
    return;
  }
  // Fecha en formato AAAAMMDD sin depender de Date.now() prohibido en workflows:
  // aquí sí se puede usar Date (script CLI normal).
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const safe = slug.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const file = `${stamp}_${safe}.sql`;
  const full = path.join(MIGRATIONS_DIR, file);
  if (fs.existsSync(full)) {
    console.error(`Ya existe: ${file}`);
    process.exitCode = 1;
    return;
  }
  fs.writeFileSync(
    full,
    `-- ${file}\n-- Descripción: ${slug}\n\nBEGIN;\n\n-- TODO: DDL aquí\n\nCOMMIT;\n`
  );
  console.log(`Creada: backend/migrations/${file}`);
}

const [cmd, arg] = process.argv.slice(2);
const run = { status: cmdStatus, baseline: cmdBaseline, up: cmdUp }[cmd];
if (run) {
  run().catch((e) => {
    console.error('Error:', e.message);
    process.exitCode = 1;
  });
} else if (cmd === 'new') {
  cmdNew(arg);
} else {
  console.log('Comandos: status | baseline | up | new <slug>');
  process.exitCode = cmd ? 1 : 0;
}
