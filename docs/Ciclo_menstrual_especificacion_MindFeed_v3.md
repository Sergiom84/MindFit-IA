# Integración del ciclo menstrual en MindFeed - Especificación operativa (sin código)

Versión: v3.0 | Fecha: 2026-02-02 | Objetivo: documento implementable por desarrollo sin interpretación creativa.

## 0) Alcance y principios

- Este documento define cómo usar el ciclo menstrual para ajustar el entrenamiento dentro de la app, combinando fase estimada + check-in de síntomas.

- Si el ciclo es poco fiable (irregularidad, datos incompletos, anticoncepción hormonal), el sistema pasa a “modo síntomas” y NO intenta predecir ovulación.

- La seguridad manda: dolor alto o mala recuperación fuerza sustituciones y/o reducción de carga antes que “cumplir el plan”.

- Los multiplicadores finales siempre se limitan (clamp) a un rango estable para evitar ajustes extremos.

## 1) Datos necesarios (onboarding + registro)

| Campo              | Tipo      | Valores permitidos                                                                | Notas                                                                                   |
| ------------------ | --------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| contraception_type | enum      | none \| combined \| progestin_only \| hormonal_iud \| copper_iud \| other/unknown | Si no está claro, usar other/unknown.                                                   |
| cycle_confidence   | enum      | high \| medium \| low                                                             | Se calcula automáticamente (ver sección 2), pero se puede exponer como info al usuario. |
| impact_level       | int (0-3) | 0 sin impacto \| 1 bajo \| 2 medio \| 3 alto                                      | Tag por ejercicio.                                                                      |
| axial_load_level   | int (0-3) | 0 nula \| 1 baja \| 2 media \| 3 alta                                             | Tag por ejercicio.                                                                      |
| cod_level          | int (0-3) | 0 nada \| 1 bajo \| 2 medio \| 3 alto                                             | Cambios de dirección/saltos/pliometría.                                                 |
| joint_laxity_risk  | bool      | true/false                                                                        | Se activa si la usuaria lo marca o historial de lesiones/hiperlaxitud.                  |

### 1.1 Campos mínimos (si falta alguno, el sistema debe degradar a modo síntomas)

| Campo                 | Tipo | Requerido   | Default | Descripción                                                                                   |
| --------------------- | ---- | ----------- | ------- | --------------------------------------------------------------------------------------------- |
| last_bleed_start_date | date | No          | -       | Fecha del último día 1 (inicio de sangrado). Si no existe, modo síntomas.                     |
| bleed_length_days     | int  | No          | 5       | Duración típica del sangrado. Se puede ajustar cuando se registren 2-3 ciclos.                |
| cycle_length_days     | int  | No          | 28      | Longitud media del ciclo (se recalcula con EMA cuando existan ≥2 ciclos completos).           |
| luteal_length_days    | int  | No          | 14      | Estimación base (más estable que el ciclo total). Se puede ajustar si hay datos de ovulación. |
| pain_0_3              | int  | Sí (diario) | 0       | Dolor/cólicos/cefalea. 0 nada, 3 alto.                                                        |
| fatigue_0_3           | int  | Sí (diario) | 0       | Energía/fatiga. 0 bien, 3 muy bajo.                                                           |
| sleep_0_3             | int  | Sí (diario) | 0       | Sueño/recuperación. 0 bien, 3 muy mal.                                                        |
| stress_0_3            | int  | Opcional    | 0       | Estrés/ánimo. Si no se usa, ignorar.                                                          |
| pain_next_day_0_10    | int  | Recomendado | -       | Dolor/peor sensación al día siguiente (para autoajuste).                                      |
| session_quality_0_10  | int  | Recomendado | -       | Calidad percibida de la sesión (para autoajuste).                                             |

## 2) Estimación del ciclo y cálculo de confianza

### 2.1 Reglas para calcular cycle_length_days (EMA simple)

- Usar los últimos ciclos completados (diferencia en días entre day1 consecutivos).

- Si hay ≥2 ciclos: recalcular cycle_length_days con una Media Móvil Exponencial (EMA).

- Parámetro fijo: alpha = 0.30 (equilibrio entre estabilidad y adaptación).

- Fórmula en palabras: nuevo_promedio = (alpha × último_ciclo) + ((1 - alpha) × promedio_anterior).

- Si hay datos insuficientes o inconsistentes: mantener default 28 y bajar confianza.

### 2.2 Variación del ciclo (para confidence) usando los últimos 3 ciclos completos

Definición: variación = (máximo - mínimo) de la longitud de esos 3 ciclos. Si hay menos de 3, usar los disponibles y degradar confianza.

