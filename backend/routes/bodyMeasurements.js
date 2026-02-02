/**
 * BODY MEASUREMENTS ROUTES
 * Endpoints para gestionar mediciones corporales con validación automática
 *
 * VALOR PARA EL USUARIO:
 * - Sistema inteligente que detecta mediciones incorrectas
 * - Alertas proactivas de cambios sospechosos
 * - Seguimiento completo de progreso corporal
 * - Protección contra decisiones basadas en datos erróneos
 */

import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { pool } from '../db.js';
import { validateMeasurement } from '../services/measurementValidator.js';
import { detectProgressionIssues, logProgressionAlert } from '../services/icgIpgDetector.js';

const router = express.Router();

// ============================================================================
// POST /api/body-measurements
// Registrar nueva medición corporal con validación automática
// ============================================================================
router.post('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      date,
      weight,
      waist,
      biceps,
      chest,
      calf,
      skinfold_abdominal,
      conditions = {},
      force_save = false  // Usuario puede forzar guardar pese a advertencias
    } = req.body;

    // Validaciones básicas
    if (!weight || !waist) {
      return res.status(400).json({
        success: false,
        error: 'Peso y cintura son campos obligatorios'
      });
    }

    // Preparar datos de medición
    const measurement = {
      date: date || new Date().toISOString().split('T')[0],
      weight,
      waist,
      biceps,
      chest,
      calf,
      skinfold_abdominal,
      conditions
    };

    // ✨ VALIDACIÓN AUTOMÁTICA - VALOR CRÍTICO PARA EL USUARIO
    const validation = await validateMeasurement(userId, measurement);

    // Si tiene advertencias y el usuario no forzó guardar, retornar para confirmación
    if (!force_save && validation.requires_confirmation) {
      return res.status(200).json({
        success: false,
        requires_confirmation: true,
        warnings: validation.warnings,
        severity_summary: validation.severity_summary,
        recommendation: validation.recommendation,
        message: 'Se detectaron mediciones sospechosas. Por favor, revisa los datos antes de continuar.',
        // El frontend mostrará un modal de confirmación con las advertencias
        measurement: measurement
      });
    }

    // Guardar medición en base de datos
    const result = await pool.query(
      `INSERT INTO app.body_measurements (
        user_id, measurement_date,
        time_of_day, is_fasted, post_workout, notes,
        weight_kg, waist_cm,
        biceps_cm, chest_cm, calf_cm,
        skinfold_abdominal_mm,
        is_validated, validation_warnings,
        requires_confirmation, user_confirmed, confirmed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      ON CONFLICT (user_id, measurement_date)
      DO UPDATE SET
        time_of_day = EXCLUDED.time_of_day,
        is_fasted = EXCLUDED.is_fasted,
        post_workout = EXCLUDED.post_workout,
        notes = EXCLUDED.notes,
        weight_kg = EXCLUDED.weight_kg,
        waist_cm = EXCLUDED.waist_cm,
        biceps_cm = EXCLUDED.biceps_cm,
        chest_cm = EXCLUDED.chest_cm,
        calf_cm = EXCLUDED.calf_cm,
        skinfold_abdominal_mm = EXCLUDED.skinfold_abdominal_mm,
        is_validated = EXCLUDED.is_validated,
        validation_warnings = EXCLUDED.validation_warnings,
        requires_confirmation = EXCLUDED.requires_confirmation,
        user_confirmed = EXCLUDED.user_confirmed,
        confirmed_at = EXCLUDED.confirmed_at,
        updated_at = NOW()
      RETURNING *`,
      [
        userId,
        measurement.date,
        conditions.time_of_day || 'morning',
        conditions.fasted !== false,  // Default true
        conditions.post_workout || false,
        conditions.notes || null,
        weight,
        waist,
        biceps || null,
        chest || null,
        calf || null,
        skinfold_abdominal || null,
        !validation.requires_confirmation || force_save,  // Validado si no requiere confirmación o fue forzado
        JSON.stringify(validation.warnings),
        validation.requires_confirmation,
        force_save,  // Si forzó guardar, marca como confirmado
        force_save ? new Date() : null
      ]
    );

    // Sincronizar con perfil si nutrición es la fuente de verdad
    const syncPref = await pool.query(
      'SELECT nutrition_overrides_profile FROM app.nutrition_profiles WHERE user_id = $1',
      [userId]
    );
    const nutritionOverridesProfile = syncPref.rows[0]?.nutrition_overrides_profile || false;

    if (nutritionOverridesProfile && (!validation.requires_confirmation || force_save)) {
      await pool.query(
        `UPDATE app.users
         SET peso = $2,
             cintura = COALESCE($3, cintura),
             pecho = COALESCE($4, pecho),
             brazos = COALESCE($5, brazos),
             gemelo = COALESCE($6, gemelo),
             pliegue_abdominal = COALESCE($7, pliegue_abdominal),
             updated_at = NOW()
         WHERE id = $1`,
        [
          userId,
          weight,
          waist || null,
          chest || null,
          biceps || null,
          calf || null,
          skinfold_abdominal || null
        ]
      );

      // Mantener sincronía también en user_profiles (si existe la fila)
      await pool.query(
        `UPDATE app.user_profiles
         SET gemelo = COALESCE($2, gemelo),
             pliegue_abdominal = COALESCE($3, pliegue_abdominal),
             updated_at = NOW()
         WHERE user_id = $1`,
        [
          userId,
          calf || null,
          skinfold_abdominal || null
        ]
      );
    }

    // ✨ DETECCIÓN AUTOMÁTICA DE ICG/IPG - VALOR AGREGADO
    // Calcular automáticamente si necesita reevaluar fase nutricional
    const phaseEval = await pool.query(
      'SELECT * FROM app.should_reevaluate_phase($1)',
      [userId]
    );

    const phaseStatus = phaseEval.rows[0] || {};

    // 🚨 DETECTOR AVANZADO DE PROGRESIÓN (ICG/IPG con recomendaciones)
    const progressionAnalysis = await detectProgressionIssues(userId);

    // Si hay alertas de alta prioridad, registrarlas en el bridge
    if (progressionAnalysis.has_data && progressionAnalysis.analysis?.requires_reevaluation) {
      for (const alert of progressionAnalysis.analysis.alerts) {
        if (alert.severity === 'high' || alert.severity === 'medium') {
          await logProgressionAlert(userId, alert, progressionAnalysis.analysis);
        }
      }
    }

    res.json({
      success: true,
      measurement: result.rows[0],
      validation: {
        warnings: validation.warnings,
        severity_summary: validation.severity_summary
      },
      phase_evaluation: {
        should_reevaluate: phaseStatus.should_reevaluate || false,
        reason: phaseStatus.reason || null,
        weight_trend: phaseStatus.weight_trend || null,
        waist_trend: phaseStatus.waist_trend || null,
        icg_status: phaseStatus.icg_status || null
      },
      progression_analysis: progressionAnalysis.has_data ? {
        requires_reevaluation: progressionAnalysis.analysis.requires_reevaluation,
        alerts: progressionAnalysis.analysis.alerts,
        recommendations: progressionAnalysis.analysis.recommendations,
        summary: progressionAnalysis.analysis.summary,
        indicators: progressionAnalysis.analysis.indicators
      } : null,
      message: force_save
        ? 'Medición guardada (advertencias ignoradas por confirmación del usuario)'
        : validation.warnings.length === 0
        ? 'Medición registrada correctamente'
        : 'Medición guardada con advertencias menores'
    });

  } catch (error) {
    console.error('Error registrando medición:', error);
    res.status(500).json({
      success: false,
      error: 'Error al registrar medición'
    });
  }
});

