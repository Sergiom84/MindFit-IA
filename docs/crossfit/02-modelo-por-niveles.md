# Clasificacion objetiva por niveles

Version: `level-model/2.0.0`. Elite/competicion queda fuera. La antiguedad solo aporta contexto; nunca promociona por si sola.

## Conceptos separados

- **Nivel global**: complejidad, volumen y frecuencia que el usuario tolera de forma consistente.
- **Skill tier**: permiso independiente por movimiento/patron.
- **Escala**: variante/carga/reps/rango usada hoy para preservar stimulus.
- **Rx/Scaled/Rx+**: etiquetas de una version del WOD, no niveles de persona.
- **Confianza**: calidad y actualidad de los datos usados para clasificar.

## Dimensiones y puntuacion

Cada dimension recibe `0 desconocido/inseguro`, `1 base`, `2 competente` o `3 avanzado`. Las pruebas completas estan en [`data/niveles_evaluacion.csv`](./data/niveles_evaluacion.csv).

| Dimension          | 1 - Principiante competente                                              | 2 - Intermedio                                                           | 3 - Avanzado                                                       |
| ------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Tecnica por patron | ocho patrones sin dolor, consistentes sin carga                          | carga moderada y fatiga controlada                                       | consistencia bajo fatiga, observacion humana/video                 |
| Fuerza submaxima   | 8 goblet squats 0,20 x peso y hinge 0,30 x peso a RPE <=7, o alternativa | FS 5RM >=0,60; DL 5RM >=1,00; press 5RM >=0,30, o equivalentes           | FS 3RM >=1,00; DL 3RM >=1,50; press 3RM >=0,45, o equivalentes     |
| Aerobico           | 10 min continuos RPE <=6; caida intervalos <=15 %                        | 20 min RPE <=7; caida <=10 %                                             | 30 min RPE <=7; caida <=7 %                                        |
| Gimnasia           | hang/hollow 20 s; 8 rows y push-ups adaptadas                            | 5 pull-ups estrictas o regresion equivalente; 10 push-ups; 8 knee raises | 8 pull-ups, 5 dips, 10 TTB/regresion y 30 DU; high skills aparte   |
| Halterofilia       | checklist PVC/barra; 5 reps sin fallo de derivados                       | 5 hang power clean a 0,30 x peso y snatch a 0,20, o carga tecnica        | 3 reps estables a 60 % de 1RM tecnico; permisos por lift           |
| Pacing             | termina dentro de cap sin perdida tecnica; drift <=20 %                  | drift entre intervalos <=12 %                                            | drift <=8 %                                                        |
| Densidad/volumen   | 2-3 sesiones, adherencia >=70 %, sin dolor residual                      | 3-4, adherencia >=75 %, recupera 24-48 h                                 | 4-5, adherencia >=80 %, tolera dos estimulos exigentes controlados |
| Recuperacion       | readiness medio >=3/5                                                    | >=3/5 y sin tres dias consecutivos de fatiga alta                        | >=3,5/5 con tendencia estable                                      |

Los ratios de fuerza son alternativas de clasificacion, no objetivos obligatorios ni reglas diferenciadas por sexo. El usuario puede demostrar competencia con un test submaximo equivalente. Nunca se exige 1RM ni una habilidad de riesgo para promocionar.

## Algoritmo de clasificacion

```text
if red_flag or acute_injury or pain >= 5:
  status = BLOCKED; no asignar carga
else if confidence == LOW:
  level = BEGINNER; skill_tiers = solo capacidades demostradas
else if any safety_critical_technique == 0:
  level = BEGINNER
else if all dimensions >= 2 and count(dimensions == 3) >= 6
        and adherence_8w >= 0.80 and no_active_safety_blocker
        and confidence == HIGH:
  level = ADVANCED
else if all safety_dimensions >= 1 and count(dimensions >= 2) >= 6
        and adherence_6w >= 0.70:
  level = INTERMEDIATE
else:
  level = BEGINNER
```

La fuerza no compensa tecnica 0; el motor aerobico no desbloquea gimnasia; la antiguedad no compensa dolor. Para avanzado, la tecnica de halterofilia y cualquier skill dinamico necesita validacion humana/video reciente. `REQUIERE_VALIDACION_HUMANA`.

