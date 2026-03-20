# MindFeed · Especificación completa del módulo de “salto de dieta”

Versión cerrada para implementación.  
Objetivo: que desarrollo pueda implementarlo sin inventar lógica, sin deducir reglas y sin interpretar huecos.

---

## 1. Objetivo del módulo

El módulo permite registrar una ingesta fuera del plan y que el sistema:

1. estime las kcal de esa ingesta libre,
2. determine si sustituye una comida del plan o se suma a ella,
3. calcule el exceso neto real,
4. aplique una compensación prudente,
5. reparta esa compensación en días posteriores sin romper adherencia, proteína mínima ni rendimiento.

---

## 2. Qué no debe hacer el módulo

- No pedir como entrada principal las “kcal de exceso”.
- No depender solo de texto libre.
- No asumir que “hamburguesa” siempre tiene las mismas kcal.
- No compensar de forma agresiva una estimación incierta.
- No reducir proteína por debajo del mínimo diario.
- No meter toda la compensación al día siguiente por defecto.
- No castigar al usuario con microcopy culpabilizador.

---

## 3. Qué sí debe hacer el módulo

- Guiar al usuario con selector estructurado.
- Permitir texto libre opcional.
- Mantener trazabilidad completa del cálculo.
- Separar claramente:
  - kcal estimadas de la ingesta libre,
  - kcal previstas en el plan para esa franja,
  - exceso neto,
  - compensación aplicada,
  - distribución de la compensación.
- Tener un modo simple y un modo avanzado.

---

## 4. Flujo visible para usuario

### 4.1 Modo simple (por defecto)

Campos visibles:

1. Tipo de comida libre
2. Subtipo
3. Tamaño / cantidad
4. Momento del día
5. ¿Sustituye una comida del plan o se suma?
6. Confianza en la estimación
7. Descripción adicional (opcional)

Resultado visible antes de guardar:

- kcal estimadas de la comida libre
- kcal previstas en el plan para esa franja
- exceso neto estimado
- compensación aplicada
- número de días en que se reparte

### 4.2 Modo avanzado (opcional)

Campos extra:

- kcal manuales estimadas por el usuario
- corrección manual de la estimación
- notas libres

El modo avanzado solo debe aparecer como opción explícita.

---

## 5. Catálogo de tipos y subtipos

### 5.1 Tipos principales

- Hamburguesa
- Pizza
- Helado
- Bollería
- Kebab
- Sushi
- Pasta / comida italiana
- Mexicana / burrito / tacos
- Comida rápida variada
- Restaurante / comida libre
- Alcohol
- Postre
- Snacks salados
- Snacks dulces
- Comida casera fuera de plan
- Otro

### 5.2 Subtipos por tipo

#### Hamburguesa

- Simple
- Con queso
- Doble
- Doble con queso
- Con patatas
- Con patatas y bebida

#### Pizza

- 2 porciones
- 4 porciones
- Media pizza
- Pizza entera

#### Helado

- Bola pequeña
- Tarrina pequeña
- Tarrina mediana
- Tarrina grande

#### Bollería

- Pieza pequeña
- Pieza estándar
- 2 piezas
- 3 piezas

#### Kebab

- Solo kebab
- Kebab con patatas
- Kebab con bebida
- Kebab completo

#### Sushi

- 8 piezas
- 12 piezas
- 16 piezas
- Bandeja grande

#### Pasta / comida italiana

- Plato normal
- Plato grande
- Pasta + pan
- Pasta + postre

#### Mexicana / burrito / tacos

- 2 tacos
- 3 tacos
- Burrito
- Burrito grande
- Plato combinado

#### Alcohol

- 1 copa
- 2 copas
- 3 copas
- 1 cerveza
- 2 cervezas
- 3 cervezas
- Combinados múltiples

#### Postre

- Postre pequeño
- Postre estándar
- Postre grande
- Postre + bebida azucarada

#### Snacks salados

- Bolsa pequeña
- Bolsa mediana
- Bolsa grande

#### Snacks dulces

- Ración pequeña
- Ración media
- Ración grande

#### Comida casera fuera de plan

