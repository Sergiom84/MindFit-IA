# Pairing penalties v2 (contextual)

Fecha: 2026-02-20
Migración: `supabase/migrations/20260220000600_seed_food_pairing_penalties_v2_contextual.sql`

## Objetivo

Reducir combinaciones poco apetecibles detectadas en menús reales, sin bloquear recetas por hard-rule.

## Criterio aplicado

- Penalización en contextos `DESAYUNO` y `SNACK` para combinaciones tipo “plato principal salado” que hoy estaban compitiendo con opciones más coherentes.
- No se cambian reglas hard; solo scoring/ranking.

## Reglas añadidas (v2)

- `caballo_carne_de_potro + remolacha_cocida` -> penalty `36` (`DESAYUNO`, `SNACK`)
- `carne_picada_vacuno_5 + zanahoria_cocida` -> penalty `34` (`DESAYUNO`, `SNACK`)
- `conejo + zanahoria_cruda` -> penalty `34` (`DESAYUNO`, `SNACK`)
- `natto + remolacha_cocida` -> penalty `24` (`DESAYUNO`, `SNACK`)
- `seitan + zanahoria_cocida` -> penalty `22` (`DESAYUNO`, `SNACK`)
- `bagel + zanahoria_cocida` -> penalty `18` (`DESAYUNO`, `SNACK`)
- `pan_blanco + zanahoria_cruda` -> penalty `18` (`DESAYUNO`, `SNACK`)
- `arepa + remolacha_cocida` -> penalty `16` (`DESAYUNO`, `SNACK`)

## Resultado QA tras aplicar v2

- QA hard-rules: `200/200` pass (`100%`)
- Soft penalties observadas en muestra: `44/200`
- Penalización media cuando aplica: `30.6364`