| cycle_variation_days | cycle_confidence | Interpretación                                                          |
| -------------------- | ---------------- | ----------------------------------------------------------------------- |
| 0-3                  | high             | Ciclo bastante regular.                                                 |
| 4-7                  | medium           | Ciclo variable, la fase es orientativa.                                 |
| ≥8                   | low              | Ciclo irregular, mandar a modo síntomas si además hay logs incompletos. |

### 2.3 Reglas adicionales que fuerzan confidence baja

- No hay last_bleed_start_date.

- No hay registro ≥10 días consecutivos (se asume pérdida de fase).

- Se detectan sangrados muy irregulares o ciclos muy dispares sin patrón.

- Se marca anticoncepción hormonal y no hay forma fiable de fase (ver 3.1).

## 3) Selección de modo: fase vs síntomas

### 3.1 Modo síntomas (NO se estima fase) si se cumple cualquiera:

- contraception_type ∈ {combined, progestin_only, hormonal_iud, other/unknown} (por prudencia).

- cycle_confidence = low.

- last_bleed_start_date ausente o datos insuficientes.

### 3.2 Modo fase + síntomas si:

- contraception_type ∈ {none, copper_iud} y hay last_bleed_start_date.

- cycle_confidence es high o medium.

## 4) Determinación de fase (solo en modo fase)

### 4.1 Cálculos base (en palabras)

- cycle_day = número de días desde last_bleed_start_date, contando el inicio como día 1.

- ovulation_day_est = cycle_length_days - luteal_length_days.

- ventana_ovulación = ovulation_day_est ± 1 día (confidence high) o ± 2 días (confidence medium).

- luteal_late_window = últimos 5 días del ciclo estimado (cycle_length_days - 4 hasta cycle_length_days).

- menstruación = día 1 hasta bleed_length_days (si el sangrado real se registra, usarlo).

| Fase         | Ventana (regla)                          | Objetivo                           | Riesgos típicos                 | Ajuste base (si no hay síntomas)                           |
| ------------ | ---------------------------------------- | ---------------------------------- | ------------------------------- | ---------------------------------------------------------- |
| Menstruación | cycle_day 1 → bleed_length_days          | Mantener adherencia y técnica      | Dolor/cólicos, fatiga           | Volumen -5% a -10% si dolor; descanso +0-30s               |
| Folicular    | post-sangrado → inicio ventana ovulación | Empuje progresivo                  | Ninguno específico              | Base normal; se permite progresión si check-in 0-1         |
| Ovulatoria   | ventana_ovulación                        | Rendimiento normal                 | Posible hiperlaxitud en algunas | Normal; si joint_laxity_risk=true → limitar COD/pliometría |
| Lútea        | post-ovulación → inicio lútea tardía     | Sostener sin reventar recuperación | Sueño/retención/temperatura     | Volumen -0% a -10% si síntomas; descanso +15-30s           |
| Lútea tardía | luteal_late_window                       | Minimizar crash premenstrual       | PMS, peor recuperación          | Volumen -10%; intensidad -5%; descanso +30-45s             |

## 5) Check-in de síntomas (dominios) y severidad global

| Dominio                 | 0         | 1             | 2              | 3                        |
| ----------------------- | --------- | ------------- | -------------- | ------------------------ |
| Dolor                   | sin dolor | molestia leve | dolor moderado | dolor alto/incapacitante |
| Energía/Fatiga          | normal    | algo baja     | baja           | muy baja                 |
| Sueño/Recuperación      | bien      | regular       | mal            | muy mal                  |
| Estrés/Ánimo (opcional) | bien      | variable      | mal            | muy mal                  |

Severidad global = máximo de (Dolor, Fatiga, Sueño) [Estrés opcional]. El dominio dominante define la acción prioritaria (ver 7.2).

| Severidad global | Interpretación | Acción principal           | Ajuste típico                                                 |
| ---------------- | -------------- | -------------------------- | ------------------------------------------------------------- |
| 0                | Todo OK        | Progresar según plan       | Sin cambios                                                   |
| 1                | Leve           | Mantener estímulo          | -0% a -5% volumen o +15s descanso                             |
| 2                | Moderado       | Proteger recuperación      | -10% volumen o -5% intensidad; +30s descanso                  |
| 3                | Alto           | Prioridad salud/adherencia | -15% a -25% o sesión alternativa; swaps obligatorios si dolor |

## 6) Multiplicadores base (fase y síntomas) y límites

### 6.1 Multiplicadores por fase (solo en modo fase). Rangos recomendados; la app debe usar un valor fijo por fase para consistencia.

| Fase         | M_intensidad | M_volumen | Extra descanso (s) |
| ------------ | ------------ | --------- | ------------------ |
| Menstruación | 0.95         | 0.95      | +0-30              |
| Folicular    | 1.00         | 1.00      | +0                 |
| Ovulatoria   | 1.00         | 1.00      | +0                 |
| Lútea        | 0.97         | 0.95      | +15-30             |
| Lútea tardía | 0.95         | 0.90      | +30-45             |

