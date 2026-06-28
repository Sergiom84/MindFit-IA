# MindFeed / MindFit - Incidencias y ajustes propuestos del módulo de Nutrición

> Documento reformateado a Markdown a partir de `MindFeed_Incidencias_Nutricion_v2.pdf`.
>
> **Versión fuente:** borrador v2  
> **Fecha del documento:** 2026-03-05  
> **Objetivo:** documento corto y accionable para desarrollo

## Contexto de prueba

Caso reproducible usado como referencia en el documento:

| Campo                                              | Valor                                                  |
| -------------------------------------------------- | ------------------------------------------------------ |
| Usuario de referencia                              | Varón, 43 años                                         |
| Peso                                               | 80 kg                                                  |
| Altura                                             | 1,72 m                                                 |
| Medidas para composición                           | Cintura 90 cm, cuello 34 cm                            |
| Mejora propuesta                                   | Añadir perímetro de muslo                              |
| Objetivo nutricional                               | Volumen / ganar masa muscular                          |
| Nivel de actividad seleccionado                    | Moderado (3-5 entrenos/semana, 7.500-10.000 pasos/día) |
| Comidas por día                                    | 4                                                      |
| Valor observado en la app                          | 3.768 kcal/día                                         |
| Valor observado con carb cycling en día de entreno | 3.920 kcal/día                                         |

## Resumen ejecutivo

| Punto | Tema                                                               | Prioridad | Tipo                 |
| ----- | ------------------------------------------------------------------ | --------- | -------------------- |
| 1     | Renombrar “Masa muscular” a “Masa magra” y valorar muslo opcional  | Media     | UX / Terminología    |
| 2     | Sincronización entre perfil general y configuración nutricional    | Alta      | UX / Datos           |
| 3     | Aclarar duración del plan vs rango de visualización 7/14/21/28     | Media     | UX / Lógica          |
| 4     | Corregir desincronización de objetivo entre onboarding y nutrición | Alta      | Datos                |
| 5     | Revisar calorías objetivo y mejorar guía de actividad              | Alta      | Cálculo / Datos / UX |
| 6     | Definir claramente la lógica de carb cycling                       | Alta      | Cálculo / UX         |
| 7     | Cuestionario de perfil metabólico opcional para ajustar macros     | Media     | Producto / Datos     |
| 8     | Corregir gramajes incoherentes en generación de menús              | Alta      | Algoritmo / Datos    |

---

## 1) Composición corporal: cambiar “Masa muscular” por “Masa magra”

**Prioridad:** Media

### Dónde ocurre

- Perfil > Composición corporal > “Composición corporal detallada”.

### Qué pasa

El campo muestra **“Masa muscular (kg)”**, pero el valor encaja mejor con **masa magra / masa libre de grasa** que con músculo esquelético puro.

### Impacto

Genera confusión para usuario y equipo, porque la etiqueta promete una métrica más específica de la que realmente se está estimando.

### Propuesta

- Cambiar la etiqueta a **“Masa magra (kg)”**.
- Mantener el cálculo actual si ya está validado, pero corrigiendo el nombre.
- Como mejora opcional, añadir **perímetro de muslo** para afinar la estimación corporal si se sigue usando un método por perímetros.

### Criterios de aceptación

- La UI muestra **“Masa magra”** en lugar de **“Masa muscular”**.
- Si se añade el muslo:
  - el campo es opcional,
  - no bloquea el flujo,
  - se guarda,
  - y queda integrado o preparado para una v2 del cálculo.

---

## 2) Configuración nutricional: eliminar “Usar datos del perfil general” y dejar sincronización explícita

**Prioridad:** Alta

### Dónde ocurre

- Nutrición > Generar plan > Configuración nutricional.

### Qué pasa

Coexisten dos acciones: **“Guardar configuración”** y **“Usar datos del perfil general”**. Esto transmite que nutrición y perfil viven separados y obliga al usuario a gestionar una complejidad que no debería existir.

### Impacto

- Duplicación de estados.
- Desincronizaciones entre perfil y nutrición.
- Inconsistencias en objetivo, actividad, % de grasa meta y otros datos.

### Propuesta

- Por defecto, **Nutrición debe estar sincronizada con Perfil General** y compartir la misma fuente de verdad.
- Sustituir el botón por un indicador fijo: **“Sincronizado con perfil general”**.
- Si se quieren permitir excepciones, usar un toggle tipo **“Personalizar solo para nutrición”**, desactivado por defecto.
- Si existe override, dejarlo visible con estado **“No sincronizado”**.
- Unificar el modelo de datos o dejar muy claro cuándo hay override.

### Criterios de aceptación

- Ya no aparece el botón **“Usar datos del perfil general”**.
- Se muestra un estado visible: **“Sincronizado con perfil general”** o **“No sincronizado”**.
- Si el usuario cambia objetivo o actividad en Perfil, Nutrición lo refleja sin acciones manuales.

