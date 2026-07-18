import { Activity, Dumbbell, Settings, Target } from 'lucide-react';

// Configuración estática del generador de plan nutricional.
// Extraído de NutritionPlanGenerator.jsx (ARCH-002) sin cambios de contenido.

export const TRAINING_TYPES = [
  { value: 'hipertrofia', label: 'Hipertrofia', desc: 'Ganar masa muscular', Icon: Target },
  { value: 'fuerza', label: 'Fuerza', desc: 'Aumentar fuerza maxima', Icon: Dumbbell },
  { value: 'resistencia', label: 'Resistencia', desc: 'Mejorar capacidad aerobica', Icon: Activity },
  { value: 'general', label: 'General', desc: 'Entrenamiento variado', Icon: Settings }
];

export const DIAS_SEMANA = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'];
export const DIAS_SEMANA_DATE = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
export const DURATION_PRESETS = [7, 14, 21, 28];
export const MAX_PLAN_DAYS = 28;
export const MIN_PLAN_DAYS = 3;
export const LOW_MEAL_COUNTS = new Set([1, 2]);

export const OBJECTIVE_OPTIONS = [
  { value: 'cut', label: 'Definicion', desc: 'Perder grasa' },
  { value: 'mant', label: 'Mantenimiento', desc: 'Mantener peso' },
  { value: 'bulk', label: 'Volumen', desc: 'Ganar musculo' }
];

export const ACTIVITY_OPTIONS = [
  { value: 'sedentario', label: 'Trabajo sentado, sin entrenos' },
  { value: 'ligero', label: 'Trabajo sentado + 1-3 entrenos' },
  { value: 'moderado', label: 'Trabajo sentado/de pie + 3-5 entrenos' },
  { value: 'alto', label: 'Trabajo de pie/fisico + 5-6 entrenos' },
  { value: 'muy_alto', label: 'Trabajo fisico duro + 6+ entrenos' }
];

export const ACTIVITY_HELP = {
  sedentario: {
    label: 'Sedentario',
    short: 'Trabajo sentado · 0-1 entrenos · <5.000 pasos/dia',
    detail: 'Si entrenas poco y el resto del dia estas sentado, esta suele ser la opcion correcta.'
  },
  ligero: {
    label: 'Ligero',
    short: 'Trabajo sentado · 1-3 entrenos · 5.000-7.500 pasos/dia',
    detail: 'Oficina o teletrabajo con algo de movimiento y algunos entrenos a la semana.'
  },
  moderado: {
    label: 'Moderado',
    short: 'Trabajo sentado o mixto · 3-5 entrenos · 7.500-10.000 pasos/dia',
    detail: 'Lo normal si entrenas regular, caminas bastante y no tienes un trabajo fisico duro.'
  },
  alto: {
    label: 'Alto',
    short: 'Trabajo de pie o fisico ligero · 5-6 entrenos · 10.000-12.000 pasos/dia',
    detail: 'No lo elijas solo por entrenar fuerte una hora si luego pasas casi todo el dia sentado.'
  },
  muy_alto: {
    label: 'Muy alto',
    short: 'Trabajo fisico duro · 6+ entrenos · >12.000 pasos/dia',
    detail: 'Reservado para trabajos fisicos exigentes o muchisimo movimiento diario.'
  }
};

export const PREFERENCE_KEYS = [
  { key: 'vegetariano', label: 'Vegetariano' },
  { key: 'vegano', label: 'Vegano' },
  { key: 'sin_gluten', label: 'Sin gluten' },
  { key: 'sin_lactosa', label: 'Sin lactosa' }
];

export const METABOLIC_PROFILE_META = {
  tolerante: {
    label: 'Mas carbo',
    description: 'Priorizamos mas carbohidratos y menos grasas.'
  },
  mixto: {
    label: 'Equilibrado',
    description: 'Reparto estable entre proteinas, carbos y grasas.'
  },
  intolerante: {
    label: 'Mas grasas',
    description: 'Priorizamos mas grasas y menos carbohidratos.'
  }
};

export const GOAL_TO_USER = {
  cut: 'perder_peso',
  mant: 'mantenimiento',
  bulk: 'ganar_masa_muscular'
};

export const GOAL_FROM_USER = {
  perder_peso: 'cut',
  mantenimiento: 'mant',
  mantener: 'mant',
  ganar_musculo: 'bulk',
  ganar_masa_muscular: 'bulk',
  ganar_peso: 'bulk',
  tonificar: 'mant',
  mantener_forma: 'mant',
  mejorar_resistencia: 'mant',
  fuerza: 'mant',
  resistencia: 'mant',
  rehabilitacion: 'mant',
  flexibilidad: 'mant'
};

export const ACTIVITY_TO_USER = {
  sedentario: 'sedentario',
  ligero: 'ligero',
  moderado: 'moderado',
  alto: 'activo',
  muy_alto: 'muy_activo'
};

export const ACTIVITY_FROM_USER = {
  sedentario: 'sedentario',
  ligero: 'ligero',
  ligeramente_activo: 'ligero',
  moderado: 'moderado',
  activo: 'alto',
  muy_activo: 'muy_alto',
  alto: 'alto',
  muy_alto: 'muy_alto'
};

export const DEFAULT_PROFILE = {
  objetivo: 'mant',
  actividad: 'moderado',
  comidas_dia: 4,
  metabolic_type: 'mixto',
  metabolic_score: null,
  metabolic_confidence: null,
  metabolic_pending_type: null,
  metabolic_pending_count: 0,
  preferencias: {
    vegetariano: false,
    vegano: false,
    sin_gluten: false,
    sin_lactosa: false
  },
  alergias: []
};

export const LOW_MEAL_COUNT_WARNING_COPY = {
  title: '¿Seguro que quieres usar pocas comidas al día?',
  description:
    'Con 1 o 2 comidas al día, según tus calorías objetivo, puede ser más difícil repartir bien calorías y macronutrientes. En muchos casos resulta más fácil organizar el plan en 3 o más comidas.',
  confirmSelection: 'Entendido y mantener esta opción',
  confirmGeneration: 'Entendido y generar plan',
  cancel: 'Cancelar y elegir otro número'
};
