/**
 * Servicio de rutinas de gimnasio genéricas
 * @module routineGeneration/methodologies/GymRoutineService
 */

import { pool } from '../../../db.js';
import { logger } from '../logger.js';
import { getUserFullProfile } from '../database/userRepository.js';
import { getRandomByLevel } from '../../exerciseRepository.js';
import { extractInjuryText, activeInjuryRules, isContraindicated } from '../injuryContraindications.js';
import { materialsForEquipmentLevel, buildAllowedMaterials } from '../../singleDay/casaEquipment.js';
import {
  getProfileTrainingGoal,
  resolveTrainingFrequency
} from '../../userProfileContract.js';
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
  series_reps_objetivo, descanso_seg, tempo, criterio_de_progreso, como_hacerlo, notas, gif_url, extra
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

// Heavy Duty (Mike Mentzer): baja frecuencia y mucho descanso entre sesiones.
const HEAVY_DUTY_LEVELS = {
  principiante: { name: 'Principiante', sessions_per_week: 2, duration_weeks: 8 },
  intermedio:   { name: 'Intermedio',   sessions_per_week: 3, duration_weeks: 10 },
  avanzado:     { name: 'Avanzado',     sessions_per_week: 3, duration_weeks: 12 }
};

// Sesiones cortas (3 ejercicios) tipo cuerpo completo / torso-pierna; el bajo
// volumen real se aplica con 1-2 series al fallo vía exerciseOverrides.
const HEAVY_DUTY_TEMPLATES = {
  2: [
    { nombre: 'Cuerpo completo A', plan: [['PUSH', 1], ['PULL', 1], ['LEGS', 1]] },
    { nombre: 'Cuerpo completo B', plan: [['LEGS', 1], ['PUSH', 1], ['PULL', 1]] }
  ],
  3: [
    { nombre: 'Torso (empuje/tirón)', plan: [['PUSH', 1], ['PULL', 1], ['CORE', 1]] },
    { nombre: 'Pierna', plan: [['LEGS', 2], ['CORE', 1]] },
    { nombre: 'Cuerpo completo', plan: [['PUSH', 1], ['PULL', 1], ['LEGS', 1]] }
  ],
  5: [
    { nombre: 'Torso (empuje/tirón)', plan: [['PUSH', 1], ['PULL', 1], ['CORE', 1]] },
    { nombre: 'Pierna', plan: [['LEGS', 2], ['CORE', 1]] },
    { nombre: 'Cuerpo completo', plan: [['PUSH', 1], ['PULL', 1], ['LEGS', 1]] }
  ]
};

