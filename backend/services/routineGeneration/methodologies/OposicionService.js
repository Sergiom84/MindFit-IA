/**
 * Motor de generación de planes para OPOSICIONES (determinista, por catálogo).
 *
 * Comparte arquitectura con CalisteniaService/GymRoutineService: selecciona
 * ejercicios de la tabla legacy de la oposición (app."Ejercicios_<Oposicion>"),
 * los agrupa por categoría de prueba (Natación, Fuerza, Carrera, Resistencia,
 * Acondicionamiento…) y construye un plan concurrente que entrena todas las
 * capacidades cada semana. Persiste como draft en app.methodology_plans y
 * devuelve el contrato que espera el frontend ({ success, plan, planId, metadata }).
 *
 * Es genérico: sirve para bomberos, guardia-civil, policia-nacional y
 * policia-local siempre que su tabla tenga el mismo esquema que Ejercicios_Bomberos.
 *
 * @module routineGeneration/methodologies/OposicionService
 */

import { pool } from '../../../db.js';
import { logger } from '../logger.js';

// Whitelist tabla por oposición (evita inyección: el nombre NUNCA viene del input).
const OPOSICION_TABLES = {
  bomberos: 'Ejercicios_Bomberos',
  'guardia-civil': 'Ejercicios_Guardia_Civil',
  'policia-nacional': 'Ejercicios_Policia_Nacional',
  'policia-local': 'Ejercicios_Policia_Local'
};

// Nombre visible por oposición (para methodology_type y textos del plan).
const OPOSICION_LABELS = {
  bomberos: 'Bomberos',
  'guardia-civil': 'Guardia Civil',
  'policia-nacional': 'Policía Nacional',
  'policia-local': 'Policía Local'
};

// Configuración por nivel: frecuencia semanal y duración por defecto.
const OPOSICION_LEVELS = {
  principiante: {
    name: 'Principiante',
    description: 'Base física general: acondicionamiento y técnica de las pruebas.',
    duration_weeks: 8,
    sessions_per_week: 3
  },
  intermedio: {
    name: 'Intermedio',
    description: 'Especialización: acercarse a las marcas de apto en todas las pruebas.',
    duration_weeks: 10,
    sessions_per_week: 4
  },
  avanzado: {
    name: 'Avanzado',
    description: 'Alto rendimiento: superar marcas mínimas y maximizar puntuación.',
    duration_weeks: 12,
    sessions_per_week: 5
  }
};

const EJERCICIOS_POR_SESION = 4;
const DELOAD_EVERY = 4;
const DELOAD_VOLUME_FACTOR = 0.6;
const DEFAULT_REST_SECONDS = 90;

const DEFAULT_DAY_LABELS = {
  3: ['Lunes', 'Miércoles', 'Viernes'],
  4: ['Lunes', 'Martes', 'Jueves', 'Viernes'],
  5: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'],
  6: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
};

export function isOposicion(methodology) {
  return Object.prototype.hasOwnProperty.call(OPOSICION_TABLES, normalizeOposicionId(methodology));
}

export function normalizeOposicionId(methodology) {
  const v = String(methodology || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/_/g, '-')
    .trim();
  if (v.includes('bombero')) return 'bomberos';
  if (v.includes('guardia')) return 'guardia-civil';
  if (v.includes('policia-nacional') || v.includes('nacional')) return 'policia-nacional';
  if (v.includes('policia-local') || v.includes('local')) return 'policia-local';
  if (v === 'policia' || v === 'policía') return 'policia-local';
  return v;
}

