# 📋 RESUMEN DEL SETUP DE MARÍA

**Usuario**: María (ciclo@ciclo.com)
**User ID**: 39
**Fecha de configuración**: 1 de febrero de 2026

---

## ✅ CONFIGURACIÓN COMPLETADA

### 1. **Ciclo Menstrual**

| Parámetro                    | Valor                            |
| ---------------------------- | -------------------------------- |
| Duración del ciclo           | **28 días**                      |
| Duración del período         | **4 días**                       |
| Tipo de ciclo                | **Regular**                      |
| Anticonceptivos hormonales   | **No**                           |
| Último período               | **17 de enero de 2026**          |
| Próximo período esperado     | **14 de febrero de 2026**        |
| Día del ciclo HOY (1 feb)    | **Día 16** (fase lútea temprana) |
| Día del ciclo MAÑANA (2 feb) | **Día 17** (inicio del plan)     |

### 2. **Logs del Ciclo Registrados**

- **Días 1-4 del período** (17-20 enero): Registrados con dolor alto/moderado
- **Fase folicular** (21-30 enero): Energía alta, estado óptimo
- **Fase lútea** (31 enero - 6 febrero): Estado normal, sin síntomas
- **Total de logs**: 21 días registrados

### 3. **Plan de Entrenamiento HipertrofiaV2**

| Parámetro              | Valor                      |
| ---------------------- | -------------------------- |
| Plan ID                | **244**                    |
| Metodología            | **HipertrofiaV2_MindFeed** |
| Estado                 | **Activo**                 |
| Fecha de inicio        | **2 de febrero de 2026**   |
| Nivel                  | **Intermedio**             |
| Sexo                   | **Femenino**               |
| Ciclo de entrenamiento | **D1-D5** (5 días/semana)  |
| Semana actual          | **1**                      |
| Día actual             | **D1** (empezará mañana)   |

---

## 🎯 EJERCICIOS CON RESTRICCIONES MENSTRUALES

### **Sesión D3 (Piernas + Core)** - Día crítico para testing

La sesión D3 incluye **4 ejercicios**, de los cuales **3 tienen restricciones menstruales**:

| Ejercicio                             | Restricción        | Alternativa            | Acción Esperada                     |
| ------------------------------------- | ------------------ | ---------------------- | ----------------------------------- |
| **Sentadilla olímpica con barra**     | `modify_intensity` | Sentadilla Goblet      | Reducir a 70% + mostrar advertencia |
| **Crunch con carga (disco en pecho)** | `avoid`            | Dead Bug ponderado     | **REEMPLAZAR**                      |
| **Ab Wheel posición avanzada**        | `avoid`            | Pallof Press con banda | **REEMPLAZAR**                      |
| Sentadilla en prensa 45°              | `none`             | -                      | Sin cambios                         |

### **Otras sesiones con restricciones**:

- **D1**: Press de banca con barra → `modify_intensity`
- **D2**: Sin restricciones
- **D4**: Sin restricciones
- **D5**: Sin restricciones

---

## 🧪 TESTING PASO A PASO

### **Escenario 1: Cargar Sesión D3 en Fase Lútea (HOY - Día 16)**

```bash
# María abre la sesión D3 hoy (1 febrero, día 16 del ciclo)
GET /api/hipertrofiav2/current-session-with-adjustments/39/3
```

**Resultado Esperado**:

- ✅ Sesión se carga sin restricciones (fase lútea temprana, sin dolor)
- ✅ `menstrualAdjustment` = null o sin modificadores
- ✅ Ejercicios se muestran sin cambios
- ✅ NO hay filtrado de ejercicios

---

### **Escenario 2: Simular Día de Menstruación (14 febrero - Día 29)**

```sql
-- Registrar log con dolor alto en el próximo período
INSERT INTO app.menstrual_daily_log (
  user_id, log_date, is_period_day, pain_level, energy_level, sleep_quality, mood, bloating, notes, created_at
) VALUES (
  39, '2026-02-14', true, 5, 2, 3, 2, 4, 'Día 1 del período - dolor alto', NOW()
)
ON CONFLICT (user_id, log_date) DO UPDATE SET
  is_period_day = true, pain_level = 5, energy_level = 2;
```

```bash
# Ahora cargar sesión D3 en día de menstruación
GET /api/hipertrofiav2/current-session-with-adjustments/39/3
```

**Resultado Esperado**:

