import { logger } from './logger.js';

const DEFAULT_SCOPE = 'hipertrofia_v2_principiante';

// Scope de ruleset por nivel (A-02). Antes los tres niveles usaban el de
// principiante; ahora cada uno carga su propio ruleset sembrado en BD.
const SCOPE_BY_LEVEL = {
  Principiante: 'hipertrofia_v2_principiante',
  Intermedio: 'hipertrofia_v2_intermedio',
  Avanzado: 'hipertrofia_v2_avanzado'
};

const DEFAULT_RULESET = {
  restSecondsByType: {
    multiarticular: 90,
    unilateral: 60,
    analitico: 50
  },
  deloadRules: {
    deloadWeeks: [6],
    loadFactor: 0.7,
    volumeFactor: 0.5
  },
  priorityRules: {
    nonPriority: {
      heavyDayPercent: 76,
      lightDayPercent: 70
    }
  },
  overlapRules: {
    partialAdjustmentFactor: 0.975,
    highAdjustmentFactor: 0.95
  },
  // RIR objetivo por defecto; los rulesets por nivel lo endurecen
  // (Intermedio 1-2, Avanzado 0-2).
  rirTarget: '2-3',
  volumeProfiles: {}
};

/**
 * Resuelve el scope de ruleset para un nivel. Normaliza el nivel para tolerar
 * mayúsculas/acentos y cae en el de principiante si no reconoce el valor.
 */
export function resolveScopeForLevel(nivel) {
  const key = String(nivel || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  if (key.startsWith('interm')) return SCOPE_BY_LEVEL.Intermedio;
  if (key.startsWith('avanz')) return SCOPE_BY_LEVEL.Avanzado;
  return DEFAULT_SCOPE;
}

export async function loadMindfeedRuleset(dbClient, nivel) {
  const scope = resolveScopeForLevel(nivel);

  try {
    const result = await dbClient.query(
      'SELECT app.get_active_mindfeed_ruleset($1) AS rules',
      [scope]
    );

    const dbRules = result.rows[0]?.rules || {};
    const merged = {
      ...DEFAULT_RULESET,
      ...dbRules,
      restSecondsByType: {
        ...DEFAULT_RULESET.restSecondsByType,
        ...(dbRules.restSecondsByType || {})
      },
      deloadRules: {
        ...DEFAULT_RULESET.deloadRules,
        ...(dbRules.deloadRules || {})
      },
      priorityRules: {
        ...DEFAULT_RULESET.priorityRules,
        ...(dbRules.priorityRules || {})
      },
      overlapRules: {
        ...DEFAULT_RULESET.overlapRules,
        ...(dbRules.overlapRules || {})
      },
      rirTarget: dbRules.rirTarget || DEFAULT_RULESET.rirTarget,
      volumeProfiles: dbRules.volumeProfiles || {},
      // Scope efectivamente cargado, para trazabilidad en el plan (evita el
      // ruleset_scope hardcodeado que antes marcaba siempre "principiante").
      _scope: scope
    };

    logger.info(`📚 [RULESET] Scope=${scope} cargado (RIR=${merged.rirTarget})`);
    return merged;
  } catch (error) {
    logger.warn('⚠️ [RULESET] No se pudo cargar ruleset desde BD, usando fallback', {
      error: error.message,
      scope
    });
    return { ...DEFAULT_RULESET, _scope: scope };
  }
}
