# MindFeed v1.0 — Especificación para verificación de cumplimiento (Backend/BD)

**Propósito de este documento:** servir como referencia normativa para que un agente de programación (IA) pueda revisar en la **base de datos** y en el **backend** si el generador/ejecutor de planes respeta exactamente las reglas descritas en estos PDFs:

- `MindFeed_Bloque_Adaptacion_Inicial_v1_LANDSCAPE_FULL.pdf`
- `MindFeed_Fatiga_Solapamiento_Transiciones_v1_TEXT_LANDSCAPE.pdf`
- `MindFeed_Hipertrofia_Principiante_v1_LANDSCAPE.pdf`
- `MindFeed_Modulo_Prioridad_Intensidad_Principiante_v1_LANDSCAPE.pdf`
- `MindFeed_Volumen_y_Estructura_v1.pdf`

Incluye (1) reglas y umbrales **tal como aparecen** en los PDFs, (2) qué **evidencia** debería existir en BD, y (3) un **checklist** de auditoría.

---

## 0) Convenciones y definiciones

- **1RM**: repetición máxima (carga máxima posible en una repetición).
- **%1RM / intensidad**: porcentaje de 1RM usado para fijar la carga de trabajo.
- **RIR**: repeticiones en reserva (margen antes del fallo).
- **mean_RIR**: promedio de RIR real registrado (normalmente por semana o por microciclo).
- **Microciclo**: semana de entrenamiento dentro del mesociclo.
- **Deload**: semana de descarga (reducción de carga y volumen).
- **Adherencia (adherence)**: `sesiones_completadas / sesiones_planificadas` en el periodo evaluado.
- **muscle_overlap**: indicador de solapamiento neural/patrones repetidos en días consecutivos.

### Cómo usar este documento para auditar

Para cada regla se da un **ID** (ej. `AI-ADAPT-01`). El agente debería:

1. Identificar dónde vive cada dato en BD (tablas/campos).
2. Extraer planes generados + sesiones ejecutadas + flags + progresiones.
3. Comparar contra estos requisitos.
4. Reportar: ✅ Cumple / ⚠️ Parcial / ❌ No cumple, con ejemplos (user_id, plan_id, week, session_id).

---

## 1) PDF: Bloque de Adaptación Inicial (v1.0)

### 1.1 Objetivo del bloque

- Fase inicial para usuarios **principiantes o inactivos**, orientada a **aprendizaje motor**, **activación neuromuscular** y **adaptación progresiva a la carga** antes de entrar en Hipertrofia (Frecuencia 2).

### 1.2 Asignación automática del bloque (por perfil)

La IA asigna **exactamente 1** de estos tres tipos al registro del usuario:

| Tipo de rutina                 | Perfil                                                           | Duración fija |             Frecuencia | Objetivo                                       | Tag IA                     |
| ------------------------------ | ---------------------------------------------------------------- | ------------: | ---------------------: | ---------------------------------------------- | -------------------------- |
| Full Body (circuito completo)  | Usuario totalmente novato o **>12 meses** sin entrenar           |      1 semana |             4 días/sem | Aprendizaje motor, movilidad, control postural | `novato_total`             |
| Full Body (55+ o muy inactivo) | Baja condición física o readaptación articular                   |     3 semanas |             3 días/sem | Recuperar tono, coordinación, rango articular  | `readaptacion_mayor`       |
| Half Body (Cara A/B)           | Usuario con experiencia previa pero **3–12 meses** sin actividad |     2 semanas | 5 días/sem (A/B/A/B/A) | Reacondicionamiento muscular y control técnico | `reacondicionamiento_prev` |

**Requisitos (auditoría):**

- `AI-ADAPT-01` La selección debe depender de **edad + nivel + tiempo sin entrenar** y almacenar el **Tag IA** correspondiente.
- `AI-ADAPT-02` Duración y frecuencia deben ser **fijas** como en la tabla (no variables).

### 1.3 Plantillas de sesión — Full Body (Circuito completo)

