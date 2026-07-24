import crypto from "node:crypto";
import { buildConservativeTrainingLoad } from "../../trainingLoad/trainingLoadContract.js";
import { normalizeCrossfitLevel, CROSSFIT_VERSIONS } from "../versions.js";
import { validateCrossfitPlan, validateCrossfitSession } from "./schemas.js";

function stableLegacyId(prefix, input) {
  const digest = crypto.createHash("sha256").update(JSON.stringify(input ?? null)).digest("hex").slice(0, 20);
  return `legacy-${prefix}-${digest}`;
}

function legacyTrace(scope) {
  return [{
    rule_id: "CF-LEGACY-READ",
    reason_code: "LEVEL_CONFIDENCE_LOW",
    scope,
    action: "read_only_adapter",
    details: { source: "legacy_adapter", confidence: "low" }
  }];
}

export function readCrossfitSession(input, context = {}) {
  if (input?.schema_version === CROSSFIT_VERSIONS.session) {
    const validated = validateCrossfitSession(input);
    return { ...validated, adapted: false, source_version: CROSSFIT_VERSIONS.session };
  }
  if (!input || typeof input !== "object") return { valid: false, adapted: false, errors: ["sesión legacy inválida"] };
  const level = normalizeCrossfitLevel(context.level ?? input.nivel) ?? "beginner";
  const sessionId = input.session_id ?? input.id ?? stableLegacyId("session", input);
  const date = input.date ?? input.fecha ?? context.date ?? null;
  const adapted = {
    schema_version: CROSSFIT_VERSIONS.session,
    ruleset_version: CROSSFIT_VERSIONS.ruleset,
    catalog_version: CROSSFIT_VERSIONS.catalog,
    request_id: context.requestId ?? stableLegacyId("request", input),
    session_id: sessionId,
    plan_id: context.planId ?? input.plan_id ?? stableLegacyId("plan", input),
    day_id: input.day_id ?? stableLegacyId("day", { sessionId, date }),
    user_id: context.userId ?? input.user_id ?? "legacy-unknown-user",
    level,
    status: input.status ?? "planned",
    date,
    session_type: input.session_type ?? "mixed",
    training_load: buildConservativeTrainingLoad({
      methodology_id: "crossfit",
      methodology_level: level === "beginner" ? "principiante" : level === "intermediate" ? "intermedio" : "avanzado",
      session_type: input.session_type ?? "mixed",
      status: input.status === "completed" ? "completed" : "planned"
    }),
    warmup: Array.isArray(input.warmup) ? input.warmup : [],
    blocks: Array.isArray(input.blocks) ? input.blocks : [],
    wod: input.wod ?? null,
    cooldown: Array.isArray(input.cooldown) ? input.cooldown : [],
    decision_trace: legacyTrace("session"),
    provenance: { source: "legacy_adapter", confidence: "low", source_version: input.version ?? "unknown" }
  };
  return { valid: true, adapted: true, source_version: input.version ?? "unknown", value: adapted, errors: [] };
}

export function readCrossfitPlan(input, context = {}) {
  if (input?.schema_version === CROSSFIT_VERSIONS.plan) {
    const validated = validateCrossfitPlan(input);
    return { ...validated, adapted: false, source_version: CROSSFIT_VERSIONS.plan };
  }
  if (!input || typeof input !== "object" || !Array.isArray(input.semanas)) {
    return { valid: false, adapted: false, errors: ["plan legacy CrossFit no reconocido"] };
  }
  const level = normalizeCrossfitLevel(input.nivel) ?? "beginner";
  const planId = context.planId ?? input.plan_id ?? stableLegacyId("plan", input);
  const weeks = input.semanas.map((week, weekIndex) => ({
    week_number: week.numero_semana ?? week.week_number ?? weekIndex + 1,
    target_load: {},
    sessions: (week.sesiones ?? week.sessions ?? []).map((session, sessionIndex) =>
      readCrossfitSession(session, {
        planId,
        userId: context.userId ?? input.user_id,
        level,
        requestId: context.requestId,
        date: session.date ?? session.fecha ?? `legacy-unresolved-${weekIndex + 1}-${sessionIndex + 1}`
      }).value
    )
  }));
  return {
    valid: true,
    adapted: true,
    source_version: input.version ?? "crossfit_v1",
    errors: [],
    value: {
      schema_version: CROSSFIT_VERSIONS.plan,
      ruleset_version: CROSSFIT_VERSIONS.ruleset,
      catalog_version: CROSSFIT_VERSIONS.catalog,
      request_id: context.requestId ?? stableLegacyId("request", input),
      plan_id: planId,
      user_id: context.userId ?? input.user_id ?? "legacy-unknown-user",
      level,
      classification_id: null,
      generation: {
        seed_hash: null,
        revision: 0,
        idempotency_key: null,
        generated_at: input.fecha_inicio ?? null,
        supersedes: null
      },
      block: {
        block_id: stableLegacyId("block", planId),
        week_count: weeks.length,
        phase_by_week: weeks.map(() => "legacy_unknown"),
        quotas: {}
      },
      weeks,
      decision_trace: legacyTrace("plan"),
      provenance: { source: "legacy_adapter", confidence: "low", source_version: input.version ?? "crossfit_v1" }
    }
  };
}