// ============================================================================
// GET /api/body-measurements/history
// Obtener historial de mediciones del usuario
// ============================================================================
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 30, validated_only = false } = req.query;

    let query = `
      SELECT
        id, measurement_date, weight_kg, waist_cm,
        biceps_cm, chest_cm, calf_cm, skinfold_abdominal_mm,
        is_validated, validation_warnings, requires_confirmation,
        time_of_day, is_fasted, post_workout, notes,
        created_at
      FROM app.body_measurements
      WHERE user_id = $1
    `;

    if (validated_only === 'true') {
      query += ' AND is_validated = TRUE';
    }

    query += ' ORDER BY measurement_date DESC LIMIT $2';

    const result = await pool.query(query, [userId, limit]);

    res.json({
      success: true,
      measurements: result.rows,
      count: result.rows.length
    });

  } catch (error) {
    console.error('Error obteniendo historial:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener historial de mediciones'
    });
  }
});

// ============================================================================
// GET /api/body-measurements/changes
// Obtener cambios calculados entre mediciones (con ICG/IPG)
// ============================================================================
router.get('/changes', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 10 } = req.query;

    const result = await pool.query(
      `SELECT * FROM app.v_measurement_changes
       WHERE user_id = $1
       ORDER BY measurement_date DESC
       LIMIT $2`,
      [userId, limit]
    );

    res.json({
      success: true,
      changes: result.rows,
      count: result.rows.length
    });

  } catch (error) {
    console.error('Error calculando cambios:', error);
    res.status(500).json({
      success: false,
      error: 'Error al calcular cambios'
    });
  }
});

