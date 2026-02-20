# Baseline de calidad de menús (Fase 0)

Fecha de ejecución: 20.02.2026  
Comando: `npm --prefix backend run baseline:nutrition-menu-quality`  
Fuente: `backend/tests/fixtures/menu_quality_baseline.json`

## Resultado global

- Recetas activas evaluadas: `222`
- Hard rules pass: `220`
- Hard rules fail: `2`
- Tasa pass hard rules: `99.1%`

## Resultado por tipo de comida

- `DESAYUNO`: 50/50 pass (`100%`)
- `COMIDA`: 70/72 pass (`97.2%`)
- `CENA`: 50/50 pass (`100%`)
- `SNACK`: 50/50 pass (`100%`)

## Gaps detectados

- Fallos concentrados en `COMIDA` con reglas hard:
  - `meal_suitability_blocked`
  - `snack_only_in_main_meal`
  - `main_dish_not_allowed`
  - `ultraprocessed_main_role`
  - `snack_family_in_main_meal`
- Ejemplos bloqueados:
  - `EX_C24_2`
  - `EX_C24_3`

## Acciones directas aplicadas

- Se añadieron reglas hard en backend para bloquear estos casos en generación `recipe_examples`.
- Se añadió semántica de catálogo para soportar filtrado por comida y nivel de procesado.
- Se creó baseline reproducible versionado en `backend/tests/fixtures/menu_quality_baseline.json`.
