# Propuesta de plantillas nuevas para mejorar variabilidad (v1)

Fecha: 13.02.2026  
Estado: Aplicada en BD (lote v1)

## Objetivo

Cubrir los huecos de variedad detectados en generación de menús, sin tocar el motor ni la lógica de cálculo de macros:

- `DESAYUNO` VEG (contexto `AMBOS`)
- `CENA` AMBOS (contextos `VOLUMEN` y `AMBOS`)
- `CENA` VEG (contexto `AMBOS`)
- `SNACK` AMBOS y VEG (contexto `AMBOS`)

Lote propuesto: **16 plantillas**.

## Resumen del lote

| meal_type | diet_allowed | day_context | nuevas |
| --------- | ------------ | ----------- | -----: |
| DESAYUNO  | VEG          | AMBOS       |      2 |
| CENA      | AMBOS        | VOLUMEN     |      3 |
| CENA      | AMBOS        | AMBOS       |      2 |
| CENA      | VEG          | AMBOS       |      4 |
| SNACK     | AMBOS        | AMBOS       |      2 |
| SNACK     | VEG          | AMBOS       |      3 |
| **TOTAL** |              |             | **16** |

## Plantillas propuestas

## 1) DESAYUNO (VEG / AMBOS)

### B17

- `template_code`: `B17`
- `template_name`: `Desayuno veg salado: proteína veg + pan + verdura + aceite`
- `meal_type`: `DESAYUNO`
- `day_context`: `AMBOS`
- `diet_allowed`: `VEG`
- `slots`:

1. `PROTEINA_VEGETAL`
2. `CARBO_PAN`
3. `VERDURA`
4. `GRASA_ACEITE`

### B18

- `template_code`: `B18`
- `template_name`: `Desayuno veg dulce: proteína veg + avena + fruta + frutos secos`
- `meal_type`: `DESAYUNO`
- `day_context`: `AMBOS`
- `diet_allowed`: `VEG`
- `slots`:

1. `PROTEINA_VEGETAL`
2. `CARBO_AVENA`
3. `FRUTA`
4. `GRASA_FRUTOS_SECOS`

## 2) CENA (AMBOS / VOLUMEN)

### D15

- `template_code`: `D15`
- `template_name`: `Cena volumen clásica: proteína + carb cocido + verdura + aceite`
- `meal_type`: `CENA`
- `day_context`: `VOLUMEN`
- `diet_allowed`: `AMBOS`
- `slots`:

1. `PROTEINA_ANIMAL`
2. `CARBO_COCIDO`
3. `VERDURA`
4. `GRASA_ACEITE`

### D16

- `template_code`: `D16`
- `template_name`: `Cena volumen doble carb: proteína magra + carb base + carb cocido + verdura`
- `meal_type`: `CENA`
- `day_context`: `VOLUMEN`
- `diet_allowed`: `AMBOS`
- `slots`:

1. `PROTEINA_ANIMAL_MAGRA`
2. `CARBO_BASE`
3. `CARBO_COCIDO`
4. `VERDURA`

### D17

- `template_code`: `D17`
- `template_name`: `Cena volumen tipo wrap: proteína + pan + verdura + grasa base`
- `meal_type`: `CENA`
- `day_context`: `VOLUMEN`
- `diet_allowed`: `AMBOS`
- `slots`:

1. `PROTEINA_ANIMAL_MAGRA`
2. `CARBO_PAN`
3. `VERDURA`
4. `GRASA_BASE`

## 3) CENA (AMBOS / AMBOS)

### D18

- `template_code`: `D18`
- `template_name`: `Cena equilibrada: proteína magra + pan + verdura + aceite`
- `meal_type`: `CENA`
- `day_context`: `AMBOS`
- `diet_allowed`: `AMBOS`
- `slots`:

1. `PROTEINA_ANIMAL_MAGRA`
2. `CARBO_PAN`
3. `VERDURA`
4. `GRASA_ACEITE`

### D19

- `template_code`: `D19`
- `template_name`: `Cena rápida láctea: lácteo proteico + pan + fruta + frutos secos`
- `meal_type`: `CENA`
- `day_context`: `AMBOS`
- `diet_allowed`: `AMBOS`
- `slots`:

1. `LACTEO_PROTEICO_MAGRO`
2. `CARBO_PAN`
3. `FRUTA`
4. `GRASA_FRUTOS_SECOS`

## 4) CENA (VEG / AMBOS)

### D20

- `template_code`: `D20`
- `template_name`: `Cena veg bowl: proteína veg + carb cocido + verdura + aceite`
- `meal_type`: `CENA`
- `day_context`: `AMBOS`
- `diet_allowed`: `VEG`
- `slots`:

1. `PROTEINA_VEGETAL`
2. `CARBO_COCIDO`
3. `VERDURA`
4. `GRASA_ACEITE`

### D21

- `template_code`: `D21`
- `template_name`: `Cena veg legumbre: legumbre + pan + verdura + aceite`
- `meal_type`: `CENA`
- `day_context`: `AMBOS`
- `diet_allowed`: `VEG`
- `slots`:

1. `LEGUMBRE`
2. `CARBO_PAN`
3. `VERDURA`
4. `GRASA_ACEITE`

### D22

- `template_code`: `D22`
- `template_name`: `Cena veg cereal: proteína veg + carb base + verdura + grasa base`
- `meal_type`: `CENA`
- `day_context`: `AMBOS`
- `diet_allowed`: `VEG`
- `slots`:

1. `PROTEINA_VEGETAL`
2. `CARBO_BASE`
3. `VERDURA`
4. `GRASA_BASE`

### D23

- `template_code`: `D23`
- `template_name`: `Cena veg alta saciedad: legumbre + carb cocido + verdura + frutos secos`
- `meal_type`: `CENA`
- `day_context`: `AMBOS`
- `diet_allowed`: `VEG`
- `slots`:

1. `LEGUMBRE`
2. `CARBO_COCIDO`
3. `VERDURA`
4. `GRASA_FRUTOS_SECOS`

## 5) SNACK (AMBOS / AMBOS)

### S11

- `template_code`: `S11`
- `template_name`: `Snack mixto: proteína magra + pan + fruta`
- `meal_type`: `SNACK`
- `day_context`: `AMBOS`
- `diet_allowed`: `AMBOS`
- `slots`:

1. `PROTEINA_ANIMAL_MAGRA`
2. `CARBO_PAN`
3. `FRUTA`

### S12

- `template_code`: `S12`
- `template_name`: `Snack post ligero: lácteo proteico + carb rápido + frutos secos`
- `meal_type`: `SNACK`
- `day_context`: `AMBOS`
- `diet_allowed`: `AMBOS`
- `slots`:

1. `LACTEO_PROTEICO_MAGRO`
2. `CARBO_RAPIDO`
3. `GRASA_FRUTOS_SECOS`

## 6) SNACK (VEG / AMBOS)

### S13

- `template_code`: `S13`
- `template_name`: `Snack veg simple: proteína veg + fruta + frutos secos`
- `meal_type`: `SNACK`
- `day_context`: `AMBOS`
- `diet_allowed`: `VEG`
- `slots`:

1. `PROTEINA_VEGETAL`
2. `FRUTA`
3. `GRASA_FRUTOS_SECOS`

### S14

- `template_code`: `S14`
- `template_name`: `Snack veg salado: legumbre + pan + verdura`
- `meal_type`: `SNACK`
- `day_context`: `AMBOS`
- `diet_allowed`: `VEG`
- `slots`:

1. `LEGUMBRE`
2. `CARBO_PAN`
3. `VERDURA`

### S15

- `template_code`: `S15`
- `template_name`: `Snack veg entrenable: suplemento proteína + carb rápido + fruta`
- `meal_type`: `SNACK`
- `day_context`: `AMBOS`
- `diet_allowed`: `VEG`
- `slots`:

1. `SUPLEMENTO_PROTEINA`
2. `CARBO_RAPIDO`
3. `FRUTA`

## Notas de revisión

- Todos los `slot_role` propuestos existen ya en la BD actual.
- No se han creado códigos en conflicto con los existentes (`B01..B16`, `C01..C24`, `D01..D14`, `S01..S10`).
- Este documento es solo de validación funcional/negocio antes de generar SQL de inserción.
