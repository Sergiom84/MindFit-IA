/**
 * Configuración de niveles para oposiciones de Bomberos
 * Basado en el patrón de HipertrofiaLevels.js
 *
 * @author Claude Code - Sistema de Oposiciones
 * @version 1.0.0
 * @date 2025-10-20
 */

// Configuración principal de niveles para Bomberos
export const BOMBEROS_LEVELS = {
  PRINCIPIANTE: {
    id: 'principiante',
    name: 'Principiante',
    displayName: 'PRINCIPIANTE - Preparación Base',
    color: 'blue',
    icon: '🔵',
    description: 'Desarrollo de capacidades físicas básicas para las pruebas',
    trainingFrequency: '4-5 días/semana',
    sessionDuration: '60-90 min',
    characteristics: [
      '🎯 Enfoque en técnica y acondicionamiento general',
      '📈 Desarrollo progresivo de fuerza y resistencia',
      '🏊 Aprendizaje/mejora de natación',
      '💪 Base para dominadas y trepa de cuerda',
      '🏃 Construcción de base aeróbica'
    ],
    goals: [
      'Dominar la técnica de todas las pruebas',
      'Alcanzar mínimos en al menos 50% de pruebas',
      'Desarrollar resistencia cardiovascular base',
      'Construir fuerza funcional'
    ],
    requirements: {
      dominadas: '3-5 repeticiones',
      carrera_3000m: 'Completar sin parar',
      natacion: 'Nadar 50m continuo',
      experiencia: '0-6 meses de preparación'
    },
    weeklyStructure: {
      lunes: 'Fuerza superior + Natación técnica',
      martes: 'Carrera continua + Core',
      miercoles: 'Circuito funcional + Agilidad',
      jueves: 'Natación + Fuerza inferior',
      viernes: 'Carrera intervalos + Potencia',
      sabado: 'Simulacro parcial de pruebas',
      domingo: 'Descanso activo o natación suave'
    }
  },

  INTERMEDIO: {
    id: 'intermedio',
    name: 'Intermedio',
    displayName: 'INTERMEDIO - Especialización',
    color: 'yellow',
    icon: '🟡',
    description: 'Trabajo específico para alcanzar y superar baremos mínimos',
    trainingFrequency: '5-6 días/semana',
    sessionDuration: '90-120 min',
    characteristics: [
      '🎯 Entrenamiento específico por prueba',
      '📈 Intensidades similares al examen',
      '🏊 Perfeccionamiento técnica natación',
      '💪 Progresión hacia trepa sin piernas',
      '🏃 Mejora de tiempos en carrera'
    ],
    goals: [
      'Superar baremos mínimos en todas las pruebas',
      'Dominar trepa de cuerda con técnica',
      'Mejorar marcas personales 20-30%',
      'Desarrollar resistencia específica'
    ],
    requirements: {
      dominadas: '10-15 repeticiones',
      carrera_3000m: 'Sub 14 minutos',
      natacion_50m: 'Sub 40 segundos',
      trepa: 'Completar 6m con piernas',
      experiencia: '6-12 meses de preparación'
    },
    weeklyStructure: {
      lunes: 'Dominadas + Press banca + Trepa técnica',
      martes: 'Natación velocidad + Buceo',
      miercoles: 'Carrera 3000m + Series 400m',
      jueves: 'Fuerza explosiva + Lanzamientos',
      viernes: 'Natación resistencia + Core',
      sabado: 'Simulacro completo de pruebas',
      domingo: 'Recuperación activa'
    }
  },

  AVANZADO: {
    id: 'avanzado',
    name: 'Avanzado',
    displayName: 'AVANZADO - Alto Rendimiento',
    color: 'red',
    icon: '🔴',
    description: 'Maximización de puntuación en todas las pruebas',
    trainingFrequency: '6 días/semana',
    sessionDuration: '120-150 min',
    characteristics: [
      '🎯 Optimización de marcas para máxima puntuación',
      '📈 Entrenamientos de alta intensidad',
      '🏊 Técnica de competición en natación',
      '💪 Trepa sin piernas en tiempo élite',
      '🏃 Ritmos competitivos en carrera'
    ],
    goals: [
      'Puntuar alto en todas las pruebas (>8/10)',
      'Trepa sin piernas < 12 segundos',
      'Dominadas > 20 repeticiones',
      'Carrera 3000m < 11 minutos'
    ],
    requirements: {
      dominadas: '20+ repeticiones',
      carrera_3000m: 'Sub 11:30 minutos',
      natacion_50m: 'Sub 32 segundos',
      trepa: '6m sin piernas < 15 seg',
      experiencia: '12+ meses de preparación'
    },
    weeklyStructure: {
      lunes: 'Test dominadas + Trepa velocidad + Fuerza máxima',
      martes: 'Natación competición + Buceo máximo',
      miercoles: 'Series 1000m + Tempo run',
      jueves: 'Potencia + Pliometría + Agilidad',
      viernes: 'Natación táctica + Fuerza resistencia',
      sabado: 'Simulacro oficial con tiempos',
      domingo: 'Técnica específica o descanso'
    }
  }
};

