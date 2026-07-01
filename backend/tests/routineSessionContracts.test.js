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

test("sessions route usa helper compartido de días y no mapas locales frágiles", () => {
  const source = readRepoFile("backend/routes/routines/sessions.js");

  assert.match(source, /utils\/shared\/dayNormalizer\.js/);
  assert.match(source, /normalizeDayFullName/);
  assert.doesNotMatch(source, /dayFullNameMap\s*=/);
  assert.doesNotMatch(source, /dayNameMap\s*=/);
  assert.match(source, /day_abbrev\s*=\s*\$3 OR day_name\s*=\s*\$4/);
});

test("today-status no referencia columnas inexistentes al hacer fallback multimedia", () => {
  const source = readRepoFile("backend/routes/routines/sessions.js");

  assert.match(source, /COALESCE\(p\.gif_url,\s*e\.gif_url\) AS gif_url/);
  assert.match(source, /p\.video_url AS video_url/);
  assert.doesNotMatch(source, /\be\.video_url\b/);
});

test("TodayTrainingTab mantiene cierre 7/7 y CrossFit usa WOD player desde plan", () => {
  const source = readRepoFile("src/components/routines/tabs/TodayTrainingTab.jsx");

  const endpoints = [
    "/methodology-session/calistenia/session-result",
    "/methodology-session/casa/session-result",
    "/methodology-session/funcional/session-result",
    "/methodology-session/crossfit/wod-result",
    "/methodology-session/halterofilia/session-result",
    "/methodology-session/powerlifting/session-result",
    "/methodology-session/heavy-duty/session-result",
  ];

  for (const endpoint of endpoints) {
    assert.match(source, new RegExp(endpoint.replace(/[/-]/g, (m) => `\\${m}`)));
  }

  for (const modalName of [
    "CalisteniaEffortModal",
    "CasaEffortModal",
    "FuncionalEffortModal",
    "CrossFitEffortModal",
    "HalterofiliaEffortModal",
    "PowerliftingEffortModal",
    "HeavyDutyEffortModal",
  ]) {
    assert.match(source, new RegExp(`<${modalName}`));
  }

  assert.match(source, /activeMethodKey === 'crossfit'/);
  assert.match(source, /<WodSessionModal/);
  assert.match(source, /defaultScale=\{effortModal\.scale \|\| 'rx'\}/);
  assert.match(source, /methodologyPlanId: methodologyPlanId \|\| null/);
  assert.match(source, /\.\.\.payload/);
});

test("TodayTrainingTab prioriza today-status.summary como fuente de verdad del gate", () => {
  const source = readRepoFile("src/components/routines/tabs/TodayTrainingTab.jsx");

  assert.match(source, /const backendSummary = todayStatus\?\.summary \|\| null/);
  assert.match(source, /const hasBackendSummary = Boolean\(backendSummary\)/);
  assert.match(source, /hasBackendSummary\s*\?\s*Number\(backendSummary\.total \|\| 0\)/);
  assert.match(source, /const hasCompletedSession = isFinishedToday \|\|/);
  assert.match(source, /dataSource: hasBackendSummary \? 'backend \(today-status\.summary\)'/);
});

