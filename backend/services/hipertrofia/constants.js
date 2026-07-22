/**
 * Constantes compartidas para HipertrofiaV2
 */

export const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

export const MUSCLE_TO_CATEGORY_MAP = {
  'Pecho': 'Pecho',
  'Tríceps': 'Tríceps',
  'Triceps': 'Tríceps',
  'Espalda': 'Espalda',
  'Bíceps': 'Bíceps',
  'Biceps': 'Bíceps',
  'Cuádriceps': 'Piernas (cuádriceps)',
  'Cuadriceps': 'Piernas (cuádriceps)',
  'Femoral': 'Piernas (femoral)',
  'Glúteos': 'Glúteos',
  'Gluteos': 'Glúteos',
  'Hombro': 'Hombro',
  'Core': 'Core'
};

export const EXERCISE_TYPE_ORDER = {
  'multiarticular': 1,
  'unilateral': 2,
  'analitico': 3
};

export const DEFAULT_WEEKS_BY_LEVEL = {
  'Principiante': 10,
  'Intermedio': 12,
  'Avanzado': 12
};

export const CYCLE_LENGTH = 5; // D1-D5

export const WEEK_0_CONFIG = {
  intensity: 70,
  rir_target: '4-5',
  note: 'SEMANA DE CALIBRACIÓN: Prioriza técnica sobre carga'
};
