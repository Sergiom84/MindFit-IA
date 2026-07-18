# ARCH-001 — Adapter único de API y autenticación

## Estado

**Cerrado** el 2026-07-18.

- `src/config/api.js` es la única fuente de `VITE_API_URL` y expone `getApiBaseUrl()`.
- `src/utils/tokenManager.js` es la única capa que lee o escribe los tokens de sesión.
- Los componentes consumen ambos adapters y no incorporan fallbacks propios a
  `localhost:3010`.
- El heartbeat y la inactividad permanecen centralizados en el flujo de autenticación.

`backend/tests/auditoriaEciClosureContracts.test.js` recorre el árbol `src/` y falla si
vuelve a aparecer acceso directo a `VITE_API_URL` o al token fuera de sus adapters.
