// Config de grupos focales y mapeo de metodologías para MethodologiesScreen (ARCH-002).
// Extraído del monolito MethodologiesScreen.jsx: constantes de módulo (datos estáticos,
// sin estado de React) que alimentan el modal de "¿Qué prefieres entrenar?" y el flujo
// single-day. La pantalla las importa desde aquí.

// Metodologías que usan el flujo "single-day" in-app (modal fin de semana →
// elección de foco → calentamiento → reproductor de ejercicios).
export const SINGLE_DAY_METHODOLOGIES = ['HipertrofiaV2', 'Calistenia', 'CrossFit', 'Entrenamiento en Casa', 'Funcional', 'Halterofilia', 'Powerlifting', 'Heavy Duty'];

// Grupos focales por metodología para el modal de "¿Qué prefieres entrenar?".
export const CALISTENIA_FOCUS_GROUPS = [
  { id: 'Empuje', label: 'Empuje' },
  { id: 'Tracción', label: 'Tracción' },
  { id: 'Piernas', label: 'Piernas' },
  { id: 'Core', label: 'Core' },
  { id: 'Equilibrio/Soporte', label: 'Equilibrio' }
];

// Para CrossFit el "foco" es el formato de WOD o el dominio principal.
export const CROSSFIT_FOCUS_GROUPS = [
  { id: 'amrap', label: 'AMRAP' },
  { id: 'for_time', label: 'For Time' },
  { id: 'emom', label: 'EMOM' },
  { id: 'chipper', label: 'Chipper' },
  { id: 'Weightlifting', label: 'Halterofilia' },
  { id: 'Gymnastic', label: 'Gimnásticos' }
];

// Para Entrenamiento en Casa el "foco" es el tipo de trabajo (mapea a categorías
// reales del catálogo disciplina='casa').
export const CASA_FOCUS_GROUPS = [
  { id: 'Fuerza', label: 'Fuerza' },
  { id: 'Funcional', label: 'Funcional' },
  { id: 'Cardio', label: 'Cardio' },
  { id: 'Movilidad', label: 'Movilidad' }
];

// Para Funcional el "foco" es el patrón de movimiento (mapea a categorías
// reales del catálogo disciplina='funcional').
export const FUNCIONAL_FOCUS_GROUPS = [
  { id: 'Empuje', label: 'Empuje' },
  { id: 'Tracción', label: 'Tracción' },
  { id: 'Piernas', label: 'Piernas' },
  { id: 'Core', label: 'Core' },
  { id: 'Movilidad', label: 'Movilidad' }
];

// Para Halterofilia el "foco" es la categoría olímpica (mapea a categorías
// reales del catálogo disciplina='halterofilia').
export const HALTEROFILIA_FOCUS_GROUPS = [
  { id: 'Snatch', label: 'Snatch' },
  { id: 'Clean & Jerk', label: 'Clean & Jerk' },
  { id: 'Técnica', label: 'Técnica' },
  { id: 'Fuerza Base', label: 'Fuerza' }
];

// Para Powerlifting el "foco" es uno de los 3 básicos de competición (mapea a
// categorías reales del catálogo disciplina='powerlifting').
export const POWERLIFTING_FOCUS_GROUPS = [
  { id: 'Sentadilla', label: 'Sentadilla' },
  { id: 'Press Banca', label: 'Press Banca' },
  { id: 'Peso Muerto', label: 'Peso Muerto' }
];

// Para Heavy Duty (HIT/Mentzer) el "foco" es el grupo muscular (agrupa las
// categorías reales del catálogo disciplina='heavy_duty' por ILIKE en backend).
export const HEAVY_DUTY_FOCUS_GROUPS = [
  { id: 'Pecho', label: 'Pecho' },
  { id: 'Espalda', label: 'Espalda' },
  { id: 'Piernas', label: 'Piernas' },
  { id: 'Hombros', label: 'Hombros' },
  { id: 'Brazos', label: 'Brazos' },
  { id: 'Core', label: 'Core' }
];

// Mapea el nombre de metodología del frontend a la clave de API single-day.
export const methodologyApiKey = (name) => {
  if (name === 'Calistenia') return 'calistenia';
  if (name === 'CrossFit') return 'crossfit';
  if (name === 'Entrenamiento en Casa') return 'casa';
  if (name === 'Funcional') return 'funcional';
  if (name === 'Halterofilia') return 'halterofilia';
  if (name === 'Powerlifting') return 'powerlifting';
  if (name === 'Heavy Duty') return 'heavy_duty';
  return 'hipertrofia';
};
