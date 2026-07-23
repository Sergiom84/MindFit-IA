import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { resolveLocalQaGate } from "../../tests/helpers/localQaGuard.js";

test("E2E sin acuse queda desactivado y no interpreta URLs", () => {
  const gate = resolveLocalQaGate({
    acknowledgment: undefined,
    apiBase: "https://api.example.invalid",
    databaseUrl: "postgresql://example.invalid/db",
  });
  assert.equal(gate.enabled, false);
});

test("E2E acepta únicamente app, API y PostgreSQL locales con acuse explícito", () => {
  const gate = resolveLocalQaGate({
    acknowledgment: "1",
    apiBase: "http://127.0.0.1:3010",
    appBase: "http://localhost:4173",
    databaseUrl: "postgresql://postgres@127.0.0.1:55432/crossfit_qa",
  });
  assert.equal(gate.enabled, true);
  assert.equal(gate.apiBase, "http://127.0.0.1:3010");
});

test("E2E aborta con acuse si alguna URL apunta a producción o remoto", () => {
  assert.throws(
    () =>
      resolveLocalQaGate({
        acknowledgment: "1",
        apiBase: "https://mindfit.onrender.com",
        databaseUrl: "postgresql://postgres@127.0.0.1:55432/crossfit_qa",
      }),
    /debe apuntar a localhost/,
  );

  assert.throws(
    () =>
      resolveLocalQaGate({
        acknowledgment: "1",
        apiBase: "http://127.0.0.1:3010",
        databaseUrl: "postgresql://postgres@db.supabase.co/postgres",
      }),
    /debe apuntar a localhost/,
  );
});

test("la regresión de metodologías usa la guarda fail-closed compartida", () => {
  const source = fs.readFileSync(
    new URL("../../tests/regresion-metodologias.spec.js", import.meta.url),
    "utf8",
  );
  assert.match(source, /resolveLocalQaGateFromEnv/);
  assert.match(source, /test\.skip\(!LOCAL_QA_GATE\.enabled/);
  assert.doesNotMatch(source, /contra prod|pooler de Supabase/i);
});

test("CI conecta migraciones y E2E CrossFit solo a PostgreSQL efímero local", () => {
  const workflow = fs.readFileSync(
    new URL("../../.github/workflows/ci.yml", import.meta.url),
    "utf8",
  );
  const e2e = fs.readFileSync(
    new URL("../../tests/crossfit-v2-e2e.spec.js", import.meta.url),
    "utf8",
  );
  const playwright = fs.readFileSync(
    new URL("../../playwright.config.js", import.meta.url),
    "utf8",
  );
  assert.match(workflow, /POSTGRES_DB: crossfit_e2e/);
  assert.match(workflow, /CROSSFIT_CATALOG_APPLY_ACK=EPHEMERAL_ONLY/);
  assert.match(workflow, /CROSSFIT_V2_GENERATION: "true"/);
  assert.match(workflow, /CROSSFIT_EMITS_TRAINING_LOAD: "true"/);
  assert.match(workflow, /CROSSFIT_NUTRITION_LOAD: "false"/);
  assert.match(workflow, /NUTRITION_LOAD_PERIODIZATION_MODE: "active"/);
  assert.match(workflow, /BRIDGE_OUTBOX_EMIT_ENABLED: "true"/);
  assert.match(workflow, /BRIDGE_OUTBOX_WORKER_ENABLED: "false"/);
  assert.match(workflow, /npm run test:crossfit:e2e/);
  assert.equal(
    workflow.match(/20260720_add_consent_columns_users\.sql/g)?.length,
    2,
  );
  assert.equal(
    workflow.match(/20260717_workout_schedule_unique_plan_user_date\.sql/g)
      ?.length,
    2,
  );
  assert.equal(
    workflow.match(/20260718_auth001_refresh_rotativo\.sql/g)?.length,
    2,
  );
  assert.match(e2e, /PROFILE_COUNT\)\.toBe\(32\)/);
  assert.match(e2e, /acceptTerms: true/);
  assert.match(e2e, /\.\.\.\(data === null \? \{\} : \{ data \}\)/);
  assert.match(playwright, /width: 375, height: 812/);
});