**Parámetros:**

- Frecuencia: 4 días/sem (jóvenes) o 3 días/sem (mayores).
- Duración: 1 semana (jóvenes) / 3 semanas (mayores).
- Intensidad: **65–70% 1RM**.
- RIR objetivo: **3–4**.
- Reps: **10–15** por ejercicio.
- Estructura: **8 ejercicios x 2–3 vueltas**.

**Lista de ejercicios tipo (orden de referencia):**

1. Sentadilla o prensa 45° (multiarticular – tren inferior)
2. Press de pecho en máquina (multiarticular – tren superior)
3. Remo sentado o jalón al pecho (multiarticular – dorsal)
4. Press militar o elevaciones laterales (hombro)
5. Curl femoral (posterior de pierna)
6. Curl de bíceps (analítico)
7. Extensión de tríceps (analítico)
8. Core (plancha o crunch)

**Descansos por edad (entre ejercicios / entre vueltas):**

- 18–35: 30–60s / 2–3min
- 36–50: 45–90s / 3–4min
- 51+: 60–120s / 4–5min

**Requisitos (auditoría):**

- `AI-ADAPT-03` Los planes Full Body deben generar 8 ejercicios con 2–3 vueltas y los rangos de reps indicados.
- `AI-ADAPT-04` La intensidad objetivo debe caer en 65–70% (o carga equivalente si se convierte a kg).
- `AI-ADAPT-05` RIR target = 3–4 debe estar definido (en plantilla o lógica de coaching).
- `AI-ADAPT-06` Descansos deben corresponder al tramo de edad (ver JSON de descansos).

### 1.4 Plantillas de sesión — Half Body A/B (Cara Frontal / Cara Posterior)

**Parámetros generales:**

- Duración: 2 semanas
- Frecuencia: 5 días/sem (A/B/A/B/A)
- Intensidad: **75–80% 1RM**
- RIR objetivo: **2–3**
- Reps: **8–12**
- Descansos: entre ejercicios 45–75s | entre vueltas 2–3min

**Half Body A – Cara Frontal (Empuje + Extensión):**

1. Sentadilla o prensa (multi cuádriceps) – 10–12
2. Press de pecho (multi) – 8–12
3. Press militar o elevaciones frontales – 10–12
4. Extensión de cuádriceps (analítico) – 12–15
5. Extensión de tríceps polea/cuerda – 10–12
6. Core frontal (crunch/plancha) – 30–45s

**Half Body B – Cara Posterior (Tirón + Flexión):**

1. Peso muerto rumano o hip thrust (multi posterior) – 8–12
2. Remo con barra o jalón al pecho (multi dorsal) – 8–12
3. Curl femoral (analítico) – 12–15
4. Reverse fly/pájaros (deltoide posterior) – 12–15
5. Curl bíceps mancuernas/barra – 10–12
6. Extensión lumbar o pallof press – 30–45s

**Requisitos (auditoría):**

- `AI-ADAPT-07` En Half Body deben alternarse días A/B según patrón A/B/A/B/A.
- `AI-ADAPT-08` Intensidad 75–80% y RIR 2–3, con reps 8–12 (analíticos 12–15 donde aplica).
- `AI-ADAPT-09` Descansos A/B deben usar 45–75s y 2–3min entre vueltas (independiente de tramo de edad, salvo si vuestro sistema lo sobreescribe).

### 1.5 Descansos por edad — JSON de referencia

El PDF incluye un JSON interno esperado:

```json
{
  "18-35": { "entre_ejercicios": "30-60s", "entre_vueltas": "2-3min" },
  "36-50": { "entre_ejercicios": "45-90s", "entre_vueltas": "3-4min" },
  "51+": { "entre_ejercicios": "60-120s", "entre_vueltas": "4-5min" }
}
```

**Requisito (auditoría):**

- `AI-ADAPT-10` Debe existir una configuración equivalente en BD/config (por plan/bloque) o hardcode claro en backend.

