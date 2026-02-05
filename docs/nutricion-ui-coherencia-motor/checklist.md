# Checklist — UI Nutrición coherente con motor v2

## Fase 1 — Discrepancias y ayuda de actividad

### Tareas

- [x] Mostrar banner de discrepancias con campos y valores específicos.
- [x] Añadir botones “Sincronizar” (guarda en BD) y “Cancelar” (oculta banner).
- [x] Añadir ayuda contextual de nivel de actividad (tooltip + texto dinámico).
- [x] Añadir texto de “fuente de verdad” para cálculos (v2 vs perfil general).

### Tests

- [ ] Validar que al sincronizar se guarda en BD y no reaparece al volver a la pestaña.
- [ ] Validar que cancelar oculta banner sin cambios.
- [ ] Validar que la ayuda de actividad muestra los rangos correctos.
- [ ] Validar que el banner explica qué datos se usan para calcular.

### Notas/decisiones

- Pendiente de decisión: si mostrar confirmación explícita post‑sync en el banner.
- Recomendación: usar mensaje “Perfil nutricional guardado correctamente”.

### Gate: tests de fase pasados

- [ ] Sí / No

---

## Fase 2 — Duración del plan

### Tareas

- [x] Detectar plan activo y su calendario real.
- [x] Calcular días restantes y ofrecer botón “Sincronizar con mi plan actual”.
- [x] Al sincronizar, ajustar tipo de entrenamiento y calendario diario desde el plan activo.
- [x] Mantener presets si no hay plan activo y mostrar nota.
- [x] Mostrar “Plan hasta X fecha” + “Revisión automática cada 14 días”.

### Tests

- [ ] Con plan activo: duración sugerida correcta.
- [ ] Con plan activo: tipo de entrenamiento y calendario diario se sincronizan.
- [ ] Sin plan activo: presets disponibles + nota informativa.
- [ ] Mostrar fecha final y revisión automática cada 14 días.
- [ ] Calendario devuelve fechas parseables (sin “Invalid Date”).

### Notas/decisiones

- Pendiente de decisión: qué fallback usar si el calendario viene vacío.
- Recomendación: usar duración por semanas del plan si existe.

### Gate: tests de fase pasados

- [ ] Sí / No

---

## Fase 3 — Coherencia de cálculos y botones

### Tareas

- [x] La tarjeta kcal/día prioriza el último plan activo (fallback a perfil v2).
- [x] Si faltan datos, mostrar cálculo actual + nota de completar perfil.
- [x] “Menú del día” activo y abre el detalle del día.
- [x] Mostrar compensación semanal desde `compensation_plan.days`.
- [x] Al crear un plan, archivar planes activos previos del usuario.

### Tests

- [ ] Kcal/día coincide con el último plan activo generado.
- [ ] Sin perfil: nota de completar perfil visible.
- [ ] “Menú del día” navega al detalle del día.
- [ ] Compensación semanal se renderiza con datos reales.
- [ ] Al generar un nuevo plan, solo queda 1 plan activo (el último).

### Notas/decisiones

- Pendiente de decisión: copy exacto para la nota de perfil incompleto.
- Recomendación: “Completa tu perfil para una recomendación precisa de kcal diarias.”

### Gate: tests de fase pasados

- [ ] Sí / No
