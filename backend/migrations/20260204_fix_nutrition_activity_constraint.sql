-- ============================================================================
-- FIX: permitir valores de actividad segun spec (activo/ligeramente_activo/muy_activo)
-- ============================================================================

ALTER TABLE app.nutrition_profiles
  DROP CONSTRAINT IF EXISTS nutrition_profiles_actividad_check;

ALTER TABLE app.nutrition_profiles
  ADD CONSTRAINT nutrition_profiles_actividad_check
  CHECK (actividad = ANY (
    ARRAY[
      'sedentario'::text,
      'ligero'::text,
      'moderado'::text,
      'alto'::text,
      'muy_alto'::text,
      'ligeramente_activo'::text,
      'activo'::text,
      'muy_activo'::text
    ]
  ));

-- ============================================================================
-- FIN DEL SCRIPT
-- ============================================================================
