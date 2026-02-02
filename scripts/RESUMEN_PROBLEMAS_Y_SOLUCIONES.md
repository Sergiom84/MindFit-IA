# 🔍 RESUMEN: Problemas Detectados y Soluciones Aplicadas

**Fecha**: 1 de febrero de 2026
**Usuario**: María (ciclo@ciclo.com, user_id: 39)
**Plan**: HipertrofiaV2 - ID 245

---

## ❌ PROBLEMAS DETECTADOS

### 1. ✅ **RESUELTO**: Plan Incompleto - Solo 1 Semana Generada

**Problema**:

- El script inicial solo generó 1 semana de entrenamiento
- Las preferencias del usuario indican 4 semanas de entrenamiento
- Solo se estaban mostrando 5 días de entrenamiento en el calendario

**Causa**:

- El script SQL original (`insert-maria-hipertrofiav2-plan.sql`) tenía un error de estructura
- Solo definía la semana 1 sin duplicarla para las semanas 2, 3 y 4

**Solución Aplicada**:

- ✅ Creado nuevo script: `insert-maria-hipertrofiav2-plan-COMPLETE.sql`
- ✅ Usa una variable `semana_base` que se repite 4 veces
- ✅ Plan ID 245 creado con 4 semanas completas

**Verificación**:

```sql
SELECT jsonb_array_length(plan_data->'semanas') FROM app.methodology_plans WHERE id = 245;
-- Resultado: 4 semanas ✅
```

---

### 2. ✅ **RESUELTO**: Pocos Ejercicios Por Sesión (1-2 en lugar de 8)

**Problema**:

- D1 mostraba solo 2 ejercicios (Press de pecho, Press de banca)
- D2 mostraba solo 1 ejercicio (Jalón al pecho)
- D4 mostraba solo 1 ejercicio (Press militar)
- D5 mostraba solo 1 ejercicio (Pallof Press)
- Las preferencias del usuario indican 8 ejercicios por sesión

**Causa**:

- El script original se truncó al generar los arrays de ejercicios
- No se estaban respetando las preferencias del usuario (`ejercicios_por_dia_preferido: 8`)

**Solución Aplicada**:

- ✅ Cada sesión ahora tiene exactamente 8 ejercicios
- ✅ Total de 160 ejercicios en el plan (8 ejercicios × 5 días × 4 semanas)

**Verificación**:

```sql
-- D1: 8 ejercicios ✅
-- D2: 8 ejercicios ✅
-- D3: 8 ejercicios ✅ (incluye ejercicios con restricciones menstruales)
-- D4: 8 ejercicios ✅
-- D5: 8 ejercicios ✅
```

**Distribución de Ejercicios**:

| Sesión | Grupos Musculares | Ejercicios                                  |
| ------ | ----------------- | ------------------------------------------- |
| **D1** | Pecho + Tríceps   | 8 (5 pecho + 3 tríceps)                     |
| **D2** | Espalda + Bíceps  | 8 (5 espalda + 3 bíceps)                    |
| **D3** | Piernas + Core    | 8 (5 piernas + 3 core) ⚠️ CON RESTRICCIONES |
| **D4** | Hombro + Brazos   | 8 (5 hombro + 2 bíceps + 1 tríceps)         |
| **D5** | Full Body + Core  | 8 (5 full body + 3 core)                    |

---

### 3. ⚠️ **PENDIENTE INVESTIGACIÓN**: Ejercicios Mostrándose en Domingo (1 Feb)

**Problema Reportado**:

> "En la pestaña de Hoy me aparecen dos ejercicios, Press de pecho en máquina y press de banca con barra (hoy es 1 de febrero, domingo). Además, me muestra durante unos segundos: Hoy es domingo, día de descanso, luego vuelve a salir el entrenamiento."

**Análisis**:

- Hoy es **domingo 1 de febrero** → Debería ser día de descanso
- El plan empieza **lunes 2 de febrero** → No debería mostrar entrenamientos antes del inicio
- Hay un mensaje que parpadea: "Hoy es domingo, día de descanso"
- Después muestra ejercicios de D1 (que no debería ejecutarse hasta mañana)

**Posibles Causas**:

