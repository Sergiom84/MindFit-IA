// AUTH-001 (PR 3): primitivas de tokens y configuración por flags.
//
// Todos los flags tienen valores por defecto COMPATIBLES con el esquema actual, para
// que el backend sea desplegable antes de que el cliente (PR 4) soporte el refresh
// rotatorio. La activación (access corto + fail-closed) se hace cambiando env vars en
// un despliegue POSTERIOR, no aquí.
//
//   ACCESS_TOKEN_TTL        (def '7d')   -> vida del access token. PR 4/activación: '15m'.
//   REFRESH_TOKEN_TTL_DAYS  (def 30)     -> vida del refresh token rotatorio.
//   AUTH_FAIL_CLOSED        (def '0')    -> '1' rechaza tokens sin sesión activa (fail-closed).
//   AUTH_LEGACY_GRACE       (def '1')    -> '1' tolera tokens legacy sin `jti` (ventana de gracia).
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

export const ACCESS_TOKEN_TTL = process.env.ACCESS_TOKEN_TTL || '7d';
export const REFRESH_TOKEN_TTL_DAYS = Number(process.env.REFRESH_TOKEN_TTL_DAYS || 30);
export const AUTH_FAIL_CLOSED = process.env.AUTH_FAIL_CLOSED === '1';
export const AUTH_LEGACY_GRACE = process.env.AUTH_LEGACY_GRACE !== '0';

// Identificador de sesión generado en la APP (antes de firmar), para usarlo como `jti`
// del access token sin depender del INSERT en BD (evita la dependencia circular).
export function newSessionId() {
  return crypto.randomUUID();
}

// Firma el access token ligando `jti` = session_id. Los clientes legacy ignoran `jti`.
export function signAccessToken({ userId, email, jti }) {
  return jwt.sign({ userId, email, jti }, process.env.JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL });
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

// Refresh token opaco con formato `<sessionId>.<random>`. El prefijo permite localizar
// la sesión (familia) en /refresh y detectar REUSO comparando el hash del token completo
// contra el almacenado. En BD solo se guarda el hash, nunca el valor.
export function newRefreshToken(sessionId) {
  const secret = crypto.randomBytes(48).toString('hex');
  const token = `${sessionId}.${secret}`;
  return {
    token,
    hash: sha256(token),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
  };
}

export function hashRefreshToken(token) {
  return sha256(token);
}

// Extrae el session_id (prefijo) de un refresh token con formato `<sessionId>.<random>`.
// Devuelve null si no tiene el formato esperado (token inválido).
export function sessionIdFromRefreshToken(token) {
  if (typeof token !== 'string') return null;
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const candidate = token.slice(0, dot);
  // UUID v4 (formato de session_id)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidate)) return null;
  return candidate;
}
