# Sistema de Calibración Nutricional Automática

> Nota (04.02.2026): `app.user_body_measurements` queda **deprecada**. La fuente única es `app.body_measurements` y los endpoints de mediciones legacy devuelven `410 Gone`.

## 📋 Descripción

Sistema completo para ajustar dinámicamente el **Gasto Calórico Total (GCT)** basado en datos reales del usuario, implementando:

- ✅ **Validación de mediciones sospechosas** (cambio de cintura > 2.5 cm sin cambio de peso coherente)
- ✅ **Calibración cada 14 días** con reglas anti-ruido
- ✅ **Ajustes graduales** de 150-250 kcal por iteración
- ✅ **Reglas específicas por fase** (cut/mant/bulk)

---

## 🗂️ Archivos Creados

### Migraciones SQL

- **`backend/migrations/create_nutrition_calibration_system.sql`**
  - Tablas: `body_measurements` (fuente única), `nutrition_calibrations`, `user_calibration_config`
  - Funciones: `calculate_weight_average()`, `validate_waist_measurement()`, `should_trigger_nutrition_calibration()`
  - Triggers para actualización automática de timestamps y fechas
  - Vista: `v_pending_calibrations` para usuarios que necesitan calibración

### Servicios

- **`backend/services/nutritionCalibrator.js`**
  - `saveMeasurement()` - Guarda mediciones con validación automática
  - `validateWaistMeasurement()` - Valida cambios sospechosos de cintura
  - `calculateWeightAverage()` - Calcula media de peso de últimos N días
  - `evaluateCalibration()` - Evalúa si se requiere ajuste según fase
  - `applyCalibration()` - Aplica calibración al perfil nutricional
  - `shouldTriggerCalibration()` - Verifica si toca calibración
  - `getCalibrationHistory()` - Obtiene historial de calibraciones
  - `runAutoCalibration()` - Ejecuta calibración automática completa

### Rutas API

- **`backend/routes/nutritionCalibration.js`**
  - `POST /api/nutrition/calibration/measurements` - **Deprecated (410)** → usar `/api/body-measurements`
  - `GET /api/nutrition/calibration/measurements` - **Deprecated (410)** → usar `/api/body-measurements/history`
  - `GET /api/nutrition/calibration/measurements/latest` - **Deprecated (410)** → usar `/api/body-measurements/latest`
  - `GET /api/nutrition/calibration/measurements/average` - **Deprecated (410)** → usar `/api/body-measurements/trends`
  - `POST /api/nutrition/calibration/measurements/validate-waist` - **Deprecated (410)** → usar `/api/body-measurements`
  - `POST /api/nutrition/calibration/calibrate` - Ejecutar calibración manual
  - `GET /api/nutrition/calibration/calibrate/evaluate` - Evaluar sin aplicar
  - `GET /api/nutrition/calibration/calibrate/should-calibrate` - Verificar necesidad
  - `GET /api/nutrition/calibration/calibrate/history` - Historial de calibraciones
  - `POST /api/nutrition/calibration/calibrate/auto` - Calibración automática
  - `GET /api/nutrition/calibration/calibrate/config` - Obtener configuración
  - `PUT /api/nutrition/calibration/calibrate/config` - Actualizar configuración
  - `POST /api/nutrition/calibration/calibrate/feedback` - Registrar feedback

---

## 📊 Estructura de Datos

### Tabla: `body_measurements` (fuente única)

Almacena el historial de mediciones corporales del usuario. Ver schema completo en `backend/migrations/20260201_body_measurements_complete_system.sql`.

### Tabla: `nutrition_calibrations`

Registro de calibraciones nutricionales y ajustes del GCT.

