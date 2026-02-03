# Seguimiento implementacion ciclo menstrual v3

Objetivo: llevar el estado de avance por fases y servir como memoria persistente.

## Estado actual

- Fecha inicio:
- Fase en curso: 7 (QA final + documentacion)
- Responsable:
- Bloqueos:

## Bitacora (append-only)

### Plantilla de entrada

- Fecha:
- Fase:
- Cambios aplicados:
- Migraciones:
- Scripts ejecutados + resultado:
- Evidencias (logs, IDs, etc):
- Pendientes:

### 02.02.2026

- Fase: 1 (Datos y migraciones)
- Cambios aplicados:
  - Nueva migracion v3 con columnas, constraints, historial de ciclos y tabla exercise_tags.
  - Backfill conservador 1-5 -> 0-3 para logs existentes.
- Migraciones:
  - backend/migrations/20260202_menstrual_cycle_v3.sql (aplicada en Supabase).
- Scripts ejecutados + resultado:
  - node scripts/test-menstrual-cycle-db.mjs -> OK (cargando .env/.env backend).
  - Verificacion via Supabase SQL: columnas, tablas y constraints OK.
- Evidencias (logs, IDs, etc):
  - Columnas nuevas detectadas en user_menstrual_config y menstrual_daily_log.
  - Tablas app.menstrual_cycle_history y app.exercise_tags presentes.
  - Constraints v3 presentes.
- Pendientes:
  - Ninguno en Fase 1.

### 02.02.2026

- Fase: 2 (Motor de ciclo)
- Cambios aplicados:
  - Motor v3 determinista con multiplicadores, clamp, modo y fase.
  - Tests unitarios con casos T1-T8 y reglas auxiliares.
- Migraciones:
  - Sin cambios en esta fase.
- Scripts ejecutados + resultado:
  - node --test backend/tests/menstrualCycleEngine.test.js -> OK.
  - node scripts/test-menstrual-cycle-api.mjs -> OK (AUTH_TOKEN aportado en runtime).
- Evidencias (logs, IDs, etc):
  - 10 tests pass, 0 fail.
- Pendientes:
  - Integrar motor en endpoints (Fase 3).

### 02.02.2026

- Fase: 3 (Endpoints y ajuste de sesion)
- Cambios aplicados:
  - /config y /log ahora aceptan campos v3 y sincronizan columnas nuevas.
  - /log registra inicio de sangrado en historial y recalcula cycle_length_days + cycle_confidence.
  - /training-adjustment usa motor v3 y mantiene compatibilidad con UI existente.
  - HipertrofiaV2 ajusta sesiones con multiplicadores y descanso extra.
- Migraciones:
  - Sin cambios.
- Scripts ejecutados + resultado:
  - node --test backend/tests/menstrualCycleEngine.test.js -> OK.
- Evidencias (logs, IDs, etc):
  - 10 tests pass, 0 fail.
- Pendientes:
  - Completar test con log de hoy (ALLOW_MENSTRUAL_TEST_WRITES=1) si se requiere validar escritura.

### 02.02.2026

- Fase: 5 (Tags + swaps)
- Cambios aplicados:
  - Seed de pattern/equipment para 110 ejercicios de hipertrofia.
  - Template CSV exportado para tagging manual de riesgo.
  - Swap engine integrado en HipertrofiaV2 (con fallback seguro cuando faltan tags).
- Migraciones:
  - Sin cambios.
- Scripts ejecutados + resultado:
  - node scripts/seed-hypertrofia-tags.mjs -> OK (pattern/equipment).
  - node scripts/export-hypertrofia-tags.mjs -> OK (template CSV).
  - node scripts/test-menstrual-cycle-swaps.mjs -> OK (rollback aplicado).
- Evidencias (logs, IDs, etc):
  - exercise_tags: 110 filas, pattern completo.
  - missing impact/axial/cod: 110 (pendiente tagging manual).
- Pendientes:
  - Completar riesgo (impact/axial/cod/overhead) en docs/ciclo_menstrual/tags_hypertrofia_template.csv.
  - Importar tags con scripts/import-hypertrofia-tags.mjs.

### 03.02.2026

