/**
 * Evaluador de nivel para HipertrofiaV2 (A-01).
 *
 * Antes, la card llamaba a /api/hipertrofia-specialist/evaluate-profile, que el
 * orquestador genérico enrutaba a GIMNASIO y devolvía un nivel por defecto dentro
 * de `evaluation.recommended_level`; la card, además, leía `nivel_hipertrofia`
 * (campo inexistente), así que TODO usuario acababa como Principiante.
 *
 * Criterio acordado: respetar el nivel declarado por el usuario
 * (users.nivel_entrenamiento) y, si falta o no es reconocible, derivarlo de los
 * años entrenando.
 */
import { logger } from './logger.js';

const NIVELES = { PRINCIPIANTE: 'Principiante', INTERMEDIO: 'Intermedio', AVANZADO: 'Avanzado' };

function normalizeDeclaredLevel(raw) {
  const value = String(raw || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  if (!value) return null;
  if (/(principiante|novato|inicial|beginner|basico)/.test(value)) return NIVELES.PRINCIPIANTE;
  if (/(intermedio|medio|intermediate)/.test(value)) return NIVELES.INTERMEDIO;
  if (/(avanzado|experto|advanced|elite)/.test(value)) return NIVELES.AVANZADO;
  return null;
}

function deriveLevelFromYears(years) {
  const y = Number(years);
  if (!Number.isFinite(y) || y < 1) return NIVELES.PRINCIPIANTE;
  if (y <= 3) return NIVELES.INTERMEDIO;
  return NIVELES.AVANZADO;
}

const RECOMMENDATION_BY_LEVEL = {
  [NIVELES.PRINCIPIANTE]: 'Full Body / PPL 3 días - Prioriza técnica y progresión de cargas',
  [NIVELES.INTERMEDIO]: 'PPL o Torso/Pierna 4 días - Aumenta volumen y ajusta RIR',
  [NIVELES.AVANZADO]: 'PPL frecuencia 2 (5 días) - Alto volumen y proximidad al fallo'
};

/**
 * Evalúa el nivel de HipertrofiaV2 de un usuario a partir de su perfil.
 * @param {object} dbClient - cliente/pool de base de datos
 * @param {number|string} userId
 * @returns {Promise<object>} evaluación con `nivel_hipertrofia` (campo que consume la card)
 */
export async function evaluateHipertrofiaLevel(dbClient, userId) {
  const result = await dbClient.query(
    `SELECT nivel_entrenamiento, anos_entrenando, "años_entrenando"
       FROM app.users WHERE id = $1`,
    [userId]
  );

  if (result.rows.length === 0) {
    throw new Error('Usuario no encontrado para evaluación de nivel');
  }

  const row = result.rows[0];
  const years = row.anos_entrenando ?? row['años_entrenando'] ?? null;
  const declared = normalizeDeclaredLevel(row.nivel_entrenamiento);
  const derived = deriveLevelFromYears(years);

  const level = declared || derived;
  const source = declared ? 'declarado' : 'derivado_anos';
  // Confianza: alta si el usuario lo declaró; media si lo derivamos de los años.
  const confidence = declared ? 0.9 : 0.6;

  // 'novato' marca al principiante sin bagaje para que la card ofrezca el bloque
  // de adaptación (Full Body vs Half Body).
  const tags = [];
  if (level === NIVELES.PRINCIPIANTE && (!Number.isFinite(Number(years)) || Number(years) < 1)) {
    tags.push('novato');
  }

  logger.info(
    `📊 [NIVEL HpV2] user=${userId} → ${level} (fuente=${source}, declarado=${row.nivel_entrenamiento || '∅'}, años=${years ?? '∅'})`
  );

  return {
    success: true,
    nivel_hipertrofia: level,
    experiencia: Number.isFinite(Number(years)) ? `${Number(years)} años entrenando` : 'Sin experiencia declarada',
    recomendacion: RECOMMENDATION_BY_LEVEL[level],
    confidence,
    source,
    tags_adaptacion: tags
  };
}
