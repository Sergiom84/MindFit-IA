# Verificación Exacta: Control Nutricional Integral vs Implementación

**Fecha:** 2026-02-02  
**Documentación:** Control Nutricional Integral (4 páginas proporcionadas)  
**Implementación:** `feature/nutricion-bridge-metabolico`

---

## ✅ VERIFICACIÓN EXACTA CONTRA DOCUMENTACIÓN

### 1. VARIABLES A MEDIR (Documentación exacta)

**Frecuencia:** Una vez por semana, mismo día, misma hora, mismo estado fisiológico

**Variables requeridas:**

- Peso corporal (kg)
- Perímetro de cintura (cm)
- Perímetro de bíceps (cm)
- Perímetro de pecho (cm)
- Perímetro de gemelo (cm)
- Pliegue abdominal (mm, mismo punto anatómico)
- Rendimiento en entrenamiento (sube/mantiene/baja)

**Implementación actual:**

```sql
SELECT
  measurement_date,
  weight_kg,           -- ✅
  waist_cm,           -- ✅
  biceps_cm,          -- ✅
  chest_cm,           -- ✅
  calf_cm             -- ✅
FROM app.body_measurements
```

**✅ Implementado:** Peso, cintura, bíceps, pecho, gemelo  
**❌ Falta:** Pliegue abdominal (campo existe pero no se usa)  
**❌ Falta:** Rendimiento en entrenamiento (no existe campo)

---

### 2.1 REGLA ANTI-RUIDO (Documentación exacta)

**Confirmación 2 semanas:** El mismo estado (color) se repite dos mediciones semanales consecutivas.

**Media móvil 14 días:** Se usa la media (peso y cintura) de las últimas 2 semanas para calcular el indicador.

**Cambio de fase:** Si hay cambio de fase recomendado → aplicar la misma regla. NO se cambia por una sola semana salvo alerta clara.

**Implementación actual:**

- ✅ Sistema de calibración usa media de 7 días
- ⚠️ Documentación pide **14 días** (2 semanas)
- ❌ NO valida 2 mediciones consecutivas con mismo color en ICG/IPG

**DISCREPANCIA:** Calibración usa 7 días, documentación pide 14 días (media móvil).

---

### 2.2 VALIDACIÓN DE MEDICIONES (Documentación EXACTA)

**Cintura cambia > 2.5 cm en 7 días** sin un cambio de peso coherente → solicitar repetir

**Peso cambia > 3 kg en 7 días** sin cambios coherentes en cintura y/o pliegue → solicitar

**Pliegue cambia de forma brusca (±20%)** en una semana (posible punto de medición distinto)

**Usuario declara que midió en condiciones distintas** (hora, después de comer, post-entreno, etc.) → advertir

**Implementación actual:**

```javascript
// validate_waist_measurement()
IF v_waist_change > 2.5 THEN
  v_expected_weight_change := (v_waist_change / 2.5) * 0.5;
  IF v_weight_change < (v_expected_weight_change * 0.5) THEN
    v_is_suspicious := TRUE;
  END IF;
END IF;
```

**✅ Implementado:** Cintura > 2.5 cm  
**❌ Falta:** Peso > **3 kg** (no 2.0%)  
**❌ Falta:** Pliegue ±20%  
**❌ Falta:** Condiciones distintas

---

### 3. CONTROL EN FASE DE VOLUMEN (Documentación EXACTA)

#### 3.2 Indicador clave: ICG

**ICG = cm de cintura ganados / kg de peso corporal ganado**

#### 3.3 Interpretación ICG (EXACTA)

| Estado              | ICG (cm/kg) | Interpretación             | Acción                                         |
| ------------------- | ----------- | -------------------------- | ---------------------------------------------- |
| **ROJO**            | >= 1.5      | Ganancia de grasa excesiva | Pasar a normocalórica o definición 2-4 semanas |
| **AMARILLO**        | 1.0 - 1.4   | Volumen descontrolado      | Reducir superávit 150-250 kcal/día             |
| **VERDE**           | 0.8 - 0.9   | Volumen correcto           | Mantener estrategia                            |
| **VERDE+ (ÓPTIMO)** | 0.5 - 0.7   | Muy eficiente              | Mantener o subir carga de entreno              |