- Ración ligera
- Ración normal
- Ración abundante

#### Otro

- Otro genérico

---

## 6. Catálogo interno de estimación calórica

Estos valores no son visibles para el usuario.  
Se usan para la estimación guiada inicial y podrán ajustarse por país, cadena, proveedor o histórico real.

### 6.1 Hamburguesa

| Subtipo              | Tamaño  | kcal_min | kcal_media | kcal_max |
| -------------------- | ------- | -------: | ---------: | -------: |
| Simple               | pequeña |      300 |        380 |      450 |
| Simple               | normal  |      400 |        500 |      600 |
| Con queso            | normal  |      500 |        650 |      780 |
| Doble                | normal  |      650 |        800 |      950 |
| Doble con queso      | normal  |      750 |        900 |     1100 |
| Con patatas          | normal  |      700 |        900 |     1100 |
| Con patatas y bebida | normal  |      850 |       1050 |     1250 |

### 6.2 Pizza

| Subtipo      | Tamaño | kcal_min | kcal_media | kcal_max |
| ------------ | ------ | -------: | ---------: | -------: |
| 2 porciones  | normal |      250 |        350 |      450 |
| 4 porciones  | normal |      500 |        700 |      900 |
| Media pizza  | normal |      650 |        850 |     1050 |
| Pizza entera | normal |     1200 |       1600 |     2000 |

### 6.3 Helado

| Subtipo         | Tamaño | kcal_min | kcal_media | kcal_max |
| --------------- | ------ | -------: | ---------: | -------: |
| Bola pequeña    | normal |       90 |        130 |      170 |
| Tarrina pequeña | normal |      150 |        220 |      300 |
| Tarrina mediana | normal |      220 |        320 |      430 |
| Tarrina grande  | normal |      350 |        500 |      650 |

### 6.4 Bollería

| Subtipo        | Tamaño | kcal_min | kcal_media | kcal_max |
| -------------- | ------ | -------: | ---------: | -------: |
| Pieza pequeña  | normal |      150 |        220 |      300 |
| Pieza estándar | normal |      220 |        320 |      430 |
| 2 piezas       | normal |      400 |        600 |      800 |
| 3 piezas       | normal |      600 |        850 |     1100 |

### 6.5 Kebab

| Subtipo           | Tamaño | kcal_min | kcal_media | kcal_max |
| ----------------- | ------ | -------: | ---------: | -------: |
| Solo kebab        | normal |      450 |        650 |      850 |
| Kebab con patatas | normal |      700 |        950 |     1200 |
| Kebab con bebida  | normal |      550 |        750 |      950 |
| Kebab completo    | normal |      850 |       1150 |     1450 |

### 6.6 Sushi

| Subtipo        | Tamaño | kcal_min | kcal_media | kcal_max |
| -------------- | ------ | -------: | ---------: | -------: |
| 8 piezas       | normal |      250 |        350 |      450 |
| 12 piezas      | normal |      350 |        500 |      650 |
| 16 piezas      | normal |      500 |        700 |      900 |
| Bandeja grande | normal |      700 |        950 |     1250 |

### 6.7 Pasta / comida italiana

| Subtipo        | Tamaño | kcal_min | kcal_media | kcal_max |
| -------------- | ------ | -------: | ---------: | -------: |
| Plato normal   | normal |      450 |        650 |      850 |
| Plato grande   | normal |      650 |        900 |     1150 |
| Pasta + pan    | normal |      700 |        950 |     1200 |
| Pasta + postre | normal |      850 |       1100 |     1400 |

### 6.8 Mexicana / burrito / tacos

| Subtipo         | Tamaño | kcal_min | kcal_media | kcal_max |
| --------------- | ------ | -------: | ---------: | -------: |
| 2 tacos         | normal |      250 |        380 |      500 |
| 3 tacos         | normal |      400 |        550 |      700 |
| Burrito         | normal |      500 |        700 |      900 |
| Burrito grande  | normal |      700 |        950 |     1200 |
| Plato combinado | normal |      800 |       1100 |     1400 |

### 6.9 Alcohol

