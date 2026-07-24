import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeAdaptationEvaluation } from "../../src/components/Methodologie/methodologies/Hipertrofia/components/adaptationTransitionModel.js";

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), "../..");

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("normaliza el contrato real de evaluación de adaptación", () => {
  const normalized = normalizeAdaptationEvaluation({
    success: true,
    ready_for_transition: true,
    criteria: {
      adherence: { value: "84.5", sessions: "5/6", met: true },
      rir: { value: "3.2", met: true },
      technique: { flags_count: 0, met: true },
      progress: { value: "9.1", met: true }
    }
  });

  assert.equal(normalized.isReady, true);
  assert.equal(normalized.details.adherence.value, "84.5");
  assert.equal(normalized.details.technique.flags, 0);
});

test("mantiene compatibilidad con la respuesta usada por el flujo de Hoy", () => {
  const normalized = normalizeAdaptationEvaluation({
    is_ready: true,
    evaluation: {
      adherence: { met: true },
      rir: { met: true },
      technique: { flags: 0, met: true },
      progress: { met: true }
    }
  });

  assert.equal(normalized.isReady, true);
  assert.equal(normalized.details.technique.flags, 0);
});

test("HipertrofiaManualCard usa el contrato canónico y respeta bloques existentes", () => {
  const source = readRepoFile(
    "src/components/Methodologie/methodologies/Hipertrofia/HipertrofiaManualCard.jsx",
  );

  assert.match(source, /currentAdaptation\?\.hasBlock/);
  assert.match(source, /setShowAdaptationSelect\(false\)/);
  assert.match(source, /onTransition=\{handleOpenTransition\}/);
  assert.match(source, /isOpen=\{showTransitionModal\}/);
  assert.match(source, /evaluation=\{transitionEvaluation\}/);
  assert.doesNotMatch(source, /show=\{showTransitionModal\}/);
  assert.doesNotMatch(source, /onConfirm=\{handleTransition\}/);
});

test("los dos textos visibles usan la identidad Hipertrofia", () => {
  const card = readRepoFile(
    "src/components/Methodologie/methodologies/Hipertrofia/HipertrofiaManualCard.jsx",
  );
  const startModal = readRepoFile(
    "src/components/routines/modals/StartDayConfirmationModal.jsx",
  );

  assert.doesNotMatch(card, />\s*Hipertrofia - MindFeed\s*</);
  assert.match(startModal, /isHipertrofiaMethodology\(methodology\)/);
  assert.match(startModal, /\{methodologyDisplayName\}/);
});
