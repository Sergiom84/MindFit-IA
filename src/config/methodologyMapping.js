/**
 * 🔗 Methodology Mapping - Single Source of Truth
 *
 * Este archivo actúa como puente entre backend y frontend,
 * garantizando consistencia en IDs, nombres y claves.
 *
 * RESPONSABILIDADES:
 * - Mapeo bidireccional backend ↔ frontend
 * - Validación de consistencia
 * - Single source of truth para identificadores
 *
 * @version 1.0.0
 * @author Claude Code
 */

// =============================================================================
// 🎯 SINGLE SOURCE OF TRUTH - IDs y Nombres
// =============================================================================

/**
 * Mapeo maestro entre backend y frontend
 * REGLA: Toda metodología debe estar aquí para ser válida
 */
export const METHODOLOGY_ID_MAPPING = {
  // Backend Key → Frontend ID → Display Name
  'HEAVY_DUTY': {
    frontendId: 'heavy-duty',
    displayName: 'Heavy Duty',
    category: 'fuerza'
  },
  'POWERLIFTING': {
    frontendId: 'powerlifting',
    displayName: 'Powerlifting',
    category: 'fuerza'
  },
  'FUNCIONAL': {
    frontendId: 'funcional',
    displayName: 'Funcional',
    category: 'movimiento'
  },
  'OPOSICIONES': {
    frontendId: 'oposiciones',
    displayName: 'Oposiciones',
    category: 'rendimiento'
  },
  'CROSSFIT': {
    frontendId: 'crossfit',
    displayName: 'CrossFit',
    category: 'mixto'
  },
  'CALISTENIA': {
    frontendId: 'calistenia',
    displayName: 'Calistenia',
    category: 'peso_corporal'
  },
  'HOME_TRAINING': {
    frontendId: 'entrenamiento-casa',
    displayName: 'Entrenamiento en Casa',
    category: 'adaptado'
  }
};

// =============================================================================
// 🔄 UTILIDADES DE MAPEO
// =============================================================================

/**
 * Convierte backend key a frontend id
 * @param {string} backendKey - Clave del backend (ej: 'HEAVY_DUTY')
 * @returns {string|null} ID del frontend (ej: 'heavy-duty')
 */
export function backendToFrontend(backendKey) {
  const mapping = METHODOLOGY_ID_MAPPING[backendKey];
  return mapping ? mapping.frontendId : null;
}

/**
 * Convierte frontend id a backend key
 * @param {string} frontendId - ID del frontend (ej: 'heavy-duty')
 * @returns {string|null} Clave del backend (ej: 'HEAVY_DUTY')
 */
export function frontendToBackend(frontendId) {
  const entry = Object.entries(METHODOLOGY_ID_MAPPING).find(
    ([_, config]) => config.frontendId === frontendId
  );
  return entry ? entry[0] : null;
}

/**
 * Obtiene el nombre para mostrar
 * @param {string} identifier - Puede ser backend key o frontend id
 * @returns {string|null} Nombre para mostrar
 */
export function getDisplayName(identifier) {
  // Intentar como backend key primero
  let mapping = METHODOLOGY_ID_MAPPING[identifier];

  // Si no existe, intentar como frontend id
  if (!mapping) {
    const entry = Object.entries(METHODOLOGY_ID_MAPPING).find(
      ([_, config]) => config.frontendId === identifier
    );
    mapping = entry ? entry[1] : null;
  }

  return mapping ? mapping.displayName : null;
}

/**
 * Obtiene la categoría de una metodología
 * @param {string} identifier - Backend key o frontend id
 * @returns {string|null} Categoría de la metodología
 */
export function getMethodologyCategory(identifier) {
  // Intentar como backend key primero
  let mapping = METHODOLOGY_ID_MAPPING[identifier];

  // Si no existe, intentar como frontend id
  if (!mapping) {
    const entry = Object.entries(METHODOLOGY_ID_MAPPING).find(
      ([_, config]) => config.frontendId === identifier
    );
    mapping = entry ? entry[1] : null;
  }

  return mapping ? mapping.category : null;
}

