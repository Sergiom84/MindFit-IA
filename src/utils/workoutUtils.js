import {
  METHODOLOGY_DESCRIPTIONS,
  EXERCISE_STATUS,
  STATUS_COLORS,
  SENTIMENT_COLORS,
  SENTIMENT_TYPES
} from '../constants/workoutConstants';

/**
 * Obtiene la descripción de una metodología
 */
export const getMethodologyDescription = (methodology) => {
  const fallback = 'Entrenamiento personalizado adaptado a tu perfil';
  if (!methodology) return fallback;
  const desc = METHODOLOGY_DESCRIPTIONS[methodology];
  if (!desc) return fallback;
  // Las descripciones pueden ser strings o objetos multiidioma { es, en }.
  // Devolver siempre un string (antes se devolvía el objeto → "[object Object]").
  if (typeof desc === 'string') return desc;
  return desc.es || desc.en || fallback;
};

/**
 * Obtiene el nombre principal de la metodología desde múltiples fuentes
 */
export const getMethodologyName = (plan, session) => {
  return plan?.selected_style ||
         plan?.metodologia ||
         plan?.methodologyType ||      // camelCase del WorkoutContext
         plan?.methodology_type ||     // snake_case de BD
         session?.methodology_type ||
         'Entrenamiento de Hoy';
};

/**
 * Obtiene la duración estimada desde múltiples fuentes
 */
export const getEstimatedDuration = (plan, session) => {
  // Desde plan
  const semana1 = Array.isArray(plan?.semanas) ? plan.semanas[0] : null;
  const ses = semana1 ? (semana1.sesiones || [])[0] : null;
  const planDuration = ses?.duracion_sesion_min;

  // Desde session
  const sessionDuration = session?.estimated_min;

  const duration = planDuration || sessionDuration;
  return duration ? `${duration} min` : '—';
};

/**
 * Obtiene el equipamiento desde múltiples fuentes
 * Integrado con Supabase: considera el methodology_type para valores por defecto
 */
export const getEquipment = (plan) => {
  // Verificar campos explícitos primero
  if (plan?.equipamiento) return plan.equipamiento;
  if (plan?.equipment) return plan.equipment;

  // Fallback basado en tipo de metodología (desde Supabase)
  const methodologyType = plan?.methodology_type || plan?.selected_style;

  if (methodologyType === 'Calistenia') return 'Mínimo';
  if (methodologyType === 'Powerlifting') return 'Completo';
  if (methodologyType === 'Crossfit') return 'Intermedio';

  // Fallback general
  return 'Mínimo';
};

/**
 * Obtiene las clases CSS para un estado de ejercicio
 */
export const getStatusClasses = (status) => {
  const s = (status || '').toLowerCase();
  // Clases explícitas para que Tailwind las incluya en el build
  if (s === 'completed') return { bg: 'bg-green-900/20', border: 'border-green-600' };
  if (s === 'cancelled') return { bg: 'bg-red-900/20', border: 'border-red-600' };
  if (s === 'skipped') return { bg: 'bg-gray-800/50', border: 'border-gray-700' };
  if (s === 'in_progress') return { bg: 'bg-yellow-500/10', border: 'border-yellow-500/30' };
  return { bg: 'bg-gray-800/40', border: 'border-gray-700' };
};

/**
 * Renderiza el pill de estado de ejercicio
 */
export const getStatusPill = (status) => {
  const normalizedStatus = (status || '').toLowerCase();

  switch (normalizedStatus) {
    case EXERCISE_STATUS.COMPLETED:
      return {
        text: 'Completado',
        className: 'ml-2 text-green-300 text-xs inline-flex items-center gap-1',
        showIcon: true,
        iconName: 'CheckCircle'
      };
    case EXERCISE_STATUS.CANCELLED:
      return {
        text: 'Cancelado',
        className: 'ml-2 text-red-300 text-xs',
        showIcon: false
      };
    case EXERCISE_STATUS.SKIPPED:
      return {
        text: 'Saltado',
        className: 'ml-2 text-gray-400 text-xs',
        showIcon: false
      };
    default:
      return null;
  }
};

/**
 * Obtiene el display para sentimientos
 */
export const getSentimentDisplay = (sentiment) => {
  const normalizedSentiment = (sentiment || '').toLowerCase();

  switch (normalizedSentiment) {
    case SENTIMENT_TYPES.LIKE:
      return {
        text: 'Me gusta',
        className: 'ml-2 text-green-300 text-xs inline-flex items-center gap-1',
        icon: '❤️'
      };
    case SENTIMENT_TYPES.HARD:
      return {
        text: 'Es difícil',
        className: 'ml-2 text-red-300 text-xs inline-flex items-center gap-1',
        icon: '⚠️',
        showLucideIcon: true,
        lucideIcon: 'AlertTriangle'
      };
    case SENTIMENT_TYPES.DISLIKE:
      return {
        text: 'No me gusta',
        className: 'ml-2 text-orange-300 text-xs inline-flex items-center gap-1',
        icon: '👎'
      };
    default:
      return null;
  }
};

/**
 * Obtiene el nombre del ejercicio desde múltiples fuentes
 */
export const getExerciseName = (exercise, index) => {
  return exercise.exercise_name ||
         exercise.nombre ||
         `Ejercicio ${index + 1}`;
};

/**
 * Obtiene el número de series desde múltiples fuentes
 */
export const getExerciseSeries = (exercise) => {
  return Number(exercise.series_total || exercise.series) || 3;
};

/**
 * Obtiene las repeticiones
 */
export const getExerciseReps = (exercise) => {
  return exercise.repeticiones || '—';
};

/**
 * Obtiene el tiempo de descanso
 */
export const getRestTime = (exercise) => {
  return Number(exercise.descanso_seg) || 45;
};

/**
 * Obtiene las notas del ejercicio
 */
export const getExerciseNotes = (exercise) => {
  return exercise.notas || exercise.tip || '';
};

/**
 * Obtiene el comentario del feedback
 */
export const getFeedbackComment = (exercise) => {
  return exercise.feedback?.comment || exercise.comment || '';
};

/**
 * Obtiene el sentimiento del feedback
 */
export const getFeedbackSentiment = (exercise) => {
  return exercise.feedback?.sentiment || exercise.sentiment || '';
};

/**
 * Formatea la fecha actual para display
 */
export const getCurrentDateFormatted = () => {
  return new Date().toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'numeric'
  });
};

/**
 * Obtiene el nombre del día desde múltiples fuentes
 */
export const getSessionDayName = (selectedSession, session) => {
  return selectedSession?.dia || session?.day_name || '';
};

export default {
  getMethodologyDescription,
  getMethodologyName,
  getEstimatedDuration,
  getEquipment,
  getStatusClasses,
  getStatusPill,
  getSentimentDisplay,
  getExerciseName,
  getExerciseSeries,
  getExerciseReps,
  getRestTime,
  getExerciseNotes,
  getFeedbackComment,
  getFeedbackSentiment,
  getCurrentDateFormatted,
  getSessionDayName
};