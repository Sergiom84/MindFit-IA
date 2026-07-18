-- 20260718_sync_user_profiles_from_onboarding.sql
-- Descripción: sincroniza app.user_profiles con los datos de onboarding en app.users.
--
-- El registro guardaba objetivo_principal / metodologia_preferida / limitaciones_fisicas
-- en app.users, pero la generación de rutinas (getUserFullProfile) y el perfil los leen de
-- app.user_profiles (alias p), que quedaba vacío hasta que el usuario reguardaba el perfil.
-- En consecuencia, el objetivo del alta se ignoraba y el motor caía al default 'general'.
--
-- Este backfill crea/rellena la fila espejo para TODOS los usuarios existentes. A partir de
-- ahora el registro ya crea la fila; esta migración cubre a los usuarios previos. Idempotente:
-- solo rellena huecos y preserva cualquier edición previa del perfil (p tiene prioridad).
--
-- Nota de tipos: users.limitaciones_fisicas es text[]; user_profiles.limitaciones_fisicas es
-- text -> se aplana con array_to_string(..., '. ').

BEGIN;

-- 1) Usuarios sin fila en user_profiles: crearla con los datos del alta.
INSERT INTO app.user_profiles (user_id, objetivo_principal, metodologia_preferida, limitaciones_fisicas)
SELECT
  u.id,
  u.objetivo_principal,
  u.metodologia_preferida,
  NULLIF(array_to_string(u.limitaciones_fisicas, '. '), '')
FROM app.users u
LEFT JOIN app.user_profiles p ON p.user_id = u.id
WHERE p.user_id IS NULL
ON CONFLICT (user_id) DO NOTHING;

-- 2) Filas existentes con huecos: rellenar SOLO lo que esté vacío en user_profiles,
--    preservando ediciones previas del perfil (COALESCE con prioridad de p).
UPDATE app.user_profiles p
SET
  objetivo_principal    = COALESCE(p.objetivo_principal, u.objetivo_principal),
  metodologia_preferida = COALESCE(p.metodologia_preferida, u.metodologia_preferida),
  limitaciones_fisicas  = COALESCE(NULLIF(p.limitaciones_fisicas, ''), NULLIF(array_to_string(u.limitaciones_fisicas, '. '), '')),
  updated_at            = NOW()
FROM app.users u
WHERE p.user_id = u.id
  AND (
    p.objetivo_principal IS NULL
    OR p.metodologia_preferida IS NULL
    OR NULLIF(p.limitaciones_fisicas, '') IS NULL
  );

COMMIT;
