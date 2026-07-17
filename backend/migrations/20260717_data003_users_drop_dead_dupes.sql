-- 20260717_data003_users_drop_dead_dupes.sql
-- DATA-003 (fase 7): canoniza pares equivalentes en app.users eliminando columnas
-- duplicadas MUERTAS (0 datos + 0 referencias en código).
--
-- Verificado (read-only + trazado backend/frontend, 2026-07-17):
--   · app.users.brazo (numeric): 0 non-null en 90 users; su gemela canónica `brazos`
--     tiene los datos (10). Ninguna referencia real en código (los matches de "brazo"
--     son "antebrazo"/bíceps en textos UI y mapas de músculo, no la columna).
--   · app.users.alimentos_evitar (text[]): 0 non-null; canónica `alimentos_excluidos`
--     tiene los datos (9). 0 referencias en todo el repo.
--   · Sin vistas/reglas/índices dependientes de ninguna de las dos.
--
-- NO se tocan aquí los otros pares equivalentes porque, aunque su columna duplicada
-- esté vacía en datos, siguen VIVAS en código/UI y requieren un refactor coordinado
-- código+esquema con verificación en navegador (fuera del alcance de esta migración):
--   años_entrenando (leída como fallback en adaptation/validators/aiLogger + 3
--   componentes frontend), fecha_inicio_objetivo (users.js SELECT/UPDATE + GoalProgressCard),
--   enfoque (PreferencesCard/ProfileSection la editan), metodologia (1 fila), meta_grasa.
--
-- Idempotente (IF EXISTS). Columnas vacías → DROP instantáneo, sin pérdida de datos.

BEGIN;

ALTER TABLE app.users DROP COLUMN IF EXISTS brazo;
ALTER TABLE app.users DROP COLUMN IF EXISTS alimentos_evitar;

COMMIT;
