# Tests: Nutrición Revisión 7d/14d + Autoajustes + Deshacer

## Estrategia

Separar tests por capas:

- **SQL/migraciones:** columnas existen, defaults, constraints, queries básicas.
- **Servicio de review:** unit tests de cálculo (rolling 7d, gates, estados).
- **Endpoints:** integration tests de payloads y flujos (apply/undo).
- **UI:** QA manual guiada (bloque revisión + registro rápido + consistencia plan activo).

## Casos mínimos (por fase)

### Fase 1 (SQL)

1. `daily_nutrition_log` acepta insert sin `day_type/noise_flags` y asigna defaults.
2. `day_type` solo permite valores definidos.

### Fase 2 (API daily v2)

1. Guardar día con solo `calories`:
   - Cuenta como “registrado”.
2. Guardar día con `day_type=cheat` y `calories=0`:
   - Cuenta como “registrado”.
3. Guardar día con `noise_flags=['viaje']`:
   - Se persiste y luego se lee igual.

### Fase 3 (Review semanal/quincenal)

1. **Modo SIMPLE**
   - No hay registros suficientes de días.
   - Sí hay algunos pesajes.
   - Resultado:
     - feedback semanal presente
     - quincenal: “no aplicable” / “pendiente por adherencia”
2. **Undo status para UI**
   - Existe una acción `nutrition_adjustment_actions` no revertida.
   - Resultado:
     - `GET /api/nutrition-v2/review` incluye `last_adjustment_action` con `undo_available` y `undo_expires_at`.
3. **Modo FINO pero compliance bajo**
   - Adherencia de registro >=80% y pesajes suficientes.
   - rolling 7d kcal fuera de ±10% del objetivo (compliance bajo).
   - Resultado:
     - no ajustar kcal
     - mensaje: “el problema es seguir el objetivo, no el plan”
4. **Modo FINO + confirmación 2 semanas**
   - Adherencia de registro >=80% y pesajes suficientes.
   - Desviación de ritmo confirmada 2 semanas.
   - Sin ruido.
   - Resultado:
     - quincenal recomienda/aplica ajuste con delta clamp <=10%.

### Fase 4 (Apply ajuste + regenerar plan)

1. Aplicar ajuste quincenal:
   - crea acción reversible
   - archiva plan previo
   - crea plan nuevo activo con kcal objetivo actualizado
   - registra log con métricas usadas

### Fase 5 (Undo)

1. Deshacer dentro de ventana:
   - activa el plan previo
   - archiva el plan nuevo
   - marca la acción como revertida
2. Deshacer fuera de ventana:
   - responde error claro (sin cambios)

## Datos de prueba (sugerido)

- Usuario con:
  - 10-14 pesajes en 14 días (para modo FINO).
  - 0-2 registros diarios (para modo SIMPLE).
  - 12/14 registros diarios (para modo FINO).
- Variantes:
  - con cintura y sin cintura.
  - con `noise_flags` activos (viaje/enfermedad) en los últimos 7 días.
  - con outlier de peso.

## Comandos / scripts (según repo)

- Migración Fase 1 (SQL):
  - `npm run migrate:nutrition-review`
- Calidad:
  - `npm run lint`
- Backend tests:
  - `npm run test:backend`
- E2E (si aplica):
  - `npx playwright test`

Nota: cuando se implementen endpoints nuevos, añadir un script node de verificación (tipo los existentes en repo) para:

- crear registros diarios de ejemplo
- solicitar review
- aplicar ajuste
- deshacer

## QA ejecutada (2026-02-10)

Validación UI (headless) sobre servicios ya levantados:

- Front: `http://localhost:5173`
- API: `http://localhost:3010`

Escenario validado:

- Se crea usuario QA temporal.
- Se crea perfil nutricional + se genera plan V2 (14 días) y se fuerza elegibilidad quincenal (plan backdated).
- Se siembran pesajes suficientes (ventanas prev7/curr7) para tener tendencia.
- UI en `/nutrition` > tab `Dashboard Nutrición`:
  - **Modo SIMPLE** sin registros diarios: la revisión semanal aparece y la quincenal indica “insuficiente”.
  - Se siembran 14 días de registro de kcal (completitud >= 80%) y la UI pasa a **Modo FINO**.
  - Se marca ruido `Viaje` en el registro rápido: la quincenal pasa a `blocked_by_noise`.
  - Se desmarca ruido y vuelve a `recommend_adjustment`.
  - Se aplica el ajuste recomendado desde UI: el plan activo cambia de kcal y aparece “Deshacer”.
  - Se deshace el ajuste desde UI: el plan activo vuelve a kcal previa.
- Limpieza: el usuario QA y sus datos se borran al finalizar.

## Criterio para avanzar de fase

- Fase 1: migración aplicada sin romper legacy.
- Fase 2: API daily v2 persistiendo correctamente.
- Fase 3: review devuelve estados correctos en 4 escenarios (simple / undo-status / fino+compliance bajo / fino+confirmación).
- Fase 4: ajuste aplica y UI queda consistente (plan activo).
- Fase 5: undo 24h estable.
- Fase 6: UX clara y sin incoherencias.

## Resultados de cierre del pack

- Tests automatizados backend: ejecutados y en verde para las fases implementadas.
- QA UI headless: ejecutada y en verde para flujo SIMPLE -> FINO -> apply -> undo.
- Pendiente para cierre definitivo: QA manual del usuario (entorno real/sin seed) antes de limpiar el puntero activo.
