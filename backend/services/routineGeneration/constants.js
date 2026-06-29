/**
 * Constantes compartidas para Routine Generation
 * @module routineGeneration/constants
 */

export const DEFAULT_VALUES = {
  FRECUENCIA_SEMANAL: 5,
  EJERCICIOS_POR_DIA: 8,
  SEMANAS_ENTRENAMIENTO: 4,
  NIVEL_ACTIVIDAD: 'moderado',
  OBJETIVO_PRINCIPAL: 'general'
};

export const NIVELES_ENTRENAMIENTO = {
  PRINCIPIANTE: 'principiante',
  INTERMEDIO: 'intermedio',
  AVANZADO: 'avanzado'
};

export const METODOLOGIAS = {
  CALISTENIA: 'calistenia',
  CROSSFIT: 'crossfit',
  FUNCIONAL: 'funcional',
  GIMNASIO: 'gimnasio',
  CASA: 'casa',
  HEAVY_DUTY: 'heavy-duty',
  POWERLIFTING: 'powerlifting',
  HALTEROFILIA: 'halterofilia'
};

export const PLAN_STATUS = {
  DRAFT: 'draft',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
};

export const DISTRIBUTION_OPTIONS = {
  EXTRA_WEEK: 'extra_week',
  REDUCE_DAYS: 'reduce_days',
  EXTEND_PLAN: 'extend_plan'
};

export const DIAS_SEMANA = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];

export const DIAS_SEMANA_ABREV = {
  L: 'lunes',
  M: 'martes',
  X: 'miercoles',
  J: 'jueves',
  V: 'viernes',
  S: 'sabado',
  D: 'domingo'
};
