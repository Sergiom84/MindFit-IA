# Migraciones de Base de Datos - MindFeed

Este directorio contiene las migraciones SQL para integrar el sistema MindFeed en la aplicación.

## Migraciones disponibles

Nota: en este directorio solo deben tratarse como migraciones los archivos con prefijo de versión (`YYYYMMDDHHMMSS_nombre.sql`).
`EJECUTAR_ESTO_EN_SUPABASE.sql` es un helper manual y no forma parte del historial versionado.

### 1. `20260206000001_add_mindfeed_fields_to_foods.sql`

**Ampliar tabla `app.foods` con campos MindFeed**

Añade los siguientes campos:

- `slug` - Identificador único estable (ID_alimento del Excel)
- `fibra_100g` - Fibra dietética por 100g
- `porcion_tipica_g` - Porción típica en gramos
- `estado_pesado_base` - Estado en el que están definidos los macros
- `estado_pesado_mostrado_default` - Estado por defecto para mostrar
- `metodo_preparacion` - Método de preparación
- `grupo_factor` - Grupo de factor de conversión
- `categoria_detalle` - Categoría específica MindFeed
- `is_vegetarian` - Flag para dieta vegetariana
- `is_vegan` - Flag para dieta vegana
- `medida_casera` - Equivalencia en medida casera
- `tipo_dieta` - Clasificación de dieta

**Constraints añadidos:**

- CHECK para estados de pesado (crudo/cocido/escurrido/seco/tal_cual)
- UNIQUE constraint en slug
- Índices para mejorar rendimiento

### 2. `20260206000002_create_food_conversion_factors.sql`

**Crear tabla `app.food_conversion_factors`**

Tabla para almacenar factores de conversión entre estados de pesado.

**Campos:**

- `grupo_factor` - Grupo de alimentos (arroz, pasta, carne, etc.)
- `estado_base` - Estado de origen
- `estado_objetivo` - Estado de destino
- `factor_base_objetivo` - Multiplicador de conversión
- `nota` - Notas sobre el factor

**Datos iniciales incluidos:**

- Arroz: crudo ↔ cocido (2.5x / 0.4x)
- Pasta: crudo ↔ cocido (2.3x / 0.43x)
- Legumbre seca: seco ↔ cocido (2.2x / 0.45x)
- Carne: crudo ↔ cocido (0.75x / 1.33x)

### 3. `20260206000003_prepare_nutrition_meal_items.sql`

**Preparar tabla `app.nutrition_meal_items`**

Añade campos necesarios para persistir items de menús con referencias a alimentos y estados de pesado.

**Campos añadidos:**

- `food_id` - Referencia a app.foods
- `estado_pesado_base` - Estado base del alimento
- `estado_pesado_mostrado` - Estado mostrado al usuario
- `cantidad_g_base` - Cantidad en gramos en estado base
- `cantidad_g_mostrada` - Cantidad en gramos en estado mostrado

---

## Cómo aplicar las migraciones

### Opción 1: Dashboard de Supabase (Recomendado)

1. Acceder a [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Seleccionar tu proyecto
3. Ir a **SQL Editor**
4. Copiar y pegar el contenido de cada archivo `.sql` **en orden**
5. Ejecutar cada migración haciendo clic en "Run"

### Opción 2: Desde el Backend (Node.js)

Ejecutar el script de migraciones:

```bash
cd backend
node scripts/run-migrations.js
```

### Opción 3: Supabase CLI

Si tienes Supabase CLI instalado:

```bash
# Aplicar todas las migraciones pendientes
supabase db push

# O ejecutar manualmente cada una
psql $DATABASE_URL -f supabase/migrations/20260206000001_add_mindfeed_fields_to_foods.sql
psql $DATABASE_URL -f supabase/migrations/20260206000002_create_food_conversion_factors.sql
psql $DATABASE_URL -f supabase/migrations/20260206000003_prepare_nutrition_meal_items.sql
```

---

## Verificar que las migraciones se aplicaron correctamente

Ejecutar en SQL Editor:

```sql
-- Verificar nuevos campos en app.foods
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'app'
  AND table_name = 'foods'
ORDER BY ordinal_position;

-- Verificar tabla de factores de conversión
SELECT * FROM app.food_conversion_factors;

-- Verificar campos en nutrition_meal_items (si existe)
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'app'
  AND table_name = 'nutrition_meal_items'
  AND column_name IN ('food_id', 'estado_pesado_base', 'estado_pesado_mostrado', 'cantidad_g_base', 'cantidad_g_mostrada');
```

---

## Rollback (si es necesario)

Si necesitas revertir alguna migración:

```sql
-- Revertir migración 1 (campos en app.foods)
ALTER TABLE app.foods
  DROP COLUMN IF EXISTS slug,
  DROP COLUMN IF EXISTS fibra_100g,
  DROP COLUMN IF EXISTS porcion_tipica_g,
  DROP COLUMN IF EXISTS estado_pesado_base,
  DROP COLUMN IF EXISTS estado_pesado_mostrado_default,
  DROP COLUMN IF EXISTS metodo_preparacion,
  DROP COLUMN IF EXISTS grupo_factor,
  DROP COLUMN IF EXISTS categoria_detalle,
  DROP COLUMN IF EXISTS is_vegetarian,
  DROP COLUMN IF EXISTS is_vegan,
  DROP COLUMN IF EXISTS medida_casera,
  DROP COLUMN IF EXISTS tipo_dieta;

-- Revertir migración 2 (tabla de factores)
DROP TABLE IF EXISTS app.food_conversion_factors CASCADE;

-- Revertir migración 3 (campos en meal_items)
ALTER TABLE app.nutrition_meal_items
  DROP COLUMN IF EXISTS food_id,
  DROP COLUMN IF EXISTS estado_pesado_base,
  DROP COLUMN IF EXISTS estado_pesado_mostrado,
  DROP COLUMN IF EXISTS cantidad_g_base,
  DROP COLUMN IF EXISTS cantidad_g_mostrada;
```

---

## Siguiente paso: Importar datos

Después de aplicar estas migraciones, ejecutar el script de importación:

```bash
python scripts/import_mindfeed_data.py
```

Este script cargará:

- alimentos desde `Módulo Nutrición/Base alimentos.xlsx` (UPSERT por `slug`)
- campos MindFeed asociados en `app.foods` (estado/base, dieta, fibra, etc.)

La carga de factores de conversión se realiza desde la migración
`20260206000002_create_food_conversion_factors.sql`.

---

## Actualización Fase 6 (Biblioteca de platos)

Nueva migración:

- `20260206000004_create_meal_template_library.sql`

Tablas nuevas:

- `app.meal_templates`
- `app.meal_template_slots`
- `app.food_roles`

Importador de biblioteca:

```bash
python scripts/import_meal_templates.py
```

Verificación rápida:

```sql
SELECT COUNT(*) AS templates FROM app.meal_templates;
SELECT COUNT(*) AS slots FROM app.meal_template_slots;
SELECT COUNT(*) AS food_roles FROM app.food_roles;
```
