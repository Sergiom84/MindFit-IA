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
//   node scripts/migrate.mjs rechecksum-eol -> re-base ÚNICA del ledger al checksum
//                                          EOL-independiente (LF). Solo re-expresa filas
//                                          idénticas módulo fin de línea; reporta (sin
//                                          tocar) cualquier divergencia REAL de contenido.
//
// El checksum es EOL-INDEPENDIENTE (se normaliza a LF antes de hashear), así que git en
// Windows (CRLF) ya no produce drift espurio.
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

// EOL-independiente: el checksum de una migración se calcula sobre el contenido
// normalizado a LF, para que git en Windows (CRLF) no genere "drift" espurio. Solo
// afecta al CÁLCULO del checksum; el SQL se ejecuta tal cual está en disco.
const eolNormalize = (s) => s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
const migrationChecksum = (content) => sha256(eolNormalize(content));

// DB-001 (PR 2): allowlist CERRADA de reconciliación 2026-07-17. Todas estas
// migraciones son POSTERIORES al corte del baseline (2026-07-16) y se aplicaron a
// producción fuera del runner. Se verificó READ ONLY contra la BD real que cada
// objeto declarado existe y está validado (ver backend/migrations/RECONCILIATION.md).
// `reconcile` SOLO toca estas versiones y SOLO escribe en el ledger (cero DDL).
//   - adopt:      pendientes ya aplicadas -> INSERT baseline=false (no baseline: post-corte).
//   - rechecksum: aplicadas con checksum divergente (fichero editado tras aplicar,
//                 sin divergencia de efecto) -> UPDATE checksum al del fichero actual.
const RECONCILE_ALLOWLIST = {
  adopt: [
    '20260717_data003_fk_ambiguous_ids.sql',
    '20260717_data003_fk_exercise_id_empty_tables.sql',
    '20260717_data003_fk_exercise_id.sql',
    '20260717_data003_users_drop_dead_dupes.sql',
    '20260717_data003_users_drop_live_pairs.sql',
    '20260717_data003_users_reconcile_live_pairs.sql',
    '20260717_fix_allergen_tags_soja.sql',
    '20260717_seed_rulesets_intermedio_avanzado.sql',
  ],
  rechecksum: [
    '20260717_data003_fk_plan_session_not_valid.sql',
    '20260717_data003_fk_user_id_not_valid.sql',
    '20260717_data003_validate_fks.sql',
    '20260717_documenta_ledger_schema_migrations.sql',
    '20260717_sec_bola_deload_fatigue_ownership.sql',
    '20260717_sec006_revoke_public_execute_app.sql',
    '20260717_workout_schedule_unique_plan_user_date.sql',
  ],
};

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
    const drift = files.filter((f) => applied.has(f) && applied.get(f).checksum !== migrationChecksum(readMigration(f)));
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

    // DB-001 (PR 2): en CI, `status --check` falla si el ledger no está limpio
    // (pendientes o drift de checksum), para bloquear el merge ante desincronización.
    if (process.argv.includes('--check') && (pending.length || drift.length)) {
      console.error(`\n❌ Ledger desincronizado: ${pending.length} pendiente(s), ${drift.length} con checksum divergente.`);
      process.exitCode = 1;
    }
  } finally {
    await client.end();
  }
}