1. **Desfase de zona horaria**: El frontend podría estar calculando la fecha en una zona horaria diferente a Supabase
2. **Lógica de fecha de inicio**: El código podría estar comparando fechas incorrectamente
3. **Condición de fin de semana**: La función `isWeekend()` detecta domingo, pero luego otra lógica sobrescribe

**Archivos a Revisar**:

- `src/components/routines/tabs/TodayTrainingTab.jsx` (líneas 275-310)
- `src/utils/training/dateHelpers.js` (función `computeDayId`)
- `backend/services/hipertrofiaV2/sqlControllers.js` (comparación de fechas)

**Acción Requerida**:

- Investigar por qué se muestran ejercicios antes de la fecha de inicio del plan
- Verificar configuración de timezone en frontend y backend
- Revisar lógica de `isPlanStartInFuture`

---

### 4. ⚠️ **PENDIENTE**: Mejoras al Calendario del Ciclo Menstrual

**Problema Reportado**:

> "También tengo dudas con el calendario dentro del apartado del Ciclo menstrual, habría que añadir una leyenda, abajo del calendario y modificar el color de los días (recuadros del calendario) con: Fase folicular, fase lútea temprana... además de que la usuaria pudiera pinchar en cada día del calendario y así poder ver que registro: Dolor alto, sueño profundo... De ésta manera también podría llevar un diario."

**Mejoras Solicitadas**:

1. **Leyenda de Colores**:
   - Añadir leyenda debajo del calendario
   - Mostrar: Fase menstrual, Fase folicular, Ovulación, Fase lútea temprana, Fase lútea tardía (SPM)
   - Colores diferenciados para cada fase

2. **Codificación por Colores**:
   - Días del período: Color rojo/rosa
   - Fase folicular: Color verde/azul claro (energía alta)
   - Ovulación: Color amarillo/dorado
   - Fase lútea temprana: Color naranja claro
   - Fase lútea tardía (SPM): Color naranja oscuro/rojo claro

3. **Días Clicables (Diario)**:
   - Hacer que cada día del calendario sea clickable
   - Al hacer clic, mostrar modal o panel con:
     - Dolor registrado (1-5)
     - Calidad del sueño (1-5)
     - Nivel de energía (1-5)
     - Estado de ánimo
     - Síntomas (hinchazón, cólicos, etc.)
     - Notas personales
   - Permitir editar/añadir registros desde el calendario

**Archivos a Modificar**:

- `src/components/MenstrualCycle/CycleCalendar.jsx` (agregar leyenda y eventos de clic)
- `src/components/MenstrualCycle/DailyLogModal.jsx` (CREAR - modal para ver/editar logs)
- `src/components/MenstrualCycle/CycleSection.jsx` (integrar nueva funcionalidad)

---

### 5. ❓ **PREGUNTA**: ¿Se Usan las Preferencias en HipertrofiaV2?

**Pregunta del Usuario**:

> "También tengo una duda, si accedo al apartado de preferencias, dentro del perfil, hay opciones de: qué días empezar en la semana, la duración del plan del entrenamiento, los ejercicios por sesión. Éste apartado se tiene en cuenta en la generación de entrenamientos dentro de Hipetrofiav2?"

**Preferencias Actuales de María**:

```json
{
  "dias_preferidos_entrenamiento": [
    "lunes",
    "martes",
    "miércoles",
    "jueves",
    "viernes"
  ],
  "ejercicios_por_dia_preferido": 8,
  "semanas_entrenamiento": 4,
  "usar_preferencias_ia": true
}
```

**Análisis**:

- ✅ **Días de entrenamiento**: El plan D1-D5 respeta Lunes-Viernes
- ✅ **Ejercicios por sesión**: Ahora se respetan (8 ejercicios)
- ✅ **Semanas de entrenamiento**: Ahora se respetan (4 semanas)
- ✅ **usar_preferencias_ia**: Está activado

**Conclusión**:
El script manual que creamos SÍ respeta las preferencias. **PERO** cuando se genera un plan desde la UI usando HipertrofiaV2, debemos verificar que el backend también las respete.

**Acción Requerida**:

- Revisar endpoint de generación: `/api/hipertrofiav2/generate-plan`
- Verificar que lea `user_profiles.ejercicios_por_dia_preferido`
- Verificar que lea `user_profiles.semanas_entrenamiento`
- Verificar que lea `user_profiles.dias_preferidos_entrenamiento`

