# QA-001 — Accesibilidad automatizada

## Estado

**Cerrado** el 2026-07-18.

- El job `a11y-audit` ejecuta Playwright + axe en CI.
- Los recorridos de login y registro fallan ante impactos `critical` o `serious`.
- El servidor de prueba y la URL por defecto comparten el puerto aislado `4173`.
- La interfaz estable usa modales semánticos en lugar de diálogos nativos bloqueantes.

Verificación local: `npm run test:a11y` → 2/2 recorridos superados.
