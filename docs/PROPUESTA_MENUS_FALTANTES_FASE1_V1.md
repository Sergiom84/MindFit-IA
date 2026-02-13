# Propuesta menús faltantes Fase 1 (v1)

Fecha: 13.02.2026  
Estado: Borrador para revisión funcional (sin migración aplicada)  
Objetivo: cubrir los huecos actuales de Fase 1 con menús culinariamente coherentes y aptos para el motor `recipe_examples`.

## Criterio aplicado

- Se crean `30` menús nuevos (los tipos deficitarios):

1. `DESAYUNO`: 2
2. `CENA`: 8
3. `SNACK`: 20

- Se evita la lógica de “mezclar alimentos raros” solo por macro.
- Cada propuesta tiene estructura de plato real y combinaciones típicas.
- Los gramos son base orientativa para revisión; en generación final el solver ajustará por objetivo diario.

## Resumen de cobertura de esta propuesta

1. `DESAYUNO`: `+2` (`NORMO +1`, `VOLUMEN +1`)
2. `CENA`: `+8` (`AMBOS +6`, `ENTRENO +2`)
3. `SNACK`: `+20` (`AMBOS +11`, `DEFINICION +4`, `ENTRENO +1`, `NORMO +2`, `VOLUMEN +2`)

## 1) DESAYUNO (2)

### BN01 (DESAYUNO, NORMO)

**Tostada integral con aguacate, huevo y pavo**

1. Pan integral - 90 g
2. Aguacate - 60 g
3. Huevo - 100 g
4. Pechuga de pavo - 80 g
5. Tomate - 100 g

### BV01 (DESAYUNO, VOLUMEN)

**Overnight oats de plátano, yogur y crema de cacahuete**

1. Avena en copos - 80 g
2. Yogur griego natural - 220 g
3. Plátano - 160 g
4. Mantequilla de cacahuete - 18 g
5. Miel - 10 g

## 2) CENA (8)

### DA01 (CENA, AMBOS)

**Salmón al horno con patata y espárragos**

1. Salmón - 170 g
2. Patata - 240 g
3. Espárragos verdes - 150 g
4. Aceite de oliva - 8 g
5. Limón - 20 g

### DA02 (CENA, AMBOS)

**Wok de pavo con arroz jazmín y verduras**

1. Pechuga de pavo - 180 g
2. Arroz jazmín cocido - 190 g
3. Calabacín - 140 g
4. Pimiento rojo - 120 g
5. Aceite de oliva - 8 g

### DA03 (CENA, AMBOS)

**Merluza a la plancha con boniato asado y ensalada fresca**

1. Merluza - 220 g
2. Boniato - 220 g
3. Lechuga romana - 100 g
4. Pepino - 100 g
5. Aceite de oliva - 8 g

### DA04 (CENA, AMBOS)

**Tortilla de patata ligera con ensalada y queso fresco**

1. Huevo - 150 g
2. Clara de huevo - 120 g
3. Patata cocida - 180 g
4. Queso fresco batido 0% - 100 g
5. Tomate - 120 g

### DA05 (CENA, AMBOS)

**Ternera salteada con cuscús integral y pimientos**

1. Ternera magra - 170 g
2. Cuscús integral cocido - 180 g
3. Pimiento verde - 120 g
4. Cebolla - 80 g
5. Aceite de oliva - 8 g

### DA06 (CENA, AMBOS)

**Pollo al limón con arroz basmati y calabacín**

1. Pechuga de pollo - 190 g
2. Arroz basmati cocido - 190 g
3. Calabacín - 180 g
4. Aceite de oliva - 8 g
5. Limón - 20 g

### DE01 (CENA, ENTRENO)

**Bowl de arroz blanco con atún, huevo y tomate**

1. Arroz blanco cocido - 220 g
2. Atún al natural - 140 g
3. Huevo - 60 g
4. Tomate - 130 g
5. Aceite de oliva - 6 g

### DE02 (CENA, ENTRENO)

**Pasta integral con pollo y pesto ligero**

1. Pasta integral cocida - 220 g
2. Pechuga de pollo - 170 g
3. Tomate cherry - 120 g
4. Albahaca - 10 g
5. Aceite de oliva - 8 g

## 3) SNACK (20)

### SA01 (SNACK, AMBOS)

**Yogur griego con frutos rojos y granola**

1. Yogur griego natural - 220 g
2. Frutos rojos - 120 g
3. Granola - 35 g
4. Almendras - 10 g

### SA02 (SNACK, AMBOS)

**Tostada integral de hummus y pavo**