| Subtipo              | Tamaño | kcal_min | kcal_media | kcal_max |
| -------------------- | ------ | -------: | ---------: | -------: |
| 1 copa               | normal |      120 |        180 |      250 |
| 2 copas              | normal |      240 |        360 |      500 |
| 3 copas              | normal |      360 |        540 |      750 |
| 1 cerveza            | normal |      120 |        160 |      220 |
| 2 cervezas           | normal |      240 |        320 |      440 |
| 3 cervezas           | normal |      360 |        480 |      660 |
| Combinados múltiples | normal |      400 |        700 |     1100 |

### 6.10 Postre

| Subtipo                   | Tamaño | kcal_min | kcal_media | kcal_max |
| ------------------------- | ------ | -------: | ---------: | -------: |
| Postre pequeño            | normal |      120 |        200 |      280 |
| Postre estándar           | normal |      220 |        350 |      500 |
| Postre grande             | normal |      350 |        550 |      750 |
| Postre + bebida azucarada | normal |      400 |        650 |      900 |

### 6.11 Snacks salados

| Subtipo       | Tamaño | kcal_min | kcal_media | kcal_max |
| ------------- | ------ | -------: | ---------: | -------: |
| Bolsa pequeña | normal |      120 |        180 |      250 |
| Bolsa mediana | normal |      220 |        320 |      430 |
| Bolsa grande  | normal |      350 |        500 |      700 |

### 6.12 Snacks dulces

| Subtipo        | Tamaño | kcal_min | kcal_media | kcal_max |
| -------------- | ------ | -------: | ---------: | -------: |
| Ración pequeña | normal |      120 |        200 |      300 |
| Ración media   | normal |      220 |        350 |      500 |
| Ración grande  | normal |      350 |        550 |      800 |

### 6.13 Comida casera fuera de plan

| Subtipo          | Tamaño | kcal_min | kcal_media | kcal_max |
| ---------------- | ------ | -------: | ---------: | -------: |
| Ración ligera    | normal |      350 |        500 |      650 |
| Ración normal    | normal |      500 |        700 |      900 |
| Ración abundante | normal |      750 |       1000 |     1300 |

### 6.14 Otro

| Subtipo       | Tamaño  | kcal_min | kcal_media | kcal_max |
| ------------- | ------- | -------: | ---------: | -------: |
| Otro genérico | pequeño |      150 |        250 |      350 |
| Otro genérico | normal  |      300 |        450 |      650 |
| Otro genérico | grande  |      500 |        750 |     1000 |

---

## 7. Modelo de base de datos

### 7.1 Tabla: cheat_meal_categories

- id
- slug
- nombre
- activo
- orden

### 7.2 Tabla: cheat_meal_subtypes

- id
- category_id
- slug
- nombre
- activo
- orden

### 7.3 Tabla: cheat_meal_portions

- id
- subtype_id
- tamano_slug
- tamano_nombre
- gramos_referencia (nullable)
- kcal_min
- kcal_media
- kcal_max
- notas_internas

### 7.4 Tabla: cheat_confidence_profiles

- id
- slug
- nombre
- compensation_factor
- descripcion

Valores recomendados:

- baja = 0.55
- media = 0.75
- alta = 0.95

### 7.5 Tabla: user_cheat_events

- id
- user_id
- fecha_hora
- momento_del_dia
- category_id
- subtype_id
- tamano_slug
- descripcion_libre
- modo_registro
- es_sustitucion
- meal_plan_slot_id (nullable)
- kcal_usuario_manual (nullable)
- kcal_tabla
- kcal_ingesta_estimada
- kcal_plan_slot
- exceso_neto
- confidence_slug
- compensation_factor
- compensacion_aplicada
- estado
- creado_en
- actualizado_en

### 7.6 Tabla: cheat_compensation_plan

- id
- cheat_event_id
- user_id
- fecha_aplicacion
- kcal_a_restar
- aplicada
- motivo_bloqueo
- creado_en

---

## 8. Qué significa la estimación del usuario

La estimación del usuario no desaparece.  
Se usa de dos maneras:

### 8.1 Como nivel de confianza

El usuario indica si su registro es:

- Baja: aprox. al ojo
- Media: estimación razonable
- Alta: conteo preciso

