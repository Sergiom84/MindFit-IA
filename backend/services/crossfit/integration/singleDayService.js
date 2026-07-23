import { persistSingleDaySession } from '../../singleDay/persistSingleDaySession.js';
import { CrossfitCatalogRepository } from '../catalog/catalogRepository.js';
import { crossfitHash, stableCrossfitId } from '../generator/deterministic.js';
import { generateCrossfitPlanV2 } from '../generator/planGenerator.js';
import { getCrossfitProgramRules } from '../programming/programRules.js';
import { evaluateCrossfitSafety } from '../safety/safetyEvaluator.js';
import { CROSSFIT_VERSIONS, normalizeCrossfitLevel } from '../versions.js';
import { buildPlanDayMetadata } from '../../trainingLoad/sessionLoadBuilder.js';
import { loadCrossfitEquipment } from './productPlanService.js';
import { presentCrossfitPlanV2 } from './legacyPresentationAdapter.js';

function asList(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return value == null || value === '' ? [] : [value];
}

function errorWithCode(code, message, status, reasonCodes = []) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  error.reasonCodes = reasonCodes;
  error.reasonCode = reasonCodes[0] ?? null;
  return error;
}

async function defaultProfileLoader(userId) {
  const { getUserFullProfile } = await import('../../routineGeneration/database/userRepository.js');
  return getUserFullProfile(userId);
}

async function loadActiveContext(db, userId) {
  const { rows } = await db.query(
    `SELECT plan_data
       FROM app.methodology_plans
      WHERE user_id = $1 AND methodology_type = 'CrossFit' AND status = 'active'
        AND plan_data ->> 'schema_version' = 'crossfit-plan/v2'
      ORDER BY id DESC
      LIMIT 1`,
    [userId]
  );
  const plan = rows[0]?.plan_data ?? null;
  return {
    level: normalizeCrossfitLevel(plan?.crossfit_v2?.level) ?? 'beginner',
    classification: plan?.crossfit_classification ?? null
  };
}

