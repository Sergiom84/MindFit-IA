/**
 * 🧬 Orquestación del plan dedicado D1-D5 (MindFeed) reutilizable.
 *
 * Extrae el flujo build → transacción corta de persistencia que usaba SOLO la ruta
 * `POST /api/hipertrofia[v2]/generate-d1d5`, para poder DELEGAR internamente en él desde
 * el generador automático (`/api/routine-generation/ai/methodology`) cuando el perfil
 * resuelve a Hipertrofia. Así una preferencia explícita de Hipertrofia produce un plan
 * REAL del motor dedicado, en vez de un error o una rutina genérica de gimnasio.
 *
 * No duplica la lógica del motor: reutiliza `buildD1D5Plan`/`persistD1D5Plan`.
 */

import pool from '../../db.js';
import { buildD1D5Plan, persistD1D5Plan } from './planGenerationService.js';
import { cleanUserDrafts } from '../routineGeneration/draftCleaner.js';
import { cleanupUserStaleSessions } from '../sessionCleanupService.js';
import { logger } from './logger.js';

/**
 * Genera y persiste un plan D1-D5 para un usuario (idéntico a la ruta dedicada).
 * @param {number} userId
 * @param {{nivel?: string, totalWeeks?: number, startConfig?: object, includeWeek0?: boolean}} params
 * @param {{
 *   pool?: typeof import('../../db.js').default,
 *   buildD1D5Plan?: typeof buildD1D5Plan,
 *   persistD1D5Plan?: typeof persistD1D5Plan,
 *   cleanUserDrafts?: typeof cleanUserDrafts,
 *   cleanupUserStaleSessions?: typeof cleanupUserStaleSessions
 * }} [deps]
 * @returns {Promise<{plan: object, methodologyPlanId: number, planId: number}>}
 */
export async function generateAndPersistD1D5Plan(userId, {
  nivel = 'Principiante',
  totalWeeks,
  startConfig,
  includeWeek0 = true
} = {}, deps = {}) {
  const orchestratorPool = deps.pool || pool;
  const buildPlan = deps.buildD1D5Plan || buildD1D5Plan;
  const persistPlan = deps.persistD1D5Plan || persistD1D5Plan;
  const cleanDrafts = deps.cleanUserDrafts || cleanUserDrafts;
  const cleanupSessions = deps.cleanupUserStaleSessions || cleanupUserStaleSessions;

  // Limpieza pre-generación: cerrar sesiones huérfanas antes de generar el plan.
  const cleanupResult = await cleanupSessions(userId);
  if (cleanupResult.cleaned > 0) {
    logger.info(`🧹 [MINDFEED] Pre-limpieza: ${cleanupResult.cleaned} sesiones/drafts limpiados`);
  }

  // Fase 1: construcción (solo lecturas, sobre el pool, sin retener conexión de tx).
  const built = await buildPlan(orchestratorPool, { userId, nivel, totalWeeks, startConfig, includeWeek0 });

  // Fase 2: persistencia atómica en una transacción CORTA.
  const dbClient = await orchestratorPool.connect();
  try {
    await dbClient.query('BEGIN');
    await cleanDrafts(userId, dbClient);
    const result = await persistPlan(dbClient, built);
    await dbClient.query('COMMIT');
    return result;
  } catch (txError) {
    await dbClient.query('ROLLBACK');
    throw txError;
  } finally {
    dbClient.release();
  }
}
