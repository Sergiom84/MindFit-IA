# ARCH-002 — Refactor profundo y arnés aislado

## Estado

La segunda fase de los monolitos priorizados queda cerrada sin cambiar el
comportamiento funcional:

- `MethodologiesScreen.jsx`: de 2251 a 508 líneas. La selección, generación
  manual, ciclo de vida del plan, sesión de un día y autorregulación viven en
  hooks separados. El árbol de modales está en `MethodologiesModalLayer.jsx`.
- `TodayTrainingTab.jsx`: de 2400 a 1570 líneas. Inicio/reanudación/cierre de
  sesión, progreso y autorregulación están en `useRoutineSessionActions.js`;
  calentamiento, fin de semana y cancelación están en
  `useRoutineAuxiliaryActions.js`; los modales están en
  `TodayTrainingModalLayer.jsx`.

Los hooks conservan las llamadas y contratos existentes. No se ha modificado el
punto de convergencia `WorkoutContext.generatePlan()`.

## Base de datos de QA aislada

El arnés usa un contenedor PostgreSQL 17 exclusivo, ligado únicamente a
`127.0.0.1:55432`, restaura el baseline del repositorio y carga fixtures
sintéticos con IDs `900001` y correo bajo el dominio reservado `.invalid`.
No lee `backend/.env` ni conoce el host de Supabase.

```powershell
npm run qa:arch002:db
$env:DATABASE_URL='postgresql://postgres@127.0.0.1:55432/arch002_test'
$env:NODE_ENV='test'
npm --prefix backend run test:integration
npm run qa:arch002:db:stop
```

El script elimina o reinicia exclusivamente el contenedor con nombre exacto
`entrenaconia-arch002-test-db`. Los tests de contrato impiden que el arnés deje
de estar limitado a localhost o empiece a cargar configuración de producción.

## Verificación

- Restore del baseline y fixtures: 142 tablas, usuario QA y sesión QA.
- Suite de integración contra PostgreSQL efímero: 20/20.
- Suite unitaria/contratos: 74/74.
- Smoke E2E móvil sobre frontend y backend locales: rutina sintética visible,
  flujo de inicio abierto y una serie persistida en la base efímera.
- Build productivo: correcto.
