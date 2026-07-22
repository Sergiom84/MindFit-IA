/**
 * 🍽️ Servicio canónico de periodización nutricional diaria
 * (Nutrición Fase 0, doc 04 PR4, spec §11-12).
 *
 * ÚNICA autoridad para repartir el combustible del día según la carga de la sesión.
 * Sustituye de forma ACOTADA a `applyCarbCycling` (que pasa a ser un wrapper deprecated
 * que delega aquí, §11.3). NO recalcula BMR/TDEE/objetivo ni las macros base: esas siguen
 * siendo responsabilidad de `calculateBMRAudit`/`calculateTDEEAudit`/`resolveMacroTargets`
 * (§11.2). Aquí solo se redistribuye carbohidrato↔grasa manteniendo la proteína fija y las
 * kcal del día isocalóricas respecto a la base (la grasa compensa el carbohidrato).
 *
 * Modos (§11.4, variable NUTRITION_LOAD_PERIODIZATION_MODE, default `legacy`):
 *  - `legacy`: reproduce EXACTAMENTE el booleano actual de Nutrición V2 (misma salida que el
 *    antiguo applyCarbCycling). D1 se trata igual que un día de entreno; D0 igual que descanso.
 *  - `shadow`: el servicio calcula el reparto D0/D1/D2 nuevo (para persistir la diferencia en
 *    periodization_context); la ruta sigue sirviendo el resultado legado al usuario.
 *  - `active`: el reparto D0/D1/D2 nuevo es autoritativo (implementado, NO activado por defecto).
 *
 * Política conservadora de Fase 0 (§11.5):
 *  1. Descanso real → D0.
 *  2. Entrenamiento sin metadatos → D1, confianza baja.
 *  3. Carga válida explícita → respetar D0/D1/D2 (classifyDayType sobre el contrato validado).
 *  4. Metadato inválido → D1 + alerta de auditoría, sin error para el usuario (lenient).
 *  5. D2 NUNCA se deriva del nombre de la metodología (classifyDayType usa load_tier/context).
 */
import { FAT_GUARDRAILS } from './macroProfilePhaseResolver.js';
import { validateTrainingLoad, classifyDayType } from './trainingLoad/trainingLoadContract.js';

export const NUTRITION_PERIODIZATION_VERSION = 'nutrition-periodization/v1';

export const PERIODIZATION_MODES = Object.freeze(['legacy', 'shadow', 'active']);

/**
 * Estados reales del contrato de carga persistidos en periodization_context (COR-F0-05).
 * Se calculan desde el resultado de la resolución, NO desde `source`: un contrato con
 * fuente `planned_session_load` puede haberse degradado o ignorado por el gate y NO debe
 * contarse como válido.
 *  - `valid`: contrato training-load/v1 presente y validado sin degradación.
 *  - `degraded`: contrato presente pero incoherente/histórico (lenient lo degradó a D1).
 *  - `boolean_fallback`: sin contrato honrado (entreno derivado del booleano) o contrato
 *    ignorado por el gate de metodología no emisora.
 *  - `no_load`: día de descanso sin contrato que validar.
 */
export const LOAD_CONTRACT_STATUSES = Object.freeze(['valid', 'degraded', 'boolean_fallback', 'no_load']);

/**
 * Multiplicadores de carbohidrato por tipo de día del reparto NUEVO (shadow/active).
 * D0 (descanso) baja carbohidrato; D1 (normal) lo sube igual que el legado (+10%); D2 (alto)
 * lo sube más. La grasa compensa para mantener las kcal del día ≈ base (isocalórico semanal).
 */
const CARB_MULTIPLIER_BY_DAY_TYPE = Object.freeze({ D0: 0.85, D1: 1.10, D2: 1.25 });

// Booleano legado: entreno=+10% carbohidrato, descanso=-15% (idéntico al applyCarbCycling viejo).
const LEGACY_TRAINING_MULTIPLIER = 1.10;
const LEGACY_REST_MULTIPLIER = 0.85;

const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v);
const num = (v, fallback = 0) => (isFiniteNumber(Number(v)) ? Number(v) : fallback);

/** Normaliza el modo a uno soportado; cualquier valor desconocido → `legacy` (rollback seguro). */
export function normalizePeriodizationMode(mode) {
  const raw = String(mode ?? '').trim().toLowerCase();
  return PERIODIZATION_MODES.includes(raw) ? raw : 'legacy';
}

/** Lee el modo GLOBAL desde el entorno (§11.4). Default `legacy`. */
export function getPeriodizationMode() {
  return normalizePeriodizationMode(process.env.NUTRITION_LOAD_PERIODIZATION_MODE);
}

