import { getCrossfitFeatureFlags } from "../featureFlags.js";
import { getCrossfitProgramRules } from "../programming/programRules.js";
import { evaluateCrossfitSafety } from "../safety/safetyEvaluator.js";
import { CROSSFIT_LEVELS, CROSSFIT_VERSIONS } from "../versions.js";
import {
  CROSSFIT_CLASSIFICATION_DIMENSIONS,
  classifyCrossfitLevel
} from "./levelModel.js";

export const CROSSFIT_ASSESSMENT_VERSION = "crossfit-assessment/v2";
export const CROSSFIT_ASSESSMENT_CAPABILITIES_VERSION = "crossfit-assessment-capabilities/v2";

const DIMENSION_LABELS = Object.freeze({
  technique: "Tecnica por patron",
  strength: "Fuerza submaxima",
  aerobic: "Capacidad aerobica",
  gymnastics: "Gimnasia",
  weightlifting: "Halterofilia",
  pacing: "Pacing",
  volume: "Tolerancia a volumen",
  recovery: "Recuperacion"
});

const ALLOWED_ASSESSMENT_KEYS = new Set([
  "dimension_scores",
  "evidence",
  "skill_permissions",
  "adherence_rate",
  "pause_days",
  "current_level",
  "years_training"
]);
const ALLOWED_EVIDENCE_KEYS = new Set([
  "version",
  "dimensions",
  "comparable_sessions",
  "comparable_exposures_per_dimension",
  "weeks_in_level",
  "technique_verified",
  "verification_source"
]);
const ALLOWED_CHECK_IN_KEYS = new Set([
  "red_flags",
  "red_flag",
  "acute_injury",
  "pain",
  "pain_score",
  "pain_delta",
  "pain_quality",
  "pain_locations",
  "technique",
  "technique_score",
  "warmup_rpe",
  "sleep",
  "fatigue",
  "recovery",
  "readiness"
]);

function serviceError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.status = 422;
  error.details = details;
  return error;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function rejectUnknownKeys(value, allowed, path) {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) {
    throw serviceError("CROSSFIT_ASSESSMENT_INVALID", `${path} contiene campos no admitidos`, {
      path,
      unknown
    });
  }
}

function finiteNumber(value, path, { min, max, integer = false } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || integer && !Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw serviceError("CROSSFIT_ASSESSMENT_INVALID", `${path} esta fuera de rango`, {
      path,
      min,
      max
    });
  }
  return parsed;
}

function observedAt(value, path) {
  const date = new Date(value);
  if (!value || !Number.isFinite(date.getTime())) {
    throw serviceError("CROSSFIT_ASSESSMENT_INVALID", `${path} debe ser una fecha ISO valida`, { path });
  }
  return date.toISOString();
}

function profileForSafety(profile = {}) {
  return {
    ...profile,
    known_conditions: [
      profile.historial_medico,
      profile.limitaciones_fisicas,
      profile.lesiones
    ].filter(Boolean)
  };
}

function sanitizeCheckIn(checkIn = {}) {
  if (!isPlainObject(checkIn)) {
    throw serviceError("CROSSFIT_ASSESSMENT_INVALID", "check_in debe ser un objeto");
  }
  rejectUnknownKeys(checkIn, ALLOWED_CHECK_IN_KEYS, "check_in");
  if (checkIn.red_flags !== undefined && (
    !Array.isArray(checkIn.red_flags) || checkIn.red_flags.some((item) => typeof item !== "string")
  )) {
    throw serviceError("CROSSFIT_ASSESSMENT_INVALID", "check_in.red_flags debe ser una lista de textos");
  }
  if (checkIn.red_flag !== undefined && typeof checkIn.red_flag !== "boolean") {
    throw serviceError("CROSSFIT_ASSESSMENT_INVALID", "check_in.red_flag debe ser booleano");
  }
  if (checkIn.acute_injury !== undefined && typeof checkIn.acute_injury !== "boolean") {
    throw serviceError("CROSSFIT_ASSESSMENT_INVALID", "check_in.acute_injury debe ser booleano");
  }
  if (checkIn.pain !== undefined) {
    if (!isPlainObject(checkIn.pain)) {
      throw serviceError("CROSSFIT_ASSESSMENT_INVALID", "check_in.pain debe ser un objeto");
    }
    rejectUnknownKeys(checkIn.pain, new Set(["score", "delta", "quality", "locations"]), "check_in.pain");
    if (checkIn.pain.score !== undefined) {
      finiteNumber(checkIn.pain.score, "check_in.pain.score", { min: 0, max: 10 });
    }
    if (checkIn.pain.locations !== undefined && (
      !Array.isArray(checkIn.pain.locations)
      || checkIn.pain.locations.some((item) => typeof item !== "string")
    )) {
      throw serviceError("CROSSFIT_ASSESSMENT_INVALID", "check_in.pain.locations debe ser una lista de textos");
    }
  }
  return { ...checkIn };
}

