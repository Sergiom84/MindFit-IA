/**
 * Servicio especializado de Calistenia
 * @module routineGeneration/methodologies/CalisteniaService
 */

import { pool } from '../../../db.js';
import { countByDiscipline, getRandomByLevel } from '../../exerciseRepository.js';
import { AI_MODULES } from '../../../config/aiConfigs.js';
import { getModuleOpenAI } from '../../../lib/openaiClient.js';
import { logger } from '../logger.js';
import { parseAIResponse } from '../ai/aiResponseParser.js';
import { getUserFullProfile } from '../database/userRepository.js';
import { normalizeUserProfile } from '../validators.js';
import {
  logSeparator,
  logAPICall,
  logUserProfile,
  logAIPayload,
  logAIResponse,
  logTokens,
  logError
} from '../../../utils/aiLogger.js';

/**
 * Evaluar perfil de usuario para determinar nivel de calistenia
 * @param {string} userId - ID del usuario
 * @returns {Promise<object>} Evaluación con nivel recomendado
 */
export async function evaluateCalisteniaLevel(userId) {
  try {
    logSeparator('CALISTENIA PROFILE EVALUATION');
    logAPICall('/specialist/calistenia/evaluate', 'POST', userId);

    const userProfile = await getUserFullProfile(userId);
    const normalizedProfile = normalizeUserProfile(userProfile);

    logUserProfile(normalizedProfile, userId);

    // Verificar ejercicios disponibles
    const exerciseCount = await countByDiscipline(pool, 'calistenia', { nivel: 'principiante' });
    if (exerciseCount === 0) {
      throw new Error('No se encontraron ejercicios de calistenia en la base de datos');
    }

    // Obtener historial de ejercicios
    const recentExercisesResult = await pool.query(`
      SELECT DISTINCT exercise_name, used_at
      FROM app.exercise_history
      WHERE user_id = $1
      ORDER BY used_at DESC
      LIMIT 20
    `, [userId]);

    const recentExercises = recentExercisesResult.rows.map(row => row.exercise_name);

    // Preparar payload para IA
    const aiPayload = {
      task: 'evaluate_calistenia_level',
      user_profile: {
        ...normalizedProfile,
        recent_exercises: recentExercises
      },
      evaluation_criteria: [
        'Años de entrenamiento en calistenia o peso corporal',
        'Nivel actual de fuerza relativa (IMC, experiencia)',
        'Capacidad de realizar movimientos básicos',
        'Experiencia con ejercicios avanzados',
        'Objetivos específicos de calistenia',
        'Limitaciones físicas o lesiones',
        'Edad y condición física general'
      ],
      level_descriptions: {
        principiante: 'Principiantes: 0-1 años experiencia, enfoque en técnica básica',
        intermedio: 'Experiencia: 1-3 años, domina movimientos básicos',
        avanzado: 'Expertos: +3 años, ejecuta ejercicios complejos'
      }
    };

    logAIPayload('CALISTENIA_EVALUATION', aiPayload);

    // Llamar a IA
    const client = getModuleOpenAI(AI_MODULES.CALISTENIA_SPECIALIST);
    const config = AI_MODULES.CALISTENIA_SPECIALIST;

    const completion = await client.chat.completions.create({
      model: config.model,
      messages: [
        {
          role: 'system',
          content: `Eres un especialista en calistenia que evalúa perfiles de usuarios.

INSTRUCCIONES:
- Evalúa objetivamente la experiencia y condición física
- Sé realista con la confianza (no siempre 100%)
- RESPONDE SOLO EN JSON PURO, SIN MARKDOWN

FORMATO DE RESPUESTA:
{
  "recommended_level": "principiante|intermedio|avanzado",
  "confidence": 0.75,
  "reasoning": "Explicación detallada",
  "key_indicators": ["Factor 1", "Factor 2"],
  "suggested_focus_areas": ["Área 1", "Área 2"],
  "progression_timeline": "Tiempo estimado"
}`
        },
        {
          role: 'user',
          content: JSON.stringify(aiPayload)
        }
      ],
      temperature: 0.3,
      max_tokens: 800
    });

    const aiResponse = completion.choices[0].message.content;
    logAIResponse(aiResponse);
    logTokens(completion.usage);

    // Parsear respuesta
    let evaluation;
    try {
      evaluation = JSON.parse(parseAIResponse(aiResponse));
    } catch (parseError) {
      logger.error('Error parseando respuesta IA:', parseError);
      throw new Error('Respuesta de IA inválida');
    }

    // Validar respuesta
    const normalizedLevel = evaluation.recommended_level.toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    return {
      success: true,
      evaluation: {
        recommended_level: normalizedLevel,
        confidence: evaluation.confidence,
        reasoning: evaluation.reasoning,
        key_indicators: evaluation.key_indicators || [],
        suggested_focus_areas: evaluation.suggested_focus_areas || [],
        progression_timeline: evaluation.progression_timeline || 'No especificado'
      },
      metadata: {
        model_used: config.model,
        evaluation_timestamp: new Date().toISOString()
      }
    };

  } catch (error) {
    logger.error('Error en evaluación de calistenia:', error);
    logError('CALISTENIA_SPECIALIST', error);
    throw error;
  }
}

