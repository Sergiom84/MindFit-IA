# Especificación de macros por perfil metabólico y fase

**Versión para implementación semanal**

## Objetivo

Este documento deja cerrada la lógica de distribución de macronutrientes para el módulo de nutrición de MindFeed.

Se distinguen dos capas:

1. Lo actualmente designado en la documentación base por perfil metabólico.
2. La modificación correcta para implementación, añadiendo ajuste por fase:
   - Definición
   - Normocalórica
   - Superávit / Volumen

> **Nota importante**
> En la documentación revisada, los porcentajes aparecen definidos por perfil metabólico, pero no queda formalizada una tabla final por fase.
> Este documento cierra esa parte para que no haya interpretación libre en desarrollo.

---

## 1. Porcentajes actualmente designados en la documentación

### 1.1 Tolerante a los carbohidratos

- **Proteínas:** 20-25%
- **Carbohidratos:** 50-60%
- **Grasas:** 15-25%

### 1.2 Intolerante a los carbohidratos

- **Proteínas:** 30-35%
- **Carbohidratos:** 20-30%
- **Grasas:** 35-45%

### 1.3 Equilibrado o mixto

- **Proteínas:** 25-30%
- **Carbohidratos:** 35-40%
- **Grasas:** 30-35%

---

## 2. Criterio de corrección para implementación

### Regla general

El perfil metabólico define la plantilla base.
La fase modifica esa plantilla.

### Qué debe pasar

- **Definición:** subir ligeramente proteína, controlar carbohidratos, mantener grasas suficientes.
- **Normocalórica:** usar el reparto base optimizado.
- **Superávit / Volumen:** subir carbohidratos, no disparar proteína, mantener grasas en rango útil.

### Qué no debe pasar

- Usar el mismo reparto porcentual en definición, normocalórica y volumen.
- Mantener proteínas exageradamente altas en todos los casos.
- Dejar a criterio del desarrollador cómo mover los porcentajes según fase.

---

## 3. Tabla final recomendada para implementación

| Perfil metabólico   | Fase                | Proteínas | Carbohidratos | Grasas |
| ------------------- | ------------------- | --------: | ------------: | -----: |
| Tolerante           | Definición          |       28% |           47% |    25% |
| Tolerante           | Normocalórica       |       25% |           55% |    20% |
| Tolerante           | Superávit / Volumen |       23% |           57% |    20% |
| Equilibrado / Mixto | Definición          |       28% |           32% |    40% |
| Equilibrado / Mixto | Normocalórica       |       25% |           40% |    35% |
| Equilibrado / Mixto | Superávit / Volumen |       23% |           47% |    30% |
| Intolerante         | Definición          |       30% |           22% |    48% |
| Intolerante         | Normocalórica       |       27% |           28% |    45% |
| Intolerante         | Superávit / Volumen |       25% |           35% |    40% |

---

## 4. Lectura práctica de la tabla

### 4.1 Perfil tolerante a carbohidratos

Usuario con buena respuesta a carbohidratos, buena sensibilidad y mayor facilidad para rendir con dietas altas en hidratos.

#### Definición

- **Proteínas:** 28%
- **Carbohidratos:** 47%
- **Grasas:** 25%

**Interpretación:** en definición se mantiene proteína alta para preservar masa muscular, pero sin tirar los carbohidratos demasiado abajo.

#### Normocalórica

- **Proteínas:** 25%
- **Carbohidratos:** 55%
- **Grasas:** 20%

**Interpretación:** reparto base para mantenimiento y rendimiento.

#### Superávit / Volumen

- **Proteínas:** 23%
- **Carbohidratos:** 57%
- **Grasas:** 20%

**Interpretación:** el superávit debe ir principalmente por carbohidratos. No tiene sentido inflar proteína ni grasa si el usuario tolera bien los hidratos.

### 4.2 Perfil equilibrado o mixto

Usuario con tolerancia intermedia a carbohidratos y buena flexibilidad metabólica.

#### Definición

- **Proteínas:** 28%
- **Carbohidratos:** 32%
- **Grasas:** 40%

**Interpretación:** proteína alta y reducción moderada de hidratos, manteniendo grasas suficientes para adherencia y estabilidad.

#### Normocalórica

- **Proteínas:** 25%
- **Carbohidratos:** 40%
- **Grasas:** 35%

**Interpretación:** reparto estable y flexible, adecuado como base.

#### Superávit / Volumen

- **Proteínas:** 23%
- **Carbohidratos:** 47%
- **Grasas:** 30%

**Interpretación:** en volumen se empuja el reparto hacia más hidratos, sin salir de un perfil equilibrado.

### 4.3 Perfil intolerante a carbohidratos

Usuario con peor respuesta percibida a carbohidratos y mayor tendencia a manejar mejor grasas como fuente energética.

#### Definición

- **Proteínas:** 30%
- **Carbohidratos:** 22%
- **Grasas:** 48%

**Interpretación:** definición con proteína alta y carbohidrato controlado, priorizando adherencia y estabilidad energética.

#### Normocalórica

- **Proteínas:** 27%
- **Carbohidratos:** 28%
- **Grasas:** 45%

**Interpretación:** mantenimiento con grasas altas y carbohidrato moderado-bajo.

#### Superávit / Volumen

- **Proteínas:** 25%
- **Carbohidratos:** 35%
- **Grasas:** 40%

**Interpretación:** incluso en volumen, los carbohidratos suben respecto a mantenimiento, pero sin llegar a un perfil alto en hidratos.

---

## 5. Reglas de implementación obligatorias

### 5.1 Orden lógico del cálculo

1. Calcular TMB / BMR.
2. Calcular GCT / TDEE.
3. Aplicar fase calórica:
   - **Definición** = déficit
   - **Normocalórica** = mantenimiento
   - **Superávit / Volumen** = superávit
4. Identificar perfil metabólico:
   - Tolerante
   - Equilibrado / Mixto
   - Intolerante
5. Aplicar la tabla final perfil + fase.
6. Convertir porcentajes en gramos finales.

### 5.2 Conversión a gramos

- **Proteínas:** kcal_proteína / 4
- **Carbohidratos:** kcal_carbohidratos / 4
- **Grasas:** kcal_grasas / 9

### 5.3 Guardarraíl de proteína

Aunque la tabla use porcentajes, el sistema debe vigilar que la proteína en gramos no quede fuera de rango lógico.

**Recomendación:**

- **Definición:** entre 2,0 y 2,4 g/kg
- **Normocalórica:** entre 1,6 y 2,2 g/kg
- **Superávit / Volumen:** entre 1,6 y 2,0 g/kg

Si el porcentaje calculado deja la proteína fuera de ese rango, se puede aplicar un ajuste fino.

---

## 6. Motivo del cambio respecto al documento actual

La documentación original define bien los perfiles metabólicos, pero deja una ambigüedad importante:

- fija porcentajes por perfil
- pero no deja cerrada la modificación por fase

Eso puede hacer que desarrollo interprete dos cosas distintas:

1. usar siempre los mismos porcentajes y solo tocar calorías
2. mover porcentajes “a criterio”

Este documento elimina esa ambigüedad y deja una tabla única para implementar.

---

## 7. Decisión final

### Esto es lo que se implementa

- Sí, los porcentajes de macros cambian según la fase.
- Sí, también cambian según el perfil metabólico.
- La tabla del apartado 3 es la referencia única para desarrollo.

### Esto es lo que no se implementa

- No se usan porcentajes fijos por perfil para todas las fases.
- No se deja la adaptación a criterio manual.
- No se sobredimensiona proteína en perfiles tolerantes o mixtos durante volumen.