- Fase: 6 (Autoajuste y deload)
- Cambios aplicados:
  - Autoajuste por patron integrado en HipertrofiaV2 (multipliers combinados + swaps reforzados).
  - Deload incluido en mensaje y ajuste de severidad desde engine.
  - autoAdjustService lee exercises_data con fallback a exercises.
  - Script `scripts/test-menstrual-cycle-deload.mjs` creado.
- Migraciones:
  - backend/migrations/20260203_menstrual_auto_adjust.sql (aplicada en Supabase).
- Scripts ejecutados + resultado:
  - node scripts/test-menstrual-cycle-deload.mjs -> OK (rollback aplicado).
- Evidencias (logs, IDs, etc):
  - Tablas app.menstrual_pattern_metrics y app.menstrual_deload_state presentes.
- Pendientes:
  - Ninguno en esta fase.

### 03.02.2026

- Fase: 7 (QA final + documentacion)
- Cambios aplicados:
  - Ejecucion completa de scripts QA v3.
  - Normalizacion de reps en sesiones ajustadas verificada via API.
  - Calendario y modal de logs restaurados (desde main) y adaptados a v3 (modo phase / fields v3).
- Migraciones:
  - Sin cambios adicionales.
- Scripts ejecutados + resultado:
  - node --input-type=module -e "import dotenv from 'dotenv'; dotenv.config(); dotenv.config({ path: 'backend/.env', override: false }); await import('./scripts/test-menstrual-cycle-db.mjs');" -> OK
  - node --test backend/tests/menstrualCycleEngine.test.js -> OK
  - node --input-type=module -e "import dotenv from 'dotenv'; dotenv.config(); dotenv.config({ path: 'backend/.env', override: false }); await import('./scripts/test-menstrual-cycle-api.mjs');" -> OK
  - node scripts/test-menstrual-cycle-swaps.mjs -> OK (rollback)
  - node scripts/test-menstrual-cycle-deload.mjs -> OK (rollback)
- Evidencias (logs, IDs, etc):
  - training-adjustment devuelve multipliers 0.9/0.85 + rest_extra 60 en sintomas severidad 3.
  - current-session-with-adjustments devuelve reps visibles (repeticiones) via normalizacion.
- Pendientes:
  - Ninguno en esta fase.

## Checklist por fase (detallado)

### Fase 1: Datos y migraciones

- [x] Migracion de columnas nuevas
- [x] Tabla menstrual_cycle_history
- [x] Tabla exercise_tags
- [x] Backfill inicial
- [x] Script DB OK

### Fase 2: Motor de ciclo

- [x] engine.js creado
- [x] Tests unitarios OK
- [x] Contrato de salida documentado

### Fase 3: Endpoints y ajuste de sesion

- [x] /config actualizado
- [x] /log actualizado
- [x] /training-adjustment actualizado
- [x] HipertrofiaV2 integra motor v3
- [x] Tests API OK

### Fase 4: Alineacion UI con backend v3

- [ ] useCycleAdjustment consume contrato v3 (mode, multipliers, rest_extra_seconds)
- [ ] useMenstrualCycle elimina logica local de ajuste o la delega al backend
- [ ] Onboarding captura campos v3 (contraception_type, bleed_length_days, luteal_length_days, joint_laxity_risk)
- [ ] QuickLog opcionalmente captura stress/pain_next_day/session_quality (o define mapeo 1-5)
- [ ] Mensajes UI alineados con backend (modo sintomas sin fase)
- [ ] Prueba manual UI vs /training-adjustment OK

### Fase 5: Tags + swaps

- [x] exercise_tags poblado (minimo hipertrofia)
- [x] swapEngine.js OK
- [x] Swaps aplicados en sesiones (con fallback sin tags)
- [x] Tests swaps OK
- [ ] CSV con impact/axial/cod/overhead completado
- [ ] Import tags ejecutado y validado

### Fase 6: Autoajuste y deload

- [x] Tabla metrics + deload state
- [x] Hook al completar sesion
- [x] Reglas 10.1 y 10.2 OK
- [x] Tests deload OK

### Fase 7: QA final

- [x] Scripts QA ejecutados (DB/engine/API/swaps/deload)
- [x] Docs actualizados
- [x] Evidencias en bitacora
