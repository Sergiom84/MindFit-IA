/**
 * 🩺 Gate de calidad de menús (A-04, HipertrofiaV2 auditoría 2026-07-17).
 *
 * El motor persistía menús con `emergency_balance_override` y errores por comida de
 * hasta el 85% devolviendo HTTP 200, sin señalar la degradación. Este módulo calcula el
 * error relativo por comida y por día contra los macros objetivo, aplica umbrales
 * versionados (menuGenerationConfig.js) y devuelve un veredicto `quality` explícito con
 * reason codes. NO decide la persistencia por sí mismo: marca el menú para que la ruta
 * lo exponga y la UI avise, en vez de darlo por válido en silencio.
 *
 * Es aditivo: consume la `validacion` (achieved) que ya producen los generadores y el
 * target de la fila de comida (parseMealMacros + kcal). No toca menuGenerators.
 *
 * @module nutritionV2/menuQualityGate
 */
import { percentError, parseNumeric } from './baseUtils.js';
import { parseMealMacros } from './mealSelectionHelpers.js';
import { MENU_QUALITY_THRESHOLDS, MENU_QUALITY_GATE_VERSION } from './menuGenerationConfig.js';

const QUALITY_OK = 'ok';
const QUALITY_DEGRADED = 'degraded';

/** Macros objetivo (target) de una fila de comida: {kcal, protein_g, carbs_g, fat_g}. */
export function resolveMealTarget(meal) {
  const macros = parseMealMacros(meal);
  const kcal = parseNumeric(meal?.kcal) ?? Math.round(
    (macros.protein_g * 4) + (macros.carbs_g * 4) + (macros.fat_g * 9)
  );
  return { kcal, protein_g: macros.protein_g, carbs_g: macros.carbs_g, fat_g: macros.fat_g };
}

/** Achieved de una comida a partir de su `validacion`: {kcal, protein_g, carbs_g, fat_g}. */
export function resolveMealAchieved(validacion = {}) {
  const totals = validacion?.macros_totales || {};
  return {
    kcal: parseNumeric(validacion?.kcal_total) ?? 0,
    protein_g: parseNumeric(totals.protein_g) ?? 0,
    carbs_g: parseNumeric(totals.carbs_g) ?? 0,
    fat_g: parseNumeric(totals.fat_g) ?? 0
  };
}

/** Error relativo máximo (%) entre achieved y target sobre kcal + los 3 macros. */
export function maxRelativeError(target, achieved) {
  const keys = ['kcal', 'protein_g', 'carbs_g', 'fat_g'];
  let max = 0;
  const perKey = {};
  for (const k of keys) {
    const e = percentError(achieved[k] ?? 0, target[k] ?? 0);
    perKey[k] = e;
    if (e > max) max = e;
  }
  return { max: Number(max.toFixed(2)), perKey };
}

/**
 * Evalúa la calidad de UNA comida generada.
 * @param {object} params
 * @param {object} params.meal        fila de comida (para el target)
 * @param {object} params.menu        { validacion, ... } del generador
 * @param {object} [params.metadata]  metadata del generador (emergency/fallback)
 * @returns {{status, max_error_pct, threshold_pct, per_macro_error, reasons, gate_version}}
 */
export function evaluateMealQuality({ meal, menu, metadata = {} }) {
  const threshold = MENU_QUALITY_THRESHOLDS.meal_max_error_pct;
  const target = resolveMealTarget(meal);
  const achieved = resolveMealAchieved(menu?.validacion);
  const { max, perKey } = maxRelativeError(target, achieved);

  const reasons = [];
  if (max > threshold) reasons.push('meal_error_exceeds_threshold');
  if (metadata?.emergency_balance_override) reasons.push('emergency_balance_override');
  if (metadata?.fallback_used) reasons.push('fallback_used');
  if (metadata?.target_within_tolerance === false && max > threshold) {
    reasons.push('target_out_of_tolerance');
  }

  const status = reasons.length > 0 ? QUALITY_DEGRADED : QUALITY_OK;
  return {
    status,
    max_error_pct: max,
    threshold_pct: threshold,
    per_macro_error: perKey,
    reasons,
    gate_version: MENU_QUALITY_GATE_VERSION
  };
}

