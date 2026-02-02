# Mejoras Implementadas: Control Nutricional Integral

**Fecha:** 2026-02-02  
**Rama:** `feature/nutricion-bridge-metabolico`  
**Estado:** En progreso

---

## 📋 RESUMEN DE CAMBIOS

### ✅ Completadas (Prioridad Alta)

#### 1. Corrección de Umbrales IPG

**Problema:** Discrepancia entre constantes declaradas y código de evaluación

**Antes:**

```javascript
// Constantes declaradas no coincidían con evaluateIPG()
export const IPG_STATUS = {
  GREEN_PLUS: "green_plus", // >= 1.0
  GREEN: "green", // 0.7-0.99
  YELLOW: "yellow", // 0.5-0.69
  RED: "red", // < 0.5
};
```

**Después:**

```javascript
// Alineado con documentación y código
export const IPG_STATUS = {
  GREEN_PLUS: "green_plus", // 1.2-1.5 - Pérdida de grasa óptima
  GREEN: "green", // 0.8-1.19 - Definición eficiente
  YELLOW: "yellow", // 0.6-0.79 - Déficit agresivo
  RED: "red", // < 0.6 - Riesgo pérdida muscular
};
```

**Archivo:** `backend/services/icgIpgDetector.js` líneas 28-36

---

#### 2. Implementación de Estados IEC (Índice de Estabilidad Corporal)

**Problema:** IEC solo retornaba estable/no estable, sin estados de color

**Antes:**

```javascript
// Solo retornaba boolean
const IEC_THRESHOLDS = {
  WEIGHT_STABLE: 0.5,
  WAIST_STABLE: 1.0,
  MAX_WEEKS_STABLE: 4,
};
```

**Después:**

```javascript
// Sistema completo de estados según documentación
const IEC_THRESHOLDS = {
  WEIGHT_STABLE_OPTIMAL: 0.3, // ±0.3kg = VERDE
  WEIGHT_STABLE_NORMAL: 0.5, // ±0.5kg = AMARILLO
  WAIST_STABLE: 1.0, // ±1.0cm se considera estable
  SURPLUS_THRESHOLD: 1.0, // +1kg y +1cm = ROJO
  MAX_WEEKS_STABLE: 4,
};

export const IEC_STATUS = {
  GREEN_PLUS: "green_plus", // Peso estable + perímetros aumentan (recomp)
  GREEN: "green", // ±0.3 kg y cintura estable
  YELLOW: "yellow", // ±0.5 kg (oscilación normal)
  RED: "red", // +1 kg y +1 cm (superávit no deseado)
};
```

**Lógica implementada:**

- **ROJO:** +1 kg y +1 cm → Reducir 150 kcal/día
- **AMARILLO:** ±0.5 kg → Oscilación normal, mantener
- **VERDE:** ±0.3 kg y cintura estable → Mantener
- **VERDE+ (ÓPTIMO):** Peso estable + ↑ perímetros musculares → Recomposición ideal

**Detección de recomposición:**

```javascript
// Verifica si hay aumento de perímetros musculares con peso estable
if (absWeightChange <= 0.3) {
  const bicepsGain = current.biceps_cm - previous.biceps_cm;
  const chestGain = current.chest_cm - previous.chest_cm;
  if (bicepsGain >= 0.3 || chestGain >= 0.5) {
    return IEC_STATUS.GREEN_PLUS; // Recomposición
  }
}
```

**Archivo:** `backend/services/icgIpgDetector.js` líneas 40-277

---

### ⏳ Pendientes (Prioridad Alta)

#### 3. Confirmación 2 Semanas para Cambios de Color

**Objetivo:** Evitar cambios de fase por una sola medición anómala

**Implementación necesaria:**

```javascript
// Tabla para tracking de estados consecutivos
CREATE TABLE IF NOT EXISTS app.icg_ipg_state_history (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  measurement_date DATE NOT NULL,
  indicator_type VARCHAR(10) NOT NULL CHECK (indicator_type IN ('icg', 'ipg', 'iec')),
  indicator_value DECIMAL(5,2),
  status VARCHAR(20) NOT NULL,
  consecutive_count INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW()
);

// Función de validación
function shouldApplyStatusChange(userId, indicatorType, newStatus) {
  // Obtener último estado
  const lastStatus = await getLastStatus(userId, indicatorType);

  // Si es el mismo estado 2 semanas consecutivas, aplicar
  if (lastStatus.status === newStatus && lastStatus.consecutive_count >= 1) {
    return { apply: true, reason: 'confirmed_2_weeks' };
  }

  // Si cambió de VERDE a AMARILLO o ROJO, requiere confirmación
  if (isColorDowngrade(lastStatus.status, newStatus)) {
    return { apply: false, reason: 'requires_confirmation', weeks_remaining: 1 };
  }

  return { apply: true, reason: 'first_occurrence' };
}
```

**Archivos a modificar:**

