import "./helpers/muteConsole.js"; // PRIMERO: silencia logs (evita flake IPC del runner)
import test from "node:test";
import assert from "node:assert/strict";

// PR-CAL-01 · Subfase A — resolución de nivel de calistenia con el normalizador canónico.
// El fuzzy legacy `normalizeCalisteniaLevel` hacía pasar CUALQUIER valor por 'principiante'
// (default silencioso). El nuevo helper puro:
//   - resuelve por precedencia selectedLevel → aiLevel → profileLevel;
//   - nivel AUSENTE → 'principiante' (default seguro, el más conservador);
//   - nivel PROVISTO pero no reconocido por el registry → lanza error 422 tipado
//     (code CALISTHENICS_LEVEL_UNRECOGNIZED), nunca principiante silencioso.
import { resolveCalisteniaLevelKey }
  from "../services/routineGeneration/methodologies/CalisteniaService.js";

test("CAL-01: niveles canónicos y alias legacy se resuelven", () => {
  assert.equal(resolveCalisteniaLevelKey({ selectedLevel: "avanzado" }), "avanzado");
  assert.equal(resolveCalisteniaLevelKey({ selectedLevel: "intermedio" }), "intermedio");
  assert.equal(resolveCalisteniaLevelKey({ selectedLevel: "basico" }), "principiante");
  assert.equal(resolveCalisteniaLevelKey({ selectedLevel: "  BÁSICO " }), "principiante");
});

test("CAL-01: precedencia selectedLevel → aiLevel → profileLevel", () => {
  assert.equal(
    resolveCalisteniaLevelKey({ selectedLevel: "avanzado", aiLevel: "intermedio", profileLevel: "principiante" }),
    "avanzado"
  );
  assert.equal(
    resolveCalisteniaLevelKey({ aiLevel: "intermedio", profileLevel: "principiante" }),
    "intermedio"
  );
  assert.equal(resolveCalisteniaLevelKey({ profileLevel: "avanzado" }), "avanzado");
});

test("CAL-01: nivel ausente → 'principiante' (default seguro, no lanza)", () => {
  assert.equal(resolveCalisteniaLevelKey({}), "principiante");
  assert.equal(resolveCalisteniaLevelKey({ selectedLevel: null, aiLevel: null, profileLevel: null }), "principiante");
  assert.equal(resolveCalisteniaLevelKey({ selectedLevel: "   " }), "principiante");
});

test("CAL-01 F1: profileLevel (ambiental) sucio NO aborta la generación → default seguro", () => {
  // Un nivel_entrenamiento legacy/no canónico del perfil NO debe lanzar 422 (regresión H-C1):
  // se ignora y cae al default seguro. Solo el nivel EXPLÍCITO lanza.
  assert.equal(resolveCalisteniaLevelKey({ profileLevel: "novato" }), "principiante");
  assert.equal(resolveCalisteniaLevelKey({ profileLevel: "intermedio-avanzado" }), "principiante");
  // profileLevel canónico sí se respeta.
  assert.equal(resolveCalisteniaLevelKey({ profileLevel: "avanzado" }), "avanzado");
  // profileLevel sucio pero con selectedLevel válido: gana el explícito.
  assert.equal(resolveCalisteniaLevelKey({ selectedLevel: "intermedio", profileLevel: "novato" }), "intermedio");
});

test("CAL-01 F1: un selectedLevel/aiLevel EXPLÍCITO inválido SÍ lanza 422 (no se degrada)", () => {
  assert.throws(() => resolveCalisteniaLevelKey({ selectedLevel: "ninja" }), (e) => e.statusCode === 422);
  assert.throws(() => resolveCalisteniaLevelKey({ aiLevel: "elite" }), (e) => e.statusCode === 422);
});

test("CAL-01: nivel provisto pero NO reconocido → 422 tipado (no principiante silencioso)", () => {
  assert.throws(
    () => resolveCalisteniaLevelKey({ selectedLevel: "ninja" }),
    (err) => {
      assert.equal(err.statusCode, 422);
      assert.equal(err.code, "CALISTHENICS_LEVEL_UNRECOGNIZED");
      return true;
    }
  );
  // 'elite' no es un nivel de calistenia (sí de crossfit) → también 422, no se cuela.
  assert.throws(
    () => resolveCalisteniaLevelKey({ aiLevel: "elite" }),
    (err) => err.statusCode === 422 && err.code === "CALISTHENICS_LEVEL_UNRECOGNIZED"
  );
});