export function getCrossfitAssessmentCapabilities(env = process.env) {
  const flags = getCrossfitFeatureFlags(env);
  return {
    success: true,
    schema_version: CROSSFIT_ASSESSMENT_CAPABILITIES_VERSION,
    methodology_id: "crossfit",
    public_name: "Acondicionamiento funcional de alta intensidad",
    enabled: flags.generation,
    assessment_schema_version: CROSSFIT_ASSESSMENT_VERSION,
    level_model_version: CROSSFIT_VERSIONS.levelModel,
    dimensions: CROSSFIT_CLASSIFICATION_DIMENSIONS.map((id) => ({
      id,
      label: DIMENSION_LABELS[id],
      minimum: 0,
      maximum: 3,
      unknown_value: 0
    })),
    levels: CROSSFIT_LEVELS.map((id) => ({
      id,
      frequencies: [...getCrossfitProgramRules(id).frequencies]
    })),
    constraints: {
      elite_in_product: false,
      scale_is_not_level: true,
      self_report_max_confidence: "medium",
      advanced_requires_verified_technique: true,
      pain_or_red_flags_precede_performance: true
    }
  };
}

export function getCrossfitAssessmentRequiredResponse(now = new Date()) {
  return {
    success: true,
    schema_version: "crossfit-assessment-required/v2",
    evaluation: {
      recommended_level: "principiante",
      confidence: 0,
      confidence_label: "low",
      status: "assessment_required",
      reasoning: "Falta la evaluacion multidimensional CrossFit v2; se aplica principiante provisional.",
      key_indicators: [],
      suggested_focus_areas: [],
      safety_considerations: ["Completa el screening v2 antes de aumentar complejidad o intensidad."],
      contraindicated_movements: [],
      benchmark_targets: {},
      assessment_required: true
    },
    metadata: {
      evaluated_at: now.toISOString(),
      level_model_version: CROSSFIT_VERSIONS.levelModel,
      legacy_read_compatibility: true
    }
  };
}

