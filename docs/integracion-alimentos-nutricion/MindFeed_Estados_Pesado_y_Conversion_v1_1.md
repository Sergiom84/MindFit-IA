# MindFeed - Estados de pesado y conversión (crudo/cocido/escurrido/tal_cual)

Versión 1.1 | 2026-02-04

## Especificación de Estados de Pesado y Conversión de Gramos

Módulo de Alimentos y Generador de Dietas (MindFeed)

### 1. Objetivo

Definir una lógica única para manejar alimentos en diferentes estados de pesado (crudo, cocido, escurrido y tal_cual) en la base de datos y en la dieta mostrada al usuario. Se busca (1) cero confusión para el usuario y (2) cálculos consistentes para el motor.

### 2. Dos dimensiones distintas (no mezclar)

- Estado de pesado: afecta a gramos (crudo/cocido/escurrido/seco/tal_cual). Solo esto usa factores.
- Método de preparación: plancha/horno/frito/procesado/conserva. Es informativo y de UX; no sirve para convertir gramos.

### 3. Campos (modelo de datos)

- estado_pesado_base: estado de pesado en el que están definidos los macros (por 100 g).
- estado_pesado_mostrado: estado que se muestra en la dieta al usuario.
- tipo_peso: etiqueta visible (crudo/cocido/escurrido/tal_cual). Debe mostrarse siempre.
- metodo_preparacion: plancha/horno/frito/procesado/conserva (opcional).
- grupo_factor: clave para buscar el factor en la tabla Factores_Cocción.
- factor_base_objetivo: factor de conversión Base -> Objetivo.
- ID_alimento: slug estable.
- sustituible_por_ID: lista de IDs alternativos.

### 4. Reglas de oro (no negociables)

- Regla 1: La dieta siempre muestra el estado de pesado: "Arroz (crudo)" / "Atún (escurrido)" / "Pan (tal_cual)".
- Regla 2: Los macros se calculan siempre en estado_pesado_base. La conversión solo cambia gramos.
- Regla 3: Si el usuario registra en un estado distinto, se convierte primero a gramos_base antes de sumar macros.
- Regla 4: Si el alimento es tal_cual, se fuerza factor=1 y no se permite convertir (no tiene sentido).
- Regla 5: Si falta factor para un par base/objetivo, se bloquea conversión (prohibido inventar).

### 5. Fórmulas de conversión

Base -> Objetivo:

```
gramos_objetivo = gramos_base x factor_base_objetivo
```

Objetivo -> Base:

```
gramos_base = gramos_objetivo / factor_base_objetivo
```

Nota: factores < 1 = merma; factores > 1 = absorción de agua.

### 6. Tabla de factores (ejemplo)

| Grupo_factor  | Estado_base | Estado_objetivo | Factor | Ejemplo                    |
| ------------- | ----------- | --------------- | ------ | -------------------------- |
| arroz         | crudo       | cocido          | 2,5    | 100 g crudo ~ 250 g cocido |
| pasta         | crudo       | cocido          | 2,3    | 100 g crudo ~ 230 g cocido |
| legumbre_seca | seco        | cocido          | 2,2    | 100 g seco ~ 220 g cocido  |
| carne         | crudo       | cocido          | 0,75   | 100 g crudo ~ 75 g cocido  |

### 7. Flujo al generar dieta (motor)

1. Elegir alimento (ID) y sus macros por 100 g en estado_pesado_base.
2. Calcular gramos_base para cumplir el objetivo de macros de la comida.
3. Definir estado_pesado_mostrado por preferencia (carbos en cocido, conservas en escurrido, etc.).
4. Si base != mostrado y tipo_peso != tal_cual: convertir gramos con el factor (Base->Objetivo).
5. Mostrar en dieta: "Nombre (estado) - gramos_objetivo" y guardar ambos valores (base y mostrado).

### 8. Checklist mínimo de QA

- Arroz: misma comida calculada en crudo vs cocido debe dar mismos macros (solo cambia gramos mostrados).
- Carne: factor < 1 aplica bien (cocido pesa menos).
- Registro: usuario introduce gramos en cocido y el motor suma macros equivalentes en base.
- tal_cual: pan/fruta no ofrecen selector crudo/cocido; no hay conversión.
- Sin factor: la app bloquea y no inventa.
