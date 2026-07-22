# Contrato implementable del generador

Version: `crossfit-plan/v2`; ruleset inicial: `crossfit-rules/2.0.0`. El contrato es aditivo: sesiones historicas se leen con adaptador legacy y nunca se reescriben silenciosamente.

## Esquema logico

```json
{
  "schema_version": "crossfit-plan/v2",
  "ruleset_version": "crossfit-rules/2.0.0",
  "plan_id": "uuid",
  "user_id": "internal-id",
  "level": "beginner|intermediate|advanced",
  "classification_id": "uuid",
  "generation": {
    "seed_hash": "sha256",
    "revision": 0,
    "idempotency_key": "sha256",
    "generated_at": "timestamp",
    "supersedes": null
  },
  "block": {
    "block_id": "uuid",
    "week_count": 8,
    "phase_by_week": ["baseline", "build", "deload"],
    "quotas": {}
  },
  "weeks": [
    {
      "week_number": 1,
      "target_load": {},
      "sessions": [
        {
          "day_id": "stable-id",
          "date": "YYYY-MM-DD",
          "session_type": "mixed|strength|skill|mono|recovery|test",
          "training_load": { "contract_version": "training-load/v1" },
          "warmup": [],
          "blocks": [],
          "wod": {},
          "cooldown": [],
          "decision_trace": [{ "rule_id": "CF-WEEK-001", "reason_code": "..." }]
        }
      ]
    }
  ]
}
```

`wod` contiene `format`, `time_domain`, `target_minutes`, `time_cap_seconds`, `stimulus`, `score_type`, `movements[]`, `scales[]` y `stop_rules[]`. Cada movimiento referencia `canonical_movement_id`, `catalog_version`, dosis, skill tier, equipment y sustituciones precomputadas. `result` es otra entidad: completion, elapsed/cap, rounds/reps/calories/load, scale por movimiento, RPE, tecnica, dolor, drift y actual training load.

## Determinismo e idempotencia

```text
seed_hash = sha256(user_id | plan_start | ruleset_version | revision | purpose)
idempotency_key = sha256(user_id | plan_id | day_id | ruleset_version | revision)
```

No se registra PII en la traza. Misma entrada canonica + misma revision + mismo snapshot de catalogo produce el mismo JSON byte-normalizado. Regenerar incrementa `revision`, conserva el anterior y exige reason code; no muta sesiones completadas. Si el dia esta iniciado, solo permite sustitucion local.

## Pipeline de seleccion

```text
profile = canonicalize(profile, equipment, classification, recent_history)
if safety_gate(profile) == BLOCKED: return safe_block(reason_codes)
quota = derive_block_week_session_quotas(level, availability, phase)
candidates = active_catalog_at(catalog_version)
candidates = hard_filter(candidates, safety_and_contraindications)
candidates = hard_filter(candidates, skill_permissions)
candidates = hard_filter(candidates, equipment_and_time)
candidates = hard_filter(candidates, recovery_and_exposure_windows)
candidates = hard_filter(candidates, format_prerequisites)
candidates = hard_filter(candidates, block_week_session_quotas)
ranked = score_integer(candidates, target, history, seed_hash)
selection = deterministic_backtrack(ranked, all_invariants)
if no_solution: selection = fallback_ladder()
validate(exercise, wod, session, week, block, user)
persist_with_trace(selection, idempotency_key)
```

Filtros duros nunca se relajan. El backtracking tiene maximo 500 nodos por sesion; al alcanzarlo salta a fallback y registra `GEN_SEARCH_BUDGET_EXCEEDED`.

## Scoring entero

| Factor                                                      | Puntos                      |
| ----------------------------------------------------------- | --------------------------- |
| dominio infrarrepresentado en 14 dias                       | +30                         |
| patron objetivo del bloque                                  | +20                         |
| continuidad de progresion valida                            | +15                         |
| objetivo del usuario                                        | +10                         |
| preferencia compatible                                      | +8                          |
| mismo canonico en <=72 h                                    | -40 y hard fail si ambos D2 |
| colision de carga/impacto/grip/overhead                     | -30 o hard fail             |
| misma variante en 7 dias                                    | -20                         |
| recurso no verificado y usuario necesita instruccion visual | -15                         |
| exposicion en 14 dias sin progresion                        | -10                         |

Empate: ordenar por `sha256(seed_hash | candidate_id)` ascendente. La IA no altera score, filtro o empate.

## Fallback seguro

1. Variante/regresion del mismo stimulus y dominio.
2. Movimiento distinto del mismo patron y demanda.
3. Monoestructural de baja complejidad con dosis equivalente.
4. Sesion `recovery` D0/D1.
5. Bloqueo explicito si seguridad/equipamiento/tiempo no permiten sesion valida.

Nunca se relajan contraindicacion, red flag, skill tier, equipo o time cap. Un fallback devuelve `fallback_stage`, `reason_code` y diferencia de stimulus.

## Validacion por capas

- Exercise: activo, version, media/instrucciones, skill, equipo, dosis y contraindicacion.
- WOD: formato, cap, complejidad, carga, pairs y stimulus.
- Session: orden, warm-up especifico, interferencia fuerza-WOD, carga y stop rules.
- Week: cuotas, ventanas, secuencias D0/D1/D2 y recuperacion.
- Block: progresion, deload, benchmarks, exposicion equilibrada.
- User: clasificacion/confianza, dolor, pausa, adherencia y disponibilidad.

La matriz ejecutable de especificacion es [`data/generator_invariants.csv`](./data/generator_invariants.csv). Severidades: `ERROR` bloquea; `WARN` exige traza; `INFO` mide. Reason codes estan en [`data/reason_codes.csv`](./data/reason_codes.csv).

## Compatibilidad historica

- Lector `v1 -> v2`: marca `provenance.source=legacy_adapter`, confianza baja, no inventa resultados.
- Nuevos planes escriben solo v2; el endpoint expone `schema_version`.
- Rulesets son inmutables. Una correccion crea version nueva y `effective_from`.
- Sesiones completadas conservan catalog/ruleset/version aunque el movimiento cambie de nombre.

## IA permitida

Puede redactar explicaciones, resumir feedback y sugerir candidatos dentro de una lista validada. No puede asignar nivel, desbloquear skill, superar dosis, diagnosticar, omitir stop rules, inventar media ni modificar training load. Toda salida IA es schema-validated y revalidada; si falla, se usa texto determinista.

## Integración con Fase 0 compartida

`DESARROLLO_DESBLOQUEADO_FLAG_OFF`: se implementan adaptador `training-load/v1`, `day_id`, actual load y outbox sobre los contratos compartidos. El descriptor CrossFit solo puede emitir carga cuando el flag específico esté activo tras contract tests, integración outbox/nutrición y shadow metrics sin degradados injustificados.
