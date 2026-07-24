import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("runner estadístico paralelo valida ambos frequencies y reproducibilidad", () => {
  const result = spawnSync(process.execPath, [
    "scripts/qa-crossfit-generator-statistical.mjs",
    "--per-level=4",
    "--workers=2"
  ], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
    timeout: 30000
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, "passed");
  assert.equal(report.total_plans, 12);
  assert.equal(report.regenerated_plans, 12);
  for (const level of ["beginner", "intermediate", "advanced"]) {
    assert.equal(report.levels[level].generated, 4);
    assert.equal(report.levels[level].invalid, 0);
    assert.equal(report.levels[level].non_reproducible, 0);
  }
});