// ============================================================================
// GET /api/body-measurements/trends
// Obtener tendencias calculadas (media móvil 7 y 14 días)
// ============================================================================
router.get('/trends', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Media móvil 7 días
    const week = await pool.query(
      'SELECT * FROM app.calculate_weight_trend($1, 7)',
      [userId]
    );

    // Media móvil 14 días
    const twoWeeks = await pool.query(
      'SELECT * FROM app.calculate_weight_trend($1, 14)',
      [userId]
    );

    // Evaluación de fase
    const phaseEval = await pool.query(
      'SELECT * FROM app.should_reevaluate_phase($1)',
      [userId]
    );

    res.json({
      success: true,
      trends: {
        week_7: week.rows[0] || null,
        week_14: twoWeeks.rows[0] || null
      },
      phase_evaluation: phaseEval.rows[0] || null
    });

  } catch (error) {
    console.error('Error calculando tendencias:', error);
    res.status(500).json({
      success: false,
      error: 'Error al calcular tendencias'
    });
  }
});

// ============================================================================
// GET /api/body-measurements/latest
// Obtener última medición validada
// ============================================================================
router.get('/latest', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      'SELECT * FROM app.get_last_validated_measurement($1)',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.json({
        success: true,
        has_measurements: false,
        message: 'No hay mediciones registradas'
      });
    }

    res.json({
      success: true,
      has_measurements: true,
      measurement: result.rows[0]
    });

  } catch (error) {
    console.error('Error obteniendo última medición:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener última medición'
    });
  }
});

