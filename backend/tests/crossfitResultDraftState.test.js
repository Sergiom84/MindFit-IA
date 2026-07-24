import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  clearCrossfitResultDraft,
  createCrossfitResultDraft,
  hydrateCrossfitResultDraft,
  loadCrossfitResultDraft,
  loadLatestCrossfitResultDraft,
  persistCrossfitResultDraft,
  updateCrossfitResultDraftForm
} from "../../src/components/routines/crossfit/resultDraftState.js";

const NOW = new Date("2026-07-22T12:00:00.000Z");

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

function summary(status = "partial") {
  return {
    runtimeVersion: "crossfit-runtime-event/v2",
    sessionId: 101,
    ownerId: 7,
    status,
    elapsedSeconds: 600,
    timeCapSeconds: 900,
    scales: [{ movement_id: "air_squat", scale_id: "base" }]
  };
}

test("draft de resultado persiste, restaura formulario y se limpia por sesión", () => {
  const storage = new MemoryStorage();
  const draft = createCrossfitResultDraft({
    sessionId: 101,
    ownerId: 7,
    planId: 22,
    surface: "today",
    wodSummary: summary(),
    now: NOW
  });
  assert.equal(persistCrossfitResultDraft(draft, storage, NOW), true);
  assert.equal(updateCrossfitResultDraftForm(101, 7, { rpe: 7, completion_percent: 45 }, storage, NOW), true);

  const restored = loadCrossfitResultDraft(101, 7, storage, NOW);
  assert.equal(restored.form.rpe, 7);
  assert.equal(loadLatestCrossfitResultDraft({ surface: "today", ownerId: 7, storage, now: NOW }).session_id, "101");
  assert.equal(loadLatestCrossfitResultDraft({ surface: "today", ownerId: 8, storage, now: NOW }), null);
  assert.equal(clearCrossfitResultDraft(101, 7, storage), true);
  assert.equal(loadCrossfitResultDraft(101, 7, storage, NOW), null);
});

test("draft corrupto, remoto, de otra sesión o caducado falla cerrado", () => {
  const valid = createCrossfitResultDraft({
    sessionId: 101,
    ownerId: 7,
    surface: "single-day",
    wodSummary: summary("abandoned"),
    now: NOW
  });
  assert.equal(hydrateCrossfitResultDraft(valid, { sessionId: 999, now: NOW }), null);
  assert.equal(hydrateCrossfitResultDraft(valid, { ownerId: 8, now: NOW }), null);
  assert.equal(hydrateCrossfitResultDraft({ ...valid, schema_version: "legacy" }, { now: NOW }), null);
  assert.equal(hydrateCrossfitResultDraft({ ...valid, updated_at: "2026-07-01T00:00:00.000Z" }, { now: NOW }), null);
  assert.equal(createCrossfitResultDraft({
    sessionId: 101,
    ownerId: 7,
    surface: "today",
    wodSummary: { runtimeVersion: "legacy" },
    now: NOW
  }), null);
});

test("el flujo V2 difiere el cierre hasta feedback y conserva legacy", () => {
  const player = fs.readFileSync(
    new URL("../../src/components/routines/WodSessionModal.jsx", import.meta.url),
    "utf8"
  );
  const todayModal = fs.readFileSync(
    new URL("../../src/components/routines/tabs/TodayTrainingTab/components/TodayTrainingModalLayer.jsx", import.meta.url),
    "utf8"
  );
  const singleDay = fs.readFileSync(
    new URL("../../src/components/Methodologie/MethodologiesModalLayer.jsx", import.meta.url),
    "utf8"
  );
  const route = fs.readFileSync(new URL("../routes/routines/sessions.js", import.meta.url), "utf8");

  assert.match(player, /if \(!isV2 && typeof onFinishExercise === 'function'\)/);
  for (const status of ["partial", "abandoned", "cancelled"]) {
    assert.match(player, new RegExp(`handleFinish\\('${status}'\\)`));
  }
  assert.match(todayModal, /deferCrossfitV2Result: summary\?\.runtimeVersion === "crossfit-runtime-event\/v2"/);
  assert.match(singleDay, /surface: 'single-day'/);
  assert.match(singleDay, /ownerId: user\?\.id/);
  assert.match(route, /termination_reason/);
});
