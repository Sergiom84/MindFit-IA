# WARP.md

Referencia breve para trabajar este repositorio desde WARP u otros asistentes de terminal.

## Reglas

- Consulta `CLAUDE_RULES.md` antes de actuar.
- No reinicies frontend/backend sin autorización del propietario.
- No amplíes el alcance ni modifiques zonas no relacionadas.

## Comandos útiles

```bash
npm run install:all
npm run dev
npm run dev:backend
npm run dev:auto
npm run dev:sync
npm run build
npm run preview
npm run lint
npm run test:backend
npm run check-ports
npm run monitor
```

## Estado confirmado

- Frontend React + Vite con rutas lazy en `src/App.jsx`.
- Backend Express en `backend/server.js`, con endpoints consolidados de entrenamiento y módulos activos de nutrición, hipertrofia, adaptación y ciclo menstrual.
- `Nutrition V2` ya trabaja con `nutrition_meal_items`, catálogo filtrable y generación de menús por día.
- `FoodDatabase.jsx` existe, pero no forma parte del flujo principal actual.

## Puntos de cuidado

- No cambiar el puerto backend `3010`.
- No romper la convergencia de metodologías en `WorkoutContext.generatePlan()`.
- Usa `IMPLEMENTATION_SUMMARY.md`, `roadmap.md` y `docs/_active.md` como documentación vigente.
