# QA operativo — MindFit

- Fecha: 11.07.2026
- Objetivo: confirmar operatividad local y de producción
- Entorno UI: React/Vite, viewport móvil 390×844
- Salud inicial/final: 96/100

## Cobertura

- Build productivo Vite.
- ESLint de frontend, backend y scripts.
- Suite backend completa.
- Salud HTTP local y Render.
- Registro real de cuatro pasos con perfil lesionado.
- Dashboard sin plan, selección manual de metodología y rutina suelta de sábado.
- Calentamiento y apertura del reproductor de Calistenia.
- Configuración de Render contrastada sin exponer secretos.

## Resultados

- `npm run build`: correcto.
- `npm run lint`: correcto, sin errores; se excluyeron artefactos generados de Android.
- `npm run test:backend`: 77/77 tests pasan.
- Local `/api/health`: HTTP 200.
- Render `/api/health`: HTTP 200; despliegue activo.
- Consola del navegador: 0 errores durante el recorrido.
- Supabase de Render: referencia canónica `sbqcnlwpvjavmljzkmfy` en URL y conexión.

## Hallazgos no bloqueantes

1. Los enlaces de términos y privacidad del registro usan `#`; falta enlazarlos a documentos legales reales. No se inventa contenido legal durante QA.
2. El reproductor móvil presenta desplazamiento anidado, aunque los controles siguen siendo visibles y utilizables.
3. El plan gratuito de Render puede tardar más de 30 segundos en el primer acceso; una vez activo respondió en 0,3 segundos.
4. La auditoría se realizó sobre `main` con los siete commits de correcciones E2E posteriores a la versión que estaba publicada.

## Evidencia

- `output/playwright/qa-login-mobile.png`
- `output/playwright/qa-dashboard-mobile.png`
- `output/playwright/qa-player-mobile.png`

## Estado

Operativa localmente y producción saludable. Rama validada y preparada para alinear producción con las correcciones más recientes.
