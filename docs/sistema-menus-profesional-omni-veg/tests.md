# Tests: sistema-menus-profesional-omni-veg

## Comandos ejecutados

1. `npm --prefix backend run backfill:nutrition-food-semantics`
2. `npm --prefix backend run baseline:nutrition-menu-quality`
3. `npm run test:backend`
4. `npx eslint --config .eslint.config.mjs backend/routes/nutritionV2.js backend/services/menuHardRulesEngine.js backend/scripts/backfill-food-semantics.mjs backend/scripts/generate-menu-quality-baseline.mjs backend/tests/menuHardRulesEngine.test.js`
5. `npm --prefix backend run qa:nutrition-menu-hard-rules`
6. Aplicación SQL de `supabase/migrations/20260220000600_seed_food_pairing_penalties_v2_contextual.sql` sobre DB de desarrollo.
7. Re-ejecución `npm --prefix backend run qa:nutrition-menu-hard-rules`.
8. Re-ejecución `npm run test:backend`.
9. Smoke API real con backend levantado:
   - `GET /api/nutrition-v2/active-plan`
   - `POST /api/nutrition-v2/generate-full-day-menus` con `mode=recipe_examples` para múltiples `day_id`.
10. Ajuste backend en `generateMenuForMeal` para fallback por comida cuando falla `recipe_examples`.
11. Re-ejecución smoke API real (`7` días) validando completitud y shape de metadata.
12. Re-ejecución `npm run test:backend`.
13. Diagnóstico de bloqueo hard en fallback (`rules=daily_processed_limit`) con logs enriquecidos.
14. Ajuste `DETERMINISTIC_MAX_RECIPE_TRIES` (`16 -> 40`).
15. Ajuste en evaluación hard de `recipe_examples` para evitar bloqueo por acumulado diario de procesados.
16. Re-ejecución smoke API real (`7` días).
17. Re-ejecución `npm run test:backend`.
18. Afinado de ranking en `recipe_examples`:

- penalización contextual de palatabilidad por receta.
- penalización por repetición de familia principal en el mismo día.

19. Re-ejecución smoke API real (`7` días) validando metadata ampliada.
20. Re-ejecución `npm run test:backend`.

## Resultados

- Backfill semántico aplicado en DB:
  - alimentos procesados: `255`
  - `processing_level`: `minimo=219`, `procesado=31`, `ultraprocesado=5`
- Baseline generado:
  - recetas activas: `222`
  - pass hard rules: `220`
  - pass rate: `99.1%`
- QA hard rules 200 muestras:
  - pass: `200/200`
  - pass rate: `100%`
  - sin bloqueos residuales en muestra.
  - soft rules activas en muestra: `samples_with_penalty=44`, `avg_penalty_when_applied=30.6364`.
- Pairing penalty scoring:
  - integrado en `recipe_examples` (score + metadata `pairing_penalty`).
  - seeds aplicados en `app.food_pairing_rules`: `12` reglas `penalty` activas (v1 + v2 contextual).
- Suite backend: `50/50` tests en verde.
- Lint dirigido: sin errores (warnings legacy en `nutritionV2.js` ya existentes).
- Smoke API real:
  - Día `80e33914-25a6-41bd-9a8e-3999b78998f5`: `6/6` comidas, `fallback_count=0`, metadata `hard_rules` + `pairing_penalty` presente en todas.
  - Muestra de 7 días tras fix: `allComplete=true` (`6/6` en todos los días).
  - En días conflictivos se activa fallback por comida (`recipe_examples -> deterministic`) con `fallback_count` entre `2` y `3` según día.
  - Metadata consistente en todos los menús (`allHardRulesMeta=true`, `allPairingMeta=true`).
  - Suite backend: `50/50` tests en verde tras ajuste.
- Smoke API real tras afinado final:
  - Muestra de 7 días: `fallback_count=0` en todos los días.
  - Completitud: `6/6` comidas en todos los días.
  - Metadata consistente en todos los menús.
- Smoke API real tras afinado de palatabilidad:
  - Se mantiene `fallback_count=0` en la muestra de 7 días.
  - Se mantiene completitud `6/6` en todos los días.
  - Metadata completa en todas las comidas: `hard_rules`, `pairing_penalty`, `palatability`.

## Evidencias

- `backend/tests/fixtures/menu_quality_baseline.json`
- `backend/tests/fixtures/menu_hard_rules_qa_200.json`
- `docs/menus_profesional/baseline.md`
- `docs/menus_profesional/kpis.md`
- `docs/menus_profesional/qa_hard_rules_200.md`
- `docs/menus_profesional/smoke_api_recipe_examples_20260220.md`
- `supabase/migrations/20260220000600_seed_food_pairing_penalties_v2_contextual.sql`
