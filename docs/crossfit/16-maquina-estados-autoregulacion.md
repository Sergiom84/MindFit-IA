# Maquina de estados de autorregulacion

Version: `crossfit-autoreg/2.0.0`. Orden de prioridad: seguridad > dolor > tecnica > readiness > cumplimiento > rendimiento > progresion. La progresion de capacidad, skill y escala son decisiones independientes.

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

| Estado   | Significado                                    | Salida permitida                     |
| -------- | ---------------------------------------------- | ------------------------------------ |
| NORMAL   | dentro de objetivo                             | mantener dosis                       |
| BUILD    | evidencia repetida de margen                   | progresar una variable               |
| HOLD     | datos insuficientes/asimetricos                | repetir o calibrar                   |
| RECOVERY | readiness bajo no agudo                        | D0/D1 24-72 h                        |
| DELOAD   | acumulacion de fatiga                          | 5-7 dias, volumen -30-45 %           |
| RETURN   | vuelta tras pausa/lesion autorizada            | volumen reducido y skills regresados |
| BLOCKED  | red flag, dolor severo o falta de autorizacion | no generar esfuerzo; derivar         |

## Transiciones prioritarias

```text
if red_flag or pain >= 5 or sharp_rising_pain or acute_injury:
  -> BLOCKED immediately
else if pain in 3..4 or pain_delta >= 2 or technique == 0:
  -> HOLD or RECOVERY; regress/substitute movement immediately
else if return_after_pause >= 14d or cleared_return:
  -> RETURN
else if two_or_more_independent_fatigue_signals:
  -> DELOAD
else if readiness_low_without_safety_signal:
  -> RECOVERY
else if build_evidence_satisfied:
  -> BUILD
else:
  -> NORMAL or HOLD
```

## Señales cuantificadas

`BUILD` requiere en 21 dias: >=3 exposiciones comparables, resultado 90-110 % del stimulus objetivo, RPE 6-8, tecnica >=2, dolor <=1, adherencia >=80 %, readiness medio >=3 y cero flags.

`DELOAD` requiere dos señales independientes:

- RPE >=9 en 2 de 3 sesiones comparables no test;
- rendimiento <=-10 % en dos exposiciones comparables;
- fatiga >=4 durante 3 dias;
- sueno <=2 durante 3 dias;
- sRPE 7 d > baseline movil 28 d en >20 %;
- dos sesiones recortadas por readiness;
- dolor 2 persistente en 3 exposiciones, que ademas bloquea progresion del patron.

Una sola senal crea `HOLD`, no deload, salvo seguridad. Una semana de baja asistencia por agenda no se interpreta como fatiga.

## Histeresis

- Regresion/bloqueo: inmediata.
- BUILD: tres evidencias positivas; una sesion facil no basta.
- Salida de RECOVERY: dos check-ins >=3 separados >=24 h y dolor <=1.
- Salida de DELOAD: minimo 5 dias, readiness >=3 dos dias, tecnica estable y sin caida adicional.
- Salida de BLOCKED: dato de resolucion/autorizacion requerido; nunca por timeout.
- RETURN: 1/2/3 semanas segun pausa, con dos exposiciones tecnicas satisfactorias antes de restaurar skill.

## Acciones separadas

### Capacidad

En BUILD elegir solo una: fuerza `+2,5-5 %`, trabajo mono `+5-8 %`, densidad `+3-5 %` o reps totales `+5 %`. No se progresa si el siguiente microciclo ya sube otra variable.

### Skill

Subir un peldaño tras tres exposiciones con tecnica 3/3, cero misses peligrosos, dolor <=1 y prerequisitos. La habilidad dinamica avanzada necesita revision humana. Bajar un peldaño por tecnica 0, dolor o pausa segun tabla.

### Escala

Cambiar Scaled -> Rx solo si la variante Rx cumple skill/equipo, dos exposiciones anteriores alcanzan stimulus con RPE <=8 y la dosis prevista queda <=60 % de capacidad fresca. No cambia el nivel global.

## Tratamiento de cap, abandono y equipo

- Cap con RPE 7-9 y tecnica >=2: mantener/ajustar dosis, no castigar.
- Cap con RPE <=6: revisar estimacion, transiciones o skill; no subir carga automaticamente.
- Abandono por dolor: seguridad; por tiempo/agenda: adherencia operativa; por dificultad: dosis; por equipo: regeneracion controlada.
- Cambio de equipo invalida comparabilidad; crea `HOLD_EQUIPMENT_CHANGED`.

## Persistencia

Cada decision guarda estado anterior/nuevo, ventana, features calculadas, reglas activadas, acciones por capacity/skill/scale, reason codes, ruleset y source events. Reprocesar el mismo evento es idempotente. Correcciones crean evento compensatorio, no UPDATE opaco.

## Integracion futura

`IMPLEMENTACION_EN_RAMA`: sustituir la heurística CrossFit de `planAutoregService.js`, ampliar resultado del player/modal y persistir decision trace. El consumo de `training.session_completed` y actual load por outbox se desarrolla con `CROSSFIT_V2_RESULTS=false` hasta superar tabla de transiciones, prioridad de seguridad, histéresis, idempotencia, eventos fuera de orden y carga histórica degradada.
