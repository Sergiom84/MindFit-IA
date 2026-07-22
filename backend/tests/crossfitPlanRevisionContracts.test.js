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
