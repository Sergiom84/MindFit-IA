# HipertrofiaV2 - servicios y estructura actual

Fecha de revisión: 2026-03-06

## Fuente de verdad

- Router activo: `backend/routes/hipertrofiaV2.js`
- Servicios activos: `backend/services/hipertrofiaV2/`

Este documento describe el estado actual del módulo, no una fotografía de una refactorización pasada.

## Estructura confirmada

Archivos activos en `backend/services/hipertrofiaV2/`:

- `constants.js`
- `logger.js`
- `exerciseSelector.js`
- `calendarService.js`
- `sessionService.js`
- `planGenerationService.js`
- `extraWorkoutService.js`
- `sqlControllers.js`
- `additionalControllers.js`
- `menstrualExerciseFilter.js`
- `rulesetService.js`
- `adaptation/`
- `index.js`
- `TESTING_CHECKLIST.md`

## Notas de estado

- `backend/routes/hipertrofiaV2.js` sigue siendo el punto de entrada de la API del módulo.
- El router delega la mayor parte de la lógica a servicios y controladores, pero la firma real de endpoints siempre debe verificarse en el router.
- Existe un archivo `rulesetService 2.js` en el directorio que no forma parte del wiring actual; no debe tomarse como fuente de verdad funcional.

## Qué cubre el módulo

- generación de planes D1-D5,
- sesiones extra (`fullbody`, `single-day`),
- selección de ejercicios,
- estado de ciclo, progresión y deload,
- prioridad muscular,
- solapamiento neural,
- flags de fatiga,
- warmup tracking,
- reevaluación,
- y utilidades asociadas al flujo MindFeed.

## Cómo validar cambios

- Revisar `backend/routes/hipertrofiaV2.js`
- Revisar `backend/services/hipertrofiaV2/TESTING_CHECKLIST.md`
- Ejecutar los tests y scripts concretos que apliquen al cambio

## Criterio documental

- Si este README contradice al router o a los servicios importados por él, prevalece el código.
