/**
 * 🎨 FRONTEND METHODOLOGY DATA - UI/UX Rich Data
 *
 * RESPONSABILIDAD: Datos ricos para interfaz de usuario:
 * - Descripciones detalladas para UI
 * - Iconos y elementos visuales
 * - Textos explicativos y marketing
 * - Validaciones de frontend
 * - Datos para componentes React
 *
 * ⚠️ IMPORTANTE: Para lógica técnica usar backend/config/methodologies/
 * 🔗 MAPEO: src/config/methodologyMapping.js mantiene consistencia
 *
 * @author Claude Code - Arquitectura Modular Profesional
 * @version 4.0.0 - Role-Separated Architecture
 */

import { Zap, Trophy, Activity, Target, User, Home, Shield, Flame, TrendingUp } from 'lucide-react';
import methodologyMapping from '../../config/methodologyMapping.js';

// Configuraciones centralizadas
const METHODOLOGIES_CONFIG = {
  // Niveles consistentes y validados
  LEVELS: {
    BEGINNER: 'principiante',
    INTERMEDIATE: 'intermedio',
    ADVANCED: 'avanzado',
    COMPETITION: 'competición'
  },

  // Duraciones estandarizadas (en semanas)
  DURATIONS: {
    SHORT: { min: 4, max: 6 },    // 4-6 semanas
    MEDIUM: { min: 6, max: 10 },  // 6-10 semanas
    LONG: { min: 8, max: 16 },    // 8-16 semanas
    EXTENDED: { min: 10, max: 20 } // 10-20 semanas
  },

  // Frecuencias estandarizadas (días por semana)
  FREQUENCIES: {
    LOW: { min: 2, max: 3 },      // 2-3 días/semana
    MODERATE: { min: 3, max: 4 }, // 3-4 días/semana
    HIGH: { min: 4, max: 5 },     // 4-5 días/semana
    INTENSE: { min: 4, max: 6 },  // 4-6 días/semana
    DAILY: { min: 5, max: 7 }     // 5-7 días/semana
  },

  // Volúmenes de entrenamiento
  VOLUMES: {
    VERY_LOW: 'muy_bajo',
    LOW: 'bajo',
    MODERATE: 'moderado',
    HIGH: 'alto',
    VERY_HIGH: 'muy_alto'
  },

  // Intensidades de entrenamiento
  INTENSITIES: {
    LOW: 'baja',
    MODERATE: 'moderada',
    HIGH: 'alta',
    VERY_HIGH: 'muy_alta'
  },

  // Compatibilidad con entrenamiento en casa
  HOME_COMPATIBILITY: {
    FULL: 'total',        // 100% compatible
    PARTIAL: 'parcial',   // Algunas limitaciones
    MINIMAL: 'mínima',    // Muy limitado
    NONE: 'ninguna'       // Requiere gimnasio
  }
};

// Campos numéricos para validación de perfiles
export const NUMBER_KEYS = [
  'edad', 'peso_kg', 'altura_cm', 'grasa_corporal', 'masa_magra', 'agua_corporal', 'metabolismo_basal',
  'cintura', 'pecho', 'brazos', 'muslo', 'cuello', 'antebrazos',
  'comidas_diarias', 'frecuencia_semanal', 'años_entrenando', 'meta_peso', 'meta_grasa'
];

// Utilidades de validación y sanitización
const ProfileValidationUtils = {
  /**
   * Sanitiza un perfil de usuario convirtiendo strings a números donde corresponde
   * @param {Object} profile - Perfil de usuario a sanitizar
   * @returns {Object} Perfil sanitizado con tipos correctos
   */
  sanitizeProfile(profile) {
    if (!profile || typeof profile !== 'object') {
      console.warn('[MethodologiesData] Invalid profile provided to sanitizeProfile');
      return {};
    }

    const sanitized = { ...profile };

    NUMBER_KEYS.forEach((key) => {
      if (sanitized[key] != null) {
        if (typeof sanitized[key] === 'string' && sanitized[key].trim() !== '') {
          const numericValue = Number(sanitized[key]);
          if (!Number.isNaN(numericValue) && numericValue >= 0) {
            sanitized[key] = numericValue;
          }
        }
      }
    });

    return sanitized;
  },

  /**
   * Valida que un perfil tenga los campos mínimos requeridos
   * @param {Object} profile - Perfil a validar
   * @returns {Object} { isValid: boolean, missingFields: string[] }
   */
  validateProfile(profile) {
    const requiredFields = ['edad', 'peso_kg', 'altura_cm', 'nivel_entrenamiento'];
    const missingFields = requiredFields.filter(field => !profile || profile[field] == null);

    return {
      isValid: missingFields.length === 0,
      missingFields
    };
  }
};