### 1.6 Transición automática y condición de repetición

- Al completar el bloque asignado, la IA activa **Hipertrofia Frecuencia 2 (12 semanas)**.
- Condición de repetición: si el usuario **omite >40%** de sesiones (adherence < 0.6) **o** marca **mean_RIR > 4** en la mayoría de ejercicios → **repetir el bloque una única vez**.

Pseudocódigo del PDF:

```pseudo
if adherence < 0.6 or mean_RIR > 4:
  repeat_block_once = True
else:
  advance_to("Hipertrofia_Frecuencia2")
```

**Requisitos (auditoría):**

- `AI-ADAPT-11` Debe existir un contador/flag para asegurar que solo se repite **una vez**.
- `AI-ADAPT-12` La transición debe registrar: fecha, baseline, bloque destino, y motivo (advance vs repeat).

---

## 2) PDF: Flags de Fatiga, Solapamiento Neural y Transición entre Bloques (Principiante)

### 2.1 Flags de fatiga — definiciones y umbrales

Los flags modulan carga y progresión semanal. Se dividen en **leves**, **críticos** y **cognitivos**.

**fatigue_light (leve)** si se cumple (según fuentes subjetivas/objetivas):

- Sueño **4–5/10**
- Energía **4–5/10**
- DOMS **6–7/10**
- Caída de rendimiento **−5% a −9%**
- RIR < 2 en **≥2 series**
  Acción: **mantiene carga**; **no aplica +2.5%** esa semana.

**fatigue_high (crítico)** si se cumple:

- Dolor articular **≥6/10**
- Sueño **≤3/10**
- Energía **≤3/10**
- Caída de rendimiento **≤ −10%** (o “≥10% de caída”)
- RIR < 1 no planificado
  Acción: **reduce carga −10%** y puede disparar deload parcial o completo.

**focus_low (cognitivo)**:

- Baja concentración o motivación
  Acción: IA puede **reducir serie analítica** o proponer **descanso activo**.

Nota explícita: **DOMS alto sin dolor articular NO es crítico**.

**Requisitos (auditoría):**

- `AI-FAT-01` Debe existir almacenamiento de inputs subjetivos (sueño/energía/DOMS/dolor articular/focus).
- `AI-FAT-02` Debe existir un cálculo objetivo de “caída de rendimiento %” (definir métrica en el sistema).
- `AI-FAT-03` La lógica de clasificación debe producir flags con severidad (light/high/cognitive).

### 2.2 Acciones por flags (sin alterar volumen salvo deload)

- `AI-FAT-04` **1 leve**: mantener intensidades base; **no** aplicar +2.5%.
- `AI-FAT-05` **≥2 leves** o **1 crítico**: congelar progresión (**0%**) y reducir intensidad **−5%** en la sesión afectada; además cap a **70%** en días 4–5.
- `AI-FAT-06` **≥2 críticos**: deload inmediato (**−30% carga / −50% volumen**).

### 2.3 Coherencia con el Módulo de Prioridad

- `AI-FAT-07` Si hay flag leve en músculo prioritario (P): **eliminar top set esa semana**.
- `AI-FAT-08` Si hay flag crítico en P: **desactivar prioridad** y volver a baseline.
- `AI-FAT-09` En no prioritarios (NP): mantener 75–77.5% (días 1–3) y 70% (días 4–5), progresión congelada.
- `AI-FAT-10` **Nunca** combinar prioridad con deload.

### 2.4 Solapamiento neural (muscle_overlap)

Evita entrenar patrones similares de alta demanda en días consecutivos.

- **Parcial (sinergistas)**: ejemplo Press militar → Press banca → reducir **−2.5%** el día 2.
- **Alto (patrón similar)**: ejemplo Remo → RDL → reducir **−5%** o congelar progresión.

Nota RDL: si RDL aparece tras tirón/lumbar pesado, reducir carga **2.5–5%**.

**Requisitos (auditoría):**