/** Escala un modo un peldaño en el rollout: legacy→shadow, shadow→active, active→active. */
function escalateMode(mode) {
  const m = normalizePeriodizationMode(mode);
  if (m === 'legacy') return 'shadow';
  if (m === 'shadow') return 'active';
  return 'active';
}

/**
 * Parsea la lista de usuarios QA de rollout (§16 PR6, punto 2) desde
 * `NUTRITION_PERIODIZATION_QA_USERS` (csv de user_ids). Ignora vacíos y no numéricos.
 * @returns {Set<number>}
 */
export function getPeriodizationQaUserIds() {
  const raw = String(process.env.NUTRITION_PERIODIZATION_QA_USERS || '');
  const ids = new Set();
  for (const part of raw.split(',')) {
    const n = Number(String(part).trim());
    if (Number.isInteger(n) && n > 0) ids.add(n);
  }
  return ids;
}

/**
 * Resuelve el modo de periodización PARA UN USUARIO concreto (§16 PR6, activación por
 * usuario QA). Un usuario de la lista QA recibe el modo global escalado un peldaño
 * (legacy→shadow, o active si el global ya es shadow); el resto recibe el modo global.
 *
 * Con la configuración por defecto (global `legacy`, sin lista QA) TODOS reciben `legacy`
 * → cero cambio de comportamiento observable. El canary nunca RETROCEDE el modo global:
 * si el global ya es `active`, un usuario QA sigue en `active`.
 * @param {number|string|null} userId
 * @param {{globalMode?: string, qaUsers?: Set<number>}} [opts]
 * @returns {'legacy'|'shadow'|'active'}
 */
export function resolvePeriodizationModeForUser(userId, { globalMode, qaUsers } = {}) {
  const global = normalizePeriodizationMode(globalMode ?? getPeriodizationMode());
  const uid = Number(userId);
  if (!Number.isInteger(uid) || uid <= 0) return global;
  const list = qaUsers instanceof Set ? qaUsers : getPeriodizationQaUserIds();
  if (!list.has(uid)) return global;
  return escalateMode(global);
}

/** Normaliza las macros base a los tres gramos que se redistribuyen. */
function normalizeBaseMacros(baseMacros = {}) {
  return {
    protein_g: Math.round(num(baseMacros.protein_g)),
    carbs_g: Math.round(num(baseMacros.carbs_g)),
    fat_g: Math.round(num(baseMacros.fat_g))
  };
}

/**
 * Punto de extensión §11.6: suelo de carbohidrato de rendimiento por ruleset profesional.
 * En Fase 0 NO se inventa un suelo por metodología: sin `professionalRulePack` validado se
 * conserva el suelo actual del resolver (el mínimo de grasa) y se registra el motivo.
 * @returns {{floor_g: number|null, configured: boolean, reason_code: string}}
 */
export function resolvePerformanceCarbFloor({ weightKg, sessionLoad, objective, professionalRulePack } = {}) {
  void weightKg; void sessionLoad; void objective; // reservados para packs futuros
  if (!professionalRulePack) {
    return { floor_g: null, configured: false, reason_code: 'PERFORMANCE_FLOOR_NOT_CONFIGURED' };
  }
  // Los packs específicos (fuerza, resistencia, competición) se añadirán con cada metodología.
  return { floor_g: null, configured: false, reason_code: 'PERFORMANCE_FLOOR_NOT_CONFIGURED' };
}

/**
 * Resuelve el tipo de día (D0/D1/D2) aplicando la política conservadora §11.5.
 * Acepta:
 *  - `null`/`undefined` o `{ is_training:false }` → D0 (descanso).
 *  - Un contrato `training-load/v1` → validación lenient + classifyDayType.
 *  - `{ is_training:true }` sin contrato → D1 baja confianza (fallback).
 */