```sql
CREATE TABLE app.nutrition_calibrations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  calibration_date DATE DEFAULT CURRENT_DATE,
  evaluation_period_days INTEGER DEFAULT 14,
  peso_inicial_kg DECIMAL(5,2) NOT NULL,
  peso_final_kg DECIMAL(5,2) NOT NULL,
  peso_medio_7dias_kg DECIMAL(5,2) NOT NULL,
  peso_change_kg DECIMAL(5,2),
  peso_change_pct DECIMAL(5,3),
  weekly_change_pct DECIMAL(5,3),
  current_kcal_objetivo INTEGER NOT NULL,
  previous_tdee INTEGER NOT NULL,
  objetivo VARCHAR(20) NOT NULL,
  adjustment_kcal INTEGER,
  adjustment_reason TEXT,
  should_adjust BOOLEAN DEFAULT FALSE,
  applied BOOLEAN DEFAULT FALSE,
  new_kcal_objetivo INTEGER,
  applied_at TIMESTAMP,
  user_feedback TEXT,
  performance_notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Tabla: `user_calibration_config`

Configuración personalizada de calibración por usuario.

```sql
CREATE TABLE app.user_calibration_config (
  user_id INTEGER PRIMARY KEY,
  auto_calibrate BOOLEAN DEFAULT TRUE,
  calibration_frequency_days INTEGER DEFAULT 14,
  min_measurements_required INTEGER DEFAULT 5,
  max_adjustment_kcal INTEGER DEFAULT 250,
  notify_calibration BOOLEAN DEFAULT TRUE,
  notify_suspicious_measurement BOOLEAN DEFAULT TRUE,
  last_calibration_date DATE,
  next_calibration_date DATE,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 🔄 Flujo de Calibración

### 1. Registro de Mediciones

Usuario registra peso diariamente (mínimo 5 mediciones en 7 días).

```javascript
POST /api/body-measurements
{
  "weight": 75.5,
  "waist": 85.0,
  "date": "2026-02-02",
  "conditions": {
    "fasted": true,
    "time_of_day": "morning"
  },
  "notes": "Medición en ayunas"
}
```

**Validación automática:**

- Si `cintura_cm` cambia > 2.5 cm en 7 días sin cambio proporcional de peso → marcada como sospechosa

### 2. Verificar Necesidad de Calibración

Cada 14 días (configurable), el sistema verifica si toca calibrar.

```javascript
GET /api/nutrition/calibration/calibrate/should-calibrate

Response:
{
  "shouldCalibrate": true,
  "daysSinceLast": 15,
  "reason": "Han pasado 15 días desde la última calibración"
}
```

### 3. Evaluar Calibración

El sistema calcula si se requiere ajuste según la fase:

```javascript
GET /api/nutrition/calibration/calibrate/evaluate

Response:
{
  "canCalibrate": true,
  "shouldAdjust": true,
  "currentWeightAvg": 75.2,
  "previousWeightAvg": 76.0,
  "weightChange_kg": -0.8,
  "weightChange_pct": -1.05,
  "weeklyChange_pct": -0.53,
  "currentKcal": 2300,
  "adjustmentKcal": 0,
  "newKcalObjetivo": 2300,
  "reason": "Ritmo de pérdida adecuado (0.53%/semana entre 0.3% y 1%). No requiere ajuste.",
  "ruleApplied": "Déficit: ritmo adecuado"
}
```

### 4. Aplicar Calibración

Si `shouldAdjust: true`, el sistema aplica el ajuste automáticamente:

```javascript
POST /api/nutrition/calibration/calibrate

Response:
{
  "success": true,
  "calibration": {
    "calibrationId": 123,
    "applied": true,
    "adjustmentKcal": -200,
    "newKcalObjetivo": 2100,
    "reason": "Pérdida de peso lenta (0.25%/semana < 0.3%). Reducir 200 kcal"
  }
}
```

---

## ⚙️ Reglas de Ajuste por Fase

### Normocalórica (Mantenimiento)

**Objetivo:** Mantener peso estable

| Condición                        | Acción            |
| -------------------------------- | ----------------- |
| Peso cambia > 0.5% en 14 días    | Ajustar ±150 kcal |
| Peso estable (< 0.5% en 14 días) | No ajustar        |

**Ejemplo:**

- Peso aumentó +0.7% (76.0 kg → 76.5 kg) → **Reducir 150 kcal**
- Peso bajó -0.6% (76.0 kg → 75.5 kg) → **Aumentar 150 kcal**

---

### Déficit (Cut)

**Objetivo:** Perder grasa gradualmente

| Condición                               | Acción                                    |
| --------------------------------------- | ----------------------------------------- |
| Pérdida < 0.3%/semana durante 2 semanas | Reducir 200 kcal                          |
| Pérdida entre 0.3% y 1%/semana          | No ajustar (ritmo óptimo)                 |
| Pérdida > 1%/semana                     | Aumentar 200 kcal (considerar diet break) |

**Ejemplo:**

- Pérdida de 0.2%/semana (muy lento) → **Reducir 200 kcal**
- Pérdida de 0.6%/semana (perfecto) → **No ajustar**
- Pérdida de 1.3%/semana (muy rápido) → **Aumentar 200 kcal**

---

### Superávit (Bulk)

**Objetivo:** Ganar masa muscular minimizando grasa

| Condición                           | Acción                         |
| ----------------------------------- | ------------------------------ |
| Ganancia < 0.15%/semana             | Aumentar 150 kcal              |
| Ganancia entre 0.15% y 0.35%/semana | No ajustar (ritmo óptimo)      |
| Ganancia > 0.35%/semana             | Reducir 200 kcal               |
| Pérdida de peso en volumen          | Aumentar 250 kcal urgentemente |

**Ejemplo:**

- Ganancia de 0.1%/semana (muy lento) → **Aumentar 150 kcal**
- Ganancia de 0.25%/semana (perfecto) → **No ajustar**
- Ganancia de 0.5%/semana (muy rápido) → **Reducir 200 kcal**

---

## 🔧 Configuración

### Obtener Configuración Actual

```javascript
GET /api/nutrition/calibration/calibrate/config

Response:
{
  "auto_calibrate": true,
  "calibration_frequency_days": 14,
  "min_measurements_required": 5,
  "max_adjustment_kcal": 250,
  "notify_calibration": true,
  "notify_suspicious_measurement": true,
  "last_calibration_date": "2026-01-19",
  "next_calibration_date": "2026-02-02"
}
```

### Actualizar Configuración

```javascript
PUT /api/nutrition/calibration/calibrate/config
{
  "auto_calibrate": true,
  "calibration_frequency_days": 21,  // Cambiar a 3 semanas
  "min_measurements_required": 4,
  "max_adjustment_kcal": 200,
  "notify_calibration": true
}
```

---

## 📈 Historial y Seguimiento

### Historial de Calibraciones

```javascript
GET /api/nutrition/calibration/calibrate/history?limit=10

Response:
{
  "calibrations": [
    {
      "id": 5,
      "calibration_date": "2026-02-02",
      "peso_inicial_kg": 76.0,
      "peso_final_kg": 75.2,
      "peso_change_pct": -1.05,
      "weekly_change_pct": -0.53,
      "objetivo": "cut",
      "current_kcal_objetivo": 2300,
      "adjustment_kcal": 0,
      "new_kcal_objetivo": 2300,
      "adjustment_reason": "Ritmo de pérdida adecuado",
      "should_adjust": false,
      "applied": false
    }
  ]
}
```

### Registrar Feedback

Permite al usuario comentar sobre la efectividad del ajuste:

```javascript
POST /api/nutrition/calibration/calibrate/feedback
{
  "calibration_id": 5,
  "feedback": "Me siento con buena energía, sin hambre excesiva",
  "performance_notes": "Rendimiento en el gym manteniéndose bien"
}
```

---

## 🤖 Calibración Automática

### Ejecutar Manualmente

```javascript
POST /api/nutrition/calibration/calibrate/auto

Response:
{
  "success": true,
  "executed": true,
  "calibration": {
    "shouldAdjust": true,
    "adjustmentKcal": -200,
    "reason": "Pérdida de peso lenta (0.25%/semana < 0.3%). Reducir 200 kcal"
  }
}
```

### Cron Job Automático (Futuro)

Se puede implementar un cron job que ejecute calibración automática diariamente para usuarios que lo tengan habilitado:

```javascript
// backend/jobs/nutritionCalibrationCron.js
import cron from "node-cron";
import {
  getPendingCalibrations,
  runAutoCalibration,
} from "../services/nutritionCalibrator.js";

export function startNutritionCalibrationCron() {
  // Ejecutar todos los días a las 6:00 AM
  cron.schedule("0 6 * * *", async () => {
    const pending = await getPendingCalibrations();

    for (const user of pending) {
      await runAutoCalibration(user.user_id);
    }
  });
}
```

---

## ✅ Ventajas del Sistema

1. **Precisión**: Ajuste basado en datos reales del usuario, no estimaciones
2. **Seguridad**: Reglas anti-ruido evitan ajustes por fluctuaciones normales de agua/glucógeno
3. **Gradualidad**: Ajustes de 150-250 kcal son sostenibles y no causan choque metabólico
4. **Transparencia**: Usuario ve el razonamiento detrás de cada ajuste
5. **Validación**: Detecta mediciones sospechosas para evitar errores
6. **Personalización**: Cada usuario puede configurar frecuencia y parámetros

---

## 🧪 Casos de Uso

### Caso 1: Usuario en Déficit con Pérdida Lenta

**Situación:**

- Peso inicial: 80.0 kg
- Peso actual (14 días después): 79.7 kg
- Cambio: -0.38% total, -0.19%/semana
- Objetivo: cut
- Calorías actuales: 2200 kcal

**Evaluación:**

- Pérdida < 0.3%/semana → Muy lento
- Regla aplicada: "Déficit: pérdida <0.3%/semana"

**Acción:**

- Ajuste: -200 kcal
- Nuevas calorías: 2000 kcal
- Razón: "Pérdida de peso lenta (0.19%/semana < 0.3%). Reducir 200 kcal para acelerar déficit."

---

### Caso 2: Usuario en Volumen con Ganancia Rápida

**Situación:**

- Peso inicial: 70.0 kg
- Peso actual (14 días después): 70.6 kg
- Cambio: +0.86% total, +0.43%/semana
- Objetivo: bulk
- Calorías actuales: 2800 kcal

**Evaluación:**

- Ganancia > 0.35%/semana → Muy rápido (probable grasa excesiva)
- Regla aplicada: "Superávit: ganancia >0.35%/semana"

**Acción:**

- Ajuste: -200 kcal
- Nuevas calorías: 2600 kcal
- Razón: "Ganancia de peso rápida (0.43%/semana > 0.35%). Reducir 200 kcal para minimizar ganancia de grasa."

---

## 📚 Referencias

- **Documentación base:** `docs/PLAN_MEJORAS_CALIBRACION.md`
- **Análisis TMB/GCT:** `docs/ANALISIS_TMB_GCT.md`

---

## 🔗 Integración con Sistema Existente

Este sistema se integra con:

- ✅ **`nutrition_profiles`** - Actualiza `kcal_objetivo` automáticamente
- ✅ **`metabolic_profile`** - Respeta distribución de macros según perfil metabólico
- ✅ **`nutritionCalculator.js`** - Utiliza cálculos de TMB/TDEE existentes
- ✅ **`body_measurements`** (fuente única) - Compatible con sistema de mediciones corporales existente

---

**Implementado por:** Claude AI Assistant  
**Fecha:** 2026-02-02  
**Versión:** 1.0  
**Estado:** ✅ Listo para Producción
