import { pool } from "../db.js";

/**
 * Obtiene un cliente de base de datos. Si se pasa client (transacción) lo usa,
 * de lo contrario recurre al pool global.
 */
function getRunner(client) {
  return client || pool;
}

/**
 * Marca un plan como el actual del usuario (al generar/activar uno nuevo).
 * Desactiva cualquier otro plan que estuviera marcado como actual.
 */
export async function setCurrentMethodologyPlan(userId, planId, client) {
  const runner = getRunner(client);

  await runner.query(
    `UPDATE app.methodology_plans
     SET is_current = FALSE
     WHERE user_id = $1 AND id <> $2 AND is_current = TRUE`,
    [userId, planId]
  );

  await runner.query(
    `UPDATE app.methodology_plans
     SET is_current = TRUE,
         status = CASE WHEN status = 'draft' THEN 'active' ELSE status END,
         updated_at = NOW()
     WHERE id = $1 AND user_id = $2`,
    [planId, userId]
  );
}

/**
 * @deprecated Esta función ya no marca planes como completados automáticamente.
 * Usar checkPlanProgress() para obtener el estado del progreso.
 *
 * Mantiene compatibilidad hacia atrás retornando siempre false.
 */
export async function finalizePlanIfCompleted(planId, client) {
  // ⚠️ DESACTIVADO: El plan NUNCA se marca automáticamente como completado.
  // El usuario decide cuándo finalizar su plan.
  console.log(`ℹ️ finalizePlanIfCompleted() llamado para plan ${planId} - IGNORADO (función deprecada)`);
  return false;
}

/**
 * Calcula el progreso real del plan comparando días planificados vs días entrenados.
 * NO modifica ningún estado, solo retorna información.
 *
 * @param {number} planId - ID del plan de metodología
 * @param {object} client - Cliente de transacción (opcional)
 * @returns {Promise<object>} Objeto con el progreso del plan
 */