**Implementación actual:**

```javascript
if (icg >= 1.5)
  return ICG_STATUS.RED; // ✅
else if (icg >= 1.0)
  return ICG_STATUS.YELLOW; // ✅
else if (icg >= 0.8)
  return ICG_STATUS.GREEN; // ✅
else return ICG_STATUS.GREEN_PLUS; // ✅ (< 0.8, óptimo 0.5-0.7)
```

**✅ CORRECTO:** Umbrales exactos según documentación

#### 3.4 Complementos de control (EXACTOS)

1. **Pliegue abdominal > 20 mm (avanzados) o > 25 mm (intermedios)** → sugerir fin de volumen
2. **Si la ganancia de grasa iguala o supera la muscular** → finalizar volumen
3. **Si la media de perímetros musculares crece < 0.3 cm/semana con ICG AMARILLO o ROJO** → finalizar volumen
4. **Nota anti-ruido:** aplicar regla de confirmación (2.1) antes de pasar de AMARILLO→ROJO o cambiar fase

**Implementación actual:**

- ❌ Pliegue abdominal NO verificado
- ❌ Ganancia grasa vs muscular NO calculado
- ❌ Perímetros < 0.3 cm/semana NO verificado
- ❌ Confirmación 2 semanas NO implementada

#### 3.5 Decisiones (semáforo)

- **VERDE / VERDE+ (ÓPTIMO)** → continuar volumen
- **AMARILLO** → normocalórica 2-4 semanas (o ajustar superávit) y reevaluar
- **ROJO** → finalizar volumen (mantenimiento o definición)

**Implementación actual:**

- ✅ Genera recomendaciones
- ❌ NO cambia fase automáticamente
- ❌ NO aplica normocalórica temporal

---

### 4. CONTROL EN FASE DE DEFINICIÓN (Documentación EXACTA)

#### 4.2 Indicador clave: IPG

**IPG = cm de cintura perdidos / kg de peso perdido**

#### 4.3 Interpretación IPG (EXACTA)

| Estado              | IPG (cm/kg) | Interpretación             | Acción                           |
| ------------------- | ----------- | -------------------------- | -------------------------------- |
| **ROJO**            | < 0.6       | Riesgo de pérdida muscular | Subir kcal +150-250 o diet break |
| **AMARILLO**        | 0.6 - 0.8   | Déficit agresivo           | Mantener 7-14 días               |
| **VERDE**           | 0.8 - 1.2   | Definición eficiente       | Mantener                         |
| **VERDE+ (ÓPTIMO)** | 1.2 - 1.5   | Muy buena pérdida de grasa | Mantener o microajuste           |

**Implementación actual (CORREGIDA en commit 2872c68):**

```javascript
if (ipg < 0.6)
  return IPG_STATUS.RED; // ✅
else if (ipg < 0.8)
  return IPG_STATUS.YELLOW; // ✅
else if (ipg < 1.2)
  return IPG_STATUS.GREEN; // ✅
else return IPG_STATUS.GREEN_PLUS; // ✅ (1.2-1.5)
```

**✅ CORRECTO:** Umbrales corregidos según documentación

#### 4.4 Complementos de control (EXACTOS)

**Ritmo de pérdida semanal (referencia, usando media móvil 14 días):**

- **Principiante o % graso alto:** 0.5 - 1.25%/sem
- **Intermedio:** 0.5 - 1.0%/sem
- **Avanzado o % graso bajo:** 0.25 - 0.75%/sem

**Otras reglas:**

- **Descenso de perímetros >= 0.5 cm/semana** → alerta (posible pérdida muscular o medición incorrecta)
- **Bajada de rendimiento 2 semanas consecutivas** → sugerir diet break o normocalórica 2-4 semanas
- **Pliegue abdominal estable 14 días** → reajustar macros o déficit
- **Nota:** si se detectan datos sospechosos (2.2), repetir medición antes de actuar

**Implementación actual:**

- ❌ Ritmo semanal por nivel NO calculado
- ❌ Perímetros >= 0.5 cm/semana NO detectado
- ❌ Rendimiento 2 semanas NO tracked
- ❌ Pliegue estable 14 días NO verificado
- ✅ Detección adicional: pérdida peso sin cintura (implementado)

