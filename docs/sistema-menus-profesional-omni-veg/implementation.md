# Implementación activa: sistema-menus-profesional-omni-veg

## Estado vigente

La base funcional ya está integrada en el código:

- semántica de alimentos y campos de catálogo en `app.foods`,
- reglas hard y penalties en el motor de `recipe_examples`,
- baseline y QA versionados en `backend/tests/fixtures/`,
- generación de menús diaria con smoke validado en la tanda activa,
- metadata de `hard_rules`, `pairing_penalty` y `palatability` en la respuesta del motor.

## Fuente de verdad funcional

- Plan maestro: `docs/PLAN_IMPLEMENTACION_SISTEMA_MENUS_PROFESIONAL_OMNI_VEG.md`
- Matriz de cobertura: `docs/MATRIZ_COBERTURA_MENUS_FASE1.md`
- Estado operativo: `docs/sistema-menus-profesional-omni-veg/status.md`
- Evidencias de test: `docs/sistema-menus-profesional-omni-veg/tests.md`

## Objetivo operativo actual

No hay una fase técnica abierta de implementación base. El foco actual es decidir si hace falta otra iteración sobre calidad culinaria y UX a partir de menús reales generados.

## Qué ya no describe este documento

- Ya no es correcto usar este documento para hablar de "fase 0 + fase 1" como trabajo pendiente.
- El motor profesional no está en arranque; está en una fase de afinado y validación funcional.

## Próximo criterio de avance

Abrir una nueva fase solo si la revisión manual detecta problemas repetidos de:

- coherencia culinaria,
- repetición no deseada,
- aceptación visual/UX del menú,
- o edge cases que no aparecieron en QA automatizado.
