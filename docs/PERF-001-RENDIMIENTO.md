# PERF-001 — Rendimiento y medios

## Estado

**Cerrado** el 2026-07-18.

- Web Vitals se inicializa desde `src/main.jsx` mediante `src/utils/webVitals.js`.
- `npm run perf:budget` aplica límites reproducibles a chunks y forma parte de CI.
- Vídeo de ejercicios usa `preload="metadata"`; imágenes pesadas usan carga diferida y
  decodificación asíncrona donde corresponde.

Verificación local: 16 chunks dentro del presupuesto; mayor chunk 328,1 KB sin comprimir
y 75,7 KB gzip, por debajo de los límites de 450/120 KB.