- `AI-OVL-01` Debe existir detección de solapamiento (al menos: none/partial/high o boolean + severidad).
- `AI-OVL-02` Debe existir ajuste automático de carga por solapamiento, incluyendo el caso RDL (2.5–5%).

### 2.5 Transición automática entre bloques (Adaptación → Hipertrofia o repetir)

La IA transiciona cuando se cumplen **los 3 criterios**:

- Adherencia **≥80%**
- Técnica: flags técnicos **≤1/semana**
- Progreso: carga media **≥ +8%**

Si se cumplen: finaliza bloque, guarda cargas como baseline del siguiente y notifica transición.

Si no: repite bloque con **−10%** cargas iniciales y progresión cap **+2%/sem**.

**Requisitos (auditoría):**

- `AI-TR-01` Debe existir `technical_flags_count_per_week` o equivalente.
- `AI-TR-02` Debe existir cálculo de progreso de carga media (baseline vs actual).
- `AI-TR-03` Al repetir por transición fallida, las cargas iniciales deben bajar 10% y la progresión semanal debe caparse a 2%.

### 2.6 Lógica IA (resumen del PDF)

```pseudo
weekly_flags = collect_flags()
if weekly_flags.criticals >= 2:
  start_deload()  # -30% carga, -50% volumen
elif weekly_flags.criticals >= 1 or weekly_flags.lights >= 2:
  freeze_all_progression()
  reduce_intensity(session=affected, by=0.05)
  cap_light_days(to=0.70)

if PRIORITY_ACTIVE:
  if has_light_flag(PRIORITY): remove_top_set(PRIORITY)
  if has_critical_flag(PRIORITY): deactivate_priority(); restore_baseline()

if muscle_overlap == 'partial': reduce_intensity(next_session, 0.025)
elif muscle_overlap == 'high': reduce_intensity(next_session, 0.05); freeze_session_progression()

if can_progress and mean_RIR >= 3 and not fatigue_high:
  load *= 1.025
```

---

## 3) PDF: Bloque de Hipertrofia — Nivel Principiante (Frecuencia 2 / Progresión por Intensidad)

### 3.1 Parámetros base del bloque

- Duración: **10–12 semanas**
- Semana 0 (calibración): **70% 1RM** (sin progresión) — ajuste técnico y medición de RIR.
- Frecuencia: **2 estímulos por grupo muscular/semana**
- Días de entrenamiento: **5** (rotativos). IA gestiona orden según sesiones completadas.
- Intensidad: Días 1–3 → **80% 1RM** | Días 4–5 → **70–75% 1RM**
- Progresión: **+2.5% semanal** si mean_RIR **≥3** y **sin fatiga**.
- RIR objetivo: **2–3** (sin llegar al fallo).
- Reps: **8–12 (fijo)**
- Descansos: Multi 90s | Uni 60s | Analítico 45–60s
- Deload: automático **semana 6** o por fatiga detectada (**−30% carga / −50% volumen**).
- Orden ejercicios: **Multi → Uni → Analítico**
- Volumen: **fijo** durante todo el bloque (sin progresión por series).

**Requisitos (auditoría):**

- `AI-HYP-01` Debe existir “Semana 0” de calibración a 70% sin progresión.
- `AI-HYP-02` Días 1–3 deben fijarse a 80% y días 4–5 a 70–75%.
- `AI-HYP-03` Reps objetivo 8–12 y RIR 2–3 deben estar definidos por set/ejercicio.
- `AI-HYP-04` Deload semana 6 o por fatiga debe reflejar -30% carga y -50% volumen.
- `AI-HYP-05` Volumen fijo: mismas series/ejercicios durante el bloque (solo cambia carga).

### 3.2 Series efectivas estimadas (por semana)

