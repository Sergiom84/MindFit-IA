import { classifyCrossfitLevel } from "../classification/levelModel.js";
import { CrossfitCatalogRepository } from "../catalog/catalogRepository.js";
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
      red_flag: safety.reason_codes.includes("SAFETY_RED_FLAG"),
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
  now = new Date()
} = {}) {
  if (!db?.query || typeof profileLoader !== "function") {
    throw new TypeError("generateCrossfitProductPlan requiere db y profileLoader");
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
  const requestedFrequency = Number(planData.frecuencia_semanal ?? profile.frecuencia_semanal);
  const frequency = rules.frequencies.includes(requestedFrequency)
    ? requestedFrequency
    : rules.recommended_frequency;
  const startDate = resolveCrossfitStartDate(planData, now);
  const revision = Number.isInteger(planData.revision) ? planData.revision : 0;
  const generationBasis = {
    user_id: String(userId),
    classification_id: classification.classification_id,
    level,
    frequency,
    start_date: startDate,
    available_minutes: planData.available_minutes ?? rules.session_minutes.max,
    equipment,
    preferences: planData.selectedDomains ?? planData.preferences ?? [],
    revision,
    ruleset_version: CROSSFIT_VERSIONS.ruleset,
    catalog_version: CROSSFIT_VERSIONS.catalog
  };
  const idempotencyKey = planData.idempotency_key
    ?? stableCrossfitId("idem", generationBasis);
  const requestId = planData.request_id
    ?? stableCrossfitId("req", [idempotencyKey, revision]);
  const existing = await db.query(
    `SELECT id, plan_data
       FROM app.methodology_plans
      WHERE user_id = $1 AND methodology_type = 'CrossFit' AND status = 'draft'
        AND plan_data -> 'crossfit_v2' -> 'generation' ->> 'idempotency_key' = $2
      ORDER BY id DESC
      LIMIT 1`,
    [userId, idempotencyKey]
  );
  if (existing.rowCount > 0) {
    return {
      plan: existing.rows[0].plan_data,
      planId: existing.rows[0].id,
      classification,
      safety,
      idempotentReplay: true
    };
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
    revision
  });
  if (!generated.ok) {
    throw serviceError(
      "CROSSFIT_GENERATION_INVALID",
      "El generador CrossFit v2 no encontró un plan que cumpla las invariantes",
      422,
      { reason_codes: generated.reason_codes ?? [], validation: generated.validation ?? null }
    );
  }
  const objective = planData.goals ?? profile.objetivo_principal ?? "Preparación física general";
  const presentation = presentCrossfitPlanV2(generated.plan, catalog, { objective });
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
  return {
    plan: presentation,
    planId: persisted.rows[0].id,
    classification,
    safety,
    idempotentReplay: false
  };
}
