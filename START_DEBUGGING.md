# Inicio rápido de debugging

Fecha de revisión: 2026-03-06

## Antes de tocar nada

- No reinicies frontend ni backend sin autorización del propietario.
- Si el entorno ya está levantado, empieza por `npm run check-ports`.
- Si buscas un problema de calidad estática, ejecuta primero `npm run lint`.

## Comprobaciones rápidas

```bash
npm run check-ports
npm run monitor
npm run lint
```

- `check-ports` alinea `.env.local` con el backend actual.
- `monitor` ayuda a detectar caídas o timeouts del backend.
- `lint` localiza errores de importación, hooks y estilo antes de abrir más frentes.

## Debugging de frontend en desarrollo

- `src/providers/DebugProvider.jsx` publica `window.__DEBUG_CONTEXTS` cuando la app corre en desarrollo.
- `src/App.jsx` renderiza `TraceConsole` solo en `import.meta.env.DEV`.
- Comandos útiles en consola:

```javascript
window.__DEBUG_CONTEXTS.listContexts();
window.__DEBUG_CONTEXTS.getHistory("WorkoutContext");
window.__DEBUG_CONTEXTS.getAllStats();
window.__DEBUG_CONTEXTS.disable();
window.__DEBUG_CONTEXTS.enable();
```

## Archivos a inspeccionar primero

- `src/providers/DebugProvider.jsx`
- `src/providers/AppProviders.jsx`
- `src/contexts/WorkoutContext.jsx`
- `src/contexts/AuthContext.jsx`
- `backend/server.js`
- La ruta o servicio concreto afectado en `backend/routes/` o `backend/services/`

## Notas

- Las referencias antiguas a Vite Inspector y a otras guías auxiliares de debugging se retiraron de la raíz porque no eran la fuente de verdad actual.
- Si necesitas una incidencia concreta, la referencia válida es siempre el código y los logs reales del entorno en ejecución.
