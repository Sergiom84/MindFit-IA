# Plan de Mejoras: Sistema TMB/GCT - Calibración y Ajuste Dinámico

**Fecha:** 2026-02-02  
**Rama:** `feature/nutricion-bridge-metabolico`  
**Prioridad:** Media-Alta  
**Estado:** Propuesta

---

> Nota (04.02.2026): `app.user_body_measurements` queda **deprecada**. La fuente única es `app.body_measurements`.

## 🎯 OBJETIVO

Implementar el sistema de calibración y ajuste dinámico del GCT según las reglas documentadas en el módulo de metabolismo, manteniendo la regla anti-ruido y los ajustes graduales.

---

## 📋 TAREAS PROPUESTAS

### **Fase 1: Validación de Mediciones Sospechosas** (Prioridad: Media)

#### Tarea 1.1: Crear tabla de historial de mediciones

Usar `app.body_measurements` como fuente única (ver `backend/migrations/20260201_body_measurements_complete_system.sql`).

#### Tarea 1.2: Función de validación de cintura sospechosa

```javascript
/**
 * Valida si un cambio de cintura es sospechoso
 * @param {number} userId
 * @param {number} newWaist_cm
 * @param {number} newWeight_kg
 * @returns {Object} { isSuspicious, reason, shouldRepeat }
 */
export async function validateWaistMeasurement(
  userId,
  newWaist_cm,
  newWeight_kg,
) {
  // Obtener medición previa de hace 7 días o menos
  const previousMeasurement = await pool.query(
    `SELECT weight_kg, waist_cm, measurement_date
     FROM app.body_measurements
     WHERE user_id = $1 
     AND measurement_date >= CURRENT_DATE - INTERVAL '7 days'
     ORDER BY measurement_date DESC
     LIMIT 1`,
    [userId],
  );

  if (previousMeasurement.rows.length === 0) {
    return { isSuspicious: false, reason: null, shouldRepeat: false };
  }

  const prev = previousMeasurement.rows[0];
  const waistChange = Math.abs(newWaist_cm - prev.cintura_cm);
  const weightChange = Math.abs(newWeight_kg - prev.peso_kg);

  // Regla: cambio > 2.5 cm en 7 días sin cambio de peso coherente
  if (waistChange > 2.5) {
    // Peso coherente: al menos 0.5 kg por cada 2.5 cm de cintura
    const expectedWeightChange = (waistChange / 2.5) * 0.5;

    if (weightChange < expectedWeightChange * 0.5) {
      return {
        isSuspicious: true,
        reason: `Cambio de cintura de ${waistChange.toFixed(1)} cm en ${Math.round((new Date() - new Date(prev.measurement_date)) / (1000 * 60 * 60 * 24))} días sin cambio proporcional de peso (${weightChange.toFixed(1)} kg)`,
        shouldRepeat: true,
        previousValue: prev.cintura_cm,
        newValue: newWaist_cm,
      };
    }
  }

  return { isSuspicious: false, reason: null, shouldRepeat: false };
}
```

---

### **Fase 2: Sistema de Calibración y Reevaluación** (Prioridad: Alta)

#### Tarea 2.1: Crear tabla de calibraciones

```sql
CREATE TABLE IF NOT EXISTS app.nutrition_calibrations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,

  -- Periodo de evaluación
  calibration_date DATE DEFAULT CURRENT_DATE,
  evaluation_period_days INTEGER DEFAULT 14,

  -- Datos de entrada
  peso_inicial_kg DECIMAL(5,2) NOT NULL,
  peso_final_kg DECIMAL(5,2) NOT NULL,
  peso_medio_7dias_kg DECIMAL(5,2) NOT NULL,

  -- Cambio observado
  peso_change_pct DECIMAL(5,3), -- % de cambio de peso
  peso_change_kg DECIMAL(5,2),

  -- GCT actual y objetivo anterior
  current_kcal_objetivo INTEGER NOT NULL,
  previous_tdee INTEGER NOT NULL,

  -- Ajuste calculado
  adjustment_kcal INTEGER, -- +/- kcal recomendadas
  adjustment_reason TEXT,

  -- Estado
  applied BOOLEAN DEFAULT FALSE,
  new_kcal_objetivo INTEGER,

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_nutrition_calibrations_user ON app.nutrition_calibrations(user_id, calibration_date DESC);
```

#### Tarea 2.2: Función de cálculo de media de peso 7 días

