/**
 * Logger condicional para HipertrofiaV2
 * Solo muestra logs detallados en desarrollo
 */

const isDevelopment = process.env.NODE_ENV !== 'production';

export const logger = {
  info: (...args) => {
    if (isDevelopment) {
      console.log(...args);
    }
  },

  debug: (...args) => {
    if (isDevelopment) {
      console.log(...args);
    }
  },

  warn: (...args) => {
    console.warn(...args);
  },

  error: (...args) => {
    console.error(...args);
  },

  // Logs que siempre se muestran (críticos)
  always: (...args) => {
    console.log(...args);
  }
};
