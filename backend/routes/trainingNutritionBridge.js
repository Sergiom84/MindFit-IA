import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { pool } from '../db.js';
import {
  calculateBMR,
  calculateTDEE,
  adjustCaloriesForGoal,
  calculateMacros
} from '../services/nutritionCalculator.js';

const router = express.Router();

function carbDeltaFromCLS(clsScore = 50) {
  if (clsScore >= 70) return { high: 1.20, low: 0.80 };
  if (clsScore >= 40) return { high: 1.15, low: 0.85 };
  return { high: 1.10, low: 0.90 };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function redistributeMacros(base, weightKg, factorCarbs) {
  const protein_g = base.protein_g;
  const baseFat_g = base.fat_g;
  const baseCarbs_g = base.carbs_g;

  const baseKcal = protein_g * 4 + baseFat_g * 9 + baseCarbs_g * 4;
  const targetCarbs = Math.round(baseCarbs_g * factorCarbs);

  const proteinKcal = protein_g * 4;
  const fatMin = Math.max(Math.round(0.6 * weightKg), Math.round((baseKcal * 0.20) / 9));

  let carbKcal = targetCarbs * 4;
  let remainingKcal = baseKcal - proteinKcal - carbKcal;

  let fat_g = Math.max(fatMin, Math.round(remainingKcal / 9));

  // Si las calorías se van a negativo, recortar carbohidratos hasta respetar mínimos
  if (remainingKcal < fatMin * 9) {
    const maxCarbKcal = baseKcal - proteinKcal - fatMin * 9;
    const maxCarbs = Math.max(0, Math.floor(maxCarbKcal / 4));
    carbKcal = maxCarbs * 4;
    fat_g = fatMin;
  }

  const carbs_g = Math.max(0, Math.round(carbKcal / 4));
  const kcal = protein_g * 4 + fat_g * 9 + carbs_g * 4;

  return { protein_g, fat_g, carbs_g, kcal };
}

function buildPerDayMacros(baseMacros, weightKg, clsScore) {
  const deltas = carbDeltaFromCLS(clsScore);
  return {
    D0: redistributeMacros(baseMacros, weightKg, deltas.low), // descanso
    D1: { ...baseMacros, kcal: baseMacros.protein_g * 4 + baseMacros.fat_g * 9 + baseMacros.carbs_g * 4 }, // normal
    D2: redistributeMacros(baseMacros, weightKg, deltas.high) // día duro
  };
}

router.post('/training-summary', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      methodology,
      calendar = [],
      weekly_cls = null,
      performance = 'mantiene',
      flags = {},
      override_kcal,
      objective_phase // cut | mant | bulk
    } = req.body || {};

    // Perfil del usuario
    const profileResult = await pool.query('SELECT * FROM app.nutrition_profiles WHERE user_id = $1', [userId]);
    if (profileResult.rows.length === 0) {
      return res.status(404).json({ error: 'Perfil nutricional no encontrado' });
    }
    const profile = profileResult.rows[0];

    const bmr = calculateBMR(profile);
    const tdee = calculateTDEE(bmr, profile.actividad, profile.training_days || 4, profile.steps_per_day || null);
    const objetivo = objective_phase || profile.objetivo || 'mant';
    const kcalObjetivo = override_kcal || adjustCaloriesForGoal(tdee, objetivo);
    const macrosBase = calculateMacros(
      kcalObjetivo,
      profile.peso_kg,
      profile.training_type || 'hipertrofia',
      objetivo,
      profile.metabolic_type,
      profile.metabolic_confidence,
      profile.level
    );

    const perDay = buildPerDayMacros(macrosBase, profile.peso_kg, weekly_cls);

    // Mapear calendario a macros por día
    const calendarMacros = calendar.map((d) => {
      const dayType = d.type || 'normal'; // rest|normal|hard
      const mapType = dayType === 'rest' ? 'D0' : dayType === 'hard' ? 'D2' : 'D1';
      return {
        day: d.day,
        type: dayType,
        cls: d.cls,
        macros: perDay[mapType]
      };
    });

    // Flags coordinados
    const coordinated = [];
    if (flags.deload) {
      coordinated.push({
        trigger: 'deload',
        nutrition: 'No recalcular GCT; mantener proteína alta, redistribuir CH según días reales.',
        training: 'Reducir volumen 20-30% y priorizar técnica.'
      });
    }
    if (flags.fatiga_alta && performance === 'baja' && objetivo === 'cut') {
      coordinated.push({
        trigger: 'déficit + fatiga',
        nutrition: 'Subir 150-250 kcal/día o diet break 7-14 días (proteína fija).',
        training: 'Deload 1 semana o -20/-30% volumen; asegurar recuperación.'
      });
    }
    if (performance === 'baja' && objetivo === 'mant') {
      coordinated.push({
        trigger: 'rendimiento cae en normocalórica',
        nutrition: 'Aumentar carbohidratos en días D2 (+10-20% extra) y considerar +150 kcal si se mantiene 2 semanas.',
        training: 'Revisar carga/descanso; reducir volumen basura.'
      });
    }

    res.json({
      success: true,
      inputs: {
        methodology,
        weekly_cls,
        performance,
        flags
      },
      nutrition: {
        kcal_objetivo: kcalObjetivo,
        macros_base: macrosBase,
        per_day: perDay,
        calendar_macros: calendarMacros
      },
      training_guidance: {
        objetivo_calorico_unico: kcalObjetivo,
        carb_cycling_aplicado: true,
        notas: coordinated
      }
    });
  } catch (error) {
    console.error('Error en puente entrenamiento-nutrición:', error);
    res.status(500).json({ error: 'Error al procesar resumen de entrenamiento' });
  }
});

export default router;
