# Cierre técnico del PR y runbook preproducción

- Fecha de corte: 2026-07-24
- Baseline integrado: `origin/main@649360080325ea4f72182db54bafc8f12799ccba`
- Rama: `codex/crossfit-profesional-v2`
- PR: `Sergiom84/MindFit-IA#63`
- Head técnico validado: `d358d2f9da2ad6138c0b09ae0a266360ecaeb167`

## Dictamen técnico

La implementación CrossFit v2 está completa para revisión técnica a nivel de
código, contratos, migraciones preparadas y QA aislada. Principiante,
intermedio y avanzado no competitivo tienen clasificación, bloques, cuotas,
composer, seguridad, resultado y autorregulación diferenciados. Elite continúa
solo como dato histórico y queda fuera de la experiencia principal.

La frase anterior describe el alcance técnico, no el estado de merge. PR #63
permanece en draft y no es fusionable porque GitGuardian detecta una credencial
PostgreSQL en un commit histórico. El valor se retiró del head, pero no se
considera remediado hasta rotarlo y cerrar el incidente con un check verde.

Este dictamen no autoriza rollout. Las seis migraciones CrossFit no se han
aplicado en Supabase, el catálogo no se ha importado en producción y los cuatro
flags permanecen apagados. La denominación pública, la revisión deportiva,
nutricional y clínica, el shadow y el rollback operativo siguen siendo gates
preproducción.

## Evidencia reproducible

### CI del PR

Run `30050111128`, sobre el head
`d358d2f9da2ad6138c0b09ae0a266360ecaeb167` con `main@6493600`:

| Job                   | Resultado | Evidencia principal                                                     |
| --------------------- | --------- | ----------------------------------------------------------------------- |
| `build-test`          | verde     | lint 0 errores; build/perf; 480 tests, 479 pass, 0 fail, 0 skip, 1 todo |
| `db-baseline-restore` | verde     | restore limpio y ledger sin pending/drift                               |
| `integration-tests`   | verde     | 26/26; PostgreSQL 17, RLS, aislamiento, append-only e idempotencia      |
| `crossfit-v2-e2e`     | verde     | 16/16 en 30,9 s; desktop y móvil 375x812                                |
| `dependency-audit`    | verde     | producción raíz/backend: 0 vulnerabilidades; SBOM generado              |
| `a11y-audit`          | verde     | 2/2 a11y y 1/1 regresión móvil                                          |

El único `todo` es el defecto S2 de Calistenia ya presente en `origin/main`;
la comparación exacta del baseline no lo atribuye a CrossFit.

El lint completo informa 0 errores y 281 warnings heredados; `lint --quiet` es
verde. El árbol completo de desarrollo conserva 9 vulnerabilidades en raíz y 2
moderadas en backend, todas fuera de `npm audit --omit=dev`. Se registran como
deuda de toolchain y no se ocultan. La rama no añade dependencias.

### PostgreSQL, migraciones y catálogo aislados

En PostgreSQL 17 desechable se restauró el baseline, se aplicó dos veces cada
migración y se ejecutó la integración:

1. `20260722_crossfit_v2_catalog.sql`
2. `20260722_crossfit_v2_assessments.sql`
3. `20260722_crossfit_v2_results_autoreg.sql`
4. `20260722_crossfit_v2_runtime_events.sql`
5. `20260722_crossfit_v2_plan_revisions.sql`
6. `20260722_crossfit_v2_nutrition_day_types.sql`

El importador autorizado solo para entorno efímero cargó el catálogo draft,
se activó allí y un segundo import conservó hash y conteos. Se validaron 92
movimientos canónicos, 104 variantes heredadas, 236 aristas y 120/120 mappings.
Insert/update/delete sobre catálogo activo, resultados y runtime append-only
fueron rechazados. Usuario A no pudo leer ni mutar filas de usuario B.

No se ejecutó `down` destructivo porque el diseño de rollback productivo es
apagar flags y retirar el puntero activo, conservando ledgers. La idempotencia
de `up` quedó demostrada.

### Generador y niveles

El gate `crossfit-statistical-gate/2.0.0` ejecutó 30.000 planes y 30.000
regeneraciones:

- 10.000 por nivel y 5.000 por cada frecuencia soportada;
- cero planes inválidos o no reproducibles;
- cero hard invariant violations;
- cero ejercicio sin equipo o contraindicado;
- ocho formatos en cada nivel.

Playwright completa generación, confirmación, calendario, inicio, runtime,
sustitución segura o rechazo fail-closed, cierre, resultado, autorregulación e
historial en los tres niveles. También prueba single-day, red flag, cierre
parcial, evaluación 8D, player, offline/retry, nutrición D0/D1/D2 y métricas en
desktop y móvil. El navegador y la resolución canónica usan `Europe/Madrid`; la
suite cubre el cruce de medianoche y el unitario cubre transición DST.

Los 32 perfiles documentales no son solo fixtures contados: `32/32` ejecutan
clasificación, programación, seguridad y nutrición con su oráculo principal. La
distribución es 10 principiante, 13 intermedio y 9 avanzado.

### Nutrición y training load

El E2E habilita emisión de carga y outbox solo en la BD efímera. Nutrición
permanece en `shadow`, no autoritativa:

- planned y actual `training-load/v1` conservan `plan_id + day_id`;
- D0, D1 y D2 aparecen en la semana nutricional;
- carga válida = 100 %, degradada = 0 en la muestra;
- contratos nutricionales inválidos = 0;
- decisiones outbox duplicadas = 0;
- ningún menú productivo se modifica.

## Seguridad y secretos

- `npm audit --omit=dev --audit-level=high`: 0 vulnerabilidades en raíz y backend.
- SBOM CycloneDX raíz/backend generado por CI.
- GitGuardian está instalado y ejecutó un check autenticado del PR. Resultado:
  rojo, una credencial PostgreSQL en `backend/.env.example` introducida en el
  commit de integración `5b2c6393ca4c1cd9c9e0a18b7565e5607451a696`.
- La línea procedía del baseline y seguía presente en
  `origin/main@649360080325ea4f72182db54bafc8f12799ccba`. No se muestran usuario,
  contraseña, host ni valor. Debe asumirse expuesta hasta que el owner confirme
  su rotación.
- `65f41d7` deja `backend/.env.example` sin credenciales y con flags CrossFit
  apagados. Esto corrige el árbol actual, pero no elimina el secreto del historial
  ni vuelve verde el check.
- GitHub Secret Scanning mantiene además alertas históricas anteriores a esta
  rama. No se reproducen ubicaciones ni valores; corresponde al owner revisar,
  rotar y resolver el inventario completo.
- Estado del gate: `BLOQUEADO_ROTACION_Y_REMEDIACION`. No se reescribe historia,
  no se fuerza push, no se omite el check y no se fusiona el PR bajo las reglas
  vigentes.

## Cambios compartidos y no regresión

- `WorkoutContext.generatePlan()` no cambia.
- Los motores deportivos de Hipertrofia y Calistenia no cambian.
- PR #66 de Calistenia no está incluido.
- Las extensiones compartidas usan adaptadores/registro y contratos canónicos.
- El merge de `main` fue normal, no rebase; no hubo force-push.
- Con flags apagados, el comportamiento legacy permanece.

## Gates antes de merge

1. Rotación de la credencial detectada y remediación formal del incidente
   histórico, sin exponer el valor.
2. GitGuardian vuelve a ejecutarse y termina verde.
3. CI final del head documental completamente verde.
4. `git diff --check`, lint, build, unit, integración, E2E y a11y verdes.
5. PR sin conversaciones ni findings críticos/altos abiertos.
6. `origin/main` sigue en el SHA auditado o se integra de nuevo mediante merge
   normal y se repite QA.
7. PR pasa de draft a ready y se fusiona por protección, sin bypass.

Las validaciones deportiva, nutricional, clínica y legal son gates de
activación, no se fabrican como firmas para el merge técnico.

## Runbook de merge

1. Rotar/remediar la credencial y obtener GitGuardian verde; si exige cambiar la
   historia, Pablo debe autorizar explícitamente el procedimiento coordinado.