```javascript
/**
 * Calcula la media de peso de los últimos 7 días
 * @param {number} userId
 * @returns {number|null} Media de peso en kg o null si no hay suficientes datos
 */
export async function calculateWeightAverage7Days(userId) {
  const result = await pool.query(
    `SELECT AVG(peso_kg) as media_peso
     FROM app.body_measurements
     WHERE user_id = $1
     AND measurement_date >= CURRENT_DATE - INTERVAL '7 days'
     HAVING COUNT(*) >= 5`, // Requiere al menos 5 mediciones en 7 días
    [userId],
  );

  if (result.rows.length === 0) {
    return null;
  }

  return parseFloat(result.rows[0].media_peso);
}
```

#### Tarea 2.3: Función de calibración según fase

```javascript
/**
 * Evalúa si se requiere ajuste calórico según reglas anti-ruido
 * @param {number} userId
 * @param {string} objetivo - 'cut' | 'mant' | 'bulk'
 * @returns {Object} Resultado de calibración
 */
export async function evaluateCalibration(userId, objetivo) {
  // 1. Obtener peso medio actual (últimos 7 días)
  const currentWeightAvg = await calculateWeightAverage7Days(userId);

  if (!currentWeightAvg) {
    return {
      canCalibrate: false,
      reason:
        "Insuficientes mediciones de peso (requiere al menos 5 en 7 días)",
    };
  }

  // 2. Obtener peso medio hace 14 días
  const previousWeightResult = await pool.query(
    `SELECT AVG(peso_kg) as media_peso
     FROM app.body_measurements
     WHERE user_id = $1
     AND measurement_date BETWEEN CURRENT_DATE - INTERVAL '21 days' AND CURRENT_DATE - INTERVAL '14 days'
     HAVING COUNT(*) >= 5`,
    [userId],
  );

  if (previousWeightResult.rows.length === 0) {
    return {
      canCalibrate: false,
      reason:
        "Insuficientes datos históricos (requiere 2 semanas de mediciones previas)",
    };
  }

  const previousWeightAvg = parseFloat(previousWeightResult.rows[0].media_peso);

  // 3. Calcular cambio de peso
  const weightChange_kg = currentWeightAvg - previousWeightAvg;
  const weightChange_pct = (weightChange_kg / previousWeightAvg) * 100;
  const weeklyChange_pct = weightChange_pct / 2; // Cambio por semana

  // 4. Obtener GCT actual
  const nutritionProfile = await pool.query(
    `SELECT kcal_objetivo, tdee, objetivo
     FROM app.nutrition_profiles
     WHERE user_id = $1`,
    [userId],
  );

  if (nutritionProfile.rows.length === 0) {
    return { canCalibrate: false, reason: "No existe perfil nutricional" };
  }

  const { kcal_objetivo, tdee } = nutritionProfile.rows[0];

  // 5. Aplicar reglas de ajuste según fase
  let adjustmentKcal = 0;
  let reason = "";
  let shouldAdjust = false;

  switch (objetivo) {
    case "mant": // Normocalórica
      // Si el peso medio cambia > 0.5% en 14 días, ajustar +/- 150 kcal/día
      if (Math.abs(weightChange_pct) > 0.5) {
        adjustmentKcal = weightChange_pct > 0 ? -150 : 150;
        shouldAdjust = true;
        reason = `Peso cambió ${weightChange_pct.toFixed(2)}% en 14 días (>0.5%). Ajuste: ${adjustmentKcal > 0 ? "+" : ""}${adjustmentKcal} kcal`;
      } else {
        reason = `Peso estable (${weightChange_pct.toFixed(2)}% en 14 días). No requiere ajuste.`;
      }
      break;

    case "cut": // Déficit
      // Pérdida < 0.3%/semana durante 2 semanas: bajar 150-250 kcal
      if (Math.abs(weeklyChange_pct) < 0.3) {
        adjustmentKcal = -200; // Promedio entre -150 y -250
        shouldAdjust = true;
        reason = `Pérdida de peso lenta (${weeklyChange_pct.toFixed(2)}%/semana < 0.3%). Reducir ${Math.abs(adjustmentKcal)} kcal`;
      }
      // Pérdida > 1%/semana: subir 150-250 kcal o diet break
      else if (Math.abs(weeklyChange_pct) > 1.0) {
        adjustmentKcal = 200;
        shouldAdjust = true;
        reason = `Pérdida de peso rápida (${weeklyChange_pct.toFixed(2)}%/semana > 1%). Aumentar ${adjustmentKcal} kcal (considerar diet break)`;
      } else {
        reason = `Ritmo de pérdida adecuado (${weeklyChange_pct.toFixed(2)}%/semana). No requiere ajuste.`;
      }
      break;

    case "bulk": // Superávit
      // Ganancia < 0.15%/semana: subir 150 kcal
      if (weeklyChange_pct < 0.15) {
        adjustmentKcal = 150;
        shouldAdjust = true;
        reason = `Ganancia de peso lenta (${weeklyChange_pct.toFixed(2)}%/semana < 0.15%). Aumentar ${adjustmentKcal} kcal`;
      }
      // Ganancia > 0.35%/semana y cintura sube rápido: bajar 150-250 kcal
      else if (weeklyChange_pct > 0.35) {
        // TODO: Verificar también cintura
        adjustmentKcal = -200;
        shouldAdjust = true;
        reason = `Ganancia de peso rápida (${weeklyChange_pct.toFixed(2)}%/semana > 0.35%). Reducir ${Math.abs(adjustmentKcal)} kcal`;
      } else {
        reason = `Ritmo de ganancia adecuado (${weeklyChange_pct.toFixed(2)}%/semana). No requiere ajuste.`;
      }
      break;
  }

  // 6. Retornar resultado
  return {
    canCalibrate: true,
    shouldAdjust,
    currentWeightAvg,
    previousWeightAvg,
    weightChange_kg,
    weightChange_pct,
    weeklyChange_pct,
    currentKcal: kcal_objetivo,
    currentTDEE: tdee,
    adjustmentKcal,
    newKcalObjetivo: shouldAdjust
      ? kcal_objetivo + adjustmentKcal
      : kcal_objetivo,
    reason,
    evaluationDate: new Date().toISOString(),
  };
}
```

