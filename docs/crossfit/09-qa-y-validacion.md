# QA, oraculos y validacion humana

No se presenta la suite legacy como validacion de v2. La implementación dispone ya de contratos, clasificación, programación, catálogo, seguridad y composer puros; integración BD/E2E y validación humana siguen abiertas.

## Resultado ejecutado del gate estadístico

El 2026-07-22 se ejecutó `backend/scripts/qa-crossfit-generator-statistical.mjs --per-level=10000 --workers=8`:

| Métrica                     | Principiante  | Intermedio    | Avanzado      | Gate      |
| --------------------------- | ------------- | ------------- | ------------- | --------- |
| Planes completos            | 10.000        | 10.000        | 10.000        | cumplido  |
| Regeneraciones misma seed   | 10.000        | 10.000        | 10.000        | idénticas |
| Planes inválidos            | 0             | 0             | 0             | cumplido  |
| Hard invariant violations   | 0             | 0             | 0             | cumplido  |
| Equipo ausente seleccionado | 0             | 0             | 0             | cumplido  |
| Movimiento contraindicado   | 0             | 0             | 0             | cumplido  |
| Frecuencias por nivel       | 5.000 + 5.000 | 5.000 + 5.000 | 5.000 + 5.000 | cumplido  |

Los ocho formatos de metcon soportados aparecen en cada nivel. El runner usa perfiles con equipo completo, sin equipo, equipo limitado y dolor de hombro; no consulta BD ni red. La repetición posterior a sincronizar `origin/main@3e09559` pasó en 552.501 ms. Hash SHA-256 canónico de ese resumen: `c91364fef30e23e83ac6cc7cc84acea475fe4a61536a1251045bbfdd86b16b6e`.

Este gate valida invariantes algorítmicas, no eficacia deportiva ni los flujos persistentes de producto.

## Resultado ejecutado de resultados/autorregulación

El 2026-07-22 quedaron verdes 18 pruebas focalizadas de resultado y máquina de
estados, integradas en una suite backend de 307/307:

- contrato estricto y carga real con RPE, sin RIR;
- prioridad red flag/dolor/técnica e histéresis de bloqueo;
- deload con dos señales independientes y progreso con tres exposiciones;
- separación capacidad/skill, retorno, readiness y cambio de equipo;
- convergencia con eventos fuera de orden e idempotencia por sesión;
- ownership plan/sesión, `day_id`, flag off y espera de feedback;
- ledger/snapshot append-only y migración/RLS validados estáticamente;
- outbox bajo tres gates y fallo aislado por savepoint.

No se contabilizan como verdes `up`, reejecución de migración ni RLS cross-user:
este worktree no dispone de PostgreSQL/Docker efímero y producción no se usa.

## Resultado ejecutado de integración de flujos

El corte técnico de Fase G ejecuta 51/51 pruebas focalizadas y la regresión
backend completa queda en 327/327. Los oráculos cubren:

- clasificación conservadora y seguridad antes de cualquier escritura;
- idempotencia de draft y presentación sin perder el plan canónico;
- calendario completo de 8 semanas y validación previa a reemplazo;
- hidratación exacta por `plan_id + day_id`, con fallback solo para deuda legacy;
- single-day determinista con sesión, carga y metadata canónicas;
- cierre plan/single-day sobre sus tablas de progreso correctas;
- prioridad de snapshot bloqueado, ausencia de offsets RIR y outbox gobernado;
- flags apagados sin cambio de comportamiento y gate COR-F0-04 conservado.

`npm run lint -- --quiet` y `npm run build` están verdes. El build mantiene los
avisos preexistentes de chunks circulares y browser data desactualizada. Esto no
equivale a E2E: no se han levantado servidores, creado usuarios ni usado una BD.

## Resultado ejecutado de training load y nutrición

La Fase I ejecuta 49/49 pruebas focalizadas y la regresión actual posterior a
sincronizar `origin/main@3e09559` y añadir evaluación v2 deja 355/355 backend. Quedan cubiertos:

- rollout `legacy -> shadow -> active` con ambos flags y default `false`;
- matriz estricta de 36 combinaciones: tres niveles, cuatro objetivos y D0/D1/D2;
- energía isocalórica dentro de 1 %, proteína canónica fija, suelo de grasa y
  macro constraint trazable;
