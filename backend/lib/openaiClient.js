import OpenAI from 'openai';
import dotenv from 'dotenv';

// Solo cargar dotenv en desarrollo
if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

const clients = {};

const DEFAULT_FALLBACK_ENV_KEY = "OPENAI_API_KEY";
const STRICT_FEATURES = new Set(["nutrition"]);

// Mapeo de features a variables de entorno
const ENV_BY_FEATURE = {
  photo: DEFAULT_FALLBACK_ENV_KEY,
  video: DEFAULT_FALLBACK_ENV_KEY,
  home: DEFAULT_FALLBACK_ENV_KEY,
  methodologie: DEFAULT_FALLBACK_ENV_KEY,
  nutrition: "OPENAI_API_KEY_NUTRITION",
};

export function getFeatureEnvKey(feature) {
  return ENV_BY_FEATURE[feature] || null;
}

export function resolveApiKeyForFeature(feature) {
  const envKey = getFeatureEnvKey(feature);
  if (!envKey) {
    throw new Error(`Feature '${feature}' no reconocido. Features disponibles: ${Object.keys(ENV_BY_FEATURE).join(', ')}`);
  }

  const specificKey = process.env[envKey];
  if (specificKey && specificKey.trim()) {
    return {
      key: specificKey,
      source: envKey,
      fallbackUsed: false
    };
  }

  if (STRICT_FEATURES.has(feature)) {
    return {
      key: null,
      source: envKey,
      fallbackUsed: false,
      strict: true
    };
  }

  const fallbackKey = process.env[DEFAULT_FALLBACK_ENV_KEY];
  if (fallbackKey && fallbackKey.trim()) {
    return {
      key: fallbackKey,
      source: DEFAULT_FALLBACK_ENV_KEY,
      fallbackUsed: envKey !== DEFAULT_FALLBACK_ENV_KEY
    };
  }

  return {
    key: null,
    source: envKey,
    fallbackUsed: false,
    strict: STRICT_FEATURES.has(feature)
  };
}

/**
 * Obtiene (y cachea) un cliente OpenAI por apiKey.
 * @param {string} [apiKey]
 * @returns {OpenAI|null}
 */
export function getOpenAI(apiKey) {
  const key = apiKey || process.env.OPENAI_API_KEY;
  if (!key || key.trim() === '') {
    console.warn('⚠️ OPENAI_API_KEY no está configurada; funciones de IA desactivadas.');
    return null;
  }
  if (clients[key]) return clients[key];
  clients[key] = new OpenAI({ apiKey: key });
  return clients[key];
}

/**
 * Obtiene cliente OpenAI específico por feature
 * NOTA: Todas las features ahora usan la misma OPENAI_API_KEY unificada (2025-01-09)
 * @param {"photo"|"video"|"home"|"methodologie"|"nutrition"} feature - Feature específico
 * @returns {OpenAI} Cliente OpenAI configurado
 */
export function getOpenAIClient(feature) {
  const resolution = resolveApiKeyForFeature(feature);
  if (!resolution.key) {
    const expectedEnv = getFeatureEnvKey(feature);
    if (resolution.strict) {
      throw new Error(`Falta ${expectedEnv}. Para '${feature}' el fallback a ${DEFAULT_FALLBACK_ENV_KEY} está deshabilitado.`);
    }
    throw new Error(`Falta ${expectedEnv} (fallback ${DEFAULT_FALLBACK_ENV_KEY}) en variables de entorno`);
  }

  // Usar caché para evitar crear múltiples instancias
  const key = resolution.key;
  if (clients[key]) {
    console.log(`🔄 Cliente OpenAI reutilizado para feature: ${feature}`);
    return clients[key];
  }

  const fallbackLabel = resolution.fallbackUsed ? " [fallback]" : "";
  console.log(`🆕 Creando cliente OpenAI para feature: ${feature} (${resolution.source})${fallbackLabel}`);
  clients[key] = new OpenAI({ apiKey: key });
  return clients[key];
}

/**
 * Devuelve cliente OpenAI para un módulo definido en config/aiConfigs.
 * Lee su propia variable de entorno (envKey). Si no existe, fallback a OPENAI_API_KEY.
 * @param {object} moduleConfig { envKey }
 */
export function getModuleOpenAI(moduleConfig) {
  if (!moduleConfig) return getOpenAI();
  const { envKey, strictEnvKey = false } = moduleConfig;
  const specificKey = envKey ? process.env[envKey] : undefined;
  if (strictEnvKey && (!specificKey || !specificKey.trim())) {
    throw new Error(`Falta ${envKey}. Fallback deshabilitado para este módulo.`);
  }
  return getOpenAI(specificKey);
}

export function hasAPIKeyForModule(moduleConfig) {
  if (!moduleConfig) return !!process.env.OPENAI_API_KEY;
  const specificKey = process.env[moduleConfig.envKey];
  if (moduleConfig.strictEnvKey) {
    return !!(specificKey && specificKey.trim());
  }
  return !!(specificKey || process.env.OPENAI_API_KEY);
}

/**
 * Verifica que la API key unificada esté configurada
 * ACTUALIZADO: Una sola API key para todos los módulos (2025-01-09)
 * @returns {Object} Estado de configuración de API key unificada
 */
export function validateAPIKeys() {
  const status = {};
  const allFeatures = Object.keys(ENV_BY_FEATURE);

  let allConfigured = true;
  const missing = [];

  allFeatures.forEach(feature => {
    const envKey = ENV_BY_FEATURE[feature];
    const resolution = resolveApiKeyForFeature(feature);
    const isConfigured = !!(resolution.key && resolution.key.trim());
    if (!isConfigured) {
      allConfigured = false;
      missing.push(`${feature}:${envKey}`);
    }

    status[feature] = {
      configured: isConfigured,
      envKey,
      source: resolution.source,
      fallbackUsed: resolution.fallbackUsed,
      keyLength: resolution.key ? resolution.key.length : 0
    };
  });

  return {
    allConfigured,
    missing,
    features: status
  };
}