export async function checkPlanProgress(planId, client) {
  const runner = getRunner(client);

  try {
    // 1. Obtener info del plan
    const planResult = await runner.query(
      `SELECT
        id,
        user_id,
        methodology_type,
        status,
        plan_start_date,
        confirmed_at,
        created_at,
        total_weeks,
        COALESCE(plan_data->>'total_training_days', '0') as configured_total_days
       FROM app.methodology_plans
       WHERE id = $1`,
      [planId]
    );

    if (planResult.rowCount === 0) {
      return { success: false, error: 'Plan no encontrado' };
    }

    const plan = planResult.rows[0];
    const startDate = plan.plan_start_date || plan.confirmed_at || plan.created_at;

    // 2. Contar días planificados (excluyendo descansos)
    const plannedDaysResult = await runner.query(
      `SELECT COUNT(*) as total_planned
       FROM app.methodology_plan_days
       WHERE methodology_plan_id = $1 AND is_rest = false`,
      [planId]
    );
    const totalPlannedDays = parseInt(plannedDaysResult.rows[0]?.total_planned || 0);

    // 3. Contar sesiones por estado
    const sessionsResult = await runner.query(
      `SELECT
        COUNT(*) as total_sessions,
        COUNT(*) FILTER (WHERE session_status = 'completed') as completed,
        COUNT(*) FILTER (WHERE session_status = 'partial') as partial,
        COUNT(*) FILTER (WHERE session_status IN ('cancelled', 'skipped', 'missed')) as skipped,
        COUNT(*) FILTER (WHERE session_status = 'in_progress') as in_progress
       FROM app.methodology_exercise_sessions
       WHERE methodology_plan_id = $1`,
      [planId]
    );
    const sessions = sessionsResult.rows[0];

    // 4. Calcular día actual de entrenamiento (días L-V transcurridos)
    const currentDayResult = await runner.query(
      `SELECT
        COALESCE(
          (SELECT day_id FROM app.methodology_plan_days
           WHERE methodology_plan_id = $1
           AND scheduled_date = CURRENT_DATE
           AND is_rest = false
           LIMIT 1),
          0
        ) as current_day_id`,
      [planId]
    );
    const currentTrainingDay = parseInt(currentDayResult.rows[0]?.current_day_id || 0);

    // 5. Determinar si es el último día
    const isFinalDay = currentTrainingDay >= totalPlannedDays && totalPlannedDays > 0;

    // 6. Calcular porcentaje de progreso
    const totalCompleted = parseInt(sessions.completed || 0);
    const totalPartial = parseInt(sessions.partial || 0);
    const effectiveSessions = totalCompleted + (totalPartial * 0.5); // Parciales cuentan como 0.5
    const progressPercentage = totalPlannedDays > 0
      ? Math.round((effectiveSessions / totalPlannedDays) * 100)
      : 0;

    // 7. Calcular adherencia (días entrenados / días transcurridos)
    const totalAttempted = parseInt(sessions.total_sessions || 0);
    const adherencePercentage = currentTrainingDay > 0
      ? Math.round((totalAttempted / currentTrainingDay) * 100)
      : 0;

    return {
      success: true,
      planId: plan.id,
      methodologyType: plan.methodology_type,
      status: plan.status,
      startDate,

      // Días
      currentTrainingDay,
      totalPlannedDays,
      remainingDays: Math.max(0, totalPlannedDays - currentTrainingDay),
      isFinalDay,

      // Sesiones
      sessions: {
        total: parseInt(sessions.total_sessions || 0),
        completed: totalCompleted,
        partial: totalPartial,
        skipped: parseInt(sessions.skipped || 0),
        inProgress: parseInt(sessions.in_progress || 0)
      },

      // Métricas
      progressPercentage,
      adherencePercentage,

      // Info adicional
      totalWeeks: plan.total_weeks || Math.ceil(totalPlannedDays / 5),
      currentWeek: Math.ceil(currentTrainingDay / 5) || 1
    };

  } catch (error) {
    console.error('❌ Error en checkPlanProgress:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Finaliza un plan MANUALMENTE cuando el usuario decide cerrarlo.
 * Solo debe llamarse desde el Dashboard Final o por decisión explícita del usuario.
 *
 * @param {number} planId - ID del plan
 * @param {number} userId - ID del usuario (para validación)
 * @param {object} client - Cliente de transacción (opcional)
 * @returns {Promise<object>} Resultado de la operación
 */
export async function completePlanManually(planId, userId, client) {
  const runner = getRunner(client);

  try {
    // 1. Verificar que el plan pertenece al usuario y está activo
    const planCheck = await runner.query(
      `SELECT id, status FROM app.methodology_plans
       WHERE id = $1 AND user_id = $2`,
      [planId, userId]
    );

    if (planCheck.rowCount === 0) {
      return { success: false, error: 'Plan no encontrado o no autorizado' };
    }

    if (planCheck.rows[0].status === 'completed') {
      return { success: false, error: 'El plan ya está completado' };
    }

    // 2. Obtener resumen del progreso antes de cerrar
    const progress = await checkPlanProgress(planId, runner);

    // 3. Marcar como completado
    await runner.query(
      `UPDATE app.methodology_plans
       SET status = 'completed',
           is_current = FALSE,
           completed_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [planId]
    );

    console.log(`🏆 Plan ${planId} completado MANUALMENTE por usuario ${userId}`);
    console.log(`   📊 Progreso final: ${progress.progressPercentage}% | Adherencia: ${progress.adherencePercentage}%`);

    return {
      success: true,
      message: 'Plan completado exitosamente',
      finalProgress: progress
    };

  } catch (error) {
    console.error('❌ Error en completePlanManually:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Cancela todos los planes activos del usuario antes de crear uno nuevo
 * @param {number} userId - ID del usuario
 * @param {object} client - Cliente de transacción (opcional)
 * @returns {Promise<number>} - Número de planes cancelados
 */
export async function cancelActivePlans(userId, client) {
  const runner = getRunner(client);

  const result = await runner.query(
    `UPDATE app.methodology_plans
     SET status = 'cancelled',
         is_current = FALSE,
         cancelled_at = NOW(),
         updated_at = NOW()
     WHERE user_id = $1
       AND status = 'active'
       AND origin = 'methodology'
     RETURNING id, methodology_type`,
    [userId]
  );

  if (result.rowCount > 0) {
    console.log(`🧹 Cancelados ${result.rowCount} planes activos:`,
      result.rows.map(r => `${r.id} (${r.methodology_type})`));
  }

  return result.rowCount;
}

/**
 * Activa un plan de metodología como único plan activo
 * Cancela automáticamente cualquier otro plan activo
 */
export async function activateMethodologyPlan(userId, planId, client) {
  const runner = getRunner(client);

  // 1. Cancelar planes activos anteriores
  await cancelActivePlans(userId, runner);

  // 2. Activar el nuevo plan
  await runner.query(
    `UPDATE app.methodology_plans
     SET status = 'active',
         is_current = TRUE,
         confirmed_at = COALESCE(confirmed_at, NOW()),
         started_at = COALESCE(started_at, NOW()),
         updated_at = NOW()
     WHERE id = $1 AND user_id = $2`,
    [planId, userId]
  );

  console.log(`✅ Plan ${planId} activado como único plan activo para usuario ${userId}`);
}

/**
 * Obtiene el plan activo actual del usuario
 */
export async function getCurrentPlan(userId, client) {
  const runner = getRunner(client);

  const result = await runner.query(
    `SELECT * FROM app.methodology_plans
     WHERE user_id = $1 AND is_current = TRUE AND status = 'active'
     LIMIT 1`,
    [userId]
  );

  return result.rows[0] || null;
}
