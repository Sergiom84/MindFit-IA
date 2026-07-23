/**
 * PR-CAL-00a · Caracterización MÍNIMA (VERDE) del comportamiento actual de Calistenia.
 *
 * Congela SOLO lo que los PRs siguientes van a cambiar, usando la superficie pura y
 * exportada disponible hoy. Ver docs/ROADMAP_CALISTENIA_ARQUITECTO.md §3 PR-CAL-00a.
 *
 * HUECOS DE CARACTERIZACIÓN (documentados, no ocultados):
 *  - `normalizeCalisteniaLevel` (G2), `SESSION_TEMPLATES` (G3) y el relleno
 *    cross-categoría (G5) son INTERNOS a CalisteniaService.js (no exportados) y
 *    `generateCalisteniaPlan` depende del pool real de BD. En 00a está PROHIBIDO
 *    tocar producción, así que NO se exportan ni se testean directamente aquí; se
 *    caracterizan de forma INDIRECTA: `getCalisteniaLevels()` fija el mapeo
 *    nivel→frecuencia/duración (la ÚNICA diferencia real entre niveles hoy, que es
 *    justamente el defecto G3), y el shape del plan v2 (`version:'calistenia_v2'`,
 *    semanas con `numero`) queda pineado por el defecto A3 en
 *    calisteniaKnownDefects.test.js. La extracción del selector (PR-CAL-02A) abrirá
 *    el seam para congelar el plan completo sin BD.
 */

import "./helpers/muteConsole.js"; // PRIMERO: silencia logs (evita flake IPC del runner)
import test from "node:test";
import assert from "node:assert/strict";

import { getCalisteniaLevels } from "../services/routineGeneration/methodologies/CalisteniaService.js";
import {
  extractInjuryText,
  activeInjuryRules,
  isContraindicated
} from "../services/routineGeneration/injuryContraindications.js";
import {
  wristInjuryProfile,
  healthyBeginnerProfile,
  buildCalisteniaExercisePool,
  buildCalisteniaV2Plan
} from "./fixtures/calisteniaProfiles.js";

// ── Niveles: la distinción real entre niveles es SOLO frecuencia/duración (G3) ──
test("CAL-00a: getCalisteniaLevels expone 3 niveles con frecuencia/duración fijas", () => {
  const levels = getCalisteniaLevels();
  assert.deepEqual(Object.keys(levels).sort(), ["avanzado", "intermedio", "principiante"]);

  assert.equal(levels.principiante.name, "Principiante");
  assert.equal(levels.principiante.sessions_per_week, 3);
  assert.equal(levels.principiante.duration_weeks, 8);

  assert.equal(levels.intermedio.name, "Intermedio");
  assert.equal(levels.intermedio.sessions_per_week, 4);
  assert.equal(levels.intermedio.duration_weeks, 10);

  assert.equal(levels.avanzado.name, "Avanzado");
  assert.equal(levels.avanzado.sessions_per_week, 5);
  assert.equal(levels.avanzado.duration_weeks, 12);
});

// ── Contrato del filtro de lesiones compartido (base de G8 en single-day) ──
test("CAL-00a: perfil de muñeca activa la regla de muñeca y contraindica el empuje de manos", () => {
  const injuryText = extractInjuryText(wristInjuryProfile);
  assert.match(injuryText.toLowerCase(), /muñeca|muneca/);

  const rules = activeInjuryRules(injuryText);
  assert.ok(rules.some((r) => r.zona === "muñeca"), "debe activarse la regla de muñeca");

  const pool = buildCalisteniaExercisePool();
  // "Flexiones" (Empuje) está contraindicado; "Dominadas"/"Sentadilla" no.
  assert.equal(isContraindicated(pool.Empuje[0], rules), true);
  assert.equal(isContraindicated(pool.Tracción[0], rules), false);
  assert.equal(isContraindicated(pool.Piernas[0], rules), false);
});

test("CAL-00a: perfil sano no activa ninguna regla de contraindicación", () => {
  const rules = activeInjuryRules(extractInjuryText(healthyBeginnerProfile));
  assert.equal(rules.length, 0);
  const pool = buildCalisteniaExercisePool();
  assert.equal(isContraindicated(pool.Empuje[0], rules), false);
});

// ── Shape del plan v2 que consumen reevaluación / key-exercises (contrato A3) ──
test("CAL-00a: el plan calistenia_v2 usa semanas keyed por `numero` (no `semana`/`week`)", () => {
  const plan = buildCalisteniaV2Plan();
  assert.equal(plan.version, "calistenia_v2");
  assert.ok(Array.isArray(plan.semanas));
  for (const semana of plan.semanas) {
    assert.equal(typeof semana.numero, "number");
    assert.equal(semana.semana, undefined);
    assert.equal(semana.week, undefined);
  }
});