### 6.2 Multiplicadores por severidad global (siempre aplican)

| Severidad | M_intensidad | M_volumen | Extra descanso (s) |
| --------- | ------------ | --------- | ------------------ |
| 0         | 1.00         | 1.00      | +0                 |
| 1         | 0.98         | 0.95      | +15                |
| 2         | 0.95         | 0.90      | +30                |
| 3         | 0.90         | 0.85      | +45-60             |

### 6.3 Límites obligatorios

| Elemento              | Regla                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------ |
| Clamp multiplicadores | M_final_int y M_final_vol deben limitarse a [0.80, 1.10].                                        |
| Coherencia carga      | No aumentar a la vez intensidad y volumen en la misma sesión (ver 7.3).                          |
| Seguridad dolor       | Si Dolor ≥2: swaps obligatorios para impacto/axial según tags.                                   |
| Descanso mínimo       | Si Sueño ≥2: +30 s adicionales al descanso base aunque el multiplicador ya haya sumado descanso. |

## 7) Cómo se combinan fase y síntomas (sin doble penalización)

### 7.1 Peso de síntomas según confianza (w). En modo síntomas, w=1.0 (solo síntomas).

| cycle_confidence | w (peso síntomas) | Lectura                                 |
| ---------------- | ----------------- | --------------------------------------- |
| high             | 0.50              | Fase y síntomas pesan parecido.         |
| medium           | 0.65              | Mandar síntomas un poco más.            |
| low              | 0.80              | Fase casi orientativa; síntomas mandan. |
| modo síntomas    | 1.00              | Solo síntomas (sin fase).               |

### 7.2 Regla de mezcla (explicada):

- Primero se obtiene un multiplicador por fase (si aplica) y otro por severidad global.

- Luego se combinan: M_mezclado = (1 - w) × M_fase + w × M_síntomas.

- Después se aplica clamp [0.80, 1.10].

- El dominio dominante puede forzar acciones (swaps o descansos) por encima del multiplicador.

### 7.3 Regla “no subir volumen e intensidad a la vez” (determinista)

| Caso                                    | Decisión                                 |
| --------------------------------------- | ---------------------------------------- |
| M_final_int > 1.00 y M_final_vol > 1.00 | Dejar el mayor, y fijar el otro en 1.00. |
| M_final_int < 1.00 y M_final_vol < 1.00 | Aplicar ambos (reduce carga total).      |
| Uno >1.00 y el otro ≤1.00               | Aplicar ambos tal cual.                  |
| Uno =1.00                               | Aplicar el otro tal cual.                |

## 8) Reglas de sustitución (SWAP) por patrón y tags

### 8.1 Tags mínimos por ejercicio en la base de datos

| Tag              | Tipo       | Ejemplo                                                       | Uso                                                         |
| ---------------- | ---------- | ------------------------------------------------------------- | ----------------------------------------------------------- |
| pattern          | enum       | squat \| hinge \| push \| pull \| carry \| locomotion \| core | Sustituir manteniendo patrón.                               |
| equipment        | enum/multi | barbell, dumbbell, machine, band, bodyweight                  | Filtrar alternativas disponibles.                           |
| impact_level     | 0-3        | 2                                                             | Reducir impacto si dolor alto.                              |
| axial_load_level | 0-3        | 3                                                             | Reducir carga axial si dolor o sueño malos.                 |
| cod_level        | 0-3        | 2                                                             | Limitar cambios de dirección si aplica.                     |
| overhead         | bool       | true                                                          | Evitar overhead si dolor hombro/cefalea (si se implementa). |

### 8.2 Cuándo el SWAP es obligatorio (reglas duras)

- Dolor ≥2: si el ejercicio tiene impact_level ≥2, sustituir por alternativa de impact_level ≤1 manteniendo patrón.

- Dolor ≥2: si axial_load_level ≥2 (sentadilla trasera pesada, peso muerto convencional), sustituir por variante con axial_load_level ≤1-2 (según catálogo).

- Sueño ≥2: evitar “grinders” (repeticiones al límite) y preferir máquinas/variantes estables.

- Si joint_laxity_risk=true y fase ovulatoria o fatiga≥2: limitar cod_level a ≤1 (sin pliometría intensa ni COD alto).

## 9) Aplicación práctica por tipo de sesión

| Situación     | Objetivo        | Estrategia recomendada                                                     |
| ------------- | --------------- | -------------------------------------------------------------------------- |
| Severidad 0-1 | Progresar       | Mantener plan; añadir peso o reps si RIR/RPE lo permite.                   |
| Severidad 2   | Sostener        | Reducir 1 serie dura por ejercicio o bajar 2.5-5% la carga; descanso +30s. |
| Severidad 3   | Recuperar       | Sesión técnica/volumen bajo; máquina/variantes estables; RIR alto.         |
| Dolor ≥2      | Evitar empeorar | SWAP obligatorio (impacto/axial), mantener estímulo sin castigar zona.     |

