-- 20260718_auth001_refresh_rotativo.sql
-- AUTH-001 (PR 3): soporte de refresh token rotatorio independiente.
--
-- Añade a app.user_sessions dos columnas NULLABLE para el refresh token opaco:
--   · refresh_token_hash  (sha256 hex del refresh token; nunca se guarda el valor)
--   · refresh_expires_at  (caducidad del refresh, ~30 días)
-- Aditiva y compatible: las sesiones legacy (sin refresh) siguen funcionando con el
-- flujo actual mientras el nuevo esquema está detrás de flags apagados (ver
-- ACCESS_TOKEN_TTL / AUTH_FAIL_CLOSED). Índice parcial para la búsqueda por hash.
--
-- Idempotente (IF NOT EXISTS por columna e índice).

BEGIN;

ALTER TABLE app.user_sessions ADD COLUMN IF NOT EXISTS refresh_token_hash varchar(64);
ALTER TABLE app.user_sessions ADD COLUMN IF NOT EXISTS refresh_expires_at timestamptz;

COMMIT;

-- Índice para localizar la sesión por hash de refresh en /refresh (fuera de la
-- transacción por si en el futuro se migra a CONCURRENTLY; aquí la tabla es pequeña).
CREATE INDEX IF NOT EXISTS idx_user_sessions_refresh_token_hash
  ON app.user_sessions (refresh_token_hash)
  WHERE refresh_token_hash IS NOT NULL;