#### Tarea 2.4: Endpoint para ejecutar calibración

```javascript
// POST /api/nutrition/calibrate
router.post("/calibrate", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Obtener perfil nutricional
    const profileResult = await pool.query(
      `SELECT objetivo FROM app.nutrition_profiles WHERE user_id = $1`,
      [userId],
    );

    if (profileResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: "No existe perfil nutricional",
      });
    }

    const { objetivo } = profileResult.rows[0];

    // Evaluar calibración
    const calibration = await evaluateCalibration(userId, objetivo);

    if (!calibration.canCalibrate) {
      return res.status(400).json({
        success: false,
        error: calibration.reason,
      });
    }

    // Guardar registro de calibración
    const calibrationId = await pool.query(
      `INSERT INTO app.nutrition_calibrations (
        user_id, peso_inicial_kg, peso_final_kg, peso_medio_7dias_kg,
        peso_change_pct, peso_change_kg, current_kcal_objetivo,
        previous_tdee, adjustment_kcal, adjustment_reason,
        applied, new_kcal_objetivo
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id`,
      [
        userId,
        calibration.previousWeightAvg,
        calibration.currentWeightAvg,
        calibration.currentWeightAvg,
        calibration.weightChange_pct,
        calibration.weightChange_kg,
        calibration.currentKcal,
        calibration.currentTDEE,
        calibration.adjustmentKcal,
        calibration.reason,
        calibration.shouldAdjust,
        calibration.newKcalObjetivo,
      ],
    );

    // Si se debe ajustar, actualizar perfil nutricional
    if (calibration.shouldAdjust) {
      await pool.query(
        `UPDATE app.nutrition_profiles
         SET kcal_objetivo = $1, updated_at = NOW()
         WHERE user_id = $2`,
        [calibration.newKcalObjetivo, userId],
      );
    }

    res.json({
      success: true,
      calibration: {
        ...calibration,
        calibrationId: calibrationId.rows[0].id,
      },
    });
  } catch (error) {
    console.error("Error en calibración:", error);
    res
      .status(500)
      .json({ success: false, error: "Error ejecutando calibración" });
  }
});
```

---

### **Fase 3: Automatización de Calibración** (Prioridad: Media)

#### Tarea 3.1: Cron job para calibración automática cada 14 días

```javascript
// backend/jobs/nutritionCalibrationCron.js
import cron from "node-cron";
import pool from "../db.js";
import { evaluateCalibration } from "../services/nutritionCalibrator.js";

/**
 * Cron job que ejecuta calibración automática cada 14 días
 * Se ejecuta diariamente a las 6:00 AM y verifica usuarios que requieren calibración
 */
export function startNutritionCalibrationCron() {
  // Ejecutar todos los días a las 6:00 AM
  cron.schedule("0 6 * * *", async () => {
    console.log("[CRON] Iniciando calibración nutricional automática...");

    try {
      // Buscar usuarios que requieren calibración (última calibración hace >= 14 días)
      const usersToCalibrate = await pool.query(
        `SELECT DISTINCT np.user_id, np.objetivo
         FROM app.nutrition_profiles np
         LEFT JOIN app.nutrition_calibrations nc ON np.user_id = nc.user_id
         WHERE (
           nc.calibration_date IS NULL
           OR nc.calibration_date <= CURRENT_DATE - INTERVAL '14 days'
         )
         AND np.auto_calibrate = TRUE`,
      );

      console.log(
        `[CRON] Usuarios a calibrar: ${usersToCalibrate.rows.length}`,
      );

      for (const user of usersToCalibrate.rows) {
        try {
          const calibration = await evaluateCalibration(
            user.user_id,
            user.objetivo,
          );

          if (calibration.canCalibrate) {
            // Guardar calibración
            await pool.query(
              `INSERT INTO app.nutrition_calibrations (
                user_id, peso_inicial_kg, peso_final_kg, peso_medio_7dias_kg,
                peso_change_pct, peso_change_kg, current_kcal_objetivo,
                previous_tdee, adjustment_kcal, adjustment_reason,
                applied, new_kcal_objetivo
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
              [
                user.user_id,
                calibration.previousWeightAvg,
                calibration.currentWeightAvg,
                calibration.currentWeightAvg,
                calibration.weightChange_pct,
                calibration.weightChange_kg,
                calibration.currentKcal,
                calibration.currentTDEE,
                calibration.adjustmentKcal,
                calibration.reason,
                calibration.shouldAdjust,
                calibration.newKcalObjetivo,
              ],
            );

            // Aplicar ajuste si es necesario
            if (calibration.shouldAdjust) {
              await pool.query(
                `UPDATE app.nutrition_profiles
                 SET kcal_objetivo = $1, updated_at = NOW()
                 WHERE user_id = $2`,
                [calibration.newKcalObjetivo, user.user_id],
              );

              console.log(
                `[CRON] Usuario ${user.user_id}: Ajuste aplicado (${calibration.adjustmentKcal} kcal)`,
              );
            }
          }
        } catch (userError) {
          console.error(
            `[CRON] Error calibrando usuario ${user.user_id}:`,
            userError,
          );
        }
      }

      console.log("[CRON] Calibración nutricional completada");
    } catch (error) {
      console.error("[CRON] Error en calibración automática:", error);
    }
  });

  console.log(
    "[CRON] Job de calibración nutricional iniciado (diario a las 6:00 AM)",
  );
}
```

---

## 📊 BENEFICIOS ESPERADOS

1. **Mayor precisión:** Ajuste dinámico del GCT basado en datos reales del usuario
2. **Prevención de errores:** Validación de mediciones sospechosas evita ajustes incorrectos
3. **Adherencia:** Ajustes graduales (150-250 kcal) son más sostenibles
4. **Automatización:** Calibración cada 14 días sin intervención manual
5. **Transparencia:** Usuario ve el razonamiento detrás de cada ajuste

---

## ⏱️ ESTIMACIÓN DE ESFUERZO

| Fase      | Tareas                | Esfuerzo estimado | Complejidad |
| --------- | --------------------- | ----------------- | ----------- |
| Fase 1    | Validación mediciones | 4-6 horas         | Media       |
| Fase 2    | Sistema calibración   | 8-12 horas        | Alta        |
| Fase 3    | Automatización        | 3-4 horas         | Media       |
| **TOTAL** | -                     | **15-22 horas**   | -           |

---

## 🚀 ORDEN DE IMPLEMENTACIÓN RECOMENDADO

1. ✅ **Primero:** Fase 2.1 y 2.2 (tablas y funciones básicas)
2. ✅ **Segundo:** Fase 2.3 (lógica de calibración)
3. ✅ **Tercero:** Fase 2.4 (endpoint API)
4. ⏳ **Cuarto:** Fase 1 (validación mediciones - opcional pero recomendado)
5. ⏳ **Quinto:** Fase 3 (automatización - puede ser manual inicialmente)

---

## 📝 NOTAS FINALES

- El sistema actual de TMB/GCT es correcto y funcional
- Estas mejoras son **incrementales** y no afectan el cálculo base
- Se recomienda implementar Fase 2 como prioridad
- La validación de mediciones sospechosas es opcional pero añade robustez
- La automatización (Fase 3) puede implementarse después del MVP manual

---

**Elaborado por:** Claude (Asistente IA)  
**Fecha:** 2026-02-02  
**Estado:** Propuesta para aprobación
