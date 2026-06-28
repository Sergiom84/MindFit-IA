/**
 * Servicio de rutinas de gimnasio genéricas
 * @module routineGeneration/methodologies/GymRoutineService
 */

import { pool } from '../../../db.js';
import { logger } from '../logger.js';
import { getUserFullProfile } from '../database/userRepository.js';
import { getRandomByLevel } from '../../exerciseRepository.js';
import {
  parseSeriesReps,
  buildExercisePicker,
  buildTemplates,
  buildSemanas,
  persistPlanDraft,
  buildPlanResult
} from './planEngine.js';

// Niveles (frecuencia/semanas) comunes a gimnasio y funcional.
const GYM_LEVELS = {
  principiante: { name: 'Principiante', sessions_per_week: 3, duration_weeks: 8 },
  intermedio:   { name: 'Intermedio',   sessions_per_week: 4, duration_weeks: 10 },
  avanzado:     { name: 'Avanzado',     sessions_per_week: 5, duration_weeks: 12 }
};

const GYM_COLUMNS = `
  source_exercise_id AS exercise_id,
  nombre, nivel, categoria, patron, patron_movimiento,
  series_reps_objetivo, descanso_seg, tempo, criterio_de_progreso, como_hacerlo
`;

// Clasificadores de categoría → bucket macro.
function muscleBucket(cat) {
  const c = String(cat || '').toLowerCase();
  if (/(pecho|hombro|tr[íi]ceps)/.test(c)) return 'PUSH';
  if (/(espalda|b[íi]ceps|trapecio|dorsal)/.test(c)) return 'PULL';
  if (/(pierna|gl[úu]teo|gemelo|isquio|cu[áa]driceps|lumbar)/.test(c)) return 'LEGS';
  if (/core|abdom/.test(c)) return 'CORE';
  return 'OTROS';
}
function functionalBucket(cat) {
  const c = String(cat || '').toLowerCase();
  if (/empuje/.test(c)) return 'EMPUJE';
  if (/tracci/.test(c)) return 'TRACCION';
  if (/pierna|carga/.test(c)) return 'PIERNAS';
  if (/core/.test(c)) return 'CORE';
  return 'OTROS'; // Pliométrico, Movilidad
}

const GYM_TEMPLATES = {
  3: [
    { nombre: 'Empuje (Push)', plan: [['PUSH', 3], ['CORE', 1]] },
    { nombre: 'Tirón (Pull)', plan: [['PULL', 3], ['CORE', 1]] },
    { nombre: 'Pierna (Legs)', plan: [['LEGS', 3], ['CORE', 1]] }
  ],
  4: [
    { nombre: 'Empuje (Push)', plan: [['PUSH', 3], ['CORE', 1]] },
    { nombre: 'Tirón (Pull)', plan: [['PULL', 3], ['CORE', 1]] },
    { nombre: 'Pierna (Legs)', plan: [['LEGS', 3], ['CORE', 1]] },
    { nombre: 'Cuerpo completo', plan: [['PUSH', 1], ['PULL', 1], ['LEGS', 1], ['CORE', 1]] }
  ],
  5: [
    { nombre: 'Empuje (Push)', plan: [['PUSH', 3], ['CORE', 1]] },
    { nombre: 'Tirón (Pull)', plan: [['PULL', 3], ['CORE', 1]] },
    { nombre: 'Pierna (Legs)', plan: [['LEGS', 3], ['CORE', 1]] },
    { nombre: 'Torso (Upper)', plan: [['PUSH', 2], ['PULL', 2]] },
    { nombre: 'Pierna + Core', plan: [['LEGS', 3], ['CORE', 1]] }
  ]
};

const FUNCTIONAL_TEMPLATES = {
  3: [
    { nombre: 'Empuje + Core', plan: [['EMPUJE', 2], ['CORE', 1], ['OTROS', 1]] },
    { nombre: 'Tracción + Pierna', plan: [['TRACCION', 2], ['PIERNAS', 2]] },
    { nombre: 'Cuerpo completo', plan: [['EMPUJE', 1], ['TRACCION', 1], ['PIERNAS', 1], ['CORE', 1]] }
  ],
  4: [
    { nombre: 'Empuje', plan: [['EMPUJE', 2], ['CORE', 1], ['OTROS', 1]] },
    { nombre: 'Tracción', plan: [['TRACCION', 2], ['CORE', 1], ['OTROS', 1]] },
    { nombre: 'Pierna', plan: [['PIERNAS', 3], ['CORE', 1]] },
    { nombre: 'Cuerpo completo', plan: [['EMPUJE', 1], ['TRACCION', 1], ['PIERNAS', 1], ['CORE', 1]] }
  ],
  5: [
    { nombre: 'Empuje', plan: [['EMPUJE', 2], ['CORE', 1], ['OTROS', 1]] },
    { nombre: 'Tracción', plan: [['TRACCION', 2], ['CORE', 1], ['OTROS', 1]] },
    { nombre: 'Pierna', plan: [['PIERNAS', 3], ['CORE', 1]] },
    { nombre: 'Core & Acondicionamiento', plan: [['CORE', 2], ['OTROS', 2]] },
    { nombre: 'Cuerpo completo', plan: [['EMPUJE', 1], ['TRACCION', 1], ['PIERNAS', 1], ['CORE', 1]] }
  ]
};

