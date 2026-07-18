import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), "../..");

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("el arnés ARCH-002 queda limitado a PostgreSQL local y datos sintéticos", () => {
  const harness = readRepoFile("scripts/arch002-test-db.ps1");
  const fixtures = readRepoFile("scripts/arch002-test-db/fixtures.sql");

  assert.match(harness, /127\.0\.0\.1:\$\{databasePort\}:5432/);
  assert.match(harness, /postgresql:\/\/postgres@127\.0\.0\.1:/);
  assert.match(harness, /entrenaconia-arch002-test-db/);
  assert.match(harness, /NODE_ENV=test/);
  assert.doesNotMatch(harness, /backend[\\/]\.env/i);
  assert.doesNotMatch(harness, /supabase/i);
  assert.match(fixtures, /arch002-qa@example\.invalid/);
  assert.match(fixtures, /900001/);
});

test("MethodologiesScreen delega selección, generación y ciclo de vida", () => {
  const source = readRepoFile("src/components/Methodologie/MethodologiesScreen.jsx");

  for (const moduleName of [
    "useMethodologySelectionActions",
    "useManualPlanGeneration",
    "useMethodologyPlanLifecycle",
    "useSingleDayMethodologyActions",
    "useMethodologyEffortActions",
    "MethodologiesModalLayer",
  ]) {
    assert.match(source, new RegExp(moduleName));
  }

  assert.doesNotMatch(source, /const handleStartTraining\s*=/);
  assert.doesNotMatch(source, /const runManualGenerate\s*=/);
  assert.match(source, /<MethodologiesModalLayer/);
});

test("TodayTrainingTab delega sesión, progreso, autorregulación y auxiliares", () => {
  const source = readRepoFile("src/components/routines/tabs/TodayTrainingTab.jsx");
  const sessionActions = readRepoFile(
    "src/components/routines/tabs/TodayTrainingTab/hooks/useRoutineSessionActions.js",
  );

  assert.match(source, /useRoutineSessionActions/);
  assert.match(source, /useRoutineAuxiliaryActions/);
  assert.match(source, /<TodayTrainingModalLayer/);
  assert.doesNotMatch(source, /const handleStartSession\s*=/);
  assert.doesNotMatch(source, /const handleExerciseUpdate\s*=/);
  assert.match(sessionActions, /handleEffortSubmit/);
  assert.match(sessionActions, /handleCompleteSession/);
});
