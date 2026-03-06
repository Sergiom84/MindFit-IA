# MindFeed / HipertrofiaV2 - endpoints vigentes

Fecha de revisión: 2026-03-06

## Fuente de verdad

- Router activo: `backend/routes/hipertrofiaV2.js`

Este documento resume la superficie actual de la API. Si necesitas payloads o validaciones exactas, revisa el router y los controladores importados.

## Grupos de endpoints

### Generación y selección

- `POST /api/hipertrofiav2/generate-d1d5`
- `POST /api/hipertrofiav2/generate-fullbody`
- `POST /api/hipertrofiav2/generate-single-day`
- `POST /api/hipertrofiav2/select-exercises`
- `POST /api/hipertrofiav2/select-exercises-by-type`

### Configuración y tracking de sesión

- `GET /api/hipertrofiav2/session-config/:cycleDay`
- `GET /api/hipertrofiav2/session-config-all`
- `POST /api/hipertrofiav2/save-set`
- `GET /api/hipertrofiav2/session-summary/:sessionId`

### Ciclo y progresión

- `GET /api/hipertrofiav2/cycle-status/:userId`
- `POST /api/hipertrofiav2/advance-cycle`
- `POST /api/hipertrofiav2/apply-progression`
- `GET /api/hipertrofiav2/progression/:userId/:exerciseId`
- `POST /api/hipertrofiav2/update-progression`

### Deload y prioridad

- `GET /api/hipertrofiav2/check-deload/:userId`
- `POST /api/hipertrofiav2/activate-deload`
- `POST /api/hipertrofiav2/deactivate-deload`
- `POST /api/hipertrofiav2/activate-priority`
- `POST /api/hipertrofiav2/deactivate-priority`
- `GET /api/hipertrofiav2/priority-status/:userId`

### Solapamiento, fatiga, warmup y reevaluación

- `POST /api/hipertrofiav2/check-neural-overlap`
- `GET /api/hipertrofiav2/current-session-with-adjustments/:userId/:cycleDay`
- `POST /api/hipertrofiav2/submit-fatigue-report`
- `GET /api/hipertrofiav2/fatigue-status/:userId`
- `POST /api/hipertrofiav2/apply-fatigue-adjustments`
- `POST /api/hipertrofiav2/detect-auto-fatigue`
- `GET /api/hipertrofiav2/fatigue-history/:userId`
- `POST /api/hipertrofiav2/save-warmup-completion`
- `GET /api/hipertrofiav2/check-warmup-reminder/:userId/:exerciseId/:sessionId`
- `GET /api/hipertrofiav2/check-reevaluation/:userId`
- `POST /api/hipertrofiav2/accept-reevaluation`
- `POST /api/hipertrofiav2/trigger-reevaluation`

## Notas

- El antiguo documento por fases se ha consolidado aquí para evitar duplicidad.
- No asumas que los ejemplos antiguos siguen siendo válidos sin comprobar el router.
