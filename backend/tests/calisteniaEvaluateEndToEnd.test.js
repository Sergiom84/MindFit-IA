import "./helpers/muteConsole.js";
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import jwt from "jsonwebtoken";

/**
 * PR-CAL-01 · Test END-TO-END HTTP REAL de la evaluación de nivel de calistenia.
 *
 * A diferencia de la versión anterior (que invocaba `evaluateCalisteniaLevel` en memoria y por
 * tanto NO ejercitaba el router, el parseo del body, el middleware de auth ni el saneado del
 * envelope tal como lo serializa HTTP), aquí se levanta un servidor Express real que monta el
 * router de producción `routineGeneration.js` y se le hacen peticiones HTTP de verdad con `fetch`.
 * Se cubren AMBAS rutas:
 *   · Canónica: POST /api/routine-generation/specialist/calistenia/evaluate
 *   · Alias legacy: POST /api/calistenia-specialist/evaluate-profile (reescribe req.url a la
 *     canónica, igual que server.js) — se verifica que delega en la misma lógica.
 *
 * Los tests unitarios directos a `evaluateCalisteniaLevel`/`resolveAssessmentInput` viven en
 * `calisteniaEvaluateUnit.test.js` (este fichero es HTTP puro de principio a fin).
 *
 * Aislamiento de BD: el runner de tests (scripts/run-tests.mjs modo unit) inyecta un DATABASE_URL
 * placeholder que nunca conecta; el pool es lazy. El middleware de auth y el servicio hacen
 * `pool.query` que falla contra ese placeholder, pero AMBOS lo capturan y degradan (auth es
 * fail-open por defecto — AUTH_FAIL_CLOSED='0'; el servicio devuelve el assessment sin prosa de
 * IA). Así la evaluación depende solo de `assessmentInput`, sin datos reales de perfil.
 */

// Defaults autocontenidos por si el fichero se ejecuta fuera del runner.
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-calistenia-e2e";
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/placeholder_unit_no_connect";

const { default: routineGenerationRoutes } = await import("../routes/routineGeneration.js");

const FAKE_USER_ID = 900099;

// Rutas bajo prueba.
const CANONICAL_PATH = "/api/routine-generation/specialist/calistenia/evaluate";
const LEGACY_ALIAS_PATH = "/api/calistenia-specialist/evaluate-profile";

// Construye un app que replica FIELMENTE el montaje de server.js para estas rutas:
// parseo JSON + alias legacy que reescribe req.url + router consolidado montado en /api/routine-generation.
function buildApp() {
  const app = express();
  app.use(express.json());

  // Alias de compatibilidad (idéntico a server.js): reescribe la URL a la canónica y delega.
  app.post(LEGACY_ALIAS_PATH, (req, _res, next) => {
    req.url = CANONICAL_PATH;
    next();
  });

  app.use("/api/routine-generation", routineGenerationRoutes);
  return app;
}

// Levanta el app en un puerto efímero, ejecuta `fn(baseUrl)` y cierra el servidor.
async function withServer(fn) {
  const app = buildApp();
  const server = await new Promise((resolve) => {
    const s = http.createServer(app).listen(0, "127.0.0.1", () => resolve(s));
  });
  try {
    const { port } = server.address();
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const bearer = (userId = FAKE_USER_ID) =>
  `Bearer ${jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: "5m" })}`;

// POST autenticado con cuerpo JSON. Devuelve { status, body }.
async function postJson(baseUrl, path, body, { auth = true } = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Authorization: bearer() } : {})
    },
    body: JSON.stringify(body)
  });
  let parsed = null;
  try {
    parsed = await res.json();
  } catch {
    parsed = null;
  }
  return { status: res.status, body: parsed };
}

// Fija OPENAI_API_KEY a `undefined` durante `fn` para que la IA (que solo explica) no se invoque:
// la evaluación queda determinista y sin red. Restaura el valor previo al terminar.
async function withoutOpenAI(fn) {
  const saved = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    return await fn();
  } finally {
    if (saved === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = saved;
  }
}