// Función para obtener configuración de nivel
export function getLevelConfig(level) {
  const normalizedLevel = level?.toLowerCase()?.replace(/[^a-z]/g, '');
  return BOMBEROS_LEVELS[normalizedLevel?.toUpperCase()] || BOMBEROS_LEVELS.PRINCIPIANTE;
}

// Función para obtener recomendaciones según nivel
export function getLevelRecommendations(level) {
  const config = getLevelConfig(level);

  return {
    warmup: {
      duration: level === 'principiante' ? '15 min' : level === 'intermedio' ? '12 min' : '10 min',
      focus: 'Movilidad articular + activación específica para pruebas del día'
    },
    cooldown: {
      duration: '10-15 min',
      focus: 'Estiramientos + trabajo de flexibilidad para natación'
    },
    nutrition: {
      pre_workout: 'Carbohidratos 90 min antes + hidratación',
      post_workout: 'Proteína + carbohidratos en 30 min post-entreno',
      hydration: 'Mínimo 3L agua/día, más en días de natación'
    },
    recovery: {
      sleep: 'Mínimo 8 horas para óptima recuperación',
      rest_days: level === 'principiante' ? '2-3/semana' : '1-2/semana',
      techniques: 'Foam rolling, estiramientos, natación suave'
    }
  };
}

// Progresiones específicas por prueba y nivel
export function getTestProgressions(level) {
  switch (level) {
    case 'principiante':
      return {
        dominadas: {
          semana_1_4: 'Negativas + asistidas con banda',
          semana_5_8: 'Series de 3-5 libres',
          semana_9_12: 'Series de 5-8 libres'
        },
        trepa: {
          semana_1_4: 'Trepa con piernas 3m',
          semana_5_8: 'Trepa con piernas 6m',
          semana_9_12: 'Intentos sin piernas 3m'
        },
        natacion: {
          semana_1_4: 'Técnica + 25m continuos',
          semana_5_8: '50m continuos + velocidad',
          semana_9_12: 'Series 50m a ritmo'
        }
      };

    case 'intermedio':
      return {
        dominadas: {
          semana_1_4: 'Series 8-10 + resistencia',
          semana_5_8: 'Series 10-12 + velocidad',
          semana_9_12: 'Test máximo + series 70%'
        },
        trepa: {
          semana_1_4: 'Sin piernas 3-4m',
          semana_5_8: 'Sin piernas 6m técnica',
          semana_9_12: 'Sin piernas velocidad'
        },
        natacion: {
          semana_1_4: 'Series 50m velocidad',
          semana_5_8: '100m ritmo + buceo',
          semana_9_12: 'Simulacros competición'
        }
      };

    case 'avanzado':
      return {
        dominadas: {
          semana_1_4: 'Series 15+ + lastradas',
          semana_5_8: 'Máximas + cluster sets',
          semana_9_12: 'Peaking para máximo'
        },
        trepa: {
          semana_1_4: 'Velocidad máxima 6m',
          semana_5_8: 'Series con fatiga',
          semana_9_12: 'Técnica L-sit speed'
        },
        natacion: {
          semana_1_4: 'Sprint 50m + resistencia',
          semana_5_8: 'Tácticas de competición',
          semana_9_12: 'Tapering y puesta a punto'
        }
      };

    default:
      return getTestProgressions('principiante');
  }
}

// Configuración de volumen e intensidad por nivel
export function getTrainingVolume(level) {
  const volumes = {
    principiante: {
      sets_por_ejercicio: '3-4',
      reps_fuerza: '8-12',
      reps_resistencia: '15-20',
      intensidad_cardio: '60-75% FCmax',
      volumen_semanal: '15-20 horas'
    },
    intermedio: {
      sets_por_ejercicio: '4-5',
      reps_fuerza: '6-10',
      reps_resistencia: '12-15',
      intensidad_cardio: '70-85% FCmax',
      volumen_semanal: '20-25 horas'
    },
    avanzado: {
      sets_por_ejercicio: '5-6',
      reps_fuerza: '3-8',
      reps_resistencia: '10-12',
      intensidad_cardio: '75-95% FCmax',
      volumen_semanal: '25-30 horas'
    }
  };

  return volumes[level] || volumes.principiante;
}

// Evaluación de preparación para el examen
export function getReadinessAssessment(level, weeksCompleted) {
  const readiness = {
    principiante: {
      4: '25% - Base en construcción',
      8: '50% - Técnica en desarrollo',
      12: '75% - Listo para intentar mínimos',
      16: '85% - Preparado con margen'
    },
    intermedio: {
      4: '60% - Refinando técnica',
      8: '75% - Acercándose a baremos',
      12: '90% - Listo para el examen',
      16: '95% - Óptimo con margen'
    },
    avanzado: {
      4: '80% - Optimizando marcas',
      8: '90% - Alto rendimiento',
      12: '95% - Pico de forma',
      16: '98% - Élite preparado'
    }
  };

  const levelData = readiness[level] || readiness.principiante;
  const weekKey = Object.keys(levelData).reduce((prev, curr) =>
    Math.abs(curr - weeksCompleted) < Math.abs(prev - weeksCompleted) ? curr : prev
  );

  return levelData[weekKey];
}