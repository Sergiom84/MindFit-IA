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
 *  - `emits_training_load:false` por defecto. Una metodología puede declarar un flag
 *    de activación propio; nunca se infiere emisión por nombre o presencia de metadata.
 *  - La normalización NO cae en Hipertrofia ni en "general" para IDs desconocidos: devuelve
 *    null, y el contrato en modo strict lo rechaza explícitamente.
 */

import { isCrossfitRolloutUser } from '../../crossfit/featureFlags.js';

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
 * Trocea un valor normalizado en tokens de palabra completa (separados por espacio o `-`).
 * COR-F0-03: el matching por substring de aliases producía falsos positivos
 * (`entrenamiento local`→policia-local, `guardia activa`→guardia-civil). Ahora un alias
 * solo casa si su SECUENCIA de tokens aparece de forma contigua en el valor.
 */
function tokenize(value) {
  return normalizeKey(value).split(/[\s-]+/).filter(Boolean);
}

/** ¿La secuencia de tokens del alias aparece contigua dentro de los tokens del valor? */
function containsTokenSequence(keyTokens, aliasTokens) {
  if (aliasTokens.length === 0) return false;
  for (let i = 0; i + aliasTokens.length <= keyTokens.length; i += 1) {
    let match = true;
    for (let j = 0; j < aliasTokens.length; j += 1) {
      if (keyTokens[i + j] !== aliasTokens[j]) { match = false; break; }
    }
    if (match) return true;
  }
  return false;
}

/**
 * Descriptores en ORDEN DE PRECEDENCIA (las no-oposiciones antes que las oposiciones).
 * Los `aliases` se comparan por SECUENCIA DE TOKENS de palabra completa (ver `tokenize`),
 * no por substring: `guardia`/`nacional`/`local`/`policia` sueltos se han retirado por generar
 * falsos positivos (COR-F0-03). Las 4 oposiciones siguen normalizando por su nombre real.
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
    emits_training_load: false,
    immutable_draft_revisions: true,
    immutable_draft_revisions_flag: 'CROSSFIT_V2_GENERATION',
    rollout_qa_users_flag: 'CROSSFIT_V2_QA_USERS',
    training_load_flag: 'CROSSFIT_EMITS_TRAINING_LOAD',
    nutrition_load_flag: 'CROSSFIT_NUTRITION_LOAD'
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
    aliases: ['guardia-civil', 'guardia civil'],
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
    aliases: ['policia-nacional', 'policia nacional'],
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
    aliases: ['policia-local', 'policia local'],
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
 * ni a "general"). Coincidencia exacta por ID y, si no, por SECUENCIA DE TOKENS de los
 * aliases (palabra completa) en orden de precedencia. COR-F0-03: se retiró el matching por
 * substring para eliminar falsos positivos de oposiciones.
 * @param {string} value
 * @returns {string|null}
 */
export function normalizeMethodologyId(value) {
  const key = normalizeKey(value);
  if (!key) return null;
  if (DESCRIPTOR_BY_ID.has(key)) return key;
  const keyTokens = tokenize(key);
  for (const d of METHODOLOGY_DESCRIPTORS) {
    if (d.aliases.some((alias) => containsTokenSequence(keyTokens, tokenize(alias)))) {
      return d.id;
    }
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

/**
 * ¿La metodología emite carga de sesión validada (`training-load/v1`)? (§7.2, gate PR6).
 *
 * El valor estático sigue siendo `false` salvo que el descriptor declare un flag propio y
 * ese flag sea exactamente `true`. Una metodología desconocida nunca emite.
 * @param {string} value
 * @param {object} [env]
 * @returns {boolean}
 */
export function methodologyEmitsTrainingLoad(value, env = process.env) {
  const d = getMethodologyDescriptor(value);
  if (!d) return false;
  if (d.emits_training_load === true) return true;
  if (!d.training_load_flag) return false;
  return String(env?.[d.training_load_flag] ?? '').trim().toLowerCase() === 'true';
}

/** ¿La metodología conserva revisiones draft en vez de limpiarlas físicamente? */
export function methodologyUsesImmutableDraftRevisions(value, env = process.env, userId = null) {
  const descriptor = getMethodologyDescriptor(value);
  if (!descriptor?.immutable_draft_revisions) return false;
  if (!descriptor.immutable_draft_revisions_flag) return true;
  const enabled = String(env?.[descriptor.immutable_draft_revisions_flag] ?? '').trim().toLowerCase() === 'true';
  if (!enabled) return false;
  if (!descriptor.rollout_qa_users_flag || userId === null || userId === undefined) return true;
  return isCrossfitRolloutUser(userId, env);
}

/**
 * Aplica el rollout específico de Nutrición sin saltarse etapas:
 * - sin emisión validada, CrossFit queda en legacy;
 * - con emisión y modo shadow, calcula/persiste shadow aunque el flag nutricional siga off;
 * - un modo active se limita a shadow hasta activar también el flag nutricional.
 * Las metodologías sin política específica conservan el modo solicitado.
 */
export function resolveMethodologyNutritionPeriodizationMode(value, requestedMode, env = process.env) {
  const mode = ['legacy', 'shadow', 'active'].includes(String(requestedMode).toLowerCase())
    ? String(requestedMode).toLowerCase()
    : 'legacy';
  const d = getMethodologyDescriptor(value);
  if (!d) return 'legacy';
  if (!d.nutrition_load_flag) return mode;
  if (!methodologyEmitsTrainingLoad(value, env)) return 'legacy';
  if (mode !== 'active') return mode;
  const nutritionEnabled = String(env?.[d.nutrition_load_flag] ?? '').trim().toLowerCase() === 'true';
  return nutritionEnabled ? 'active' : 'shadow';
}
