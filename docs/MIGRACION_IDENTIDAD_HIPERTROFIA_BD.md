# Migración futura: identidad persistida de Hipertrofia (NO APLICADA)

> Estado: **PLANIFICADA, NO EJECUTADA.** Este PR (`refactor/hipertrofia-identidad-canonica`)
> NO migra la base de datos ni retira aliases. Requiere autorización explícita de Pablo.
> Base: `origin/main` (3e09559).

## 1. Contexto

El nombre visible es **"Hipertrofia"**. El literal **persistido** histórico sigue vivo:

```
HIPERTROFIA_PERSISTED_TYPE = "HipertrofiaV2_MindFeed"
```

Centralizado en:

- `backend/services/hipertrofia/identity.js` (fuente única backend)
- `src/utils/hipertrofiaIdentity.js` (espejo frontend)

Todo el código nuevo **lee** valores nuevos y antiguos vía `isHipertrofiaMethodology()` y
**escribe** el literal vía la constante. Por eso la BD puede migrarse (o no) sin tocar el
código de lectura.

### Volumen afectado (confirmar en el momento de migrar)

- **99 planes** con `methodology_type = 'HipertrofiaV2_MindFeed'` (29 activos).
- Filas legacy `methodology_type = 'hipertrofia'` (motor retirado): ya respaldadas y
  eliminadas en PR #62 (no reaparecen aquí).

## 2. Inventario de objetos de BD a revisar (esquema `app`)

Antes de migrar, ejecutar un inventario real (no asumir esta lista como cerrada):

| Tipo      | Objeto                                     | Relación con la identidad                                                                                      |
| --------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Tabla     | `app.methodology_plans`                    | Columna `methodology_type` guarda el literal; `plan_data->>'metodologia'` también. **Núcleo de la migración.** |
| Tabla     | `app.hipertrofia_v2_session_config`        | Config del motor D1-D5. Nombre físico con `v2`; **no** se renombra en la migración de identidad (es otro eje). |
| Secuencia | `app.hipertrofia_v2_session_config_id_seq` | Asociada a la anterior.                                                                                        |
| Tabla     | `app.hipertrofia_v2_state`                 | Estado de ciclo del usuario. Nombre físico con `v2`.                                                           |
| Tabla     | `app.hipertrofia_v2_user_status`           | Estado/nivel del usuario. Nombre físico con `v2`.                                                              |

Consultas de inventario a lanzar (solo lectura) antes de escribir la migración:

```sql
-- Tablas, funciones, triggers, constraints, índices que mencionan el literal o v2
SELECT table_name FROM information_schema.tables
  WHERE table_schema='app' AND table_name ILIKE '%hipertrofia%';
SELECT routine_name FROM information_schema.routines
  WHERE routine_schema='app' AND routine_definition ILIKE '%HipertrofiaV2_MindFeed%';
SELECT tgname FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
  WHERE c.relname='methodology_plans';
-- Constraints / CHECK que fijen el valor
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
  WHERE conrelid='app.methodology_plans'::regclass;
-- RLS sobre methodology_plans
SELECT polname, pg_get_expr(polqual, polrelid) FROM pg_policy
  WHERE polrelid='app.methodology_plans'::regclass;
-- Índices
SELECT indexname, indexdef FROM pg_indexes
  WHERE schemaname='app' AND tablename='methodology_plans';
```

> **Decisión de alcance recomendada:** la migración de IDENTIDAD (valor `methodology_type`)
> es independiente de renombrar las TABLAS físicas `hipertrofia_v2_*`. Renombrar tablas es
> más arriesgado (FKs, secuencias, código) y NO es necesario para que el nombre visible sea
> "Hipertrofia". Recomendación: **migrar solo el valor** (o incluso no migrarlo) y dejar los
> nombres físicos como deuda documentada.

## 3. Estrategia (idempotente, con dual-read y rollback)

### Precondición

- El código ya hace **dual-read** (`isHipertrofiaMethodology` acepta ambos valores). Por
  tanto, aunque se migre el valor, el código sigue reconociéndolo. Igualmente, si NO se
  migra, todo funciona. La migración es **opcional** y solo cosmética a nivel de dato.

