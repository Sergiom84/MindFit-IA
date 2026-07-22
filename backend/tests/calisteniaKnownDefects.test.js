/**
 * PR-CAL-00a · Defectos VERIFICADOS de Calistenia, congelados como tests ROJOS
 * marcados `todo` (node:test). Un `todo` mantiene la suite VERDE aunque el aserto
 * falle: son la red que se pondrá verde en su PR correspondiente.
 *
 * Referencias (docs/ROADMAP_CALISTENIA_ARQUITECTO.md §1.2 y §3):
 *  - A3  → PR-CAL-00b  (semanas keyed por `numero`; key-exercises devuelve [])
 *  - G8  → PR-CAL-00b  (single-day sin filtro de lesiones)
 *  - S6  → PR-CAL-00b  (/effort sin clamp de avgRir/rpe)
 *  - A5  → PR-CAL-00b  (fallo de IA fabrica y persiste 'stalled')
 *  - S2  → PR-CAL-03a  (fallback cross-metodología a calistenia hardcodeada) [permanente]
 *
 * Los tests de 00b usan `import()` dinámico dentro del cuerpo para que la ausencia de
 * un símbolo/módulo aún-no-creado NO rompa el fichero entero (solo falla ese test,
 * que ya es `todo`). Al resolverse cada defecto en 00b se retira su flag `todo`.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  extractInjuryText,
  activeInjuryRules,
  isContraindicated
} from "../services/routineGeneration/injuryContraindications.js";
import {
  wristInjuryProfile,
  healthyBeginnerProfile,
  buildCalisteniaExercisePool,
  buildCalisteniaV2Plan,
  makeSingleDayDbMock
} from "./fixtures/calisteniaProfiles.js";

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), "../..");
const readRepoFile = (rel) => fs.readFileSync(path.join(repoRoot, rel), "utf8");

// ── A3 (PR-CAL-00b): /key-exercises devuelve [] para plan v2 (semanas `numero`) ──
test(
  "A3: extractKeyExercisesFromWeek devuelve ejercicios reales para plan v2 (numero)",
  async () => {
    const ns = await import("../routes/progressReEvaluation.js");
    assert.equal(
      typeof ns.extractKeyExercisesFromWeek,
      "function",
      "el helper debe exportarse para poder testearlo directamente"
    );
    const out = ns.extractKeyExercisesFromWeek(buildCalisteniaV2Plan(), 1);
    assert.ok(Array.isArray(out) && out.length > 0, "debe extraer ejercicios de la semana 1");
    assert.ok(out.some((e) => /flexiones/i.test(e.nombre || "")), "incluye los ejercicios reales del plan");
  }
);

// ── G8 (PR-CAL-00b): single-day sin filtro de lesiones ──
test(
  "G8: single-day de calistenia NO prescribe empuje contraindicado por muñeca",
  { todo: "PR-CAL-00b: aplicar filtro de lesiones al pool de single-day" },
  async () => {
    const { generateCalisteniaSingleDay } = await import("../services/singleDay/calisteniaSingleDay.js");
    const db = makeSingleDayDbMock(buildCalisteniaExercisePool());
    const { workout } = await generateCalisteniaSingleDay(
      db,
      wristInjuryProfile.userId,
      "Intermedio",
      true,
      { selectionMode: "full_body", profileLoader: async () => wristInjuryProfile }
    );
    const rules = activeInjuryRules(extractInjuryText(wristInjuryProfile));
    const bad = workout.exercises.filter((ex) => isContraindicated(ex, rules));
    assert.equal(bad.length, 0, `no debe incluir contraindicados: ${bad.map((e) => e.nombre).join(", ")}`);
    assert.ok(workout.exercises.length > 0, "debe generar algún ejercicio seguro");
  }
);

// ── S6 (PR-CAL-00b): /effort acepta avgRir/rpe fuera de rango sin 422 ──
test(
  "S6: validación pura de esfuerzo rechaza avgRir/rpe fuera de rango",
  { todo: "PR-CAL-00b: clamp [0,5]/[0,10] con 422 en /effort" },
  async () => {
    const { validateEffortInput } = await import("../services/routines/effortValidation.js");
    assert.equal(typeof validateEffortInput, "function");
    assert.equal(validateEffortInput({ avgRir: 99 }).valid, false, "avgRir=99 inválido");
    assert.equal(validateEffortInput({ avgRir: -1 }).valid, false, "avgRir=-1 inválido");
    assert.equal(validateEffortInput({ rpe: 99 }).valid, false, "rpe=99 inválido");
    assert.equal(validateEffortInput({ avgRir: 3, rpe: 8 }).valid, true, "valores en rango válidos");
    assert.equal(validateEffortInput({}).valid, true, "ambos ausentes: válido (feeling opcional)");
  }
);

// ── A5 (PR-CAL-00b): fallo de IA fabrica y persiste 'stalled' ──
test(
  "A5: fallo de IA NO fabrica 'stalled' (devuelve insufficient_data)",
  { todo: "PR-CAL-00b: fallback ai_failed/insufficient_data, sin persistir análisis" },
  async () => {
    const savedKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY; // fuerza el path de fallo de IA de forma determinista (sin red)
    try {
      const { analyze } = await import("../lib/aiReEvaluators/calisteniaReEvaluator.js");
      const res = await analyze({
        currentPlan: buildCalisteniaV2Plan(),
        userData: healthyBeginnerProfile,
        reEvaluationData: { week: 1, exercises: [], sentiment: "normal", comment: "" }
      });
      assert.notEqual(res.progress_assessment, "stalled", "no debe inventar 'stalled' ante fallo de IA");
      assert.equal(res.ai_failed, true, "debe marcar explícitamente el fallo de IA");
    } finally {
      if (savedKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = savedKey;
    }
  }
);

// ── S2 (PR-CAL-03a, permanente en esta entrega): fallback cross-metodología ──
test(
  "S2: el start NO inyecta calistenia hardcodeada para planes sin ejercicios",
  { todo: "PR-CAL-03a: sustituir el fallback por 422 SESSION_EXERCISES_UNAVAILABLE" },
  () => {
    const source = readRepoFile("backend/routes/routines/sessions.js");
    assert.doesNotMatch(
      source,
      /disciplina:\s*['"]calistenia['"]/,
      "el fallback aleatorio hardcodea disciplina:'calistenia' para cualquier plan"
    );
  }
);