const METHOD_CONFIGS = {
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
    rulesetScope: 'funcional_v1',
    templates: FUNCTIONAL_TEMPLATES,
    bucketFn: functionalBucket,
    coachTip: 'Prioriza patrones limpios, estabilidad y control antes de subir la intensidad.'
  },
  casa: {
    disciplina: 'casa',
    methodologyType: 'Entrenamiento en Casa',
    displayName: 'Entrenamiento en Casa',
    version: 'casa_v1',
    rulesetScope: 'casa_v1',
    templates: CASA_TEMPLATES,
    bucketFn: casaBucket,
    coachTip: 'Ajusta el ritmo al espacio disponible y deja margen técnico en cada serie.',
    // RIR objetivo por defecto, coherente con el flujo single-day de casa.
    exerciseOverrides: { rir_target: '2-3' }
  },
  'heavy-duty': {
    disciplina: 'heavy_duty',
    methodologyType: 'Heavy Duty',
    displayName: 'Heavy Duty',
    version: 'heavy_duty_v1',
    rulesetScope: 'heavy_duty_v1',
    templates: HEAVY_DUTY_TEMPLATES,
    levels: HEAVY_DUTY_LEVELS,
    bucketFn: muscleBucket,
    coachTip: 'Pocas series llevadas al fallo muscular absoluto, técnica impecable y mucha recuperación entre sesiones.',
    // Filosofía Heavy Duty: 1-2 series al fallo (RIR 0) y descanso amplio.
    exerciseOverrides: {
      series: '1-2',
      rir_target: 0,
      descanso_seg: 180,
      notas: 'Al fallo muscular absoluto (RIR 0). 1-2 series efectivas.'
    }
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

function toGymExercise(methodConfig, restDefault = 75) {
  const ov = methodConfig.exerciseOverrides || {};
  return (ex, orden, sessionId) => {
    const { series, reps_objetivo } = parseSeriesReps(ex.series_reps_objetivo);
    const exercise = {
      id: `${sessionId}-E${orden}`,
      orden,
      exercise_id: ex.exercise_id,
      nombre: ex.nombre,
      categoria: ex.categoria,
      patron: ex.patron || null,
      patron_movimiento: ex.patron_movimiento || ex.patron || null,
      tipo_ejercicio: methodConfig.disciplina,
      series: ov.series ?? series,
      reps_objetivo,
      series_reps_objetivo: ex.series_reps_objetivo || null,
      descanso_seg: ov.descanso_seg ?? ex.descanso_seg ?? restDefault,
      tempo: ex.tempo || null,
      como_hacerlo: ex.como_hacerlo || null,
      criterio_de_progreso: ex.criterio_de_progreso || null,
      gif_url: ex.gif_url || null,
      notas: ov.notas ?? (ex.notas || ''),
      metodologia: methodConfig.displayName
    };
    if (ov.rir_target !== undefined) exercise.rir_target = ov.rir_target;
    return exercise;
  };
}

// Carga un ruleset MindFeed desde app.mindfeed_rulesets (BD) con fallback a las
// constantes locales si no está disponible o si la metodología no define scope.
// Mismo mecanismo que loadCalisteniaRuleset (CalisteniaService), generalizado.
async function loadGymRuleset(scope, fallback) {
  if (!scope) return fallback;
  try {
    const result = await pool.query('SELECT app.get_active_mindfeed_ruleset($1) AS rules', [scope]);
    const rules = result.rows[0]?.rules || {};
    return {
      deloadEvery: Number(rules?.deloadRules?.deloadEvery) || fallback.deloadEvery,
      volumeFactor: Number(rules?.deloadRules?.volumeFactor) || fallback.volumeFactor,
      restDefault: Number(rules?.restSecondsDefault) || fallback.restDefault
    };
  } catch (error) {
    logger.warn(`⚠️ [GYM] No se pudo cargar ruleset ${scope}, usando fallback: ${error.message}`);
    return fallback;
  }
}

// Aplica deload por volumen: cada `deloadEvery` semanas reduce el número de
// series por volumeFactor y marca la semana como descarga. Aditivo y puro
// (devuelve nuevas semanas); solo se invoca para metodologías con rulesetScope.
function applyDeload(semanas, { deloadEvery, volumeFactor }) {
  if (!deloadEvery || deloadEvery < 1 || !(volumeFactor > 0 && volumeFactor < 1)) return semanas;
  return semanas.map((sem) => {
    if (sem.numero % deloadEvery !== 0) return sem;
    return {
      ...sem,
      tipo: 'descarga',
      objetivo: `Semana de descarga · ${sem.objetivo}`,
      sesiones: sem.sesiones.map((ses) => ({
        ...ses,
        ejercicios: ses.ejercicios.map((ex) => {
          const base = Number(ex.series);
          if (!Number.isFinite(base) || base <= 1) return ex;
          return {
            ...ex,
            series: Math.max(1, Math.round(base * volumeFactor)),
            notas: [ex.notas, 'Descarga: reduce volumen y prioriza técnica.'].filter(Boolean).join(' ')
          };
        })
      }))
    };
  });
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

  // Perfil (para nivel de fallback y limitaciones/lesiones). Opcional.
  let userProfile = null;
  try {
    userProfile = await getUserFullProfile(userId);
  } catch { /* perfil opcional */ }

  // Nivel: explícito del frontend o, si no, el del perfil del usuario.
  const levelRaw = routineData.selectedLevel || routineData.level || routineData.nivel || userProfile?.nivel_entrenamiento;

  // 🩹 Reglas de contraindicación por lesión (compartidas con Calistenia/CrossFit).
  const injuryText = extractInjuryText(userProfile);
  const injuryRules = activeInjuryRules(injuryText);
  const injuryZones = injuryRules.map((r) => r.zona);
  const levelKey = normalizeLevel3(levelRaw);
  const levelsTable = methodConfig.levels || GYM_LEVELS;
  const levelConfig = levelsTable[levelKey] || levelsTable.principiante;
  const nivelLabel = levelConfig.name;
  const templateSet = methodConfig.templates;
  const frecuencia = resolveTrainingFrequency(
    routineData.frecuencia_semanal ?? userProfile?.frecuencia_semanal,
    levelConfig.sessions_per_week,
    Object.keys(templateSet)
  );
  const totalWeeks = levelConfig.duration_weeks;
  const trainingGoal = getProfileTrainingGoal(userProfile, routineData.goals);

  // Entrenamiento en Casa: filtrar el catálogo por el material disponible, de
  // forma coherente con el flujo single-day. Acepta `equipment[]` (claves del
  // selector) o `equipmentLevel` ('minimo'|'basico'|'avanzado') del formulario.
  let equipmentFilter;
  if (disciplina === 'casa') {
    equipmentFilter = Array.isArray(routineData.equipment) && routineData.equipment.length > 0
      ? buildAllowedMaterials(routineData.equipment)
      : materialsForEquipmentLevel(routineData.equipmentLevel);
    logger.info(`🏠 [GYM] Casa: filtrando por ${equipmentFilter.length} materiales (equipmentLevel=${routineData.equipmentLevel || 'n/d'})`);
  }

  // Cargar ejercicios de la disciplina (nivel acumulativo) y clasificar en buckets.
  const exercises = await getRandomByLevel(pool, {
    disciplina,
    level: levelKey,
    limit: 500,
    columns: GYM_COLUMNS,
    ...(equipmentFilter ? { equipment: equipmentFilter } : {})
  });
  if (!exercises || exercises.length === 0) {
    throw new Error(`No se encontraron ejercicios de ${disciplina} para el nivel seleccionado`);
  }

  // 🩹 SEGURIDAD POR LESIÓN: excluir del pool los movimientos contraindicados.
  // El motor es determinista, así que este filtro es la única barrera real. Si
  // una lesión vacía un bucket (p.ej. hombro → EMPUJE/PUSH), la sesión se
  // completa con ejercicios seguros de otros buckets (relleno en buildTemplates).
  const bucketFn = methodConfig.bucketFn;
  const poolByBucket = {};
  const excludedByInjury = [];
  for (const ex of exercises) {
    if (isContraindicated(ex, injuryRules)) {
      excludedByInjury.push(ex.nombre);
      continue;
    }
    (poolByBucket[bucketFn(ex.categoria)] ||= []).push(ex);
  }
  const safePool = Object.values(poolByBucket).flat();
  if (safePool.length === 0) {
    throw new Error(`No hay ejercicios de ${disciplina} seguros para las limitaciones indicadas`);
  }
  if (injuryRules.length) {
    logger.info(`🩹 [GYM] Filtro de lesiones activo (${injuryZones.join(', ') || 'ninguna'}). Excluidos: ${excludedByInjury.length} de ${exercises.length}`);
  }

  // Reglas (descanso, deload) cargadas desde app.mindfeed_rulesets cuando la
  // metodología define un scope (p.ej. funcional → funcional_v1). El resto de
  // metodologías mantienen el comportamiento previo (fallback, sin deload).
  const ruleset = await loadGymRuleset(methodConfig.rulesetScope, {
    deloadEvery: 4,
    volumeFactor: 0.6,
    restDefault: 75
  });

  const pick = buildExercisePicker(poolByBucket);
  const templateSpecs = templateSet[frecuencia] || templateSet[3];
  const templates = buildTemplates(templateSpecs, pick, safePool);

  let semanas = buildSemanas({
    templates,
    totalWeeks,
    frecuencia,
    objetivo: trainingGoal,
    coachTip: methodConfig.coachTip,
    toExercise: toGymExercise(methodConfig, ruleset.restDefault)
  });

  // Deload por volumen, solo para metodologías con ruleset (aislado).
  if (methodConfig.rulesetScope) {
    semanas = applyDeload(semanas, ruleset);
  }

  const plan = {
    metodologia: methodConfig.displayName,
    version: methodConfig.version,
    nivel: nivelLabel,
    total_weeks: totalWeeks,
    duracion_total_semanas: totalWeeks,
    frecuencia_semanal: frecuencia,
    sessions_per_week: frecuencia,
    fecha_inicio: new Date().toISOString(),
    objetivo: trainingGoal,
    restricciones_lesion: {
      zonas: injuryZones,
      limitaciones_texto: injuryText || null,
      movimientos_excluidos: excludedByInjury
    },
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
