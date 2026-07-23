/**
 * Sistema de logging condicional por entorno
 * @module routineGeneration/logger
 */

const isDevelopment = process.env.NODE_ENV !== 'production';

/**
 * Logger condicional - Solo muestra logs en desarrollo
 */
export const logger = {
  /**
   * Info: Solo desarrollo
   */
  info: (...args) => {
    if (isDevelopment) {
      console.log('[INFO]', ...args);
    }
  },

  /**
   * Debug: Solo desarrollo
   */
  debug: (...args) => {
    if (isDevelopment) {
      console.log('[DEBUG]', ...args);
    }
  },

  /**
   * Warn: Siempre
   */
  warn: (...args) => {
    console.warn('[WARN]', ...args);
  },

  /**
   * Error: Siempre
   */
  error: (...args) => {
    console.error('[ERROR]', ...args);
  },

  /**
   * Always: Siempre (logs críticos)
   */
  always: (...args) => {
    console.log('[CRITICAL]', ...args);
  }
};
