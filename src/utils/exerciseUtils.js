/**
 * 🏋️ Exercise Utilities - Utilidades para ejercicios
 * 
 * RAZONAMIENTO:
 * - Extraído de TodayTrainingTab.jsx para reducir complejidad
 * - Funciones reutilizables en múltiples componentes
 * - Mantiene mapeo centralizado de nombres de ejercicios
 */

import { Heart, Frown, AlertOctagon } from 'lucide-react';

/**
 * Formatear nombres de ejercicios de IDs a nombres legibles
 */
export const formatExerciseName = (exerciseName) => {
  if (!exerciseName) return 'Ejercicio desconocido';
  
  // Si ya es un nombre formateado (contiene espacios), devolverlo tal como está
  if (exerciseName.includes(' ') || exerciseName.includes('(')) {
    return exerciseName;
  }
  
  // Mapeo de IDs legacy a nombres reales (por compatibilidad)
  const exerciseNameMap = {
    'flexion-contra-pared': 'Flexión contra pared',
    'flexiones-pared': 'Flexiones contra pared',
    'flexiones-inclinadas': 'Flexiones inclinadas',
    'flexiones-rodillas': 'Flexiones de rodillas',
    'flexion-estandar': 'Flexión estándar',
    'flexiones-diamante': 'Flexiones diamante',
    'muscle-up-en-barra-strict': 'Muscle-up en barra (strict)',
    'dominadas-asistidas': 'Dominadas asistidas',
    'dominadas-completas': 'Dominadas completas',
    'dominadas-supinas': 'Dominadas supinas',
    'dominadas-comando': 'Dominadas comando',
    'colgado-activo': 'Colgado activo',
    'dominadas-negativas': 'Dominadas negativas',
    'plancha-frontal': 'Plancha frontal',
    'plancha-lateral': 'Plancha lateral',
    'fondos-en-paralelas': 'Fondos en paralelas',
    'fondos-banco': 'Fondos en banco',
    'fondos-paralelas': 'Fondos en paralelas',
    'l-sit-progresion': 'L-sit progresión',
    'toes-to-bar': 'Toes to bar',
    'pistol-asistida': 'Pistol squat asistida',
    'sentadillas-basicas': 'Sentadillas básicas',
    'sentadillas-salto': 'Sentadillas con salto',
    'zancadas-estaticas': 'Zancadas estáticas',
    'zancadas-caminando': 'Zancadas caminando'
  };
  
  // Si existe en el mapeo, usar el nombre real
  if (exerciseNameMap[exerciseName]) {
    return exerciseNameMap[exerciseName];
  }
  
  // Si no existe, formatear el ID: remover guiones y capitalizar
  return exerciseName
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

/**
 * Obtener icono y estilos para sentimientos de feedback
 */
export const getSentimentIcon = (sentiment) => {
  switch (sentiment) {
    case 'like':
      return {
        Icon: Heart,
        color: 'text-pink-400',
        bg: 'bg-pink-900/30',
        border: 'border-pink-500/30',
        label: 'Me gusta'
      };
    case 'dislike':
      return {
        Icon: Frown,
        color: 'text-orange-400',
        bg: 'bg-orange-900/30',
        border: 'border-orange-500/30',
        label: 'No me gusta'
      };
    case 'hard':
      return {
        Icon: AlertOctagon,
        color: 'text-red-400',
        bg: 'bg-red-900/30',
        border: 'border-red-500/30',
        label: 'Muy difícil'
      };
    default:
      return null;
  }
};

/**
 * Computar resumen de sesión con estadísticas de ejercicios
 */
export const computeSessionSummary = (status) => {
  if (!status) return status;
  
  const exercises = Array.isArray(status.exercises) ? status.exercises : [];
  const completedCount = exercises.filter(ex => (ex.status || '').toLowerCase() === 'completed').length;
  const skippedCount = exercises.filter(ex => (ex.status || '').toLowerCase() === 'skipped').length;
  const cancelledCount = exercises.filter(ex => (ex.status || '').toLowerCase() === 'cancelled').length;
  
  return {
    ...status,
    summary: {
      ...(status.summary || {}),
      completed: completedCount,
      skipped: skippedCount,
      cancelled: cancelledCount,
      isComplete: exercises.length > 0 && completedCount === exercises.length
    }
  };
};

/**
 * Obtener estado de ejercicio con icono y color
 */
export const getExerciseStatus = (exercise) => {
  if (!exercise) {
    return {
      icon: '❓',
      color: 'text-gray-400',
      bg: 'bg-gray-900/20',
      label: 'Sin datos'
    };
  }

  const status = (exercise.status || '').toLowerCase();
  
  switch (status) {
    case 'completed':
      return {
        icon: '✅',
        color: 'text-green-400',
        bg: 'bg-green-900/20',
        border: 'border-green-500/20',
        label: 'Completado'
      };
    case 'skipped':
      return {
        icon: '⏭️',
        color: 'text-orange-400',
        bg: 'bg-orange-900/20',
        border: 'border-orange-500/20',
        label: 'Saltado'
      };
    case 'cancelled':
      return {
        icon: '❌',
        color: 'text-red-400',
        bg: 'bg-red-900/20',
        border: 'border-red-500/20',
        label: 'Cancelado'
      };
    default:
      return {
        icon: '⏳',
        color: 'text-gray-400',
        bg: 'bg-gray-900/20',
        border: 'border-gray-500/20',
        label: 'Pendiente'
      };
  }
};

/**
 * Extraer patrones de movimiento únicos de una sesión
 * Considera estructuras diferentes (ejercicios directos o dentro de bloques)
 */
export const extractSessionPatterns = (session) => {
  if (!session) return [];

  const exercises = [];

  if (Array.isArray(session?.ejercicios)) {
    exercises.push(...session.ejercicios);
  }

  if (Array.isArray(session?.exercises)) {
    exercises.push(...session.exercises);
  }

  if (Array.isArray(session?.bloques)) {
    session.bloques.forEach((bloque) => {
      if (Array.isArray(bloque?.ejercicios)) {
        exercises.push(...bloque.ejercicios);
      }
    });
  }

  const patterns = exercises
    .map((exercise) =>
      exercise?.patron_movimiento ||
      exercise?.movement_pattern ||
      exercise?.patron ||
      exercise?.pattern ||
      null
    )
    .filter(Boolean)
    .map((pattern) => pattern.toString().toLowerCase().trim())
    .filter((pattern) => pattern.length > 0);

  return Array.from(new Set(patterns));
};
