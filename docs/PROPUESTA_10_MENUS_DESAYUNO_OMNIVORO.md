# Propuesta: 10 menús de desayuno omnívoro (borrador de revisión)

Fecha: 13.02.2026  
Estado: Propuesta para revisión funcional (sin migración)  
Fuente de datos: alimentos y macros reales de `app.foods` + roles de `app.food_roles`

## Notas

- No se ha aplicado ninguna migración ni inserción en BD.
- Los gramos son base de referencia para revisar coherencia culinaria; luego el solver podrá escalar por objetivo.
- Los totales (`kcal`, `P`, `C`, `F`) se calcularon con `macros_100g` actuales de la BD.

## Resumen rápido

| Código | Menú                                                       | kcal | Proteína (g) | Carbos (g) | Grasas (g) |
| ------ | ---------------------------------------------------------- | ---: | -----------: | ---------: | ---------: |
| BO01   | Bowl de skyr, avena y plátano con whey                     |  579 |         37.9 |       77.5 |       13.4 |
| BO02   | Tostadas integrales con pavo, tomate y naranja             |  646 |         43.2 |       85.2 |       15.5 |
| BO03   | Tortilla mixta con pan de espelta y kiwi                   |  617 |         44.2 |       65.9 |       20.4 |
| BO04   | Porridge proteico con arándanos y almendras                |  630 |         45.0 |       66.4 |       20.5 |
| BO05   | Arepa con pollo, cottage y pera                            |  658 |         46.6 |       75.7 |       19.3 |
| BO06   | Bagel con revuelto de huevo y claras + fresas              |  570 |         47.9 |       67.6 |       12.1 |
| BO07   | Pita integral con jamón cocido, batido 0% y kiwi           |  654 |         43.7 |       81.0 |       17.8 |
| BO08   | Yogur desnatado con corn flakes, whey, manzana y avellanas |  570 |         35.5 |       90.3 |        8.1 |
| BO09   | Pan proteico con pavo, huevo y rúcula + naranja            |  681 |         56.3 |       58.6 |       25.4 |
| BO10   | Bowl post-entreno de arroz inflado, whey y plátano         |  611 |         37.8 |       78.0 |       16.8 |

## Detalle de los 10 desayunos

## BO01 - Bowl de skyr, avena y plátano con whey

1. `Skyr natural` - 250 g (`LACTEO_BASE`)
2. `Avena (copos)` - 60 g (`CARBO_AVENA`)
3. `Plátano` - 150 g (`FRUTA`)
4. `Proteína whey aislada 90%` - 20 g (`SUPLEMENTO_PROTEINA`)
5. `Mantequilla de cacahuete` - 15 g (`GRASA_CREMAS`)

## BO02 - Tostadas integrales con pavo, tomate y naranja

1. `Pan integral` - 120 g (`CARBO_PAN`)
2. `Pechuga de pavo (fiambre)` - 120 g (`PROTEINA_ANIMAL_MAGRA`)
3. `Tomate` - 120 g (`VERDURA`)
4. `Aceite de oliva` - 8 g (`GRASA_ACEITE`)
5. `Naranja` - 180 g (`FRUTA`)

## BO03 - Tortilla mixta con pan de espelta y kiwi

1. `Huevo de gallina` - 120 g (`HUEVO`)
2. `Clara de huevo` - 180 g (`CLARAS/HUEVO`)
3. `Pan de espelta` - 70 g (`CARBO_PAN`)
4. `Champiñones` - 120 g (`VERDURA`)
5. `Kiwi` - 150 g (`FRUTA`)
6. `Aceite de oliva` - 5 g (`GRASA_ACEITE`)

## BO04 - Porridge proteico con arándanos y almendras

1. `Avena instantánea` - 65 g (`CARBO_AVENA`)
2. `Proteína whey aislada 90%` - 30 g (`SUPLEMENTO_PROTEINA`)
3. `Leche semidesnatada` - 200 g (`LACTEO_BASE`)
4. `Arándanos` - 100 g (`FRUTA`)
5. `Almendras` - 15 g (`GRASA_FRUTOS_SECOS`)

## BO05 - Arepa con pollo, cottage y pera

1. `Arepa` - 90 g (`CARBO_PAN`)
2. `Pechuga de pollo` - 110 g (`PROTEINA_ANIMAL_MAGRA`)
3. `Queso cottage` - 100 g (`LACTEO_PROTEICO_MAGRO`)
4. `Espinacas` - 80 g (`VERDURA`)
5. `Pera` - 160 g (`FRUTA`)
6. `Aceite de oliva` - 5 g (`GRASA_ACEITE`)

## BO06 - Bagel con revuelto de huevo y claras + fresas

1. `Bagel` - 100 g (`CARBO_PAN`)
2. `Clara de huevo` - 200 g (`CLARAS/HUEVO`)
3. `Huevo de gallina` - 60 g (`HUEVO`)
4. `Queso crema light` - 50 g (`LACTEO_PROTEICO_MAGRO`)
5. `Fresas` - 200 g (`FRUTA`)

## BO07 - Pita integral con jamón cocido, batido 0% y kiwi

1. `Pita integral` - 100 g (`CARBO_PAN`)
2. `Jamón cocido` - 90 g (`PROTEINA_ANIMAL_MAGRA`)
3. `Queso fresco batido 0%` - 150 g (`LACTEO_PROTEICO_MAGRO`)
4. `Tomate` - 120 g (`VERDURA`)
5. `Kiwi` - 120 g (`FRUTA`)
6. `Aceite de oliva` - 6 g (`GRASA_ACEITE`)

## BO08 - Yogur desnatado con corn flakes, whey, manzana y avellanas

1. `Yogur natural desnatado` - 250 g (`LACTEO_BASE`)
2. `Corn flakes` - 55 g (`CARBO_RAPIDO`)
3. `Proteína whey aislada 90%` - 25 g (`SUPLEMENTO_PROTEINA`)
4. `Manzana` - 180 g (`FRUTA`)
5. `Avellanas` - 12 g (`GRASA_FRUTOS_SECOS`)

## BO09 - Pan proteico con pavo, huevo y rúcula + naranja

1. `Pan proteico` - 100 g (`CARBO_PAN`)
2. `Pavo pechuga` - 100 g (`PROTEINA_ANIMAL_MAGRA`)
3. `Huevo de gallina` - 80 g (`HUEVO`)
4. `Rúcula` - 70 g (`VERDURA`)
5. `Naranja` - 200 g (`FRUTA`)
6. `Aceite de oliva` - 4 g (`GRASA_ACEITE`)

## BO10 - Bowl post-entreno de arroz inflado, whey y plátano

1. `Proteína whey aislada 90%` - 30 g (`SUPLEMENTO_PROTEINA`)
2. `Arroz inflado` - 45 g (`CARBO_RAPIDO`)
3. `Leche semidesnatada` - 250 g (`LACTEO_BASE`)
4. `Plátano` - 180 g (`FRUTA`)
5. `Mantequilla de cacahuete` - 12 g (`GRASA_CREMAS`)

## Criterio de diseño aplicado

- Todos los desayunos tienen base coherente de desayuno real (lácteo/avena/huevo/pan/fruta).
- Se evita usar combinaciones raras de cena/comida para desayuno.
- Se mantiene variedad de formatos: bowl, tostada, tortilla, porridge, arepa, bagel, pita.
- Se prioriza proteína suficiente y carbohidrato útil para día de entreno sin perder coherencia culinaria.
