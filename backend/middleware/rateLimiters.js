// SEC-004: limitadores de tasa centralizados, clasificados y testeables.
//
// Se exponen como factorías (para que los tests creen instancias frescas con un `max`
// bajo y un store propio) y como instancias por defecto que consume server.js.
//
// PR 5: clasificación por tipo de endpoint y keying POR USUARIO cuando hay token.
// El keyGenerator prefiere el usuario autenticado; si el limitador se monta antes de
// authenticateToken, verifica el bearer para keyear igualmente por usuario; si no hay
// token válido, cae a la IP (con el helper IPv6-safe de express-rate-limit).
import jwt from 'jsonwebtoken';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

// Clave por usuario (u:<id>) o por IP (ip:<ip normalizada IPv6>).
export function userOrIpKey(req) {
  const uid = req.user?.userId ?? req.user?.id;
  if (uid) return `u:${uid}`;
  const auth = req.headers['authorization'];
  const token = auth && auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (token) {
    try {
      const dec = jwt.verify(token, process.env.JWT_SECRET);
      const id = dec?.userId ?? dec?.id;
      if (id) return `u:${id}`;
    } catch {
      /* token inválido -> cae a IP */
    }
  }
  return `ip:${ipKeyGenerator(req.ip)}`;
}

const base = { standardHeaders: true, legacyHeaders: false };

// Anti fuerza-bruta en autenticación. Por IP (pre-auth): login/registro/refresh.
export function createAuthLimiter(overrides = {}) {
  return rateLimit({
    ...base,
    windowMs: 15 * 60 * 1000, // 15 min
    max: 30,
    keyGenerator: (req) => `ip:${ipKeyGenerator(req.ip)}`,
    message: { error: 'Demasiados intentos. Inténtalo de nuevo en unos minutos.' },
    ...overrides,
  });
}

// IA COSTOSA (generación de rutinas/menús, visión foto/vídeo, reevaluación IA).
// Por USUARIO (fallback IP). Disparan modelos de OpenAI y son caras.
export function createAiLimiter(overrides = {}) {
  return rateLimit({
    ...base,
    windowMs: 15 * 60 * 1000, // 15 min
    max: 20,
    keyGenerator: userOrIpKey,
    message: { error: 'Demasiadas solicitudes de IA. Inténtalo de nuevo en unos minutos.' },
    ...overrides,
  });
}

// UPLOADS (subida de ficheros). Por USUARIO; complementa el límite de tamaño de multer.
export function createUploadLimiter(overrides = {}) {
  return rateLimit({
    ...base,
    windowMs: 15 * 60 * 1000, // 15 min
    max: 60,
    keyGenerator: userOrIpKey,
    message: { error: 'Demasiadas subidas. Inténtalo de nuevo en unos minutos.' },
    ...overrides,
  });
}

// HEARTBEAT / actividad de sesión: frecuente y automático -> límite GENEROSO por usuario
// (compatible con su cadencia real), solo como tope anti-bucle.
export function createHeartbeatLimiter(overrides = {}) {
  return rateLimit({
    ...base,
    windowMs: 15 * 60 * 1000, // 15 min
    max: 300,
    keyGenerator: userOrIpKey,
    message: { error: 'Demasiadas señales de actividad.' },
    ...overrides,
  });
}

export const authLimiter = createAuthLimiter();
export const aiLimiter = createAiLimiter();
export const uploadLimiter = createUploadLimiter();
export const heartbeatLimiter = createHeartbeatLimiter();