// Comprueba que el envelope de error 4xx que sale por HTTP está SANEADO: no filtra campos internos
// del Error de dominio (statusCode/stack/message crudo ni el nombre interno `publicEvaluation`).
function assertSanitizedErrorEnvelope(body) {
  assert.equal(body.success, false);
  assert.ok(!("statusCode" in body), "no debe filtrar statusCode interno");
  assert.ok(!("stack" in body), "no debe filtrar el stack");
  assert.ok(
    !("publicEvaluation" in body),
    "el envelope público se expone como `evaluation`, no `publicEvaluation`"
  );
}

// ---------------------------------------------------------------------------------------------
// Matriz canónica × alias legacy: cada caso se ejecuta contra ambas rutas para probar que el
// alias legacy delega EXACTAMENTE en la misma lógica que la canónica.
// ---------------------------------------------------------------------------------------------
for (const [label, path] of [
  ["canonica", CANONICAL_PATH],
  ["alias-legacy", LEGACY_ALIAS_PATH]
]) {
  test(`[${label}] happy path 'ok' -> 200 con envelope determinista (nivel del assessment, no de la IA)`, async () => {
    await withoutOpenAI(() =>
      withServer(async (baseUrl) => {
        const { status, body } = await postJson(baseUrl, path, {
          assessmentInput: { selfReportedLevel: "intermedio" }
        });
        assert.equal(status, 200);
        assert.equal(body.success, true);
        assert.equal(body.evaluation.decision, "ok");
        assert.equal(body.evaluation.recommended_level, "intermedio");
        assert.equal(body.evaluation.reasoning, null, "sin IA -> sin prosa, nunca 500");
      })
    );
  });

  test(`[${label}] sin nivel ni evidencia -> 200 insufficient_data`, async () => {
    await withServer(async (baseUrl) => {
      const { status, body } = await postJson(baseUrl, path, { assessmentInput: {} });
      assert.equal(status, 200);
      assert.equal(body.success, true);
      assert.equal(body.evaluation.decision, "insufficient_data");
      assert.equal(body.evaluation.recommended_level, null);
      assert.equal(body.evaluation.confidence, "low");
      assert.equal(body.evaluation.reasoning, null);
    });
  });

  test(`[${label}] painStatus 'acute' -> 422 tipado 'refer' con envelope saneado`, async () => {
    await withServer(async (baseUrl) => {
      const { status, body } = await postJson(baseUrl, path, {
        assessmentInput: { painStatus: "acute" }
      });
      assert.equal(status, 422);
      assert.equal(body.code, "CALISTHENICS_ASSESSMENT_REFER");
      // El mensaje es el público de la whitelist, no el mensaje crudo del Error de dominio.
      assert.equal(
        body.error,
        "Necesitas una valoración profesional antes de generar el entrenamiento."
      );
      assert.equal(body.evaluation.decision, "refer");
      assert.equal(body.evaluation.recommended_level, null);
      assert.equal(body.evaluation.reasoning, null);
      assertSanitizedErrorEnvelope(body);
    });
  });
}

// ---------------------------------------------------------------------------------------------
// El middleware de auth se ejercita de verdad: sin token la petición nunca llega al router.
// ---------------------------------------------------------------------------------------------
test("[canonica] sin token Bearer -> 401 (el middleware de auth corta antes del handler)", async () => {
  await withServer(async (baseUrl) => {
    const { status, body } = await postJson(
      baseUrl,
      CANONICAL_PATH,
      { assessmentInput: { selfReportedLevel: "intermedio" } },
      { auth: false }
    );
    assert.equal(status, 401);
    assert.equal(body.error, "Token de acceso requerido");
  });
});

test("[alias-legacy] sin token Bearer -> 401 (el alias delega y el auth corta igual)", async () => {
  await withServer(async (baseUrl) => {
    const { status } = await postJson(
      baseUrl,
      LEGACY_ALIAS_PATH,
      { assessmentInput: { selfReportedLevel: "intermedio" } },
      { auth: false }
    );
    assert.equal(status, 401);
  });
});
