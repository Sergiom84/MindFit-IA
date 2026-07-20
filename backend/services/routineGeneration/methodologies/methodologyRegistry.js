/**
 * 🗂️ Registro canónico de metodologías (Nutrición Fase 0, doc 04 PR2, spec §7).
 *
 * Extrae la IDENTIDAD de dominio (id, aliases, familia de demanda, niveles) que hoy está
 * repartida entre el orquestador, Nutrición, ajustes y UI, para que haya UNA sola fuente.
 * No sustituye al orquestador ni cambia el contrato público: `MethodologyOrchestrator`
 * delega aquí `normalizeMethodologyId` y `getSupportedMethodologies` manteniendo su firma.
 *
 * Reglas clave (§7):
 *  - Se conservan los IDs que ya usa el backend (sin migración masiva).
 *  - `gimnasio` NO se expone como metodología seleccionable (Hipertrofia legacy retirada):
 *    `legacy:true`, `selectable:false`. No se elimina de constantes por compatibilidad.
 *  - `emits_training_load:false` en TODAS por ahora; pasará a true cuando la fase específica
 *    de esa metodología pase sus pruebas (evita declarar una integración terminada antes).
 *  - La normalización NO cae en Hipertrofia ni en "general" para IDs desconocidos: devuelve
 *    null, y el contrato en modo strict lo rechaza explícitamente.
 */

