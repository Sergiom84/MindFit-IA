// PERF-001: budget de tamaño de bundle. Falla el CI si algún chunk JS supera el
// presupuesto (raw o gzip). Evita regresiones de peso sin depender de un navegador.
//
// Uso: npm run build && node scripts/check-bundle-budget.mjs
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.join(__dirname, '..', 'dist', 'assets');

// Presupuesto POR CHUNK JS. Ajustado por encima del mayor actual (methodologies ~330KB
// raw / ~75KB gzip) para pasar hoy y bloquear crecimientos futuros.
const BUDGET = { rawKB: 450, gzipKB: 120 };

function kb(bytes) { return Math.round((bytes / 1024) * 10) / 10; }

let files;
try {
  files = readdirSync(ASSETS).filter((f) => f.endsWith('.js'));
} catch {
  console.error(`❌ No existe ${ASSETS}. Ejecuta \`npm run build\` primero.`);
  process.exit(2);
}

const offenders = [];
const rows = [];
for (const f of files) {
  const full = path.join(ASSETS, f);
  const raw = statSync(full).size;
  const gz = gzipSync(readFileSync(full)).length;
  rows.push({ f, raw, gz });
  if (kb(raw) > BUDGET.rawKB || kb(gz) > BUDGET.gzipKB) offenders.push({ f, raw, gz });
}

rows.sort((a, b) => b.raw - a.raw);
console.log(`Budget por chunk: ${BUDGET.rawKB} KB raw / ${BUDGET.gzipKB} KB gzip\n`);
for (const r of rows.slice(0, 12)) {
  const flag = offenders.includes(r) ? '  ❌' : '';
  console.log(`  ${kb(r.raw).toString().padStart(7)} KB raw | ${kb(r.gz).toString().padStart(6)} KB gzip  ${r.f}${flag}`);
}

if (offenders.length) {
  console.error(`\n❌ ${offenders.length} chunk(s) superan el budget. Reduce el tamaño o ajusta el presupuesto de forma justificada.`);
  process.exit(1);
}
console.log(`\n✅ ${files.length} chunks dentro del presupuesto.`);