| Grupo            | Series/sesión | Series/semana | Observaciones                      |
| ---------------- | ------------: | ------------: | ---------------------------------- |
| Pectoral         |           5–6 |         10–12 | 2 multi + 1 analítico              |
| Espalda (dorsal) |           5–6 |         10–12 | 2 multi + 1 analítico              |
| Piernas          |           6–7 |         12–14 | 3 multi/unilaterales + 1 analítico |
| Hombros          |           4–5 |          8–10 | 1 multi + 1–2 analíticos           |
| Bíceps           |           3–4 |           6–8 | 1 multi + 1 analítico              |
| Tríceps          |           3–4 |           6–8 | 1 multi + 1 analítico              |
| Core             |           3–4 |           6–8 | Control y estabilidad              |

**Requisito (auditoría):**

- `AI-HYP-06` El generador de sesiones debe aproximarse a estos rangos (si vuestro sistema fija exactamente, documentar la desviación).

### 3.3 Estructura semanal rotativa (5 días)

| Día | Enfoque                           | Carga relativa |                                      |
| --: | --------------------------------- | -------------: | ------------------------------------ |
|   1 | Pecho + Tríceps                   |            80% | Empuje principal                     |
|   2 | Espalda + Bíceps                  |            80% | Tirón principal                      |
|   3 | Piernas completas                 |            80% | Tren inferior                        |
|   4 | Pecho + Tríceps                   |         70–75% | Empuje frecuencia 2 (ligero)         |
|   5 | Espalda + Bíceps + Hombros + Core |         70–75% | Tirón frecuencia 2 + complementarios |
|   6 | Reinicio ciclo                    |              — | IA retoma orden automáticamente      |

**Requisitos (auditoría):**

- `AI-HYP-07` La rotación debe continuar aunque el usuario no complete todas las sesiones (orden por sesiones completadas).

### 3.4 Lógica IA del bloque (según PDF)

```pseudo
# Progresión
if mean_RIR >= 3 and fatigue_flag == False:
  load *= 1.025
elif fatigue_flag == True or week == 6:
  load *= 0.9  # deload automático

# Solapamiento
if muscle_overlap == True:
  load *= 0.9

# Volumen
volume = constante
```

**Nota importante para auditoría:** este PDF usa `muscle_overlap == True → load*0.9`, mientras que el PDF de solapamiento define `partial/high` con -2.5%/-5% y “freeze_session_progression”. Si en backend existe severidad, **debe mapearse** de forma coherente.

### 3.5 Restricción adicional explícita

- **Sin variación de ejercicios dentro del bloque**; solo ajuste de carga.
- Transición directa al bloque intermedio tras semana 12.

**Requisitos (auditoría):**

- `AI-HYP-08` Confirmar si la BD registra un “banco de ejercicios” pero mantiene selección fija por bloque (no recombina).
- `AI-HYP-09` Debe existir evento de transición a “intermedio” tras semana 12 (si bloque dura 12).

---

## 4) PDF: Módulo de Priorización por Intensidad — Nivel Principiante

### 4.1 Objetivo y definiciones

- Priorizar temporalmente **un solo músculo** estancado o elegido manualmente, **sin cambiar volumen**, ajustando solo **intensidad**.
- P = músculo prioritario (máximo 1). NP = resto.
- Frecuencia se mantiene (2 estímulos/sem). Progresión base del bloque = +2.5%/sem.

**Requisitos (auditoría):**

- `AI-PRIO-01` Solo debe existir 1 músculo prioritario activo por usuario en un momento dado.
- `AI-PRIO-02` Activar/desactivar prioridad debe quedar registrado (evento, motivo, músculo, fechas).

### 4.2 Intensidades base del bloque (referencia)

- Días 1–3: 80% 1RM
- Días 4–5: 70–75% 1RM
- RIR objetivo general: 2–3

### 4.3 Reglas para el músculo prioritario (P)

**Carga:**

- Días 1–3: mantener 80% y, si `mean_RIR_P >= 3` la semana anterior, convertir **una serie por semana** (NO por sesión) en **top set a 82.5%**.
- Solo **1 top set semanal** durante las **primeras 4 semanas** del bloque.
- Si técnica estable y sin fatiga local tras 2 semanas, el top set puede subir hasta **85%**.
- Días 4–5: mantener 70–75% (no superar este rango en principiantes).

