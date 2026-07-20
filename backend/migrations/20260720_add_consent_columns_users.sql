-- 20260720_add_consent_columns_users.sql
-- Descripción: F3 (ONB-P1-05) — trazabilidad del consentimiento. El alta pasa a exigir
-- aceptación de términos y política de privacidad; se persiste QUÉ versión aceptó cada
-- usuario y CUÁNDO. El backend es la autoridad de la versión (backend/config/consent.js).
-- Idempotente (IF NOT EXISTS). ORDEN: aplicar ANTES de desplegar el código de registro
-- que inserta terms_version/terms_accepted_at/privacy_version.

BEGIN;

ALTER TABLE app.users
  ADD COLUMN IF NOT EXISTS terms_version     text,
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS privacy_version   text;

COMMIT;
