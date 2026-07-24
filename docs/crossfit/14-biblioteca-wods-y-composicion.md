# Biblioteca de WOD y reglas de composicion

Ruleset: `wod-composition/2.0.0`. Valores completos en [`data/wod_format_rules.csv`](./data/wod_format_rules.csv). El objetivo es alcanzar el stimulus, no agotar el time cap.

## Dominios temporales

| Dominio   | Duracion objetivo | Regla                                                             |
| --------- | ----------------- | ----------------------------------------------------------------- |
| Sprint    | 2-5 min           | skill bajo, carga controlada, no principiante salvo intervalos    |
| Corto     | 5-10              | potencia sostenible; max 2-3 movimientos                          |
| Medio     | 10-18             | dominio principal del producto                                    |
| Largo     | 18-30             | complejidad baja/media, carga submaxima                           |
| Extendido | 30-45             | predominantemente mono/skill simple; no metcon denso principiante |

`time_cap = ceil(p75_time_estimate / 30s) * 30s`, acotado al maximo por nivel/formato. Si no hay datos, usar el centro del rango objetivo multiplicado por 1,25. El target del usuario debe quedar entre 70 y 95 % del cap; una prediccion <60 % obliga a escalar antes de empezar.

## Formatos

| Formato             | Principiante                     | Intermedio          | Avanzado                   | Prerequisito                           |
| ------------------- | -------------------------------- | ------------------- | -------------------------- | -------------------------------------- |
| AMRAP               | 6-12 min, 2-4 mov.               | 8-20, 2-5           | 6-30, 2-6                  | reps divisibles y transiciones simples |
| EMOM                | 8-15; trabajo 35-50 s            | 10-24; 35-50 s      | 8-30; 30-50 s              | p75 del trabajo <50 s                  |
| E2MOM/E3MOM         | 5-8 sets; <=60 % del intervalo   | 5-10; <=70 %        | 5-12; <=75 %               | tecnica estable en fatiga repetida     |
| For Time            | cap 6-12                         | cap 5-18            | cap 3-25                   | volumen estimable y salida segura      |
| RFT                 | 3-5 rounds; 6-15 reps            | 3-7; 8-20           | 3-10; 6-25                 | ninguna serie >60 % capacidad fresca   |
| Chipper             | 3-5 mov.; 60-120 reps; cap 12-20 | 4-7; 100-220; 15-28 | 5-9; 150-300; 18-35        | complejidad decrece con fatiga         |
| Intervals           | 1:1 a 1:2                        | 1:1 a 2:1           | 1:2 sprint a 3:1 threshold | score por intervalo y drift            |
| Strength/skill only | 3-5x3-8 RPE 5-7                  | 4-6x2-6 RPE 6-8     | 4-8x1-5 RPE 6,5-9          | no se rellena con metcon por defecto   |

## Cargas, reps y complejidad

| Regla                           | Principiante       | Intermedio       | Avanzado                             |
| ------------------------------- | ------------------ | ---------------- | ------------------------------------ |
| Carga ciclica metcon            | <=35 % 1RM tecnico | 30-50 %          | 35-60 %                              |
| Carga baja repeticion           | <=50 %             | 50-65 %          | 60-75 %                              |
| Reps olimpicas/set              | <=3, derivados     | <=5              | <=5                                  |
| Reps olimpicas fatigadas/sesion | <=12               | <=24             | <=36                                 |
| Serie vs capacidad fresca       | <=60 %             | <=60 %           | <=60 %, high skill inicial 40 %      |
| Movimientos complejos           | 0 high skill       | max 1 autorizado | max 1 high skill o 2 tecnicos medios |

El porcentaje se calcula contra `technical_1rm`, no maximo teorico. Si falta, se usa carga de calibracion a RPE 6-7. No se genera fallo muscular, grinding ni levantamiento >80 % dentro de WOD.

## Combinaciones

### Permitidas