function resolveDayType(sessionLoad, { methodologyEmitsLoad = true } = {}) {
  if (!sessionLoad || typeof sessionLoad !== 'object') {
    return { day_type: 'D0', confidence: 'low', reason_codes: ['LOAD_D0'], load_contract_status: 'no_load' };
  }
  if (sessionLoad.is_training === false) {
    return { day_type: 'D0', confidence: 'low', reason_codes: ['LOAD_D0'], load_contract_status: 'no_load' };
  }

  const looksLikeContract =
    sessionLoad.contract_version !== undefined ||
    sessionLoad.load_tier !== undefined ||
    sessionLoad.day_type !== undefined ||
    sessionLoad.provenance !== undefined;

  // §16 PR6 (punto 3): gate por metodología. Si la metodología del plan NO emite carga
  // validada, no se honra el day_type/tier explícito del contrato aunque exista en los
  // metadatos: cae a la política conservadora (descanso→D0, entreno→D1 baja confianza).
  // Esto evita declarar terminada una integración antes de que su fase específica pase.
  // COR-F0-05: un contrato ignorado por el gate NO es válido → boolean_fallback.
  if (looksLikeContract && methodologyEmitsLoad === false) {
    if (sessionLoad.load_tier === 'rest') {
      return {
        day_type: 'D0', confidence: 'low',
        reason_codes: ['LOAD_D0', 'NON_EMITTING_METHODOLOGY'],
        load_contract_status: 'no_load'
      };
    }
    return {
      day_type: 'D1', confidence: 'low',
      reason_codes: ['LOAD_D1', 'NON_EMITTING_METHODOLOGY'],
      load_contract_status: 'boolean_fallback'
    };
  }

  if (looksLikeContract) {
    // lenient: un contrato histórico/incompleto se degrada a D1 baja confianza; nunca rompe nada.
    const result = validateTrainingLoad(sessionLoad, { mode: 'lenient' });
    const load = result.load || sessionLoad;
    const dayType = classifyDayType(load);
    const confidence = load?.provenance?.confidence || (result.degraded ? 'low' : 'medium');
    const reasonCodes = [`LOAD_${dayType}`];
    if (result.degraded) reasonCodes.push('INVALID_LOAD_CONTRACT');
    // COR-F0-05: honesto desde el resultado, no desde la fuente. Un contrato de descanso
    // válido es no_load (no hay carga que enriquecer); un contrato degradado nunca es valid.
    let loadContractStatus;
    if (result.degraded) loadContractStatus = 'degraded';
    else if (dayType === 'D0') loadContractStatus = 'no_load';
    else loadContractStatus = 'valid';
    return { day_type: dayType, confidence, reason_codes: reasonCodes, load_contract_status: loadContractStatus };
  }

  // Entrenamiento sin metadatos: D1 baja confianza (§11.5.2). Booleano, sin contrato real.
  return {
    day_type: 'D1', confidence: 'low',
    reason_codes: ['LOAD_D1', 'LOW_CONFIDENCE_FALLBACK'],
    load_contract_status: 'boolean_fallback'
  };
}

/**
 * Reparto LEGADO (modo legacy): réplica EXACTA del antiguo applyCarbCycling.
 * D0 = descanso (×0.85); D1/D2 = entreno (×1.10). La grasa absorbe el cambio de carbohidrato.
 */
function computeLegacyMacros(base, dayType) {
  const { protein_g, carbs_g, fat_g } = base;
  const baseKcal = protein_g * 4 + carbs_g * 4 + fat_g * 9;
  const isTrainingDay = dayType !== 'D0';
  const carbMultiplier = isTrainingDay ? LEGACY_TRAINING_MULTIPLIER : LEGACY_REST_MULTIPLIER;
  const newCarbs = Math.round(carbs_g * carbMultiplier);
  const remainingFatKcal = Math.max(0, baseKcal - protein_g * 4 - newCarbs * 4);
  const newFat = Math.max(0, Math.round(remainingFatKcal / 9));
  const adjustedKcal = protein_g * 4 + newCarbs * 4 + newFat * 9;
  return { macros: { protein_g, carbs_g: newCarbs, fat_g: newFat, kcal: adjustedKcal }, clamps: [] };
}

/**
 * Reparto NUEVO (modos shadow/active): multiplicador por D0/D1/D2, proteína fija, grasa
 * compensa (isocalórico respecto a la base) y guardarraíl de grasa mínima. Si el suelo de
 * grasa obliga a bajar carbohidrato por debajo del objetivo, queda registrado como clamp.
 */
