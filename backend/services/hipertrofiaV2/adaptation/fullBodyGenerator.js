/**
 * Generador de sesiones Full Body para la fase de adaptación
 *
 * ESPECIFICACIÓN (Doc: Estructura Hipertrofia Principiantes.txt):
 * - Full Body (Novato absoluto): 3 semanas de 5 días
 * - Objetivo: Enseñar patrones motores básicos
 * - Intensidad: 65-70% del 1RM
 * - RIR Objetivo: 3-4
 * - Descansos: 30-60s entre ejercicios
 * - Estructura: Circuito completo: 8 ejercicios x 2-3 vueltas
 */

import { selectExercises } from '../exerciseSelector.js';

// Constantes de configuración Full Body
const FULL_BODY_CONFIG = {
    DEFAULT_WEEKS: 3,           // 3 semanas de adaptación
    DAYS_PER_WEEK: 5,           // 5 días L-V
    INTENSITY: '65-70%',        // Intensidad baja para aprendizaje
    RIR_TARGET: '3-4',          // RIR alto (lejos del fallo)
    REST_SECONDS: 45,           // Promedio 30-60s
    SETS_PER_EXERCISE: 3,       // 2-3 vueltas
    REPS_RANGE: '12-15',        // Reps moderadas
    EXERCISES_COUNT: 8          // 8 ejercicios por circuito
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
 * Genera las sesiones para el bloque Full Body
 * @param {object} dbClient - Cliente de BD
 * @param {number} durationWeeks - Duración en semanas (default: 3)
 * @returns {Promise<Array>} Array de sesiones generadas
 */
export async function generateFullBodySessions(dbClient, durationWeeks = FULL_BODY_CONFIG.DEFAULT_WEEKS) {
    const sessions = [];
    const nivel = 'Principiante';

    // Forzar 3 semanas para Full Body (novato absoluto)
    const weeks = durationWeeks || FULL_BODY_CONFIG.DEFAULT_WEEKS;
    const daysPerWeek = FULL_BODY_CONFIG.DAYS_PER_WEEK;

    console.log(`🏋️ [FULL BODY] Generando ${weeks} semanas × ${daysPerWeek} días = ${weeks * daysPerWeek} sesiones`);

    // Selección de ejercicios (8 ejercicios para circuito completo)
    // Orden: Multiarticulares → Unilaterales → Analíticos
    const exercises = [
        // 1-2: Multiarticulares principales
        ...(await selectExercises(dbClient, { nivel, categoria: 'Pecho', tipo_ejercicio: 'multiarticular', cantidad: 1 })),
        ...(await selectExercises(dbClient, { nivel, categoria: 'Espalda', tipo_ejercicio: 'multiarticular', cantidad: 1 })),
        // 3-4: Piernas (cuádriceps + femoral)
        ...(await selectExercises(dbClient, { nivel, categoria: 'Piernas', tipo_ejercicio: 'multiarticular', cantidad: 1 })),
        ...(await selectExercises(dbClient, { nivel, categoria: 'Piernas', cantidad: 1 })),
        // 5: Hombro
        ...(await selectExercises(dbClient, { nivel, categoria: 'Hombro', cantidad: 1 })),
        // 6-7: Brazos (aislados)
        ...(await selectExercises(dbClient, { nivel, categoria: 'Bíceps', cantidad: 1 })),
        ...(await selectExercises(dbClient, { nivel, categoria: 'Tríceps', cantidad: 1 })),
        // 8: Core
        ...(await selectExercises(dbClient, { nivel, categoria: 'Abdominales', cantidad: 1 }))
    ];

    console.log(`📋 [FULL BODY] Ejercicios seleccionados: ${exercises.length}`);

    // Generar sesiones: 3 semanas × 5 días = 15 sesiones
    for (let week = 1; week <= weeks; week++) {
        for (let day = 1; day <= daysPerWeek; day++) {
            const sessionNumber = (week - 1) * daysPerWeek + day;
            const { dayOfWeek, dayName } = WEEKDAY_MAP[day];

            sessions.push({
                week,
                dayOfWeek,
                dayName,
                sessionNumber,
                name: `Full Body - Semana ${week} - ${dayName}`,
                description: `Circuito de adaptación (Sesión ${sessionNumber}/15): Realiza todos los ejercicios en orden. Mantén RIR 3-4.`,
                config: {
                    intensity: FULL_BODY_CONFIG.INTENSITY,
                    rir_target: FULL_BODY_CONFIG.RIR_TARGET,
                    rest_seconds: FULL_BODY_CONFIG.REST_SECONDS
                },
                exercises: exercises.map((ex, idx) => ({
                    ...ex,
                    orden: idx + 1,
                    series: FULL_BODY_CONFIG.SETS_PER_EXERCISE,
                    reps: FULL_BODY_CONFIG.REPS_RANGE,
                    rir_target: FULL_BODY_CONFIG.RIR_TARGET,
                    descanso_seg: FULL_BODY_CONFIG.REST_SECONDS,
                    notas: `Adaptación: ${FULL_BODY_CONFIG.INTENSITY} intensidad. Mantén RIR ${FULL_BODY_CONFIG.RIR_TARGET}.`
                }))
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
