import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSharedOptionalReadCache } from "../../src/utils/sharedOptionalReadCache.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("B-01: las lecturas simultáneas y consecutivas comparten una sola petición", async () => {
  let calls = 0;
  const cache = createSharedOptionalReadCache(async (requestPath) => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return { requestPath, calls };
  }, () => "user-1", 1000);

  const [first, second] = await Promise.all([
    cache.read("/nutrition-v2/profile"),
    cache.read("/nutrition-v2/profile")
  ]);
  const third = await cache.read("/nutrition-v2/profile");

  assert.equal(calls, 1);
  assert.deepEqual(first, second);
  assert.deepEqual(second, third);

  cache.invalidate("/nutrition-v2/profile");
  await cache.read("/nutrition-v2/profile");
  assert.equal(calls, 2);
});

test("B-01: un 404 opcional también se deduplica sin convertirlo en error", async () => {
  let calls = 0;
  const cache = createSharedOptionalReadCache(async () => {
    calls += 1;
    const error = new Error("No encontrado");
    error.status = 404;
    throw error;
  }, () => "user-2", 1000);

  const [first, second] = await Promise.all([
    cache.read("/nutrition-v2/active-plan"),
    cache.read("/nutrition-v2/active-plan")
  ]);

  assert.equal(calls, 1);
  assert.deepEqual(first, { ok: false, status: 404, data: null });
  assert.deepEqual(first, second);
});

test("B-01: las tres vistas de Nutrición consumen la lectura compartida", () => {
  const screen = fs.readFileSync(
    path.join(repoRoot, "src/components/nutrition/NutritionScreen.jsx"),
    "utf8"
  );
  const generator = fs.readFileSync(
    path.join(repoRoot, "src/components/nutrition/NutritionPlanGenerator.jsx"),
    "utf8"
  );
  const calendar = fs.readFileSync(
    path.join(repoRoot, "src/components/nutrition/NutritionCalendarView.jsx"),
    "utf8"
  );

  assert.match(screen, /getNutritionProfile\(\)/);
  assert.match(screen, /getActiveNutritionPlan\(\)/);
  assert.match(generator, /getNutritionProfile\(\)/);
  assert.match(calendar, /getActiveNutritionPlan\(/);
  assert.doesNotMatch(screen, /fetch\([^)]*nutrition-v2\/(profile|active-plan)/s);
  assert.doesNotMatch(calendar, /fetch\([^)]*nutrition-v2\/active-plan/s);
});

test("B-02: no quedan rutas ni artefactos ejecutables de Hipertrofia legacy", () => {
  const server = fs.readFileSync(path.join(repoRoot, "backend/server.js"), "utf8");
  const orchestrator = fs.readFileSync(
    path.join(repoRoot, "backend/services/routineGeneration/methodologies/MethodologyOrchestrator.js"),
    "utf8"
  );

  assert.doesNotMatch(server, /specialist\/hipertrofia/);
  assert.doesNotMatch(server, /methodology === ['"]hipertrofia['"]/);
  assert.doesNotMatch(orchestrator, /METODOLOGIAS\.GIMNASIO.*hipertrofia|hipertrofia.*METODOLOGIAS\.GIMNASIO/);
  assert.equal(fs.existsSync(path.join(repoRoot, "backend/services/hipertrofiaPlanGenerator.js")), false);
  assert.equal(fs.existsSync(path.join(repoRoot, "backend/prompts/hipertrofia_specialist.md")), false);
});
