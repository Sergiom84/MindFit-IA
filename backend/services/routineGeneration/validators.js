/**
 * Validadores y normalizadores de datos
 * @module routineGeneration/validators
 */

import { DEFAULT_VALUES } from './constants.js';

/**
 * Normalizar perfil de usuario para IA
 * @param {object} profile - Perfil bruto de BD
 * @returns {object} Perfil normalizado
 */
export function normalizeUserProfile(profile) {
  return {
    id: profile.id,
    nombre: profile.nombre,
    apellido: profile.apellido,
    email: profile.email,
    edad: profile.edad != null ? Number(profile.edad) : null,
    sexo: profile.sexo,
    peso_kg: parseFloat(profile.peso) || null,
    altura_cm: parseFloat(profile.altura) || null,
    años_entrenando: profile.anos_entrenando || 0,
    nivel_entrenamiento: profile.nivel_entrenamiento || 'principiante',
    objetivo_principal: profile.objetivo_principal || DEFAULT_VALUES.OBJETIVO_PRINCIPAL,
    nivel_actividad: profile.nivel_actividad || DEFAULT_VALUES.NIVEL_ACTIVIDAD,
    grasa_corporal: parseFloat(profile.grasa_corporal) || null,
    masa_magra: parseFloat(profile.masa_magra) || null,
    pecho: parseFloat(profile.pecho) || null,
    brazos: parseFloat(profile.brazos) || null,
    alergias: profile.alergias || [],
    medicamentos: profile.medicamentos || [],
    suplementacion: profile.suplementacion || [],
    limitaciones_fisicas: profile.limitaciones_fisicas || null,
    // Preferencias de entrenamiento
    usar_preferencias_ia: profile.usar_preferencias_ia || false,
    dias_preferidos_entrenamiento: profile.dias_preferidos_entrenamiento || ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'],
    ejercicios_por_dia_preferido: profile.ejercicios_por_dia_preferido || DEFAULT_VALUES.EJERCICIOS_POR_DIA,
    semanas_entrenamiento: profile.semanas_entrenamiento || DEFAULT_VALUES.SEMANAS_ENTRENAMIENTO
  };
}

/**
 * Normaliza planes de entrenamiento en casa para mantener compatibilidad
 * @param {object} plan - Plan bruto de IA
 * @returns {object} Plan normalizado
 */
export function normalizeCasaPlan(plan) {
  if (!plan || typeof plan !== 'object') {
    throw new Error('Plan inválido');
  }

  // Asegurar estructura base
  const normalized = {
    tipo_entrenamiento: plan.tipo_entrenamiento || 'casa',
    frecuencia_por_semana: plan.frecuencia_por_semana || DEFAULT_VALUES.FRECUENCIA_SEMANAL,
    duracion_total_semanas: plan.duracion_total_semanas || DEFAULT_VALUES.SEMANAS_ENTRENAMIENTO,
    semanas: [],
    metadata: plan.metadata || {}
  };

  // Normalizar semanas
  if (Array.isArray(plan.semanas)) {
    normalized.semanas = plan.semanas.map((week, idx) => ({
      numero: week.numero || idx + 1,
      enfoque: week.enfoque || `Semana ${idx + 1}`,
      sesiones: Array.isArray(week.sesiones) ? week.sesiones : []
    }));
  }

  return normalized;
}

/**
 * Validar request de generación de rutina
 * @param {object} body - Request body
 * @throws {Error} Si el request es inválido
 */
export function validateRoutineRequest(body) {
  const errors = [];

  if (!body) {
    throw new Error('Request body requerido');
  }

  // Validar metodología si está presente
  if (body.methodology && typeof body.methodology !== 'string') {
    errors.push('Metodología debe ser string');
  }

  // Validar nivel si está presente
  if (body.nivel && !['principiante', 'intermedio', 'avanzado'].includes(body.nivel)) {
    errors.push('Nivel debe ser: principiante, intermedio o avanzado');
  }

  // Validar frecuencia semanal
  if (body.frecuencia_semanal && (body.frecuencia_semanal < 1 || body.frecuencia_semanal > 7)) {
    errors.push('Frecuencia semanal debe estar entre 1 y 7');
  }

  if (errors.length > 0) {
    throw new Error(`Validación fallida: ${errors.join(', ')}`);
  }

  return true;
}
