# Programacion completa: avanzado no competitivo

Ruleset: `program-advanced/2.0.0`. Este nivel no equivale a atleta de Games, Elite o doble sesion habitual. Objetivo: alta competencia general con complejidad autorizada, carga sostenible y trazabilidad.

## Frecuencia y limites

| Variable  | 4 dias minimo        | 5 dias recomendado                                          | Fuera de alcance              |
| --------- | -------------------- | ----------------------------------------------------------- | ----------------------------- |
| Duracion  | 60-80 min            | 60-90 min                                                   | 6 dias, volumen competitivo   |
| D2        | max 2/semana         | max 3/semana                                                | tres D2 consecutivos          |
| Secuencia | D2-D1-D0-D2          | max dos dias exigentes con patrones distintos y luego D0/D1 | dobles sistematicas           |
| Benchmark | max 1 cada 3 semanas | reemplaza D2                                                | testing competitivo frecuente |

## Bloque de 12 semanas

| Semana | Fase                      | Volumen relativo | Particularidad                    |
| ------ | ------------------------- | ---------------- | --------------------------------- |
| 1      | baseline                  | 70 %             | tests, cero maximos               |
| 2-4    | acumulacion               | 85/95/100 %      | fuerza/skill/aerobico             |
| 5      | descarga                  | 60-70 %          | intensidad tecnica, volumen bajo  |
| 6-8    | intensificacion           | 85/95/100 %      | carga y densidad, max 3 D2        |
| 9      | descarga                  | 60-70 %          | sin high skill fatigado           |
| 10-11  | realizacion               | 85/90 %          | un benchmark o test por capacidad |
| 12     | reevaluacion/recuperacion | 50-65 %          | nivel y siguiente bloque          |

## Cuotas por semana de 5 dias

| Componente      | Cuota                                                       |
| --------------- | ----------------------------------------------------------- |
| Fuerza          | 3 bloques; 4-8 x 1-5, RPE 6,5-9; solo uno RPE 9             |
| Halterofilia    | 2-3, incluyendo al menos una tecnica; <=36 reps bajo fatiga |
| Gimnasia        | 3; >=1 estricta/control; high skill solo permiso valido     |
| Mono            | 2-3: base, threshold y/o sprint; no todos duros             |
| Metcon          | 3-4; max 3 D2                                               |
| Largo 18-35 min | max 1/semana                                                |
| Impacto alto    | max 3, nunca tres dias seguidos                             |
| Bisagra pesada  | max 2; 36-48 h                                              |
| Overhead denso  | max 2; 36-48 h                                              |
| Grip alto       | max 2; 48 h                                                 |

Con 4 dias se eliminan un metcon D1 y un accesorio, no se comprimen. Los dominios se balancean en 14 dias.

## Ejemplos

### Cuatro dias

| Dia     | Principal                        | WOD               | Dominante                      |
| ------- | -------------------------------- | ----------------- | ------------------------------ |
| 1 D2    | squat pesado                     | couplet corto 6-9 | potencia piernas, skill bajo   |
| 2 D1    | strict gym + zone 2              | 25-35 min         | upper/control aerobico         |
| 3 D2    | clean & jerk tecnico/potencia    | intervals 15-20   | mixto, pacing                  |
| 4 D1/D2 | pull strength + skill autorizado | chipper 18-25     | grip moderado, sin lumbar alta |

### Cinco dias

| Dia  | Principal                  | WOD                | Restriccion                      |
| ---- | -------------------------- | ------------------ | -------------------------------- |
| 1 D2 | back/front squat           | sprint 4-8 min     | sin volumen de salto alto        |
| 2 D1 | gym estricta               | aerobic 25-40      | hombro controlado                |
| 3 D2 | snatch tecnico + fuerza    | AMRAP 12-16        | overhead solo si freshness >=3   |
| 4 D1 | carry/accessory            | EMOM tecnico 16-24 | work <=45 s                      |
| 5 D2 | hinge moderada o benchmark | For Time/interval  | reemplaza, no suma, test semanal |

## Carga y high skill

- Metcon ciclico 35-60 % de 1RM tecnico; baja repeticion 60-75 %; nunca >80 % bajo fatiga.
- Un permiso de muscle-up no desbloquea volumen: capacidad fresca x 40 % por set y x 150 % por sesion como maximo inicial.
- HSPU/HSW/rope climb exigen tecnica >=2, dolor 0-1, hombro/muneca/codo sin flags y salida segura.
- Dos misses olimpicos consecutivos: reducir 7,5-10 %; tres totales: finalizar lift del dia.
- Drift intervalos >8 %: reducir output/rep o prolongar descanso; no perseguir la primera ronda.

## Dobles y competicion

Una doble ocasional solo se permite en avanzado si ambas sesiones son planificadas, una es D0/D1 tecnica/aerobica, existe >=6 h entre sesiones, carga nutricional/hidratacion esta disponible y no hay fatiga/dolor. No se genera por defecto y su activacion requiere `REQUIERE_VALIDACION_HUMANA`. Programacion competitiva, peaking de evento, volumen Elite y Rx+ quedan fuera.

## Deload y salida

El deload reduce 30-45 % de volumen, mantiene 70-85 % de carga tecnica sin grinding y elimina benchmarks. Avanzado no promociona automaticamente; se mantiene mientras todas las dimensiones >=2 y recuperacion/adherencia son estables.
