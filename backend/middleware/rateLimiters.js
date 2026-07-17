// SEC-004: limitadores de tasa centralizados y testeables.
//
// Se exponen como factorías (para que los tests creen instancias frescas con un
// `max` bajo y un store propio) y como instancias por defecto que consume server.js.
// En PR 5 se añadirá aquí la clasificación por-usuario (keyGenerator tras auth).
import rateLimit from 'express-rate-limit';

// Anti fuerza-bruta en autenticación. Cuenta por IP (req.ip; el helper IPv6 de
// express-rate-limit se aplica por defecto) y responde 429 con Retry-After.
export function createAuthLimiter(overrides = {}) {
  return rateLimit({
    windowMs: 15 * 60 * 1000, // 15 min
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiados intentos. Inténtalo de nuevo en unos minutos.' },
    ...overrides,
  });
}

// PR 1 (contención): límite por IP para endpoints de IA COSTOSA (generación de
// rutinas/menús, visión foto/vídeo, reevaluación IA). Estas llamadas disparan
// modelos de OpenAI y son caras. El límite fino por-usuario llega en PR 5.
export function createAiLimiter(overrides = {}) {
  return rateLimit({
    windowMs: 15 * 60 * 1000, // 15 min
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiadas solicitudes de IA. Inténtalo de nuevo en unos minutos.' },
    ...overrides,
  });
}

export const authLimiter = createAuthLimiter();
export const aiLimiter = createAiLimiter();
