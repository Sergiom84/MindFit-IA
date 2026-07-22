/**
 * Generador de sesiones Half Body para la fase de adaptación (MindFeed v1)
 *
 * ESPECIFICACIÓN:
 * - Half Body A/B (experiencia previa): 2 semanas, 5 días/sem (A/B/A/B/A)
 * - Intensidad: 75-80% 1RM
 * - RIR objetivo: 2-3
 * - Reps: 8-12 (analíticos 12-15)
 * - Descanso: 45-75s entre ejercicios | 2-3min entre vueltas
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

// Constantes de configuración Half Body
const HALF_BODY_CONFIG = {
  DEFAULT_WEEKS: 2,
  DAYS_PER_WEEK: 5,
  INTENSITY: "75-80%",
  RIR_TARGET: "2-3",
  REST_SECONDS: 60,
  REST_BETWEEN_ROUNDS_SECONDS: 150,
  SETS_PER_EXERCISE: 3,
  REPS_RANGE: "8-12",
  REPS_RANGE_ANALITICO: "12-15",
  EXERCISES_COUNT: 6
};

// Mapeo de días de la semana
const WEEKDAY_MAP = {
    1: { dayOfWeek: 1, dayName: 'Lunes' },
    2: { dayOfWeek: 2, dayName: 'Martes' },
    3: { dayOfWeek: 3, dayName: 'Miércoles' },
    4: { dayOfWeek: 4, dayName: 'Jueves' },
    5: { dayOfWeek: 5, dayName: 'Viernes' }
};

/**
 * Genera las sesiones para el bloque Half Body
 * @param {object} dbClient - Cliente de BD
 * @param {number} durationWeeks - Duración en semanas (default: 2)
 * @param {number} penaltyPct - Penalización de intensidad por repetición
 * @returns {Promise<Array>} Array de sesiones generadas
 */
export async function generateHalfBodySessions(dbClient, options = {}) {
  const {
    durationWeeks = HALF_BODY_CONFIG.DEFAULT_WEEKS,
    penaltyPct = 0,
    injuryRules = []
  } = options;

  const sessions = [];
  const nivel = "Principiante";
  const effectiveIntensity = applyPenaltyToIntensityRange(HALF_BODY_CONFIG.INTENSITY, penaltyPct);
  const penaltyNote = penaltyPct > 0
    ? ` Penalización aplicada: -${penaltyPct}% por repetición.`
    : "";

  const weeks = durationWeeks || HALF_BODY_CONFIG.DEFAULT_WEEKS;
  const daysPerWeek = HALF_BODY_CONFIG.DAYS_PER_WEEK;

  console.log(`🏋️ [HALF BODY] Generando ${weeks} semanas × ${daysPerWeek} días = ${weeks * daysPerWeek} sesiones`);

  const exercisesA = [
    ...(await selectExercises(dbClient, { nivel, categoria: "Piernas", tipo_ejercicio: "multiarticular", cantidad: 1, injuryRules })),
    ...(await selectExercises(dbClient, { nivel, categoria: "Pecho", tipo_ejercicio: "multiarticular", cantidad: 1, injuryRules })),
    ...(await selectExercises(dbClient, { nivel, categoria: "Hombro", cantidad: 1, injuryRules })),
    ...(await selectExercises(dbClient, { nivel, categoria: "Piernas", tipo_ejercicio: "analitico", cantidad: 1, injuryRules })),
    ...(await selectExercises(dbClient, { nivel, categoria: "Tríceps", cantidad: 1, injuryRules })),
    ...(await selectExercises(dbClient, { nivel, categoria: "Abdominales", cantidad: 1, injuryRules }))
  ];

  const exercisesB = [
    ...(await selectExercises(dbClient, { nivel, categoria: "Piernas", cantidad: 1, injuryRules })),
    ...(await selectExercises(dbClient, { nivel, categoria: "Espalda", tipo_ejercicio: "multiarticular", cantidad: 1, injuryRules })),
    ...(await selectExercises(dbClient, { nivel, categoria: "Piernas", tipo_ejercicio: "analitico", cantidad: 1, injuryRules })),
    ...(await selectExercises(dbClient, { nivel, categoria: "Hombro", tipo_ejercicio: "analitico", cantidad: 1, injuryRules })),
    ...(await selectExercises(dbClient, { nivel, categoria: "Bíceps", cantidad: 1, injuryRules })),
    ...(await selectExercises(dbClient, { nivel, categoria: "Abdominales", cantidad: 1, injuryRules }))
  ];

  console.log(`📋 [HALF BODY] Ejercicios A: ${exercisesA.length}, B: ${exercisesB.length}`);

  let totalSessionCounter = 0;
  const totalSessions = weeks * daysPerWeek;

  for (let week = 1; week <= weeks; week++) {
    for (let day = 1; day <= daysPerWeek; day++) {
      totalSessionCounter += 1;
      const sessionNumber = totalSessionCounter;

      const isSessionA = day % 2 !== 0;
      const sessionType = isSessionA ? "A" : "B";
      const sessionExercises = isSessionA ? exercisesA : exercisesB;
      const { dayOfWeek, dayName } = WEEKDAY_MAP[day];

      sessions.push({
        week,
        dayOfWeek,
        dayName,
        dayAbbrev: dayName,
        sessionNumber,
        name: `Half Body ${sessionType} - Semana ${week} - ${dayName}`,
        description: `${isSessionA ? "Empuje + Extensión" : "Tirón + Flexión"} (Sesión ${sessionNumber}/${totalSessions}).${penaltyNote}`,
        config: {
          intensity: effectiveIntensity,
          rir_target: HALF_BODY_CONFIG.RIR_TARGET,
          rest_seconds: HALF_BODY_CONFIG.REST_SECONDS,
          rest_between_rounds_seconds: HALF_BODY_CONFIG.REST_BETWEEN_ROUNDS_SECONDS,
          sessionType
        },
        exercises: sessionExercises.map((ex, idx) => {
          const isCore = String(ex.categoria || "").toLowerCase().includes("abdominal");
          const repsRange = isCore
            ? "30-45s"
            : ex.tipo_ejercicio === "analitico"
              ? HALF_BODY_CONFIG.REPS_RANGE_ANALITICO
              : HALF_BODY_CONFIG.REPS_RANGE;
          return {
            ...ex,
            orden: idx + 1,
            series: HALF_BODY_CONFIG.SETS_PER_EXERCISE,
            repeticiones: repsRange,
            rir_target: HALF_BODY_CONFIG.RIR_TARGET,
            descanso_seg: HALF_BODY_CONFIG.REST_SECONDS,
            intensidad: effectiveIntensity,
            notas: `Adaptación Half Body ${sessionType}: ${effectiveIntensity} intensidad. Control técnico.${penaltyNote}`
          };
        })
      });
    }
  }

  console.log(`✅ [HALF BODY] ${sessions.length} sesiones generadas correctamente`);
  return sessions;
}

/**
 * Obtener configuración de Half Body (para uso externo)
 */
export function getHalfBodyConfig() {
  return { ...HALF_BODY_CONFIG };
}
