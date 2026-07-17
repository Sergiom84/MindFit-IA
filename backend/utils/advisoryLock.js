/**
 * Advisory locks para jobs embebidos (OPS-001).
 *
 * Los cron/intervalos de mantenimiento viven dentro del web service. Con una sola
 * instancia (plan free actual) no hay problema, pero al escalar a >1 réplica cada
 * instancia dispararía los mismos jobs en paralelo (marcado de missed duplicado,
 * limpiezas concurrentes, N ejecuciones al arranque).
 *
 * `withAdvisoryLock` garantiza que, ante varias instancias, SOLO UNA ejecute el job:
 * intenta tomar un advisory lock de sesión no bloqueante (`pg_try_advisory_lock`).
 * Si otra instancia ya lo tiene, se omite la ejecución (no espera). El lock se
 * mantiene sobre un cliente dedicado del pool durante todo el job y se libera al
 * terminar.
 *
 * Requisito de fiabilidad: el pooler de Supabase debe estar en modo SESSION (puerto
 * 5432, el que usa este backend). En modo transaction (6543) los locks de sesión no
 * son fiables; si algún día se migra a 6543 habría que pasar a locks transaccionales
 * (pg_try_advisory_xact_lock) dentro de la transacción del job.
 */

import { pool } from '../db.js';

// Claves de lock por job. Enteros fijos y distintos (namespace arbitrario 4820xxx
// para no colisionar con otros posibles usos de advisory locks en la BD).
export const LOCK_KEYS = Object.freeze({
  missedSessions: 4820001,
  sessionMaintenance: 4820002,
  sessionMaintenanceStats: 4820003,
  sessionCleanup: 4820004,
});

/**
 * Ejecuta `fn` solo si se obtiene el advisory lock `key`. Si otra instancia lo
 * posee, omite la ejecución y devuelve { skipped: true }. Nunca lanza por el lock;
 * si `fn` lanza, se propaga tras liberar el lock.
 *
 * @param {number} key   Clave del advisory lock (ver LOCK_KEYS).
 * @param {string} label Etiqueta legible para logs.
 * @param {() => Promise<any>} fn Trabajo a ejecutar en exclusión mutua.
 */
export async function withAdvisoryLock(key, label, fn) {
  let client;
  try {
    client = await pool.connect();
  } catch (err) {
    // Si no se puede ni conectar, no bloqueamos el arranque del server: se omite.
    console.error(`🔒 [${label}] No se pudo obtener conexión para el lock:`, err?.message || err);
    return { skipped: true, error: err?.message || String(err) };
  }

  try {
    const { rows } = await client.query('SELECT pg_try_advisory_lock($1) AS locked', [key]);
    if (!rows[0]?.locked) {
      console.log(`🔒 [${label}] Otra instancia posee el lock ${key}; se omite esta ejecución.`);
      return { skipped: true };
    }

    try {
      return await fn();
    } finally {
      try {
        await client.query('SELECT pg_advisory_unlock($1)', [key]);
      } catch (unlockErr) {
        // Si falla el unlock (p.ej. conexión caída), el lock se libera solo al
        // cerrarse la sesión. Lo registramos y seguimos.
        console.error(`🔒 [${label}] Error liberando lock ${key}:`, unlockErr?.message || unlockErr);
      }
    }
  } finally {
    client.release();
  }
}
