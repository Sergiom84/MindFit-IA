/**
 * Sub-router de nutrición V2: REGISTRO DIARIO + REVISIÓN + AJUSTES (V2)
 * Extraído de routes/nutritionV2.js para reducir el monolito.
 * Se monta bajo la misma base /api/nutrition-v2.
 */

import express from 'express';
import { authenticateToken } from '../../middleware/auth.js';
import {
  getDailyNutritionLogV2,
  isNutritionDayRegistered,
  upsertDailyNutritionLogV2
} from '../../services/nutritionDailyLogV2.js';
import { getNutritionReview } from '../../services/nutritionReviewService.js';
import {
  applyNutritionKcalAdjustment,
  undoLastNutritionKcalAdjustment
} from '../../services/nutritionAdjustmentService.js';

const router = express.Router();

// ================================================
// REGISTRO DIARIO (V2) — kcal + day_type + noise_flags
// ================================================

router.get('/daily/:date', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { date } = req.params;

    const result = await getDailyNutritionLogV2(userId, date);

    res.json({
      success: true,
      exists: result.exists,
      daily: result.daily,
      registered: isNutritionDayRegistered(result.daily)
    });
  } catch (error) {
    const msg = error?.message || 'Error al obtener registro diario';
    if (msg.includes('Fecha inválida')) {
      return res.status(400).json({ success: false, error: msg });
    }
    console.error('Error obteniendo registro diario v2:', error);
    res.status(500).json({ success: false, error: 'Error al obtener registro diario' });
  }
});

router.post('/daily', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const saved = await upsertDailyNutritionLogV2(userId, req.body || {});

    res.json({
      success: true,
      daily: saved,
      registered: isNutritionDayRegistered(saved)
    });
  } catch (error) {
    const msg = error?.message || 'Error al guardar registro diario';
    if (
      msg.includes('Fecha inválida') ||
      msg.includes('day_type inválido') ||
      msg.includes('no puede ser negativo')
    ) {
      return res.status(400).json({ success: false, error: msg });
    }
    console.error('Error guardando registro diario v2:', error);
    res.status(500).json({ success: false, error: 'Error al guardar registro diario' });
  }
});

// ================================================
// REVISIÓN (V2) — semanal (feedback) + quincenal (recomendación)
// ================================================

router.get('/review', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const today = req.query.today || null; // opcional: YYYY-MM-DD (tests)

    const review = await getNutritionReview(userId, today ? { today } : {});
    if (!review.success) {
      return res.status(404).json(review);
    }

    res.json(review);
  } catch (error) {
    const msg = error?.message || 'Error al obtener revisión nutricional';
    if (msg.includes('today inválido')) {
      return res.status(400).json({ success: false, error: msg });
    }
    console.error('Error obteniendo revisión nutricional:', error);
    res.status(500).json({ success: false, error: 'Error al obtener revisión nutricional' });
  }
});

// ================================================
// AJUSTES (V2) — aplicar / deshacer
// ================================================

router.post('/adjustments/apply', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await applyNutritionKcalAdjustment(userId, req.body || {});
    res.json(result);
  } catch (error) {
    const msg = error?.message || 'Error al aplicar ajuste';
    if (
      msg.includes('mode inválido') ||
      msg.includes('source inválido') ||
      msg.includes('delta_kcal inválido') ||
      msg.includes('Perfil nutricional no encontrado')
    ) {
      return res.status(400).json({ success: false, error: msg });
    }
    if (msg.includes('No tienes un plan nutricional activo')) {
      return res.status(404).json({ success: false, error: msg });
    }
    console.error('Error aplicando ajuste nutricional:', error);
    res.status(500).json({ success: false, error: 'Error al aplicar ajuste nutricional' });
  }
});

router.post('/adjustments/undo-last', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await undoLastNutritionKcalAdjustment(userId, {});
    res.json(result);
  } catch (error) {
    const msg = error?.message || 'Error al deshacer ajuste';
    if (
      msg.includes('No hay ajustes recientes') ||
      msg.includes('Ventana de deshacer expirada')
    ) {
      return res.status(400).json({ success: false, error: msg });
    }
    console.error('Error deshaciendo ajuste nutricional:', error);
    res.status(500).json({ success: false, error: 'Error al deshacer ajuste nutricional' });
  }
});

export default router;