function normalizeLevel(rawLevel) {
  const lvl = String(rawLevel || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  if (lvl.includes('avanz')) return 'avanzado';
  if (lvl.includes('inter')) return 'intermedio';
  return 'principiante';
}

function levelsUpTo(levelKey) {
  const order = ['Principiante', 'Intermedio', 'Avanzado'];
  const idx = { principiante: 0, intermedio: 1, avanzado: 2 }[levelKey] ?? 0;
  return order.slice(0, idx + 1);
}

/**
 * Parsea "3-5 x 15-20 reps (H)" → { series:'3-5', reps:'15-20 reps (H)' }.
 * Tolera formatos heterogéneos ("30 min variado", "3-5 ascensos", "1 intento").
 */
function parseSeriesReps(raw) {
  const value = String(raw || '').trim();
  if (!value) return { series: '', reps: '' };
  const m = value.match(/^([\d]+(?:\s*-\s*[\d]+)?)\s*x\s*(.+)$/i);
  if (m) return { series: m[1].replace(/\s+/g, ''), reps: m[2].trim() };
  return { series: '', reps: value };
}

function parseSeriesCount(seriesStr) {
  const m = String(seriesStr || '').match(/\d+/);
  const n = m ? parseInt(m[0], 10) : 0;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Convierte una fila de la tabla de oposición en un ejercicio del plan.
 * Incluye tanto los campos genéricos que consume el reproductor (nombre,
 * series, reps_objetivo, descanso_seg, gif_url, como_hacerlo…) como los
 * específicos de oposición (tipo_prueba, baremos, errores_evitar).
 */
function toPlanExercise(ex, orden, sessionId, { isDeload = false } = {}) {
  const { series: seriesRaw, reps } = parseSeriesReps(ex.series_reps_objetivo);
  const baseSeries = parseSeriesCount(seriesRaw);
  let series = seriesRaw || (baseSeries ? String(baseSeries) : '');
  let notas = ex.notas || '';

  if (isDeload && baseSeries > 1) {
    const reduced = Math.max(1, Math.round(baseSeries * DELOAD_VOLUME_FACTOR));
    series = String(reduced);
    notas = 'Semana de descarga: reduce el volumen, mantén la técnica y recupera.';
  }

  return {
    id: `${sessionId}-E${orden}`,
    orden,
    exercise_id: ex.exercise_id,
    nombre: ex.nombre,
    categoria: ex.categoria,
    tipo_prueba: ex.tipo_prueba,
    tipo_ejercicio: 'oposicion',
    series,
    reps_objetivo: reps,
    series_reps_objetivo: ex.series_reps_objetivo || null,
    descanso_seg: ex.descanso_seg ?? DEFAULT_REST_SECONDS,
    intensidad: ex.intensidad || null,
    equipamiento: ex.equipamiento || null,
    gif_url: ex.gif_url || null,
    como_hacerlo: ex.ejecucion || null,
    consejos: ex.consejos || null,
    errores_comunes: ex.errores_evitar || null,
    baremo_hombres: ex.baremo_hombres || null,
    baremo_mujeres: ex.baremo_mujeres || null,
    es_deload: isDeload,
    notas
  };
}

/**
 * Construye `frecuencia` plantillas de sesión distribuyendo las categorías por
 * round-robin, rotando la categoría inicial cada día para variar el énfasis.
 * Genérico: funciona con cualquier conjunto de categorías del catálogo.
 */
function buildTemplates(exercisesByCategory, frecuencia) {
  const categorias = Object.keys(exercisesByCategory).filter((c) => exercisesByCategory[c].length > 0);
  const cursors = Object.fromEntries(categorias.map((c) => [c, 0]));
  const allExercises = Object.values(exercisesByCategory).flat();
  const templates = [];

  for (let d = 0; d < frecuencia; d++) {
    const chosen = [];
    const chosenIds = new Set();
    const gruposOrden = [];
    // Orden de categorías rotado por día (concurrente: cada sesión toca varias).
    const rotated = categorias.map((_, i) => categorias[(i + d) % categorias.length]);
    let guard = 0;
    while (chosen.length < EJERCICIOS_POR_SESION && guard < categorias.length * 4) {
      for (const cat of rotated) {
        if (chosen.length >= EJERCICIOS_POR_SESION) break;
        const poolCat = exercisesByCategory[cat];
        if (!poolCat || poolCat.length === 0) continue;
        // Busca el siguiente ejercicio no usado en esta sesión.
        let picked = null;
        for (let k = 0; k < poolCat.length; k++) {
          const ex = poolCat[(cursors[cat] + k) % poolCat.length];
          if (!chosenIds.has(ex.exercise_id)) {
            picked = ex;
            cursors[cat] = (cursors[cat] + k + 1) % poolCat.length;
            break;
          }
        }
        if (picked) {
          chosen.push(picked);
          chosenIds.add(picked.exercise_id);
          if (!gruposOrden.includes(picked.categoria)) gruposOrden.push(picked.categoria);
        }
      }
      guard += 1;
    }
    // Relleno anti-vacío con cualquier ejercicio disponible.
    if (chosen.length < EJERCICIOS_POR_SESION) {
      for (const ex of allExercises) {
        if (chosen.length >= EJERCICIOS_POR_SESION) break;
        if (chosenIds.has(ex.exercise_id)) continue;
        chosen.push(ex);
        chosenIds.add(ex.exercise_id);
        if (!gruposOrden.includes(ex.categoria)) gruposOrden.push(ex.categoria);
      }
    }
    const nombre = gruposOrden.slice(0, 2).join(' + ') || `Sesión ${d + 1}`;
    templates.push({ nombre, grupos: gruposOrden, ejercicios: chosen });
  }
  return templates;
}

/**
 * Evaluación de nivel: las oposiciones usan selección manual del asistente,
 * así que devolvemos una evaluación por defecto segura (igual que gimnasio).
 */
export async function evaluateOposicionLevel(methodology, userId) {
  const oposicionId = normalizeOposicionId(methodology);
  logger.info(`🏅 [OPOSICION:${oposicionId}] Evaluación por defecto para usuario ${userId}`);
  return {
    success: true,
    evaluation: {
      recommended_level: 'intermedio',
      confidence: 0.5,
      reasoning:
        'Nivel por defecto para oposiciones; ajusta manualmente según tu forma física y cercanía a las marcas de apto.',
      key_indicators: [],
      suggested_focus_areas: []
    }
  };
}

/**
 * Genera el plan de oposición.
 * @param {string} methodology - 'bomberos' | 'guardia-civil' | 'policia-nacional' | 'policia-local'
 * @param {string} userId
 * @param {object} planData - { selectedLevel, goals, priorityTests, customWeeks/planDuration, ... }
 */
export async function generateOposicionPlan(methodology, userId, planData = {}) {
  const startedAt = Date.now();
  const oposicionId = normalizeOposicionId(methodology);
  const tableName = OPOSICION_TABLES[oposicionId];
  if (!tableName) {
    throw new Error(`Oposición no soportada: ${methodology}`);
  }
  const label = OPOSICION_LABELS[oposicionId];

  const levelKey = normalizeLevel(
    planData.selectedLevel || planData.level || planData.aiEvaluation?.recommended_level
  );
  const levelConfig = OPOSICION_LEVELS[levelKey];
  const frecuencia = levelConfig.sessions_per_week;
  const customWeeks = Number(
    planData.customWeeks || planData.planDuration || planData.versionConfig?.customWeeks
  );
  const totalWeeks =
    Number.isFinite(customWeeks) && customWeeks >= 4 && customWeeks <= 24
      ? customWeeks
      : levelConfig.duration_weeks;

  logger.info(
    `🏅 [OPOSICION:${oposicionId}] Nivel ${levelConfig.name}, ${frecuencia} días/sem, ${totalWeeks} semanas`
  );

  // 1) Cargar ejercicios de ENTRENAMIENTO (no las pruebas oficiales) del nivel acumulativo.
  const niveles = levelsUpTo(levelKey);
  const { rows: exercises } = await pool.query(
    `SELECT exercise_id, nombre, nivel, categoria, tipo_prueba, series_reps_objetivo,
            intensidad, descanso_seg, equipamiento, notas, ejecucion, consejos,
            errores_evitar, baremo_hombres, baremo_mujeres, gif_url
       FROM app."${tableName}"
      WHERE tipo_prueba <> 'Oficial'
        AND nivel = ANY($1::text[])
        AND nombre IS NOT NULL AND btrim(nombre) <> ''
      ORDER BY categoria, exercise_id`,
    [niveles]
  );

  if (!exercises || exercises.length === 0) {
    throw new Error(
      `No hay ejercicios de entrenamiento para la oposición ${label} (${tableName}); siembra el catálogo primero.`
    );
  }

  // 2) Pruebas oficiales (objetivo del plan) para mostrar marcas/baremos.
  const { rows: oficiales } = await pool.query(
    `SELECT nombre, categoria, baremo_hombres, baremo_mujeres
       FROM app."${tableName}"
      WHERE tipo_prueba = 'Oficial'
      ORDER BY exercise_id`
  );

  // 3) Agrupar por categoría.
  const exercisesByCategory = {};
  for (const ex of exercises) {
    (exercisesByCategory[ex.categoria] ||= []).push(ex);
  }

  // 4) Plantillas de sesión (selección única reutilizada cada semana).
  const templates = buildTemplates(exercisesByCategory, frecuencia);
  const dayLabels = DEFAULT_DAY_LABELS[frecuencia] || DEFAULT_DAY_LABELS[3];

  // 5) Expandir a semanas con descarga periódica.
  const semanas = [];
  const isDeloadWeek = (w) => w % DELOAD_EVERY === 0;
  for (let w = 1; w <= totalWeeks; w++) {
    const deload = isDeloadWeek(w);
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
          ? 'Semana de descarga: baja el volumen, cuida la técnica y llega fresco a la siguiente carga.'
          : 'Entrena de forma concurrente: calidad técnica en cada prueba y progresa hacia tu marca de apto.',
        grupos_musculares: tpl.grupos,
        es_deload: deload,
        ejercicios: tpl.ejercicios.map((ex, eIdx) =>
          toPlanExercise(ex, eIdx + 1, sessionId, { isDeload: deload })
        )
      };
    });

    semanas.push({
      numero: w,
      tipo: deload ? 'deload' : 'entrenamiento',
      es_deload: deload,
      objetivo: deload
        ? 'Semana de descarga: recuperación y consolidación técnica.'
        : `Semana ${w}/${totalWeeks}: preparación concurrente de las pruebas físicas. ${levelConfig.description}`,
      sesiones
    });
  }

  // 6) Estructura del plan.
  const fechaInicio = new Date().toISOString();
  const plan = {
    metodologia: label,
    tipo: 'oposicion',
    oposicion: oposicionId,
    version: 'oposicion_v1',
    nivel: levelConfig.name,
    total_weeks: totalWeeks,
    duracion_total_semanas: totalWeeks,
    frecuencia_semanal: frecuencia,
    fecha_inicio: fechaInicio,
    sessions_per_week: frecuencia,
    objetivo: planData.goals || `Superar las pruebas físicas de ${label}.`,
    pruebas_objetivo: oficiales.map((o) => ({
      nombre: o.nombre,
      categoria: o.categoria,
      baremo_hombres: o.baremo_hombres,
      baremo_mujeres: o.baremo_mujeres
    })),
    pruebas_prioritarias: Array.isArray(planData.priorityTests) ? planData.priorityTests : [],
    configuracion: {
      progression_type: 'concurrent_capacities',
      deload_every_weeks: DELOAD_EVERY,
      deload_volume_factor: DELOAD_VOLUME_FACTOR,
      sessions_per_week: frecuencia,
      duration_weeks: totalWeeks,
      rest_default_seconds: DEFAULT_REST_SECONDS,
      source: 'oposicion_v1_catalog'
    },
    semanas
  };

  // 7) Persistir como draft (la activación/fecha de inicio la fija el frontend al confirmar).
  const planResult = await pool.query(
    `INSERT INTO app.methodology_plans (
       user_id, methodology_type, plan_data, generation_mode, status, created_at
     )
     VALUES ($1, $2, $3, $4, $5, NOW())
     RETURNING id`,
    [userId, label, JSON.stringify(plan), 'manual', 'draft']
  );

  const methodologyPlanId = planResult.rows[0].id;
  plan.methodologyPlanId = methodologyPlanId;

  const processingTime = Math.round((Date.now() - startedAt) / 100) / 10;
  logger.info(`✅ [OPOSICION:${oposicionId}] Plan generado con ID ${methodologyPlanId} (${processingTime}s)`);

  return {
    success: true,
    plan,
    planId: methodologyPlanId,
    methodologyPlanId,
    methodology: oposicionId,
    metadata: {
      plan_start_date: fechaInicio.split('T')[0],
      processing_time_seconds: processingTime,
      generatedAt: fechaInicio,
      level: levelConfig.name,
      oposicion: label,
      total_exercises_pool: exercises.length
    }
  };
}

/**
 * Niveles disponibles para la UI.
 */
export function getOposicionLevels() {
  return OPOSICION_LEVELS;
}