---

## 3) Duración del plan nutricional: aclarar el límite de 28 días y el significado de 7/14/21/28

**Prioridad:** Media

### Dónde ocurre

- Nutrición > Generar plan > Cálculo determinista del plan.

### Qué pasa

La UI indica **“Duración ajustada a 28 días”** y a la vez ofrece botones **7 / 14 / 21 / 28 días**. No queda claro si representan:

- la duración real del plan,
- una vista previa,
- o un filtro/rango del calendario.

### Impacto

- Sensación de limitación arbitraria.
- Riesgo de incoherencia con planes de entrenamiento más largos.

### Propuesta

Definir una única interpretación y reflejarla de forma inequívoca:

**Opción A (recomendada)**

- El plan puede durar lo mismo que el entrenamiento.
- Los botones **7 / 14 / 21 / 28** representan solo una **vista** o **rango de calendario**.

**Opción B**

- Si el plan nutricional realmente está limitado a 28 días:
  - eliminar o renombrar 7/14/21,
  - mostrar “Plan de 28 días”,
  - y separar el selector de vista por semana o tramo.

### Criterios de aceptación

- Los botones 7/14/21/28 tienen una etiqueta clara: **“Vista”** o **“Rango”**.
- No se mezclan duración real y visualización.
- Si el entrenamiento dura más de 28 días, la nutrición no se corta sin explicación.

---

## 4) Objetivo nutricional no sincronizado entre onboarding y nutrición

**Prioridad:** Alta

### Dónde ocurre

- Onboarding / cuestionario inicial.
- Nutrición > Generar plan > objetivo principal.

### Qué pasa

En onboarding se selecciona **Volumen**, pero después en Nutrición aparece **Mantenimiento** u otro objetivo distinto.

### Impacto

Un objetivo incorrecto invalida el cálculo posterior de calorías y macros y transmite al usuario que sus datos no se han guardado bien.

### Propuesta

- Guardar el objetivo de onboarding en la misma entidad o fuente que usa Nutrición.
- Al entrar por primera vez en Nutrición, si ya existe un objetivo:
  - precargarlo automáticamente,
  - y bloquearlo si está sincronizado, o permitir edición guardando en el mismo sitio.
- Añadir un **sanity check interno** si onboarding y nutrición difieren, resolviendo por una regla clara, por ejemplo el dato más reciente.

### Criterios de aceptación

- Tras completar onboarding con **Volumen**, Nutrición muestra **Volumen** automáticamente.
- Si se cambia el objetivo en Nutrición, Perfil se actualiza cuando exista sincronización.

---

## 5) Calorías objetivo infladas y guía de actividad demasiado pobre

**Prioridad:** Alta

### Dónde ocurre

- Nutrición > Plan nutricional activo.
- Selector de nivel de actividad.

### Qué pasa

Para el caso reproducible, la app devuelve **3.768 kcal/día** con actividad **Moderado**, un valor que parece inflado salvo que el multiplicador o la combinación de factores esté mal aplicada.

### Impacto

Si el TDEE está sobreestimado, una fase de volumen puede acabar generando un superávit excesivo y una ganancia de grasa no deseada. Es un fallo de alta sensibilidad para la credibilidad del módulo.

### Propuesta

- Revisar la fórmula de **TMB**, el **multiplicador de actividad** y el **ajuste por objetivo**.
- Evitar dobles conteos si se mezclan entrenos, pasos y trabajo diario.
- Enriquecer la guía de actividad con una descripción más humana:
  - trabajo sentado / de pie / físico,
  - número de entrenos,
  - pasos diarios.
- El usuario no tiene que ver el multiplicador, pero sí una explicación suficiente para elegir correctamente.
- Registrar en logs qué fórmula y factor se aplicaron para auditar valores extremos.

### Criterios de aceptación

- Con el mismo caso de prueba, el TDEE cae en un rango razonable para actividad moderada si no hay trabajo físico duro.
- La guía de actividad evita elecciones al azar.
- Los logs permiten auditar fórmula y factor aplicados.

---

## 6) Carb cycling: decidir si es isocalórico o si cambia calorías, y comunicarlo

**Prioridad:** Alta

### Dónde ocurre

- Nutrición > Plan nutricional activo.
- Detalle de día de entreno / descanso.

### Qué pasa

Se muestra **“Carb cycling +10%”** y el plan pasa de **3.768 kcal** a **3.920 kcal** en días de entreno, sin dejar claro si la intención es:

- redistribuir macros,
- subir calorías,
- o mantener estables las kcal semanales.

### Impacto

Sin una regla clara, el usuario puede acumular un superávit adicional no previsto en días de entreno y desalinear el objetivo semanal.

### Propuesta

Definir una única lógica de producto y aplicarla siempre.

**Opción A (recomendada): isocalórico semanal**

- Subir carbohidratos en días de entreno.
- Bajar en días de descanso.
- Mantener estable el promedio semanal de kcal.

