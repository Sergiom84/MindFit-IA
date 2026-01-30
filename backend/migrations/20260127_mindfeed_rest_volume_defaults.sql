-- MindFeed Compliance v1 - Fases E/F (defaults de seguridad)
-- Ajustes por defecto para evitar sobrevolumen si el ruleset no está disponible

-- 1) Defaults conservadores en configuración D1-D5
UPDATE app.hipertrofia_v2_session_config
SET
  default_sets = 2,
  multiarticular_count = 1,
  unilateral_count = 1,
  analitico_count = 1;

-- 2) Descansos normativos por tipo de ejercicio
UPDATE app."Ejercicios_Hipertrofia"
SET descanso_seg = 90
WHERE tipo_ejercicio = 'multiarticular';

UPDATE app."Ejercicios_Hipertrofia"
SET descanso_seg = 60
WHERE tipo_ejercicio = 'unilateral';

UPDATE app."Ejercicios_Hipertrofia"
SET descanso_seg = 50
WHERE tipo_ejercicio = 'analitico';
