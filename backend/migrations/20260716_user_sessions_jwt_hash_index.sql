-- AUTH-001: el middleware de autenticación ahora comprueba en cada request si la
-- sesión del token fue revocada (logout). Esa consulta filtra por jwt_token_hash,
-- que no tenía índice → seq scan por request. Este índice lo evita.
--
-- Se usa CREATE INDEX CONCURRENTLY para no bloquear escrituras en producción.
-- CONCURRENTLY no puede ejecutarse dentro de una transacción; aplicar suelto.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_sessions_jwt_token_hash
  ON app.user_sessions (jwt_token_hash);