function normalizeLevel3(raw) {
  const lvl = String(raw || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (lvl.includes('avanz')) return 'avanzado';
  if (lvl.includes('inter')) return 'intermedio';
  return 'principiante';
}

function toGymExercise(disciplina) {
  return (ex, orden, sessionId) => {
    const { series, reps_objetivo } = parseSeriesReps(ex.series_reps_objetivo);
    return {
      id: `${sessionId}-E${orden}`,
      orden,
      exercise_id: ex.exercise_id,
      nombre: ex.nombre,
      categoria: ex.categoria,
      patron: ex.patron || null,
      patron_movimiento: ex.patron_movimiento || ex.patron || null,
      tipo_ejercicio: disciplina,
      series,
      reps_objetivo,
      series_reps_objetivo: ex.series_reps_objetivo || null,
      descanso_seg: ex.descanso_seg ?? 75,
      tempo: ex.tempo || null,
      como_hacerlo: ex.como_hacerlo || null,
      criterio_de_progreso: ex.criterio_de_progreso || null,
      notas: ''
    };
  };
}

/**
 * Generar rutina de gimnasio / funcional (motor determinista v1).
 *
 * Sirve a las metodologías 'gimnasio' (y 'hipertrofia' por compatibilidad) sobre
 * `app.ejercicios` disciplina='hipertrofia' (split Push/Pull/Legs por grupo
 * muscular) y 'funcional' sobre disciplina='funcional' (split por patrón).
 *
 * @param {string} userId
 * @param {object} routineData - { methodology, selectedLevel, goals, ... }
 */
export async function generateGymRoutine(userId, routineData = {}) {
  const startedAt = Date.now();
  const methodology = String(routineData.methodology || 'gimnasio').toLowerCase();
  const isFunctional = methodology === 'funcional';
  const disciplina = isFunctional ? 'funcional' : 'hipertrofia';

  logger.info(`🏋️ [GYM] Generando rutina '${methodology}' (disciplina=${disciplina}) para usuario ${userId}`);

  // Nivel: explícito del frontend o, si no, el del perfil del usuario.
  let levelRaw = routineData.selectedLevel || routineData.level || routineData.nivel;
  if (!levelRaw) {
    try {
      const profile = await getUserFullProfile(userId);
      levelRaw = profile?.nivel_entrenamiento;
    } catch { /* perfil opcional */ }
  }
  const levelKey = normalizeLevel3(levelRaw);
  const levelConfig = GYM_LEVELS[levelKey];
  const nivelLabel = levelConfig.name;
  const frecuencia = levelConfig.sessions_per_week;
  const totalWeeks = levelConfig.duration_weeks;

  // Cargar ejercicios de la disciplina (nivel acumulativo) y clasificar en buckets.
  const exercises = await getRandomByLevel(pool, {
    disciplina,
    level: levelKey,
    limit: 500,
    columns: GYM_COLUMNS
  });
  if (!exercises || exercises.length === 0) {
    throw new Error(`No se encontraron ejercicios de ${disciplina} para el nivel seleccionado`);
  }

  const bucketFn = isFunctional ? functionalBucket : muscleBucket;
  const poolByBucket = {};
  for (const ex of exercises) (poolByBucket[bucketFn(ex.categoria)] ||= []).push(ex);

  const pick = buildExercisePicker(poolByBucket);
  const templateSet = isFunctional ? FUNCTIONAL_TEMPLATES : GYM_TEMPLATES;
  const templateSpecs = templateSet[frecuencia] || templateSet[3];
  const templates = buildTemplates(templateSpecs, pick, exercises);

  const semanas = buildSemanas({
    templates,
    totalWeeks,
    frecuencia,
    objetivo: routineData.goals || `Rutina de ${methodology} nivel ${nivelLabel}`,
    coachTip: 'Controla la técnica y la cadencia; progresa la carga cuando completes el rango de reps con buena forma.',
    toExercise: toGymExercise(disciplina)
  });

  const plan = {
    metodologia: isFunctional ? 'Funcional' : 'Gimnasio',
    version: isFunctional ? 'funcional_v1' : 'gimnasio_v1',
    nivel: nivelLabel,
    total_weeks: totalWeeks,
    duracion_total_semanas: totalWeeks,
    frecuencia_semanal: frecuencia,
    fecha_inicio: new Date().toISOString(),
    objetivo: routineData.goals || levelConfig.name,
    configuracion: {
      progression_type: 'linear',
      sessions_per_week: frecuencia,
      duration_weeks: totalWeeks,
      disciplina,
      source: `${isFunctional ? 'funcional' : 'gimnasio'}_v1_deterministic`
    },
    semanas
  };

  const methodologyType = isFunctional ? 'Funcional' : 'Gimnasio';
  const planId = await persistPlanDraft(userId, methodologyType, plan);
  logger.info(`✅ [GYM] Plan '${methodology}' generado con ID: ${planId}`);

  return buildPlanResult({
    plan, planId, methodology, startedAt,
    extraMeta: { level: nivelLabel, disciplina, total_exercises_pool: exercises.length }
  });
}

/**
 * Obtener tipos de rutinas de gimnasio disponibles
 * @returns {object} Tipos de rutinas
 */
export function getGymRoutineTypes() {
  return {
    hipertrofia: {
      name: 'Hipertrofia',
      description: 'Enfocado en ganancia de masa muscular',
      typical_rep_range: '8-12',
      rest_time: '60-90s'
    },
    fuerza: {
      name: 'Fuerza',
      description: 'Desarrollo de fuerza máxima',
      typical_rep_range: '3-6',
      rest_time: '3-5min'
    },
    resistencia: {
      name: 'Resistencia Muscular',
      description: 'Mejora de resistencia y condición',
      typical_rep_range: '15-20',
      rest_time: '30-45s'
    },
    general: {
      name: 'Acondicionamiento General',
      description: 'Balance entre fuerza, hipertrofia y resistencia',
      typical_rep_range: '10-15',
      rest_time: '45-60s'
    }
  };
}
