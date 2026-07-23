/**
 * Información de pruebas oficiales para oposiciones de Bomberos
 * Baremos orientativos calibrados sobre convocatorias reales (2023-2025):
 * Comunidad de Madrid (natación 50 m, trepa, press banca 40 kg/60 s, velocidad,
 * resistencia), Ayto. de Madrid y estándares de consorcios provinciales para las
 * pruebas que Madrid no incluye (dominadas, balón medicinal, apnea).
 * Los umbrales "apto" coinciden con app."Ejercicios_Bomberos" (parche 07).
 *
 * @author Claude Code - Sistema de Oposiciones
 * @version 1.1.0
 * @date 2026-07-12
 */

// Descargo mostrado junto a los baremos en la UI
export const NOTA_BAREMOS =
  'Marcas orientativas basadas en Comunidad de Madrid y estándares del sector. ' +
  'Cada convocatoria fija sus propias pruebas y marcas: consulta siempre las bases ' +
  'oficiales de tu convocatoria (BOCM / BOP / DOGC).';

// Pruebas oficiales de Bomberos con baremos
export const PRUEBAS_OFICIALES = {
  NATACION_50M: {
    id: 'natacion_50m',
    nombre: 'Natación 50m libre',
    categoria: 'Natación',
    descripcion: 'Nadar 50 metros estilo libre en el menor tiempo posible',
    baremos: {
      hombres: {
        excelente: '< 35 seg',
        notable: '35-43 seg',
        apto: '43-51 seg',
        eliminatorio: '> 51 seg'
      },
      mujeres: {
        excelente: '< 38 seg',
        notable: '38-46 seg',
        apto: '46-53 seg',
        eliminatorio: '> 53 seg'
      }
    },
    puntuacion_maxima: 10,
    tecnica_clave: 'Salida desde el agua, técnica crol eficiente, viraje rápido',
    errores_comunes: [
      'Salida lenta desde el agua',
      'Técnica de brazada ineficiente',
      'Respiración excesiva',
      'Tocar corcheras (descalificación)'
    ],
    entrenamiento_especifico: 'Series de velocidad, técnica de salida, trabajo de potencia'
  },

  NATACION_100M: {
    id: 'natacion_100m',
    nombre: 'Natación 100m libre',
    categoria: 'Natación',
    descripcion: 'Nadar 100 metros estilo libre (algunas convocatorias)',
    baremos: {
      hombres: {
        excelente: '< 1:25 min',
        notable: '1:25-1:35 min',
        apto: '1:35-1:45 min',
        eliminatorio: '> 1:45 min'
      },
      mujeres: {
        excelente: '< 1:35 min',
        notable: '1:35-1:45 min',
        apto: '1:45-1:55 min',
        eliminatorio: '> 1:55 min'
      }
    },
    puntuacion_maxima: 10,
    tecnica_clave: 'Gestión del ritmo, respiración bilateral, viraje eficiente',
    errores_comunes: [
      'Salir demasiado rápido',
      'Pérdida de técnica por fatiga',
      'Viraje lento o deficiente'
    ],
    entrenamiento_especifico: 'Series fraccionadas, resistencia a la velocidad'
  },

  BUCEO_25M: {
    id: 'buceo_25m',
    nombre: 'Buceo/Apnea 25m',
    categoria: 'Natación',
    descripcion: 'Nadar 25 metros bajo el agua sin respirar',
    baremos: {
      hombres: {
        excelente: '< 20 seg',
        notable: '20-25 seg',
        apto: 'Completar (< 30 seg)',
        eliminatorio: 'No completar'
      },
      mujeres: {
        excelente: '< 25 seg',
        notable: '25-30 seg',
        apto: 'Completar (< 35 seg)',
        eliminatorio: 'No completar'
      }
    },
    puntuacion_maxima: 10,
    tecnica_clave: 'Patada subacuática eficiente, deslizamiento, control de flotabilidad',
    errores_comunes: [
      'Salir a superficie (eliminación)',
      'Patada ineficiente',
      'Excesiva tensión muscular',
      'No tocar pared al final'
    ],
    entrenamiento_especifico: 'Apnea progresiva, técnica de patada, tolerancia CO2',
    seguridad: '⚠️ NUNCA entrenar solo. Supervisión obligatoria.'
  },

  TREPA_CUERDA: {
    id: 'trepa_cuerda',
    nombre: 'Trepa de cuerda 6m',
    categoria: 'Fuerza',
    descripcion: 'Subir la cuerda lisa sin ayuda de piernas (6 m hombres / 5,5 m mujeres)',
    baremos: {
      hombres: {
        excelente: '< 8 seg',
        notable: '8-10 seg',
        apto: '10-12 seg',
        eliminatorio: '> 12 seg o no completar'
      },
      mujeres: {
        excelente: '< 10 seg',
        notable: '10-13 seg',
        apto: '13-15 seg',
        eliminatorio: '> 15 seg o no completar'
      }
    },
    puntuacion_maxima: 10,
    tecnica_clave: 'Técnica española (mano sobre mano), agarre fuerte, ritmo constante',
    errores_comunes: [
      'Usar las piernas (descalificación)',
      'Técnica de agarre incorrecta',
      'Fatiga de antebrazos prematura',
      'No tocar la marca superior'
    ],
    entrenamiento_especifico: 'Dominadas, trabajo de agarre, trepa progresiva',
    equipamiento: 'Cuerda lisa de 30-40mm diámetro'
  },

  DOMINADAS: {
    id: 'dominadas',
    nombre: 'Dominadas máximas',
    categoria: 'Fuerza',
    descripcion: 'Máximo número de dominadas en 30 segundos o sin límite de tiempo',
    baremos: {
      hombres: {
        excelente: '> 20 reps',
        notable: '15-20 reps',
        apto: '12-15 reps',
        eliminatorio: '< 12 reps'
      },
      mujeres: {
        excelente: '> 14 reps',
        notable: '10-14 reps',
        apto: '8-10 reps',
        eliminatorio: '< 8 reps'
      }
    },
    puntuacion_maxima: 10,
    tecnica_clave: 'Agarre pronado, barbilla sobre barra, extensión completa',
    errores_comunes: [
      'No extender brazos completamente',
      'No pasar barbilla sobre barra',
      'Balanceo excesivo (kipping)',
      'Agarre incorrecto'
    ],
    entrenamiento_especifico: 'Series submáximas, negativas, trabajo de resistencia'
  },

  PRESS_BANCA: {
    id: 'press_banca',
    nombre: 'Press banca repeticiones',
    categoria: 'Fuerza',
    descripcion: 'Máximo número de repeticiones con peso fijo',
    baremos: {
      hombres: {
        peso: '40 kg',
        excelente: '> 35 reps',
        notable: '25-35 reps',
        apto: '19-25 reps',
        eliminatorio: '< 19 reps'
      },
      mujeres: {
        peso: '30 kg',
        excelente: '> 28 reps',
        notable: '20-28 reps',
        apto: '15-20 reps',
        eliminatorio: '< 15 reps'
      }
    },
    puntuacion_maxima: 10,
    tecnica_clave: 'Barra al pecho, extensión completa, ritmo constante',
    errores_comunes: [
      'No tocar pecho con la barra',
      'No extender brazos completamente',
      'Rebote en el pecho',
      'Levantar glúteos del banco'
    ],
    entrenamiento_especifico: 'Resistencia muscular, series altas, técnica estricta'
  },

  CARRERA_100M: {
    id: 'carrera_100m',
    nombre: 'Carrera 100m velocidad',
    categoria: 'Carrera',
    descripcion: 'Sprint de 100 metros lisos',
    baremos: {
      hombres: {
        excelente: '< 12 seg',
        notable: '12-13 seg',
        apto: '13-14 seg',
        eliminatorio: '> 14 seg'
      },
      mujeres: {
        excelente: '< 14 seg',
        notable: '14-15 seg',
        apto: '15-16 seg',
        eliminatorio: '> 16 seg'
      }
    },
    puntuacion_maxima: 10,
    tecnica_clave: 'Salida explosiva, fase de aceleración, mantener velocidad máxima',
    errores_comunes: [
      'Salida lenta',
      'Tensión excesiva',
      'Pérdida de velocidad final',
      'Técnica de carrera deficiente'
    ],
    entrenamiento_especifico: 'Series cortas, técnica de carrera, fuerza explosiva'
  },

  CARRERA_3000M: {
    id: 'carrera_3000m',
    nombre: 'Carrera 3000m resistencia',
    categoria: 'Resistencia',
    descripcion: 'Carrera de 3000 metros (7.5 vueltas en pista)',
    baremos: {
      hombres: {
        excelente: '< 11:00 min',
        notable: '11:00-12:00 min',
        apto: '12:00-13:00 min',
        eliminatorio: '> 13:00 min'
      },
      mujeres: {
        excelente: '< 13:00 min',
        notable: '13:00-14:30 min',
        apto: '14:30-15:30 min',
        eliminatorio: '> 15:30 min'
      }
    },
    puntuacion_maxima: 10,
    tecnica_clave: 'Ritmo constante, gestión del esfuerzo, técnica eficiente',
    errores_comunes: [
      'Salir demasiado rápido',
      'Ritmo irregular',
      'Mala gestión del esfuerzo',
      'Técnica deficiente por fatiga'
    ],
    entrenamiento_especifico: 'Series de 1000m, tempo runs, fondo variable'
  },

  LANZAMIENTO_BALON: {
    id: 'lanzamiento_balon',
    nombre: 'Lanzamiento balón medicinal',
    categoria: 'Potencia',
    descripcion: 'Lanzamiento de balón medicinal desde sentado',
    baremos: {
      hombres: {
        peso: '5 kg',
        excelente: '> 12m',
        notable: '9-12m',
        apto: '7-9m',
        eliminatorio: '< 7m'
      },
      mujeres: {
        peso: '3 kg',
        excelente: '> 10m',
        notable: '8-10m',
        apto: '7-8m',
        eliminatorio: '< 7m'
      }
    },
    puntuacion_maxima: 10,
    tecnica_clave: 'Posición sentado, lanzamiento dorsal sobre cabeza, coordinación',
    errores_comunes: [
      'Levantar glúteos del suelo',
      'Mover los pies',
      'Técnica de lanzamiento incorrecta',
      'Falta de explosividad'
    ],
    entrenamiento_especifico: 'Trabajo de potencia, core, ejercicios balísticos'
  },

  CIRCUITO_AGILIDAD: {
    id: 'circuito_agilidad',
    nombre: 'Circuito de agilidad',
    categoria: 'Agilidad',
    descripcion: 'Circuito con obstáculos y cambios de dirección (varía por convocatoria)',
    baremos: {
      hombres: {
        excelente: '< 16 seg',
        notable: '16-18 seg',
        apto: '18-20 seg',
        eliminatorio: '> 20 seg'
      },
      mujeres: {
        excelente: '< 18 seg',
        notable: '18-20 seg',
        apto: '20-22 seg',
        eliminatorio: '> 22 seg'
      }
    },
    puntuacion_maxima: 10,
    tecnica_clave: 'Cambios de dirección rápidos, centro de gravedad bajo, coordinación',
    errores_comunes: [
      'Derribar obstáculos (penalización)',
      'Giros amplios',
      'Pérdida de equilibrio',
      'No seguir el recorrido correcto'
    ],
    entrenamiento_especifico: 'Escalera de coordinación, conos, pliometría'
  }
};