1. Pan integral - 80 g
2. Hummus - 50 g
3. Pechuga de pavo - 90 g
4. Rúcula - 40 g

### SA03 (SNACK, AMBOS)

**Batido de leche, plátano, avena y whey**

1. Leche semidesnatada - 280 g
2. Plátano - 140 g
3. Avena - 35 g
4. Proteína whey - 25 g

### SA04 (SNACK, AMBOS)

**Requesón con piña y nueces**

1. Requesón - 220 g
2. Piña natural - 180 g
3. Nueces - 12 g

### SA05 (SNACK, AMBOS)

**Sándwich integral de atún y tomate**

1. Pan integral - 90 g
2. Atún al natural - 100 g
3. Tomate - 100 g
4. Aceite de oliva - 6 g

### SA06 (SNACK, AMBOS)

**Tortitas de avena con queso batido y fresas**

1. Avena - 45 g
2. Huevo - 60 g
3. Queso fresco batido 0% - 170 g
4. Fresas - 160 g

### SA07 (SNACK, AMBOS)

**Skyr con kiwi y almendras**

1. Skyr natural - 250 g
2. Kiwi - 150 g
3. Almendras - 14 g

### SA08 (SNACK, AMBOS)

**Wrap integral de pollo y hojas verdes**

1. Tortilla integral - 70 g
2. Pechuga de pollo - 120 g
3. Lechuga romana - 60 g
4. Tomate - 80 g
5. Yogur natural - 60 g

### SA09 (SNACK, AMBOS)

**Queso batido con mango y chía**

1. Queso fresco batido 0% - 240 g
2. Mango - 160 g
3. Semillas de chía - 10 g

### SA10 (SNACK, AMBOS)

**Pan de centeno con tortilla francesa y aguacate**

1. Pan de centeno - 80 g
2. Huevo - 100 g
3. Aguacate - 50 g
4. Espinaca - 40 g

### SA11 (SNACK, AMBOS)

**Kéfir con manzana y nueces**

1. Kéfir natural - 260 g
2. Manzana - 170 g
3. Nueces - 12 g
4. Canela - 2 g

### SD01 (SNACK, DEFINICION)

**Crudités con hummus y huevo cocido**

1. Zanahoria - 120 g
2. Pepino - 120 g
3. Hummus - 45 g
4. Huevo cocido - 60 g

### SD02 (SNACK, DEFINICION)

**Skyr con frambuesas y nuez**

1. Skyr natural - 250 g
2. Frambuesas - 120 g
3. Nueces - 8 g

### SD03 (SNACK, DEFINICION)

**Rollitos de pavo y queso light con tomate cherry**

1. Pechuga de pavo - 120 g
2. Queso light en lonchas - 40 g
3. Tomate cherry - 150 g
4. Aceite de oliva - 4 g

### SD04 (SNACK, DEFINICION)

**Ensalada ligera de atún y garbanzo**

1. Atún al natural - 100 g
2. Garbanzo cocido - 80 g
3. Lechuga romana - 80 g
4. Pepino - 80 g
5. Limón - 15 g

### SE01 (SNACK, ENTRENO)

**Bagel mini con crema de cacahuete y whey**

1. Bagel - 80 g
2. Mantequilla de cacahuete - 18 g
3. Proteína whey - 25 g
4. Plátano - 100 g

### SN01 (SNACK, NORMO)

**Yogur natural con avena y pera**

1. Yogur natural - 220 g
2. Avena - 30 g
3. Pera - 160 g
4. Almendras - 8 g

### SN02 (SNACK, NORMO)

**Tosta de queso fresco, miel y nueces**

1. Pan integral - 70 g
2. Queso fresco - 100 g
3. Miel - 8 g
4. Nueces - 10 g

### SV01 (SNACK, VOLUMEN)

**Batido energético de avena, plátano y whey**

1. Leche semidesnatada - 320 g
2. Avena - 55 g
3. Plátano - 170 g
4. Proteína whey - 25 g
5. Mantequilla de cacahuete - 14 g

### SV02 (SNACK, VOLUMEN)

**Bocadillo integral de pavo y queso + fruta**

1. Pan integral - 120 g
2. Pechuga de pavo - 100 g
3. Queso semicurado - 35 g
4. Tomate - 70 g
5. Naranja - 180 g

## Observaciones para migración posterior

1. Mantener estos códigos (`BN01`, `BV01`, `DA..`, `SA..`) como `template_code`/alias de carga para trazabilidad.
2. En inserción SQL, guardar `meal_type` y `day_context` exactamente como aquí.
3. Antes de activar en producción, correr QA rápido de viabilidad (alérgenos, reglas de meal-type y tolerancia de solver).
