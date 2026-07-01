/**
 * Generador de sesiones Full Body para la fase de adaptación (MindFeed v1)
 *
 * ESPECIFICACIÓN:
 * - Novato absoluto: 1 semana, 4 días/semana (Full Body circuito)
 * - 55+ o readaptación: 3 semanas, 3 días/semana (Full Body circuito)
 * - Intensidad: 65-70% 1RM
 * - RIR objetivo: 3-4
 * - Reps: 10-15
 * - Estructura: 8 ejercicios x 2-3 vueltas
 * - Descanso por edad (entre ejercicios / entre vueltas):
 *   18-35: 30-60s / 2-3min
 *   36-50: 45-90s / 3-4min
 *   51+: 60-120s / 4-5min
 */

import { selectExercises } from '../exerciseSelector.js';

function applyPenaltyToIntensityRange(intensityRange, penaltyPct = 0) {
  const safePenalty = Number(penaltyPct || 0);
  if (!safePenalty) return intensityRange;

  const match = String(intensityRange).match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/);
  if (!match) return intensityRange;

  const low = Number(match[1]);
  const high = Number(match[2]);
  const factor = Math.max(0, 1 - safePenalty / 100);
  const newLow = Math.round(low * factor * 10) / 10;
  const newHigh = Math.round(high * factor * 10) / 10;

  return `${newLow}-${newHigh}%`;
}

const FULL_BODY_CONFIG = {
  INTENSITY: "65-70%",
  RIR_TARGET: "3-4",
  REPS_RANGE: "10-15",
  EXERCISES_COUNT: 8,
  ROUNDS_RANGE: [2, 3],
  DAY_PATTERNS: {
    novato_total: [1, 2, 4, 5], // Lun, Mar, Jue, Vie (4 días)
    readaptacion_mayor: [1, 3, 5] // Lun, Mie, Vie (3 días)
  }
};

const WEEKDAY_MAP = {
  1: { dayOfWeek: 1, dayName: "Lunes" },
  2: { dayOfWeek: 2, dayName: "Martes" },
  3: { dayOfWeek: 3, dayName: "Miércoles" },
  4: { dayOfWeek: 4, dayName: "Jueves" },
  5: { dayOfWeek: 5, dayName: "Viernes" }
};

const pickMidRange = (min, max) => Math.round((min + max) / 2);

const resolveRestConfig = (age) => {
  if (Number.isFinite(age) && age >= 51) {
    return { betweenExercisesSec: pickMidRange(60, 120), betweenRoundsSec: pickMidRange(240, 300) };
  }
  if (Number.isFinite(age) && age >= 36) {
    return { betweenExercisesSec: pickMidRange(45, 90), betweenRoundsSec: pickMidRange(180, 240) };
  }
  return { betweenExercisesSec: pickMidRange(30, 60), betweenRoundsSec: pickMidRange(120, 180) };
};

/**
 * Genera las sesiones para el bloque Full Body
 * @param {object} dbClient - Cliente de BD
 * @param {number} durationWeeks - Duración en semanas (default: 3)
 * @param {number} penaltyPct - Penalización de intensidad por repetición
 * @returns {Promise<Array>} Array de sesiones generadas
 */
export async function generateFullBodySessions(dbClient, options = {}) {
  const {
    durationWeeks = 1,
    dayPattern = FULL_BODY_CONFIG.DAY_PATTERNS.novato_total,
    penaltyPct = 0,
    age = null,
    tag = "novato_total",
    injuryRules = []
  } = options;

  const sessions = [];
  const nivel = "Principiante";
  const effectiveIntensity = applyPenaltyToIntensityRange(FULL_BODY_CONFIG.INTENSITY, penaltyPct);
  const penaltyNote = penaltyPct > 0
    ? ` Penalización aplicada: -${penaltyPct}% por repetición.`
    : "";

  const { betweenExercisesSec, betweenRoundsSec } = resolveRestConfig(age);
  const weeks = durationWeeks;
  const daysPerWeek = Array.isArray(dayPattern) ? dayPattern.length : 0;

  console.log(`🏋️ [FULL BODY] Generando ${weeks} semanas × ${daysPerWeek} días = ${weeks * daysPerWeek} sesiones`);

  const exercises = [
    ...(await selectExercises(dbClient, { nivel, categoria: "Piernas", tipo_ejercicio: "multiarticular", cantidad: 1, injuryRules })),
    ...(await selectExercises(dbClient, { nivel, categoria: "Pecho", tipo_ejercicio: "multiarticular", cantidad: 1, injuryRules })),
    ...(await selectExercises(dbClient, { nivel, categoria: "Espalda", tipo_ejercicio: "multiarticular", cantidad: 1, injuryRules })),
    ...(await selectExercises(dbClient, { nivel, categoria: "Hombro", cantidad: 1, injuryRules })),
    ...(await selectExercises(dbClient, { nivel, categoria: "Piernas", tipo_ejercicio: "analitico", cantidad: 1, injuryRules })),
    ...(await selectExercises(dbClient, { nivel, categoria: "Bíceps", cantidad: 1, injuryRules })),
    ...(await selectExercises(dbClient, { nivel, categoria: "Tríceps", cantidad: 1, injuryRules })),
    ...(await selectExercises(dbClient, { nivel, categoria: "Abdominales", cantidad: 1, injuryRules }))
  ];

  console.log(`📋 [FULL BODY] Ejercicios seleccionados: ${exercises.length}`);

  let sessionCounter = 0;
  for (let week = 1; week <= weeks; week++) {
    for (let idx = 0; idx < dayPattern.length; idx += 1) {
      sessionCounter += 1;
      const day = dayPattern[idx];
      const { dayOfWeek, dayName } = WEEKDAY_MAP[day] || {};
      const rounds = FULL_BODY_CONFIG.ROUNDS_RANGE[(sessionCounter - 1) % FULL_BODY_CONFIG.ROUNDS_RANGE.length];

      sessions.push({
        week,
        dayOfWeek,
        dayName,
        dayAbbrev: dayName,
        sessionNumber: sessionCounter,
        name: `Full Body - Semana ${week} - ${dayName}`,
        description: `Circuito de adaptación (${tag}). ${rounds} vueltas. Mantén RIR ${FULL_BODY_CONFIG.RIR_TARGET}.${penaltyNote}`,
        config: {
          intensity: effectiveIntensity,
          rir_target: FULL_BODY_CONFIG.RIR_TARGET,
          rest_seconds: betweenExercisesSec,
          rest_between_rounds_seconds: betweenRoundsSec,
          rounds,
          tag
        },
        exercises: exercises.map((ex, idxEx) => {
          const isCore = String(ex.categoria || "").toLowerCase().includes("abdominal");
          return {
            ...ex,
            orden: idxEx + 1,
            series: rounds,
            repeticiones: isCore ? "30-45s" : FULL_BODY_CONFIG.REPS_RANGE,
            rir_target: FULL_BODY_CONFIG.RIR_TARGET,
            descanso_seg: betweenExercisesSec,
            intensidad: effectiveIntensity,
            notas: `Adaptación ${tag}: ${effectiveIntensity} intensidad. ${rounds} vueltas. Mantén RIR ${FULL_BODY_CONFIG.RIR_TARGET}.${penaltyNote}`
          };
        })
      });
    }
  }

  console.log(`✅ [FULL BODY] ${sessions.length} sesiones generadas correctamente`);
  return sessions;
}

/**
 * Obtener configuración de Full Body (para uso externo)
 */
export function getFullBodyConfig() {
  return { ...FULL_BODY_CONFIG };
}
