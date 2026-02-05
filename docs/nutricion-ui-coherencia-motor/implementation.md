# Implementación UI Nutrición coherente con motor v2

## Resumen

Alineamos la UI de Nutrición con el motor determinista v2 para evitar inconsistencias de cálculo, mejorar la claridad del perfil nutricional y ajustar la duración del plan a la programación real del entrenamiento cuando exista. Se añadió persistencia en la sincronización del perfil y se blindó el calendario desde backend para evitar problemas de timezone.

## Objetivo y alcance

- Alinear la UI con el motor v2 en cálculos y fuentes de datos.
- Hacer explícitas las discrepancias entre perfil general y perfil nutricional, con acciones claras.
- Persistir en BD la sincronización desde perfil general.
- Añadir ayuda contextual en “nivel de actividad”.
- Añadir opción para sincronizar duración con el plan de entrenamiento activo.
- Deshabilitar menús IA con badge “Próximamente”.
- Normalizar fechas del calendario en backend para evitar desfaces de timezone.

## No‑objetivos

- No persistir menús IA ni cambiar backend de generación de menús.
- No cambiar reglas del motor nutricional ni lógica del bridge.
- No modificar la generación de planes de entrenamiento.

## Decisiones tomadas (sesión actual)

- Duración: si hay plan activo, ofrecer “Sincronizar con mi plan actual” (días restantes) y ajustar también tipo de entrenamiento + calendario semanal. Si no hay plan activo, mantener presets y añadir nota de re‑generación.
- Comunicación de duración: mostrar “Plan hasta X fecha” + “Revisión automática cada 14 días”.
- Banner de discrepancias: mostrar diferencias específicas; acción “Sincronizar” guarda en BD y “Cancelar” oculta el banner.
- Fuente de verdad: para cálculos/generación manda el perfil nutricional v2 si existe; si no, fallback al perfil general. La sincronización guarda en BD para evitar discrepancias al recargar.
- Menús IA: botón deshabilitado con badge “Próximamente”.
- Kcal/día: preferir `estimaciones` del perfil v2; si faltan datos, mantener cálculo actual con nota de completar perfil.
- Kcal/día: priorizar el último plan nutricional activo si existe; fallback al perfil v2 solo si no hay plan activo.
- Planes nutricionales: al crear un plan nuevo, archivar los planes activos previos para mantener uno solo activo.
- Calendario entrenamiento: normalizar fechas (`YYYY-MM-DD`) en backend para evitar parsing inválido en UI.

## Arquitectura propuesta

- UI Nutrición (frontend):
  - `NutritionScreen.jsx`: usar `kcal_objetivo` del plan activo; fallback a perfil v2 si no hay plan.
- `NutritionPlanGenerator.jsx`: banner de discrepancias detallado con sincronización persistente, ayuda para actividad y opción de duración sincronizada con plan activo.
- `NutritionPlanGenerator.jsx`: mostrar “Plan hasta X fecha” + “Revisión automática cada 14 días” cuando hay plan activo.
- `NutritionPlanGenerator.jsx`: al sincronizar con plan activo, mapear `methodology_type` -> `training_type` y generar `training_schedule` día a día desde el calendario real (no patrón semanal fijo).
- `NutritionCalendarView.jsx`: botón “Menú del día” deshabilitado con badge “Próximamente”.
- `CheatMealManager.jsx`: renderizar compensación desde `compensation_plan.days`.
- Datos plan activo entrenamiento:
  - Usar `/api/routines/active-plan` para plan activo.
  - Usar `/api/routines/calendar-schedule/:planId` para obtener última fecha (normalizada), calendario semanal y calcular días restantes.
  - Fallbacks: si no hay plan o calendario, usar presets (7/14/21/28) y nota informativa.
- Backend:
- `calendar-schedule` normaliza `scheduled_date` a `YYYY-MM-DD` para evitar desfases de timezone en UI.
- `nutrition-v2` archiva planes activos previos al generar un plan nuevo.

## Plan por fases

### Fase 1 — Discrepancias y ayuda de actividad

**Entregables**

- Banner de discrepancias con detalle por campo.
- Acciones “Sincronizar” (solo UI) y “Cancelar”.
- Ayuda contextual para “nivel de actividad”: tooltip + texto dinámico.
- Texto explícito de fuente de verdad para cálculos (v2 si existe).

**Criterios de aceptación**

- El banner muestra qué campo difiere y los valores.
- Sincronizar actualiza el UI y oculta el banner; guardar es manual.
- La ayuda de actividad muestra pasos/entrenos por nivel.
- El banner aclara qué datos se usan realmente para calcular.

### Fase 2 — Duración del plan

**Entregables**

- Opción “Sincronizar con mi plan actual” cuando haya plan activo.
- Cálculo de días restantes basado en calendario real.
- Nota cuando no hay plan activo.
- Mostrar “Plan hasta X fecha” + “Revisión automática cada 14 días”.

**Criterios de aceptación**

- Si hay plan activo, se propone una duración calculada.
- Si no hay plan activo, se mantienen presets y aparece la nota.
- El usuario ve la fecha final y la cadencia de revisión automática.

### Fase 3 — Coherencia de cálculos y botones

**Entregables**

- Tarjeta de kcal/día alimentada por `estimaciones` v2.
- Fallback al cálculo actual con aviso si faltan datos.
- Botón “Menú del día” deshabilitado + badge “Próximamente”.
- Compensación semanal renderizada desde `compensation_plan.days`.

**Criterios de aceptación**

- Kcal/día coincide con estimaciones del motor cuando hay perfil.
- El botón de menú no ejecuta acción y muestra estado claro.
- Se ve el plan de compensación cuando existe.

## Riesgos y mitigaciones

- **Plan activo sin calendario**: usar fallback a duración por semanas o presets y mostrar nota.
- **Confusión por sincronizar UI sin guardar**: texto claro “pendiente de guardar” + fuente de verdad explícita.
- **Falta de tooltip UI**: usar un bloque inline simple si no hay componente de tooltip.

## Plan de despliegue / rollout

- Cambios en frontend y backend (normalización de fecha en calendario). No requiere migraciones.
- Validación manual en entorno local antes de publicar.

## Definition of Done

- UI alineada al motor v2 en kcal/día y plan.
- Banner de discrepancias claro y accionable.
- Duración sincronizable con plan activo.
- “Menú del día” activo y abre detalle del día.
- Checklist y tests de la fase completados.

## Outcome summary

### Qué se implementó

- La tarjeta de kcal/día ahora prioriza el `kcal_objetivo` del último plan nutricional activo; fallback a perfil v2 si no hay plan activo.
- Al generar un plan nutricional v2, se archivan los planes activos previos para mantener uno solo activo.

### Qué se cambió vs plan original

- El origen principal de kcal/día pasó de “estimaciones del perfil v2” a “plan nutricional activo” para reflejar el último plan generado.
- El botón “Menú del día” se mantiene activo y abre el detalle del día (no queda deshabilitado con “Próximamente”).

### Pendientes

- QA manual de Fases 1-3 en UI.

### Riesgos conocidos post-release

- Si existen planes activos múltiples históricos, la UI puede haber mostrado kcal inconsistentes antes de archivar; verificar que el flujo de generación deja un único plan activo.
