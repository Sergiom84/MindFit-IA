import express from 'express';
import { pool } from '../db.js';
import authenticateToken from '../middleware/auth.js';

const router = express.Router();

// Endpoint para obtener analytics personales del usuario
router.get('/user-stats', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Estadísticas de sesiones
    const sessionStats = await pool.query(`
      SELECT * FROM app.get_user_session_stats($1)
    `, [userId]);

    // Actividad reciente (últimos 30 días)
    const recentActivity = await pool.query(`
      SELECT 
        DATE(login_time) as date,
        COUNT(*) as login_count,
        COUNT(DISTINCT ip_address) as unique_locations,
        AVG(EXTRACT(EPOCH FROM session_duration)/60) as avg_session_minutes
      FROM app.user_sessions 
      WHERE user_id = $1 
        AND login_time >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(login_time)
      ORDER BY date DESC
      LIMIT 30
    `, [userId]);

    // Dispositivos más usados
    const topDevices = await pool.query(`
      SELECT 
        COALESCE(device_info->>'userAgent'->>'browser', 'unknown') as browser,
        COALESCE(device_info->>'userAgent'->>'platform', 'unknown') as platform,
        COUNT(*) as usage_count,
        MAX(login_time) as last_used
      FROM app.user_sessions 
      WHERE user_id = $1 
        AND login_time >= NOW() - INTERVAL '90 days'
      GROUP BY browser, platform
      ORDER BY usage_count DESC
      LIMIT 5
    `, [userId]);

    // Patrones de horario
    const hourlyPatterns = await pool.query(`
      SELECT 
        EXTRACT(HOUR FROM login_time) as hour,
        COUNT(*) as login_count
      FROM app.user_sessions 
      WHERE user_id = $1 
        AND login_time >= NOW() - INTERVAL '30 days'
      GROUP BY EXTRACT(HOUR FROM login_time)
      ORDER BY hour
    `, [userId]);

    res.json({
      user_id: userId,
      session_stats: sessionStats.rows[0] || {},
      recent_activity: recentActivity.rows,
      top_devices: topDevices.rows,
      hourly_patterns: hourlyPatterns.rows,
      generated_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error getting user analytics:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Endpoint para obtener analytics globales (solo admin)
router.get('/global-stats', async (req, res) => {
  try {
    // Verificar permisos de admin (fail-closed): si ADMIN_TOKEN no está
    // configurado, denegar siempre. Antes, con ADMIN_TOKEN sin definir y sin
    // cabecera, `undefined !== undefined` era false y el endpoint quedaba abierto.
    const adminToken = req.headers['x-admin-token'];
    if (!process.env.ADMIN_TOKEN || adminToken !== process.env.ADMIN_TOKEN) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    // Estadísticas globales de la última semana
    const globalStats = await pool.query(`
      SELECT 
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(*) as total_sessions,
        COUNT(*) FILTER (WHERE is_active = TRUE) as active_sessions,
        AVG(EXTRACT(EPOCH FROM session_duration)/60) as avg_session_minutes,
        COUNT(DISTINCT ip_address) as unique_ips,
        MIN(login_time) as earliest_session,
        MAX(login_time) as latest_session
      FROM app.user_sessions 
      WHERE login_time >= NOW() - INTERVAL '7 days'
    `);

    // Actividad diaria
    const dailyActivity = await pool.query(`
      SELECT 
        DATE(login_time) as date,
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(*) as total_logins,
        AVG(EXTRACT(EPOCH FROM session_duration)/60) as avg_session_minutes
      FROM app.user_sessions 
      WHERE login_time >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(login_time)
      ORDER BY date DESC
      LIMIT 30
    `);

    // Top países/ubicaciones por IP
    const topLocations = await pool.query(`
      SELECT 
        CASE 
          WHEN host(ip_address) ~ '^192\\.168\\.' THEN 'Local Network'
          WHEN host(ip_address) ~ '^10\\.' THEN 'Private Network'
          WHEN host(ip_address) ~ '^127\\.' THEN 'Localhost'
          ELSE host(ip_address)
        END as location,
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(*) as session_count
      FROM app.user_sessions 
      WHERE login_time >= NOW() - INTERVAL '7 days'
        AND ip_address IS NOT NULL
      GROUP BY location
      ORDER BY session_count DESC
      LIMIT 10
    `);

    // Navegadores más usados
    const topBrowsers = await pool.query(`
      SELECT 
        COALESCE(device_info->>'userAgent'->>'browser', 'unknown') as browser,
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(*) as usage_count
      FROM app.user_sessions 
      WHERE login_time >= NOW() - INTERVAL '7 days'
      GROUP BY browser
      ORDER BY usage_count DESC
      LIMIT 10
    `);

    // Sesiones problemáticas
    const problematicSessions = await pool.query(`
      SELECT 
        COUNT(*) as stuck_sessions,
        COUNT(DISTINCT user_id) as affected_users
      FROM app.user_sessions 
      WHERE is_active = TRUE 
        AND last_activity < NOW() - INTERVAL '12 hours'
    `);

    res.json({
      global_stats: globalStats.rows[0] || {},
      daily_activity: dailyActivity.rows,
      top_locations: topLocations.rows,
      top_browsers: topBrowsers.rows,
      problematic_sessions: problematicSessions.rows[0] || {},
      generated_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error getting global analytics:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Endpoint para obtener sesiones activas del usuario
router.get('/active-sessions', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const activeSessions = await pool.query(`
      SELECT 
        session_id,
        login_time,
        last_activity,
        ip_address,
        device_info->>'userAgent'->>'browser' as browser,
        device_info->>'userAgent'->>'platform' as platform,
        device_info->>'userAgent'->>'mobile' as is_mobile,
        EXTRACT(EPOCH FROM (NOW() - last_activity))/60 as minutes_inactive
      FROM app.user_sessions 
      WHERE user_id = $1 AND is_active = TRUE
      ORDER BY last_activity DESC
    `, [userId]);

    res.json({
      user_id: userId,
      active_sessions: activeSessions.rows,
      session_count: activeSessions.rows.length,
      generated_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error getting active sessions:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Endpoint para cerrar una sesión específica
router.delete('/sessions/:sessionId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const sessionId = parseInt(req.params.sessionId);

    // Verificar que la sesión pertenece al usuario
    const sessionCheck = await pool.query(`
      SELECT session_id FROM app.user_sessions 
      WHERE session_id = $1 AND user_id = $2 AND is_active = TRUE
    `, [sessionId, userId]);

    if (sessionCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Sesión no encontrada o no autorizada' });
    }

    // Cerrar la sesión
    const result = await pool.query(`
      UPDATE app.user_sessions 
      SET is_active = FALSE,
          logout_time = NOW(),
          logout_type = 'manual_remote',
          updated_at = NOW()
      WHERE session_id = $1 AND user_id = $2
      RETURNING session_id, session_duration
    `, [sessionId, userId]);

    if (result.rows.length > 0) {
      res.json({
        message: 'Sesión cerrada exitosamente',
        session_id: sessionId,
        duration: result.rows[0].session_duration
      });
    } else {
      res.status(500).json({ error: 'No se pudo cerrar la sesión' });
    }

  } catch (error) {
    console.error('Error closing session:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Endpoint para cerrar todas las sesiones excepto la actual
router.post('/logout-all-other', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const currentToken = req.headers.authorization?.split(' ')[1];
    
    if (!currentToken) {
      return res.status(400).json({ error: 'Token requerido' });
    }

    // Obtener hash del token actual
    const crypto = await import('crypto');
    const currentTokenHash = crypto.createHash('sha256').update(currentToken).digest('hex');

    // Cerrar todas las sesiones excepto la actual
    const result = await pool.query(`
      UPDATE app.user_sessions 
      SET is_active = FALSE,
          logout_time = NOW(),
          logout_type = 'logout_all_other',
          updated_at = NOW()
      WHERE user_id = $1 
        AND is_active = TRUE 
        AND jwt_token_hash != $2
      RETURNING session_id
    `, [userId, currentTokenHash]);

    res.json({
      message: 'Otras sesiones cerradas exitosamente',
      closed_sessions: result.rows.length
    });

  } catch (error) {
    console.error('Error closing other sessions:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;