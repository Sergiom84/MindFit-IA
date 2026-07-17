// Constantes de configuración de la generación de menús de nutrición V2 (ARCH-002).
// Centraliza los límites del generador determinista, la ventana de variedad, el umbral
// de recálculo por swap y los ajustes del modo híbrido/IA. El engine las re-exporta para
// no romper el contrato con las rutas (routes/nutritionV2/menuGeneration.js) que las
// importan desde nutritionV2Engine.js.

export const VALID_MENU_GENERATION_MODES = ['deterministic', 'ai', 'hybrid_ai', 'recipe_examples'];
export const DETERMINISTIC_MAX_TEMPLATE_TRIES = 12;
export const DETERMINISTIC_MAX_RECIPE_TRIES = 40;
export const DETERMINISTIC_COORDINATE_ITERATIONS = 120;
export const DETERMINISTIC_MAX_SLOT_OPTIONS = 8;
export const DETERMINISTIC_MAX_SLOT_COMBINATIONS = 400;
export const DETERMINISTIC_RECENT_FOOD_WINDOW_DAYS = 7;
export const SWAP_MEAL_RECALC_MAX_ERROR = 35;
export const HYBRID_FALLBACK_MODE = 'deterministic';
export const DEFAULT_HYBRID_MODEL = process.env.NUTRITION_HYBRID_MODEL || 'gpt-5.2';

export function parseBooleanEnv(value, defaultValue = false) {
  if (value == null) return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}

export function isHybridAiEnabled() {
  return parseBooleanEnv(process.env.NUTRITION_HYBRID_ENABLED, true);
}

export function getHybridModelName() {
  return String(process.env.NUTRITION_HYBRID_MODEL || DEFAULT_HYBRID_MODEL).trim();
}
