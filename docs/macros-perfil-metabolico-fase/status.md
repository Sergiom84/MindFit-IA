# Status

- Slug: `macros-perfil-metabolico-fase`
- Current phase: Ready for impl-pack-close - QA manual Playwright autenticado completado y pack validado.
- Last completed task: QA manual/autenticado end-to-end con Playwright sobre login, configuración nutricional, cuestionario metabólico, generación de plan, calendario y bridge override.
- Next task: si procede, ejecutar `impl-pack-close` y dejar el pack listo para limpieza del puntero solo tras confirmación explícita.
- Tests pending: ninguno crítico; solo cierre documental si se desea.
- Bloqueos: ninguno.
- Last update: 2026-03-19 18:34 CET

## Evidencia actual

- `node --test backend/tests/macroProfilePhaseResolver.test.js` ✅
- `node --test backend/tests/nutritionCalculatorMacrosByPhase.test.js` ✅
- `node --test backend/tests/metabolicProfileMacroAlignment.test.js` ✅
- `node --test backend/tests/trainingNutritionBridgeMacroOverride.test.js` ✅
- `npm run test:backend` ✅ (69/69)
- `npx eslint --config .eslint.config.mjs ...` ✅ sin errores (warnings legacy fuera de alcance)
- Smoke técnico manual vía Node script ✅:
  - plan override `intolerante + bulk` → plantilla 25/35/40
  - evaluación metabólica `mixto + cut` → plantilla 28/32/40
  - bridge override con confianza baja → fallback `mixto + cut`
- QA manual Playwright/autenticado ✅ (`test-results/manual-qa-macros-perfil-fase/qa-report.json`)
  - login real con usuario de prueba
  - `GET /api/metabolic-profile/distributions` → ruleset `mindfeed_macro_phase_v2`
  - guardado de configuración en fase `bulk`
  - cuestionario metabólico en 2 intentos → perfil aplicado `intolerante`
  - generación de plan y vista de calendario activas
  - paridad UI/API en macros del plan activo: `P 151 / C 211 / G 107`
  - bridge override `2500 kcal` preservando `intolerante + bulk`
  - 7 capturas: `test-results/manual-qa-macros-perfil-fase/*.png`