```json
{
  "session": {
    "ejercicios": [
      {
        "nombre": "Sentadilla en prensa 45°"
        // Sin cambios
      },
      {
        "nombre": "Sentadilla Goblet (control técnico)",
        "replaced": true,
        "original_exercise": "Sentadilla olímpica con barra",
        "replacement_reason": "Ejercicio de piernas con carga alta..."
      },
      {
        "nombre": "Dead Bug ponderado",
        "replaced": true,
        "original_exercise": "Crunch con carga (disco en pecho)",
        "replacement_reason": "Alto impacto abdominal..."
      },
      {
        "nombre": "Pallof Press con banda elástica",
        "replaced": true,
        "original_exercise": "Ab Wheel posición avanzada",
        "replacement_reason": "Ejercicio de alta tensión abdominal..."
      }
    ]
  },
  "menstrual_adjustment": {
    "phase": "menstrual",
    "adjustment": {
      "type": "low_impact",
      "volumeModifier": -0.3,
      "intensityModifier": -0.3,
      "message": "Malestar alto. Reducimos impacto y volumen.",
      "reason": "high_pain"
    }
  },
  "menstrual_exclusions": {
    "total_replaced": 3,
    "total_warnings_critical": 0,
    "total_modified": 0,
    "replaced_exercises": [
      {
        "original": "Sentadilla olímpica con barra",
        "replacement": "Sentadilla Goblet (control técnico)"
      },
      {
        "original": "Crunch con carga (disco en pecho)",
        "replacement": "Dead Bug ponderado"
      },
      {
        "original": "Ab Wheel posición avanzada",
        "replacement": "Pallof Press con banda elástica"
      }
    ]
  }
}
```

---

### **Escenario 3: UI - Verificar Badges y Mensajes**

Al abrir la sesión en el modal `RoutineSessionModal.jsx`:

1. **Banner de ajuste menstrual** mostrará:

   ```
   Ajuste por ciclo menstrual
   Malestar alto. Reducimos impacto y volumen.

   ✓ 3 ejercicio(s) reemplazado(s) por alternativas más seguras
   ```

2. **Bloque de ejercicios adaptados**:

   ```
   Ejercicios adaptados:
   • Sentadilla olímpica con barra → Sentadilla Goblet (control técnico)
   • Crunch con carga (disco en pecho) → Dead Bug ponderado
   • Ab Wheel posición avanzada → Pallof Press con banda elástica
   ```

3. **Cada ejercicio reemplazado** mostrará:
   - Badge verde: **"✓ Adaptado"**
   - Mensaje informativo con el ejercicio original y motivo

---

## 🔍 QUERIES ÚTILES PARA TESTING

### Ver configuración actual del ciclo

```sql
SELECT * FROM app.user_menstrual_config WHERE user_id = 39;
```

### Ver logs del ciclo

```sql
SELECT log_date, is_period_day, pain_level, energy_level, notes
FROM app.menstrual_daily_log
WHERE user_id = 39
ORDER BY log_date DESC
LIMIT 10;
```

### Ver plan activo

```sql
SELECT id, methodology_type, status, plan_start_date, current_day
FROM app.methodology_plans
WHERE user_id = 39 AND status = 'active';
```

### Ver ejercicios de la sesión D3

```sql
SELECT
  ej->>'nombre' as ejercicio,
  ej->>'categoria' as categoria
FROM app.methodology_plans,
LATERAL jsonb_array_elements(plan_data->'semanas'->0->'sesiones') as sesion,
LATERAL jsonb_array_elements(sesion->'ejercicios') as ej
WHERE user_id = 39
  AND status = 'active'
  AND sesion->>'ciclo_dia' = '3';
```

### Verificar restricciones de ejercicios

```sql
SELECT
  exercise_id,
  nombre,
  menstrual_restriction,
  (SELECT nombre FROM app."Ejercicios_Hipertrofia" alt WHERE alt.exercise_id = e.alternative_exercise_id) as alternativa
FROM app."Ejercicios_Hipertrofia" e
WHERE exercise_id IN (106, 67, 76)  -- IDs de ejercicios en D3
ORDER BY menstrual_restriction;
```

---

## 📅 TIMELINE DEL CICLO

```
17 ene ████ Día 1 - Inicio período (registrado)
18 ene ████ Día 2 - Dolor alto (registrado)
19 ene ████ Día 3 - Mejorando (registrado)
20 ene ████ Día 4 - Último día período (registrado)
21-30 ene     Días 5-14 - Fase folicular (óptima)
31 ene        Día 15 - Fase lútea temprana
1 feb  ◄──   Día 16 - HOY (sin restricciones)
2 feb  🏋️   Día 17 - INICIO DEL PLAN
...
14 feb ████ Día 29 - Próximo período (filtrado activo)
15 feb ████ Día 30/1 - Día 2 del nuevo ciclo
16 feb ████ Día 2 - Dolor alto
17 feb ████ Día 3 - Mejorando
```

