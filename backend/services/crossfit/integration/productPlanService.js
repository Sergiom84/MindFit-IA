import { classifyCrossfitLevel } from "../classification/levelModel.js";
import { CrossfitCatalogRepository } from "../catalog/catalogRepository.js";
import { validateCrossfitPlan } from "../contracts/schemas.js";
import { generateCrossfitPlanV2 } from "../generator/planGenerator.js";
import { crossfitHash, stableCrossfitId } from "../generator/deterministic.js";
import { getCrossfitProgramRules } from "../programming/programRules.js";
import { evaluateCrossfitSafety } from "../safety/safetyEvaluator.js";
import { CROSSFIT_VERSIONS } from "../versions.js";
import { presentCrossfitPlanV2 } from "./legacyPresentationAdapter.js";

const EQUIPMENT_ALIASES = Object.freeze({
  dumbbells: "dumbbell",
  mancuernas: "dumbbell",
  kettlebells: "kettlebell",
  kettlebell: "kettlebell",
  comba: "jump_rope",
  cuerda: "jump_rope",
  "cuerda de saltar": "jump_rope",
  cajon: "box",
  cajón: "box",
  "barra olimpica": "barbell",
  "barra olímpica": "barbell",
  discos: "bumper_plates",
  remo: "rower",
  bicicleta: "bike",
  "assault bike": "air_bike",
  anillas: "rings",
  "barra de dominadas": "pull_up_bar"
});
const REGENERATION_REASONS = new Set(["too_difficult", "too_easy", "dont_like", "change_focus"]);

function normalizedToken(value) {
  const key = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
  return EQUIPMENT_ALIASES[key] ?? key.replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function asList(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return value == null || value === "" ? [] : [value];
}

function localDateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function resolveCrossfitStartDate(planData = {}, now = new Date()) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(planData.start_date ?? ""))) return planData.start_date;
  const config = planData.startConfig ?? planData.start_config ?? {};
  const local = config.startDateLocal ?? config.start_date_local;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(local ?? ""))) return local;
  const raw = String(config.startDate ?? config.start_date ?? "").trim().toLowerCase();
  if (raw === "today" || raw === "home_training_today") return localDateKey(now);
  if (raw === "next_monday") {
    const next = new Date(now);
    const offset = (8 - next.getDay()) % 7 || 7;
    next.setDate(next.getDate() + offset);
    return localDateKey(next);
  }
  if (raw) {
    const parsed = localDateKey(raw);
    if (parsed) return parsed;
  }
  return localDateKey(now);
}

export function normalizeCrossfitEquipment(values = []) {
  return [...new Set(values.map(normalizedToken).filter(Boolean))].sort();
}

export async function loadCrossfitEquipment(db, userId, requested = []) {
  const { rows } = await db.query(
    `SELECT equipment_type AS value
       FROM app.user_equipment
      WHERE user_id = $1 AND has_equipment = true
     UNION ALL
     SELECT COALESCE(equipment_type, equipment_name) AS value
       FROM app.user_custom_equipment
      WHERE user_id = $1 AND is_available = true`,
    [userId]
  );
  return normalizeCrossfitEquipment([...requested, ...rows.map((row) => row.value)]);
}

function defaultDimensionScores(assessment = {}) {
  return assessment.dimension_scores && typeof assessment.dimension_scores === "object"
    ? assessment.dimension_scores
    : {};
}

function classificationInput(profile, planData, safety, now) {
  const assessment = planData.crossfitAssessment ?? planData.crossfit_assessment ?? {};
  return {
    dimension_scores: defaultDimensionScores(assessment),
    evidence: assessment.evidence ?? {},
    skill_permissions: assessment.skill_permissions ?? {},
    adherence_rate: assessment.adherence_rate ?? 0,
    pause_days: assessment.pause_days ?? profile.pause_days ?? 0,
    current_level: assessment.current_level ?? null,
    years_training: profile.anos_entrenando ?? profile["años_entrenando"] ?? null,
    safety: {
      blocked: safety.blocked,
      red_flag: safety.reason_codes.includes("SAFETY_RED_FLAG") || planData.check_in?.red_flag === true,
      acute_injury: planData.check_in?.acute_injury === true,
      pain_score: planData.check_in?.pain?.score ?? planData.check_in?.pain_score ?? 0
    },
    now
  };
}

function serviceError(code, message, status = 422, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  error.details = details;
  return error;
}

function crossfitCanonicalPlan(planData) {
  const canonical = planData?.crossfit_v2 ?? planData;
  return canonical?.schema_version === CROSSFIT_VERSIONS.plan ? canonical : null;
}