---

## 📊 ESTADO ACTUAL DEL PLAN

### Plan Generado: ID 245

| Parámetro                 | Valor                            |
| ------------------------- | -------------------------------- |
| **User ID**               | 39 (María)                       |
| **Metodología**           | HipertrofiaV2_MindFeed           |
| **Estado**                | active                           |
| **Fecha de inicio**       | **2 de febrero de 2026 (LUNES)** |
| **Semana actual**         | 1                                |
| **Día actual**            | D1 (empezará mañana)             |
| **Total semanas**         | 4 ✅                             |
| **Sesiones por semana**   | 5 (D1-D5)                        |
| **Ejercicios por sesión** | 8 ✅                             |
| **Total ejercicios**      | 160                              |

### Estructura del Plan

```
Semana 1-4 (REPETIDAS)
├── D1: Pecho + Tríceps (8 ejercicios)
│   ├── Press de pecho en máquina
│   ├── Press de banca con barra
│   ├── Press inclinado con mancuernas
│   ├── Aperturas con mancuernas
│   ├── Fondos en paralelas
│   ├── Extensión de tríceps en polea
│   ├── Press francés con barra Z
│   └── Patada de tríceps con mancuerna
│
├── D2: Espalda + Bíceps (8 ejercicios)
│   ├── Jalón al pecho en polea
│   ├── Remo con barra
│   ├── Remo con mancuernas
│   ├── Pulldown en polea
│   ├── Dominadas asistidas
│   ├── Curl de bíceps con barra
│   ├── Curl martillo con mancuernas
│   └── Curl concentrado
│
├── D3: Piernas + Core (8 ejercicios) ⚠️ CON RESTRICCIONES
│   ├── Sentadilla en prensa 45°
│   ├── Sentadilla olímpica con barra (⚠️ modify_intensity)
│   ├── Peso muerto rumano
│   ├── Extensión de cuádriceps
│   ├── Curl femoral acostado
│   ├── Crunch con carga (⚠️ avoid - será reemplazado)
│   ├── Ab Wheel avanzada (⚠️ avoid - será reemplazado)
│   └── Pallof Press en polea
│
├── D4: Hombro + Brazos (8 ejercicios)
│   ├── Press militar en máquina
│   ├── Press militar con mancuernas
│   ├── Elevaciones laterales
│   ├── Elevaciones frontales
│   ├── Pájaros en banco
│   ├── Curl de bíceps con barra
│   ├── Extensión de tríceps
│   └── Face pulls en polea
│
└── D5: Full Body + Core (8 ejercicios)
    ├── Press inclinado en máquina
    ├── Jalón al pecho en polea
    ├── Sentadilla frontal con barra
    ├── Zancadas con mancuernas
    ├── Hip thrust con barra
    ├── Pallof Press en polea
    ├── Plancha frontal (tiempo)
    └── Mountain climbers
```

---

## 🎯 EJERCICIOS CON RESTRICCIONES MENSTRUALES

**Sesión D3 (Piernas + Core)** incluye ejercicios que se adaptarán automáticamente durante el período menstrual (14-17 febrero):

| Ejercicio Original                | Restricción        | Acción Esperada                        | Alternativa Predefinida |
| --------------------------------- | ------------------ | -------------------------------------- | ----------------------- |
| Sentadilla olímpica con barra     | `modify_intensity` | Reducir a 70% intensidad + advertencia | Sentadilla Goblet       |
| Crunch con carga (disco en pecho) | `avoid`            | **REEMPLAZAR**                         | Dead Bug ponderado      |
| Ab Wheel posición avanzada        | `avoid`            | **REEMPLAZAR**                         | Pallof Press con banda  |

**Testing**:

- Hoy (1 feb, día 16): Fase lútea temprana → Sin filtrado ✅
- 14 feb (día 29): Inicio del período → Filtrado activo ⚠️
- Los ejercicios con `avoid` se reemplazarán automáticamente
- Los ejercicios con `modify_intensity` mostrarán advertencia

---

## 📅 TIMELINE DEL PLAN

