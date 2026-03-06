# Roadmap operativo actual

Fecha de revisión: 2026-03-06

## Estado base confirmado en `main`

- La arquitectura consolidada de entrenamiento ya está operativa en `backend/server.js`.
- Nutrición V2 ya no está en fase puramente planificada:
  - persiste `nutrition_meal_items`,
  - devuelve ítems en el plan activo,
  - tiene catálogo filtrable,
  - expone factores de conversión,
  - y permite generar menús por día desde la UI.
- `FoodDatabase.jsx` permanece fuera del flujo principal, por lo que hoy conviven una base integrada en backend y un componente estático no conectado.
- La línea de trabajo activa en `docs/_active.md` sigue siendo `sistema-menus-profesional-omni-veg`, actualmente en fase 5.

## Prioridades vigentes

1. Revisar funcionalmente los menús generados para ajustar UX, comestibilidad y reglas finas sin romper las métricas objetivo del sistema.
2. Mantener alineados calendario, persistencia de `nutrition_meal_items`, swaps y compatibilidad de alimentos.
3. Decidir si `FoodDatabase.jsx` se integra contra API o se retira para evitar una segunda fuente de verdad.
4. Mantener la documentación raíz breve y actual; los planes detallados y checklists deben vivir en `docs/`.

## Fuentes de verdad para seguimiento

- `docs/_active.md`
- `docs/sistema-menus-profesional-omni-veg/implementation.md`
- `docs/sistema-menus-profesional-omni-veg/status.md`
- `docs/sistema-menus-profesional-omni-veg/checklist.md`
- `docs/REGISTRO_DIARIO_IMPLEMENTACIONES.md`

## Qué deja de aplicar

- Este roadmap sustituye el plan antiguo centrado en la rama `alimentos`.
- Ya no es correcto describir Nutrición V2 como un sistema que no persiste ítems o como una UI con menús deshabilitados.