function normalizedRegenerationReasons(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 4) {
    throw serviceError("CROSSFIT_REGENERATION_INVALID", "La regeneración requiere entre uno y cuatro motivos");
  }
  const reasons = [...new Set(value.map((item) => String(item).trim().toLowerCase()))].sort();
  if (reasons.some((reason) => !REGENERATION_REASONS.has(reason))) {
    throw serviceError("CROSSFIT_REGENERATION_INVALID", "La regeneración contiene un motivo no admitido");
  }
  return reasons;
}

function explicitRequestValue(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

async function lockRegenerationSource(db, userId, planData) {
  if (planData.mode !== "regenerate") return null;
  const previousPlanId = Number(planData.previous_plan_id);
  const expectedRevision = Number(planData.expected_revision);
  if (!Number.isInteger(previousPlanId) || previousPlanId <= 0 || !Number.isInteger(expectedRevision) || expectedRevision < 0) {
    throw serviceError("CROSSFIT_REGENERATION_INVALID", "previous_plan_id y expected_revision son obligatorios");
  }
  if (!explicitRequestValue(planData.request_id) || !explicitRequestValue(planData.idempotency_key)) {
    throw serviceError("CROSSFIT_REGENERATION_INVALID", "request_id e idempotency_key explícitos son obligatorios");
  }
  const source = await db.query(
    `SELECT id, status, plan_data
       FROM app.methodology_plans
      WHERE id = $1 AND user_id = $2 AND methodology_type = 'CrossFit'
      FOR UPDATE`,
    [previousPlanId, userId]
  );
  if (!source.rowCount) {
    throw serviceError("CROSSFIT_REGENERATION_SOURCE_NOT_FOUND", "El plan origen no existe o no pertenece al usuario", 404);
  }
  const row = source.rows[0];
  const canonical = crossfitCanonicalPlan(row.plan_data);
  const contract = canonical ? validateCrossfitPlan(canonical) : { valid: false };
  if (!contract.valid) {
    throw serviceError("CROSSFIT_REGENERATION_INVALID", "El plan origen no contiene un contrato CrossFit v2 válido");
  }
  if (canonical.generation.revision !== expectedRevision) {
    throw serviceError("IDEMPOTENCY_BROKEN", "expected_revision no coincide con la revisión persistida", 409, {
      expected_revision: canonical.generation.revision
    });
  }
  if (!["draft", "superseded"].includes(row.status)) {
    throw serviceError("HISTORY_IMMUTABLE", "Solo un draft CrossFit v2 puede regenerarse", 409);
  }
  const sessions = await db.query(
    `SELECT COUNT(*)::int AS session_count
       FROM app.methodology_exercise_sessions
      WHERE methodology_plan_id = $1`,
    [previousPlanId]
  );
  if (Number(sessions.rows[0]?.session_count) > 0) {
    throw serviceError("HISTORY_IMMUTABLE", "Un plan con sesiones materializadas no puede regenerarse", 409);
  }
  return {
    db_plan_id: previousPlanId,
    status: row.status,
    canonical,
    next_revision: expectedRevision + 1,
    reasons: normalizedRegenerationReasons(planData.regeneration_reasons),
    start_date: canonical.weeks[0]?.sessions[0]?.date,
    frequency: canonical.weeks[0]?.sessions.length,
    objective: row.plan_data?.objetivo ?? null
  };
}

function requestHashForGeneration(planData = {}) {
  const { idempotency_key: _idempotencyKey, request_id: _requestId, ...requestPayload } = planData;
  return crossfitHash(requestPayload);
}

async function findPlanByIdempotency(db, userId, idempotencyKey) {
  return db.query(
    `SELECT id, status, plan_data
       FROM app.methodology_plans
      WHERE user_id = $1 AND methodology_type = 'CrossFit'
        AND plan_data -> 'crossfit_v2' -> 'generation' ->> 'idempotency_key' = $2
      ORDER BY id DESC
      LIMIT 1`,
    [userId, idempotencyKey]
  );
}

function replayExistingPlan(existing, requestHash) {
  const row = existing.rows[0];
  const storedHash = row?.plan_data?.configuracion?.generation_request_hash;
  if (!storedHash || storedHash !== requestHash) {
    throw serviceError("IDEMPOTENCY_BROKEN", "La idempotency_key ya existe con otra entrada", 409);
  }
  return {
    plan: row.plan_data,
    planId: row.id,
    classification: row.plan_data.crossfit_classification ?? null,
    safety: row.plan_data.crossfit_safety ?? null,
    idempotentReplay: true
  };
}

function levelToLegacy(level) {
  return level === "beginner" ? "basico" : level === "intermediate" ? "intermedio" : "avanzado";
}

export async function generateCrossfitProductPlan({
  userId,
  planData = {},
  db,
  profileLoader,
  catalogLoader = null,
  equipmentLoader = loadCrossfitEquipment,
  now = new Date(),
  transactionActive = false
} = {}) {
  if (!db?.query || typeof profileLoader !== "function") {
    throw new TypeError("generateCrossfitProductPlan requiere db y profileLoader");
  }
  if (planData.mode === "regenerate" && !transactionActive && typeof db.connect === "function") {
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const result = await generateCrossfitProductPlan({
        userId,
        planData,
        db: client,
        profileLoader,
        catalogLoader,
        equipmentLoader,
        now,
        transactionActive: true
      });
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  const regeneration = await lockRegenerationSource(db, userId, planData);
  const requestHash = requestHashForGeneration(planData);
  const explicitIdempotencyKey = explicitRequestValue(planData.idempotency_key);
  if (explicitIdempotencyKey) {
    const existing = await findPlanByIdempotency(db, userId, explicitIdempotencyKey);
    if (existing.rowCount > 0) return replayExistingPlan(existing, requestHash);
  }
  const profile = await profileLoader(userId);
  const equipment = await equipmentLoader(db, userId, planData.available_equipment ?? []);
  const generationProfile = {
    ...profile,
    available_equipment: equipment,
    known_conditions: [
      ...asList(profile.historial_medico),
      ...asList(profile.limitaciones_fisicas),
      ...asList(profile.lesiones)
    ]
  };
  const checkIn = planData.check_in ?? {};
  const safety = evaluateCrossfitSafety({ profile: generationProfile, checkIn, now });
  const classification = classifyCrossfitLevel(classificationInput(generationProfile, planData, safety, now));
  if (classification.status === "blocked" || safety.blocked) {
    throw serviceError(
      "CROSSFIT_GENERATION_BLOCKED",
      "No se puede generar una sesión CrossFit segura con el screening actual",
      422,
      { reason_codes: [...new Set([...classification.reason_codes, ...safety.reason_codes])] }
    );
  }

  const level = classification.global_level;
  const rules = getCrossfitProgramRules(level);
  const frequencyInput = planData.frecuencia_semanal ?? regeneration?.frequency ?? profile.frecuencia_semanal;
  const requestedFrequency = frequencyInput == null || frequencyInput === ""
    ? rules.recommended_frequency
    : Number(frequencyInput);
  if (!Number.isInteger(requestedFrequency) || !rules.frequencies.includes(requestedFrequency)) {
    throw serviceError(
      "FREQUENCY_UNSUPPORTED",
      `La frecuencia ${frequencyInput} no es compatible con el nivel ${level}`,
      422,
      { level, supported_frequencies: [...rules.frequencies] }
    );
  }
  const frequency = requestedFrequency;
  const startDate = regeneration?.start_date ?? resolveCrossfitStartDate(planData, now);
  const revision = regeneration?.next_revision ?? (Number.isInteger(planData.revision) ? planData.revision : 0);
  const assessmentId = planData.crossfitAssessmentId ?? planData.crossfit_assessment_id ?? null;
  const generationBasis = {
    user_id: String(userId),
    classification_id: classification.classification_id,
    assessment_id: assessmentId,
    level,
    frequency,
    start_date: startDate,
    available_minutes: planData.available_minutes ?? rules.session_minutes.max,
    equipment,
    preferences: planData.selectedDomains ?? planData.preferences ?? [],
    regeneration_reasons: regeneration?.reasons ?? [],
    supersedes: regeneration?.canonical.plan_id ?? null,
    safety_decision: safety.decision,
    safety_reason_codes: safety.reason_codes,
    revision,
    ruleset_version: CROSSFIT_VERSIONS.ruleset,
    catalog_version: CROSSFIT_VERSIONS.catalog
  };
  const idempotencyKey = explicitIdempotencyKey
    ?? stableCrossfitId("idem", generationBasis);
  const requestId = explicitRequestValue(planData.request_id)
    ?? stableCrossfitId("req", [idempotencyKey, revision]);
  if (!explicitIdempotencyKey) {
    const existing = await findPlanByIdempotency(db, userId, idempotencyKey);
    if (existing.rowCount > 0) return replayExistingPlan(existing, requestHash);
  }
  if (regeneration?.status === "superseded") {
    throw serviceError("HISTORY_IMMUTABLE", "La revisión origen ya fue superseded por otra petición", 409);
  }

  const catalog = catalogLoader
    ? await catalogLoader()
    : await new CrossfitCatalogRepository(db).listForGeneration({ useV2: true });
  if (!catalog.length) {
    throw serviceError("CROSSFIT_CATALOG_UNAVAILABLE", "Catálogo CrossFit v2 activo no disponible", 503);
  }
  const generatedAt = now.toISOString();
  const generated = generateCrossfitPlanV2({
    ...generationBasis,
    request_id: requestId,
    idempotency_key: idempotencyKey,
    seed: planData.seed ?? crossfitHash(generationBasis),
    generated_at: generatedAt,
    catalog,
    profile: generationProfile,
    check_in: checkIn,
    skill_permissions: classification.skill_permissions,
    return_protocol: classification.return_protocol,
    history_ids: planData.history_ids ?? [],
    preferences: generationBasis.preferences,
    revision,
    supersedes: regeneration?.canonical.plan_id ?? null
  });
  if (!generated.ok) {
    throw serviceError(
      "CROSSFIT_GENERATION_INVALID",
      "El generador CrossFit v2 no encontró un plan que cumpla las invariantes",
      422,
      { reason_codes: generated.reason_codes ?? [], validation: generated.validation ?? null }
    );
  }
  if (regeneration) {
    generated.plan.decision_trace.push({
      rule_id: "CF-GEN-REGEN",
      reason_code: "PLAN_REGENERATED",
      scope: "plan",
      action: "create_immutable_revision",
      details: {
        previous_plan_id: regeneration.canonical.plan_id,
        previous_revision: regeneration.canonical.generation.revision,
        reasons: regeneration.reasons
      }
    });
  }
  const finalContract = validateCrossfitPlan(generated.plan);
  if (!finalContract.valid) {
    throw serviceError(
      "CROSSFIT_GENERATION_INVALID",
      "La revisión CrossFit v2 no cumple el contrato después de añadir su trazabilidad",
      422,
      { validation: finalContract.errors }
    );
  }
  const objective = planData.goals
    ?? regeneration?.objective
    ?? profile.objetivo_principal
    ?? "Preparación física general";
  const presentation = presentCrossfitPlanV2(generated.plan, catalog, { objective });
  presentation.configuracion.generation_request_hash = requestHash;
  presentation.configuracion.regeneration = regeneration ? {
    previous_db_plan_id: regeneration.db_plan_id,
    previous_plan_id: regeneration.canonical.plan_id,
    reasons: regeneration.reasons
  } : null;
  presentation.crossfit_assessment_id = assessmentId;
  presentation.crossfit_classification = classification;
  presentation.crossfit_safety = {
    safety_version: safety.safety_version,
    decision: safety.decision,
    reason_codes: safety.reason_codes,
    matched_rule_ids: safety.matched_rule_ids
  };

  const persisted = await db.query(
    `INSERT INTO app.methodology_plans (
       user_id, methodology_type, nivel, plan_data, generation_mode, status,
       version_type, custom_weeks, total_days, created_at
     ) VALUES ($1, 'CrossFit', $2, $3::jsonb, 'manual', 'draft', $4, $5, $6, NOW())
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [
      userId,
      levelToLegacy(level),
      JSON.stringify(presentation),
      CROSSFIT_VERSIONS.plan,
      generated.plan.block.week_count,
      generated.plan.block.week_count * 7
    ]
  );
  if (!persisted.rowCount) {
    const concurrent = await findPlanByIdempotency(db, userId, idempotencyKey);
    if (!concurrent.rowCount) {
      throw serviceError("IDEMPOTENCY_BROKEN", "No se pudo resolver la colisión de generación", 409);
    }
    return replayExistingPlan(concurrent, requestHash);
  }
  if (regeneration) {
    const superseded = await db.query(
      `UPDATE app.methodology_plans
          SET status = 'superseded', updated_at = NOW()
        WHERE id = $1 AND user_id = $2 AND status = 'draft'
        RETURNING id`,
      [regeneration.db_plan_id, userId]
    );
    if (superseded.rowCount !== 1) {
      throw serviceError("HISTORY_IMMUTABLE", "La revisión origen cambió durante la regeneración", 409);
    }
  }
  return {
    plan: presentation,
    planId: persisted.rows[0].id,
    classification,
    safety,
    idempotentReplay: false
  };
}