2. `git fetch origin --prune`.
3. Confirmar que `origin/main` no avanzó y que PR #66 sigue sin fusionar.
4. Verificar checks y conversaciones de PR #63.
5. Marcar ready; no habilitar ningún flag.
6. Fusionar por el flujo protegido permitido por GitHub, nunca push directo.
7. Verificar que `origin/main` contiene el merge y esperar CI post-merge,
   incluido Android si se dispara.
8. Si un check post-merge falla, mantener flags apagados y abrir fix-forward;
   no ejecutar migraciones.

## Runbook Render después del merge

Render puede autodesplegar `main`; este agente no lo activa ni lo valida
contra producción.

1. Sergio confirma que el deploy corresponde exactamente al SHA de merge.
2. Confirma en variables que los cuatro flags son `false`:
   `CROSSFIT_V2_GENERATION`, `CROSSFIT_V2_RESULTS`,
   `CROSSFIT_EMITS_TRAINING_LOAD`, `CROSSFIT_NUTRITION_LOAD`.
3. Revisa arranque, healthcheck, errores 5xx, reinicios y latencia.
4. Ejecuta smoke de login, metodología existente, Hoy y nutrición legacy.
5. Comprueba que endpoints V2 no quedan accesibles por activación accidental.
6. Ante regresión, rollback del servicio al SHA anterior; no tocar datos.

## Runbook de migración futura

Requiere autorización individual y backup/verificación previa.

1. Confirmar checksum y ledger de migraciones; no reescribir
   `20260721_backfill_mes_day_id.sql`.
2. Ensayar sobre clon QA de producción y repetir las seis migraciones dos veces.
3. Aplicar las seis migraciones en el orden listado, con `ON_ERROR_STOP`.
4. Validar tablas, constraints, RLS/policies, grants e índices.
5. Ejecutar importador en `dry-run`; revisar 92/104/236/120 y hashes.
6. Aplicar catálogo con el mecanismo autorizado y revisar antes de activar su
   versión. Nunca inventar media ni marcarla verificada.
7. Mantener Elite histórico y las 29 filas/1.414 sesiones sin `day_id`.
8. Si falla una migración, detener; no activar flags. Como rollback, conservar
   datos/ledgers, retirar versión activa si procede y corregir con migración
   aditiva.

## Secuencia de activación futura

Cada paso exige métricas y autorización separada:

1. `CROSSFIT_V2_GENERATION=true` para cohorte QA interna.
2. `CROSSFIT_V2_RESULTS=true` tras confirmar cierre/resultados.
3. Training load en shadow con emisión externa todavía apagada.
4. Exigir carga válida >=99 %, degradada <1 % justificada, cero duplicados y
   cero drift no explicado.
5. `CROSSFIT_EMITS_TRAINING_LOAD=true`.
6. Nutrición CrossFit en shadow; comprobar energía, macros, horarios, menús,
   recetas, sustituciones y lista de compra.
7. `CROSSFIT_NUTRITION_LOAD=true` solo tras aprobación deportiva/nutricional.
8. Ampliar cohorte gradualmente con alertas y rollback ensayado.

Rollback inmediato: apagar en orden inverso nutrición, emisión de carga,
resultados y generación. Los eventos se conservan para auditoría.

## Gates humanos y legales preproducción

- Entrenador cualificado: niveles, bloques, 120 mappings, sustituciones y muestra
  mínima del expediente.
- Nutricionista deportivo: energía, macros, D0/D1/D2, timing, RED-S y límites.
- Profesional competente: embarazo/posparto y cardiovascular sintomático si se
  incorporan; hasta entonces permanecen bloqueados.
- Asesoría legal: nombre público y uso de la marca CrossFit.
- Producción: autorización expresa separada para migraciones, catálogo y flags.

## Riesgo residual

Técnicamente cerrado no significa eficacia clínica o deportiva demostrada. El
modelo necesita telemetría real, revisión humana y calibración conservadora.
Multi-device simultáneo, notificaciones/logros y programación competitiva Elite
quedan fuera de esta entrega. Los avisos de dependencias de desarrollo y las
alertas históricas de secretos requieren un carril de mantenimiento independiente.
La credencial detectada por GitGuardian no es deuda informativa: bloquea el merge
hasta rotación y remediación verificadas.
