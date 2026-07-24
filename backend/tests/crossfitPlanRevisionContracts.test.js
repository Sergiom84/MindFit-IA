import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function read(relativeUrl) {
  return fs.readFileSync(new URL(relativeUrl, import.meta.url), "utf8");
}

test("regeneración CrossFit v2 conserva drafts y enruta al especialista", () => {
  const route = read("../routes/routineGeneration.js");
  const server = read("../server.js");
  const lifecycle = read("../../src/components/Methodologie/hooks/useMethodologyPlanLifecycle.js");
  const modal = read("../../src/components/routines/TrainingPlanConfirmationModal.jsx");

  assert.match(route, /if \(!methodologyUsesImmutableDraftRevisions\(methodology\)\)/);
  assert.match(server, /mode === 'regenerate' && methodology === 'crossfit'/);
  assert.match(server, /specialist\/crossfit\/generate/);
  assert.match(lifecycle, /previous_plan_id: plan\.methodologyPlanId/);
  assert.match(lifecycle, /expected_revision: canonical\.generation\.revision/);
  assert.match(lifecycle, /regeneration_reasons: feedbackData\?\.reasons \?\? \[\]/);
  assert.match(modal, /planId && !usesImmutableRevisions/);
});

test("los tres entrypoints genéricos conservan revisiones CrossFit sin romper Hipertrofia", () => {
  const route = read("../routes/routineGeneration.js");
  const specialist = route
    .split("router.post('/specialist/:methodology/generate'")[1]
    .split("router.post('/ai/methodology'")[0];
  const ai = route
    .split("router.post('/ai/methodology'")[1]
    .split("router.post('/ai/gym-routine'")[0];
  const manual = route
    .split("router.post('/manual/methodology'")[1]
    .split("router.post('/manual/calistenia'")[0];

  assert.match(specialist, /if \(!methodologyUsesImmutableDraftRevisions\(methodology\)\)/);
  assert.match(manual, /if \(!methodologyUsesImmutableDraftRevisions\(methodology\)\)/);
  assert.match(ai, /if \(!methodologyUsesImmutableDraftRevisions\(personalizedPlanData\.methodology\)\)/);
  assert.ok(
    ai.indexOf("isHipertrofiaMethodology(personalizedPlanData.methodology)") <
      ai.indexOf("methodologyUsesImmutableDraftRevisions(personalizedPlanData.methodology)"),
    "Hipertrofia debe delegar antes de la limpieza del flujo genérico"
  );
});

test("migración de revisiones es aditiva, idempotente y forma parte del QA efímero", () => {
  const sql = read("../migrations/20260722_crossfit_v2_plan_revisions.sql");
  const workflow = read("../../.github/workflows/ci.yml");

  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS ux_crossfit_v2_plan_idempotency/);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS idx_crossfit_v2_plan_supersedes/);
  assert.match(sql, /plan_data -> 'crossfit_v2' -> 'generation' ->> 'idempotency_key'/);
  assert.match(sql, /plan_data -> 'crossfit_v2' -> 'generation' ->> 'supersedes'/);
  assert.doesNotMatch(sql, /DROP TABLE|TRUNCATE|DELETE FROM app\.|UPDATE app\./);
  assert.equal(
    workflow.match(/20260722_crossfit_v2_plan_revisions\.sql/g)?.length,
    2
  );
});
