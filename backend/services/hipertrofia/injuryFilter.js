/**
 * 🩹 Filtro de lesiones para HipertrofiaV2.
 *
 * HipertrofiaV2 es un motor propio (MindFeed) que NO pasa por el generador
 * determinista del resto de metodologías, por lo que hasta ahora ignoraba las
 * lesiones del usuario. Este módulo REUTILIZA el filtro compartido
 * (`routineGeneration/injuryContraindications.js`) para que la selección de
 * ejercicios respete `limitaciones_fisicas` con el mismo criterio (sin acentos,
 * conservador, muñeca excluye apoyos de manos, etc.). No dupliques reglas aquí.
 *
 * @module hipertrofia/injuryFilter
 */

import { getUserFullProfile } from '../routineGeneration/database/userRepository.js';
import {
  extractInjuryText,
  activeInjuryRules
} from '../routineGeneration/injuryContraindications.js';
import { logger } from './logger.js';

/**
 * Resuelve las reglas de contraindicación activas para un usuario.
 * Lee el perfil (COALESCE users/user_profiles) y devuelve las reglas + metadatos
 * listos para inyectar en la selección y registrar en el plan.
 *
 * @param {number|string} userId
 * @returns {Promise<{ rules: Array, zonas: string[], injuryText: string }>}
 */
export async function resolveUserInjuryRules(userId) {
  try {
    const profile = await getUserFullProfile(userId);
    const injuryText = extractInjuryText(profile);
    const rules = activeInjuryRules(injuryText);

    if (rules.length > 0) {
      const zonas = rules.map((r) => r.zona);
      logger.info(`🩹 [LESIONES] Usuario ${userId}: zonas activas → ${zonas.join(', ')}`);
      return { rules, zonas, injuryText };
    }

    return { rules: [], zonas: [], injuryText: injuryText || '' };
  } catch (error) {
    // Ante cualquier fallo leyendo el perfil, no bloqueamos la generación:
    // devolvemos sin reglas (comportamiento previo) y dejamos traza.
    logger.warn(`⚠️ [LESIONES] No se pudieron resolver reglas para ${userId}: ${error.message}`);
    return { rules: [], zonas: [], injuryText: '' };
  }
}