- `backend/migrations/add_icg_ipg_state_history.sql` (nuevo)
- `backend/services/icgIpgDetector.js` (modificar detectProgressionIssues)

---

### ⏳ Pendientes (Prioridad Media)

#### 4. Tracking de Rendimiento en Entrenamiento

**Objetivo:** Registrar sistemáticamente si el rendimiento sube/mantiene/baja

**Implementación necesaria:**

```javascript
// Añadir a app.body_measurements
ALTER TABLE app.body_measurements
ADD COLUMN training_performance VARCHAR(20)
  CHECK (training_performance IN ('sube', 'mantiene', 'baja', 'no_aplica'));

// O crear tabla dedicada
CREATE TABLE IF NOT EXISTS app.training_performance_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  measurement_date DATE NOT NULL,
  performance_trend VARCHAR(20) NOT NULL CHECK (performance_trend IN ('sube', 'mantiene', 'baja')),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, measurement_date)
);
```

**Integración con ICG/IPG:**

```javascript
// En evaluación de IPG, detectar bajada de rendimiento 2 semanas
const performanceResult = await pool.query(
  `SELECT performance_trend FROM app.training_performance_log
   WHERE user_id = $1 AND measurement_date >= CURRENT_DATE - INTERVAL '14 days'
   ORDER BY measurement_date DESC LIMIT 2`,
  [userId],
);

if (performanceResult.rows.every((r) => r.performance_trend === "baja")) {
  analysis.alerts.push({
    type: "PERFORMANCE_DROP",
    severity: "high",
    message: "Rendimiento bajando 2 semanas consecutivas",
    action: "Considera diet break o normocalórica 2-4 semanas",
  });
}
```

**Archivos a crear/modificar:**

- `backend/migrations/add_training_performance_tracking.sql` (nuevo)
- `backend/services/icgIpgDetector.js` (integrar en detectProgressionIssues)
- `backend/routes/bodyMeasurements.js` (añadir campo en POST)

---

#### 5. Validación Completa de Mediciones

**Objetivo:** Detectar todas las mediciones sospechosas según documentación

**Faltantes detectados:**

##### a) Peso cambia > 2.0% en 7 días

```javascript
// Añadir a validate_waist_measurement() o crear validate_weight_change()
IF ABS((v_weight_change / v_prev_weight) * 100) > 2.0 THEN
  IF ABS(v_waist_change) < 0.5 THEN
    v_is_suspicious := TRUE;
    v_reason := 'Peso cambió >2% sin cambio coherente de cintura';
  END IF;
END IF;
```

##### b) Pliegue cambia ±20% en 7 días

```javascript
// Validar pliegue abdominal
IF v_skinfold_change_pct > 20 THEN
  v_is_suspicious := TRUE;
  v_reason := 'Pliegue abdominal cambió >20% - posible punto de medición distinto';
END IF;
```

##### c) Condiciones de medición distintas

```javascript
// Añadir campos a body_measurements
ALTER TABLE app.body_measurements
ADD COLUMN measurement_time TIME,
ADD COLUMN post_meal BOOLEAN DEFAULT FALSE,
ADD COLUMN post_workout BOOLEAN DEFAULT FALSE,
ADD COLUMN hydration_status VARCHAR(20) CHECK (hydration_status IN ('normal', 'deshidratado', 'retencion'));

// Validar coherencia
IF v_measurement_time_diff > 2 HOURS THEN
  v_warnings.push('Hora de medición diferente a mediciones previas');
END IF;
```

**Archivos a modificar:**

- `backend/services/nutritionCalibrator.js` (extender validate_waist_measurement)
- `backend/migrations/add_measurement_conditions.sql` (nuevo)

---

#### 6. Complementos de Control

**Objetivo:** Implementar todas las reglas adicionales de la documentación

##### a) Volumen: Pliegue abdominal > 20mm/25mm

```javascript
// En evaluación de ICG
if (currentPhase === "volumen") {
  if (current.skinfold_abdominal_mm) {
    const threshold = userLevel === "avanzado" ? 20 : 25;
    if (current.skinfold_abdominal_mm > threshold) {
      analysis.alerts.push({
        type: "HIGH_BODYFAT",
        severity: "medium",
        message: `Pliegue abdominal > ${threshold}mm - Considera finalizar volumen`,
        action:
          "Tu nivel de grasa corporal está alto. Considera pasar a mantenimiento o definición.",
      });
    }
  }
}
```

##### b) Volumen: Perímetros < 0.3 cm/semana con ICG AMARILLO/ROJO

```javascript
// Detectar estancamiento muscular
const avgPerimeterChange = (bicepsChange + chestChange + calfChange) / 3;
if (
  avgPerimeterChange < 0.3 &&
  (icgStatus === "yellow" || icgStatus === "red")
) {
  analysis.alerts.push({
    type: "STALLED_MUSCLE_GROWTH",
    severity: "high",
    message: "Ganando grasa sin músculo - Finalizar volumen",
    action:
      "Tus perímetros no crecen pero tu grasa sí. Pasa a normocalórica o definición.",
  });
}
```