// ============================================================================
// GET /api/body-measurements/unconfirmed
// Obtener mediciones que requieren confirmación del usuario
// ============================================================================
router.get('/unconfirmed', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT * FROM app.body_measurements
       WHERE user_id = $1
         AND requires_confirmation = TRUE
         AND user_confirmed = FALSE
       ORDER BY measurement_date DESC`,
      [userId]
    );

    res.json({
      success: true,
      unconfirmed: result.rows,
      count: result.rows.length
    });

  } catch (error) {
    console.error('Error obteniendo mediciones sin confirmar:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener mediciones sin confirmar'
    });
  }
});

// ============================================================================
// PUT /api/body-measurements/:id/confirm
// Confirmar una medición que tenía advertencias
// ============================================================================
router.put('/:id/confirm', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE app.body_measurements
       SET user_confirmed = TRUE,
           confirmed_at = NOW(),
           is_validated = TRUE,
           updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Medición no encontrada'
      });
    }

    res.json({
      success: true,
      measurement: result.rows[0],
      message: 'Medición confirmada correctamente'
    });

  } catch (error) {
    console.error('Error confirmando medición:', error);
    res.status(500).json({
      success: false,
      error: 'Error al confirmar medición'
    });
  }
});

// ============================================================================
// DELETE /api/body-measurements/:id
// Eliminar una medición (solo si aún no está confirmada)
// ============================================================================
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const result = await pool.query(
      `DELETE FROM app.body_measurements
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Medición no encontrada'
      });
    }

    res.json({
      success: true,
      deleted_measurement: result.rows[0],
      message: 'Medición eliminada correctamente'
    });

  } catch (error) {
    console.error('Error eliminando medición:', error);
    res.status(500).json({
      success: false,
      error: 'Error al eliminar medición'
    });
  }
});

// ============================================================================
// GET /api/body-measurements/progression-check
// Verificar estado de progresión (ICG/IPG) en cualquier momento
// ============================================================================
router.get('/progression-check', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const analysis = await detectProgressionIssues(userId);

    if (!analysis.has_data) {
      return res.json({
        success: true,
        has_data: false,
        message: analysis.message,
        recommendation: analysis.recommendation
      });
    }

    res.json({
      success: true,
      has_data: true,
      ...analysis.analysis
    });

  } catch (error) {
    console.error('Error verificando progresión:', error);
    res.status(500).json({
      success: false,
      error: 'Error al verificar progresión'
    });
  }
});

// ============================================================================
// GET /api/body-measurements/progress-summary
// Resumen de progreso para dashboard (últimos 30 días)
// ============================================================================
router.get('/progress-summary', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Primera y última medición del período
    const result = await pool.query(
      `WITH recent_measurements AS (
        SELECT * FROM app.body_measurements
        WHERE user_id = $1
          AND measurement_date >= CURRENT_DATE - 30
          AND is_validated = TRUE
        ORDER BY measurement_date
      )
      SELECT
        (SELECT ROW_TO_JSON(first.*) FROM (SELECT * FROM recent_measurements LIMIT 1) first) as first_measurement,
        (SELECT ROW_TO_JSON(last.*) FROM (SELECT * FROM recent_measurements ORDER BY measurement_date DESC LIMIT 1) last) as last_measurement,
        COUNT(*) as total_measurements
      FROM recent_measurements`,
      [userId]
    );

    const data = result.rows[0];

    if (!data.first_measurement || !data.last_measurement) {
      return res.json({
        success: true,
        has_data: false,
        message: 'No hay suficientes mediciones en los últimos 30 días'
      });
    }

    const first = data.first_measurement;
    const last = data.last_measurement;

    res.json({
      success: true,
      has_data: true,
      summary: {
        weight_change_kg: (last.weight_kg - first.weight_kg).toFixed(2),
        waist_change_cm: (last.waist_cm - first.waist_cm).toFixed(1),
        biceps_change_cm: last.biceps_cm && first.biceps_cm
          ? (last.biceps_cm - first.biceps_cm).toFixed(1)
          : null,
        chest_change_cm: last.chest_cm && first.chest_cm
          ? (last.chest_cm - first.chest_cm).toFixed(1)
          : null,
        total_measurements: parseInt(data.total_measurements),
        days_span: Math.floor(
          (new Date(last.measurement_date) - new Date(first.measurement_date)) / (1000 * 60 * 60 * 24)
        ),
        first_date: first.measurement_date,
        last_date: last.measurement_date
      }
    });

  } catch (error) {
    console.error('Error generando resumen de progreso:', error);
    res.status(500).json({
      success: false,
      error: 'Error al generar resumen de progreso'
    });
  }
});

export default router;