#### 4.5 Decisiones (semáforo)

- **VERDE / VERDE+ (ÓPTIMO)** → continuar definición
- **AMARILLO** → mantener y observar (aplicar confirmación 2.1)
- **ROJO** → pasar a normocalórica 2-4 semanas o diet break

---

### 5. CONTROL EN FASE NORMOCALÓRICA (Documentación EXACTA)

#### 5.2 Indicador clave: IEC

**IEC = Variación conjunta de peso y cintura en 14 días**

#### 5.3 Interpretación IEC (EXACTA)

| Estado              | Variación (14 días)         | Interpretación       | Acción                     |
| ------------------- | --------------------------- | -------------------- | -------------------------- |
| **ROJO**            | +1 kg y +1 cm               | Superávit no deseado | Reducir kcal 150/día       |
| **AMARILLO**        | ±0.5 kg                     | Oscilación normal    | Mantener                   |
| **VERDE**           | ±0.3 kg y ± cintura         | Recomp positiva      | Mantener                   |
| **VERDE+ (ÓPTIMO)** | Peso estable + ↑ perímetros | Recomp ideal         | Mantener o micro superávit |

**Implementación actual (CORREGIDA en commit 2872c68):**

```javascript
// Umbrales
const IEC_THRESHOLDS = {
  WEIGHT_STABLE_OPTIMAL: 0.3, // ✅ ±0.3kg = VERDE
  WEIGHT_STABLE_NORMAL: 0.5, // ✅ ±0.5kg = AMARILLO
  WAIST_STABLE: 1.0, // ✅ ±1.0cm
  SURPLUS_THRESHOLD: 1.0, // ✅ +1kg y +1cm = ROJO
  MAX_WEEKS_STABLE: 4,
};

// Estados
export const IEC_STATUS = {
  GREEN_PLUS: "green_plus", // ✅ Peso estable + ↑ perímetros
  GREEN: "green", // ✅ ±0.3 kg y cintura estable
  YELLOW: "yellow", // ✅ ±0.5 kg
  RED: "red", // ✅ +1 kg y +1 cm
};
```

**✅ CORRECTO:** Estados IEC implementados según documentación

**Ajuste de calorías:**

- Documentación: **150 kcal/día**
- Implementación: **150 kcal/día** ✅ (corregido)

#### 5.4 Complementos de control (EXACTOS)

- **Subida de grasa sin mejora muscular** → micro déficit
- **Bajada de peso no intencionada** → micro superávit
- **Rendimiento a la baja** → ajuste de hidratos
- **Nota anti-ruido:** la variación se evalúa siempre a 14 días (media móvil) para evitar ruido semanal

**Implementación actual:**

- ⚠️ Evalúa 4 semanas (aprox. 28 días), documentación pide **14 días**
- ✅ Detecta recomposición (peso estable + ↑ perímetros)
- ❌ Rendimiento NO tracked

#### 5.5 Decisiones (semáforo)

- **VERDE / VERDE+ (ÓPTIMO)** → continuar normocalórica
- **AMARILLO** → observar 1-2 semanas (aplicar confirmación 2.1)
- **ROJO** → corregir calorías (tras confirmación o si se mantiene 14 días)

---

### 6. GESTIÓN DE SALTOS DE DIETA (Documentación EXACTA)

#### Campos a registrar:

- Fecha y franja (desayuno, comida, cena, extra)
- Descripción de alimentos consumidos
- Calorías estimadas del salto (kcal)
- Macronutrientes estimados: proteínas (g), carbohidratos (g), grasas (g)
- Nivel de confianza (bajo / medio / alto)

**Implementación actual:**

```javascript
const {
  date, // ✅
  meal_slot, // ✅
  excess_kcal, // ✅
  description, // ✅
  foods_consumed, // ✅
  confidence_level, // ✅
  excess_protein, // ✅
  excess_carbs, // ✅
  excess_fat, // ✅
} = req.body;
```

**✅ CORRECTO:** Todos los campos implementados

#### Lógica de compensación semanal:

1. Objetivo semanal = kcal_diarias_objetivo × 7
2. Acumulado semanal = suma de calorías registradas
3. Desviación = acumulado - objetivo
4. Si hay exceso, repartir corrección (kcal) entre los días restantes de la semana
5. Mantener proteínas >= 2 g/kg y compensar con carbohidratos o grasas según distribución

