// backend/scripts/export-hipertrofia-legacy-evidence.mjs
//
// Exporta a JSON de EVIDENCIA las filas legacy del motor "Hipertrofia" (pre-V2) ANTES de
// borrarlas con la migración 20260722_retire_hipertrofia_legacy_plans.sql.
// SOLO LECTURA. Ejecutar ANTES del borrado.
//
// Uso (desde backend/, con DATABASE_URL a prod o replica):
//   node scripts/export-hipertrofia-legacy-evidence.mjs
// Genera: backend/evidence/hipertrofia-legacy-plans-<timestamp>.json
//
// Selecciona EXACTAMENTE methodology_type = 'hipertrofia' (match exacto, NO ILIKE): nunca
// toca HipertrofiaV2 ('HipertrofiaV2_MindFeed') ni 'gimnasio' (fallback vivo).

import { pool } from '../db.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LEGACY_TYPE = 'hipertrofia';

const CHILD_TABLES = [
  { table: 'methodology_plan_days', fk: 'plan_id' },
  { table: 'methodology_session_feedback', fk: 'methodology_plan_id' },
  { table: 'methodology_exercise_history_complete', fk: 'methodology_plan_id' },
  { table: 'adaptation_blocks', fk: 'methodology_plan_id' },
  { table: 'fatigue_flags', fk: 'methodology_plan_id' },
  { table: 're_evaluations', fk: 'methodology_plan_id' },
  { table: 'hipertrofia_v2_state', fk: 'methodology_plan_id' },
  { table: 'warmup_tracking', fk: 'methodology_plan_id' }
];

async function main() {
  const evidence = {
    generated_at: new Date().toISOString(),
    purpose: 'Backup de evidencia de filas legacy methodology_type=hipertrofia antes de borrado (migración 20260722_retire_hipertrofia_legacy_plans.sql).',
    selection_criteria: "app.methodology_plans WHERE methodology_type = 'hipertrofia' (match exacto)",
    plans: [],
    plan_ids: [],
    children: {},
    summary: {}
  };

  const plansRes = await pool.query(
    `SELECT * FROM app.methodology_plans WHERE methodology_type = $1 ORDER BY id`,
    [LEGACY_TYPE]
  );
  evidence.plans = plansRes.rows;
  evidence.plan_ids = plansRes.rows.map((r) => r.id);
  evidence.summary.plan_count = plansRes.rowCount;
  evidence.summary.active_count = plansRes.rows.filter((r) => r.status === 'active').length;

  if (evidence.plan_ids.length > 0) {
    for (const { table, fk } of CHILD_TABLES) {
      try {
        const childRes = await pool.query(
          `SELECT * FROM app.${table} WHERE ${fk} = ANY($1::int[])`,
          [evidence.plan_ids]
        );
        evidence.children[table] = { fk, rows: childRes.rows, count: childRes.rowCount };
      } catch (e) {
        evidence.children[table] = { fk, error: e.message };
      }
    }
  }

  const outDir = path.join(__dirname, '..', 'evidence');
  mkdirSync(outDir, { recursive: true });
  const stamp = evidence.generated_at.replace(/[:.]/g, '-');
  const outFile = path.join(outDir, `hipertrofia-legacy-plans-${stamp}.json`);
  writeFileSync(outFile, JSON.stringify(evidence, null, 2), 'utf8');

  console.log(`✅ Evidencia exportada: ${outFile}`);
  console.log(`   Planes legacy: ${evidence.summary.plan_count} (activos: ${evidence.summary.active_count})`);
  if (evidence.summary.active_count > 0) {
    console.warn('⚠️  Hay planes ACTIVOS con methodology_type=hipertrofia. Revisa antes de borrar.');
  }
  await pool.end();
  process.exit(0);
}

main().catch(async (e) => {
  console.error('❌ Error exportando evidencia:', e.message);
  try { await pool.end(); } catch { /* noop */ }
  process.exit(1);
});