### 8.2 Como dato manual opcional

En modo avanzado, el usuario puede introducir kcal manuales estimadas.

### 8.3 Cómo debe interpretarlo el sistema

La confianza no cambia “mágicamente” las kcal del alimento.  
La confianza afecta a:

1. cuánto exceso se compensa,
2. cuánto peso se da a la cifra manual del usuario,
3. cuánto arriesga el sistema en ajustes posteriores.

### 8.4 Prioridad de fuentes

1. Modo avanzado con kcal manuales + confianza alta
2. Modo guiado con tabla interna
3. Si hay contradicción entre texto libre y selector, prevalece el selector

### 8.5 Mezcla recomendada si el usuario introduce kcal manuales

- Confianza alta: 70% usuario + 30% tabla
- Confianza media: 50% usuario + 50% tabla
- Confianza baja: 25% usuario + 75% tabla

Fórmula:

`kcal_ingesta_estimada = (kcal_usuario * peso_usuario) + (kcal_tabla * peso_tabla)`

---

## 9. Lógica de estimación de la ingesta libre

### 9.1 Regla por tamaño

- pequeño -> usar kcal_min
- normal -> usar kcal_media
- grande -> usar media entre kcal_media y kcal_max
- muy grande -> usar kcal_max

### 9.2 Ejemplo

Usuario selecciona:

- hamburguesa
- con patatas
- normal

Entonces:

- kcal_tabla = 900

Si además mete manualmente 1000 kcal con confianza media:

- kcal_ingesta_estimada = (1000 _ 0.50) + (900 _ 0.50) = 950

---

## 10. Cómo decidir si sustituye una comida o se suma

### 10.1 Sustitución

Se considera sustitución cuando:

- el usuario lo marca explícitamente,
- el evento coincide con desayuno/comida/cena,
- el alimento tiene formato de comida principal.

### 10.2 Suma

Se considera suma cuando:

- el usuario lo marca explícitamente,
- el evento es snack, postre, alcohol o extra,
- o se añade encima de una comida ya realizada.

### 10.3 Opción “No lo sé”

La app sugiere automáticamente:

Sugerir “sustituye” si:

- hamburguesa, pizza, sushi, pasta, burrito
- y momento = comida o cena

Sugerir “se suma” si:

- helado, postre, alcohol, snacks, bollería
- o momento = extra

El usuario puede cambiarlo.

---

## 11. Cálculo del exceso neto

### 11.1 kcal previstas del plan

Si es sustitución:

- usar las kcal previstas en ese slot del plan

Si es suma:

- kcal_plan_slot = 0

### 11.2 Fórmula

`exceso_neto = max(0, kcal_ingesta_estimada - kcal_plan_slot)`

### 11.3 Ejemplos

Caso A:

- cena libre = 900 kcal
- cena plan = 650 kcal
- exceso_neto = 250 kcal

Caso B:

- helado = 320 kcal
- extra no planificado = 0 kcal
- exceso_neto = 320 kcal

---

## 12. Cómo aplicar la confianza a la compensación

La confianza no cambia las kcal de la comida.  
La confianza cambia la parte del exceso que se compensa.

Fórmula:
`compensacion_aplicada = exceso_neto * compensation_factor`

Factores recomendados:

- baja = 0.55
- media = 0.75
- alta = 0.95

Ejemplo:

- exceso_neto = 300 kcal
- confianza media = 0.75
- compensación aplicada = 225 kcal

---

## 13. Distribución de la compensación

### 13.1 Regla general

No compensar todo al día siguiente salvo exceso muy pequeño.

### 13.2 Regla por tamaño del exceso

- < 150 kcal -> 1 día
- 150 a 400 kcal -> 2-3 días
- 400 a 700 kcal -> 3-5 días
- > 700 kcal -> 5-7 días

### 13.3 Límite máximo por día

- definición -> no más del 10% de las kcal del día
- normocalórica -> no más del 12%
- volumen -> no más del 15%

### 13.4 Qué macros tocar primero

Orden:

1. carbohidratos
2. grasas
3. proteína solo como último recurso