**Regla anti-ruido:** Si el nivel de confianza del salto es bajo, se recomienda aplicar la corrección de forma conservadora (p. ej., repartir la mitad) y reevaluar al cierre semanal.

**Implementación actual:**

```javascript
// calculate_compensation() líneas 151-260
IF p_confidence = 'bajo' OR COALESCE(v_config.conservative_mode, FALSE) THEN
  v_effective_excess := p_excess_kcal / 2;  // ✅ Reparte la mitad
ELSE
  v_effective_excess := p_excess_kcal;
END IF;
```

**✅ CORRECTO:** Lógica implementada según documentación

---

### 7. REEVALUACIÓN (Documentación EXACTA)

**Todas las fases se revisarán cada 14 días** para reajustar calorías, macronutrientes y fase activa según la respuesta del usuario. Las decisiones se toman con confirmación (2.1) y validación de datos (2.2).

**Implementación actual:**

- ✅ Sistema de calibración cada 14 días (configurable 7-60)
- ✅ Validación de datos implementada (parcial)
- ❌ Confirmación 2.1 NO implementada en ICG/IPG

---

## 📊 RESUMEN COMPARATIVO EXACTO

### ✅ IMPLEMENTADO CORRECTAMENTE

| Componente          | Estado | Nota                                                                   |
| ------------------- | ------ | ---------------------------------------------------------------------- |
| ICG umbrales        | ✅     | ROJO >= 1.5, AMARILLO 1.0-1.4, VERDE 0.8-0.9, VERDE+ 0.5-0.7           |
| IPG umbrales        | ✅     | Corregido: ROJO < 0.6, AMARILLO 0.6-0.8, VERDE 0.8-1.2, VERDE+ 1.2-1.5 |
| IEC estados         | ✅     | Implementado: ROJO, AMARILLO, VERDE, VERDE+                            |
| IEC umbrales        | ✅     | ROJO +1kg +1cm, AMARILLO ±0.5kg, VERDE ±0.3kg, VERDE+ recomp           |
| Saltos de dieta     | ✅     | Campos, compensación y regla anti-ruido                                |
| Calibración 14 días | ✅     | Sistema completo                                                       |

### ⚠️ DISCREPANCIAS DETECTADAS

1. **Media móvil:** Implementación usa 7 días, documentación pide **14 días**
2. **Validación peso:** Documentación pide > **3 kg**, no 2.0%
3. **Evaluación IEC:** Usa 4 semanas (~28 días), documentación pide **14 días**

### ❌ FALTANTES CRÍTICOS (NO IMPLEMENTADOS)

1. **Pliegue abdominal:** Campo existe pero NO se usa en indicadores
2. **Rendimiento en entrenamiento:** NO existe campo ni tracking
3. **Confirmación 2 semanas:** NO valida 2 mediciones consecutivas ICG/IPG
4. **Complementos de control:**
   - Pliegue > 20mm/25mm en volumen
   - Ritmo semanal por nivel en definición
   - Perímetros < 0.3 cm/sem volumen, >= 0.5 cm/sem definición
   - Rendimiento 2 semanas consecutivas
   - Pliegue estable 14 días
5. **Decisiones automáticas:** NO cambia fase automáticamente

---

## 🎯 PLAN DE ACCIÓN EXACTO

### Prioridad 1 (Crítico - Según Documentación)

1. **Media móvil 14 días** - Cambiar de 7 a 14 días en calibración
2. **Validación peso 3 kg** - Corregir de 2.0% a 3 kg absolutos
3. **IEC evaluación 14 días** - Cambiar de 4 semanas a 14 días

### Prioridad 2 (Alto - Falta Implementar)

4. **Confirmación 2 semanas** - Tabla de historial de estados ICG/IPG
5. **Rendimiento tracking** - Campo y validación

### Prioridad 3 (Medio - Complementos)

6. **Complementos de control** - Todas las reglas adicionales
7. **Pliegue abdominal** - Integrar en indicadores

---

**Elaborado por:** Claude AI Assistant  
**Fecha:** 2026-02-02  
**Basado en:** Documentación exacta de 4 páginas proporcionadas por el usuario