function stripDiacritics(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/** Normaliza a minúsculas, sin acentos y con `_`→`-`. */
function normalizeKey(value) {
  return stripDiacritics(value).toLowerCase().replace(/_/g, '-').trim();
}

/**
 * Descriptores en ORDEN DE PRECEDENCIA (las no-oposiciones antes que las oposiciones),
 * replicando el matching por substring del orquestador histórico para no cambiar la
 * normalización existente. Los `aliases` se comparan como substring del valor normalizado.
 */
export const METHODOLOGY_DESCRIPTORS = [
  {
    id: 'calistenia',
    display_name: 'Calistenia',
    description: 'Entrenamiento con peso corporal',
    aliases: ['calistenia', 'calisthenics'],
    selectable: true,
    legacy: false,
    levels: ['principiante', 'intermedio', 'avanzado'],
    auto_evaluation: true,
    generator: 'calistenia',
    demand_family: 'bodyweight_skill',
    is_opposition: false,
    emits_training_load: false
  },
  {
    id: 'crossfit',
    display_name: 'CrossFit',
    description: 'Acondicionamiento funcional de alta intensidad',
    aliases: ['crossfit', 'cross-fit'],
    selectable: true,
    legacy: false,
    levels: ['principiante', 'intermedio', 'avanzado', 'elite'],
    auto_evaluation: true,
    generator: 'crossfit',
    demand_family: 'mixed_conditioning',
    is_opposition: false,
    emits_training_load: false
  },
  {
    id: 'funcional',
    display_name: 'Funcional',
    description: 'Entrenamiento funcional y movimientos naturales',
    // F2 canonizó `entrenamiento_funcional`→`funcional`; se acepta también con guion bajo.
    aliases: ['funcional', 'entrenamiento funcional', 'entrenamiento-funcional'],
    selectable: true,
    legacy: false,
    levels: ['principiante', 'intermedio', 'avanzado'],
    auto_evaluation: false,
    generator: 'funcional',
    demand_family: 'mixed_conditioning',
    is_opposition: false,
    emits_training_load: false
  },
  {
    id: 'powerlifting',
    display_name: 'Powerlifting',
    description: 'Fuerza máxima en sentadilla, banca y peso muerto',
    aliases: ['powerlifting', 'power lifting', 'power-lifting'],
    selectable: true,
    legacy: false,
    levels: ['principiante', 'intermedio', 'avanzado'],
    auto_evaluation: false,
    generator: 'powerlifting',
    demand_family: 'strength',
    is_opposition: false,
    emits_training_load: false
  },
  {
    id: 'heavy-duty',
    display_name: 'Heavy Duty',
    description: 'Entrenamiento de alta intensidad y bajo volumen',
    aliases: ['heavy-duty', 'heavy duty', 'heavyduty'],
    selectable: true,
    legacy: false,
    levels: ['principiante', 'intermedio', 'avanzado'],
    auto_evaluation: false,
    generator: 'heavy-duty',
    demand_family: 'strength',
    is_opposition: false,
    emits_training_load: false
  },
  {
    id: 'halterofilia',
    display_name: 'Halterofilia',
    description: 'Técnica olímpica, potencia y fuerza base',
    aliases: ['halterofilia', 'weightlifting olimpico'],
    selectable: true,
    legacy: false,
    levels: ['principiante', 'intermedio', 'avanzado'],
    auto_evaluation: false,
    generator: 'halterofilia',
    demand_family: 'strength_power',
    is_opposition: false,
    emits_training_load: false
  },
  {
    id: 'casa',
    display_name: 'Entrenamiento en Casa',
    description: 'Rutinas adaptadas para entrenar en casa',
    aliases: ['entrenamiento-casa', 'entrenamiento casa', 'casa'],
    selectable: true,
    legacy: false,
    levels: ['principiante', 'intermedio', 'avanzado'],
    auto_evaluation: false,
    generator: 'casa',
    demand_family: 'mixed_conditioning',
    is_opposition: false,
    emits_training_load: false
  },
  {
    id: 'gimnasio',
    display_name: 'Gimnasio General',
    description: 'Rutinas de gimnasio personalizadas',
    aliases: ['gimnasio', 'gym'],
    // §7.1: NO seleccionable (Hipertrofia legacy retirada). Se conserva por compatibilidad.
    selectable: false,
    legacy: true,
    levels: ['principiante', 'intermedio', 'avanzado'],
    auto_evaluation: false,
    generator: 'gimnasio',
    demand_family: 'hypertrophy',
    is_opposition: false,
    emits_training_load: false
  },
  // ── Oposiciones (precedencia posterior) ──────────────────────────────────────
  {
    id: 'bomberos',
    display_name: 'Bomberos',
    description: 'Preparación física para oposiciones de Bombero',
    aliases: ['bomberos', 'bombero'],
    selectable: true,
    legacy: false,
    levels: ['principiante', 'intermedio', 'avanzado'],
    auto_evaluation: false,
    generator: 'oposicion',
    demand_family: 'mixed_conditioning',
    is_opposition: true,
    emits_training_load: false
  },
  {
    id: 'guardia-civil',
    display_name: 'Guardia Civil',
    description: 'Preparación física para oposiciones de Guardia Civil',
    aliases: ['guardia-civil', 'guardia civil', 'guardia'],
    selectable: true,
    legacy: false,
    levels: ['principiante', 'intermedio', 'avanzado'],
    auto_evaluation: false,
    generator: 'oposicion',
    demand_family: 'mixed_conditioning',
    is_opposition: true,
    emits_training_load: false
  },
  {
    id: 'policia-nacional',
    display_name: 'Policía Nacional',
    description: 'Preparación física para oposiciones de Policía Nacional',
    aliases: ['policia-nacional', 'policia nacional', 'nacional'],
    selectable: true,
    legacy: false,
    levels: ['principiante', 'intermedio', 'avanzado'],
    auto_evaluation: false,
    generator: 'oposicion',
    demand_family: 'mixed_conditioning',
    is_opposition: true,
    emits_training_load: false
  },
  {
    id: 'policia-local',
    display_name: 'Policía Local',
    description: 'Preparación física para oposiciones de Policía Local',
    aliases: ['policia-local', 'policia local', 'local', 'policia'],
    selectable: true,
    legacy: false,
    levels: ['principiante', 'intermedio', 'avanzado'],
    auto_evaluation: false,
    generator: 'oposicion',
    demand_family: 'mixed_conditioning',
    is_opposition: true,
    emits_training_load: false
  }
];

const DESCRIPTOR_BY_ID = new Map(METHODOLOGY_DESCRIPTORS.map((d) => [d.id, d]));

/**
 * Normaliza un valor a su ID canónico, o `null` si no lo reconoce (NUNCA a Hipertrofia
 * ni a "general"). Usa matching por substring de los aliases, en orden de precedencia,
 * replicando el comportamiento histórico del orquestador.
 * @param {string} value
 * @returns {string|null}
 */
export function normalizeMethodologyId(value) {
  const key = normalizeKey(value);
  if (!key) return null;
  if (DESCRIPTOR_BY_ID.has(key)) return key;
  for (const d of METHODOLOGY_DESCRIPTORS) {
    if (d.aliases.some((alias) => key.includes(alias))) return d.id;
  }
  return null;
}

/**
 * Descriptor canónico de una metodología (o null si no se reconoce).
 * @param {string} value
 * @returns {object|null}
 */
export function getMethodologyDescriptor(value) {
  const id = normalizeMethodologyId(value);
  return id ? DESCRIPTOR_BY_ID.get(id) : null;
}

/** ¿Existe la metodología en el registro? */
export function isKnownMethodology(value) {
  return normalizeMethodologyId(value) !== null;
}

/**
 * Lista de metodologías. Por defecto solo las seleccionables (excluye `gimnasio` legacy).
 * Mapea al shape público histórico para no romper el endpoint/UI.
 * @param {{selectableOnly?: boolean}} [opts]
 */
export function getSupportedMethodologies({ selectableOnly = true } = {}) {
  return METHODOLOGY_DESCRIPTORS
    .filter((d) => (selectableOnly ? d.selectable : true))
    .map((d) => ({
      id: d.id,
      name: d.display_name,
      description: d.description,
      hasAutoEvaluation: d.auto_evaluation,
      levels: [...d.levels],
      ...(d.is_opposition ? { isOposicion: true } : {})
    }));
}

/** ¿Es una oposición? */
export function isOppositionMethodology(value) {
  const d = getMethodologyDescriptor(value);
  return !!(d && d.is_opposition);
}

/**
 * Familia de demanda de la metodología (para que Nutrición NO decida por el nombre).
 * @returns {string|null}
 */
export function resolveDemandFamily(value) {
  const d = getMethodologyDescriptor(value);
  return d ? d.demand_family : null;
}