- mono + push o pull de complejidad baja;
- squat ligero + upper pull;
- carry + mono sin grip dominante;
- skill tecnico + metcon que no repite su patron fatigado;
- fuerza pesada + metcon corto de patron distinto y carga baja.

### Desaconsejadas, penalizacion `-30`

- squat pesado + wall ball/thruster moderado;
- pressing pesado + push-up/burpee denso;
- row sprint + pull-up alto volumen;
- carrera + box jump si impacto semanal ya es 1 (P), 2 (I) o 3 (A);
- clean/snatch tecnico + bisagra metabolica, salvo volumen bajo.

### Prohibidas, hard fail

- mismo patron pesado y denso en una sesion;
- deadlift pesado + swing/row sprint alto volumen;
- snatch/OHS + HSPU/handstand de volumen alto;
- rope climb + C2B/TTB/farmer carry alto volumen;
- kipping/high skill sin permiso;
- Olympic lift complejo despues de que el WOD ya acumule fatiga lumbar/agarre;
- dos movimientos con `avoid_pairing` reciproco;
- impacto alto con dolor agudo de miembro inferior o permiso de landing ausente.

## Fuerza mas metcon

1. Fuerza RPE <=8: metcon puede ser D1/D2, patron principal debe diferir o usar <=30 % de carga y <=40 reps del patron.
2. Fuerza RPE 8,5-9: metcon max 10 min, D1, sin repetir articulacion/patron dominante.
3. Test/benchmark de fuerza: no metcon intenso; solo recuperacion.
4. Olympic technique: puede aparecer en metcon solo con derivado mas simple y carga <=50 % tecnica.
5. Volumen total de una articulacion se valida despues de combinar ambos bloques.

## Preservar stimulus al escalar

Orden de ajuste: skill/seguridad -> rango/impacto -> carga -> reps -> distancia/calorias -> formato. Se conserva modalidad energetica y duracion siempre que sea seguro. Ejemplo: 10 pull-ups no se sustituyen automaticamente por 10 ring rows; se calcula una dosis que dure el mismo intervalo objetivo. Cada escala declara `expected_set_seconds`, `expected_unbroken_fraction` y `stimulus_delta`; `abs(stimulus_delta) <= 0,15` o se rechaza.

## Caps y stop rules durante WOD

- Si dos intervalos superan el tiempo de trabajo permitido, escalar la siguiente ronda.
- Si drift supera 15/12/8 % para P/I/A, bajar reps 10-20 %.
- Si RPE 10 antes del 60 % del WOD sin que sea un sprint test, detener o convertir a cooldown.
- Si tecnica =0, dolor sube >=2 o aparece red flag, detener el movimiento/sesion segun seguridad.
- Alcanzar cap es un resultado valido; no se completan reps extra fuera del reloj.

## Ventanas de repeticion

| Entidad                            | Limite                                                        |
| ---------------------------------- | ------------------------------------------------------------- |
| Mismo movimiento canonico          | no dos D2 en 72 h; max 2 exposiciones/7 d salvo skill tecnico |
| Misma variante exacta              | max 1/7 d P, 2/7 d I/A; max 3/28 d                            |
| Mismo formato + dominio + patrones | max 1/7 d; excepcion intervalos progresivos versionados       |
| Mismo benchmark nombrado           | cada 8-12 semanas                                             |
| Cualquier benchmark                | P cada >=6 semanas; I >=4; A >=3                              |
| High impact                        | cuotas de nivel y nunca tres dias consecutivos                |
| Grip/overhead/lumbar alto          | max 2/7 d; >=48 h entre exposiciones                          |

Las excepciones son progresiones planificadas con `progression_id`, no seleccion aleatoria. El benchmark reemplaza una sesion D2.

## Benchmark y nombre comercial

Los WOD con nombre se modelan en entidad `benchmark_workout`, no en `exercise`. Se guarda version, fuente, escala, cap y uso autorizado. Hasta resolver marca, la UI usa pruebas neutrales; el alias historico no aparece en marketing.