// Función para obtener información de una prueba
export function getPruebaInfo(pruebaId) {
  return PRUEBAS_OFICIALES[pruebaId?.toUpperCase()?.replace(/-/g, '_')] || null;
}

// Función para obtener todas las pruebas de una categoría
export function getPruebasByCategoria(categoria) {
  return Object.values(PRUEBAS_OFICIALES).filter(
    prueba => prueba.categoria.toLowerCase() === categoria.toLowerCase()
  );
}

// Función para calcular puntuación estimada según marca
export function calcularPuntuacion(pruebaId, marca, sexo = 'hombres') {
  const prueba = getPruebaInfo(pruebaId);
  if (!prueba) return 0;

  const baremos = prueba.baremos[sexo];
  if (!baremos) return 0;

  // Esta es una estimación simplificada
  // En la realidad, cada convocatoria tiene su tabla de puntuación específica
  if (marca <= parseFloat(baremos.excelente)) return 10;
  if (marca <= parseFloat(baremos.notable)) return 7.5;
  if (marca <= parseFloat(baremos.apto)) return 5;
  return 0; // Eliminatorio
}

// Configuración de simulacros por fase de preparación
export function getSimulacroConfig(semanaPreparacion) {
  if (semanaPreparacion <= 4) {
    return {
      tipo: 'Parcial - Técnica',
      pruebas: ['NATACION_50M', 'DOMINADAS', 'CARRERA_100M'],
      intensidad: '70-80%',
      objetivo: 'Familiarización con pruebas y técnica'
    };
  } else if (semanaPreparacion <= 8) {
    return {
      tipo: 'Parcial - Resistencia',
      pruebas: ['TREPA_CUERDA', 'PRESS_BANCA', 'CARRERA_3000M'],
      intensidad: '80-90%',
      objetivo: 'Desarrollo de resistencia específica'
    };
  } else if (semanaPreparacion <= 12) {
    return {
      tipo: 'Completo',
      pruebas: Object.keys(PRUEBAS_OFICIALES).slice(0, 6), // Principales
      intensidad: '90-95%',
      objetivo: 'Simulación realista del examen'
    };
  } else {
    return {
      tipo: 'Competición',
      pruebas: Object.keys(PRUEBAS_OFICIALES).slice(0, 8), // Todas principales
      intensidad: '95-100%',
      objetivo: 'Puesta a punto y máximo rendimiento'
    };
  }
}

