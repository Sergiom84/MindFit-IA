import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { computeGateLogic } from "../../src/components/routines/tabs/TodayTrainingTab/gateLogic.js";

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
  // ARCH-002: los EFFORT_ENDPOINTS se extrajeron a effortConfig.js y los 7 modales
  // de autorregulación a components/EffortModals.jsx (ambos importados por
  // TodayTrainingTab). El contrato de cierre 7/7 se verifica sobre esos módulos.
  const effortConfigSource = readRepoFile(
    "src/components/routines/tabs/TodayTrainingTab/effortConfig.js",
  );
  const effortModalsSource = readRepoFile(
    "src/components/routines/tabs/TodayTrainingTab/components/EffortModals.jsx",
  );
  const modalLayerSource = readRepoFile(
    "src/components/routines/tabs/TodayTrainingTab/components/TodayTrainingModalLayer.jsx",
  );
  const sessionActionsSource = readRepoFile(
    "src/components/routines/tabs/TodayTrainingTab/hooks/useRoutineSessionActions.js",
  );

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
    assert.match(effortConfigSource, new RegExp(endpoint.replace(/[/-]/g, (m) => `\\${m}`)));
  }

  // TodayTrainingTab debe seguir cableado al hook de sesión y a la capa de modales.
  assert.match(source, /useRoutineSessionActions/);
  assert.match(source, /from '\.\/TodayTrainingTab\/effortConfig/);
  assert.match(source, /<TodayTrainingModalLayer/);
  assert.match(modalLayerSource, /<EffortModals/);
  assert.match(sessionActionsSource, /EFFORT_ENDPOINTS/);

  // El cierre 7/7 vive ahora en EffortModals.jsx.
  for (const modalName of [
    "CalisteniaEffortModal",
    "CasaEffortModal",
    "FuncionalEffortModal",
    "CrossFitEffortModal",
    "HalterofiliaEffortModal",
    "PowerliftingEffortModal",
    "HeavyDutyEffortModal",
  ]) {
    assert.match(effortModalsSource, new RegExp(`<${modalName}`));
  }

  assert.match(modalLayerSource, /activeMethodKey === "crossfit"/);
  assert.match(modalLayerSource, /<WodSessionModal/);
  assert.match(modalLayerSource, /onStartSession=\{async \(\) =>/);
  assert.match(modalLayerSource, /routines\/sessions\/\$\{effectiveSessionId\}\/mark-started/);
  assert.match(effortModalsSource, /defaultScale=\{effortModal\.scale \|\| 'rx'\}/);
  assert.match(effortModalsSource, /isV2Result=\{effortModal\.crossfitV2 === true\}/);
  assert.match(sessionActionsSource, /methodologyPlanId: methodologyPlanId \|\| null/);
  assert.match(sessionActionsSource, /\.\.\.payload/);
  assert.match(sessionActionsSource, /isCrossfitV2Presentation\(todaySessionData\)/);
});

test("TodayTrainingTab prioriza today-status.summary como fuente de verdad del gate", () => {
  const source = readRepoFile("src/components/routines/tabs/TodayTrainingTab.jsx");
  // ARCH-002: la lógica pura del gate (contadores + estados) se extrajo a
  // TodayTrainingTab/gateLogic.js. El contrato "summary manda" se verifica ahora
  // sobre ese módulo; TodayTrainingTab debe seguir cableado a él.
  const gateLogicSource = readRepoFile(
    "src/components/routines/tabs/TodayTrainingTab/gateLogic.js",
  );

  assert.match(gateLogicSource, /const backendSummary = todayStatus\?\.summary \|\| null/);
  assert.match(gateLogicSource, /const hasBackendSummary = Boolean\(backendSummary\)/);
  assert.match(gateLogicSource, /hasBackendSummary\s*\?\s*Number\(backendSummary\.total \|\| 0\)/);
  assert.match(gateLogicSource, /const hasCompletedSession = isFinishedToday \|\|/);

  // TodayTrainingTab debe seguir cableado a gateLogic y exponer el dataSource.
  assert.match(source, /from '\.\/TodayTrainingTab\/gateLogic/);
  assert.match(source, /computeGateCounts/);
  assert.match(source, /computeGateLogic/);
  assert.match(source, /dataSource: hasBackendSummary \? 'backend \(today-status\.summary\)'/);
});

test("Today cierra terminales CrossFit v2 sin romper el reintento legacy", () => {
  const counts = { total: 2, completed: 1, pending: 0, inProgress: 0 };
  const todayStatus = {
    session: { session_status: "partial" },
    summary: { skipped: 0, cancelled: 1, canRetry: true }
  };
  const crossfitV2 = computeGateLogic({ counts, todayStatus, immutableTerminal: true });
  assert.equal(crossfitV2.isFinishedToday, true);
  assert.equal(crossfitV2.hasUnfinishedWorkToday, false);
  assert.equal(crossfitV2.canRetryToday, false);

  const legacy = computeGateLogic({ counts, todayStatus, immutableTerminal: false });
  assert.equal(legacy.isFinishedToday, false);
  assert.equal(legacy.hasUnfinishedWorkToday, true);
  assert.equal(legacy.canRetryToday, true);
});

test("inicio CrossFit serializa reintentos y no reabre historia terminal", () => {
  const source = readRepoFile("backend/routes/routines/sessions.js");

  assert.match(source, /crossfit-session-start:/);
  assert.match(source, /pg_advisory_xact_lock/);
  assert.match(source, /idempotent_replay:\s*true/);
  assert.match(source, /\['completed', 'partial', 'cancelled', 'skipped', 'missed'\]/);
  assert.match(source, /HISTORY_IMMUTABLE/);
});

test("cancelación de drafts filtra por propietario en ruta y repositorio", () => {
  const route = readRepoFile("backend/routes/routineGeneration.js");
  const repository = readRepoFile(
    "backend/services/routineGeneration/database/planRepository.js",
  );

  assert.match(route, /updatePlanStatus\(planId, 'cancelled', userId\)/);
  assert.match(repository, /WHERE id = \$2 AND user_id = \$3/);
  assert.match(repository, /\[newStatus, planId, userId\]/);
  assert.match(repository, /updatePlanStatus requiere userId/);
});

test("errores CrossFit no filtran detalles internos en respuestas 5xx", () => {
  const generation = readRepoFile("backend/routes/routineGeneration.js");
  const singleDay = readRepoFile("backend/routes/methodologySingleDay.js");
  const plans = readRepoFile("backend/routes/routines/plans.js");

  assert.match(generation, /status >= 500 \? fallbackMessage : error\.message/);
  assert.match(generation, /details: status < 500 \? error\?\.details : undefined/);
  assert.match(singleDay, /details: status < 500 \? error\.message : undefined/);
  assert.match(plans, /details: error\?\.status && error\.status < 500 \? error\.details : undefined/);
});
