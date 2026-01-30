import { logger } from './logger.js';

const DEFAULT_SCOPE = 'hipertrofia_v2_principiante';

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
  volumeProfiles: {}
};

function resolveScopeForLevel(nivel) {
  if (nivel === 'Principiante') {
    return DEFAULT_SCOPE;
  }

  // Mientras no haya rulesets por nivel, usamos el de principiante como fallback.
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
      volumeProfiles: dbRules.volumeProfiles || {}
    };

    logger.info(`📚 [RULESET] Scope=${scope} cargado`);
    return merged;
  } catch (error) {
    logger.warn('⚠️ [RULESET] No se pudo cargar ruleset desde BD, usando fallback', {
      error: error.message,
      scope
    });
    return { ...DEFAULT_RULESET };
  }
}
