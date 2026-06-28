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

// Niveles (frecuencia/semanas) comunes al motor determinista estándar.
const GYM_LEVELS = {
  principiante: { name: 'Principiante', sessions_per_week: 3, duration_weeks: 8 },
  intermedio:   { name: 'Intermedio',   sessions_per_week: 4, duration_weeks: 10 },
  avanzado:     { name: 'Avanzado',     sessions_per_week: 5, duration_weeks: 12 }
};

const GYM_COLUMNS = `
  source_exercise_id AS exercise_id,
  nombre, nivel, categoria, patron, patron_movimiento,
  series_reps_objetivo, descanso_seg, tempo, criterio_de_progreso, como_hacerlo, notas, extra
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
function casaBucket(cat) {
  const c = String(cat || '').toLowerCase();
  if (/fuerza/.test(c)) return 'FUERZA';
  if (/cardio|hiit/.test(c)) return 'CARDIO';
  if (/movilidad/.test(c)) return 'MOVILIDAD';
  if (/funcional/.test(c)) return 'FUNCIONAL';
  return 'OTROS';
}
function powerliftingBucket(cat) {
  const c = String(cat || '').toLowerCase();
  if (/sentadilla/.test(c)) return 'SQUAT';
  if (/banca|press/.test(c)) return 'BENCH';
  if (/peso muerto/.test(c)) return 'DEADLIFT';
  if (/inferior/.test(c)) return 'ASSIST_LOWER';
  if (/superior/.test(c)) return 'ASSIST_UPPER';
  return 'OTROS';
}
function halterofiliaBucket(cat) {
  const c = String(cat || '').toLowerCase();
  if (/snatch/.test(c)) return 'SNATCH';
  if (/clean|jerk/.test(c)) return 'CLEAN_JERK';
  if (/fuerza/.test(c)) return 'STRENGTH';
  if (/tecnica|técnica/.test(c)) return 'TECHNIQUE';
  if (/accesorio/.test(c)) return 'ACCESSORY';
  return 'OTROS';
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

const CASA_TEMPLATES = {
  3: [
    { nombre: 'Funcional + Fuerza', plan: [['FUNCIONAL', 2], ['FUERZA', 1], ['MOVILIDAD', 1]] },
    { nombre: 'Cardio + Core', plan: [['CARDIO', 2], ['FUNCIONAL', 1], ['MOVILIDAD', 1]] },
    { nombre: 'Full body en casa', plan: [['FUERZA', 2], ['FUNCIONAL', 1], ['CARDIO', 1]] }
  ],
  4: [
    { nombre: 'Fuerza en casa', plan: [['FUERZA', 3], ['MOVILIDAD', 1]] },
    { nombre: 'HIIT controlado', plan: [['CARDIO', 2], ['FUNCIONAL', 1], ['MOVILIDAD', 1]] },
    { nombre: 'Funcional', plan: [['FUNCIONAL', 3], ['MOVILIDAD', 1]] },
    { nombre: 'Full body', plan: [['FUERZA', 1], ['FUNCIONAL', 1], ['CARDIO', 1], ['MOVILIDAD', 1]] }
  ],
  5: [
    { nombre: 'Fuerza inferior', plan: [['FUERZA', 3], ['MOVILIDAD', 1]] },
    { nombre: 'Cardio técnico', plan: [['CARDIO', 3], ['MOVILIDAD', 1]] },
    { nombre: 'Funcional', plan: [['FUNCIONAL', 3], ['MOVILIDAD', 1]] },
    { nombre: 'Movilidad + Core', plan: [['MOVILIDAD', 2], ['FUNCIONAL', 2]] },
    { nombre: 'Full body', plan: [['FUERZA', 1], ['FUNCIONAL', 1], ['CARDIO', 1], ['MOVILIDAD', 1]] }
  ]
};

const POWERLIFTING_TEMPLATES = {
  3: [
    { nombre: 'Sentadilla + asistencia', plan: [['SQUAT', 2], ['ASSIST_LOWER', 1], ['ASSIST_UPPER', 1]] },
    { nombre: 'Press banca + espalda', plan: [['BENCH', 2], ['ASSIST_UPPER', 2]] },
    { nombre: 'Peso muerto + posterior', plan: [['DEADLIFT', 2], ['ASSIST_LOWER', 2]] }
  ],
  4: [
    { nombre: 'Sentadilla', plan: [['SQUAT', 2], ['ASSIST_LOWER', 2]] },
    { nombre: 'Press banca', plan: [['BENCH', 2], ['ASSIST_UPPER', 2]] },
    { nombre: 'Peso muerto', plan: [['DEADLIFT', 2], ['ASSIST_LOWER', 2]] },
    { nombre: 'Banca volumen + asistencia', plan: [['BENCH', 1], ['ASSIST_UPPER', 2], ['ASSIST_LOWER', 1]] }
  ],
  5: [
    { nombre: 'Sentadilla pesado', plan: [['SQUAT', 2], ['ASSIST_LOWER', 2]] },
    { nombre: 'Banca pesado', plan: [['BENCH', 2], ['ASSIST_UPPER', 2]] },
    { nombre: 'Peso muerto pesado', plan: [['DEADLIFT', 2], ['ASSIST_LOWER', 2]] },
    { nombre: 'Banca técnica', plan: [['BENCH', 2], ['ASSIST_UPPER', 2]] },
    { nombre: 'Volumen general', plan: [['SQUAT', 1], ['BENCH', 1], ['DEADLIFT', 1], ['ASSIST_UPPER', 1]] }
  ]
};

const HALTEROFILIA_TEMPLATES = {
  3: [
    { nombre: 'Snatch + fuerza', plan: [['SNATCH', 2], ['TECHNIQUE', 1], ['STRENGTH', 1]] },
    { nombre: 'Clean & Jerk + técnica', plan: [['CLEAN_JERK', 2], ['TECHNIQUE', 1], ['ACCESSORY', 1]] },
    { nombre: 'Fuerza base', plan: [['STRENGTH', 2], ['SNATCH', 1], ['CLEAN_JERK', 1]] }
  ],
  4: [
    { nombre: 'Snatch técnico', plan: [['SNATCH', 2], ['TECHNIQUE', 2]] },
    { nombre: 'Clean & Jerk técnico', plan: [['CLEAN_JERK', 2], ['TECHNIQUE', 1], ['ACCESSORY', 1]] },
    { nombre: 'Fuerza base', plan: [['STRENGTH', 3], ['ACCESSORY', 1]] },
    { nombre: 'Complejos olímpicos', plan: [['SNATCH', 1], ['CLEAN_JERK', 1], ['TECHNIQUE', 1], ['STRENGTH', 1]] }
  ],
  5: [
    { nombre: 'Snatch', plan: [['SNATCH', 3], ['TECHNIQUE', 1]] },
    { nombre: 'Clean & Jerk', plan: [['CLEAN_JERK', 3], ['TECHNIQUE', 1]] },
    { nombre: 'Squat + pulls', plan: [['STRENGTH', 3], ['ACCESSORY', 1]] },
    { nombre: 'Técnica velocidad', plan: [['TECHNIQUE', 2], ['SNATCH', 1], ['CLEAN_JERK', 1]] },
    { nombre: 'Potencia total', plan: [['SNATCH', 1], ['CLEAN_JERK', 1], ['STRENGTH', 2]] }
  ]
};

const METHOD_CONFIGS = {
  hipertrofia: {
    disciplina: 'hipertrofia',
    methodologyType: 'Hipertrofia',
    displayName: 'Hipertrofia',
    version: 'hipertrofia_v1',
    templates: GYM_TEMPLATES,
    bucketFn: muscleBucket,
    coachTip: 'Controla la técnica y progresa la carga cuando completes el rango de reps con buena forma.'
  },
  gimnasio: {
    disciplina: 'hipertrofia',
    methodologyType: 'Gimnasio',
    displayName: 'Gimnasio',
    version: 'gimnasio_v1',
    templates: GYM_TEMPLATES,
    bucketFn: muscleBucket,
    coachTip: 'Controla la técnica y la cadencia; progresa la carga cuando completes el rango de reps con buena forma.'
  },
  funcional: {
    disciplina: 'funcional',
    methodologyType: 'Funcional',
    displayName: 'Funcional',
    version: 'funcional_v1',
    templates: FUNCTIONAL_TEMPLATES,
    bucketFn: functionalBucket,
    coachTip: 'Prioriza patrones limpios, estabilidad y control antes de subir la intensidad.'
  },
  casa: {
    disciplina: 'casa',
    methodologyType: 'Entrenamiento en Casa',
    displayName: 'Entrenamiento en Casa',
    version: 'casa_v1',
    templates: CASA_TEMPLATES,
    bucketFn: casaBucket,
    coachTip: 'Ajusta el ritmo al espacio disponible y deja margen técnico en cada serie.'
  },
  'heavy-duty': {
    disciplina: 'heavy_duty',
    methodologyType: 'Heavy Duty',
    displayName: 'Heavy Duty',
    version: 'heavy_duty_v1',
    templates: GYM_TEMPLATES,
    bucketFn: muscleBucket,
    coachTip: 'Trabaja con pocas series efectivas, máxima calidad técnica y recuperación suficiente.'
  },
  powerlifting: {
    disciplina: 'powerlifting',
    methodologyType: 'Powerlifting',
    displayName: 'Powerlifting',
    version: 'powerlifting_v1',
    templates: POWERLIFTING_TEMPLATES,
    bucketFn: powerliftingBucket,
    coachTip: 'Mantén la técnica de competición y deja margen para acumular volumen sin romper forma.'
  },
  halterofilia: {
    disciplina: 'halterofilia',
    methodologyType: 'Halterofilia',
    displayName: 'Halterofilia',
    version: 'halterofilia_v1',
    templates: HALTEROFILIA_TEMPLATES,
    bucketFn: halterofiliaBucket,
    coachTip: 'La velocidad y la posición mandan: baja carga si la técnica se degrada.'
  }
};

function normalizeLevel3(raw) {
  const lvl = String(raw || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (lvl.includes('elite')) return 'avanzado';
  if (lvl.includes('novato') || lvl.includes('basico') || lvl.includes('basic')) return 'principiante';
  if (lvl.includes('avanz')) return 'avanzado';
  if (lvl.includes('inter')) return 'intermedio';
  return 'principiante';
}

function toGymExercise(methodConfig) {
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
      tipo_ejercicio: methodConfig.disciplina,
      series,
      reps_objetivo,
      series_reps_objetivo: ex.series_reps_objetivo || null,
      descanso_seg: ex.descanso_seg ?? 75,
      tempo: ex.tempo || null,
      como_hacerlo: ex.como_hacerlo || null,
      criterio_de_progreso: ex.criterio_de_progreso || null,
      notas: ex.notas || '',
      metodologia: methodConfig.displayName
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
  const methodConfig = METHOD_CONFIGS[methodology] || METHOD_CONFIGS.gimnasio;
  const { disciplina } = methodConfig;

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

  const bucketFn = methodConfig.bucketFn;
  const poolByBucket = {};
  for (const ex of exercises) (poolByBucket[bucketFn(ex.categoria)] ||= []).push(ex);

  const pick = buildExercisePicker(poolByBucket);
  const templateSet = methodConfig.templates;
  const templateSpecs = templateSet[frecuencia] || templateSet[3];
  const templates = buildTemplates(templateSpecs, pick, exercises);

  const semanas = buildSemanas({
    templates,
    totalWeeks,
    frecuencia,
    objetivo: routineData.goals || `Rutina de ${methodConfig.displayName} nivel ${nivelLabel}`,
    coachTip: methodConfig.coachTip,
    toExercise: toGymExercise(methodConfig)
  });

  const plan = {
    metodologia: methodConfig.displayName,
    version: methodConfig.version,
    nivel: nivelLabel,
    total_weeks: totalWeeks,
    duracion_total_semanas: totalWeeks,
    frecuencia_semanal: frecuencia,
    sessions_per_week: frecuencia,
    fecha_inicio: new Date().toISOString(),
    objetivo: routineData.goals || levelConfig.name,
    configuracion: {
      progression_type: 'linear',
      sessions_per_week: frecuencia,
      duration_weeks: totalWeeks,
      disciplina,
      source: `${methodology}_v1_deterministic`
    },
    semanas
  };

  const planId = await persistPlanDraft(userId, methodConfig.methodologyType, plan);
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
    gimnasio: {
      name: 'Gimnasio',
      description: 'Rutina general de sala basada en patrones de fuerza e hipertrofia',
      typical_rep_range: '8-12',
      rest_time: '60-90s'
    },
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
    },
    funcional: {
      name: 'Funcional',
      description: 'Movimientos naturales, core, cargas y acondicionamiento',
      typical_rep_range: '8-15',
      rest_time: '45-75s'
    },
    casa: {
      name: 'Entrenamiento en Casa',
      description: 'Fuerza, cardio, movilidad y trabajo funcional con equipamiento mínimo',
      typical_rep_range: '10-20',
      rest_time: '30-75s'
    },
    heavy_duty: {
      name: 'Heavy Duty',
      description: 'Bajo volumen, alta intensidad y recuperación amplia',
      typical_rep_range: '6-10',
      rest_time: '90-180s'
    },
    powerlifting: {
      name: 'Powerlifting',
      description: 'Sentadilla, press banca, peso muerto y asistencia',
      typical_rep_range: '3-8',
      rest_time: '120-240s'
    },
    halterofilia: {
      name: 'Halterofilia',
      description: 'Snatch, Clean & Jerk, técnica y fuerza base',
      typical_rep_range: '2-5',
      rest_time: '90-180s'
    }
  };
}