function computePeriodizedMacros(base, dayType, weightKg, kcalTarget) {
  const { protein_g, carbs_g, fat_g } = base;
  const baseKcal = protein_g * 4 + carbs_g * 4 + fat_g * 9;
  const kcalRef = isFiniteNumber(Number(kcalTarget)) && Number(kcalTarget) > 0 ? Number(kcalTarget) : baseKcal;
  const multiplier = CARB_MULTIPLIER_BY_DAY_TYPE[dayType] ?? 1.0;

  let newCarbs = Math.round(carbs_g * multiplier);
  let remainingFatKcal = Math.max(0, baseKcal - protein_g * 4 - newCarbs * 4);
  let newFat = Math.max(0, Math.round(remainingFatKcal / 9));

  const clamps = [];
  // Suelo de grasa (§11.2.6): mayor de 0.6 g/kg o 20% de las kcal de referencia.
  const fatMin_g = Math.ceil(Math.max(
    Math.max(0, num(weightKg)) * FAT_GUARDRAILS.min_per_kg,
    (kcalRef * FAT_GUARDRAILS.min_percentage) / 9
  ));

  if (newFat < fatMin_g && baseKcal - protein_g * 4 - fatMin_g * 9 >= 0) {
    const carbsForFatMin = Math.max(0, Math.round((baseKcal - protein_g * 4 - fatMin_g * 9) / 4));
    clamps.push({
      macro: 'fat',
      from_g: newFat,
      to_g: fatMin_g,
      carbs_from_g: newCarbs,
      carbs_to_g: carbsForFatMin,
      reason: `Suelo de grasa ${FAT_GUARDRAILS.min_per_kg} g/kg o ${Math.round(FAT_GUARDRAILS.min_percentage * 100)}% kcal`
    });
    newFat = fatMin_g;
    newCarbs = carbsForFatMin;
  }

  const adjustedKcal = protein_g * 4 + newCarbs * 4 + newFat * 9;
  return { macros: { protein_g, carbs_g: newCarbs, fat_g: newFat, kcal: adjustedKcal }, clamps, fat_min_g: fatMin_g };
}

/**
 * Resuelve las macros del día (§11.1).
 *
 * @param {object} args
 * @param {{protein_g:number,carbs_g:number,fat_g:number}} args.baseMacros - Macros base (fuente: resolveMacroTargets).
 * @param {number} [args.kcalTarget] - Objetivo calórico del día (referencia del suelo de grasa).
 * @param {number} [args.weightKg] - Peso para el suelo de grasa por kg.
 * @param {string} [args.objective] - Objetivo/fase (cut/mant/bulk); reservado.
 * @param {string} [args.metabolicProfile] - Perfil metabólico; reservado.
 * @param {object|null} [args.sessionLoad] - Contrato training-load/v1 o `{ is_training }`.
 * @param {object} [args.weeklyContext] - Contexto semanal; reservado.
 * @param {object} [args.bridgeState] - Estado del bridge; NO muta nada en Fase 0.
 * @param {'legacy'|'shadow'|'active'} [args.mode]
 * @param {boolean} [args.methodologyEmitsLoad=true] - Gate §16 PR6: si la metodología del plan
 *   NO emite carga validada, un contrato explícito se ignora y cae a la política conservadora.
 * @returns {{macros:object, day_type:string, policy_version:string, changed:boolean, audit:object}}
 */
export function resolveDayNutritionTargets({
  baseMacros,
  kcalTarget,
  weightKg,
  objective,
  metabolicProfile,
  sessionLoad,
  weeklyContext,
  bridgeState,
  mode,
  methodologyEmitsLoad = true
} = {}) {
  void objective; void metabolicProfile; void weeklyContext; void bridgeState; // reservados Fase 0
  const resolvedMode = normalizePeriodizationMode(mode);
  const base = normalizeBaseMacros(baseMacros);
  const { day_type, confidence, reason_codes, load_contract_status } = resolveDayType(sessionLoad, { methodologyEmitsLoad });
  const reasonCodes = [...reason_codes];

  let macros;
  let clamps = [];

  if (resolvedMode === 'legacy') {
    const out = computeLegacyMacros(base, day_type);
    macros = out.macros;
    clamps = out.clamps;
    reasonCodes.push('LEGACY_CARB_CYCLING');
  } else {
    const out = computePeriodizedMacros(base, day_type, weightKg, kcalTarget);
    macros = out.macros;
    clamps = out.clamps;
    // Punto de extensión del suelo de rendimiento para días exigentes (§11.6).
    if (
      day_type === 'D2' ||
      sessionLoad?.recovery?.double_session_day === true ||
      sessionLoad?.context?.competition === true
    ) {
      const floor = resolvePerformanceCarbFloor({ weightKg, sessionLoad, objective });
      if (floor.reason_code) reasonCodes.push(floor.reason_code);
    }
    if (clamps.length > 0) reasonCodes.push('FAT_FLOOR_CLAMP');
    reasonCodes.push('WEEKLY_ISOCALORIC');
  }

  const changed =
    macros.protein_g !== base.protein_g ||
    macros.carbs_g !== base.carbs_g ||
    macros.fat_g !== base.fat_g;

  return {
    macros,
    day_type,
    // COR-F0-05: estado real del contrato de carga (valid/degraded/boolean_fallback/no_load),
    // derivado del resultado de la resolución, no de la fuente del dato.
    load_contract_status,
    policy_version: NUTRITION_PERIODIZATION_VERSION,
    changed,
    audit: {
      reason_codes: reasonCodes,
      clamps,
      source_confidence: confidence
    }
  };
}