// Columnas que necesita el motor de calistenia desde app.ejercicios.
const CALISTENIA_COLUMNS = `
  source_exercise_id AS exercise_id,
  nombre,
  nivel,
  categoria,
  patron,
  series_reps_objetivo,
  descanso_seg,
  tempo,
  criterio_de_progreso,
  progresion_hacia,
  como_hacerlo,
  consejos,
  gif_url
`;

// Descanso por defecto cuando la BD no lo especifica (muchas filas de calistenia
// tienen descanso_seg = null, p. ej. holds estáticos).
const DEFAULT_REST_SECONDS = 75;

// Etiquetas de día por defecto según frecuencia semanal.
const DEFAULT_DAY_LABELS = {
  3: ['Lunes', 'Miércoles', 'Viernes'],
  4: ['Lunes', 'Martes', 'Jueves', 'Viernes'],
  5: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes']
};

// Plantillas de sesión por frecuencia. Cada entrada `[categoria, n]` indica
// cuántos ejercicios de esa categoría componen la sesión (split Push/Pull/Legs/Core).
const SESSION_TEMPLATES = {
  3: [
    { nombre: 'Empuje + Core', plan: [['Empuje', 3], ['Core', 1]] },
    { nombre: 'Tracción + Piernas', plan: [['Tracción', 2], ['Piernas', 2]] },
    { nombre: 'Cuerpo completo', plan: [['Empuje', 1], ['Tracción', 1], ['Piernas', 1], ['Core', 1]] }
  ],
  4: [
    { nombre: 'Empuje', plan: [['Empuje', 3], ['Core', 1]] },
    { nombre: 'Tracción', plan: [['Tracción', 3], ['Core', 1]] },
    { nombre: 'Piernas', plan: [['Piernas', 3], ['Equilibrio/Soporte', 1]] },
    { nombre: 'Cuerpo completo', plan: [['Empuje', 1], ['Tracción', 1], ['Piernas', 1], ['Core', 1]] }
  ],
  5: [
    { nombre: 'Empuje', plan: [['Empuje', 3], ['Core', 1]] },
    { nombre: 'Tracción', plan: [['Tracción', 3], ['Core', 1]] },
    { nombre: 'Piernas', plan: [['Piernas', 3], ['Equilibrio/Soporte', 1]] },
    { nombre: 'Core & Skills', plan: [['Core', 2], ['Equilibrio/Soporte', 1], ['Empuje', 1]] },
    { nombre: 'Cuerpo completo', plan: [['Empuje', 1], ['Tracción', 1], ['Piernas', 1], ['Core', 1]] }
  ]
};

/**
 * Normaliza el nivel recibido del frontend a las claves de getCalisteniaLevels().
 * El frontend puede enviar 'basico' (default), 'principiante', 'intermedio', 'avanzado'.
 */
