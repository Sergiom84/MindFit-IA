import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { pool } from '../db.js';
import { updateSessionActivity } from '../utils/sessionUtils.js';

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Token de acceso requerido' });
  }

  jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Token inválido' });
    }
    
    // Normaliza para que siempre haya req.user.id disponible
    const normalized = {
      ...decoded,
      id: decoded?.userId ?? decoded?.id,
      userId: decoded?.userId ?? decoded?.id,
    };
    req.user = normalized;

    // AUTH-001: rechazar tokens cuya sesión fue revocada (logout marca la fila
    // is_active=FALSE). Fail-open ante errores o si no hay registro de sesión,
    // para no bloquear tokens legítimos cuyo alta de sesión no se registrara.
    try {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const { rows } = await pool.query(
        'SELECT is_active FROM app.user_sessions WHERE jwt_token_hash = $1 ORDER BY login_time DESC LIMIT 1',
        [tokenHash]
      );
      if (rows.length > 0 && rows[0].is_active === false) {
        return res.status(401).json({ error: 'Sesión cerrada. Vuelve a iniciar sesión.', code: 'SESSION_REVOKED' });
      }
    } catch (e) {
      console.warn('Warning: no se pudo verificar revocación de sesión:', e.message);
    }

    // Actualizar actividad de sesión en background
    if (normalized.userId) {
      updateSessionActivity(normalized.userId, token).catch(err => {
        console.warn('Warning: No se pudo actualizar actividad de sesión:', err.message);
      });
    }
    
    next();
  });
};

// Middleware adicional para detectar timeout de sesiones
const checkSessionTimeout = (timeoutMinutes = 1440) => { // 24 horas por defecto
  return async (req, res, next) => {
    if (!req.user || !req.user.userId) {
      return next();
    }

    try {
      const token = req.headers['authorization']?.split(' ')[1];
      if (!token) return next();

      // Verificar si la sesión ha expirado por inactividad
      const { pool } = await import('../db.js');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      
      const result = await pool.query(`
        SELECT 
          session_id,
          last_activity,
          (CURRENT_TIMESTAMP - last_activity) > INTERVAL '${timeoutMinutes} minutes' as is_expired
        FROM app.user_sessions
        WHERE user_id = $1 
          AND jwt_token_hash = $2 
          AND is_active = TRUE
        ORDER BY last_activity DESC
        LIMIT 1
      `, [req.user.userId, tokenHash]);

      if (result.rows.length > 0 && result.rows[0].is_expired) {
        // Marcar sesión como expirada
        await pool.query(`
          UPDATE app.user_sessions 
          SET 
            is_active = FALSE,
            logout_time = CURRENT_TIMESTAMP,
            logout_type = 'timeout',
            updated_at = CURRENT_TIMESTAMP
          WHERE session_id = $1
        `, [result.rows[0].session_id]);

        return res.status(401).json({ 
          error: 'Sesión expirada por inactividad',
          code: 'SESSION_TIMEOUT'
        });
      }

      next();
    } catch (error) {
      console.error('Error en checkSessionTimeout:', error);
      next(); // Continuar si hay error, no bloquear la aplicación
    }
  };
};

export default authenticateToken;
export { authenticateToken, checkSessionTimeout };
