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

Los ocho formatos de metcon soportados aparecen en cada nivel. El runner usa perfiles con equipo completo, sin equipo, equipo limitado y dolor de hombro; no consulta BD ni red. Duración: 527.253 ms. Hash SHA-256 del informe efímero: `66246f862c058ce8496ffcd03c36472f4ca97e028ebfe1b4f718e16d30a19db6`.

Este gate valida invariantes algorítmicas, no eficacia deportiva ni los flujos persistentes de producto.

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
- dos eventos de cierre repetidos producen un resultado/outbox;
- evento fuera de orden converge al mismo snapshot o va a dead-letter explicita.

## Playwright

Recorridos: alta/login, onboarding, perfil, seleccionar/cambiar metodologia, evaluar, single-day, plan, calendario/Hoy, warm-up, player, pause/reload/resume, scaling, substitution, cap, complete, abandon, feedback, history, menu, recipe substitution, shopping list, hydration, offline/retry, unauthorized and empty/error states. Ejecutar en movil y desktop, timezone Europe/Madrid y cruce de medianoche.

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
- [ ] APIs, outbox y nutricion idempotentes.
- [ ] E2E movil/escritorio/offline verde.
- [ ] Regresion ajena verde sin modificar otras metodologias.
- [ ] Observabilidad y alertas probadas.
- [ ] Revision legal de nombre.
- [ ] Firmas entrenador/nutricionista.
- [ ] Riesgo residual y decision de rollout documentados.