- descanso real, fallback D1 conservador e identidad obligatoria `plan_id + day_id`;
- outbox idempotente con carga real y modo nutricional limitado a shadow;
- señales canónicas de RED-S/baja energía, embarazo/posparto,
  renal/cardiovascular y medicación, sin documentos ni diagnóstico;
- métricas admin de >=99 % carga válida, <1 % degradada, duplicados y drift.

No se marca verde la activación: faltan PostgreSQL efímero, shadow con muestra,
menú idempotente persistido, E2E y revisión de nutricionista deportivo.

## QA integral preparada, pendiente de ejecución efímera

La rama incorpora una ruta reproducible de CI que no acepta infraestructura
remota: `localQaGuard` exige acuse explícito y valida como locales API, frontend y
PostgreSQL. La suite histórica de regresión también usa esta guarda; se eliminó la
posibilidad documentada de apuntarla a producción.

- `integration-tests` restaura el baseline en PostgreSQL 17, aplica dos veces las
  tres migraciones CrossFit y ejecuta el grupo de integración registrado.
- `crossfit-v2-e2e` importa el catálogo en draft, lo activa solo en la BD efímera,
  verifica el re-run activo por hash/conteos y levanta API/preview locales dentro
  del job.
- `crossfitDatabaseIntegration.test.js` comprueba tablas, RLS, políticas,
  visibilidad de versión activa, inmutabilidad, aislamiento cross-user y
  append-only con rollback, incluido el ledger de evaluaciones.
- La matriz API de nivel avanzado registra primero evidencia profesional por la
  ruta admin fail-closed. Se prohíbe usar en QA un payload cliente con
  `technique_verified=true`; principiante/intermedio ejercitan self-report.
- Playwright descubre diez casos: tres ciclos API por nivel, tarjeta de
  evaluacion 8D con Axe y recorrido WOD, repetidos en escritorio y movil 375x812.
- La regresión local ejecutada queda en 355/355, lint quiet, build y budget de
  bundle verdes.

No se atribuyen resultados de DB/RLS/E2E todavía: este equipo no dispone de
PostgreSQL/Docker y no había servidores levantados ni autorización para iniciarlos.
El job será evidencia solo cuando CI lo ejecute y publique su resultado.

## Perfiles

[`data/qa_synthetic_profiles.csv`](./data/qa_synthetic_profiles.csv) contiene 32 perfiles: niveles, capacidades asimetricas, 2-5 dias, equipos, objetivos, dolor, red flags, pausas, fatiga, embarazo/posparto, hipertension, alergias, dieta, horario y nutricion.

## Capas y oraculos

| Capa                 | Pruebas                                                                 | Gate                                                          |
| -------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------- |
| Unitarias            | clasificacion, cuotas, caps, scaling, score, reducer, nutrition mapping | 100 % ramas de seguridad/reason codes; cero fail              |
| Contrato             | JSON schemas v2, training-load, APIs, legacy adapter                    | 100 % valid/invalid fixtures esperados                        |
| Integracion          | generar-persistir-hoy-cerrar-outbox-autoreg-nutricion                   | event id unico; plan/day links 100 %                          |
| Migracion            | dry-run, re-run, rollback, 120 mappings, nuevas filas                   | idempotencia; cero perdida/dangling/duplicado                 |
| RLS                  | anon/auth user A/user B/service                                         | cero lectura/escritura cruzada; catalog read policy explicita |
| Property/statistical | seeds/perfiles/frecuencias/bloques                                      | cero hard invariant en >=10.000 planes por nivel              |
| E2E                  | movil 375x812 y desktop; todos los flujos                               | success/error/offline/retry; cero duplicado de cierre         |
| Accesibilidad        | teclado, focus, labels, timer, contraste, reduced motion                | WCAG 2.2 AA en recorrido critico                              |
| Regresion            | Hipertrofia, HPV2, Calistenia                                           | contratos y recorridos actuales sin cambio                    |
| Rendimiento          | generacion, cierre, outbox                                              | p95 <= baseline aprobado +20 %; sin N+1 nuevo                 |
| Observabilidad       | metricas/alertas/dead-letter                                            | evento sintetico visible sin PII                              |

## Property-based y estadistico

Matriz minima: 32 perfiles x 3 revisiones x 20 fechas/seeds x frecuencias validas, ampliada hasta >=10.000 planes por nivel. Oraculos:

- cero `ERROR` de `generator_invariants.csv`;
- mismo snapshot/seed/revision produce hash identico 100 %;
- revision nueva conserva completadas 100 % y registra supersedes;
- equipo requerido es subconjunto disponible 100 %;
- movimiento skill > permiso = 0;
- contraindicacion activa = 0;
- todas las semanas cumplen secuencia D2, impacto, bisagra, grip, overhead y benchmark;
- cada fallback tiene stage/reason y nunca relaja hard filters;
- distribucion de dominios entra en cuotas del ruleset, no en una uniformidad artificial;
- ningun canonico supera su limite de repeticion; excepciones tienen progression id.

No se fija un porcentaje estetico de movimientos (p. ej. 3 %) sin considerar equipo, nivel y bloque. Se compara con la distribucion esperada por cuotas y se usa chi-cuadrado/intervalos solo como detector, no como oraculo unico.

## Casos de seguridad obligatorios

- red flag bloquea antes de consultar catalogo;
- dolor > seguridad gana a un resultado excelente;
- tecnica 0 detiene movimiento aunque RPE sea bajo;
- embarazo/posparto sin contrato no produce WOD;
- lesion textual legacy no desbloquea nada;
- pausa aplica reduccion exacta;
- dos eventos de cierre repetidos producen un resultado/outbox; cubierto a nivel unit/contrato;
- evento fuera de orden converge al mismo snapshot o va a dead-letter explicita.

## Playwright

El arnés actual cubre el ciclo API de generación, confirmación, calendario,
inicio, progreso, cierre, resultado v2 idempotente e historial para los tres
niveles; el recorrido UI cubre login, Rutinas, warm-up, player, escala, timer y
controles críticos en escritorio/móvil. El resto de recorridos exigidos (onboarding,
evaluación objetiva, sustitución persistida, offline/retry, nutrición y cruce de
medianoche Europe/Madrid) continúa abierto y no se infiere de la existencia de una
ruta.

No se crean usuarios ni datos reales ahora. La ejecucion futura usa fixtures transaccionales/entorno aislado con rollback. Los servidores no se reinician sin permiso.

## Gates por momento

### Ejecutable ahora sin riesgo

- lint/parse de Markdown, CSV y JSON;
- comprobacion de 120 IDs auditados y referencias documentales;
- lectura de schema/origin/main;
- tests legacy no destructivos si aportan contexto, sin atribuirlos a v2.
- unit/contract de CrossFit y runner estadístico puro, sin BD.

### Desbloqueado para implementación, flag off

- contract test planned/actual load CrossFit;
- `day_id` end-to-end;
- cierre/outbox/nutrition worker;
- metricas valid/degraded y shadow/active;
- E2E compartido training-nutrition.

### Posterior a implementacion

- unit/contract/integration/migration/RLS/property/E2E/a11y/performance;
- shadow >=7 dias o muestra suficiente definida por trafico;
- rollout controlado y rollback probado.

## Validacion humana obligatoria

Antes de migracion: entrenador cualificado revisa umbrales, progresiones, 120 mappings y safety matrix; nutricionista deportivo revisa energia/macros/timing/RED-S. Antes de merge: 30 planes (10/nivel), >=90 sesiones, 15 sustituciones y todos los perfiles de alto riesgo. Gate: cero finding critico/alto sin resolver y >=95 % acuerdo sobre stimulus/clasificacion; desacuerdo restante documentado. Embarazo/posparto requiere profesional competente especifico.

## Checklist de salida

- [x] Fase 0 compartida desbloqueada para desarrollo y branch aislada creada.
- [ ] Catalogo versionado, validado, RLS y rollback.
- [x] > =30.000 planes total, cero hard invariant y 30.000 regeneraciones idénticas.
- [x] APIs de generación/resultado y outbox CrossFit idempotentes a nivel unit/contrato.
- [ ] Nutrición CrossFit idempotente en shadow/BD aislada.
- [ ] E2E movil/escritorio/offline verde.
- [ ] Regresion ajena verde sin modificar otras metodologias.
- [x] Observabilidad y alertas probadas a nivel unitario; pendiente muestra QA/operativa.
- [ ] Revision legal de nombre.
- [ ] Firmas entrenador/nutricionista.
- [ ] Riesgo residual y decision de rollout documentados.
