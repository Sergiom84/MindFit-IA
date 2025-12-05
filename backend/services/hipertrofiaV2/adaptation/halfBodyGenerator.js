/**
 * Generador de sesiones Half Body para la fase de adaptación
 *
 * ESPECIFICACIÓN (Doc: Estructura Hipertrofia Principiantes.txt):
 * - Half Body A/B (Con experiencia previa): 2 semanas (5 días, A/B/A/B/A)
 * - Objetivo: Reacondicionamiento muscular y control técnico
 * - Intensidad: 75-80% del 1RM
 * - RIR Objetivo: 2-3
 * - Descansos: 45-75s entre ejercicios
 * - Estructura: Rutina dividida (Half Body A = Empuje + Extensión)
 */

import { selectExercises } from '../exerciseSelector.js';

// Constantes de configuración Half Body
const HALF_BODY_CONFIG = {
    DEFAULT_WEEKS: 2,           // 2 semanas de adaptación
    DAYS_PER_WEEK: 5,           // 5 días L-V (A/B/A/B/A)
    INTENSITY: '75-80%',        // Intensidad media-alta
    RIR_TARGET: '2-3',          // RIR moderado
    REST_SECONDS: 60,           // Promedio 45-75s
    SETS_PER_EXERCISE: 3,       // 3 series
    REPS_RANGE: '10-12',        // Reps moderadas
    EXERCISES_COUNT: 6          // 6 ejercicios por sesión
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
 * @returns {Promise<Array>} Array de sesiones generadas
 */
export async function generateHalfBodySessions(dbClient, durationWeeks = HALF_BODY_CONFIG.DEFAULT_WEEKS) {
    const sessions = [];
    const nivel = 'Principiante';

    // Forzar 2 semanas para Half Body (con experiencia previa)
    const weeks = durationWeeks || HALF_BODY_CONFIG.DEFAULT_WEEKS;
    const daysPerWeek = HALF_BODY_CONFIG.DAYS_PER_WEEK;

    console.log(`🏋️ [HALF BODY] Generando ${weeks} semanas × ${daysPerWeek} días = ${weeks * daysPerWeek} sesiones`);

    // Selección de ejercicios A (Empuje + Extensión)
    // Pecho, Hombros, Tríceps, Cuádriceps
    const exercisesA = [
        ...(await selectExercises(dbClient, { nivel, categoria: 'Pecho', tipo_ejercicio: 'multiarticular', cantidad: 1 })),
        ...(await selectExercises(dbClient, { nivel, categoria: 'Hombro', tipo_ejercicio: 'multiarticular', cantidad: 1 })),
        ...(await selectExercises(dbClient, { nivel, categoria: 'Piernas', tipo_ejercicio: 'multiarticular', cantidad: 1 })),
        ...(await selectExercises(dbClient, { nivel, categoria: 'Tríceps', cantidad: 1 })),
        ...(await selectExercises(dbClient, { nivel, categoria: 'Pecho', tipo_ejercicio: 'unilateral', cantidad: 1 })),
        ...(await selectExercises(dbClient, { nivel, categoria: 'Piernas', tipo_ejercicio: 'analitico', cantidad: 1 }))
    ];

    // Selección de ejercicios B (Tirón + Flexión)
    // Espalda, Bíceps, Femoral, Glúteo/Core
    const exercisesB = [
        ...(await selectExercises(dbClient, { nivel, categoria: 'Espalda', tipo_ejercicio: 'multiarticular', cantidad: 1 })),
        ...(await selectExercises(dbClient, { nivel, categoria: 'Piernas', cantidad: 1 })),
        ...(await selectExercises(dbClient, { nivel, categoria: 'Bíceps', cantidad: 1 })),
        ...(await selectExercises(dbClient, { nivel, categoria: 'Glúteos', cantidad: 1 })),
        ...(await selectExercises(dbClient, { nivel, categoria: 'Espalda', tipo_ejercicio: 'unilateral', cantidad: 1 })),
        ...(await selectExercises(dbClient, { nivel, categoria: 'Abdominales', cantidad: 1 }))
    ];

    console.log(`📋 [HALF BODY] Ejercicios A: ${exercisesA.length}, B: ${exercisesB.length}`);

    // Generar sesiones: 2 semanas × 5 días = 10 sesiones
    // Rotación A/B/A/B/A por semana
    let totalSessionCounter = 0;
    const totalSessions = weeks * daysPerWeek;

    for (let week = 1; week <= weeks; week++) {
        for (let day = 1; day <= daysPerWeek; day++) {
            totalSessionCounter++;
            const sessionNumber = totalSessionCounter;

            // Rotación A/B: Impar = A, Par = B
            const isSessionA = sessionNumber % 2 !== 0;
            const sessionType = isSessionA ? 'A' : 'B';
            const sessionExercises = isSessionA ? exercisesA : exercisesB;
            const { dayOfWeek, dayName } = WEEKDAY_MAP[day];

            sessions.push({
                week,
                dayOfWeek,
                dayName,
                sessionNumber,
                name: `Half Body ${sessionType} - Semana ${week} - ${dayName}`,
                description: `${isSessionA ? 'Empuje + Extensión' : 'Tirón + Flexión'} (Sesión ${sessionNumber}/${totalSessions})`,
                config: {
                    intensity: HALF_BODY_CONFIG.INTENSITY,
                    rir_target: HALF_BODY_CONFIG.RIR_TARGET,
                    rest_seconds: HALF_BODY_CONFIG.REST_SECONDS,
                    sessionType
                },
                exercises: sessionExercises.map((ex, idx) => ({
                    ...ex,
                    orden: idx + 1,
                    series: HALF_BODY_CONFIG.SETS_PER_EXERCISE,
                    reps: HALF_BODY_CONFIG.REPS_RANGE,
                    rir_target: HALF_BODY_CONFIG.RIR_TARGET,
                    descanso_seg: HALF_BODY_CONFIG.REST_SECONDS,
                    notas: `Adaptación Half Body ${sessionType}: ${HALF_BODY_CONFIG.INTENSITY} intensidad. Control técnico.`
                }))
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
