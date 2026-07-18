# Manifiesto de reconciliación del ledger — DB-001 (PR 2)

Fecha: 2026-07-17. Ejecutor: `node scripts/migrate.mjs reconcile` (allowlist cerrada en
`migrate.mjs` → `RECONCILE_ALLOWLIST`).

## Contexto

El ledger `app.schema_migrations` quedó desincronizado: 8 migraciones aplicadas en
producción sin registrar (pendientes en el runner) y 7 registradas con checksum distinto
al fichero (editadas tras aplicarse). **Todas son `20260717_*`, posteriores al corte del
baseline (2026-07-16, 79 migraciones baselined).** Se aplicaron a producción fuera del
runner.

## Regla de decisión

- **adopt** (8 pendientes ya aplicadas): `INSERT` en el ledger con `baseline=false`. No se
  marcan `baseline=true` porque son **posteriores al corte del baseline**.
- **rechecksum** (7 con checksum divergente): `UPDATE` del checksum al del fichero actual.
  Justificado por evidencia: **cada objeto declarado por el fichero actual existe y está
  validado en producción**, es decir no hay divergencia de _efecto_ (los ficheros son
  idempotentes y fueron editados solo en comentarios/guardas). No se crean migraciones
  correctivas para no ensuciar el historial con no-ops.
- `reconcile` **solo escribe en `app.schema_migrations`** (cero DDL de esquema) y **solo**
  toca las versiones de la allowlist.

## Evidencia verificada (consulta READ ONLY contra producción, 2026-07-17)

Script de verificación: `backend/scripts/_reconcile_evidence.mjs` (transacción
`SET TRANSACTION READ ONLY` + `ROLLBACK`).

### adopt (pendientes → INSERT baseline=false)

| Migración                                          | Evidencia en prod                                                                                         |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `20260717_data003_fk_exercise_id.sql`              | 5/5 FKs a `app.ejercicios(id)` existen y validadas                                                        |
| `20260717_data003_fk_exercise_id_empty_tables.sql` | 2/2 FKs (`adaptation_technique_flags`, `warmup_sets_tracking`) validadas                                  |
| `20260717_data003_fk_ambiguous_ids.sql`            | 6/6 FKs (feedback/menu_gen_logs/exercise_history/user_exercise_feedback) validadas                        |
| `20260717_data003_users_drop_dead_dupes.sql`       | columnas `brazo`, `alimentos_evitar` ya no existen                                                        |
| `20260717_data003_users_drop_live_pairs.sql`       | columnas `años_entrenando`, `fecha_inicio_objetivo`, `enfoque`, `metodologia`, `meta_grasa` ya no existen |
| `20260717_data003_users_reconcile_live_pairs.sql`  | (previa a los drops; columnas canónicas conservan datos)                                                  |
| `20260717_fix_allergen_tags_soja.sql`              | natto/miso: 0 sin tag `soja` (de 2 filas)                                                                 |
| `20260717_seed_rulesets_intermedio_avanzado.sql`   | rulesets `hipertrofia_v2_intermedio` y `_avanzado` presentes y `is_active`                                |

### rechecksum (checksum divergente → UPDATE al checksum actual)

| Migración                                             | Evidencia en prod                                                                  |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `20260717_data003_fk_user_id_not_valid.sql`           | 33/33 FKs `*_user_id` existen y validadas                                          |
| `20260717_data003_fk_plan_session_not_valid.sql`      | 18/18 FKs `*_methodology_plan_id`/`*_session_id` existen y validadas               |
| `20260717_data003_validate_fks.sql`                   | las 51 FK anteriores tienen `convalidated=true`                                    |
| `20260717_workout_schedule_unique_plan_user_date.sql` | índice único `uq_workout_schedule_plan_user_date` existe                           |
| `20260717_sec_bola_deload_fatigue_ownership.sql`      | `activate_deload` y `detect_automatic_fatigue_flags` filtran `user_id = p_user_id` |
| `20260717_sec006_revoke_public_execute_app.sql`       | 0 funciones `app` con `EXECUTE` para `PUBLIC`                                      |
| `20260717_documenta_ledger_schema_migrations.sql`     | COMMENT presente en `app.schema_migrations`                                        |

## Resultado esperado tras `reconcile`

`npm run migrate:status` → `0 pendientes`, `0 checksum divergente`. `migrate:check`
(usado en CI) sale con código 0.

## Política a partir de ahora

- Todo DDL nuevo pasa por `migrate.mjs` (`migrate:new` + `migrate:up`). Los runners
  `migrate:nutrition-*` quedan **deprecados** (avisan y no registran en el ledger).
- CI ejecuta `migrate:check` y falla si el ledger se vuelve a desincronizar.
