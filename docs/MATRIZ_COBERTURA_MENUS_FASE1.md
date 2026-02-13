# Matriz de Cobertura Menús Fase 1

Fecha: 13.02.2026  
Objetivo: cerrar criterio de volumen (`50 menús por comida`) + cobertura por contexto y habilitar migración progresiva del Excel para pruebas reales.

## 1) Decisión operativa recomendada

- Sí, debemos medir **por los dos ejes**:

1. `meal_type` (DESAYUNO, COMIDA, CENA, SNACK)
2. `day_context` (AMBOS, DEFINICION, ENTRENO, NORMO, VOLUMEN)

- Regla objetivo Fase 1 (por cada `meal_type`, total 50):

1. `AMBOS`: 20
2. `DEFINICION`: 10
3. `ENTRENO`: 10
4. `NORMO`: 5
5. `VOLUMEN`: 5

## 2) Inventario actual (Excel v2.2, hoja `Ejemplos`)

- Total ejemplos: `192`
- Reparto por comida:

1. `DESAYUNO`: 48
2. `COMIDA`: 72
3. `CENA`: 42
4. `SNACK`: 30

- Reparto por contexto global:

1. `AMBOS`: 54
2. `DEFINICION`: 54
3. `ENTRENO`: 36
4. `NORMO`: 30
5. `VOLUMEN`: 18

## 3) Matriz actual vs objetivo (50 por comida)

Formato por celda: `actual / objetivo (gap)`

### DESAYUNO

1. `AMBOS`: `24 / 20 (+4)`
2. `DEFINICION`: `9 / 10 (-1)`
3. `ENTRENO`: `9 / 10 (-1)`
4. `NORMO`: `3 / 5 (-2)`
5. `VOLUMEN`: `3 / 5 (-2)`
6. Total: `48 / 50 (-2)`

### COMIDA

1. `AMBOS`: `21 / 20 (+1)`
2. `DEFINICION`: `18 / 10 (+8)`
3. `ENTRENO`: `12 / 10 (+2)`
4. `NORMO`: `12 / 5 (+7)`
5. `VOLUMEN`: `9 / 5 (+4)`
6. Total: `72 / 50 (+22)`

### CENA

1. `AMBOS`: `0 / 20 (-20)`
2. `DEFINICION`: `21 / 10 (+11)`
3. `ENTRENO`: `6 / 10 (-4)`
4. `NORMO`: `12 / 5 (+7)`
5. `VOLUMEN`: `3 / 5 (-2)`
6. Total: `42 / 50 (-8)`

### SNACK

1. `AMBOS`: `9 / 20 (-11)`
2. `DEFINICION`: `6 / 10 (-4)`
3. `ENTRENO`: `9 / 10 (-1)`
4. `NORMO`: `3 / 5 (-2)`
5. `VOLUMEN`: `3 / 5 (-2)`
6. Total: `30 / 50 (-20)`

## 4) Lectura rápida (prioridades de creación)

### Prioridad crítica

1. `CENA + AMBOS` (gap `-20`)
2. `SNACK + AMBOS` (gap `-11`)

### Prioridad alta

1. `SNACK + DEFINICION` (gap `-4`)
2. `CENA + ENTRENO` (gap `-4`)

### Prioridad media

1. `DESAYUNO` (faltan `2` en total, sobre todo `NORMO/VOLUMEN`)
2. `SNACK + NORMO/VOLUMEN` (gap `-2 / -2`)
3. `CENA + VOLUMEN` (gap `-2`)

## 5) ¿Podemos migrar ya lo del Excel para ir probando?

Sí. Recomendación profesional: **migración progresiva con “seed + curación”**.

1. Migrar los `192` ejemplos a tablas de recetas (`recipes`, `recipe_items`, `recipe_tags`) como dataset inicial.
2. Marcar recetas importadas con:
   - `source = 'excel_v2_2'`
   - `status = 'draft'` (o `is_active = false`) en primera carga.
3. Activar primero un subconjunto curado por prioridad:
   - `DESAYUNO`: 30
   - `COMIDA`: 30
   - `CENA`: 30 (enfatizando `AMBOS`)
   - `SNACK`: 30 (enfatizando `AMBOS`)
4. Ejecutar QA de generación real (100-200 generaciones) y promover a `is_active = true` las recetas aprobadas.
5. Completar gaps con recetas nuevas hasta cerrar el objetivo `50 x meal_type`.

## 6) Plan de ejecución recomendado (corto)

1. Importar Excel a staging de recetas (sin activar todo en producción).
2. Activar solo subset curado para pruebas internas.
3. Medir calidad (coherencia + tolerancia macros).
4. Rellenar gaps de la matriz (sobre todo `CENA/SNACK` en `AMBOS`).
5. Pasar a 50 por comida con cobertura por contexto cerrada.

## 7) Criterio de salida de Fase 1

1. `>= 50` recetas activas por `meal_type`.
2. Cobertura mínima por contexto cumplida según matriz objetivo.
3. Tasa de menú “coherente culinariamente” `>= 90%` en QA interno.
4. Tasa de cumplimiento de tolerancia diaria de kcal/macros `>= 95%`.
