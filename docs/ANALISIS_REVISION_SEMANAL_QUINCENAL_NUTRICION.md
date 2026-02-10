# Análisis: Revisión Semanal/Quincenal de Nutrición (Anti-ruido + Adherencia)

Objetivo del análisis: contrastar tus necesidades de UX y lógica (revisión semanal/quincenal + anti-ruido + adherencia) frente a lo que ya hace el módulo actual y lo que veníamos alineando con `docs/mindfit_nutrition_system_spec_unified.md`.

## ¿Se puede adaptar para que funcione así?

Sí, se puede adaptar para que funcione exactamente como describes. Y sí: **ya tenemos partes**, pero ahora mismo están **repartidas** (y no “se sienten” como un sistema semanal/quincenal unificado).

## Qué ya hace la app hoy (parcialmente alineado con lo que pides)

- **Anti-ruido en progreso (tipo semáforo):** cuando metes mediciones, tenemos un análisis tipo ICG/IPG/IEC con confirmaciones para no reaccionar por una sola medición rara. Esto vive en el flujo de mediciones y el dashboard (`/api/body-measurements/progression-check` + `backend/services/icgIpgDetector.js`).
- **Recalibración cada 14 días (la idea está):** existe un sistema de “calibración” que mira una ventana de 14 días y puede proponer/aplicar ajustes de kcal (`backend/services/nutritionCalibrator.js` + `backend/routes/nutritionCalibration.js`). Por defecto, la configuración está pensada a **14 días**.
- **Tenemos “algo” de adherencia, pero legacy:** existe registro diario de kcal/macros por día en `app.daily_nutrition_log` (endpoints legacy `/api/nutrition/daily` y `/api/nutrition/week-stats`). Eso permite medir “% de días con registro”, pero hoy **no se usa** como condición obligatoria para ajustar kcal en el motor v2.

## Dónde NO estamos alineados con lo que pides (gaps claros)

- **1) Revisión semanal (estado, no acción):**
  - Hoy no hay un bloque único que diga “Vas bien / vas lento / vas rápido / datos insuficientes” basado en **tendencia semanal**.
  - Lo más parecido es el semáforo ICG/IPG/IEC, pero está más enfocado a “alertas y recomendaciones”, no a tu UX de revisión semanal simple y consistente.

- **2) Revisión quincenal (acción por defecto) con tu lógica exacta:**
  - El calibrador actual compara **14 días vs 14 días anteriores**, no “**media 7d semana A vs media 7d semana B**”.
  - No aplica tu regla de “**confirmación 2 semanas**” tal cual (dirección consistente semana a semana).
  - No exige **adherencia alta obligatoria** como gate (tu 80% + pesajes mínimos).
  - No aplica el límite “**máximo 10% de kcal objetivo**” (ahora usa escalones tipo 150/200 kcal).

- **3) Excepción: ajuste semanal solo “modo seguridad”:**
  - No existe esa capa de “solo si señal fuerte y sin banderas de ruido”.
  - Y, clave: **no tenemos bien modeladas** (en datos) banderas tipo viaje/enfermedad/sueño/retención; lo único parecido que podemos usar hoy como proxy es “hubo cheat/diet-break registrado” y “mediciones sospechosas”.

- **4) UI imprescindible (que “se sienta” alineado):**
  - Hoy no se muestra un bloque fijo con:
    - “Revisión semanal: OK/pendiente/datos insuficientes”
    - “Revisión quincenal: faltan X / pendiente 2ª semana / ajuste aplicado”
    - y el “por qué” con medias 7d, adherencia, etc.

## Cómo encaja con lo que veníamos haciendo (y con el spec)

- Tu propuesta es básicamente **la Fase 2 + Fase 5** de `docs/PLAN_ALINEACION_TOTAL_NUTRICION_SPEC.md`, pero mucho más concreta:
  - El spec ya habla de **cadencia semanal/quincenal** y de **anti-ruido** (y menciona “si adherencia alta”).
  - Lo que tú añades (y falta) es: **definición operativa de adherencia**, la comparación **7d vs 7d**, y la **UX** de revisión con estados y “pendiente 2ª semana”.

## Qué cambiaría para arreglarlo y alinearlo a tu resultado (a nivel diseño, sin picar código aún)

- **Unificar en un solo “motor de revisión”** (no tres cosas sueltas: semáforo por un lado, calibración por otro, evaluate v2 por otro).
- **Backend:**
  - Crear una salida única tipo “NutritionReview” que calcule:
    - medias **7d semana actual vs 7d semana anterior**
    - % cambio semanal y si está dentro del rango por fase
    - conteo de pesajes por semana/14 días
    - **adherencia** (% días con log en 7/14 días) usando `daily_nutrition_log` mientras no haya logging v2 mejor
    - cintura si existe (sin bloquear)
  - Decisión quincenal:
    - solo si **adherencia alta**
    - solo si la desviación es **consistente 2 semanas**
    - aplicar ±150–250 kcal pero con tope **<= 10%**
  - Excepción semanal “seguridad”:
    - exigir adherencia alta + pesajes suficientes
    - bloquear si hay “ruido” detectable (mínimo: diet-breaks/cheat en la semana, medición marcada sospechosa)
    - ajuste pequeño ±100–150 kcal
- **UI:**
  - Añadir en el dashboard un bloque fijo “Revisión” con los dos renglones (semanal/quincenal), contadores (“faltan X pesajes”, “adherencia 72%”), y cuando haya ajuste, mostrar “motivo + datos usados”.

## Decisiones que necesitamos cerrar antes de implementarlo (para no romper UX)

- Si exigimos adherencia con `daily_nutrition_log` pero el usuario no registra comidas/kcal, ¿aceptamos un “modo sin tracking” (solo peso) o siempre será “datos insuficientes”?
- Cuando se aplica un ajuste quincenal, ¿eso debe **regenerar el plan nutricional activo** automáticamente para que las cifras en pantalla coincidan, o solo actualizar el objetivo y sugerir “genera un nuevo plan”?

Si me confirmas esas 2 decisiones, el resto se puede implementar bastante directo con lo que ya hay.