### Opción A — No migrar (recomendada a corto plazo)

- Mantener `HipertrofiaV2_MindFeed` como valor persistido.
- Coste cero, riesgo cero. El nombre visible ya es "Hipertrofia".

### Opción B — Migrar el valor a un literal canónico (p. ej. `Hipertrofia_MindFeed`)

Solo si Pablo lo aprueba. Pasos:

1. **Backup** de las filas afectadas a tabla `_bkp`:
   ```sql
   CREATE TABLE app._bkp_methodology_plans_hipertrofia_identidad AS
   SELECT * FROM app.methodology_plans WHERE methodology_type = 'HipertrofiaV2_MindFeed';
   ```
2. **Actualizar nuevos writes ANTES** de migrar datos: cambiar
   `HIPERTROFIA_PERSISTED_TYPE` al nuevo literal en `identity.js` (backend y frontend)
   y desplegar. Como el helper es dual-read, ambos valores se reconocen durante la
   transición.
3. **Migración idempotente** del dato:
   ```sql
   UPDATE app.methodology_plans
     SET methodology_type = 'Hipertrofia_MindFeed'
     WHERE methodology_type = 'HipertrofiaV2_MindFeed';
   UPDATE app.methodology_plans
     SET plan_data = jsonb_set(plan_data, '{metodologia}', '"Hipertrofia_MindFeed"')
     WHERE plan_data->>'metodologia' = 'HipertrofiaV2_MindFeed';
   ```
   (Idempotente: reejecutar no afecta filas ya migradas.)
4. **Validación**: recuentos antes/después.
   ```sql
   SELECT methodology_type, count(*), count(*) FILTER (WHERE status='active')
     FROM app.methodology_plans
     WHERE methodology_type ILIKE 'hipertrofia%mindfeed' GROUP BY 1;
   -- Debe cuadrar 99 planes (29 activos) redistribuidos al nuevo literal, 0 en el antiguo.
   ```
   Validar además: sesiones activas y finalizadas siguen abriendo el reproductor de
   Hipertrofia; adaptación y tracking RIR intactos (ver §4).
5. **Rollback**:
   ```sql
   UPDATE app.methodology_plans
     SET methodology_type = 'HipertrofiaV2_MindFeed'
     WHERE methodology_type = 'Hipertrofia_MindFeed';
   -- y jsonb_set inverso; o restaurar desde la tabla _bkp.
   ```
6. **Retirada de aliases**: SOLO cuando no queden clientes antiguos.
   - Endpoint `/api/hipertrofiav2/*`: retirar cuando no haya apps móviles/web viejas
     llamándolo (medir en logs).
   - Alias de lectura `hipertrofiav2` en `userProfileContract.js` y en el allowlist de
     `identity.js`: mantener mientras existan datos o clientes con el valor histórico.

## 4. Pruebas de compatibilidad (ya cubiertas en este PR)

- `backend/tests/hipertrofiaIdentity.test.js`: el literal persistido se reconoce como
  Hipertrofia (dual-read), y se rechaza gimnasio/mindfeed genérico/parciales.
- `backend/tests/hipertrofiaRedirect.test.js`: la preferencia explícita de Hipertrofia no
  cae a gimnasio; los objetivos→gimnasio siguen funcionando.
- Pendiente (staging, NO prod): E2E de plan histórico `HipertrofiaV2_MindFeed` con sesión
  activa/finalizada, adaptación y RIR (ver Playwright en `tests/`).

## 5. Estrategia de retirada de "V2" (resumen)

1. Endpoint canónico `/api/hipertrofia/*` ya disponible; legacy `/api/hipertrofiav2/*`
   como alias.
2. Migrar el frontend a la ruta canónica de forma incremental (fetch por fetch).
3. Medir uso del alias legacy en logs de acceso.
4. Cuando el alias legacy tenga 0 tráfico durante N semanas → retirar mount legacy.
5. La identidad persistida y su alias de lectura son lo último en retirarse (o nunca, si
   se opta por A).