export function sanitizePublicCrossfitAssessment(assessment, { now = new Date() } = {}) {
  if (!isPlainObject(assessment)) {
    throw serviceError("CROSSFIT_ASSESSMENT_INVALID", "crossfitAssessment debe ser un objeto");
  }
  rejectUnknownKeys(assessment, ALLOWED_ASSESSMENT_KEYS, "crossfitAssessment");

  if (!isPlainObject(assessment.dimension_scores)) {
    throw serviceError("CROSSFIT_ASSESSMENT_INVALID", "dimension_scores debe ser un objeto");
  }
  rejectUnknownKeys(
    assessment.dimension_scores,
    new Set(CROSSFIT_CLASSIFICATION_DIMENSIONS),
    "crossfitAssessment.dimension_scores"
  );
  const dimensionScores = Object.fromEntries(
    CROSSFIT_CLASSIFICATION_DIMENSIONS.map((dimension) => [
      dimension,
      finiteNumber(assessment.dimension_scores[dimension], `dimension_scores.${dimension}`, {
        min: 0,
        max: 3,
        integer: true
      })
    ])
  );

  const evidence = assessment.evidence ?? {};
  if (!isPlainObject(evidence)) {
    throw serviceError("CROSSFIT_ASSESSMENT_INVALID", "evidence debe ser un objeto");
  }
  rejectUnknownKeys(evidence, ALLOWED_EVIDENCE_KEYS, "crossfitAssessment.evidence");
  if (evidence.technique_verified === true) {
    throw serviceError(
      "CROSSFIT_ASSESSMENT_UNTRUSTED_EVIDENCE",
      "La tecnica verificada solo puede proceder de evidencia validada por el servidor"
    );
  }

  const evidenceDimensions = evidence.dimensions ?? {};
  if (!isPlainObject(evidenceDimensions)) {
    throw serviceError("CROSSFIT_ASSESSMENT_INVALID", "evidence.dimensions debe ser un objeto");
  }
  rejectUnknownKeys(
    evidenceDimensions,
    new Set(CROSSFIT_CLASSIFICATION_DIMENSIONS),
    "crossfitAssessment.evidence.dimensions"
  );
  const fallbackObservedAt = now.toISOString();
  const dimensions = Object.fromEntries(
    CROSSFIT_CLASSIFICATION_DIMENSIONS.map((dimension) => {
      const item = evidenceDimensions[dimension];
      if (item !== undefined && !isPlainObject(item)) {
        throw serviceError("CROSSFIT_ASSESSMENT_INVALID", `evidence.dimensions.${dimension} debe ser un objeto`);
      }
      if (item) rejectUnknownKeys(item, new Set(["observed_at", "test_ids"]), `evidence.dimensions.${dimension}`);
      const testIds = item?.test_ids;
      if (testIds !== undefined && (!Array.isArray(testIds) || testIds.some((id) => typeof id !== "string"))) {
        throw serviceError("CROSSFIT_ASSESSMENT_INVALID", `evidence.dimensions.${dimension}.test_ids no es valido`);
      }
      return [dimension, {
        observed_at: observedAt(item?.observed_at ?? fallbackObservedAt, `evidence.dimensions.${dimension}.observed_at`),
        test_ids: testIds ?? []
      }];
    })
  );

  const requestedPermissions = assessment.skill_permissions ?? {};
  if (!isPlainObject(requestedPermissions)) {
    throw serviceError("CROSSFIT_ASSESSMENT_INVALID", "skill_permissions debe ser un objeto");
  }
  if (Object.values(requestedPermissions).some((value) => value === true)) {
    throw serviceError(
      "CROSSFIT_ASSESSMENT_UNTRUSTED_EVIDENCE",
      "Los permisos de skills no pueden autodeclararse desde el cliente"
    );
  }

  return {
    dimension_scores: dimensionScores,
    evidence: {
      version: CROSSFIT_ASSESSMENT_VERSION,
      dimensions,
      comparable_sessions: finiteNumber(evidence.comparable_sessions ?? 0, "evidence.comparable_sessions", {
        min: 0,
        max: 1000,
        integer: true
      }),
      comparable_exposures_per_dimension: finiteNumber(
        evidence.comparable_exposures_per_dimension ?? 0,
        "evidence.comparable_exposures_per_dimension",
        { min: 0, max: 100, integer: true }
      ),
      weeks_in_level: finiteNumber(evidence.weeks_in_level ?? 0, "evidence.weeks_in_level", {
        min: 0,
        max: 520,
        integer: true
      }),
      technique_verified: false,
      verification_source: "self_report"
    },
    skill_permissions: Object.fromEntries(
      Object.keys(requestedPermissions).map((key) => [key, false])
    ),
    adherence_rate: finiteNumber(assessment.adherence_rate ?? 0, "adherence_rate", {
      min: 0,
      max: 1
    }),
    pause_days: finiteNumber(assessment.pause_days ?? 0, "pause_days", {
      min: 0,
      max: 3650,
      integer: true
    }),
    current_level: assessment.current_level == null ? null : String(assessment.current_level),
    years_training: assessment.years_training == null
      ? null
      : finiteNumber(assessment.years_training, "years_training", { min: 0, max: 80 })
  };
}

