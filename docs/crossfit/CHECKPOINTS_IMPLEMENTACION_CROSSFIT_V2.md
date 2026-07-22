# Checkpoints de implementación CrossFit profesional v2

Especificación: `crossfit-product-spec/2.0.0`
Rama: `codex/crossfit-profesional-v2`
Base: `origin/main@e7f57116363d9283a27c1d5d375da674414ddf1f`
Estado global: `EN_PROGRESO`

## Guardas permanentes

- Worktree aislado; no modificar el checkout documental previo.
- No tocar `WorkoutContext.generatePlan()`, la redirección ni el frontend agnóstico.
- No cambiar programación de Hipertrofia, Hipertrofia V2 o Calistenia.
- No escribir en Supabase/Render ni aplicar migraciones/flags sin autorización.
- No hacer push ni abrir PR sin confirmación expresa de Pablo.
- Dolor, red flags y técnica insegura tienen precedencia sobre rendimiento.
- Elite se conserva como legacy y queda fuera del producto principal.

## Estado de fases

| Fase                          | Estado                      | Evidencia / gate                                           |
| ----------------------------- | --------------------------- | ---------------------------------------------------------- |
| A. Baseline y DoR             | `COMPLETADA_CON_LIMITACION` | 231/231 unit, lint, build; integración requiere BD efímera |
| B. Contratos/versionado/flags | `COMPLETADA`                | 8/8 específicos; suite 239/239; lint; flags off            |
| C. Catálogo/seguridad         | `COMPLETADA_CON_GATE_BD`    | 13/13; 92+104+236; 120/120; SQL/RLS requiere BD efímera    |
| D. Clasificación              | `COMPLETADA_TECNICA`        | level-model/2.0.0; 11/11 decisiones y límites              |
| E. Programación por nivel     | `COMPLETADA_TECNICA`        | bloques 8/10/12; seis frecuencias; 12/12 tests             |
| F. Composer/validadores       | `COMPLETADA_TECNICA`        | 30.000 planes + 30.000 regeneraciones; cero hard violation |
| G. Flujos de producto         | `PENDIENTE`                 | contratos, persistencia y E2E por flujo                    |
| H. Resultados/autorregulación | `PENDIENTE`                 | siete estados, eventos idempotentes                        |
| I. Training load/nutrición    | `PENDIENTE_FLAG_OFF`        | shadow primero; activación requiere aprobación             |
| J. QA integral                | `PENDIENTE`                 | unit/contract/integration/E2E/regresión                    |
| K. Validaciones externas      | `GATE_PREPRODUCCION`        | entrenador, nutricionista, clínico si aplica y legal       |

## Baseline reproducible

| Comprobación              | Resultado 2026-07-22                                               |
| ------------------------- | ------------------------------------------------------------------ |
| `origin/main`             | `e7f5711`; sin commits posteriores al iniciar                      |
| CI `main`                 | CI y Android verdes en el SHA de referencia                        |
| `npm ci` raíz/backend     | correcto desde lockfiles                                           |
| `npm run test:backend`    | 231/231                                                            |
| `npm run lint -- --quiet` | correcto                                                           |
| `npm run build`           | correcto; warnings preexistentes de chunks/browser data            |
| Integración backend       | no ejecutada: no hay PostgreSQL/Docker local ni URL QA             |
| Migración 20260721        | registrada en Supabase, checksum coincide; no reescribir           |
| Deuda histórica           | 29 calendarios sin `day_id`; sesiones se auditan por relación real |
| Dossier baseline          | 120/120, 92, 44, 45, 32; PDF 43 páginas válido                     |
| Corrección reason codes   | 64: 45 baseline + 18 huérfanos + monitor de molestia 1-2           |

## Semáforos de rollout

- `FASE_0_COMPARTIDA_DESBLOQUEADA_PARA_DESARROLLO`.
- `CROSSFIT_V2_GENERATION=false` hasta el gate funcional de generación.
- `CROSSFIT_V2_RESULTS=false` hasta persistencia e idempotencia verdes.
- `CROSSFIT_EMITS_TRAINING_LOAD=false` hasta contracts, outbox y métricas verdes.
- `CROSSFIT_NUTRITION_LOAD=false` hasta shadow, métricas y aprobación.
- Migraciones nuevas: solo archivo + test aislado; no aplicar en producción.

## Gate estadístico F

- Runner: `backend/scripts/qa-crossfit-generator-statistical.mjs`.
- Ejecución: `--per-level=10000 --workers=8` sobre catálogo canónico normalizado.
- Resultado: `passed` en 527.253 ms; 10.000/10.000 por nivel y 5.000 por frecuencia soportada.
- Reproducibilidad: 30.000 regeneraciones, `non_reproducible=0`.
- Seguridad: `hard_violations=0`, `unavailable_equipment=0`, `contraindicated=0`, `invalid=0`.
- Cobertura: AMRAP, EMOM, E2MOM, E3MOM, For Time, RFT, Chipper e Intervals presentes en los tres niveles.
- SHA-256 del informe efímero verificado: `66246f862c058ce8496ffcd03c36472f4ca97e028ebfe1b4f718e16d30a19db6`.
- El JSON bruto permanece fuera del entregable; este resumen y el runner reproducible son la evidencia versionada.

## Criterio de cierre técnico

Cada fase exige diff de alcance, tests de subfase, registro diario y trazabilidad
actualizada. Una limitación de infraestructura se marca como gate, nunca como test
verde. La eficacia deportiva, clínica, nutricional y legal solo se considera
validada con revisión humana documentada.