**Progresión semanal (P):**

- Base: +2.5%
- Puede ser +3.5% si `mean_RIR_P >= 3` y **sin flags**
- Puede ser −2.5% si `mean_RIR_P <= 2` o hay **fatiga local**

**RIR objetivo (P):** sesgar a **RIR = 2**.

- Si la IA detecta **2 correcciones técnicas** en el mismo músculo en una sesión, bloquea incremento de carga la semana siguiente.

**Requisitos (auditoría):**

- `AI-PRIO-03` Top set: máximo 1/semana, 82.5% inicialmente (hasta 85% si condiciones).
- `AI-PRIO-04` El incremento semanal de P puede ser 2.5% o 3.5% o -2.5% según reglas.
- `AI-PRIO-05` Debe existir registro de “correcciones técnicas” por músculo/sesión.

### 4.4 Reglas para no prioritarios (NP)

- Días 1–3: reducir a **75–77.5%** (−2.5 a −5%).
- Días 4–5: fijar en **70%**.
- Progresión NP: **congelada (0%)** durante prioridad.
- Solo reactivar progresión si `mean_RIR_NP >= 4` durante **2 semanas consecutivas**.
- RIR objetivo NP: sesgar a **3** para liberar capacidad de recuperación hacia P.

**Requisitos (auditoría):**

- `AI-PRIO-06` NP deben bajar intensidad y congelar progresión mientras prioridad activa.
- `AI-PRIO-07` Reactivación de NP requiere 2 semanas consecutivas con mean_RIR_NP >=4 (si esto se implementa).

### 4.5 Duración del énfasis y salida

- Duración: **2–3 semanas consecutivas**.
- Éxito: mejora **≥ +3%** en carga o reps al mismo RIR.
- Si no mejora tras 3 semanas: mantener 1 microciclo adicional o recomendar cambio de ejercicio.
- Al terminar: volver a intensidades base (80% días 1–3 / 70–75% días 4–5).

### 4.6 Salvaguardas

1. Solo 1 músculo prioritario activo a la vez.
2. No activar prioridad durante deload.
3. Si hay solapamiento neural (ej. espalda pesada y RDL al día siguiente): reducir **−2.5%** en sesión afectada.
4. Tope agresividad: máximo 1 top set por músculo prioritario y por semana.
5. Si técnica deficiente o fatiga articular: suspender modo énfasis inmediatamente.

---

## 5) PDF: Volumen y Estructura (reglas operativas generales)

### 5.1 Condiciones estándar del sistema (referencia general)

- Frecuencia fija: 2 veces por grupo muscular/semana
- Intensidad media: ~80% 1RM
- Margen de esfuerzo: RIR 2–3

### 5.2 Escala de volumen por nivel (frecuencia 2)

| Nivel        | Series efectivas/músculo/semana | Series/músculo/sesión | Ejercicios por músculo/sesión (promedio) | Series totales/día (2 grupos) |
| ------------ | ------------------------------: | --------------------: | ---------------------------------------- | ----------------------------: |
| Principiante |                           10–12 |                   5–6 | 2 ejercicios (3 series c/u)              |                         10–12 |
| Intermedio   |                           14–20 |                  7–10 | 3 ejercicios (3–4 series c/u)            |                         14–20 |
| Avanzado     |                           18–25 |                  9–12 | 4 ejercicios (3 series c/u)              |                         18–24 |

**Notas operativas del PDF:**

- Todo entrenamiento incluye **al menos 1 multiarticular por grupo muscular**.
- “El incremento de volumen será gradual a lo largo de las 10–12 semanas del bloque”.
- La IA ajusta el volumen dentro de cada rango según rendimiento, fatiga y adherencia.

### 5.3 Estructura de la sesión — orden obligatorio

Regla: **Multiarticulares → Unilaterales → Analíticos**, estrictamente, independientemente del número total de ejercicios.

