# QA móvil de reproductores — CrossFit y MindFeed

- Fecha: 11.07.2026
- Viewport: 375×812, táctil y escala 2×
- Navegador: Chromium mediante Playwright
- Entorno: frontend `5173`, backend `3010`, Supabase real

## CrossFit

Recorrido realizado íntegramente por interfaz:

1. Registro de una usuaria nueva en cuatro pasos.
2. Navegación a Métodos y selección manual de CrossFit.
3. Aceptación del entrenamiento suelto del sábado.
4. Salto del calentamiento desde su botón visible.
5. WOD player: escala `Scaled`, cronómetro iniciado/pausado y movimientos visibles.
6. Finalización del WOD, RPE 8 y autorregulación guardada con HTTP 200.
7. Recarga posterior sin errores de consola.

Correcciones derivadas:

- `WodSessionModal` se porta a `document.body`; la navegación fija ya no intercepta `Terminar WOD`.
- `CrossFitEffortModal` sincroniza `defaultScale` al abrirse; `Scaled` ya no se guarda como `RX`.

## Hipertrofia / MindFeed

Recorrido realizado íntegramente por interfaz:

1. Registro de una usuaria nueva y selección manual de Hipertrofia.
2. Generación de sesión suelta de sábado con siete ejercicios.
3. Apertura del reproductor propio y comienzo de sesión.
4. Recarga para simular cierre/reapertura de la app.
5. Navegación a Rutinas, detección de la sesión persistida y botón `Reanudar Entrenamiento`.
6. Reanudación sin expulsión a Metodologías y permanencia en `/routines`.

Corrección derivada:

- `RoutineScreen` consulta `weekend-status` antes de redirigir por ausencia de plan y conserva esa condición durante la validación diferida.
- Nuevo test `backend/tests/weekendRoutineGuard.test.js`.

## Validación final

- `npm run build`: correcto.
- `npm run lint`: correcto, sin errores.
- `npm run test:backend`: 78/78 tests pasan.
- Scripts reutilizables: `output/qa-e2e/16-crossfit-ui.cjs` y `17-hipertrofia-ui-resume.cjs`.

## Evidencia principal

- `output/qa-e2e/shots/16-crossfit-wod-player-r1788.png`
- `output/qa-e2e/shots/16-crossfit-esfuerzo-r1788.png`
- `output/qa-e2e/shots/17-mindfeed-player-inicial-r5548.png`
- `output/qa-e2e/shots/17-mindfeed-reanudar-r5548.png`
- `output/qa-e2e/shots/17-mindfeed-reanudado-r5548.png`

## Límites de esta ronda

- Se validaron los reproductores mediante sesiones sueltas de fin de semana, no un plan completo de ocho o más semanas por UI.
- No se ejecutó emulador Android/iOS.
- La primera ejecución completa de tests sufrió un fallo transitorio de conexión PostgreSQL; la repetición inmediata terminó con 78/78 en verde.
