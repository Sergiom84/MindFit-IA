/**
 * Catálogo canónico ÚNICO de opciones y etiquetas de perfil (F2, ONB-P2-01/02/P3-01).
 *
 * Antes, onboarding (steps de RegisterPage) y Perfil (useProfileState) tenían mapas
 * repartidos y divergentes: el enfoque HIIT/funcional/mixto del alta no existía en
 * Perfil (se mostraba "Pérdida de Peso"), la metodología funcional usaba dos valores
 * (`entrenamiento_funcional` vs `funcional`) y las franjas horarias tenían descripciones
 * distintas en cada lado. Este módulo es la fuente única para el FRONTEND.
 *
 * IMPORTANTE: los VALORES coinciden con los alias canónicos del backend
 * (`backend/services/userProfileContract.js`). No es un import compartido (front y back
 * son paquetes separados); si cambias un valor aquí, alinéalo allí y viceversa.
 * Los CHECK de BD vigentes: `horario_preferido` ∈ {mañana, media_mañana, tarde, noche};
 * `objetivo_principal` ∈ lista canónica de OBJETIVO_OPTIONS. `enfoque_entrenamiento` y
 * `metodologia_preferida` no tienen CHECK.
 */

export const SEXO_OPTIONS = [
  { value: 'masculino', label: 'Masculino' },
  { value: 'femenino', label: 'Femenino' },
  { value: 'otro', label: 'Otro' }
];

export const NIVEL_ACTIVIDAD_OPTIONS = [
  { value: 'sedentario', label: 'Sedentario' },
  { value: 'ligero', label: 'Ligero' },
  { value: 'moderado', label: 'Moderado' },
  { value: 'activo', label: 'Activo' },
  { value: 'muy_activo', label: 'Muy Activo' }
];

export const NIVEL_ENTRENAMIENTO_OPTIONS = [
  { value: 'principiante', label: 'Principiante' },
  { value: 'intermedio', label: 'Intermedio' },
  { value: 'avanzado', label: 'Avanzado' }
];

export const METODOLOGIA_OPTIONS = [
  { value: 'powerlifting', label: 'Powerlifting' },
  { value: 'bodybuilding', label: 'Bodybuilding' },
  { value: 'crossfit', label: 'CrossFit' },
  { value: 'calistenia', label: 'Calistenia' },
  { value: 'entrenamiento_casa', label: 'Entrenamiento en Casa' },
  { value: 'heavy_duty', label: 'Heavy Duty' },
  // Canónico: antes el alta guardaba `entrenamiento_funcional` (mostrado como
  // "No especificado" en Perfil). El backend ya canoniza a `funcional`.
  { value: 'funcional', label: 'Entrenamiento Funcional' }
];

// Etiquetas en el estilo de Perfil (Title Case), que era la superficie de datos ya
// establecida; onboarding las adopta. `mantenimiento`='Mantenimiento' respeta M-03.
export const OBJETIVO_OPTIONS = [
  { value: 'perder_peso', label: 'Perder Peso' },
  { value: 'ganar_masa_muscular', label: 'Ganar Masa Muscular' },
  { value: 'ganar_peso', label: 'Ganar Peso' },
  { value: 'tonificar', label: 'Tonificar' },
  { value: 'mejorar_resistencia', label: 'Mejorar Resistencia' },
  { value: 'mejorar_flexibilidad', label: 'Mejorar Flexibilidad' },
  { value: 'ganar_fuerza', label: 'Aumentar Fuerza' },
  { value: 'salud_general', label: 'Salud General' },
  { value: 'mantenimiento', label: 'Mantenimiento' },
  { value: 'rehabilitacion', label: 'Rehabilitación' }
];

// ONB-P2-02: el enfoque real (hiit/funcional/mixto) se conserva; ya NO se transforma
// en el backend (HIIT→perdida_peso). El motor/nutrición no consumen este campo.
export const ENFOQUE_OPTIONS = [
  { value: 'fuerza', label: 'Fuerza' },
  { value: 'hipertrofia', label: 'Hipertrofia' },
  { value: 'resistencia', label: 'Resistencia' },
  { value: 'funcional', label: 'Funcional' },
  { value: 'hiit', label: 'HIIT' },
  { value: 'mixto', label: 'Mixto' }
];

// ONB-P3-01: una única descripción de franjas, idéntica en alta y Perfil.
export const HORARIO_OPTIONS = [
  { value: 'mañana', label: 'Mañana (6:00 - 10:00)' },
  { value: 'media_mañana', label: 'Media mañana (10:00 - 14:00)' },
  { value: 'tarde', label: 'Tarde (14:00 - 18:00)' },
  { value: 'noche', label: 'Noche (18:00 - 22:00)' }
];

// Etiquetas de valores LEGACY que ya no se ofrecen como opción, pero que existen en
// datos históricos: se muestran con honestidad en Perfil (no como "No especificado").
const LEGACY_METODOLOGIA_LABELS = {
  entrenamiento_funcional: 'Entrenamiento Funcional',
  gimnasio: 'Gimnasio',
  halterofilia: 'Halterofilia'
};
const LEGACY_ENFOQUE_LABELS = {
  perdida_peso: 'Pérdida de Peso',
  general: 'Acondicionamiento General'
};
const LEGACY_OBJETIVO_LABELS = {
  mantener_forma: 'Mantenimiento',
  mantener: 'Mantenimiento',
  ganar_musculo: 'Ganar Masa Muscular'
};

/** Construye un getLabel(value) a partir de las opciones + etiquetas legacy. */
const buildLabelGetter = (options, legacy = {}, fallback = 'No especificado') => {
  const map = { ...legacy };
  options.forEach((o) => { map[o.value] = o.label; });
  return (value) => {
    if (value === '' || value === null || value === undefined) return fallback;
    const key = String(value).trim().toLowerCase();
    return map[key] || map[value] || fallback;
  };
};

export const getSexoLabel = buildLabelGetter(SEXO_OPTIONS);
export const getNivelActividadLabel = buildLabelGetter(NIVEL_ACTIVIDAD_OPTIONS);
export const getMetodologiaLabel = buildLabelGetter(METODOLOGIA_OPTIONS, LEGACY_METODOLOGIA_LABELS);
export const getObjetivoLabel = buildLabelGetter(OBJETIVO_OPTIONS, LEGACY_OBJETIVO_LABELS);
export const getEnfoqueLabel = buildLabelGetter(ENFOQUE_OPTIONS, LEGACY_ENFOQUE_LABELS);
export const getHorarioLabel = buildLabelGetter(HORARIO_OPTIONS);