function normalizeCalisteniaLevel(rawLevel) {
  const lvl = String(rawLevel || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  if (lvl.includes('avanz')) return 'avanzado';
  if (lvl.includes('inter')) return 'intermedio';
  return 'principiante';
}

/**
 * Parsea "5-8x20-30s" → { series: '5-8', reps_objetivo: '20-30s' }.
 * Tolera ausencia de 'x' (usa reps completo) y null.
 */
function parseSeriesReps(raw) {
  const value = String(raw || '').trim();
  if (!value) return { series: '3', reps_objetivo: '8-12' };
  const idx = value.toLowerCase().indexOf('x');
  if (idx === -1) return { series: '3', reps_objetivo: value };
  return {
    series: value.slice(0, idx).trim() || '3',
    reps_objetivo: value.slice(idx + 1).trim() || '8-12'
  };
}

// ── Progresión MindFeed para Calistenia (Fase 3a, a nivel de plan_data) ──
// Cada microciclo (semana de entrenamiento) sube el objetivo de reps/tiempo
// dentro del rango del ejercicio; al alcanzar el tope se sugiere la variante
// (progresion_hacia). Cada DELOAD_EVERY semanas se aplica descarga (volumen).
const DELOAD_EVERY = 6;
const DELOAD_VOLUME_FACTOR = 0.5;

// Primer número de un rango "3-5" → 3 (mínimo de series).
function parseSeriesCount(seriesStr) {
  const m = String(seriesStr || '').match(/\d+/);
  const n = m ? parseInt(m[0], 10) : 3;
  return Number.isFinite(n) && n > 0 ? n : 3;
}

// Parsea "6-12", "20-30s", "8-12/lado" → { min, max, suffix, raw }.
function parseRepRange(repsStr) {
  const raw = String(repsStr || '').trim();
  const suffixMatch = raw.match(/(s)?(\/lado)?$/i);
  const suffix = suffixMatch ? suffixMatch[0] : '';
  const m = raw.match(/(\d+)\s*-\s*(\d+)/);
  if (!m) {
    const single = raw.match(/(\d+)/);
    const v = single ? parseInt(single[1], 10) : null;
    return { min: v, max: v, suffix, raw };
  }
  return { min: parseInt(m[1], 10), max: parseInt(m[2], 10), suffix, raw };
}

// Objetivo de reps progresivo para la semana de entrenamiento microIndex (1..totalMicro).
function progressedReps(range, microIndex, totalMicro) {
  if (range.min == null) return range.raw;
  if (range.min === range.max || totalMicro <= 1) return `${range.max}${range.suffix}`;
  const frac = Math.min(1, Math.max(0, (microIndex - 1) / (totalMicro - 1)));
  const value = Math.round(range.min + (range.max - range.min) * frac);
  return `${value}${range.suffix}`;
}

/**
 * Selector con baraja + cursor por categoría: entrega ejercicios sin repetir
 * dentro de una misma sesión; entre sesiones puede reciclar si el pool es pequeño.
 */
function buildExercisePicker(exercisesByCategory) {
  const cursors = {};
  return function pick(categoria, n) {
    const pool = exercisesByCategory[categoria] || [];
    const out = [];
    if (pool.length === 0) return out;
    let cursor = cursors[categoria] || 0;
    const seenInSession = new Set();
    let guard = 0;
    while (out.length < n && guard < pool.length * 2) {
      const ex = pool[cursor % pool.length];
      cursor += 1;
      guard += 1;
      if (!seenInSession.has(ex.exercise_id)) {
        seenInSession.add(ex.exercise_id);
        out.push(ex);
      }
    }
    cursors[categoria] = cursor;
    return out;
  };
}

/**
 * Construye un ejercicio del plan a partir de una fila de app.ejercicios,
 * aplicando la progresión MindFeed del microciclo (Fase 3a).
 *
 * @param {object} progression - { weekNumber, microIndex, totalMicro, isDeload }
 */
function toPlanExercise(ex, orden, sessionId, progression = null) {
  const { series: seriesRaw, reps_objetivo: repsRaw } = parseSeriesReps(ex.series_reps_objetivo);
  const range = parseRepRange(repsRaw);
  const baseSeries = parseSeriesCount(seriesRaw);

  let series = baseSeries;
  let repsObjetivo = repsRaw;
  let esDeload = false;
  let listoParaProgresar = false;
  let notas = '';

  if (progression) {
    const { microIndex, totalMicro, isDeload } = progression;
    if (isDeload) {
      // Descarga: menos volumen (series), reps al extremo bajo del rango.
      esDeload = true;
      series = Math.max(1, Math.round(baseSeries * DELOAD_VOLUME_FACTOR));
      repsObjetivo = range.min != null ? `${range.min}${range.suffix}` : repsRaw;
      notas = 'Semana de descarga: reduce el volumen y prioriza técnica.';
    } else {
      // Progresión de reps/tiempo dentro del rango.
      repsObjetivo = progressedReps(range, microIndex, totalMicro);
      // Al alcanzar el tope del rango, sugerir la variante más difícil.
      const reached = range.max != null && String(repsObjetivo).startsWith(String(range.max));
      if (reached && ex.progresion_hacia) {
        listoParaProgresar = true;
        notas = `Objetivo alcanzado: cuando completes ${range.max}${range.suffix} con técnica perfecta, progresa a "${ex.progresion_hacia}".`;
      }
    }
  }

  return {
    id: `${sessionId}-E${orden}`,
    orden,
    exercise_id: ex.exercise_id,
    nombre: ex.nombre,
    categoria: ex.categoria,
    patron: ex.patron,
    patron_movimiento: ex.patron,
    tipo_ejercicio: 'calistenia',
    series,
    reps_objetivo: repsObjetivo,
    series_reps_objetivo: ex.series_reps_objetivo || null,
    rep_range: range.min != null ? { min: range.min, max: range.max, suffix: range.suffix } : null,
    descanso_seg: ex.descanso_seg ?? DEFAULT_REST_SECONDS,
    tempo: ex.tempo || null,
    como_hacerlo: ex.como_hacerlo || null,
    criterio_de_progreso: ex.criterio_de_progreso || null,
    progresion_hacia: ex.progresion_hacia || null,
    variante_sugerida: listoParaProgresar ? ex.progresion_hacia : null,
    es_deload: esDeload,
    listo_para_progresar: listoParaProgresar,
    notas
  };
}

/**
 * Generar plan de entrenamiento de calistenia (motor determinista v1).
 *
 * Replica el patrón estructural de HipertrofiaV2 (generateD1D5Plan): selecciona
 * ejercicios de app.ejercicios (disciplina='calistenia') por nivel acumulativo,
 * construye plantillas de sesión (split Push/Pull/Legs/Core) y las repite a lo
 * largo de las semanas. Persiste como draft en app.methodology_plans y devuelve
 * el contrato que espera el frontend ({ success, plan, planId, metadata }).
 *
 * @param {string} userId - ID del usuario
 * @param {object} planData - { selectedLevel, aiEvaluation, goals, ... }
 * @returns {Promise<object>} Plan generado
 */
export async function generateCalisteniaPlan(userId, planData = {}) {
  const startedAt = Date.now();
  logSeparator('CALISTENIA PLAN GENERATION');
  logAPICall('/specialist/calistenia/generate', 'POST', userId);

  // 1) Nivel: prioriza selectedLevel; fallback a la evaluación IA; luego principiante.
  const rawLevel =
    planData.selectedLevel ||
    planData.aiEvaluation?.recommended_level ||
    'principiante';
  const levelKey = normalizeCalisteniaLevel(rawLevel);

  const levels = getCalisteniaLevels();
  const levelConfig = levels[levelKey] || levels.principiante;
  const nivelLabel = levelConfig.name; // 'Principiante' | 'Intermedio' | 'Avanzado'
  const frecuencia = levelConfig.sessions_per_week;
  const totalWeeks = levelConfig.duration_weeks;

  logger.info(`🤸 [CALISTENIA] Nivel: ${nivelLabel}, ${frecuencia} días/sem, ${totalWeeks} semanas`);

  // 2) Cargar pool de ejercicios (nivel acumulativo) y agrupar por categoría.
  const exercises = await getRandomByLevel(pool, {
    disciplina: 'calistenia',
    level: levelKey,
    limit: 500,
    columns: CALISTENIA_COLUMNS
  });

  if (!exercises || exercises.length === 0) {
    throw new Error('No se encontraron ejercicios de calistenia para el nivel seleccionado');
  }

  const exercisesByCategory = {};
  for (const ex of exercises) {
    (exercisesByCategory[ex.categoria] ||= []).push(ex);
  }
  const allExercises = exercises;
  const pick = buildExercisePicker(exercisesByCategory);

  // 3) Construir plantillas de sesión (selección única, reutilizada por semana).
  const templates = (SESSION_TEMPLATES[frecuencia] || SESSION_TEMPLATES[3]).map((tpl, idx) => {
    const sessionId = `T-D${idx + 1}`;
    const chosen = [];
    const grupos = new Set();
    for (const [categoria, n] of tpl.plan) {
      for (const ex of pick(categoria, n)) {
        chosen.push(ex);
        grupos.add(ex.categoria);
      }
    }
    // Garantía anti-vacío: si la plantilla no encontró nada, rellena del pool global.
    if (chosen.length === 0 && allExercises.length > 0) {
      chosen.push(allExercises[idx % allExercises.length]);
      grupos.add(chosen[0].categoria);
    }
    return {
      nombre: tpl.nombre,
      grupos_musculares: Array.from(grupos),
      ejercicios: chosen
    };
  });

  // 4) Expandir plantillas a semanas/sesiones aplicando progresión MindFeed.
  const dayLabels = DEFAULT_DAY_LABELS[frecuencia] || DEFAULT_DAY_LABELS[3];
  const semanas = [];
  // Semanas de descarga (cada DELOAD_EVERY) y total de microciclos de entrenamiento.
  const isDeloadWeek = (w) => w % DELOAD_EVERY === 0;
  const totalMicro = Array.from({ length: totalWeeks }, (_, i) => i + 1).filter((w) => !isDeloadWeek(w)).length;
  let microIndex = 0;

  for (let w = 1; w <= totalWeeks; w++) {
    const deload = isDeloadWeek(w);
    if (!deload) microIndex += 1;
    const progression = { weekNumber: w, microIndex, totalMicro, isDeload: deload };

    const sesiones = templates.map((tpl, dIdx) => {
      const sessionId = `W${w}-D${dIdx + 1}`;
      return {
        id: sessionId,
        dia: dayLabels[dIdx] || `Día ${dIdx + 1}`,
        fecha: null,
        orden: dIdx + 1,
        nombre: tpl.nombre,
        descripcion: `Sesión de ${tpl.nombre.toLowerCase()}`,
        coach_tip: deload
          ? 'Semana de descarga: baja el volumen, mantén la técnica y recupera.'
          : 'Prioriza la técnica y el control del movimiento; sube reps según el objetivo de la semana.',
        grupos_musculares: tpl.grupos_musculares,
        es_deload: deload,
        ejercicios: tpl.ejercicios.map((ex, eIdx) => toPlanExercise(ex, eIdx + 1, sessionId, progression))
      };
    });

    semanas.push({
      numero: w,
      tipo: deload ? 'deload' : 'entrenamiento',
      es_deload: deload,
      objetivo: deload
        ? 'Semana de descarga (deload): recuperación y consolidación técnica.'
        : `Microciclo ${microIndex}/${totalMicro}: progresión de repeticiones. ${levelConfig.description}`,
      sesiones
    });
  }

  // 5) Estructura del plan.
  const fechaInicio = new Date().toISOString();
  const plan = {
    metodologia: 'Calistenia',
    version: 'calistenia_v2',
    nivel: nivelLabel,
    total_weeks: totalWeeks,
    duracion_total_semanas: totalWeeks,
    frecuencia_semanal: frecuencia,
    fecha_inicio: fechaInicio,
    sessions_per_week: frecuencia,
    objetivo: planData.goals || levelConfig.description,
    configuracion: {
      progression_type: 'microcycle_reps',
      progression_model: 'reps_to_variant',
      deload_every_weeks: DELOAD_EVERY,
      deload_volume_factor: DELOAD_VOLUME_FACTOR,
      sessions_per_week: frecuencia,
      duration_weeks: totalWeeks,
      rest_default_seconds: DEFAULT_REST_SECONDS,
      source: 'calistenia_v2_progressive'
    },
    semanas
  };

  // 6) Persistir como draft (la activación/fecha de inicio la fija el frontend al confirmar).
  const planResult = await pool.query(`
    INSERT INTO app.methodology_plans (
      user_id, methodology_type, plan_data, generation_mode, status, created_at
    )
    VALUES ($1, $2, $3, $4, $5, NOW())
    RETURNING id
  `, [userId, 'Calistenia', JSON.stringify(plan), 'manual', 'draft']);

  const methodologyPlanId = planResult.rows[0].id;
  plan.methodologyPlanId = methodologyPlanId;

  const processingTime = Math.round((Date.now() - startedAt) / 100) / 10;
  logger.info(`✅ [CALISTENIA] Plan generado con ID: ${methodologyPlanId} (${processingTime}s)`);

  return {
    success: true,
    plan,
    planId: methodologyPlanId,
    methodologyPlanId,
    methodology: 'calistenia',
    metadata: {
      plan_start_date: fechaInicio.split('T')[0],
      processing_time_seconds: processingTime,
      generatedAt: fechaInicio,
      level: nivelLabel,
      total_exercises_pool: allExercises.length
    }
  };
}

/**
 * Obtener niveles disponibles de calistenia
 * @returns {object} Niveles con descripciones
 */
export function getCalisteniaLevels() {
  return {
    principiante: {
      name: 'Principiante',
      description: '0-1 años de experiencia. Enfoque en técnica básica y fundamentos.',
      duration_weeks: 8,
      sessions_per_week: 3
    },
    intermedio: {
      name: 'Intermedio',
      description: '1-3 años de experiencia. Domina movimientos básicos, progresiones avanzadas.',
      duration_weeks: 10,
      sessions_per_week: 4
    },
    avanzado: {
      name: 'Avanzado',
      description: '+3 años de experiencia. Ejecuta ejercicios complejos, skills avanzados.',
      duration_weeks: 12,
      sessions_per_week: 5
    }
  };
}
