/**
 * Motor compartido de construcción de planes deterministas.
 * @module routineGeneration/methodologies/planEngine
 *
 * Reúne la lógica genérica usada por los generadores por metodología
 * (selección sin repetición, parseo series/reps, expansión a semanas,
 * persistencia y contrato de salida). Cada servicio aporta su pool de
 * ejercicios, sus plantillas de sesión y su mapeo a "ejercicio de plan".
 */

import { pool } from '../../../db.js';

export const DEFAULT_REST_SECONDS = 75;

// Etiquetas de día por defecto según frecuencia semanal.
export const DEFAULT_DAY_LABELS = {
  3: ['Lunes', 'Miércoles', 'Viernes'],
  4: ['Lunes', 'Martes', 'Jueves', 'Viernes'],
  5: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'],
  6: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
};

/**
 * Parsea "5-8x20-30s" → { series: '5-8', reps_objetivo: '20-30s' }.
 * Tolera ausencia de 'x' (usa reps completo) y null.
 */
export function parseSeriesReps(raw, fallback = { series: '3', reps_objetivo: '8-12' }) {
  const value = String(raw || '').trim();
  if (!value) return { ...fallback };
  const idx = value.toLowerCase().indexOf('x');
  if (idx === -1) return { series: fallback.series, reps_objetivo: value };
  return {
    series: value.slice(0, idx).trim() || fallback.series,
    reps_objetivo: value.slice(idx + 1).trim() || fallback.reps_objetivo
  };
}

/**
 * Selector con baraja + cursor por clave (categoría/dominio/bucket): entrega
 * ejercicios sin repetir dentro de una misma sesión; entre sesiones recicla si
 * el pool es pequeño.
 * @param {Object<string, Array>} poolByKey
 */
export function buildExercisePicker(poolByKey) {
  const cursors = {};
  return function pick(key, n) {
    const list = poolByKey[key] || [];
    const out = [];
    if (list.length === 0) return out;
    let cursor = cursors[key] || 0;
    const seen = new Set();
    let guard = 0;
    while (out.length < n && guard < list.length * 2) {
      const ex = list[cursor % list.length];
      cursor += 1;
      guard += 1;
      const id = ex.exercise_id ?? ex.id ?? ex.nombre;
      if (!seen.has(id)) { seen.add(id); out.push(ex); }
    }
    cursors[key] = cursor;
    return out;
  };
}

/**
 * Construye las plantillas de sesión (selección única) a partir de un spec.
 * @param {Array} templateSpecs - [{ nombre, plan: [[key, n], ...], meta? }]
 * @param {function} pick - selector de buildExercisePicker
 * @param {Array} fallbackPool - pool global para evitar sesiones vacías
 */
export function buildTemplates(templateSpecs, pick, fallbackPool = []) {
  return templateSpecs.map((tpl, idx) => {
    const chosen = [];
    const grupos = new Set();
    for (const [key, n] of tpl.plan) {
      for (const ex of pick(key, n)) {
        chosen.push(ex);
        grupos.add(ex.categoria || ex.dominio || key);
      }
    }
    if (chosen.length === 0 && fallbackPool.length > 0) {
      chosen.push(fallbackPool[idx % fallbackPool.length]);
      grupos.add(chosen[0].categoria || chosen[0].dominio || 'general');
    }
    return {
      nombre: tpl.nombre,
      meta: tpl.meta || {},
      grupos_musculares: Array.from(grupos),
      ejercicios: chosen
    };
  });
}

/**
 * Expande plantillas a semanas/sesiones aplicando un mapeo a "ejercicio de plan".
 * @param {object} opts
 * @param {Array}  opts.templates - salida de buildTemplates
 * @param {number} opts.totalWeeks
 * @param {number} opts.frecuencia
 * @param {string} opts.objetivo - objetivo de cada semana
 * @param {string} [opts.coachTip]
 * @param {function} opts.toExercise - (rawEx, orden, sessionId) => ejercicioPlan
 */
export function buildSemanas({ templates, totalWeeks, frecuencia, objetivo, coachTip, toExercise }) {
  const dayLabels = DEFAULT_DAY_LABELS[frecuencia] || DEFAULT_DAY_LABELS[3];
  const semanas = [];
  for (let w = 1; w <= totalWeeks; w++) {
    const sesiones = templates.map((tpl, dIdx) => {
      const sessionId = `W${w}-D${dIdx + 1}`;
      return {
        id: sessionId,
        dia: dayLabels[dIdx] || `Día ${dIdx + 1}`,
        fecha: null,
        orden: dIdx + 1,
        nombre: tpl.nombre,
        descripcion: tpl.meta?.descripcion || `Sesión de ${tpl.nombre.toLowerCase()}`,
        coach_tip: tpl.meta?.coach_tip || coachTip || 'Prioriza la técnica y el control del movimiento.',
        grupos_musculares: tpl.grupos_musculares,
        ...(tpl.meta?.extra || {}),
        ejercicios: tpl.ejercicios.map((ex, eIdx) => toExercise(ex, eIdx + 1, sessionId))
      };
    });
    semanas.push({ numero: w, tipo: 'entrenamiento', objetivo, sesiones });
  }
  return semanas;
}

/**
 * Persiste el plan como draft en app.methodology_plans y devuelve el id.
 */
export async function persistPlanDraft(userId, methodologyType, plan, client = pool) {
  const res = await client.query(`
    INSERT INTO app.methodology_plans (
      user_id, methodology_type, plan_data, generation_mode, status, created_at
    )
    VALUES ($1, $2, $3, $4, $5, NOW())
    RETURNING id
  `, [userId, methodologyType, JSON.stringify(plan), 'manual', 'draft']);
  return res.rows[0].id;
}

/**
 * Construye el objeto de respuesta con el contrato que espera el frontend.
 */
export function buildPlanResult({ plan, planId, methodology, startedAt, extraMeta = {} }) {
  const processingTime = Math.round((Date.now() - startedAt) / 100) / 10;
  return {
    success: true,
    plan: { ...plan, methodologyPlanId: planId },
    planId,
    methodologyPlanId: planId,
    methodology,
    metadata: {
      plan_start_date: new Date().toISOString().split('T')[0],
      processing_time_seconds: processingTime,
      generatedAt: new Date().toISOString(),
      ...extraMeta
    }
  };
}