// Helper para formatear duraciones consistentemente
const formatDuration = (duration) => `${duration.min}-${duration.max} semanas`;

// Helper para formatear frecuencias consistentemente
const formatFrequency = (frequency) => `${frequency.min}-${frequency.max} días/semana`;

// Helper para generar rangos de nivel consistentes
const formatLevelRange = (levels) => levels.join('-');

// Funciones de utilidad adicionales
const MethodologyUtils = {
  /**
   * Busca una metodología por su ID
   * @param {string} methodologyId - ID de la metodología
   * @returns {Object|null} Metodología encontrada o null
   */
  findMethodologyById(methodologyId) {
    return METHODOLOGIES.find(methodology => methodology.id === methodologyId) || null;
  },

  /**
   * Valida consistencia con backend usando mapping
   * @returns {Object} Reporte de consistencia
   */
  validateWithBackend() {
    const frontendIds = METHODOLOGIES.map(m => m.id);
    return methodologyMapping.validateConsistency([], METHODOLOGIES);
  },

  /**
   * Filtra metodologías por compatibilidad con casa
   * @param {boolean} homeOnly - Si solo buscar compatibles con casa
   * @returns {Array} Lista de metodologías filtradas
   */
  filterByHomeCompatibility(homeOnly = true) {
    if (!homeOnly) return METHODOLOGIES;
    return METHODOLOGIES.filter(methodology =>
      methodology.homeCompatible === METHODOLOGIES_CONFIG.HOME_COMPATIBILITY.FULL
    );
  },

  /**
   * Filtra metodologías por nivel de usuario
   * @param {string} userLevel - Nivel del usuario
   * @returns {Array} Lista de metodologías apropiadas
   */
  filterByUserLevel(userLevel) {
    return METHODOLOGIES.filter(methodology => {
      const methodologyLevels = methodology.level.toLowerCase();
      return methodologyLevels.includes(userLevel.toLowerCase());
    });
  },

  /**
   * Obtiene estadísticas de las metodologías
   * @returns {Object} Estadísticas generales
   */
  getMethodologyStats() {
    return {
      total: METHODOLOGIES.length,
      homeCompatible: METHODOLOGIES.filter(m => m.homeCompatible === METHODOLOGIES_CONFIG.HOME_COMPATIBILITY.FULL).length,
      byLevel: {
        beginner: METHODOLOGIES.filter(m => m.level.toLowerCase().includes('principiante')).length,
        intermediate: METHODOLOGIES.filter(m => m.level.toLowerCase().includes('intermedio')).length,
        advanced: METHODOLOGIES.filter(m => m.level.toLowerCase().includes('avanzado')).length
      }
    };
  }
};

// Exportaciones para compatibilidad hacia atrás
export function sanitizeProfile(profile) {
  return ProfileValidationUtils.sanitizeProfile(profile);
}

// Exportaciones adicionales
export { METHODOLOGIES_CONFIG, ProfileValidationUtils, MethodologyUtils };

