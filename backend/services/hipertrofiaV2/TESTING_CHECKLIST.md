# Checklist vigente de validación - HipertrofiaV2

Fecha de revisión: 2026-03-06

## Alcance

Usa este checklist como guía manual de validación. No asume puertos legacy ni estructuras ya retiradas.

## Precondiciones

- Backend disponible en `http://localhost:3010`
- Usuario autenticado
- Datos de HipertrofiaV2 presentes en la base

## Endpoints principales a validar

### Generación

- `POST /api/hipertrofiav2/generate-d1d5`
- `POST /api/hipertrofiav2/generate-fullbody`
- `POST /api/hipertrofiav2/generate-single-day`

### Selección y sesiones

- `POST /api/hipertrofiav2/select-exercises`
- `POST /api/hipertrofiav2/select-exercises-by-type`
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

### Deload, prioridad y fatiga

- `GET /api/hipertrofiav2/check-deload/:userId`
- `POST /api/hipertrofiav2/activate-deload`
- `POST /api/hipertrofiav2/deactivate-deload`
- `POST /api/hipertrofiav2/activate-priority`
- `POST /api/hipertrofiav2/deactivate-priority`
- `GET /api/hipertrofiav2/priority-status/:userId`
- `POST /api/hipertrofiav2/submit-fatigue-report`
- `GET /api/hipertrofiav2/fatigue-status/:userId`
- `POST /api/hipertrofiav2/apply-fatigue-adjustments`
- `POST /api/hipertrofiav2/detect-auto-fatigue`
- `GET /api/hipertrofiav2/fatigue-history/:userId`

### Solapamiento, warmup y reevaluación

- `POST /api/hipertrofiav2/check-neural-overlap`
- `GET /api/hipertrofiav2/current-session-with-adjustments/:userId/:cycleDay`
- `POST /api/hipertrofiav2/save-warmup-completion`
- `GET /api/hipertrofiav2/check-warmup-reminder/:userId/:exerciseId/:sessionId`
- `GET /api/hipertrofiav2/check-reevaluation/:userId`
- `POST /api/hipertrofiav2/accept-reevaluation`
- `POST /api/hipertrofiav2/trigger-reevaluation`

## Criterios mínimos

- Las rutas deben responder con autenticación correcta.
- La generación de planes no debe romper calendario ni persistencia.
- El ciclo debe avanzar sin saltos inconsistentes.
- Fatiga, deload y prioridad deben dejar trazabilidad coherente en base de datos.
- Los endpoints de warmup y reevaluación deben reflejar el estado real del usuario.

## Referencias

- `backend/routes/hipertrofiaV2.js`
- `backend/services/hipertrofiaV2/README.md`
- `backend/MINDFEED_ENDPOINTS.md`
