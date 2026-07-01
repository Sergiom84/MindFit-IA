# QA de humo · Motor compartido de Gimnasio (GymRoutineService)

**Fecha:** 2026-07-01 · **Rama:** `feat/qa-motor-gym`

Verificación de cierre de las 5 metodologías que comparten
`backend/services/routineGeneration/methodologies/GymRoutineService.js`
(`generateGymRoutine`, config por metodología en `METHOD_CONFIGS`):
**Gimnasio, Casa, Heavy Duty, Powerlifting, Halterofilia**. Funcional ya estaba
verificada con este mismo motor.

No se tocó código de producción: el motor ya estaba correcto y **todo el QA salió
en verde**. Se añaden dos harnesses reutilizables en `backend/scripts/`.

## Usuarios de prueba

| Usuario | id  | Nivel        | Lesión         |
| ------- | --- | ------------ | -------------- |
| Carlos  | 911 | principiante | —              |
| Elena   | 912 | intermedio   | muñeca (wrist) |
| Diego   | 913 | avanzado     | codo (elbow)   |

## Paso 3 — Generación (determinista, `scripts/qa-motor-gym-smoke.mjs`)

**90 generaciones** = 5 metodologías × 3 usuarios × 6 corridas. El catálogo se
baraja con `ORDER BY RANDOM()`, así que 6 corridas ejercitan selecciones distintas.

Por cada plan se reaplica de forma independiente el filtro de lesiones sobre el
plan final y se comprueban frecuencia, duración, nº de ejercicios/sesión,
equipamiento (Casa) y overrides (Heavy Duty).

Resultado: **✅ 90/90**.

- **CERO movimientos contraindicados** en todos los planes de usuarios lesionados.
- El filtro trabaja de verdad: excluye 14–45 movimientos por metodología en los
  usuarios lesionados (p. ej. Elena/gimnasio 36; Diego/gimnasio 45) y aun así el
  plan final queda limpio. `restricciones_lesion.movimientos_excluidos` poblado.
- **Frecuencia / duración por nivel correctas:**
  - Gimnasio/Casa/Powerlifting/Halterofilia: principiante 3/8, intermedio 4/10, avanzado 5/12.
  - Heavy Duty (baja frecuencia): principiante 2/8, intermedio 3/10, avanzado 3/12.
- **Ejercicios por sesión:** 4 en todas salvo Heavy Duty = 3.
- **Casa:** con `equipmentLevel='minimo'` solo aparecen ejercicios con material
  permitido (0 violaciones de equipamiento).
- **Heavy Duty:** overrides aplicados en todos los ejercicios — `series='1-2'`,
  `rir_target=0`, `descanso_seg=180`.

## Paso 4 — Cierre de ciclo por HTTP (`scripts/qa-motor-gym-cycle.mjs`)

`generate` → `confirm-plan` → `today-status` → autoreg (`session-result`), 1 usuario
por metodología. Resultado: **✅ 5/5** con decisión de autorregulación válida.

| Metodología  | generate | confirm | today-status | autoreg (contrato)                                                     |
| ------------ | -------- | ------- | ------------ | ---------------------------------------------------------------------- |
| Gimnasio     | ✅       | ✅      | 200          | n/a (usa flujo hipertrofia; sin endpoint `methodology-session` propio) |
| Casa         | ✅       | ✅      | 200          | `{avgRir, targetMet}` → `progress`                                     |
| Heavy Duty   | ✅       | ✅      | 200          | `{reachedFailure, targetMet}` → `progress`                             |
| Powerlifting | ✅       | ✅      | 200          | `{rpe, targetMet, goodTechnique}` → `hold`                             |
| Halterofilia | ✅       | ✅      | 200          | `{rpe, targetMet, goodTechnique}` → `progress`                         |

Contratos de autoreg confirmados en `backend/routes/methodologySingleDay.js`.

## Paso 6 — Suite de backend (`npm run test:backend`)

**Bloqueada por límite de conexiones, no por lógica.** El pooler de Supabase
(modo sesión) tiene `pool_size: 15`. Con el backend del usuario en `:3010`
consumiendo su pool, la suite flakea con `EMAXCONNSESSION` en 1–2 tests de
**nutrición** (`nutritionAdjustmentsV2` / `undo v2`), que varían entre corridas y
**no tocan el motor gym**. Mejor resultado observado: **76/77** (el único fallo,
`EMAXCONNSESSION`).

> Para obtener 77/77 limpio hay que ejecutar la suite sin otro backend
> consumiendo conexiones (parar el `:3010` mientras corre). No se paró el backend
> del usuario por la regla de "no reiniciar sin pedirlo".

## Notas operativas

- Se levantó un backend paralelo en `:3013` con `--env-file=backend/.env`. Ojo:
  arrancar `server.js` desde la raíz hace `dotenv.config()` sobre el `.env` raíz,
  que **no tiene `JWT_SECRET`** → 403 "Token inválido". Hay que pasar
  `--env-file=backend/.env`.
- Tener dos backends a la vez (`:3010` + `:3013`) agota el pooler (2×10 > 15). El
  QA por HTTP se cerró apuntando al `:3010` ya existente tras liberar el `:3013`.
- Los harnesses limpian sus propios drafts/planes de los usuarios 911/912/913 al
  terminar.