// Estrategias específicas para el día del examen
export const ESTRATEGIAS_EXAMEN = {
  preparacion_previa: [
    '📅 Reconocimiento de instalaciones si es posible',
    '🥗 Carga de carbohidratos 2-3 días antes',
    '💧 Hidratación óptima desde 48h antes',
    '😴 Mínimo 8 horas de sueño la noche anterior',
    '🎒 Preparar todo el material el día anterior'
  ],
  dia_examen: [
    '⏰ Llegar con 1.5-2 horas de antelación',
    '🔥 Calentamiento completo 45 min antes',
    '🍌 Snacks ligeros entre pruebas (plátano, barritas)',
    '💧 Hidratación constante con sales',
    '🧘 Técnicas de relajación entre pruebas'
  ],
  orden_pruebas: {
    recomendado: [
      'Natación (mientras estás fresco)',
      'Dominadas/Trepa (fuerza máxima)',
      'Velocidad 100m',
      'Press banca',
      'Lanzamiento',
      'Resistencia 3000m (al final)'
    ],
    nota: 'El orden real depende de la convocatoria específica'
  },
  errores_evitar: [
    '❌ No calentar adecuadamente',
    '❌ Intentar marcas no entrenadas',
    '❌ Cambiar rutinas el día del examen',
    '❌ No respetar los tiempos de descanso',
    '❌ Olvidar material obligatorio (DNI, certificado médico, etc.)'
  ]
};

// Equipamiento necesario para entrenamiento
export const EQUIPAMIENTO_ENTRENAMIENTO = {
  imprescindible: [
    '🏊 Acceso a piscina 25-50m',
    '🪢 Cuerda de trepa 6m (o gimnasio con cuerda)',
    '💪 Barra de dominadas',
    '🏋️ Banco de press con barra y discos',
    '⚽ Balón medicinal 3kg (M) / 5kg (H)',
    '🏃 Pista de atletismo o circuito medido'
  ],
  recomendado: [
    '⏱️ Cronómetro deportivo',
    '📱 App de intervalos para entrenamientos',
    '🎽 Ropa técnica para cada disciplina',
    '👟 Zapatillas específicas running',
    '🥽 Gafas de natación de competición',
    '🧤 Calleras o magnesio para agarre'
  ],
  opcional: [
    '📊 Pulsómetro para control de intensidad',
    '📹 Cámara para análisis técnico',
    '🏊 Palas y tabla de natación',
    '🪜 Escalera de coordinación',
    '🎯 Conos y vallas para agilidad'
  ]
};