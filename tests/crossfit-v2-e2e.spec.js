import fs from "node:fs";

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import {
  allCrossfitEquipment,
  allCrossfitSkillPermissions,
  loadCrossfitCatalogFixture,
} from "../backend/tests/helpers/crossfitCatalogFixture.js";
import { resolveLocalQaGateFromEnv } from "./helpers/localQaGuard.js";

const QA_GATE = resolveLocalQaGateFromEnv(process.env, { requireApp: true });
const PASSWORD = "QaTest1234!";
const CATALOG = loadCrossfitCatalogFixture();
const FULL_EQUIPMENT = allCrossfitEquipment(CATALOG);
const SKILL_PERMISSIONS = allCrossfitSkillPermissions(CATALOG);
const LEVEL_CASES = [
  { level: "beginner", expected: "beginner", frequency: 3, score: 1 },
  { level: "intermediate", expected: "intermediate", frequency: 4, score: 2 },
  { level: "advanced", expected: "advanced", frequency: 5, score: 3 },
];
const PROFILE_COUNT =
  fs
    .readFileSync(
      new URL(
        "../docs/crossfit/data/qa_synthetic_profiles.csv",
        import.meta.url,
      ),
      "utf8",
    )
    .trim()
    .split(/\r?\n/).length - 1;

let sequence = 0;

function syntheticEmail(tag, projectName) {
  const project = projectName.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  sequence += 1;
  return `crossfit-v2-${tag}-${project}-${process.pid}-${sequence}@local.test`;
}