| Tipo             | Posición en sesión | Cantidad estimada |
| ---------------- | ------------------ | ----------------: |
| Multiarticulares | 1º y 2º            |                 2 |
| Unilaterales     | 3º y 4º            |                 2 |
| Analíticos       | 5º y 6º            |               1–2 |

### 5.4 Ejemplo (pierna completa)

Incluye alternancia cuádriceps/femoral manteniendo orden Multi→Uni→Analítico:

1. Multi quad (sentadilla/prensa) → 2) Multi femoral (RDL) → 3) Uni quad (zancadas/step-up) → 4) Uni femoral (curl una pierna) → 5) Analítico quad (extensión) → 6) Analítico femoral (curl).

**Requisitos (auditoría):**

- `AI-STR-01` El generador debe respetar el orden Multi→Uni→Analítico en todas las sesiones.
- `AI-STR-02` En pierna completa, alternancia quad/femoral puede existir, pero nunca rompe el orden de categorías.

---

## 6) Puntos de coherencia / conflictos potenciales (para que el agente lo valide)

### 6.1 Volumen “fijo” vs “incremento gradual”

- El PDF de Hipertrofia Principiante dice: **volumen fijo durante todo el bloque** y “sin variación de ejercicios”.
- El PDF de Volumen y Estructura dice: “el incremento de volumen será gradual a lo largo de las 10–12 semanas”.

**Recomendación de auditoría:** tratar la norma **más específica** (Hipertrofia Principiante) como prioridad para ese bloque. El agente debe comprobar qué hace el sistema hoy:

- Si actualmente el volumen cambia semana a semana en el bloque principiante → podría estar **incumpliendo** Hipertrofia Principiante.
- Si el volumen es fijo en principiante pero variable en otros niveles → probablemente está OK.

### 6.2 Solapamiento: boolean vs severidad

- Hipertrofia Principiante usa `muscle_overlap == True` → `load *= 0.9` (−10%).
- Fatiga/Solapamiento define severidades: `partial` (−2.5%), `high` (−5% y/o freeze).

**Recomendación:** si existe severidad, mapear:

- partial → −2.5%
- high → −5% (+ freeze_session_progression)
- y solo usar −10% si el backend lo decidió como “fallback”.

---

## 7) Checklist de verificación (BD/Backend) — guía práctica para el agente

> Esta sección es intencionalmente _schema-agnostic_. El agente debe mapear a vuestra BD (Supabase/Postgres/etc.).

### 7.1 Onboarding y asignación del bloque

- [ ] `CHK-01` Para usuarios nuevos: existe registro de `age`, `level`, `months_inactive` (o equivalente).
- [ ] `CHK-02` Se asigna exactamente 1 tag inicial (`novato_total` / `readaptacion_mayor` / `reacondicionamiento_prev`).
- [ ] `CHK-03` Frecuencia/duración generadas coinciden con tabla del bloque de Adaptación.

### 7.2 Generación de sesiones (plantillas y parámetros)

- [ ] `CHK-04` Full Body: 8 ejercicios, 2–3 vueltas, 10–15 reps, 65–70% 1RM, RIR 3–4.
- [ ] `CHK-05` Half Body: patrón A/B/A/B/A, 75–80% 1RM, RIR 2–3, 8–12 reps (analíticos 12–15 donde aplica).
- [ ] `CHK-06` Descansos por edad: se aplican (30–60/2–3, 45–90/3–4, 60–120/4–5) o existe override documentado.

### 7.3 Métricas necesarias (si faltan, no se puede cumplir la lógica)

- [ ] `CHK-07` Adherencia: se puede calcular por bloque y por semana.
- [ ] `CHK-08` mean_RIR: se puede calcular por semana (y por músculo si hay prioridad).
- [ ] `CHK-09` Rendimiento %: existe métrica para “caída de rendimiento −5% / −10%”. (Si no existe, flags objetivos están incompletos.)
- [ ] `CHK-10` Flags técnicos: existe conteo semanal (para transición ≤1/semana).