// DB-001 (PR 2): reconciliación EXPLÍCITA del ledger (solo versiones de la allowlist).
// Escribe únicamente en app.schema_migrations (cero DDL de esquema).
async function cmdReconcile() {
  const client = connect();
  await client.connect();
  try {
    await ensureLedger(client);
    const applied = await getApplied(client);
    const files = new Set(listMigrationFiles());
    let adopted = 0; let rechecked = 0; const skipped = [];

    // adopt: pendientes ya aplicadas -> INSERT baseline=false.
    for (const f of RECONCILE_ALLOWLIST.adopt) {
      if (!files.has(f)) throw new Error(`allowlist adopt: no existe el fichero ${f}`);
      if (applied.has(f)) { skipped.push(`adopt ya registrada: ${f}`); continue; }
      await client.query(
        'INSERT INTO app.schema_migrations (version, checksum, baseline) VALUES ($1, $2, false)',
        [f, migrationChecksum(readMigration(f))]
      );
      console.log(`  + adopt   ${f}`);
      adopted += 1;
    }

    // rechecksum: aplicadas con checksum divergente -> UPDATE al checksum actual.
    for (const f of RECONCILE_ALLOWLIST.rechecksum) {
      if (!files.has(f)) throw new Error(`allowlist rechecksum: no existe el fichero ${f}`);
      const row = applied.get(f);
      const current = migrationChecksum(readMigration(f));
      if (!row) throw new Error(`rechecksum: ${f} no está en el ledger (esperado registrado)`);
      if (row.checksum === current) { skipped.push(`rechecksum ya coincide: ${f}`); continue; }
      await client.query(
        'UPDATE app.schema_migrations SET checksum = $2 WHERE version = $1',
        [f, current]
      );
      console.log(`  ~ rechk   ${f}`);
      rechecked += 1;
    }

    console.log(`\n✅ Reconcile: ${adopted} adoptadas, ${rechecked} re-checksum. ${skipped.length} sin cambios.`);
    skipped.forEach((s) => console.log(`   · ${s}`));
  } finally {
    await client.end();
  }
}

// DB-001: re-base ÚNICA del ledger al checksum EOL-independiente (LF). Necesario tras
// introducir `migrationChecksum` para que las filas guardadas con hash CRLF pasen a hash
// LF. GUARDA de seguridad: solo re-expresa filas cuyo contenido es idéntico módulo fin de
// línea (stored == hash del contenido en CRLF); si el contenido difiere de verdad, lo
// reporta como drift REAL y NO lo enmascara. Idempotente.
async function cmdRechecksumEol() {
  const client = connect();
  await client.connect();
  try {
    await ensureLedger(client);
    const applied = await getApplied(client);
    const files = new Set(listMigrationFiles());
    let updated = 0; let clean = 0; const realDrift = []; const missing = [];

    for (const [version, row] of applied) {
      if (!files.has(version)) { missing.push(version); continue; }
      const raw = readMigration(version);
      const lfHash = migrationChecksum(raw); // canónico (LF)
      if (row.checksum === lfHash) { clean += 1; continue; }
      // Formas EOL cuyo contenido es idéntico módulo fin de línea: bytes exactos del disco
      // (cubre EOL MIXTO), y la variante en CRLF puro (guardado en Windows). Si el checksum
      // guardado coincide con alguna, es el mismo contenido -> re-expresar a LF con seguridad.
      const eolEquivalents = new Set([
        sha256(raw),
        sha256(eolNormalize(raw).replace(/\n/g, '\r\n')),
      ]);
      if (eolEquivalents.has(row.checksum)) {
        await client.query(
          'UPDATE app.schema_migrations SET checksum = $2 WHERE version = $1',
          [version, lfHash]
        );
        console.log(`  ~ eol   ${version}`);
        updated += 1;
      } else {
        // El contenido difiere de verdad (no solo el fin de línea): NO enmascarar.
        realDrift.push(version);
      }
    }

    console.log(`\n✅ Rechecksum EOL: ${updated} normalizadas a LF, ${clean} ya normalizadas.`);
    if (missing.length) {
      console.log(`   · ${missing.length} en ledger sin fichero (ignoradas): ${missing.join(', ')}`);
    }
    if (realDrift.length) {
      console.log(`\n❌ ${realDrift.length} con divergencia REAL de contenido (NO tocadas; revísalas):`);
      realDrift.forEach((f) => console.log(`   ! ${f}`));
      process.exitCode = 1;
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
        [f, migrationChecksum(readMigration(f))]
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
          [f, migrationChecksum(sql)]
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
const run = { status: cmdStatus, baseline: cmdBaseline, up: cmdUp, reconcile: cmdReconcile, 'rechecksum-eol': cmdRechecksumEol }[cmd];
if (run) {
  run().catch((e) => {
    console.error('Error:', e.message);
    process.exitCode = 1;
  });
} else if (cmd === 'new') {
  cmdNew(arg);
} else {
  console.log('Comandos: status [--check] | baseline | up | reconcile | rechecksum-eol | new <slug>');
  process.exitCode = cmd ? 1 : 0;
}