/**
 * Evalúa la calidad de un DÍA completo a partir de los menús generados por comida.
 * Un día se marca `degraded` si: alguna comida falló al generarse, alguna comida supera
 * su umbral, o el error agregado del día (achieved vs target sumados) supera el umbral.
 *
 * @param {Array<{meal_id, meal?, menu?, metadata?, error?}>} generatedMenus
 * @returns {object} veredicto de día con detalle por comida degradada.
 */
export function evaluateDayQuality(generatedMenus = []) {
  const dayThreshold = MENU_QUALITY_THRESHOLDS.day_max_error_pct;
  const sumTarget = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
  const sumAchieved = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
  const degradedMeals = [];
  const failedMeals = [];
  let fallbackCount = 0;

  for (const entry of generatedMenus) {
    if (entry?.error) {
      failedMeals.push({ meal_id: entry.meal_id, error: entry.error });
      continue;
    }
    const meal = entry.meal || {};
    const target = resolveMealTarget(meal);
    const achieved = resolveMealAchieved(entry.menu?.validacion);
    for (const k of Object.keys(sumTarget)) {
      sumTarget[k] += target[k] ?? 0;
      sumAchieved[k] += achieved[k] ?? 0;
    }
    if (entry?.metadata?.fallback_used) fallbackCount += 1;

    const mealQuality = evaluateMealQuality({ meal, menu: entry.menu, metadata: entry.metadata });
    if (mealQuality.status === QUALITY_DEGRADED) {
      degradedMeals.push({
        meal_id: entry.meal_id,
        max_error_pct: mealQuality.max_error_pct,
        reasons: mealQuality.reasons
      });
    }
  }

  const dayError = maxRelativeError(sumTarget, sumAchieved);
  const reasons = [];
  if (failedMeals.length > 0) reasons.push('meal_generation_failed');
  if (degradedMeals.length > 0) reasons.push('meal_below_quality');
  if (dayError.max > dayThreshold) reasons.push('day_error_exceeds_threshold');

  const status = reasons.length > 0 ? QUALITY_DEGRADED : QUALITY_OK;
  return {
    status,
    day_max_error_pct: dayError.max,
    day_per_macro_error: dayError.perKey,
    threshold_pct: dayThreshold,
    meal_threshold_pct: MENU_QUALITY_THRESHOLDS.meal_max_error_pct,
    degraded_meals: degradedMeals,
    failed_meals: failedMeals,
    fallback_count: fallbackCount,
    total_meals: generatedMenus.length,
    reasons,
    gate_version: MENU_QUALITY_GATE_VERSION
  };
}

/** Log estructurado por menú/día (nº fallbacks, error máximo, umbral, versión). */
export function logMenuQuality(scope, quality, extra = {}) {
  const payload = {
    scope,
    status: quality.status,
    gate_version: quality.gate_version,
    ...extra
  };
  if (scope === 'day') {
    payload.day_max_error_pct = quality.day_max_error_pct;
    payload.threshold_pct = quality.threshold_pct;
    payload.fallback_count = quality.fallback_count;
    payload.degraded_meals = quality.degraded_meals?.length ?? 0;
    payload.failed_meals = quality.failed_meals?.length ?? 0;
  } else {
    payload.max_error_pct = quality.max_error_pct;
    payload.threshold_pct = quality.threshold_pct;
    payload.reasons = quality.reasons;
  }
  const emoji = quality.status === QUALITY_DEGRADED ? '⚠️' : '✅';
  console.log(`${emoji} [menu-quality] ${JSON.stringify(payload)}`);
}