export async function generateCrossfitSingleDayV2({
  db,
  userId,
  options = {},
  now = new Date(),
  profileLoader = defaultProfileLoader,
  equipmentLoader = loadCrossfitEquipment,
  catalogLoader = null,
  activeContextLoader = loadActiveContext,
  persistence = persistSingleDaySession
} = {}) {
  if (!db?.query || !userId) throw new TypeError('generateCrossfitSingleDayV2 requiere db y userId');
  const profile = await profileLoader(userId);
  const equipment = await equipmentLoader(db, userId, options.equipment ?? []);
  const generationProfile = {
    ...profile,
    available_equipment: equipment,
    known_conditions: [
      ...asList(profile.historial_medico),
      ...asList(profile.limitaciones_fisicas),
      ...asList(profile.lesiones)
    ]
  };
  const checkIn = options.check_in ?? options.checkIn ?? {};
  const safety = evaluateCrossfitSafety({ profile: generationProfile, checkIn, now });
  if (safety.blocked) {
    throw errorWithCode(
      'CROSSFIT_SINGLE_DAY_BLOCKED',
      'No se puede generar un WOD seguro con el screening actual',
      422,
      safety.reason_codes
    );
  }

  const active = await activeContextLoader(db, userId);
  const level = normalizeCrossfitLevel(active?.level) ?? 'beginner';
  const rules = getCrossfitProgramRules(level);
  const catalog = catalogLoader
    ? await catalogLoader()
    : await new CrossfitCatalogRepository(db).listForGeneration({ useV2: true });
  if (!catalog.length) {
    throw errorWithCode('CROSSFIT_CATALOG_UNAVAILABLE', 'Catálogo CrossFit v2 no disponible', 503, ['CATALOG_INACTIVE']);
  }

  const date = now.toISOString().slice(0, 10);
  const generationKey = {
    user_id: String(userId),
    date,
    level,
    focus: options.focusGroup ?? null,
    mode: options.selectionMode ?? 'full_body',
    equipment,
    ruleset_version: CROSSFIT_VERSIONS.ruleset
  };
  const requestHash = crossfitHash(generationKey);
  const purpose = options.isWeekendExtra === false ? 'single_day' : 'weekend_extra';
  const persistenceIdempotencyKey = stableCrossfitId('cfsd', [userId, date, purpose]);
  const generated = generateCrossfitPlanV2({
    request_id: stableCrossfitId('req', generationKey),
    idempotency_key: stableCrossfitId('idem', generationKey),
    user_id: String(userId),
    classification_id: active?.classification?.classification_id ?? stableCrossfitId('cfc', [userId, 'single-day-provisional']),
    seed: crossfitHash(generationKey),
    generated_at: now.toISOString(),
    start_date: date,
    level,
    frequency: rules.recommended_frequency,
    available_minutes: Number(options.available_minutes ?? rules.session_minutes.max),
    catalog,
    profile: generationProfile,
    check_in: checkIn,
    skill_permissions: active?.classification?.skill_permissions ?? {},
    preferences: options.focusGroup ? [options.focusGroup] : []
  });
  if (!generated.ok) {
    throw errorWithCode(
      'CROSSFIT_SINGLE_DAY_INVALID',
      'No se pudo componer un WOD que cumpla las invariantes',
      422,
      generated.reason_codes ?? []
    );
  }

  const presentedPlan = presentCrossfitPlanV2(generated.plan, catalog, {
    objective: 'Sesión adicional segura; no altera el bloque principal'
  });
  const session = presentedPlan.semanas[0].sesiones[0];
  const standalone = session.metadata.persisted_session_metadata.crossfit_v2_session;
  const singleDayPlan = {
    metodologia: 'CrossFit',
    schema_version: 'crossfit-single-day/v2',
    ruleset_version: CROSSFIT_VERSIONS.ruleset,
    catalog_version: CROSSFIT_VERSIONS.catalog,
    nivel: presentedPlan.nivel,
    crossfit_v2_session: standalone,
    generated_from_plan_id: generated.plan.plan_id,
    generation_request_hash: requestHash,
    idempotency_key: persistenceIdempotencyKey,
    decision_trace: generated.plan.decision_trace
  };
  const persistenceResult = await persistence(db, {
    userId,
    nivel: presentedPlan.nivel,
    nivelNormalized: level === 'beginner' ? 'basico' : level === 'intermediate' ? 'intermedio' : 'avanzado',
    methodologyType: 'crossfit',
    exercises: session.ejercicios,
    selectionMode: options.selectionMode ?? 'full_body',
    focusGroup: options.focusGroup ?? null,
    sessionLabel: session.titulo,
    planLabel: 'WOD CrossFit v2 - Hoy',
    isWeekendExtra: options.isWeekendExtra !== false,
    extraSessionMetadata: {
      ...session.metadata.persisted_session_metadata,
      planned_session_load: session.session_load,
      wod: session.wod,
      crossfit_v2_single_day: true,
      crossfit_safety: safety
    },
    planData: singleDayPlan,
    dayId: 1,
    planDayMetadata: buildPlanDayMetadata(session),
    idempotencyKey: persistenceIdempotencyKey,
    requestHash,
    versionType: 'crossfit-session/v2',
    startedAt: null,
    currentDate: now
  });

  return {
    sessionId: persistenceResult.sessionId,
    planId: persistenceResult.planId,
    reused: persistenceResult.reused === true,
    workout: {
      id: persistenceResult.sessionId,
      type: 'crossfit-wod-single-v2',
      nivel: presentedPlan.nivel,
      discipline: 'crossfit',
      schema_version: CROSSFIT_VERSIONS.session,
      crossfit_v2_session: standalone,
      wod: session.wod,
      exercises_count: session.ejercicios.length,
      exercises: session.ejercicios,
      safety: { decision: safety.decision, reason_codes: safety.reason_codes }
    }
  };
}