##### c) Definición: Ritmo de pérdida semanal según nivel

```javascript
const weeklyLossTargets = {
  principiante: { min: 0.5, max: 1.25 },
  intermedio: { min: 0.5, max: 1.0 },
  avanzado: { min: 0.25, max: 0.75 },
};

const weeklyLossRate =
  (((weightChange / daysBetween) * 7) / previousWeight) * 100;
const target = weeklyLossTargets[userLevel];

if (weeklyLossRate > target.max) {
  analysis.alerts.push({
    type: "EXCESSIVE_LOSS_RATE",
    severity: "high",
    message: `Pérdida demasiado rápida: ${weeklyLossRate.toFixed(2)}%/sem (máx ${target.max}%)`,
    action: "Aumenta calorías 100-200/día para evitar pérdida muscular",
  });
}
```

##### d) Definición: Perímetros >= 0.5 cm/semana

```javascript
if (currentPhase === "definicion" && Math.abs(avgPerimeterChange) >= 0.5) {
  analysis.alerts.push({
    type: "RAPID_PERIMETER_LOSS",
    severity: "high",
    message:
      "Perímetros bajando >= 0.5cm/sem - Posible pérdida muscular o medición incorrecta",
    action:
      "Verifica tu técnica de medición. Si es correcta, aumenta proteína y reduce déficit.",
  });
}
```

##### e) Definición: Pliegue estable 14 días

```javascript
if (twoWeeksAgo && twoWeeksAgo.skinfold_abdominal_mm) {
  const skinfoldChange = Math.abs(
    current.skinfold_abdominal_mm - twoWeeksAgo.skinfold_abdominal_mm,
  );
  if (skinfoldChange < 1 && weightChange < -0.5) {
    analysis.alerts.push({
      type: "STALLED_FAT_LOSS",
      severity: "medium",
      message: "Pliegue estable 14 días - Ajustar déficit",
      action:
        "El pliegue no baja pero el peso sí. Reajusta macros o reduce calorías gradualmente.",
    });
  }
}
```

**Archivos a modificar:**

- `backend/services/icgIpgDetector.js` (añadir en detectProgressionIssues)

---

### ⏳ Pendientes (Prioridad Baja)

#### 7. Integrar Pliegue Abdominal en Indicadores

**Objetivo:** Usar skinfold_abdominal_mm en todos los cálculos relevantes

**Tareas:**

1. Incluir en consultas de mediciones
2. Validar en validate_waist_measurement
3. Usar en complementos de control (ya descrito arriba)
4. Añadir a análisis de body composition

---

## 📊 ESTADO DE IMPLEMENTACIÓN

| Prioridad | Tarea                   | Estado        | Archivo(s)                                      |
| --------- | ----------------------- | ------------- | ----------------------------------------------- |
| 🔴 Alta   | Corregir umbrales IPG   | ✅ Completado | `icgIpgDetector.js`                             |
| 🔴 Alta   | Implementar estados IEC | ✅ Completado | `icgIpgDetector.js`                             |
| 🔴 Alta   | Confirmación 2 semanas  | ⏳ Pendiente  | `add_icg_ipg_state_history.sql` (nuevo)         |
| 🟡 Media  | Tracking rendimiento    | ⏳ Pendiente  | `add_training_performance_tracking.sql` (nuevo) |
| 🟡 Media  | Validación completa     | ⏳ Pendiente  | `nutritionCalibrator.js`                        |
| 🟡 Media  | Complementos control    | ⏳ Pendiente  | `icgIpgDetector.js`                             |
| 🟢 Baja   | Integrar pliegue        | ⏳ Pendiente  | Múltiples archivos                              |

---

## 🎯 PRÓXIMOS PASOS

### Commit Actual (Prioridad Alta Completada)

```bash
git add backend/services/icgIpgDetector.js docs/MEJORAS_CONTROL_NUTRICIONAL.md
git commit -m "feat(nutrition): correct IPG thresholds and implement IEC color states

- Fix IPG_STATUS constants to match documentation (RED <0.6, YELLOW 0.6-0.8, GREEN 0.8-1.2, GREEN+ 1.2-1.5)
- Implement IEC_STATUS with 4 states (RED, YELLOW, GREEN, GREEN+)
- Add recomposition detection (stable weight + increased muscle perimeters)
- Align IEC calorie adjustments with documentation (150 kcal vs 50-100 kcal)
- Export IEC_STATUS for external use

Refs: docs/ANALISIS_CONTROL_NUTRICIONAL.md sections 5 and 6"
```

### Siguientes Commits (Por Orden)

1. Confirmación 2 semanas
2. Tracking de rendimiento
3. Validación completa de mediciones
4. Complementos de control
5. Integración de pliegue abdominal

---

**Elaborado por:** Claude AI Assistant  
**Última actualización:** 2026-02-02  
**Versión:** 1.0