---

## 🚀 CÓMO PROBAR EN LA APP

### 1. **Probar HOY (sin restricciones)**

```bash
# 1. Abrir app con usuario María
# 2. Ir a "Rutinas" → Ver plan activo
# 3. Navegar a sesión D3
# 4. Verificar que NO hay filtrado
# Resultado: Ejercicios originales sin modificaciones
```

### 2. **Probar en Menstruación (con restricciones)**

```bash
# 1. Ejecutar SQL para registrar día de período (ver Escenario 2)
# 2. Recargar sesión D3 en la app
# 3. Verificar badges "✓ Adaptado" en ejercicios
# 4. Ver banner con estadísticas de reemplazos
# Resultado: 3 ejercicios reemplazados automáticamente
```

### 3. **Probar Navegación de Calendario**

```bash
# 1. Ir a "Ciclo Menstrual"
# 2. Ver calendario de enero (debe mostrar período 17-20)
# 3. Ver calendario de febrero (debe mostrar período esperado 14-17)
# 4. Registrar síntomas en diferentes días
# Resultado: Sistema adapta entrenamientos automáticamente
```

---

## ⚡ CASOS EDGE A VERIFICAR

### ¿Qué pasa si no hay alternativa?

- El sistema muestra advertencia crítica: **"⚠️ NO RECOMENDADO"**
- Badge rojo en el ejercicio
- Mensaje explicando el riesgo
- Usuario puede decidir si hacerlo o saltearlo

### ¿Qué pasa si el dolor es moderado (pain_level = 3-4)?

- `type = 'reduce_volume'`
- `volumeModifier = -0.2`, `intensityModifier = -0.1`
- NO se aplica filtrado de ejercicios (solo reducción)

### ¿Qué pasa si usa anticonceptivos hormonales?

- `phase = 'hormonal'`
- NO se aplican ajustes por ciclo (hormonas estabilizan)
- Sistema ignora filtrado menstrual

---

## 📊 EXPECTED BEHAVIOR SUMMARY

| Día del Ciclo | Fase               | Dolor            | Filtrado Activo | Ejercicios Adaptados |
| ------------- | ------------------ | ---------------- | --------------- | -------------------- |
| 1-4           | Menstrual          | Alto (5/5)       | ✅ SÍ           | 3 en D3              |
| 5-14          | Folicular          | Bajo (1/5)       | ❌ NO           | Ninguno              |
| 15-21         | Lútea temprana     | Bajo (1/5)       | ❌ NO           | Ninguno              |
| 22-27         | Lútea tardía (SPM) | Moderado (3-4/5) | ⚠️ PARCIAL      | Solo reducción       |
| 28+           | Pre-menstrual      | Alto (4-5/5)     | ✅ SÍ           | Según síntomas       |

---

## ✅ CHECKLIST DE VERIFICACIÓN

- [x] Datos de ciclo eliminados
- [x] Configuración del ciclo creada (28 días, 4 días período, sin hormonales)
- [x] Logs del período registrados (17-20 enero)
- [x] Logs de fases posteriores generados (hasta 6 febrero)
- [x] Plan HipertrofiaV2 creado (ID 244)
- [x] Plan configurado para empezar mañana (2 febrero, día 17)
- [x] Sesión D3 incluye ejercicios con restricciones
- [x] Migración SQL de restricciones ejecutada
- [x] Servicio de filtrado implementado
- [x] Integración en sqlControllers completada
- [x] UI actualizada con badges y mensajes

---

## 🎉 ¡SISTEMA LISTO PARA TESTING!

El sistema está completamente configurado. María puede:

1. ✅ Abrir la app y ver su plan activo
2. ✅ Navegar por las sesiones D1-D5
3. ✅ Ver cómo el sistema adapta automáticamente en diferentes fases
4. ✅ Registrar síntomas diarios y observar cambios en tiempo real
5. ✅ Verificar que los ejercicios peligrosos se reemplazan durante menstruación

**Próximos pasos sugeridos**:

1. Iniciar backend: `cd backend && npm run dev`
2. Iniciar frontend: `npm run dev`
3. Login con `ciclo@ciclo.com`
4. Navegar a "Rutinas" y explorar el plan
5. Probar sesión D3 en diferentes fases del ciclo
