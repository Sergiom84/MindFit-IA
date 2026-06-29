/**
 * Equipamiento de "Entrenamiento en Casa": fuente única de verdad para filtrar
 * el catálogo `disciplina='casa'` por el material disponible.
 *
 * Lo comparten el generador de día único (casaSingleDay.js) y el de plan completo
 * (GymRoutineService.js) para que ambos respeten el mismo material y los
 * ejercicios queden filtrados de forma coherente.
 */

// Material siempre disponible en casa: peso corporal + enseres domésticos
// comunes (no se ofrecen en el selector porque casi todo el mundo los tiene).
export const ALWAYS_AVAILABLE = [
  'Peso corporal', 'Esterilla', 'Pared', 'Silla', 'Sillas', 'Silla robusta',
  'Toalla', 'Toallas', 'Mesa', 'Escalón', 'Banco', 'Paralelas'
];

// Material opcional. Cada clave del selector mapea a uno o más valores reales de
// `equipamiento` en app.ejercicios.
export const EQUIPMENT_ALIASES = {
  mancuernas: ['Mancuernas', 'Peso ligero'],
  kettlebell: ['Kettlebell'],
  banda: ['Banda elástica'],
  barra: ['Barra', 'Barra dominadas']
};

/**
 * Construye la lista de materiales permitidos = enseres domésticos + el material
 * opcional declarado. `equipment` es un array de claves del selector
 * ('mancuernas', 'banda'…) o, por compatibilidad, strings de material literal.
 */
export function buildAllowedMaterials(equipment) {
  const allowed = new Set(ALWAYS_AVAILABLE);
  for (const raw of Array.isArray(equipment) ? equipment : []) {
    const key = String(raw || '').toLowerCase().trim();
    if (EQUIPMENT_ALIASES[key]) {
      for (const mat of EQUIPMENT_ALIASES[key]) allowed.add(mat);
    } else if (raw) {
      allowed.add(String(raw));
    }
  }
  return Array.from(allowed);
}

/**
 * Traduce el nivel de equipamiento del formulario de plan completo
 * ('minimo' | 'basico' | 'avanzado') a la lista de materiales permitidos.
 * - minimo: solo peso corporal y enseres domésticos.
 * - basico: + bandas y mancuernas.
 * - avanzado: + kettlebell y barra (todo el catálogo de casa).
 */
export function materialsForEquipmentLevel(level) {
  const lvl = String(level || '').toLowerCase().trim();
  if (lvl === 'avanzado') return buildAllowedMaterials(['mancuernas', 'kettlebell', 'banda', 'barra']);
  if (lvl === 'basico') return buildAllowedMaterials(['mancuernas', 'banda']);
  // 'minimo' o desconocido → solo material doméstico.
  return buildAllowedMaterials([]);
}