### 7.4 Progresión, freeze y deload

- [ ] `CHK-11` En Hipertrofia: aplicar +2.5% solo si mean_RIR>=3 y no fatiga.
- [ ] `CHK-12` Si 1 fatigue_light: NO aplicar +2.5%.
- [ ] `CHK-13` Si ≥2 lights o 1 critical: freeze (0%) + −5% sesión afectada + cap 70% días 4–5.
- [ ] `CHK-14` Si ≥2 criticals o semana 6: deload (−30% carga y −50% volumen).

### 7.5 Solapamiento neural

- [ ] `CHK-15` Detecta partial/high (o equivalente) y ajusta cargas (−2.5% / −5% / freeze).
- [ ] `CHK-16` Regla específica RDL: tras tirón/lumbar pesado → reducir 2.5–5%.

### 7.6 Transiciones de bloque

- [ ] `CHK-17` Adaptación → Hipertrofia: si adherence<0.6 o mean_RIR>4 → repetir una vez; si no → avanzar.
- [ ] `CHK-18` Criterios de transición: adherence>=80%, tech_flags<=1/sem, progress>=+8% → avanzar; si no → repetir con -10% inicial y cap +2%/sem.
- [ ] `CHK-19` Se guardan baselines al transicionar.

### 7.7 Módulo de prioridad por intensidad

- [ ] `CHK-20` Solo 1 músculo prioritario activo, duración 2–3 semanas.
- [ ] `CHK-21` Top set: 1/semana (primeras 4 semanas), 82.5% (hasta 85%).
- [ ] `CHK-22` P puede progresar +3.5% si mean_RIR_P>=3 y sin flags; puede bajar -2.5% si mean_RIR_P<=2 o fatiga local.
- [ ] `CHK-23` NP bajan a 75–77.5% en días 1–3 y 70% en días 4–5; progresión NP congelada.
- [ ] `CHK-24` Si fatigue_light en P → remove top set; si fatigue_high en P → desactivar prioridad y restore baseline.
- [ ] `CHK-25` Prioridad NO activa durante deload.

---

## 8) Sugerencia de entregable del agente (formato de reporte)

Para cada requisito `AI-*`, el agente debería devolver algo así:

```md
### AI-HYP-04 — Deload semana 6 o por fatiga (-30% carga / -50% volumen)

- Estado: ❌ No cumple
- Evidencia:
  - user_id=..., plan_id=..., week=6: carga bajó 10% pero volumen no bajó 50%
  - sesiones afectadas: session_id=..., ...
- Hipótesis:
  - deload implementado solo por carga, falta reducir sets/series programadas
- Acción recomendada:
  - aplicar factor de volumen 0.5 a `planned_sets` y/o `exercises` en deload week
```

---

## 9) Apéndice: pseudocódigos incluidos en PDFs

### 9.1 Adaptación → Hipertrofia

```pseudo
if adherence < 0.6 or mean_RIR > 4:
  repeat_block_once = True
else:
  advance_to("Hipertrofia_Frecuencia2")
```

### 9.2 Hipertrofia Principiante (carga/solapamiento/volumen)

```pseudo
if mean_RIR >= 3 and fatigue_flag == False: load *= 1.025
elif fatigue_flag == True or week == 6: load *= 0.9
if muscle_overlap == True: load *= 0.9
volume = constante
```

### 9.3 Flags + prioridad + solapamiento (resumen IA)

```pseudo
if criticals >= 2: start_deload()
elif criticals >= 1 or lights >= 2: freeze_progression(); reduce_intensity(-5%); cap_light_days(70%)
if PRIORITY_ACTIVE and light_flag(P): remove_top_set()
if PRIORITY_ACTIVE and critical_flag(P): deactivate_priority(); restore_baseline()
if overlap == partial: -2.5% next_session
if overlap == high: -5% next_session + freeze_session_progression
if can_progress and mean_RIR >=3 and not fatigue_high: +2.5%
```
