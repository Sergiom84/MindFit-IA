/**
 * POST /api/adaptation/generate
 * Genera un plan de bloque de adaptación (Full Body o Half Body)
 * para principiantes antes del ciclo D1-D5.
 */

import express from 'express';
import pool from '../../db.js';
import { authenticateToken } from '../../middleware/auth.js';
import { normalizeDayAbbrev } from '../../utils/shared/dayNormalizer.js';
import { resolveUserInjuryRules } from '../../services/hipertrofia/injuryFilter.js';
import {
  resolveAdaptationProfile,
  resolveDayPatternForFrequency,
  generateAdaptationSessions
} from '../../services/hipertrofia/adaptation/adaptationHelpers.js';

const router = express.Router();

router.post('/generate', authenticateToken, async (req, res) => {
  const dbClient = await pool.connect();

  try {
    const userId = req.user?.userId || req.user?.id;
    const { blockType } = req.body || {};

    if (blockType && !['full_body', 'half_body'].includes(blockType)) {
      return res.status(400).json({
        success: false,
        error: 'blockType debe ser "full_body" o "half_body"'
      });
    }

    console.log(`🎯 [ADAPTACIÓN] Generando bloque ${blockType || 'auto'} para usuario:`, userId);

    await dbClient.query('BEGIN');

    const userResult = await dbClient.query(
      `SELECT id, edad, nivel_entrenamiento, anos_entrenando, frecuencia_semanal
       FROM app.users
       WHERE id = $1`,
      [userId]
    );

    const userProfile = userResult.rows[0] || {};
    const resolvedProfile = resolveAdaptationProfile(userProfile, blockType);

    // Verificar si ya tiene un bloque activo (y si está en modo repeat)
    const existingBlockResult = await dbClient.query(
      `SELECT id, block_type, duration_weeks, methodology_plan_id,
              repeat_required, repeat_penalty_pct, progression_cap_pct, repeat_count,
              ai_tag, sessions_per_week
       FROM app.adaptation_blocks
       WHERE user_id = $1 AND status = 'active'
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId]
    );

    const existingBlock = existingBlockResult.rows[0] || null;
    let repeatMode = false;
    let penaltyPct = 0;
    let progressionCapPct = 2.5;
    let effectiveBlockType = resolvedProfile.blockType;
    let effectiveDurationWeeks = resolvedProfile.durationWeeks;
    let effectiveAiTag = resolvedProfile.aiTag;
    let effectiveDayPattern = resolvedProfile.dayPattern;
    let effectiveSessionsPerWeek = resolvedProfile.sessionsPerWeek;
    let existingBlockId = null;

    if (existingBlock) {
      if (existingBlock.repeat_required) {
        repeatMode = true;
        penaltyPct = Number(existingBlock.repeat_penalty_pct || 10);
        progressionCapPct = Number(existingBlock.progression_cap_pct || 2);
        effectiveBlockType = existingBlock.block_type || effectiveBlockType;
        effectiveDurationWeeks = existingBlock.duration_weeks || effectiveDurationWeeks;
        effectiveAiTag = existingBlock.ai_tag || effectiveAiTag;
        effectiveSessionsPerWeek = existingBlock.sessions_per_week || effectiveSessionsPerWeek;
        // Patrón coherente con la frecuencia almacenada del bloque (A-03).
        effectiveDayPattern = resolveDayPatternForFrequency(effectiveSessionsPerWeek);
        existingBlockId = existingBlock.id;

        if (existingBlock.methodology_plan_id) {
          await dbClient.query(
            `UPDATE app.methodology_plans
             SET status = 'cancelled',
                 cancelled_at = NOW(),
                 updated_at = NOW()
             WHERE id = $1 AND user_id = $2`,
            [existingBlock.methodology_plan_id, userId]
          );
        }

        console.log(`🔁 [ADAPTACIÓN] Repeat requerido detectado. Penalización: -${penaltyPct}%`);
      } else {
        await dbClient.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          error: 'Ya tienes un bloque de adaptación activo',
          blockId: existingBlock.id
        });
      }
    }

    // 🩹 Reglas de lesión del usuario (filtro compartido)
    const { rules: injuryRules } = await resolveUserInjuryRules(userId);

    // 1. Generar sesiones de entrenamiento
    const sessions = await generateAdaptationSessions(dbClient, {
      blockType: effectiveBlockType,
      durationWeeks: effectiveDurationWeeks,
      dayPattern: effectiveDayPattern,
      penaltyPct,
      age: resolvedProfile.age,
      aiTag: effectiveAiTag,
      injuryRules
    });

    if (sessions.length === 0) {
      throw new Error('No se pudieron generar sesiones de adaptación');
    }

    // 2. Crear Plan en methodology_plans (para que aparezca en el sistema)
    const restBetweenExercisesSec = sessions?.[0]?.config?.rest_seconds ?? null;
    const restBetweenRoundsSec = sessions?.[0]?.config?.rest_between_rounds_seconds ?? null;
    const roundsExample = sessions?.[0]?.config?.rounds ?? null;

    const planData = {
      type: 'adaptation',
      blockType: effectiveBlockType,
      aiTag: effectiveAiTag,
      durationWeeks: effectiveDurationWeeks,
      sessionsPerWeek: effectiveSessionsPerWeek,
      dayPattern: effectiveDayPattern,
      sessionsCount: sessions.length,
      restBetweenExercisesSec,
      restBetweenRoundsSec,
      roundsExample,
      generatedAt: new Date().toISOString(),
      repeatMode,
      repeatPenaltyPct: penaltyPct,
      progressionCapPct,
      repeatCount: existingBlock?.repeat_count || 0
    };

    const planResult = await dbClient.query(
      `INSERT INTO app.methodology_plans (
        user_id, methodology_type, plan_name, plan_data, status, created_at
      ) VALUES ($1, $2, $3, $4, 'active', NOW())
      RETURNING id`,
      [
        userId,
        'Adaptation',
        `Adaptación ${effectiveBlockType === 'full_body' ? 'Full Body' : 'Half Body'}${repeatMode ? ' (Repeat)' : ''}`,
        JSON.stringify(planData)
      ]
    );
    const methodologyPlanId = planResult.rows[0].id;

    // 3. Crear o actualizar bloque de adaptación vinculado al plan
    let block;
    if (repeatMode && existingBlockId) {
      const blockResult = await dbClient.query(
        `UPDATE app.adaptation_blocks
         SET methodology_plan_id = $2,
             repeat_required = FALSE,
             repeat_reason = 'repeat_executed',
             ai_tag = COALESCE($3, ai_tag),
             sessions_per_week = COALESCE($4, sessions_per_week),
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [existingBlockId, methodologyPlanId, effectiveAiTag, effectiveSessionsPerWeek]
      );
      block = blockResult.rows[0];
    } else {
      const blockResult = await dbClient.query(
        `INSERT INTO app.adaptation_blocks (
          user_id,
          methodology_plan_id,
          block_type,
          duration_weeks,
          ai_tag,
          sessions_per_week,
          start_date,
          status
        )
        VALUES ($1, $2, $3, $4, $5, $6, CURRENT_DATE, 'active')
        RETURNING *`,
        [userId, methodologyPlanId, effectiveBlockType, effectiveDurationWeeks, effectiveAiTag, effectiveSessionsPerWeek]
      );
      block = blockResult.rows[0];
    }

    // 4. Guardar sesiones en methodology_exercise_sessions y agendar en workout_schedule
    const today = new Date();
    // Encontrar el lunes de la semana actual para alinear
    const dayOfWeek = today.getDay() || 7; // 1=Lun, 7=Dom
    const daysToMonday = 1 - dayOfWeek; // Si hoy es Martes (2), 1-2 = -1 (Lunes fue ayer)
    const mondayOfCurrentWeek = new Date(today);
    mondayOfCurrentWeek.setDate(today.getDate() + daysToMonday);

    const weekSessionOrderMap = new Map();
    let fallbackSessionOrder = 0;

    for (const session of sessions) {
      const normalizedDayName = normalizeDayAbbrev(session.dayName);
      const dayNameFull = session.dayName;
      const dayAbbrev = normalizeDayAbbrev(session.dayName);
      const weekSessionOrder = (weekSessionOrderMap.get(session.week) || 0) + 1;
      weekSessionOrderMap.set(session.week, weekSessionOrder);
      fallbackSessionOrder += 1;
      const sessionOrder = Number.isFinite(Number(session.sessionNumber))
        ? Number(session.sessionNumber)
        : fallbackSessionOrder;
      const sessionMetadata = {
        block_type: effectiveBlockType,
        ai_tag: effectiveAiTag,
        day_pattern: effectiveDayPattern,
        rest_between_exercises_seconds: session?.config?.rest_seconds ?? null,
        rest_between_rounds_seconds: session?.config?.rest_between_rounds_seconds ?? null,
        rounds: session?.config?.rounds ?? null,
        intensity: session?.config?.intensity ?? null,
        rir_target: session?.config?.rir_target ?? null,
        session_type: session?.config?.sessionType ?? null
      };

      const sessionResult = await dbClient.query(
        `INSERT INTO app.methodology_exercise_sessions (
          user_id,
          methodology_plan_id,
          methodology_type,
          session_type,
          session_name,
          week_number,
          day_name,
          session_date,
          total_exercises,
          exercises_data,
          session_metadata,
          session_status,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending', NOW(), NOW())
        RETURNING id`,
        [
          userId,
          methodologyPlanId,
          'Adaptation',
          'adaptation',
          session.name,
          session.week,
          normalizedDayName,
          null,
          session.exercises?.length || 0,
          JSON.stringify(session.exercises || []),
          JSON.stringify(sessionMetadata)
        ]
      );

      // Calcular fecha programada alineada a la semana
      // session.week: 1, 2...
      // session.dayOfWeek: 1 (Lun) - 5 (Vie)

      const scheduledDate = new Date(mondayOfCurrentWeek);
      const weekOffsetDays = (session.week - 1) * 7;
      const dayOffsetDays = (session.dayOfWeek - 1); // 0=Lun, 4=Vie

      scheduledDate.setDate(mondayOfCurrentWeek.getDate() + weekOffsetDays + dayOffsetDays);

      // Actualizar fecha de sesión
      await dbClient.query(
        `UPDATE app.methodology_exercise_sessions
         SET session_date = $1
         WHERE id = $2`,
        [scheduledDate, sessionResult.rows[0].id]
      );

      // Insertar en schedule
      await dbClient.query(
        `INSERT INTO app.workout_schedule (
          methodology_plan_id,
          user_id,
          week_number,
          session_order,
          week_session_order,
          scheduled_date,
          day_name,
          day_abbrev,
          session_title,
          exercises,
          status
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          methodologyPlanId,
          userId,
          session.week,
          sessionOrder,
          weekSessionOrder,
          scheduledDate.toISOString().split("T")[0],
          dayNameFull,
          dayAbbrev,
          session.name,
          JSON.stringify(session.exercises || []),
          "scheduled"
        ]
      );
    }

    // Crear primera semana de tracking (inicializada en 0)
    await dbClient.query(
      `INSERT INTO app.adaptation_criteria_tracking (
        adaptation_block_id,
        week_number,
        sessions_planned,
        sessions_completed,
        mean_rir,
        technique_flags_count,
        initial_average_weight,
        current_average_weight,
        week_start_date,
        week_end_date
      )
      VALUES ($1, 1, $2, 0, NULL, 0, NULL, NULL, CURRENT_DATE, CURRENT_DATE + INTERVAL '6 days')`,
      [block.id, effectiveSessionsPerWeek]
    );

    await dbClient.query('COMMIT');

    console.log('✅ [ADAPTACIÓN] Bloque creado y sesiones generadas:', block.id);

    res.json({
      success: true,
      message: 'Bloque de adaptación creado exitosamente',
      block: {
        id: block.id,
        methodologyPlanId: methodologyPlanId,
        blockType: block.block_type,
        aiTag: block.ai_tag,
        durationWeeks: block.duration_weeks,
        sessionsPerWeek: block.sessions_per_week,
        startDate: block.start_date,
        status: block.status,
        sessionsGenerated: sessions.length,
        repeatMode,
        repeatPenaltyPct: penaltyPct,
        progressionCapPct,
        repeatCount: block.repeat_count
      },
      nextSteps: [
        `Completar ${effectiveSessionsPerWeek} sesiones de entrenamiento por semana`,
        'Mantener RIR medio en rango 2-4',
        'Evitar flags de técnica',
        'Incrementar cargas progresivamente'
      ]
    });

  } catch (error) {
    await dbClient.query('ROLLBACK');
    console.error('❌ [ADAPTACIÓN] Error generando bloque:', error);
    res.status(500).json({
      success: false,
      error: 'Error generando bloque de adaptación',
      details: error.message
    });
  } finally {
    dbClient.release();
  }
});

export default router;
