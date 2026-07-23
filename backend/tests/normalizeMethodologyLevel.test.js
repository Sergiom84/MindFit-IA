import test from "node:test";
import assert from "node:assert/strict";

// PR-CAL-01 · Subfase A — normalizador ÚNICO de nivel (defectos A6/G1/G2).
// Contrato: normalizeMethodologyLevel(methodologyId, value)
//   - normaliza value (sin acentos, minúsculas, trim);
//   - aplica alias explícitos (unión de los normalizadores locales que sustituye):
//       basico/basica/beginner → principiante, intermediate → intermedio, advanced → avanzado;
//   - VALIDA per-metodología contra descriptor.levels (elite solo es válido en crossfit);
//   - metodología desconocida o nivel no soportado → null (nunca principiante silencioso).
//
// Estos tests son ROJOS hasta que se exporte `normalizeMethodologyLevel` desde el registry.
import {
  normalizeMethodologyLevel,
  METHODOLOGY_DESCRIPTORS
} from "../services/routineGeneration/methodologies/methodologyRegistry.js";

// Normalizador legacy per-valor (niveles globales) que este canónico debe reemplazar en
// bridge: se usa SOLO para asertar paridad en los casos que la metodología sí soporta.
import { normalizeMethodologyLevel as bridgeNormalizeLevel }
  from "../services/bridgeEventOutboxService.js";

// ── Niveles canónicos válidos por metodología ──────────────────────────────────
test("A-01: niveles canónicos válidos se conservan (calistenia)", () => {
  assert.equal(normalizeMethodologyLevel("calistenia", "principiante"), "principiante");
  assert.equal(normalizeMethodologyLevel("calistenia", "intermedio"), "intermedio");
  assert.equal(normalizeMethodologyLevel("calistenia", "avanzado"), "avanzado");
});

test("A-02: 'elite' es válido en crossfit pero NO en calistenia (validación per-metodología)", () => {
  assert.equal(normalizeMethodologyLevel("crossfit", "elite"), "elite");
  assert.equal(normalizeMethodologyLevel("calistenia", "elite"), null);
});

// ── Alias explícitos (paridad con los normalizadores locales sustituidos) ───────
test("A-03: alias 'basico'/'basica'/'beginner' → 'principiante'", () => {
  assert.equal(normalizeMethodologyLevel("calistenia", "basico"), "principiante");
  assert.equal(normalizeMethodologyLevel("calistenia", "basica"), "principiante");
  assert.equal(normalizeMethodologyLevel("calistenia", "beginner"), "principiante");
});

test("A-04: alias en inglés 'intermediate'/'advanced' → canónico español", () => {
  assert.equal(normalizeMethodologyLevel("calistenia", "intermediate"), "intermedio");
  assert.equal(normalizeMethodologyLevel("calistenia", "advanced"), "avanzado");
});

// ── Normalización de forma (acentos, mayúsculas, espacios) ──────────────────────
test("A-05: tolera acentos, mayúsculas y espacios sobrantes", () => {
  assert.equal(normalizeMethodologyLevel("calistenia", "  BÁSICO "), "principiante");
  assert.equal(normalizeMethodologyLevel("calistenia", "Avanzado"), "avanzado");
  assert.equal(normalizeMethodologyLevel("calistenia", "PRINCIPIANTE"), "principiante");
});

// ── El methodologyId también se resuelve por alias del registry ─────────────────
test("A-06: el methodologyId acepta alias del registry ('calisthenics' → calistenia)", () => {
  assert.equal(normalizeMethodologyLevel("calisthenics", "basico"), "principiante");
});

// ── Desconocidos → null (sin default silencioso) ────────────────────────────────
test("A-07: nivel arbitrario/desconocido → null (no principiante silencioso)", () => {
  assert.equal(normalizeMethodologyLevel("calistenia", "superman"), null);
  assert.equal(normalizeMethodologyLevel("calistenia", ""), null);
  assert.equal(normalizeMethodologyLevel("calistenia", "   "), null);
});

test("A-08: metodología desconocida → null (no valida a ciegas)", () => {
  assert.equal(normalizeMethodologyLevel("inexistente", "principiante"), null);
  assert.equal(normalizeMethodologyLevel("", "principiante"), null);
  assert.equal(normalizeMethodologyLevel(null, "principiante"), null);
});

test("A-09: value no string/number → null", () => {
  assert.equal(normalizeMethodologyLevel("calistenia", null), null);
  assert.equal(normalizeMethodologyLevel("calistenia", undefined), null);
  assert.equal(normalizeMethodologyLevel("calistenia", {}), null);
  assert.equal(normalizeMethodologyLevel("calistenia", []), null);
});

// ── Paridad con el normalizador legacy de bridge (casos que la metodología soporta) ─
test("A-10: paridad con bridge para crossfit (soporta todos los niveles + elite)", () => {
  for (const value of [
    "basico", "basica", "beginner", "principiante",
    "intermedio", "intermediate", "avanzado", "advanced", "elite",
    "BÁSICO", "  Avanzado ", "desconocido"
  ]) {
    assert.equal(
      normalizeMethodologyLevel("crossfit", value),
      bridgeNormalizeLevel(value),
      `paridad rota para "${value}"`
    );
  }
});

// ── Todas las metodologías del registry aceptan sus propios niveles ─────────────
test("A-11: cada metodología acepta exactamente los niveles de su descriptor", () => {
  for (const d of METHODOLOGY_DESCRIPTORS) {
    for (const level of d.levels) {
      assert.equal(
        normalizeMethodologyLevel(d.id, level),
        level,
        `${d.id} debería aceptar su nivel '${level}'`
      );
    }
  }
});