export function sanitizeTrustedCrossfitAssessment(assessment, { now = new Date() } = {}) {
  if (!isPlainObject(assessment?.evidence) || assessment.evidence.technique_verified !== true) {
    throw serviceError(
      "CROSSFIT_ASSESSMENT_VERIFICATION_REQUIRED",
      "La revision profesional debe verificar tecnica explicitamente"
    );
  }
  const permissions = assessment.skill_permissions ?? {};
  if (!isPlainObject(permissions) || Object.entries(permissions).some(([key, value]) => (
    !/^[a-z0-9_]+$/.test(key) || typeof value !== "boolean"
  ))) {
    throw serviceError("CROSSFIT_ASSESSMENT_INVALID", "skill_permissions verificados no son validos");
  }
  const normalized = sanitizePublicCrossfitAssessment({
    ...assessment,
    evidence: { ...assessment.evidence, technique_verified: false },
    skill_permissions: Object.fromEntries(Object.keys(permissions).map((key) => [key, false]))
  }, { now });
  return {
    ...normalized,
    evidence: {
      ...normalized.evidence,
      technique_verified: true,
      verification_source: "professional_review"
    },
    skill_permissions: { ...permissions }
  };
}

export function normalizeCrossfitAssessmentRequest(body = {}, options = {}) {
  if (!isPlainObject(body)) {
    throw serviceError("CROSSFIT_ASSESSMENT_INVALID", "El payload debe ser un objeto");
  }
  const allowed = new Set([
    "schema_version",
    "request_id",
    "crossfitAssessment",
    "crossfit_assessment",
    "check_in"
  ]);
  rejectUnknownKeys(body, allowed, "assessment_request");
  if (body.schema_version !== CROSSFIT_ASSESSMENT_VERSION) {
    throw serviceError(
      "CROSSFIT_ASSESSMENT_VERSION_UNSUPPORTED",
      `schema_version debe ser ${CROSSFIT_ASSESSMENT_VERSION}`
    );
  }
  if (typeof body.request_id !== "string" || body.request_id.trim().length < 8) {
    throw serviceError("CROSSFIT_ASSESSMENT_INVALID", "request_id es obligatorio");
  }
  return {
    schema_version: CROSSFIT_ASSESSMENT_VERSION,
    request_id: body.request_id,
    crossfitAssessment: sanitizePublicCrossfitAssessment(
      body.crossfitAssessment ?? body.crossfit_assessment,
      options
    ),
    check_in: sanitizeCheckIn(body.check_in ?? {})
  };
}

function evaluateNormalizedAssessment({
  profile,
  assessment,
  checkIn,
  requestId,
  evidenceSource,
  now
}) {
  const safety = evaluateCrossfitSafety({
    profile: profileForSafety(profile),
    checkIn,
    now
  });
  const painScore = Number(checkIn?.pain?.score ?? checkIn?.pain_score ?? 0);
  const classification = classifyCrossfitLevel({
    ...assessment,
    years_training: assessment.years_training ?? profile.anos_entrenando ?? null,
    safety: {
      blocked: safety.blocked,
      red_flag: safety.reason_codes.includes("SAFETY_RED_FLAG") || checkIn.red_flag === true,
      acute_injury: checkIn.acute_injury === true,
      pain_score: painScore
    },
    now
  });
  return {
    success: true,
    schema_version: "crossfit-assessment-result/v2",
    request_id: requestId,
    evaluation: {
      recommended_level: classification.global_level,
      confidence: classification.confidence,
      status: classification.status,
      decision: classification.decision ?? null,
      classification,
      safety,
      requires_verified_technique_for_advanced: true
    },
    metadata: {
      evaluated_at: now.toISOString(),
      level_model_version: CROSSFIT_VERSIONS.levelModel,
      evidence_source: evidenceSource
    }
  };
}

export function evaluatePublicCrossfitAssessment({ profile = {}, body = {}, now = new Date() } = {}) {
  const request = normalizeCrossfitAssessmentRequest(body, { now });
  return evaluateNormalizedAssessment({
    profile,
    assessment: request.crossfitAssessment,
    checkIn: request.check_in,
    requestId: request.request_id,
    evidenceSource: "self_report",
    now
  });
}

export function evaluateTrustedCrossfitAssessment({
  profile = {},
  assessment,
  checkIn = {},
  requestId = null,
  now = new Date()
} = {}) {
  return evaluateNormalizedAssessment({
    profile,
    assessment: sanitizeTrustedCrossfitAssessment(assessment, { now }),
    checkIn: sanitizeCheckIn(checkIn),
    requestId,
    evidenceSource: "professional_review",
    now
  });
}
