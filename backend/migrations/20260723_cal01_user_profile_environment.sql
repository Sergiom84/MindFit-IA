-- PR-CAL-01 Subfase B (defecto G4) · Contexto de entorno del perfil.
--
-- Añade a app.user_profiles DOS campos que HOY no existen y que la generación de calistenia
-- necesita como contexto (entorno de entrenamiento y confirmación de seguridad del equipo).
--
-- Decisión de producto (Sergio, 2026-07-23): NO se añade `available_equipment` aquí porque el
-- equipamiento del usuario YA está modelado en app.user_equipment (fuente canónica); duplicarlo
-- crearía dos verdades divergentes. La generación leerá el equipo desde app.user_equipment.
--
-- ADITIVA e IDEMPOTENTE (ADD COLUMN IF NOT EXISTS): en producción, si las columnas ya existen no
-- hace nada. No crea funciones → no requiere REVOKE FROM PUBLIC. No toca datos existentes.
--
-- Semántica (contrato userProfileContract.js):
--   training_environment        text     -> 'gimnasio' | 'casa' | 'exterior' | NULL (ausente).
--   equipment_safety_confirmed  boolean  -> TRUE/FALSE explícito; NULL = sin confirmar (no se
--                                           asume que el equipo es seguro). Dato ausente = NULL.

ALTER TABLE app.user_profiles
  ADD COLUMN IF NOT EXISTS training_environment text,
  ADD COLUMN IF NOT EXISTS equipment_safety_confirmed boolean;