## Entrada, permanencia y promocion

| Nivel        | Entrada                                                              | Permanencia                                 | Promocion                                                                   |
| ------------ | -------------------------------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------- |
| Principiante | cualquier dimension critica 0/1, confianza baja o retorno prolongado | tecnica mejora sin dolor, adherencia >=60 % | 6 de 8 dimensiones >=2, ninguna critica 0, >=6 semanas y adherencia >=70 %  |
| Intermedio   | algoritmo anterior y confianza media/alta                            | ninguna critica <1; carga tolerada 3-4 dias | todas >=2, seis en 3, 8 semanas >=80 %, confianza alta y validacion tecnica |
| Avanzado     | algoritmo anterior                                                   | ninguna <2; tendencias estables             | no promociona a Elite en este producto                                      |

La promocion se evalua al cierre de bloque, nunca tras un unico benchmark. Debe haber tres exposiciones comparables por capacidad, separadas y sin dolor >1.

## Confianza

| Confianza | Evidencia minima                                                   | Efecto                                               |
| --------- | ------------------------------------------------------------------ | ---------------------------------------------------- |
| Baja      | cuestionario, dato >56 dias o pruebas incompletas                  | cap global principiante; skills complejos bloqueados |
| Media     | >=3 sesiones comparables y tests objetivos <=28 dias               | hasta intermedio                                     |
| Alta      | >=6 sesiones, tests <=28 dias y validacion tecnica para high skill | puede optar a avanzado                               |

## Capacidades asimetricas

Se asigna nivel global conservador y tiers independientes. Ejemplo: motor aerobico 3, fuerza 2 y gimnasia 1 da nivel intermedio, pero TTB/muscle-up permanecen bloqueados. El generador puede usar duracion avanzada en mono solo si la semana global conserva volumen intermedio; nunca importa una sesion avanzada completa.

## Regresion temporal y retorno

| Condicion                                     | Accion                                                                               |
| --------------------------------------------- | ------------------------------------------------------------------------------------ |
| Dolor 3-4 o tecnica cae a 0                   | regresión inmediata del patrón; estado `regress` o `hold` según seguridad            |
| Pausa 14-27 dias                              | volumen -20 %, sin skills nuevos, 1 semana de retorno                                |
| Pausa 28-55 dias                              | volumen -35 %, skill tier dinamico -1, 2 semanas                                     |
| Pausa >=56 dias                               | volumen -50 %, clasificacion provisional principiante/intermedio inferior, reevaluar |
| Adherencia <50 % en 4 semanas                 | no progresar; reducir frecuencia objetivo                                            |
| Dos resultados comparables <=-10 % con fatiga | `DELOAD`, no bajar nivel permanente                                                  |
| Ocho semanas sin recuperar criterios          | reclasificacion completa                                                             |

## Reevaluacion

- Principiante: semanas 1 y 8, con check tecnico breve cada 2 semanas.
- Intermedio: semanas 1, 5 y 10.
- Avanzado: semanas 1, 5, 9 y 12.
- Evento inmediato: dolor nuevo, pausa, enfermedad, cambio de equipamiento o tres sesiones abandonadas.

## Benchmarks seguros

Los tests de producto deben ser neutrales y escalables: intervalo repetible de remo/bike/run, circuito de patrones basicos, fuerza submaxima y checklist tecnico. Benchmarks con nombre se usan como comparadores opcionales, maximo segun [`14-biblioteca-wods-y-composicion.md`](./14-biblioteca-wods-y-composicion.md), solo si todos los prerequisitos estan desbloqueados. Ningun benchmark aislado cambia nivel.

## Persistencia implementada con gate de BD

El contrato y el ledger preparados guardan `dimension_scores`, `test_ids`, `observed_at`, `confidence`, `global_level`, `skill_permissions`, `safety_status`, `ruleset_version` y `decision_trace`. No sobrescriben `nivel_entrenamiento` general sin consentimiento. La UI de ocho dimensiones y el endpoint de revisión profesional server-side están implementados; `20260722_crossfit_v2_assessments.sql`, RLS y E2E permanecen `REQUIERE_MIGRACION_AUTORIZADA`.