### 13.5 Guardarraíl de proteína

No bajar de:

- definición -> 2.0 g/kg
- normocalórica -> 1.6 g/kg
- volumen -> 1.6 g/kg

---

## 14. Reglas por fase nutricional

### 14.1 Definición

- compensación conservadora
- repartir más días si hace falta
- evitar tocar demasiado carbohidrato pre/post entreno

### 14.2 Normocalórica

- compensación neutra
- mantener estabilidad semanal

### 14.3 Volumen

- no convertir un salto puntual en mini-definición
- compensar parcialmente si el exceso es grande
- si se repite mucho, disparar alerta de adherencia

---

## 15. Reglas de UX

### 15.1 Pantalla

Título:
**Registrar salto de dieta**

Subtítulo:
**Registra lo que has comido fuera del plan y la app ajustará el balance semanal sin castigos innecesarios.**

Campos:

1. Tipo de comida libre
2. Subtipo
3. Tamaño / cantidad
4. Momento del día
5. ¿Sustituye una comida o se suma?
6. Confianza
7. Descripción adicional

Vista de resultado:

- kcal estimadas de la comida libre
- kcal previstas del plan
- exceso neto
- compensación aplicada
- días de reparto

### 15.2 Microcopy

- “La app estima automáticamente el exceso para que no tengas que calcularlo a mano.”
- “La compensación se reparte en varios días para no afectar adherencia ni rendimiento.”
- “Si la estimación es baja, compensamos menos por seguridad.”

---

## 16. Casos completos

### Caso 1: sustitución

Usuario:

- hamburguesa
- con patatas
- normal
- cena
- sustituye cena
- confianza media

Backend:

- kcal_tabla = 900
- kcal_plan_slot = 650
- exceso_neto = 250
- compensación = 188
- reparto = 94 + 94

### Caso 2: suma

Usuario:

- helado
- tarrina mediana
- normal
- extra
- se suma
- confianza alta

Backend:

- kcal_tabla = 320
- kcal_plan_slot = 0
- exceso_neto = 320
- compensación = 304
- reparto = 100 + 100 + 104

### Caso 3: no lo sé

Usuario:

- pizza
- 4 porciones
- cena
- no sabe si sustituye o suma

Sistema:

- sugiere sustitución
- el usuario confirma o cambia

---

## 17. Alertas y seguridad

### 17.1 Frecuencia

- 1 salto semanal -> normal
- 2-3 -> sugerir revisión de adherencia
- > 3 -> no compensar automáticamente todo; sugerir rediseño del plan

### 17.2 Exceso extremo

Si exceso_neto > 1200 kcal:

- registrar
- no compensar 100%
- marcar para revisión

### 17.3 Patrón repetido

Si se repite alcohol, bollería o comida rápida varias veces en la misma franja:

- sugerir rediseño de esa comida del plan

---

## 18. Qué tiene que implementar backend

1. Catálogo de categorías, subtipos y tamaños
2. Tabla calórica con min/media/max
3. Sistema de inferencia por selector
4. Mezcla entre kcal manuales y tabla
5. Lógica sustitución vs suma
6. Cálculo de exceso neto
7. Factores de confianza
8. Reparto automático de compensación
9. Guardarraíl de proteína
10. Límites por fase
11. Alertas de uso y frecuencia
12. Registro trazable de todos los valores intermedios

---

## 19. Qué tiene que implementar frontend

1. Pantalla guiada por selector
2. Campo libre opcional
3. Toggle de modo avanzado
4. Vista previa del cálculo antes de guardar
5. Mensajes claros de sustitución/suma
6. Confirmación de compensación aplicada
7. Historial de eventos registrados

---

## 20. Decisión final de implementación

La lógica oficial será:

`tipo + subtipo + tamaño + sustitución/suma + confianza + kcal manuales opcionales -> kcal_ingesta_estimada -> exceso_neto -> compensacion_aplicada -> reparto en días posteriores`

### Usuario normal

Usa selector y estimación guiada.

### Usuario avanzado

Puede añadir kcal manuales.

### Regla final

No se deja nada a interpretación del desarrollador fuera de ajustes futuros de catálogo.