**Opción B: kcal variables por día**

- Si el entreno sube kcal, el descanso debe bajar lo suficiente para mantener el promedio semanal,
- o la UI debe decir claramente que el objetivo se expresa por tipo de día.

Además:

- Mostrarlo con copy explícito:
  - **“Carb cycling (kcal semanales estables)”**, o
  - **“Carb cycling (kcal variables por día)”**.
- Mantener proteína constante.
- Ajustar carbohidratos primero y grasas si hace falta compensar.
- No usar verduras como variable de ajuste principal.

### Criterios de aceptación

- El usuario entiende si las kcal cambian o no.
- Los días de entreno y descanso reflejan una redistribución coherente.
- No se infla el promedio semanal de forma inadvertida.

---

## 7) Perfil metabólico y distribución de macros: cuestionario opcional

**Prioridad:** Media

### Dónde ocurre

- Módulo de metabolismo.
- Distribución de macronutrientes.

### Qué pasa

Se plantea un mini cuestionario para clasificar el perfil del usuario y ajustar la distribución de macros, por ejemplo según tolerancia a carbohidratos.

### Impacto

Puede aportar valor real, pero si es obligatorio añade fricción y puede aumentar el abandono.

### Propuesta

- Hacerlo **opcional**.
- Ofrecer dos modos:
  - **Básico**: sin cuestionario.
  - **Preciso**: con cuestionario.
- Guardar el resultado como atributo persistente: score + etiqueta de perfil.
- Usarlo solo para **distribución de macros**, no para TDEE.
- Explicarlo en una pantalla breve y clara.
- Evitar lenguaje médico y usar etiquetas sencillas:
  - Más carbo,
  - Equilibrado,
  - Más grasas.
- Permitir cambiarlo más adelante.

### Criterios de aceptación

- El usuario puede omitir el cuestionario y generar dieta igualmente.
- Si lo completa, el perfil queda guardado y se aplica de forma consistente al reparto de macros.

---

## 8) Generación de menús: gramajes incoherentes

**Prioridad:** Alta

### Dónde ocurre

- Nutrición > Día X > Generar menú.

### Qué pasa

Se observan ejemplos con:

- proteína principal demasiado baja, por ejemplo pavo ~50 g,
- vegetales inflados, por ejemplo rúcula ~200 g,
- ratios de kcal o macros poco realistas en ciertos vegetales,
- y ausencia de límites efectivos por categoría.

### Impacto

El menú pierde realismo y no asegura el objetivo nutricional. El sistema compensa con cantidades absurdas de verdura en lugar de ajustar primero proteína, carbohidrato o grasa.

### Propuesta

Definir reglas duras por categoría dentro de cada comida:

1. **Proteína principal**
   - carne, pescado, huevos o tofu,
   - debe aportar entre **60% y 80%** de la proteína objetivo de la comida.

2. **Hidrato base**
   - arroz, pan, patata, pasta, harinas o legumbre usada como carbohidrato,
   - debe aportar entre **80% y 95%** de los carbohidratos objetivo de la comida.

3. **Vegetales**
   - rol de acompañamiento y fibra,
   - objetivo práctico de **5% a 15%** de las kcal de la comida,
   - rangos orientativos:
     - hojas: **30-80 g**,
     - vegetales densos: **80-150 g**.

4. **Grasa añadida**
   - aceites, frutos secos, aguacate,
   - debe aportar entre **60% y 90%** de las grasas objetivo,
   - con topes razonables por alimento.

Además:

- aplicar topes por alimento y por categoría,
- evitar outliers como rúcula > 100 g salvo elección manual,
- si faltan macros, ajustar primero proteína / carbohidrato / grasa,
- no inflar vegetales para cuadrar objetivos.

### Criterios de aceptación

- La proteína principal cubre entre **60% y 80%** del objetivo proteico de la comida.
- Los vegetales no aparecen con gramajes absurdos.
- Si faltan macros, el sistema corrige primero proteína, hidrato base o grasa añadida.

---

## Prioridades recomendadas de implementación

### Alta prioridad

- Sincronización perfil general / nutrición.
- Sincronización del objetivo onboarding / nutrición.
- Revisión del cálculo de calorías objetivo.
- Definición clara del carb cycling.
- Reglas duras de generación de menús.

### Prioridad media

- Renombrado de “Masa muscular” a “Masa magra”.
- Clarificación de duración del plan vs vista del calendario.
- Cuestionario metabólico opcional.

## Cierre

El documento apunta a un problema central: **hay incoherencias entre fuente de datos, lógica de cálculo y comunicación en UI**. La recomendación implícita es atacar primero los puntos que afectan a la confianza del usuario y al cálculo nutricional real:

1. fuente de verdad única,
2. objetivo correctamente sincronizado,
3. TDEE auditado,
4. carb cycling definido,
5. motor de menús con límites duros.