| Situación     | HIIT/MetCon                     | Zona 2 / Cardio suave | Movilidad/recuperación |
| ------------- | ------------------------------- | --------------------- | ---------------------- |
| Severidad 0-1 | Permitido                       | Permitido             | Opcional               |
| Severidad 2   | Reducir densidad (más descanso) | Preferible            | Recomendado            |
| Severidad 3   | Evitar HIIT                     | Preferible            | Recomendado            |
| Dolor ≥2      | Evitar impacto y saltos         | Bike/remo             | Suave                  |

## 10) Feedback, autoajuste y deload

### 10.1 Reglas de autoajuste (deterministas, sin IA mágica)

- Si pain_next_day_0_10 ≥7 en 2 de las últimas 3 sesiones del mismo patrón: bajar M_volumen objetivo de ese patrón un 5% la siguiente semana y reforzar SWAP si impact/axial ≥2.

- Si session_quality_0_10 ≤4 en 2 de las últimas 3 sesiones: bajar M_intensidad objetivo un 2.5-5% la siguiente sesión y añadir +15s descanso.

- Si ambas (dolor alto + calidad baja): tratar como severidad global 3 durante 1 semana (mini-deload).

### 10.2 Deload (criterios de activación)

| Trigger                    | Condición                                          | Acción 1 semana                                           |
| -------------------------- | -------------------------------------------------- | --------------------------------------------------------- |
| Fatiga sostenida           | Severidad global ≥2 durante 2 semanas consecutivas | Volumen -15% a -25%, intensidad -5% a -10%, más descanso. |
| Señales post-sesión        | pain_next_day ≥7 o quality ≤4 repetido             | Reducir densidad y series duras; priorizar técnica.       |
| Ciclo irregular + síntomas | confidence low + severidad 2-3 recurrente          | Modo síntomas fijo + deload si se repite.                 |

## 11) Mensajes al usuario (explicación corta)

| Situación        | Mensaje sugerido (1 línea)                                                         |
| ---------------- | ---------------------------------------------------------------------------------- |
| Ajuste por sueño | Sueño bajo: bajamos la intensidad y subimos el descanso para que recuperes mejor.  |
| Ajuste por dolor | Dolor moderado: cambiamos a una variante con menos impacto sin perder el estímulo. |
| Modo síntomas    | Usamos tus síntomas y rendimiento para ajustar la sesión (sin predecir fases).     |
| Deload           | Semana de descarga: bajamos la carga para volver a progresar sin acumular fatiga.  |

## 12) Casos límite (comportamiento esperado)

| Caso                                         | Comportamiento                                                             |
| -------------------------------------------- | -------------------------------------------------------------------------- |
| Sin last_bleed_start_date                    | Modo síntomas. No mostrar fases ni ovulación estimada.                     |
| Datos incompletos/ausentes ≥10 días          | Degradar confidence a low hasta que haya registros continuos.              |
| contraception_type other/unknown             | Modo síntomas (prudencia).                                                 |
| Cambios recientes (postparto/perimenopausia) | Recomendar modo síntomas por defecto y evitar promesas sobre fase.         |
| Síntomas severos recurrentes                 | Sugerir consulta sanitaria (sin diagnóstico), y activar deload si procede. |

## 13) Casos de prueba (para QA)

| ID  | Inputs clave                                                             | Esperado                                                             |
| --- | ------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| T1  | none, confidence high, folicular, severidad 0                            | Modo fase. Sin ajustes. Progresión permitida.                        |
| T2  | none, confidence high, lútea tardía, severidad 1                         | Modo fase. Volumen ↓ leve (≈-5%). Descanso +15-30s.                  |
| T3  | none, confidence medium, ovulatoria, joint_laxity_risk=true, severidad 0 | Modo fase. Limitar COD/pliometría (cod_level ≤1).                    |
| T4  | combined, severidad 0                                                    | Modo síntomas. No fases. Ajustes = 1.0.                              |
| T5  | ciclo irregular (variation ≥8), severidad 2                              | Modo síntomas. Volumen ≈-10%, descanso +30s.                         |
| T6  | dolor 3, ejercicio impact_level 3 y axial 2                              | SWAP obligatorio a impact ≤1 y axial ≤1-2. Sesión suavizada.         |
| T7  | sueño 3, severidad 3 aunque fase folicular                               | Ajuste fuerte por síntomas. Evitar grinders. Descanso +60s.          |
| T8  | pain_next_day 8 repetido 2/3, quality 3 repetido                         | Mini-deload 1 semana. Reducir volumen e intensidad y reforzar swaps. |
