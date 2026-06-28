# Status

- Slug: `macros-perfil-metabolico-fase`
- Estado: Closed after QA manual
- Last completed task: cierre documental del impl-pack tras QA manual Playwright autenticado y limpieza del puntero activo.
- Next task: ninguna dentro de este pack; solo seguimiento normal post-release si apareciera alguna incidencia.
- Tests pending: ninguno dentro del alcance del rollout.
- Bloqueos: ninguno.
- Last update: 2026-03-19 22:07 CET

## Evidencia de cierre

- `node --test backend/tests/macroProfilePhaseResolver.test.js` ✅
- `node --test backend/tests/nutritionCalculatorMacrosByPhase.test.js` ✅
- `node --test backend/tests/metabolicProfileMacroAlignment.test.js` ✅
- `node --test backend/tests/trainingNutritionBridgeMacroOverride.test.js` ✅
- `npm run test:backend` ✅ (`69/69`)
- `eslint` dirigido sobre archivos tocados ✅ sin errores (warnings legacy fuera de alcance)
- QA manual Playwright/autenticado ✅ (`11/11` checks OK)
  - reporte: `test-results/manual-qa-macros-perfil-fase/qa-report.json`
  - capturas: `test-results/manual-qa-macros-perfil-fase/*.png`
  - script: `test-results/manual-qa-macros-perfil-fase/run-playwright-qa.mjs`

## Resultado funcional observado

- perfil aplicado en QA: `intolerante`
- fase validada: `bulk`
- macros UI/API del plan activo: `P 151 / C 211 / G 107`
- bridge override coherente con `intolerante + bulk` a `2500 kcal`