// =============================================================================
// 🔍 VALIDACIÓN Y CONSISTENCIA
// =============================================================================

/**
 * Valida que un identificador existe en el sistema
 * @param {string} identifier - Backend key o frontend id
 * @returns {boolean} True si existe
 */
export function isValidMethodology(identifier) {
  return getDisplayName(identifier) !== null;
}

/**
 * Obtiene todas las metodologías válidas
 * @returns {Array} Lista de objetos con backendKey, frontendId, displayName
 */
export function getAllMethodologies() {
  return Object.entries(METHODOLOGY_ID_MAPPING).map(([backendKey, config]) => ({
    backendKey,
    frontendId: config.frontendId,
    displayName: config.displayName,
    category: config.category
  }));
}

/**
 * Valida consistencia entre datos de backend y frontend
 * @param {Array} backendMethodologies - Lista del backend
 * @param {Array} frontendMethodologies - Lista del frontend
 * @returns {Object} Reporte de consistencia
 */
export function validateConsistency(backendMethodologies = [], frontendMethodologies = []) {
  const report = {
    isConsistent: true,
    missingInBackend: [],
    missingInFrontend: [],
    extraInBackend: [],
    extraInFrontend: []
  };

  // Obtener keys/ids esperados
  const expectedBackendKeys = Object.keys(METHODOLOGY_ID_MAPPING);
  const expectedFrontendIds = Object.values(METHODOLOGY_ID_MAPPING).map(m => m.frontendId);

  // Validar backend
  const actualBackendKeys = backendMethodologies.map(m => m.key || m.name);
  report.missingInBackend = expectedBackendKeys.filter(key => !actualBackendKeys.includes(key));
  report.extraInBackend = actualBackendKeys.filter(key => !expectedBackendKeys.includes(key));

  // Validar frontend
  const actualFrontendIds = frontendMethodologies.map(m => m.id);
  report.missingInFrontend = expectedFrontendIds.filter(id => !actualFrontendIds.includes(id));
  report.extraInFrontend = actualFrontendIds.filter(id => !expectedFrontendIds.includes(id));

  // Determinar si hay inconsistencias
  report.isConsistent =
    report.missingInBackend.length === 0 &&
    report.missingInFrontend.length === 0 &&
    report.extraInBackend.length === 0 &&
    report.extraInFrontend.length === 0;

  return report;
}

// =============================================================================
// 🎨 HELPERS PARA DESARROLLO
// =============================================================================

/**
 * Genera documentación de mapeo para desarrolladores
 * @returns {string} Documentación formateada
 */
export function generateMappingDocs() {
  const methodologies = getAllMethodologies();

  let docs = `# 📋 Methodology Mapping Reference\n\n`;
  docs += `| Backend Key | Frontend ID | Display Name | Category |\n`;
  docs += `|-------------|-------------|--------------|----------|\n`;

  methodologies.forEach(m => {
    docs += `| \`${m.backendKey}\` | \`${m.frontendId}\` | ${m.displayName} | ${m.category} |\n`;
  });

  docs += `\n**Total:** ${methodologies.length} metodologías registradas\n`;

  return docs;
}

/**
 * Debug helper - imprime estado del mapeo
 */
export function debugMapping() {
  console.group('🔗 Methodology Mapping Debug');
  console.log('📊 Total metodologías:', Object.keys(METHODOLOGY_ID_MAPPING).length);
  console.table(getAllMethodologies());
  console.groupEnd();
}

// =============================================================================
// 🚀 EXPORTACIONES DEFAULT
// =============================================================================

export default {
  // Mapeo principal
  METHODOLOGY_ID_MAPPING,

  // Conversores
  backendToFrontend,
  frontendToBackend,
  getDisplayName,
  getMethodologyCategory,

  // Validadores
  isValidMethodology,
  getAllMethodologies,
  validateConsistency,

  // Helpers
  generateMappingDocs,
  debugMapping
};