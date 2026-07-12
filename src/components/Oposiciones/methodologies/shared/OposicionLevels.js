/**
 * Niveles compartidos para todas las oposiciones (motor OposicionService).
 * La frecuencia/duración real la fija el backend por nivel; aquí solo UI.
 */
export const OPOSICION_LEVELS = {
  PRINCIPIANTE: {
    id: 'principiante',
    displayName: 'PRINCIPIANTE - Preparación Base',
    icon: '🟦',
    description: 'Base física general y técnica de las pruebas.',
    trainingFrequency: '3 días/semana',
    sessionDuration: '45-60 min'
  },
  INTERMEDIO: {
    id: 'intermedio',
    displayName: 'INTERMEDIO - Especialización',
    icon: '🟨',
    description: 'Acercarse a las marcas de apto en todas las pruebas.',
    trainingFrequency: '4 días/semana',
    sessionDuration: '60-75 min'
  },
  AVANZADO: {
    id: 'avanzado',
    displayName: 'AVANZADO - Alto Rendimiento',
    icon: '🟥',
    description: 'Superar marcas mínimas y maximizar puntuación.',
    trainingFrequency: '5 días/semana',
    sessionDuration: '60-90 min'
  }
};

export function getOposicionLevelConfig(levelId) {
  const key = String(levelId || '').toUpperCase();
  return OPOSICION_LEVELS[key] || OPOSICION_LEVELS.PRINCIPIANTE;
}