async function api(
  request,
  method,
  path,
  { token = null, data = null, headers = {} } = {},
) {
  const response = await request.fetch(`${QA_GATE.apiBase}${path}`, {
    method,
    headers: {
      ...(data === null ? {} : { "content-type": "application/json" }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(data === null ? {} : { data }),
  });
  let body = {};
  try {
    body = await response.json();
  } catch {
    body = {};
  }
  return { response, body };
}

async function ensureUser(request, email, frequency) {
  const login = await api(request, "POST", "/api/auth/login", {
    data: { email, password: PASSWORD },
  });
  if (login.body.token)
    return { token: login.body.token, userId: login.body.user.id };

  const registration = await api(request, "POST", "/api/auth/register", {
    data: {
      email,
      password: PASSWORD,
      nombre: "CrossFit",
      apellido: "QA",
      edad: 30,
      sexo: "masculino",
      peso: 78,
      altura: 178,
      anosEntrenando: 3,
      nivelActividad: "moderado",
      nivelEntrenamiento: "intermedio",
      frecuenciaSemanal: frequency,
      metodologiaPreferida: "crossfit",
      objetivoPrincipal: "mejorar_resistencia",
      enfoqueEntrenamiento: "hiit",
      limitacionesFisicas: [],
      acceptTerms: true,
    },
  });
  expect(
    registration.response.status(),
    JSON.stringify(registration.body),
  ).toBeLessThan(300);
  expect(registration.body.token).toBeTruthy();
  return { token: registration.body.token, userId: registration.body.user.id };
}

function assessment(score, { trusted = false } = {}) {
  if (score == null) return undefined;
  const dimensions = [
    "technique",
    "strength",
    "aerobic",
    "gymnastics",
    "weightlifting",
    "pacing",
    "volume",
    "recovery",
  ];
  const observedAt = new Date().toISOString();
  return {
    dimension_scores: Object.fromEntries(dimensions.map((key) => [key, score])),
    skill_permissions: trusted ? SKILL_PERMISSIONS : {},
    adherence_rate: 0.9,
    evidence: {
      dimensions: Object.fromEntries(
        dimensions.map((key) => [key, { observed_at: observedAt }]),
      ),
      comparable_sessions: 6,
      comparable_exposures_per_dimension: 3,
      technique_verified: trusted,
      verification_source: trusted ? "professional_review" : "self_report",
      weeks_in_level: 12,
    },
  };
}

async function provisionPlan(request, projectName, levelCase, tag) {
  const email = syntheticEmail(tag, projectName);
  const account = await ensureUser(request, email, levelCase.frequency);
  if (levelCase.level === "advanced") {
    const reviewed = await api(
      request,
      "POST",
      "/api/admin/crossfit-v2/assessments/review",
      {
        headers: {
          "x-admin-token": "crossfit-e2e-admin-ephemeral-only",
          "idempotency-key": `review-${tag}-${account.userId}`,
        },
        data: {
          user_id: account.userId,
          action: "verify",
          request_id: `review-${tag}-${account.userId}`,
          reviewer_reference: "qa-qualified-reviewer-fixture",
          assessment: assessment(levelCase.score, { trusted: true }),
        },
      },
    );
    expect(reviewed.response.status(), JSON.stringify(reviewed.body)).toBe(201);
    expect(reviewed.body.verification_status).toBe("verified");
  }
  const publicAssessment = assessment(levelCase.score);
  const evaluated = await api(
    request,
    "POST",
    "/api/crossfit-specialist/evaluate-profile",
    {
      token: account.token,
      data: {
        schema_version: "crossfit-assessment/v2",
        request_id: `evaluation-${tag}-${account.userId}`,
        crossfitAssessment: publicAssessment,
        check_in: {
          pain: { score: 0, locations: [] },
          red_flag: false,
          acute_injury: false,
        },
      },
    },
  );
  expect(evaluated.response.status(), JSON.stringify(evaluated.body)).toBe(200);
  expect(evaluated.body.evaluation.recommended_level).toBe(levelCase.expected);
  expect(evaluated.body.metadata.assessment_id).toMatch(/^cfx_[a-f0-9]{24}$/);
  const generated = await api(request, "POST", "/api/methodology/generate", {
    token: account.token,
    headers: {
      "x-request-id": `e2e-${tag}-${levelCase.level}`,
      "idempotency-key": `e2e-${tag}-${levelCase.level}`,
    },
    data: {
      mode: "manual",
      methodology: "crossfit",
      selectedLevel: levelCase.level,
      frecuencia_semanal: levelCase.frequency,
      available_minutes: levelCase.level === "advanced" ? 90 : 60,
      available_equipment: FULL_EQUIPMENT,
      crossfit_assessment_id: evaluated.body.metadata.assessment_id,
      crossfitAssessment: publicAssessment,
      startConfig: { startDate: "today" },
      source: "crossfit-v2-e2e",
    },
  });
  expect(
    generated.response.status(),
    JSON.stringify(generated.body),
  ).toBeLessThan(300);
  const planId =
    generated.body.methodology_plan_id ??
    generated.body.planId ??
    generated.body.plan?.methodology_plan_id;
  expect(planId).toBeTruthy();

  const plan = generated.body.plan ?? generated.body;
  const canonical = plan.crossfit_v2 ?? plan.plan?.crossfit_v2;
  expect(canonical?.schema_version).toBe("crossfit-plan/v2");
  expect(canonical?.level).toBe(levelCase.expected);

  const confirmed = await api(request, "POST", "/api/routines/confirm-plan", {
    token: account.token,
    data: { methodology_plan_id: planId },
  });
  expect(confirmed.response.status(), JSON.stringify(confirmed.body)).toBe(200);
  return { email, token: account.token, planId, canonical };
}

async function firstScheduledSession(request, token, planId) {
  const calendar = await api(
    request,
    "GET",
    `/api/routines/calendar-schedule/${planId}`,
    { token },
  );
  expect(calendar.response.status(), JSON.stringify(calendar.body)).toBe(200);
  const weeks = calendar.body.plan?.semanas ?? [];
  const sessions = weeks.flatMap((week) =>
    (week.sesiones ?? []).map((session) => ({
      date: String(session.fecha).slice(0, 10),
      week: week.semana ?? week.numero,
      day: session.dia,
      dayId: session.day_id ?? null,
    })),
  );
  expect(sessions.length).toBeGreaterThan(0);
  return sessions[0];
}

function canonicalSessionFor(canonical, scheduled) {
  const sessions = (canonical?.weeks ?? []).flatMap(
    (week) => week.sessions ?? [],
  );
  expect(sessions.length).toBeGreaterThan(0);
  return (
    sessions.find((session) => session.date === scheduled.date) ?? sessions[0]
  );
}

async function recordRuntimeEvent(
  request,
  token,
  sessionId,
  {
    streamId,
    sequence: clientSequence,
    eventType,
    elapsedSeconds,
    timeCapSeconds,
  },
) {
  const identity = `${streamId}-${clientSequence}`;
  return api(
    request,
    "POST",
    `/api/crossfit-v2/runtime/sessions/${sessionId}/events`,
    {
      token,
      data: {
        schema_version: "crossfit-runtime-event/v2",
        request_id: `runtime-request-${identity}`,
        idempotency_key: `runtime-idempotency-${identity}`,
        stream_id: streamId,
        client_sequence: clientSequence,
        event_type: eventType,
        occurred_at: new Date().toISOString(),
        payload: {
          elapsed_seconds: elapsedSeconds,
          time_cap_seconds: timeCapSeconds,
        },
      },
    },
  );
}

test.describe("CrossFit profesional v2 · stack efímero", () => {
  test.skip(!QA_GATE.enabled, QA_GATE.reason);

  for (const levelCase of LEVEL_CASES) {
    test(`API completa ${levelCase.level}: generar → calendario → cerrar → autorregular`, async ({
      request,
    }, testInfo) => {
      test.skip(
        testInfo.project.name !== "crossfit-v2-desktop",
        "La matriz API se ejecuta una sola vez",
      );
      expect(PROFILE_COUNT).toBe(32);
      const provisioned = await provisionPlan(
        request,
        testInfo.project.name,
        levelCase,
        `api-${levelCase.level}`,
      );
      const scheduled = await firstScheduledSession(
        request,
        provisioned.token,
        provisioned.planId,
      );

      const started = await api(
        request,
        "POST",
        "/api/routines/sessions/start",
        {
          token: provisioned.token,
          data: {
            methodology_plan_id: provisioned.planId,
            session_date: scheduled.date,
            week_number: scheduled.week,
            day_name: scheduled.day,
            day_id: scheduled.dayId,
          },
        },
      );
      expect(
        started.response.status(),
        JSON.stringify(started.body),
      ).toBeLessThan(300);
      const sessionId = started.body.session_id ?? started.body.sessionId;
      expect(sessionId).toBeTruthy();

      const canonicalSession = canonicalSessionFor(
        provisioned.canonical,
        scheduled,
      );
      const timeCapSeconds = canonicalSession.wod.time_cap_seconds;
      const streamId = `e2e_runtime_${levelCase.level}_${sessionId}`;
      const runtimeStarted = await recordRuntimeEvent(
        request,
        provisioned.token,
        sessionId,
        {
          streamId,
          sequence: 0,
          eventType: "timer_started",
          elapsedSeconds: 0,
          timeCapSeconds,
        },
      );
      expect(
        runtimeStarted.response.status(),
        JSON.stringify(runtimeStarted.body),
      ).toBe(201);
      const runtimePaused = await recordRuntimeEvent(
        request,
        provisioned.token,
        sessionId,
        {
          streamId,
          sequence: 1,
          eventType: "timer_paused",
          elapsedSeconds: Math.min(60, timeCapSeconds),
          timeCapSeconds,
        },
      );
      expect(
        runtimePaused.response.status(),
        JSON.stringify(runtimePaused.body),
      ).toBe(201);

      const replayedStart = await recordRuntimeEvent(
        request,
        provisioned.token,
        sessionId,
        {
          streamId,
          sequence: 0,
          eventType: "timer_started",
          elapsedSeconds: 0,
          timeCapSeconds,
        },
      );
      expect(replayedStart.response.status()).toBe(200);
      expect(replayedStart.body.idempotent_replay).toBe(true);

      const injectedSubstitution = await api(
        request,
        "POST",
        `/api/crossfit-v2/runtime/sessions/${sessionId}/events`,
        {
          token: provisioned.token,
          data: {
            schema_version: "crossfit-runtime-event/v2",
            request_id: `runtime-request-injected-${sessionId}`,
            idempotency_key: `runtime-idempotency-injected-${sessionId}`,
            stream_id: streamId,
            client_sequence: 2,
            event_type: "movement_substituted",
            occurred_at: new Date().toISOString(),
            payload: {},
          },
        },
      );
      expect(injectedSubstitution.response.status()).toBe(422);
      expect(injectedSubstitution.body.code).toBe(
        "CROSSFIT_RUNTIME_EVENT_INVALID",
      );

      const progress = await api(
        request,
        "GET",
        `/api/routines/sessions/${sessionId}/progress`,
        {
          token: provisioned.token,
        },
      );
      expect(progress.response.status(), JSON.stringify(progress.body)).toBe(
        200,
      );
      expect(progress.body.exercises?.length).toBeGreaterThan(0);
      for (const movement of progress.body.exercises) {
        const updated = await api(
          request,
          "PUT",
          `/api/routines/sessions/${sessionId}/exercise/${movement.exercise_order}`,
          {
            token: provisioned.token,
            data: {
              series_completed: 1,
              status: "completed",
              time_spent_seconds: 60,
            },
          },
        );
        expect(updated.response.status(), JSON.stringify(updated.body)).toBe(
          200,
        );
      }

      const finished = await api(
        request,
        "POST",
        `/api/routines/sessions/${sessionId}/finish`,
        {
          token: provisioned.token,
        },
      );
      expect(finished.response.status(), JSON.stringify(finished.body)).toBe(
        200,
      );
      expect(finished.body.autoreg?.pendingFeedback).toBe(true);

      const effortPayload = {
        rpe: 7,
        completed: true,
        scale: "rxplus",
        scales: canonicalSession.wod.movements.map((movement) => ({
          movement_id: movement.canonical_movement_id,
          scale_id: "rxplus",
        })),
        technique: 3,
        pain: { score: 0, locations: [], delta: 0 },
        readiness: { sleep: 4, fatigue: 2, recovery: 4, stress: 2 },
        score: { type: "time", elapsed_seconds: 900 },
      };
      const idempotencyKey = `e2e-result-${levelCase.level}-${sessionId}`;
      const effort = await api(
        request,
        "POST",
        `/api/routines/sessions/${sessionId}/effort`,
        {
          token: provisioned.token,
          headers: { "idempotency-key": idempotencyKey },
          data: effortPayload,
        },
      );
      expect(effort.response.status(), JSON.stringify(effort.body)).toBe(200);
      expect(effort.body.registered).toBe(true);
      expect(effort.body.result.scales).toEqual(
        canonicalSession.wod.movements.map((movement) => ({
          movement_id: movement.canonical_movement_id,
          scale_id: "base",
        })),
      );
      expect([
        "baseline",
        "hold",
        "progress_capacity",
        "progress_skill",
        "regress",
        "deload",
        "blocked",
      ]).toContain(effort.body.decision);

      const replay = await api(
        request,
        "POST",
        `/api/routines/sessions/${sessionId}/effort`,
        {
          token: provisioned.token,
          headers: { "idempotency-key": idempotencyKey },
          data: effortPayload,
        },
      );
      expect(replay.response.status(), JSON.stringify(replay.body)).toBe(200);
      expect(replay.body.alreadyRegistered).toBe(true);

      const history = await api(
        request,
        "GET",
        "/api/routines/historical-data",
        {
          token: provisioned.token,
        },
      );
      expect(history.response.status(), JSON.stringify(history.body)).toBe(200);
    });
  }

  test("API cierre parcial: feedback transaccional, replay y colision", async ({
    request,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "crossfit-v2-desktop",
      "El cierre transaccional se ejecuta una sola vez",
    );
    const provisioned = await provisionPlan(
      request,
      testInfo.project.name,
      LEVEL_CASES[0],
      "api-partial",
    );
    const scheduled = await firstScheduledSession(
      request,
      provisioned.token,
      provisioned.planId,
    );
    const started = await api(request, "POST", "/api/routines/sessions/start", {
      token: provisioned.token,
      data: {
        methodology_plan_id: provisioned.planId,
        session_date: scheduled.date,
        week_number: scheduled.week,
        day_name: scheduled.day,
        day_id: scheduled.dayId,
      },
    });
    expect(
      started.response.status(),
      JSON.stringify(started.body),
    ).toBeLessThan(300);
    const sessionId = started.body.session_id ?? started.body.sessionId;
    expect(sessionId).toBeTruthy();

    const idempotencyKey = `e2e-result-partial-${sessionId}`;
    const effortPayload = {
      rpe: 8,
      completed: false,
      technique: 2,
      pain: { score: 0, locations: [], delta: 0 },
      readiness: { sleep: 3, fatigue: 4, recovery: 2, stress: 3 },
      score: { type: "none" },
      status: "partial",
      completion: 0.45,
      termination_reason: "fatigue",
    };
    const effort = await api(
      request,
      "POST",
      `/api/routines/sessions/${sessionId}/effort`,
      {
        token: provisioned.token,
        headers: { "idempotency-key": idempotencyKey },
        data: effortPayload,
      },
    );
    expect(effort.response.status(), JSON.stringify(effort.body)).toBe(200);
    expect(effort.body.result.status).toBe("partial");
    expect(effort.body.result.completion).toBe(0.45);
    expect(effort.body.result.reason_codes).toContain("SESSION_PARTIAL");
    expect(effort.body.result.provenance.termination_reason).toBe("fatigue");

    const progress = await api(
      request,
      "GET",
      `/api/routines/sessions/${sessionId}/progress`,
      { token: provisioned.token },
    );
    expect(progress.response.status(), JSON.stringify(progress.body)).toBe(200);
    expect(progress.body.session.session_status).toBe("partial");
    expect(Number(progress.body.session.completion_rate)).toBe(45);
    expect(progress.body.exercises).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "cancelled" }),
      ]),
    );

    const replay = await api(
      request,
      "POST",
      `/api/routines/sessions/${sessionId}/effort`,
      {
        token: provisioned.token,
        headers: { "idempotency-key": idempotencyKey },
        data: effortPayload,
      },
    );
    expect(replay.response.status(), JSON.stringify(replay.body)).toBe(200);
    expect(replay.body.alreadyRegistered).toBe(true);

    const collision = await api(
      request,
      "POST",
      `/api/routines/sessions/${sessionId}/effort`,
      {
        token: provisioned.token,
        headers: { "idempotency-key": idempotencyKey },
        data: { ...effortPayload, completion: 0.5 },
      },
    );
    expect(collision.response.status(), JSON.stringify(collision.body)).toBe(
      409,
    );
    expect(collision.body.code).toBe("IDEMPOTENCY_BROKEN");
  });

  test("UI evaluacion: ocho dimensiones, clasificacion conservadora y a11y", async ({
    page,
    request,
  }, testInfo) => {
    const email = syntheticEmail("assessment-ui", testInfo.project.name);
    await ensureUser(request, email, 3);
    const now = new Date();
    const nextWednesday = new Date(now);
    nextWednesday.setDate(now.getDate() + ((3 - now.getDay() + 7) % 7));
    nextWednesday.setHours(10, 0, 0, 0);
    await page.clock.setFixedTime(nextWednesday);

    await page.goto(`${QA_GATE.appBase}/login`, {
      waitUntil: "domcontentloaded",
    });
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(PASSWORD);
    await page
      .getByRole("button", { name: "Iniciar Sesión", exact: true })
      .click();
    await page.waitForURL((url) => !url.pathname.includes("login"));
    await page.goto(`${QA_GATE.appBase}/methodologies`, {
      waitUntil: "domcontentloaded",
    });
    await page
      .getByRole("button", { name: "Seleccionar metodología CrossFit" })
      .click();

    const assessmentCard = page.getByTestId("crossfit-v2-assessment");
    await expect(assessmentCard).toBeVisible();
    const dimensions = assessmentCard.locator("fieldset");
    await expect(dimensions).toHaveCount(8);
    for (let index = 0; index < 8; index += 1) {
      await dimensions.nth(index).locator("label").nth(1).click();
    }
    await assessmentCard
      .getByRole("button", { name: "Evaluar nivel y seguridad" })
      .click();
    await expect(
      assessmentCard.getByRole("heading", {
        name: "Principiante",
        exact: true,
      }),
    ).toBeVisible();
    await expect(assessmentCard.getByText(/confianza media/i)).toBeVisible();
    await expect(
      assessmentCard.getByRole("button", {
        name: "Generar bloque principiante",
      }),
    ).toBeVisible();

    const blocking = (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa"])
        .include('[data-testid="crossfit-v2-assessment"]')
        .analyze()
    ).violations.filter((violation) =>
      ["critical", "serious"].includes(violation.impact),
    );
    expect(blocking).toEqual([]);
  });

  test("UI WOD v2: warm-up, escalado seguro, timer, a11y y viewport", async ({
    page,
    request,
  }, testInfo) => {
    const provisioned = await provisionPlan(
      request,
      testInfo.project.name,
      LEVEL_CASES[0],
      "ui",
    );
    await page.goto(`${QA_GATE.appBase}/login`, {
      waitUntil: "domcontentloaded",
    });
    await page.locator('input[name="email"]').fill(provisioned.email);
    await page.locator('input[name="password"]').fill(PASSWORD);
    await page
      .getByRole("button", { name: "Iniciar Sesión", exact: true })
      .click();
    await page.waitForURL((url) => !url.pathname.includes("login"));
    await page.goto(`${QA_GATE.appBase}/routines`, {
      waitUntil: "domcontentloaded",
    });

    await expect(
      page.getByRole("heading", { name: /Entrenamiento de Hoy/i }),
    ).toBeVisible();
    await page
      .getByRole("button", {
        name: /Iniciar Entrenamiento|Reanudar Entrenamiento/i,
      })
      .click();
    await page.getByRole("button", { name: /Saltar calentamiento/i }).click();

    const player = page.getByTestId("crossfit-wod-player");
    await expect(player).toBeVisible();
    await expect(page.getByText("Cronómetro", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Terminar WOD" }),
    ).toBeVisible();
    await expect(page.getByText("Escalado por movimiento")).toBeVisible();
    await expect(
      page.getByText(/No se puede elegir RX\+ manualmente/),
    ).toBeVisible();
    const movementScales = page.getByRole("combobox", { name: /Escala para/i });
    await expect(movementScales).toHaveCount(0);
    await expect(page.getByText("RX+", { exact: true })).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Sustituir" }).first(),
    ).toBeVisible();

    await page.getByRole("button", { name: "Iniciar", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Pausar", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Pausar", exact: true }).click();

    const blocking = (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa"])
        .include('[data-testid="crossfit-wod-player"]')
        .analyze()
    ).violations.filter((violation) =>
      ["critical", "serious"].includes(violation.impact),
    );
    expect(blocking).toEqual([]);

    const viewport = page.viewportSize();
    const box = await player.boundingBox();
    expect(box).toBeTruthy();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);

    await page.getByRole("button", { name: "Finalizar antes" }).click();
    await page.getByRole("button", { name: "Guardar parcial" }).click();
    await expect(
      page.getByRole("heading", { name: "Cierre del WOD" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "8", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "8", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: "Cierre del WOD" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "8", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
  });
});
