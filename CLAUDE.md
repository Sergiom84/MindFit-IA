# CLAUDE.md

Guía operativa breve para Claude Code cuando trabaja en este repositorio.

## Reglas base

- Lee primero `CLAUDE_RULES.md`.
- Tienes todo el permiso para realizar las pruebas a tu gusto (incluye iniciar/reiniciar frontend y backend sin pedirlo).
- Mantén el alcance mínimo y evita tocar partes no relacionadas.

## Comandos vigentes

```bash
# Dependencias
npm run install:all

# Desarrollo
npm run dev
npm run dev:backend
npm run dev:auto
npm run dev:sync

# Calidad y verificación
npm run lint
npm run test:backend
npx playwright test

# Build
npm run build
npm run preview

# Utilidades
npm run check-ports
npm run monitor
npm run render:auth:win
npm run render:whoami
npm run render:services
npm run render:logs:win
```

## Estado real del proyecto

- Frontend: React 19 + Vite con rutas lazy en `src/App.jsx`.
- Módulos protegidos confirmados: inicio, home training, metodologías, oposiciones, rutinas, perfil, nutrición, corrección de video y ciclo menstrual.
- Providers y debugging: `src/providers/AppProviders.jsx`, `src/providers/DebugProvider.jsx`, `AuthContext`, `UserContext`, `TraceContext` y `WorkoutContext`.
- Backend: `backend/server.js` monta las APIs consolidadas de entrenamiento (`/api/routine-generation`, `/api/training-session`, `/api/training`, `/api/exercise-catalog`, `/api/progress`) y además mantiene módulos activos de nutrición, hipertrofia, adaptación, ciclo menstrual, analítica, media correction y utilidades auxiliares.
- Nutrición V2 está activa: plan persistido, `nutrition_meal_items`, catálogo con filtros, factores de conversión y generación de menús por día.
- El backend usa el puerto fijo `3010`; no asumir otro.

## Validación disponible

- `npm test` no valida funcionalidad; es solo placeholder.
- `npm run test:backend` ejecuta la suite Node ubicada en `backend/tests/`.
- `npx playwright test` existe para `tests/`, pero no arranca servicios automáticamente.

## Documentación viva

- `IMPLEMENTATION_SUMMARY.md` resume el estado actual del repositorio.
- `roadmap.md` recoge prioridades vigentes.
- `docs/_active.md` indica la línea de trabajo activa en `docs/`.
- `docs/REGISTRO_DIARIO_IMPLEMENTACIONES.md` registra cambios realizados.