```
1 feb  🔵 HOY - Domingo (Día 16 del ciclo) - DESCANSO
       ⚠️ Problema: Mostrando ejercicios cuando debería ser descanso

2 feb  🏋️ LUNES - INICIO DEL PLAN (Día 17 del ciclo)
       ✅ D1: Pecho + Tríceps (8 ejercicios)
       Fase lútea temprana - Sin restricciones menstruales

3 feb  🏋️ MARTES - D2: Espalda + Bíceps (8 ejercicios)
4 feb  🏋️ MIÉRCOLES - D3: Piernas + Core (8 ejercicios)
5 feb  🔵 JUEVES - Descanso
6 feb  🏋️ VIERNES - D4: Hombro + Brazos (8 ejercicios)

...

14 feb ⚠️ SÁBADO - Próximo período esperado (Día 29)
       📍 Filtrado menstrual se activará
       📍 Sesión D3 adaptará ejercicios automáticamente

15-17 feb - Días 1-3 del nuevo ciclo
       ⚠️ Filtrado menstrual activo
       ⚠️ Ejercicios de core pesado serán reemplazados
```

---

## 🔧 PRÓXIMOS PASOS

### Inmediatos (Alta Prioridad)

1. **Investigar problema del domingo**:
   - [ ] Revisar `TodayTrainingTab.jsx` línea 113-129 (`isPlanStartInFuture`)
   - [ ] Verificar timezone en `computeDayId()`
   - [ ] Confirmar que no haya desfase horario Supabase ↔ Frontend
   - [ ] Revisar lógica de `isWeekend()` y por qué se sobrescribe

2. **Verificar integración de preferencias**:
   - [ ] Revisar endpoint `/api/hipertrofiav2/generate-plan`
   - [ ] Confirmar que lee `ejercicios_por_dia_preferido`
   - [ ] Confirmar que lee `semanas_entrenamiento`
   - [ ] Documentar cómo se aplican las preferencias

### Mejoras UX (Media Prioridad)

3. **Mejorar calendario del ciclo menstrual**:
   - [ ] Agregar leyenda de colores debajo del calendario
   - [ ] Codificar días por fase del ciclo
   - [ ] Hacer días clickables
   - [ ] Crear `DailyLogModal.jsx` para ver/editar registros
   - [ ] Implementar funcionalidad de "diario menstrual"

4. **Testing del sistema de filtrado**:
   - [ ] Esperar al 14 de febrero (próximo período)
   - [ ] Verificar que se aplique filtrado automático en D3
   - [ ] Confirmar reemplazo de ejercicios con `avoid`
   - [ ] Confirmar reducción de intensidad con `modify_intensity`

---

## ✅ RESUMEN EJECUTIVO

### Lo que se arregló:

- ✅ **Plan completo con 4 semanas** (antes: 1 semana)
- ✅ **8 ejercicios por sesión** (antes: 1-2 ejercicios)
- ✅ **160 ejercicios totales** en el plan
- ✅ Respeta preferencias del usuario
- ✅ Incluye ejercicios con restricciones menstruales para testing

### Lo que falta investigar:

- ⚠️ **Problema del domingo**: Por qué muestra ejercicios antes del inicio del plan
- ⚠️ **Mensaje parpadeante**: "Hoy es domingo, día de descanso"
- ❓ **Preferencias en generación automática**: Verificar backend

### Lo que falta implementar:

- 📋 **Mejoras al calendario menstrual**: Leyenda, colores, días clickables, diario
- 🧪 **Testing del filtrado**: Esperar al 14 de febrero para verificar adaptación automática

---

## 📂 ARCHIVOS CREADOS/MODIFICADOS

### Nuevos Archivos:

1. `scripts/insert-maria-hipertrofiav2-plan-COMPLETE.sql` ✅
2. `scripts/RESUMEN_PROBLEMAS_Y_SOLUCIONES.md` ✅ (este archivo)

### Archivos Previos (Para Referencia):

- `scripts/setup-maria-menstrual-cycle.sql` (configuración del ciclo)
- `scripts/simulate-menstrual-days.sql` (simulaciones para testing)
- `scripts/RESUMEN_SETUP_MARIA.md` (documentación original)

---

**Última actualización**: 1 de febrero de 2026, 18:30 CET
