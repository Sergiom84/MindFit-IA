import "./helpers/muteConsole.js";
import assert from "node:assert/strict";
import test from "node:test";

import { generateCrossfitPlanV2 } from "../services/crossfit/generator/planGenerator.js";
import {
  confirmCrossfitPlanV2,
  crossfitCanonicalStartDate
} from "../services/crossfit/integration/confirmPlanService.js";
import { presentCrossfitPlanV2 } from "../services/crossfit/integration/legacyPresentationAdapter.js";
import {
  allCrossfitEquipment,
  allCrossfitSkillPermissions,
  loadCrossfitCatalogFixture
} from "./helpers/crossfitCatalogFixture.js";

const catalog = loadCrossfitCatalogFixture();

function planData() {
  const generated = generateCrossfitPlanV2({
    request_id: "req_confirm",
    idempotency_key: "idem_confirm",
    user_id: "usr_confirm",
    classification_id: "cfc_confirm",
    seed: "confirm-plan",
    generated_at: "2026-07-23T10:00:00.000Z",
    start_date: "2026-07-27",
    level: "beginner",
    frequency: 3,
    catalog,
    profile: { available_equipment: allCrossfitEquipment(catalog) },
    skill_permissions: allCrossfitSkillPermissions(catalog)
  });
  assert.equal(generated.ok, true);
  return presentCrossfitPlanV2(generated.plan, catalog);
}

function clientFor({ status = "draft", persistedDays = 56, persistedSessions = 24 } = {}) {
  const calls = [];
  const source = planData();
  return {
    calls,
    source,
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (/FROM app\.methodology_plans[\s\S]*FOR UPDATE/.test(sql)) {
        return { rowCount: 1, rows: [{ id: 77, status, plan_data: source }] };
      }
      if (/SELECT[\s\S]*total_days[\s\S]*total_sessions/.test(sql)) {
        return {
          rowCount: 1,
          rows: [{ total_days: persistedDays, total_sessions: persistedSessions }]
        };
      }
      return { rowCount: 1, rows: [] };
    }
  };
}

test("la confirmación conserva la fecha canónica resuelta por el generador", () => {
  const source = planData();
  assert.equal(crossfitCanonicalStartDate(source), "2026-07-27");
  assert.equal(crossfitCanonicalStartDate({ crossfit_v2: { weeks: [] } }), null);
});

test("confirmación CrossFit activa y materializa de forma atómica", async () => {
  const client = clientFor();
  let activated = 0;
  let materialized = 0;
  const result = await confirmCrossfitPlanV2({
    client,
    userId: "usr_confirm",
    planId: 77,
    startDate: "2026-07-27",
    activatePlan: async () => {
      activated += 1;
    },
    materializeSchedule: async () => {
      materialized += 1;
      return { adapter: "crossfit-v2", total_days: 56, total_sessions: 24 };
    }
  });

  assert.equal(result.idempotentReplay, false);
  assert.equal(activated, 1);
  assert.equal(materialized, 1);
  assert.equal(client.calls[0].sql, "BEGIN");
  assert.equal(client.calls.at(-1).sql, "COMMIT");
});

test("fallo de calendario revierte también la activación CrossFit", async () => {
  const client = clientFor();
  await assert.rejects(
    confirmCrossfitPlanV2({
      client,
      userId: "usr_confirm",
      planId: 77,
      startDate: "2026-07-27",
      activatePlan: async () => {},
      materializeSchedule: async () => {
        throw new Error("calendar unavailable");
      }
    }),
    /calendar unavailable/
  );
  assert.equal(client.calls.at(-1).sql, "ROLLBACK");
  assert.equal(client.calls.some((call) => call.sql === "COMMIT"), false);
});

test("reconfirmar un plan activo valida el calendario sin reconstruirlo", async () => {
  const client = clientFor({ status: "active" });
  let activated = false;
  let materialized = false;
  const result = await confirmCrossfitPlanV2({
    client,
    userId: "usr_confirm",
    planId: 77,
    startDate: "2026-07-27",
    activatePlan: async () => {
      activated = true;
    },
    materializeSchedule: async () => {
      materialized = true;
    }
  });
  assert.equal(result.idempotentReplay, true);
  assert.equal(activated, false);
  assert.equal(materialized, false);
  assert.equal(client.calls.at(-1).sql, "COMMIT");
});

test("un plan activo con calendario incompleto falla cerrado", async () => {
  const client = clientFor({ status: "active", persistedSessions: 23 });
  await assert.rejects(
    confirmCrossfitPlanV2({
      client,
      userId: "usr_confirm",
      planId: 77,
      startDate: "2026-07-27"
    }),
    (error) => error.code === "CROSSFIT_SCHEDULE_INCOMPLETE" && error.status === 409
  );
  assert.equal(client.calls.at(-1).sql, "ROLLBACK");
});
