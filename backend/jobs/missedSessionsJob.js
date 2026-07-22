import cron from "node-cron";
import { pool } from "../db.js";
import { finalizePlanIfCompleted } from "../services/methodologyPlansService.js";
import { withAdvisoryLock, LOCK_KEYS } from "../utils/advisoryLock.js";

const TIMEZONE = 'Europe/Madrid';
const CUTOFF_TIME = '23:49:00';
const MAX_MISSED_SESSIONS = 3; // Límite de sesiones missed consecutivas

async function markMissedSessions() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log(`⏰ [${new Date().toISOString()}] Ejecutando job de sesiones missed...`);

    // 1. Marcar sesiones como missed
    const result = await client.query(
      `WITH updated AS (
        UPDATE app.methodology_exercise_sessions
           SET session_status = 'missed',
               completion_rate = 0,
               exercises_completed = 0,
               completed_at = NOW(),
               updated_at = NOW()
         WHERE session_status IN ('pending', 'in_progress', 'scheduled')
           AND session_date IS NOT NULL
           AND (
                session_date::date < CURRENT_DATE
             OR (
                  session_date::date = CURRENT_DATE
              AND CURRENT_TIME >= $1::time
             )
           )
         RETURNING id, methodology_plan_id, user_id, session_date
      )
      SELECT * FROM updated`,
      [CUTOFF_TIME]
    );

    if (result.rowCount === 0) {
      console.log('ℹ️  No hay sesiones para marcar como missed');
      await client.query('COMMIT');
      return { updated: 0 };
    }

    console.log(`✅ Marcadas ${result.rowCount} sesiones como missed:`);
    result.rows.forEach(row => {
      console.log(`   - Session ${row.id} (User ${row.user_id}, Date: ${row.session_date})`);
    });

    // 2. Insertar feedback automático
    for (const row of result.rows) {
      await client.query(
        `INSERT INTO app.methodology_session_feedback (
          user_id, methodology_plan_id, methodology_session_id,
          feedback_type, reason_code, reason_text, created_at
        ) VALUES ($1, $2, $3, 'missed', 'auto_missed',
                  'Sesión no realizada antes de las 23:49h', NOW())
        ON CONFLICT DO NOTHING`,
        [row.user_id, row.methodology_plan_id, row.id]
      );
    }
    console.log(`📝 Insertado feedback automático para ${result.rowCount} sesiones`);

    // 3. Verificar planes a finalizar
    const plansToCheck = [...new Set(result.rows.map(r => r.methodology_plan_id))];
    for (const planId of plansToCheck) {
      await finalizePlanIfCompleted(planId, client);
    }

    // 4. Verificar usuarios con 3+ sesiones missed consecutivas
    await checkConsecutiveMissedSessions(client, result.rows);

    await client.query('COMMIT');
    console.log('✅ Job de sesiones missed completado exitosamente');
    return { updated: result.rowCount };

  } catch (error) {
    await client.query('ROLLBACK');
    console.error("❌ Error marcando sesiones no realizadas:", error);
    return { updated: 0, error: error.message };
  } finally {
    client.release();
  }
}

/**
 * Verifica usuarios con 3+ sesiones missed consecutivas y registra alerta
 */
async function checkConsecutiveMissedSessions(client, missedSessions) {
  const userIds = [...new Set(missedSessions.map(s => s.user_id))];

  for (const userId of userIds) {
    const consecutiveQuery = await client.query(`
      SELECT COUNT(*) as consecutive_missed
      FROM (
        SELECT session_status, session_date
        FROM app.methodology_exercise_sessions
        WHERE user_id = $1
          AND methodology_plan_id IN (
            SELECT id FROM app.methodology_plans
            WHERE user_id = $1 AND is_current = TRUE
          )
        ORDER BY session_date DESC
        LIMIT $2
      ) recent
      WHERE session_status = 'missed'
    `, [userId, MAX_MISSED_SESSIONS]);

    const consecutiveMissed = Number(consecutiveQuery.rows[0]?.consecutive_missed || 0);

    if (consecutiveMissed >= MAX_MISSED_SESSIONS) {
      console.log(`⚠️  Usuario ${userId} tiene ${consecutiveMissed} sesiones missed consecutivas`);

      // Insertar registro de alerta en feedback
      await client.query(`
        INSERT INTO app.methodology_session_feedback (
          user_id, methodology_plan_id, methodology_session_id,
          feedback_type, reason_code, reason_text, created_at
        )
        SELECT
          $1,
          mp.id,
          NULL,
          'missed',
          'auto_missed',
          'Usuario con ' || $2 || ' sesiones missed consecutivas - requiere intervención',
          NOW()
        FROM app.methodology_plans mp
        WHERE mp.user_id = $1 AND mp.is_current = TRUE
        LIMIT 1
      `, [userId, consecutiveMissed]);

      // TODO: Enviar notificación push al usuario
      // await sendPushNotification(userId, {
      //   title: '¡No abandones tu entrenamiento!',
      //   body: `Has perdido ${consecutiveMissed} sesiones seguidas. ¿Necesitas ajustar tu rutina?`
      // });
    }
  }
}

export function startMissedSessionsScheduler() {
  console.log(`⏰ Job de sesiones missed programado para 23:50 (${TIMEZONE})`);
  const task = cron.schedule(
    "50 23 * * *", // Ejecutar a las 23:50 (después del cutoff de 23:49)
    () => {
      // OPS-001: en despliegues multi-instancia, solo una ejecuta el job.
      withAdvisoryLock(LOCK_KEYS.missedSessions, "missedSessions", markMissedSessions);
    },
    {
      timezone: TIMEZONE,
      runOnInit: false // No ejecutar al iniciar servidor
    }
  );

  return {
    task,
    stop: () => task.stop(),
  };
}

/**
 * Ejecutar manualmente (para testing)
 */
export async function runMissedSessionsJobNow() {
  console.log('🔧 Ejecutando job de sesiones missed manualmente...');
  return await markMissedSessions();
}

// Permite ejecutar manualmente desde CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  markMissedSessions().then(() => process.exit(0));
}
