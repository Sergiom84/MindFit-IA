/**
 * Helpers del Bloque de Adaptación - HipertrofiaV2
 *
 * Lógica pura de perfilado y orquestación de sesiones, extraída de
 * routes/adaptationBlock.js para mantener los routers pequeños.
 * No cambia comportamiento respecto a la versión monolítica.
 */

import { generateFullBodySessions } from './fullBodyGenerator.js';
import { generateHalfBodySessions } from './halfBodyGenerator.js';

// Helper: calcular semana actual del bloque de adaptación
export function getWeekBounds(startDate) {
  // startDate es Date
  const start = new Date(startDate);
  const today = new Date();
  const diffDays = Math.floor((today - start) / 86400000);
  const weekNumber = Math.floor(diffDays / 7) + 1;

  const weekStart = new Date(start);
  weekStart.setDate(start.getDate() + (weekNumber - 1) * 7);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  return { weekNumber, weekStart, weekEnd };
}

export const resolveDayPatternForTag = (tag) => {
  if (tag === 'readaptacion_mayor') return [1, 3, 5];
  if (tag === 'novato_total') return [1, 2, 4, 5];
  return [1, 2, 3, 4, 5];
};

// Patrón de días bien espaciado (Lun..Sáb) para una frecuencia dada.
// Coincide con los patrones por tag: 3→[1,3,5] (readaptacion_mayor),
// 4→[1,2,4,5] (novato_total), 5→[1,2,3,4,5] (reacondicionamiento_prev).
export const resolveDayPatternForFrequency = (count) => {
  switch (count) {
    case 2: return [1, 4];
    case 3: return [1, 3, 5];
    case 4: return [1, 2, 4, 5];
    case 5: return [1, 2, 3, 4, 5];
    case 6: return [1, 2, 3, 4, 5, 6];
    default: return [1, 2, 4, 5];
  }
};

// Frecuencia declarada por el usuario, acotada al rango válido del bloque.
const resolveDeclaredFrequency = (user, min, max, fallback) => {
  const raw = user?.frecuencia_semanal ?? user?.frecuenciaSemanal ?? null;
  const numeric = Number(raw);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Math.max(min, Math.min(max, Math.round(numeric)));
};

export const normalizeTrainingYears = (user) => {
  const raw =
    user?.anos_entrenando ??
    user?.años_entrenando ??
    user?.anosEntrenando ??
    user?.añosEntrenando ??
    null;
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : 0;
};

export const resolveAdaptationProfile = (user, requestedBlockType = null) => {
  const age = Number(user?.edad ?? user?.age ?? NaN);
  const nivel = String(user?.nivel_entrenamiento || user?.nivelEntrenamiento || '').toLowerCase();
  const yearsTraining = normalizeTrainingYears(user);

  const isSenior = Number.isFinite(age) && age >= 55;
  const isNovato = yearsTraining === 0 || nivel === 'principiante';

  if (requestedBlockType === 'half_body') {
    const tag = 'reacondicionamiento_prev';
    return {
      blockType: 'half_body',
      aiTag: tag,
      durationWeeks: 2,
      dayPattern: resolveDayPatternForTag(tag),
      sessionsPerWeek: 5,
      age
    };
  }

  if (requestedBlockType === 'full_body') {
    if (isSenior) {
      const tag = 'readaptacion_mayor';
      const days = resolveDeclaredFrequency(user, 2, 3, 3);
      return {
        blockType: 'full_body',
        aiTag: tag,
        durationWeeks: 3,
        dayPattern: resolveDayPatternForFrequency(days),
        sessionsPerWeek: days,
        age
      };
    }

    const tag = 'novato_total';
    // A-03: respeta la frecuencia declarada (la tarjeta promete 3-4 días/sem).
    const days = resolveDeclaredFrequency(user, 3, 4, 4);
    return {
      blockType: 'full_body',
      aiTag: tag,
      durationWeeks: 1,
      dayPattern: resolveDayPatternForFrequency(days),
      sessionsPerWeek: days,
      age
    };
  }

  if (isSenior) {
    const tag = 'readaptacion_mayor';
    const days = resolveDeclaredFrequency(user, 2, 3, 3);
    return {
      blockType: 'full_body',
      aiTag: tag,
      durationWeeks: 3,
      dayPattern: resolveDayPatternForFrequency(days),
      sessionsPerWeek: days,
      age
    };
  }

  if (isNovato) {
    const tag = 'novato_total';
    // A-03: respeta la frecuencia declarada (la tarjeta promete 3-4 días/sem).
    const days = resolveDeclaredFrequency(user, 3, 4, 4);
    return {
      blockType: 'full_body',
      aiTag: tag,
      durationWeeks: 1,
      dayPattern: resolveDayPatternForFrequency(days),
      sessionsPerWeek: days,
      age
    };
  }

  const tag = 'reacondicionamiento_prev';
  return {
    blockType: 'half_body',
    aiTag: tag,
    durationWeeks: 2,
    dayPattern: resolveDayPatternForTag(tag),
    sessionsPerWeek: 5,
    age
  };
};

/**
 * Helper: Generar sesiones de adaptación
 * Delega a los módulos específicos según el tipo de bloque
 */
export async function generateAdaptationSessions(dbClient, options) {
  const {
    blockType,
    durationWeeks,
    penaltyPct = 0,
    dayPattern = null,
    age = null,
    aiTag = null,
    injuryRules = []
  } = options || {};

  console.log(`🏗️ Generando sesiones para bloque ${blockType} (${durationWeeks} semanas) con penalización ${penaltyPct}%`);

  if (blockType === 'full_body') {
    return await generateFullBodySessions(dbClient, {
      durationWeeks,
      dayPattern,
      penaltyPct,
      age,
      tag: aiTag,
      injuryRules
    });
  }
  if (blockType === 'half_body') {
    return await generateHalfBodySessions(dbClient, {
      durationWeeks,
      penaltyPct,
      injuryRules
    });
  }

  return [];
}
