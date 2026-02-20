# Temp Plan: Swap + Conversiones (Comida Completa)

## Objetivo

Evitar resultados incoherentes al sustituir un ingrediente (p. ej. cantidades extremas como 1 kg de lechuga) y asegurar que la sustitución se aplique de forma robusta aunque cambie el estado de pesado.

## Problema actual detectado

- El swap se resuelve principalmente a nivel de ingrediente.
- Eso puede cuadrar macros en números, pero romper coherencia culinaria de la comida.
- En algunos casos aparece error de conversión (`tal_cual_no_convertible`) aunque el alimento sea compatible por rol.

## Alcance cerrado de esta implementación

1. Recalcular la comida completa tras una sustitución (no solo el ingrediente cambiado).
2. Aplicar límites de gramos por rol para evitar outliers (ej.: 1 kg de lechuga).
3. Validar y resolver automáticamente el estado final (crudo/cocido/tal_cual) sin exponer errores técnicos.
4. Evitar repeticiones en el mismo día (misma receta/base entre ingestas).
5. Diferenciar bien slots: almuerzo/merienda/snack nocturno vs comida principal.
6. Añadir tests de regresión de sustitución, estados y recálculo de meal.

## Regla de validación de estado final (clave)

Al sustituir:

1. Tomar `estado_solicitado` del ítem.
2. Comprobar si el alimento nuevo permite ese estado con factor válido.
3. Si no permite:
   - usar `estado_pesado_base` del alimento nuevo (o su estado por defecto válido),
   - marcar aviso informativo para UI (no error bloqueante).
4. Solo fallar si:
   - alimento incompatible por rol, o
   - datos nutricionales inválidos para recálculo.

## Reglas UX

- No mostrar códigos técnicos (`tal_cual_no_convertible`) al usuario.
- Mostrar avisos claros:
  - "Sustitución aplicada. Este alimento se mide tal como se consume."
  - "Sustitución aplicada con ajuste de estado de pesado."
- Si no hay estado factible:
  - "No hemos podido aplicar este cambio con una medida válida. Prueba otro alimento."

## Plan por fases (ejecución)

### Fase 1: Motor de sustitución por comida (backend)

1. Centralizar resolución de estado final de pesado para swaps.
2. Cambiar el endpoint de swap para recálculo de meal completo (objetivo meal macros/kcal).
3. Añadir límites de gramos por rol (`protein`, `carb`, `fat`, `veg`, `fruit`, `dairy`, etc.).
4. Implementar criterio de viabilidad:
   - si no cumple tolerancia tras iteraciones, devolver `not_feasible` amigable,
   - no persistir resultados extremos.
5. Mantener validación de compatibilidad por rol (solo sustituciones válidas).

### Fase 2: Cohesión del día y slots (backend)

1. Corregir semántica de slots (`almuerzo` = snack, no comida principal).
2. Anti-repetición intradía por `recipe_code` y por base alimentaria.
3. Priorizar recetas por slot real (`slot:almuerzo`, `slot:merienda`, `slot:snack_nocturno`).

### Fase 3: UX y mensajes (frontend)

1. Traducir todos los errores técnicos de conversión a mensajes de usuario.
2. Mostrar aviso de ajuste automático de estado solo cuando aplique.
3. Mostrar aviso de "sustitución no viable" con acción sugerida (elegir otro alimento).

### Fase 4: QA y regresión (tests)

1. Tests backend swap:
   - caso feliz con reemplazo compatible,
   - fallback automático de estado,
   - bloqueo solo por incompatibilidad real o datos inválidos.
2. Tests backend recálculo de meal:
   - respeta tolerancia,
   - no genera cantidades extremas,
   - persiste macros consistentes.
3. Test integración de slots:
   - almuerzo y comida no colisionan en el mismo día.

## Criterios de aceptación

- Un alimento compatible por rol siempre se puede sustituir.
- No aparecen errores técnicos de conversión al usuario.
- No se generan cantidades extremas/incoherentes en verduras o ingredientes de baja densidad.
- La comida final queda dentro de tolerancia nutricional definida para el meal target.
- Almuerzo/Merienda/Snack nocturno usan recetas de su slot y no se comportan como comida principal.
- En un día generado no se repite receta/base entre ingestas principales salvo falta real de alternativas.

## Notas abiertas

- Definir límites finales por rol/alimento para evitar outliers.
- Decidir tolerancia exacta de recálculo para la comida tras swap.