export const METHODOLOGIES = [
  // ========================================
  // 📚 METODOLOGÍAS GENERALES (Ordenadas alfabéticamente)
  // ========================================
  {
    id: 'calistenia',
    name: 'Calistenia',
    description: 'Entrenamiento con peso corporal enfocado en control y fuerza relativa',
    detailedDescription: 'Arte del movimiento corporal que desarrolla fuerza, flexibilidad y control motor usando únicamente el peso del cuerpo. Progresa desde movimientos básicos hasta habilidades avanzadas como muscle-ups, handstands y human flags.',
    focus: 'Fuerza relativa',
    level: formatLevelRange([METHODOLOGIES_CONFIG.LEVELS.BEGINNER, METHODOLOGIES_CONFIG.LEVELS.ADVANCED]),
    homeCompatible: METHODOLOGIES_CONFIG.HOME_COMPATIBILITY.FULL,
    icon: User,
    programDuration: formatDuration(METHODOLOGIES_CONFIG.DURATIONS.EXTENDED),
    frequency: formatFrequency(METHODOLOGIES_CONFIG.FREQUENCIES.INTENSE),
    volume: METHODOLOGIES_CONFIG.VOLUMES.HIGH,
    intensity: METHODOLOGIES_CONFIG.INTENSITIES.HIGH,
    principles: [
      'Progresión gradual con peso corporal únicamente',
      'Desarrollo de control motor y propiocepción avanzada',
      'Integración de movimientos artísticos y funcionales',
      'Fuerza funcional relativa al peso corporal',
      'Paciencia y consistencia en la progresión'
    ],
    benefits: [
      'Desarrollo de fuerza relativa excepcional',
      'Control corporal y coordinación avanzada',
      'Mejora significativa de flexibilidad y movilidad',
      'Entrenamiento accesible sin necesidad de equipamiento',
      'Desarrollo de habilidades impresionantes y motivadoras'
    ],
    targetAudience: 'Desde principiantes hasta avanzados con paciencia para progresión gradual',
    duration: '45-90 minutos por sesión',
    scientificBasis: 'Adaptaciones neuromusculares, control motor, plasticidad neural y biomecánica corporal',
    videoPlaceholder: true
  },
  {
    id: 'crossfit',
    name: 'CrossFit',
    description: 'Entrenamiento funcional de alta intensidad con movimientos variados',
    detailedDescription: 'Metodología que combina levantamiento olímpico, gimnasia y acondicionamiento metabólico. Busca desarrollar las 10 capacidades físicas generales a través de movimientos funcionales ejecutados a alta intensidad y constantemente variados.',
    focus: 'Condición física general',
    level: formatLevelRange([METHODOLOGIES_CONFIG.LEVELS.INTERMEDIATE, METHODOLOGIES_CONFIG.LEVELS.ADVANCED]),
    homeCompatible: METHODOLOGIES_CONFIG.HOME_COMPATIBILITY.MINIMAL,
    icon: Target,
    programDuration: formatDuration(METHODOLOGIES_CONFIG.DURATIONS.MEDIUM),
    frequency: formatFrequency(METHODOLOGIES_CONFIG.FREQUENCIES.HIGH),
    volume: METHODOLOGIES_CONFIG.VOLUMES.HIGH,
    intensity: METHODOLOGIES_CONFIG.INTENSITIES.HIGH,
    principles: [
      'Movimientos funcionales constantemente variados',
      'Alta intensidad relativa adaptada al individuo',
      'Escalabilidad universal para todos los niveles',
      'Comunidad y competición como motivación',
      'Medición y registro constante del progreso'
    ],
    benefits: [
      'Desarrollo completo de las 10 capacidades físicas',
      'Mejora dramática de la composición corporal',
      'Versatilidad atlética y preparación física general',
      'Motivación grupal y sentido de comunidad',
      'Transferencia a actividades deportivas y cotidianas'
    ],
    targetAudience: 'Intermedios a avanzados con buena base técnica y capacidad de aprendizaje motor',
    duration: '60-75 minutos por sesión',
    scientificBasis: 'Adaptaciones metabólicas mixtas, transferencia atlética y principios de entrenamiento concurrente',
    videoPlaceholder: true
  },
  {
    id: 'entrenamiento-casa',
    name: 'Entrenamiento en Casa',
    description: 'Rutinas adaptadas para entrenar en casa con equipamiento mínimo',
    detailedDescription: 'Programa versátil diseñado para maximizar resultados con equipamiento básico del hogar. Combina peso corporal, bandas elásticas y objetos domésticos para crear rutinas efectivas adaptadas a cualquier espacio y horario.',
    focus: 'Adaptabilidad',
    level: formatLevelRange([METHODOLOGIES_CONFIG.LEVELS.BEGINNER, METHODOLOGIES_CONFIG.LEVELS.INTERMEDIATE]),
    homeCompatible: METHODOLOGIES_CONFIG.HOME_COMPATIBILITY.FULL,
    icon: Home,
    programDuration: formatDuration(METHODOLOGIES_CONFIG.DURATIONS.SHORT),
    frequency: formatFrequency(METHODOLOGIES_CONFIG.FREQUENCIES.HIGH),
    volume: METHODOLOGIES_CONFIG.VOLUMES.MODERATE,
    intensity: METHODOLOGIES_CONFIG.INTENSITIES.MODERATE,
    principles: [
      'Máximo resultado con equipamiento mínimo disponible',
      'Adaptación creativa al espacio y recursos disponibles',
      'Progresión con resistencia variable y peso corporal',
      'Flexibilidad horaria total sin dependencias externas',
      'Sostenibilidad a largo plazo desde casa'
    ],
    benefits: [
      'Conveniencia total y accesibilidad las 24 horas',
      'Ahorro significativo de tiempo y dinero en gimnasios',
      'Privacidad completa y comodidad del hogar',
      'Flexibilidad de horarios adaptada a tu rutina',
      'Eliminación de excusas y barreras para entrenar'
    ],
    targetAudience: 'Ideal para todos los niveles sin acceso a gimnasio o con limitaciones de tiempo',
    duration: '30-60 minutos por sesión',
    scientificBasis: 'Adaptaciones musculares con resistencia progresiva variable, entrenamiento funcional y biomecánica adaptativa',
    videoPlaceholder: true,
    isNew: true
  },
  {
    id: 'funcional',
    name: 'Funcional',
    description: 'Movimientos naturales y ejercicios que mejoran la funcionalidad diaria',
    detailedDescription: 'Entrenamiento basado en patrones de movimiento que replican actividades de la vida cotidiana. Integra múltiples grupos musculares trabajando en diferentes planos de movimiento para mejorar la coordinación, estabilidad y transferencia al rendimiento diario.',
    focus: 'Funcionalidad',
    level: formatLevelRange([METHODOLOGIES_CONFIG.LEVELS.BEGINNER, METHODOLOGIES_CONFIG.LEVELS.INTERMEDIATE]),
    homeCompatible: METHODOLOGIES_CONFIG.HOME_COMPATIBILITY.FULL,
    icon: Activity,
    programDuration: formatDuration(METHODOLOGIES_CONFIG.DURATIONS.MEDIUM),
    frequency: formatFrequency(METHODOLOGIES_CONFIG.FREQUENCIES.MODERATE),
    volume: METHODOLOGIES_CONFIG.VOLUMES.MODERATE,
    intensity: METHODOLOGIES_CONFIG.INTENSITIES.MODERATE,
    principles: [
      'Movimientos multiplanares (sagital, frontal, transversal)',
      'Integración de cadenas musculares completas',
      'Desarrollo simultáneo de estabilidad y movilidad',
      'Transferencia directa a actividades de la vida diaria',
      'Progresión desde estabilidad a movilidad dinámica'
    ],
    benefits: [
      'Mejora significativa de coordinación y propiocepción',
      'Prevención efectiva de lesiones cotidianas',
      'Mayor eficiencia en movimientos diarios',
      'Desarrollo de equilibrio y estabilidad core',
      'Rehabilitación y corrección de desequilibrios musculares'
    ],
    targetAudience: 'Ideal para principiantes, personas en rehabilitación y atletas buscando transferencia',
    duration: '45-75 minutos por sesión',
    scientificBasis: 'Basado en principios de biomecánica, control motor, cadenas cinéticas y neuroplasticidad',
    videoPlaceholder: true
  },
  {
    id: 'halterofilia',
    name: 'Halterofilia',
    description: 'Levantamiento olímpico: snatch y clean & jerk con técnica especializada',
    detailedDescription: 'Disciplina técnica centrada en los dos levantamientos olímpicos oficiales. Desarrolla potencia explosiva, fuerza máxima, velocidad bajo la barra y movilidad específica. Requiere dedicación a la técnica y progresión sistemática desde fundamentos hasta levantamientos completos.',
    focus: 'Potencia técnica',
    level: formatLevelRange([METHODOLOGIES_CONFIG.LEVELS.INTERMEDIATE, METHODOLOGIES_CONFIG.LEVELS.ADVANCED]),
    homeCompatible: METHODOLOGIES_CONFIG.HOME_COMPATIBILITY.MINIMAL,
    icon: Zap,
    programDuration: formatDuration(METHODOLOGIES_CONFIG.DURATIONS.EXTENDED),
    frequency: formatFrequency(METHODOLOGIES_CONFIG.FREQUENCIES.INTENSE),
    volume: METHODOLOGIES_CONFIG.VOLUMES.HIGH,
    intensity: METHODOLOGIES_CONFIG.INTENSITIES.HIGH,
    principles: [
      'Técnica perfecta sobre carga máxima',
      'Progresión sistemática: hang → bloques → suelo',
      'Desarrollo de triple extensión explosiva',
      'Movilidad específica overhead y front rack',
      'Periodización por bloques hacia picos'
    ],
    benefits: [
      'Desarrollo excepcional de potencia y velocidad',
      'Fuerza máxima aplicada de forma explosiva',
      'Mejora drástica de coordinación neuromuscular',
      'Transferencia a todos los deportes de potencia',
      'Movilidad y control corporal avanzado'
    ],
    targetAudience: 'Intermedios-avanzados con base técnica o aspirantes a competición olímpica',
    duration: '60-90 minutos por sesión',
    scientificBasis: 'Biomecánica olímpica, potenciación post-activación, especificidad técnica y adaptaciones del SNC',
    videoPlaceholder: true
  },
  {
    id: 'heavy-duty',
    name: 'Heavy Duty',
    description: 'Entrenamiento de alta intensidad con bajo volumen y máximo descanso',
    detailedDescription: 'Metodología desarrollada por Mike Mentzer que revolucionó el entrenamiento con pesas. Se basa en entrenamientos breves pero extremadamente intensos, seguidos de períodos de descanso prolongados para permitir la supercompensación muscular completa.',
    focus: 'Intensidad máxima',
    level: formatLevelRange([METHODOLOGIES_CONFIG.LEVELS.INTERMEDIATE, METHODOLOGIES_CONFIG.LEVELS.ADVANCED]),
    homeCompatible: METHODOLOGIES_CONFIG.HOME_COMPATIBILITY.FULL,
    icon: Zap,
    programDuration: formatDuration(METHODOLOGIES_CONFIG.DURATIONS.SHORT),
    frequency: formatFrequency(METHODOLOGIES_CONFIG.FREQUENCIES.LOW),
    volume: METHODOLOGIES_CONFIG.VOLUMES.VERY_LOW,
    intensity: METHODOLOGIES_CONFIG.INTENSITIES.VERY_HIGH,
    principles: [
      'Intensidad máxima en cada serie hasta el fallo muscular',
      'Descansos de 4-7 días entre entrenamientos del mismo grupo muscular',
      'Pocas series por grupo muscular (1-2 series efectivas)',
      'Progresión lenta pero constante en cargas',
      'Enfoque en ejercicios compuestos básicos'
    ],
    benefits: [
      'Máximo estímulo de crecimiento con mínimo volumen de entrenamiento',
      'Ideal para personas con poca disponibilidad de tiempo',
      'Previene el sobreentrenamiento y el burnout',
      'Permite recuperación completa entre sesiones',
      'Desarrolla fuerza mental y concentración extrema'
    ],
    targetAudience: 'Intermedios y avanzados con buena técnica y experiencia en fallo muscular',
    duration: '45-60 minutos por sesión',
    scientificBasis: 'Basado en la teoría de supercompensación, adaptación específica y el principio de sobrecarga progresiva de Arthur Jones',
    videoPlaceholder: true
  },
  {
    id: 'hipertrofiaV2',
    // `name` es el identificador interno cableado (lógica, BD, endpoint); NO cambiar.
    // `displayName` es lo que ve el usuario: tras retirar la Hipertrofia legacy,
    // HipertrofiaV2 ocupa su lugar y se muestra simplemente como "Hipertrofia".
    name: 'HipertrofiaV2',
    displayName: 'Hipertrofia',
    description: 'Sistema Full Body con tracking RIR y autorregulación automática',
    detailedDescription: 'Metodología avanzada de hipertrofia con tracking de RIR (Reps In Reserve) por serie. Incorpora autorregulación automática basada en datos reales del usuario, selección aleatoria de ejercicios y calendario adaptativo. Sistema inteligente que ajusta cargas según el esfuerzo real reportado.',
    focus: 'Hipertrofia inteligente',
    level: formatLevelRange([METHODOLOGIES_CONFIG.LEVELS.BEGINNER, METHODOLOGIES_CONFIG.LEVELS.ADVANCED]),
    homeCompatible: METHODOLOGIES_CONFIG.HOME_COMPATIBILITY.PARTIAL,
    icon: TrendingUp,
    programDuration: '4-5 semanas',
    frequency: formatFrequency(METHODOLOGIES_CONFIG.FREQUENCIES.MODERATE),
    volume: METHODOLOGIES_CONFIG.VOLUMES.MODERATE,
    intensity: METHODOLOGIES_CONFIG.INTENSITIES.MODERATE,
    principles: [
      'Full Body 3x/semana para principiantes (Lun/Mié/Vie)',
      'Tracking RIR (0-4) por cada serie completada',
      'Cálculo automático de 1RM y peso objetivo (80%)',
      'Autorregulación: RIR 2-3 mantener, RIR≤1 bajar peso, RIR≥4 subir peso',
      'Selección aleatoria de ejercicios dentro de cada categoría muscular'
    ],
    benefits: [
      'Progresión basada en datos reales, no en estimaciones',
      'Prevención de sobreentrenamiento mediante RIR',
      'Variedad de ejercicios para evitar estancamiento',
      'Ajuste automático de cargas según capacidad real',
      'Historial completo de progresión por ejercicio'
    ],
    targetAudience: 'Desde principiantes hasta avanzados que buscan optimización mediante datos',
    duration: '60-75 minutos por sesión',
    scientificBasis: 'Basado en RIR/RPE, autorregulación, fórmula de Epley para 1RM, y principios de sobrecarga progresiva adaptativa',
    videoPlaceholder: true,
    isNew: true,
    manualMode: true,
    requiresEvaluation: true,
    trackingEnabled: true
  },
  {
    id: 'powerlifting',
    name: 'Powerlifting',
    description: 'Enfoque en los tres levantamientos básicos: sentadilla, press banca y peso muerto',
    detailedDescription: 'Deporte de fuerza que se centra en maximizar la carga en tres movimientos fundamentales. Combina entrenamiento técnico específico con desarrollo de fuerza absoluta, utilizando periodización avanzada para alcanzar picos de rendimiento.',
    focus: 'Fuerza máxima',
    level: formatLevelRange([METHODOLOGIES_CONFIG.LEVELS.INTERMEDIATE, METHODOLOGIES_CONFIG.LEVELS.COMPETITION]),
    homeCompatible: METHODOLOGIES_CONFIG.HOME_COMPATIBILITY.NONE,
    icon: Trophy,
    programDuration: formatDuration(METHODOLOGIES_CONFIG.DURATIONS.LONG),
    frequency: formatFrequency(METHODOLOGIES_CONFIG.FREQUENCIES.INTENSE),
    volume: METHODOLOGIES_CONFIG.VOLUMES.HIGH,
    intensity: METHODOLOGIES_CONFIG.INTENSITIES.HIGH,
    principles: [
      'Especificidad absoluta en sentadilla, press banca y peso muerto',
      'Periodización lineal o ondulante según objetivos',
      'Técnica perfecta como prioridad número uno',
      'Trabajo de accesorios específico para debilidades',
      'Progresión gradual y medible en cada ciclo'
    ],
    benefits: [
      'Desarrollo de fuerza funcional máxima en patrones básicos',
      'Mejora significativa de la densidad ósea y conectiva',
      'Desarrollo de disciplina mental y concentración extrema',
      'Base sólida de fuerza para cualquier otro deporte',
      'Comunidad competitiva y objetivos medibles claros'
    ],
    targetAudience: 'Intermedios a avanzados con acceso a gimnasio completo y experiencia en levantamientos básicos',
    duration: '90-120 minutos por sesión',
    scientificBasis: 'Principios de especificidad, sobrecarga progresiva, adaptaciones neuromusculares y periodización del entrenamiento',
    videoPlaceholder: true
  },

  // ========================================
  // 🚫 METODOLOGÍAS DE OPOSICIONES (Comentadas - Ya están en sección Oposiciones)
  // ========================================
  /*
  {
    id: 'bomberos',
    name: 'Oposiciones Bombero',
    description: 'Preparación física completa para las 9 pruebas físicas oficiales de Bombero',
    detailedDescription: 'Programa especializado que prepara al opositor para superar las exigentes pruebas físicas de bombero. Incluye natación, buceo, trepa de cuerda, dominadas, carreras de velocidad y resistencia, press banca, flexiones y lanzamiento de balón medicinal. Entrenamiento multidisciplinar que desarrolla todas las capacidades físicas necesarias.',
    focus: 'Preparación oposiciones',
    level: formatLevelRange([METHODOLOGIES_CONFIG.LEVELS.INTERMEDIATE, METHODOLOGIES_CONFIG.LEVELS.ADVANCED]),
    homeCompatible: METHODOLOGIES_CONFIG.HOME_COMPATIBILITY.MINIMAL,
    icon: Flame,
    programDuration: formatDuration(METHODOLOGIES_CONFIG.DURATIONS.LONG),
    frequency: formatFrequency(METHODOLOGIES_CONFIG.FREQUENCIES.INTENSE),
    volume: METHODOLOGIES_CONFIG.VOLUMES.HIGH,
    intensity: METHODOLOGIES_CONFIG.INTENSITIES.HIGH,
    principles: [
      'Cobertura completa de las 9 pruebas oficiales de bombero',
      'Balance entre natación, fuerza, resistencia, velocidad y agilidad',
      'Especialización progresiva desde base general a específico',
      'Simulaciones periódicas en condiciones oficiales',
      'Gestión de fatiga para evitar sobreentrenamiento multidisciplinar'
    ],
    benefits: [
      'Preparación integral para superar todas las pruebas físicas',
      'Desarrollo excepcional de versatilidad atlética',
      'Maximización de puntuación en convocatorias oficiales',
      'Mejora significativa en natación, fuerza y resistencia',
      'Confianza técnica y física para el día del examen'
    ],
    targetAudience: 'Opositores de bombero con nivel intermedio-avanzado buscando superar pruebas oficiales',
    duration: '90-120 minutos por sesión',
    scientificBasis: 'Entrenamiento concurrente, periodización por bloques, especificidad de pruebas oficiales',
    videoPlaceholder: true,
    isNew: true
  },
  {
    id: 'guardia-civil',
    name: 'Oposiciones Guardia Civil',
    description: 'Entrenamiento específico para las 4 pruebas eliminatorias de Guardia Civil según BOE',
    detailedDescription: 'Programa focalizado en las 4 pruebas eliminatorias oficiales: circuito de coordinación, carrera 2000m, extensiones de brazos y natación 50m. Sistema APTO/NO APTO donde fallar cualquier prueba significa eliminación inmediata. Adaptado a baremos oficiales por edad y sexo del BOE.',
    focus: 'Preparación oposiciones',
    level: formatLevelRange([METHODOLOGIES_CONFIG.LEVELS.INTERMEDIATE, METHODOLOGIES_CONFIG.LEVELS.ADVANCED]),
    homeCompatible: METHODOLOGIES_CONFIG.HOME_COMPATIBILITY.PARTIAL,
    icon: Shield,
    programDuration: formatDuration(METHODOLOGIES_CONFIG.DURATIONS.MEDIUM),
    frequency: formatFrequency(METHODOLOGIES_CONFIG.FREQUENCIES.INTENSE),
    volume: METHODOLOGIES_CONFIG.VOLUMES.MODERATE,
    intensity: METHODOLOGIES_CONFIG.INTENSITIES.HIGH,
    principles: [
      'Preparación para sistema eliminatorio (todas las pruebas deben superarse)',
      'Adaptación a baremos oficiales según edad y sexo del usuario',
      'Enfoque en no fallar primer intento (se permiten 2 en algunas pruebas)',
      'Balance entre agilidad, resistencia, fuerza y natación',
      'Simulaciones oficiales cada 3-4 semanas'
    ],
    benefits: [
      'Preparación ajustada a baremos exactos por edad del BOE',
      'Entrenamiento específico para las 4 pruebas eliminatorias',
      'Margen de seguridad sobre baremos mínimos',
      'Confianza para superar todas las pruebas sin eliminación',
      'Técnica depurada en circuito de coordinación'
    ],
    targetAudience: 'Opositores de Guardia Civil con objetivo de superar las 4 pruebas según baremos oficiales',
    duration: '60-90 minutos por sesión',
    scientificBasis: 'Especificidad de pruebas oficiales BOE, entrenamiento concurrente, periodización adaptada',
    videoPlaceholder: true,
    isNew: true
  },
  {
    id: 'policia-nacional',
    name: 'Oposiciones Policía Nacional',
    description: 'Preparación para las 3 pruebas físicas con sistema de puntuación 0-10',
    detailedDescription: 'Entrenamiento orientado a maximizar puntuación en las 3 pruebas oficiales: circuito de agilidad con obstáculos, dominadas/suspensión en barra y carrera de 1000m. Sistema de puntuación 0-10 por prueba donde se requiere media mínima de 5 puntos para aprobar. Estrategia inteligente para maximizar puntos totales.',
    focus: 'Preparación oposiciones',
    level: formatLevelRange([METHODOLOGIES_CONFIG.LEVELS.INTERMEDIATE, METHODOLOGIES_CONFIG.LEVELS.ADVANCED]),
    homeCompatible: METHODOLOGIES_CONFIG.HOME_COMPATIBILITY.PARTIAL,
    icon: Shield,
    programDuration: formatDuration(METHODOLOGIES_CONFIG.DURATIONS.MEDIUM),
    frequency: formatFrequency(METHODOLOGIES_CONFIG.FREQUENCIES.HIGH),
    volume: METHODOLOGIES_CONFIG.VOLUMES.MODERATE,
    intensity: METHODOLOGIES_CONFIG.INTENSITIES.HIGH,
    principles: [
      'Estrategia de maximización de puntos (no solo aprobar)',
      'Identificación de prueba más fuerte para puntuar alto (8-10)',
      'Asegurar mínimos en pruebas débiles (4-5 puntos)',
      'Diferenciación hombres/mujeres en prueba de fuerza',
      'Sistema no eliminatorio permite gestión estratégica'
    ],
    benefits: [
      'Maximización de puntuación total en convocatoria',
      'Estrategia personalizada según fortalezas del usuario',
      'Media superior a 5 puntos con margen de seguridad',
      'Técnica específica en circuito de agilidad',
      'Optimización de tiempo en carrera 1000m'
    ],
    targetAudience: 'Opositores de Policía Nacional buscando superar media de 5 puntos y maximizar puntuación',
    duration: '60-75 minutos por sesión',
    scientificBasis: 'Sistema de puntuación oficial, estrategia de maximización, entrenamiento específico por prueba',
    videoPlaceholder: true,
    isNew: true
  },
  {
    id: 'policia-local',
    name: 'Oposiciones Policía Local',
    description: 'Preparación polivalente para pruebas comunes (varían por ayuntamiento)',
    detailedDescription: 'Programa adaptable para las pruebas más frecuentes de Policía Local: velocidad 50m, resistencia 1000m, salto de longitud, fuerza tren superior y circuito de agilidad. IMPORTANTE: Las pruebas varían significativamente por ayuntamiento, por lo que el plan cubre las más comunes y se adapta según bases oficiales específicas.',
    focus: 'Preparación oposiciones',
    level: formatLevelRange([METHODOLOGIES_CONFIG.LEVELS.INTERMEDIATE, METHODOLOGIES_CONFIG.LEVELS.ADVANCED]),
    homeCompatible: METHODOLOGIES_CONFIG.HOME_COMPATIBILITY.PARTIAL,
    icon: Shield,
    programDuration: formatDuration(METHODOLOGIES_CONFIG.DURATIONS.MEDIUM),
    frequency: formatFrequency(METHODOLOGIES_CONFIG.FREQUENCIES.HIGH),
    volume: METHODOLOGIES_CONFIG.VOLUMES.MODERATE,
    intensity: METHODOLOGIES_CONFIG.INTENSITIES.HIGH,
    principles: [
      'Preparación polivalente para 4-5 pruebas más comunes',
      'Adaptabilidad a bases específicas de cada ayuntamiento',
      'Especialización tardía cuando se publican bases oficiales',
      'Balance entre velocidad, resistencia, potencia y fuerza',
      'Énfasis en consultar siempre bases de convocatoria objetivo'
    ],
    benefits: [
      'Cobertura de pruebas presentes en 80%+ convocatorias',
      'Preparación base sólida antes de bases oficiales',
      'Rapidez de adaptación cuando se publican pruebas exactas',
      'Desarrollo completo: sprint, medio fondo, salto, fuerza',
      'Flexibilidad para ajustar según ayuntamiento específico'
    ],
    targetAudience: 'Opositores de Policía Local (NOTA: verificar siempre bases de tu ayuntamiento específico)',
    duration: '60-90 minutos por sesión',
    scientificBasis: 'Entrenamiento multidisciplinar, adaptabilidad metodológica, especificidad variable por convocatoria',
    videoPlaceholder: true,
    isNew: true
  }
  */
];
