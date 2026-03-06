# Validación actual del sistema de adaptación

Fecha de revisión: 2026-03-06

## Alcance real

- Backend: `backend/routes/adaptationBlock.js`
- Frontend: `src/components/Methodologie/methodologies/HipertrofiaV2/components/AdaptationProgressPanel.jsx`
- Frontend: `src/components/Methodologie/methodologies/HipertrofiaV2/components/AdaptationTransitionModal.jsx`
- Este flujo no tiene una prueba E2E dedicada en la raíz; la validación sigue siendo manual o apoyada por SQL/API.

## Precondiciones

- Backend disponible en `http://localhost:3010`
- Usuario autenticado
- Tablas de adaptación e historial de series accesibles en la base de datos

## Flujo API a validar

1. Crear bloque:

```bash
curl -X POST http://localhost:3010/api/adaptation/generate ^
  -H "Authorization: Bearer <token>" ^
  -H "Content-Type: application/json" ^
  -d "{\"blockType\":\"full_body\"}"
```

2. Consultar progreso:

```bash
curl http://localhost:3010/api/adaptation/progress ^
  -H "Authorization: Bearer <token>"
```

3. Forzar autoevaluación semanal:

```bash
curl -X POST http://localhost:3010/api/adaptation/auto-evaluate-week ^
  -H "Authorization: Bearer <token>" ^
  -H "Content-Type: application/json" ^
  -d "{}"
```

4. Consultar decisión de transición:

```bash
curl http://localhost:3010/api/adaptation/evaluate ^
  -H "Authorization: Bearer <token>"
```

5. Ejecutar transición solo si `is_ready = true`:

```bash
curl -X POST http://localhost:3010/api/adaptation/transition ^
  -H "Authorization: Bearer <token>" ^
  -H "Content-Type: application/json" ^
  -d "{\"blockId\":<adaptation_block_id>}"
```

## Consultas SQL útiles

```sql
SELECT id, user_id, block_type, duration_weeks, status, start_date, transitioned_to_hipertrophy
FROM app.adaptation_blocks
WHERE user_id = <user_id>
ORDER BY created_at DESC
LIMIT 1;

SELECT week_number, sessions_completed, mean_rir, technique_flags_count, weight_progress_percentage,
       adherence_met, rir_met, technique_met, progress_met
FROM app.adaptation_criteria_tracking
WHERE adaptation_block_id = <adaptation_block_id>
ORDER BY week_number;

SELECT COUNT(*) AS total_sets
FROM app.hypertrophy_set_logs
WHERE user_id = <user_id>;
```

## Señales esperadas en UI

- Si existe bloque activo, el panel de progreso debe aparecer dentro del flujo de entrenamiento correspondiente.
- Tras la evaluación, el modal debe distinguir entre estado listo para transición y estado no listo.
- La fuente de verdad es la respuesta del backend; evita asumir usuarios, fechas o payloads históricos.

## Notas

- Esta guía sustituye la versión antigua con usuarios fijos, fechas concretas y supuestos de una sesión de test ya cerrada.
- Si cambian umbrales o payloads, la referencia válida es `backend/routes/adaptationBlock.js` y las funciones SQL asociadas.
