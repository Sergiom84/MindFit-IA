# Maquina de estados de autorregulacion

Version: `crossfit-autoreg/v2`. Orden de prioridad: seguridad > dolor > tecnica > readiness > cumplimiento > rendimiento > progresion. La progresion de capacidad, skill y escala son decisiones independientes.

## Inputs

| Grupo      | Campos                                                                        |
| ---------- | ----------------------------------------------------------------------------- |
| Resultado  | completed/abandoned/capped, tiempo, rounds, reps, carga, calorias, intervalos |
| Percepcion | RPE 1-10, scale por movimiento, tecnica 0-3, motivo de abandono               |
| Seguridad  | dolor 0-10, localizacion, tipo, cambio, red flags                             |
| Readiness  | sueno 1-5, fatiga 1-5, recuperacion 1-5, estres 1-5                           |
| Tendencia  | resultados comparables 21/42 d, asistencia, sRPE 7/28 d separadas             |
| Contexto   | equipo, pausa, enfermedad, dominio, carga planned/actual                      |

No se usa `sRPE_7 / sRPE_28` como causalidad. Se comparan ambas series con su baseline personal y se pide otra señal antes de descargar.

## Estados

| Estado              | Significado                                                   | Salida permitida                             |
| ------------------- | ------------------------------------------------------------- | -------------------------------------------- |
| `baseline`          | dentro de objetivo o sin señal de cambio                      | mantener dosis                               |
| `hold`              | datos insuficientes/asimétricos o señal única                 | repetir, calibrar o esperar                  |
| `progress_capacity` | evidencia repetida de margen de capacidad                     | progresar una variable de carga/dosis        |
| `progress_skill`    | evidencia técnica y prerrequisitos repetidos                  | subir un peldaño de skill, no nivel global   |
| `regress`           | dolor modificable, técnica insegura, baja readiness o retorno | reducir/sustituir y aplicar protocolo seguro |
| `deload`            | acumulación de fatiga con dos señales independientes          | 5-7 días, volumen -30-45 %                   |
| `blocked`           | red flag, dolor severo o falta de autorización                | no generar esfuerzo; derivar                 |

## Transiciones prioritarias

```text
if red_flag or pain >= 5 or sharp_rising_pain or acute_injury:
  -> blocked immediately
else if pain in 3..4 or pain_delta >= 2 or technique == 0:
  -> regress; substitute/reduce movement immediately
else if return_after_pause >= 14d or cleared_return:
  -> regress with RETURN_PROTOCOL_REQUIRED
else if two_or_more_independent_fatigue_signals:
  -> deload
else if readiness_low_without_safety_signal:
  -> regress with AUTOREG_RECOVERY
else if skill_evidence_satisfied and no_capacity_progress_same_microcycle:
  -> progress_skill
else if capacity_evidence_satisfied and no_skill_progress_same_microcycle:
  -> progress_capacity
else:
  -> baseline or hold
```

## Señales cuantificadas

`progress_capacity` requiere en 21 días: >=3 exposiciones comparables, resultado 90-110 % del stimulus objetivo, RPE 6-8, técnica >=2, dolor <=1, adherencia >=80 %, readiness medio >=3 y cero flags. `progress_skill` exige además técnica 3/3, cero misses peligrosos y todos los prerrequisitos.

`DELOAD` requiere dos señales independientes:

- RPE >=9 en 2 de 3 sesiones comparables no test;
- rendimiento <=-10 % en dos exposiciones comparables;
- fatiga >=4 durante 3 dias;
- sueno <=2 durante 3 dias;
- sRPE 7 d > baseline movil 28 d en >20 %;
- dos sesiones recortadas por readiness;
- dolor 2 persistente en 3 exposiciones, que ademas bloquea progresion del patron.

Una sola señal crea `hold`, no `deload`, salvo seguridad. Una semana de baja asistencia por agenda no se interpreta como fatiga.

## Histeresis

- `regress`/`blocked`: entrada inmediata.
- `progress_capacity`/`progress_skill`: tres evidencias positivas; una sesión fácil no basta.
- Salida de `regress` por readiness: dos check-ins >=3 separados >=24 h y dolor <=1.
- Salida de `deload`: mínimo 5 días, readiness >=3 dos días, técnica estable y sin caída adicional.
- Salida de `blocked`: dato de resolución/autorización requerido; nunca por timeout.
- Retorno dentro de `regress`: 1/2/3 semanas según pausa, con dos exposiciones técnicas satisfactorias antes de restaurar skill.

## Acciones separadas

### Capacidad

En `progress_capacity` elegir solo una: fuerza `+2,5-5 %`, trabajo mono `+5-8 %`, densidad `+3-5 %` o reps totales `+5 %`. No se progresa si el siguiente microciclo ya sube otra variable.

### Skill

Subir un peldaño tras tres exposiciones con tecnica 3/3, cero misses peligrosos, dolor <=1 y prerequisitos. La habilidad dinamica avanzada necesita revision humana. Bajar un peldaño por tecnica 0, dolor o pausa segun tabla.

### Escala

Cambiar Scaled -> Rx solo si la variante Rx cumple skill/equipo, dos exposiciones anteriores alcanzan stimulus con RPE <=8 y la dosis prevista queda <=60 % de capacidad fresca. No cambia el nivel global.

## Tratamiento de cap, abandono y equipo

- Cap con RPE 7-9 y tecnica >=2: mantener/ajustar dosis, no castigar.
- Cap con RPE <=6: revisar estimacion, transiciones o skill; no subir carga automaticamente.
- Abandono por dolor: seguridad; por tiempo/agenda: adherencia operativa; por dificultad: dosis; por equipo: regeneracion controlada.
- Cambio de equipo invalida comparabilidad; crea `hold` con `AUTOREG_EQUIPMENT_CHANGE`.

## Persistencia

Cada decision guarda estado anterior/nuevo, ventana, features calculadas, reglas activadas, acciones por capacity/skill/scale, reason codes, ruleset y source events. Reprocesar el mismo evento es idempotente. Correcciones crean evento compensatorio, no UPDATE opaco.

## Integracion futura

`IMPLEMENTACION_EN_RAMA`: sustituir la heurística CrossFit de `planAutoregService.js`, ampliar resultado del player/modal y persistir decision trace. El consumo de `training.session_completed` y actual load por outbox se desarrolla con `CROSSFIT_V2_RESULTS=false` hasta superar tabla de transiciones, prioridad de seguridad, histéresis, idempotencia, eventos fuera de orden y carga histórica degradada.
