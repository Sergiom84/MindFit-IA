import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';
import {
  logUserLogin,
  logUserLogout,
  getUserActiveSessions,
  getUserSessionStats,
  forceLogoutAllSessions,
  hashJWTToken
} from '../utils/sessionUtils.js';
import { authenticateToken } from '../middleware/auth.js';
import {
  newSessionId,
  signAccessToken,
  newRefreshToken,
  hashRefreshToken,
  sessionIdFromRefreshToken,
  ACCESS_TOKEN_TTL,
  REFRESH_TOKEN_TTL_DAYS,
  AUTH_FAIL_CLOSED,
} from '../utils/authTokens.js';

// AUTH-001 (PR 3): deriva la fecha de expiración del access a partir del TTL configurado
// (solo soporta 'Nd'/'Nh'/'Nm' o segundos; suficiente para '7d'/'15m'). Para el registro
// de sesión; el TTL real lo aplica jwt.sign.
function accessExpiresAt() {
  const ttl = ACCESS_TOKEN_TTL;
  const m = /^(\d+)([dhm])$/.exec(ttl);
  let ms = 7 * 24 * 60 * 60 * 1000;
  if (m) {
    const n = Number(m[1]);
    ms = m[2] === 'd' ? n * 86400000 : m[2] === 'h' ? n * 3600000 : n * 60000;
  } else if (/^\d+$/.test(ttl)) {
    ms = Number(ttl) * 1000;
  }
  return new Date(Date.now() + ms);
}

const router = express.Router();

// Registro de usuario
router.post('/register', async (req, res) => {
  try {
    const {
      nombre,
      apellido,
      email,
      password,
      edad,
      sexo,
      peso,
      altura,
      nivelEntrenamiento,
      anosEntrenando,
      frecuenciaSemanal,
      metodologiaPreferida,
      nivelActividad,
      // Medidas corporales
      cintura,
      pecho,
      brazos,
      muslo,
      muslos,
      cuello,
      antebrazos,
      // Información de salud
      historialMedico,
      limitacionesFisicas,
      alergias,
      medicamentos,
      // Objetivos
      objetivoPrincipal,
      metaPeso,
      metaGrasaCorporal,
      enfoqueEntrenamiento,
      horarioPreferido,
      comidasPorDia,
      suplementacion,
      alimentosExcluidos,
      // Ciclo menstrual (solo mujeres)
      cycleTrackingEnabled,
      lastPeriodStart,
      cycleLength,
      cycleIsRegular,
      usesHormonalContraceptives
    } = req.body;

    // Validar campos requeridos
    if (!nombre || !apellido || !email || !password) {
      return res.status(400).json({
        error: 'Los campos nombre, apellido, email y contraseña son requeridos'
      });
    }

    // Verificar si el usuario ya existe
    const existingUser = await pool.query(
      'SELECT id FROM app.users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({
        error: 'Ya existe un usuario con este email'
      });
    }

    // Encriptar contraseña
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Función para convertir cadenas vacías a null
    const toNullIfEmpty = (value) => {
      if (value === '' || value === undefined || value === null) return null;
      return value;
    };

    const toNumberOrNull = (value) => {
      if (value === '' || value === undefined || value === null) return null;
      const num = Number(value);
      return isNaN(num) ? null : num;
    };

    // Normalizar todos los campos con constraints
    const normalizeHorarioPreferido = (val) => {
      if (val === '' || val === undefined || val === null) return null;
      const v = String(val).toLowerCase();
      if (v === 'manana' || v === 'mañana' || v === 'morning') return 'mañana';
      if (v === 'mediodia' || v === 'medio_dia' || v === 'media_mañana' || v === 'media_manana' || v === 'noon') return 'media_mañana';
      if (v === 'tarde' || v === 'afternoon') return 'tarde';
      if (v === 'noche' || v === 'night') return 'noche';
      return null;
    };

    const normalizeObjetivoPrincipal = (val) => {
      if (val === '' || val === undefined || val === null) return null;
      const v = String(val).toLowerCase().replace(/\s+/g, '_');
      
      // Mapear valores del frontend a valores de BD
      const mappings = {
        'perder_peso': 'perder_peso',
        'ganar_musculo': 'ganar_masa_muscular',
        'ganar_masa_muscular': 'ganar_masa_muscular',
        'tonificar': 'tonificar',
        'ganar_peso': 'ganar_peso',
        'mejorar_resistencia': 'mejorar_resistencia',
        'mejorar_flexibilidad': 'mejorar_flexibilidad',
        'salud_general': 'salud_general',
        'mantenimiento': 'mantenimiento',
        'rehabilitacion': 'rehabilitacion'
      };
      
      return mappings[v] || null;
    };

    const normalizeEnfoqueEntrenamiento = (val) => {
      if (val === '' || val === undefined || val === null) return null;
      const v = String(val).toLowerCase().replace(/\s+/g, '_');
      
      // Mapear valores del frontend a valores de BD permitidos
      const mappings = {
        'fuerza': 'fuerza',
        'hipertrofia': 'hipertrofia', 
        'resistencia': 'resistencia',
        'funcional': 'general', // Funcional -> general (según constraint BD)
        'hiit': 'perdida_peso', // HIIT -> perdida_peso (según constraint BD)
        'mixto': 'general', // Mixto -> general (según constraint BD)
        'perdida_peso': 'perdida_peso',
        'general': 'general'
      };
      
      return mappings[v] || null;
    };

    const normalizeNivelActividad = (val) => {
      if (val === '' || val === undefined || val === null) return null;
      const v = String(val).toLowerCase();
      const validValues = ['sedentario', 'ligero', 'moderado', 'activo', 'muy_activo'];
      return validValues.includes(v) ? v : null;
    };

    const normalizeSexo = (val) => {
      if (val === '' || val === undefined || val === null) return null;
      const v = String(val).toLowerCase();
      return (v === 'masculino' || v === 'femenino') ? v : null;
    };

    // Procesar valores numéricos
    const anosEntrenamientoValue = toNumberOrNull(anosEntrenando);
    const frecuenciaSemanalValue = toNumberOrNull(frecuenciaSemanal);

    // Validaciones opcionales (solo si el usuario proporciona valores)
    if (anosEntrenamientoValue !== null && (anosEntrenamientoValue < 0 || anosEntrenamientoValue > 50)) {
      return res.status(400).json({
        error: 'Los años de entrenamiento deben estar entre 0 y 50'
      });
    }

    if (frecuenciaSemanalValue !== null && (frecuenciaSemanalValue < 0 || frecuenciaSemanalValue > 7)) {
      return res.status(400).json({
        error: 'La frecuencia semanal debe estar entre 0 y 7 días'
      });
    }
    // Detectar tipos de columnas para campos que pueden ser ARRAY o TEXT según el esquema
    const arrayFields = ['alergias', 'medicamentos', 'suplementacion', 'alimentos_excluidos', 'limitaciones_fisicas'];
    const typeRes = await pool.query(`
      SELECT column_name, data_type, udt_name
      FROM information_schema.columns
      WHERE table_schema = ANY (current_schemas(true))
        AND table_name = 'users'
        AND column_name = ANY ($1)
    `, [arrayFields]);

    const isArrayColumn = Object.fromEntries(
      typeRes.rows.map(r => [
        r.column_name,
        r.data_type === 'ARRAY' || (r.udt_name && r.udt_name.startsWith('_'))
      ])
    );

    const normalizeArrayValue = (val, arrayExpected) => {
      if (val === '' || val === undefined || val === null) return null;
      if (!arrayExpected) return val; // se espera TEXT simple
      if (Array.isArray(val)) {
        return val
          .map(v => (v == null ? '' : String(v).trim()))
          .filter(Boolean);
      }
      if (typeof val === 'string') {
        const parts = val.split(',').map(s => s.trim()).filter(Boolean);
        return parts.length ? parts : [val.trim()];
      }
      return null;
    };

    const alergiasValue = normalizeArrayValue(alergias, isArrayColumn['alergias']);
    const medicamentosValue = normalizeArrayValue(medicamentos, isArrayColumn['medicamentos']);
    const suplementacionValue = normalizeArrayValue(suplementacion, isArrayColumn['suplementacion']);
    const alimentosExcluidosValue = normalizeArrayValue(alimentosExcluidos, isArrayColumn['alimentos_excluidos']);
    const limitacionesFisicasValue = normalizeArrayValue(limitacionesFisicas, isArrayColumn['limitaciones_fisicas']);


    const musloValue = muslo ?? muslos;

    // Insertar usuario en la base de datos (created_at y updated_at se manejan automáticamente)
    const result = await pool.query(
      `INSERT INTO app.users (
        nombre, apellido, email, password_hash, edad, sexo, peso, altura,
        nivel_entrenamiento, anos_entrenando, frecuencia_semanal,
        metodologia_preferida, nivel_actividad, cintura, pecho, brazos,
        muslo, cuello, antebrazos, historial_medico, limitaciones_fisicas,
        alergias, medicamentos, objetivo_principal, meta_peso,
        meta_grasa_corporal, enfoque_entrenamiento, horario_preferido,
        comidas_por_dia, suplementacion, alimentos_excluidos
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
        $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28,
        $29, $30, $31
      ) RETURNING id, nombre, apellido, email, created_at`,
      [
        nombre, apellido, email, hashedPassword,
        toNumberOrNull(edad), normalizeSexo(sexo), toNumberOrNull(peso), toNumberOrNull(altura),
        toNullIfEmpty(nivelEntrenamiento), anosEntrenamientoValue, frecuenciaSemanalValue,
        toNullIfEmpty(metodologiaPreferida), normalizeNivelActividad(nivelActividad),
        toNumberOrNull(cintura), toNumberOrNull(pecho), toNumberOrNull(brazos),
        toNumberOrNull(musloValue), toNumberOrNull(cuello), toNumberOrNull(antebrazos),
        toNullIfEmpty(historialMedico), limitacionesFisicasValue,
        alergiasValue, medicamentosValue, normalizeObjetivoPrincipal(objetivoPrincipal),
        toNumberOrNull(metaPeso), toNumberOrNull(metaGrasaCorporal), normalizeEnfoqueEntrenamiento(enfoqueEntrenamiento),
        normalizeHorarioPreferido(horarioPreferido), toNumberOrNull(comidasPorDia), suplementacionValue,
        alimentosExcluidosValue
      ]
    );

    const user = result.rows[0];

    // Si es mujer y activó el seguimiento del ciclo, crear configuración
    if (normalizeSexo(sexo) === 'femenino' && cycleTrackingEnabled) {
      try {
        const cycleLengthValue = toNumberOrNull(cycleLength) || 28;
        const isRegular = cycleIsRegular === 'true' || cycleIsRegular === true;
        const usesContraceptives = usesHormonalContraceptives === 'true' || usesHormonalContraceptives === true;
        
        await pool.query(
          `INSERT INTO app.user_menstrual_config 
           (user_id, cycle_length, is_regular, uses_hormonal_contraceptives, last_period_start, tracking_enabled)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            user.id,
            cycleLengthValue,
            isRegular,
            usesContraceptives,
            toNullIfEmpty(lastPeriodStart),
            true
          ]
        );
        console.log(`🩸 Configuración de ciclo menstrual creada para usuario ${user.id}`);
      } catch (cycleError) {
        // No fallar el registro si hay error en el ciclo
        console.error('Error creando config de ciclo:', cycleError);
      }
    }

    // AUTH-001 (PR 3): session_id antes de firmar (jti); refresh token rotatorio.
    const sessionId = newSessionId();
    const token = signAccessToken({ userId: user.id, email: user.email, jti: sessionId });
    const refresh = newRefreshToken(sessionId);

    const regSession = await logUserLogin(user.id, token, req, { loginMethod: 'register' }, {
      sessionId,
      refreshTokenHash: refresh.hash,
      refreshExpiresAt: refresh.expiresAt,
      jwtExpiresAt: accessExpiresAt(),
    });
    if (!regSession.success && AUTH_FAIL_CLOSED) {
      return res.status(500).json({ error: 'No se pudo crear la sesión' });
    }

    res.status(201).json({
      message: 'Usuario registrado exitosamente',
      user: {
        id: user.id,
        nombre: user.nombre,
        apellido: user.apellido,
        email: user.email
      },
      token,
      refreshToken: refresh.token
    });

  } catch (error) {
    console.error('Error en registro:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Login de usuario
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validar campos requeridos
    if (!email || !password) {
      return res.status(400).json({
        error: 'Email y contraseña son requeridos'
      });
    }

    // Buscar usuario
    const result = await pool.query(
      'SELECT id, nombre, apellido, email, password_hash FROM app.users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        error: 'Credenciales incorrectas'
      });
    }

    const user = result.rows[0];

    // Verificar contraseña
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      return res.status(401).json({
        error: 'Credenciales incorrectas'
      });
    }

    // AUTH-001 (PR 3): session_id antes de firmar (jti); refresh token rotatorio.
    const sessionId = newSessionId();
    const token = signAccessToken({ userId: user.id, email: user.email, jti: sessionId });
    const refresh = newRefreshToken(sessionId);

    // Registrar sesión de login (session_id explícito + hash del refresh)
    const loginResult = await logUserLogin(user.id, token, req, {
      loginMethod: 'email_password',
      userAgent: req.headers['user-agent'] || 'unknown'
    }, {
      sessionId,
      refreshTokenHash: refresh.hash,
      refreshExpiresAt: refresh.expiresAt,
      jwtExpiresAt: accessExpiresAt(),
    });

    if (!loginResult.success) {
      console.warn('Warning: No se pudo registrar la sesión de login:', loginResult.error);
      // Fail-closed: no entregar un token cuya sesión no se pudo crear (sería no revocable).
      if (AUTH_FAIL_CLOSED) {
        return res.status(500).json({ error: 'No se pudo crear la sesión' });
      }
    }

    res.json({
      message: 'Login exitoso',
      user: {
        id: user.id,
        nombre: user.nombre,
        apellido: user.apellido,
        email: user.email
      },
      token,
      refreshToken: refresh.token,
      sessionId: loginResult.success ? loginResult.sessionId : sessionId
    });

  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// AUTH-001 (PR 3): refresh rotatorio fail-closed con detección de reuso.
// El cliente envía `refreshToken` (opaco, formato `<sessionId>.<random>`); se valida
// su hash contra la sesión bloqueada con FOR UPDATE. En cada uso se ROTA (nuevo access
// + nuevo refresh); reutilizar un refresh ya rotado revoca la familia (la sesión) y
// registra el incidente. Para clientes legacy que aún mandan el JWT, se conserva la vía
// deslizante anterior (fail-open) hasta que el PR 4 despliegue el nuevo cliente.
async function refreshWithRotatingToken(req, res, refreshToken) {
  const sessionId = sessionIdFromRefreshToken(refreshToken);
  if (!sessionId) {
    return res.status(401).json({ error: 'Refresh token inválido', code: 'REFRESH_INVALID' });
  }
  const presentedHash = hashRefreshToken(refreshToken);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT user_id, is_active, refresh_token_hash, refresh_expires_at, session_metadata
         FROM app.user_sessions WHERE session_id = $1 FOR UPDATE`,
      [sessionId]
    );
    const row = rows[0];
    if (!row) {
      await client.query('ROLLBACK');
      return res.status(401).json({ error: 'Sesión no encontrada', code: 'REFRESH_INVALID' });
    }
    if (row.is_active === false) {
      await client.query('ROLLBACK');
      return res.status(401).json({ error: 'Sesión cerrada. Vuelve a iniciar sesión.', code: 'SESSION_REVOKED' });
    }
    if (!row.refresh_expires_at || new Date(row.refresh_expires_at).getTime() < Date.now()) {
      await client.query('ROLLBACK');
      return res.status(401).json({ error: 'Refresh caducado. Vuelve a iniciar sesión.', code: 'REFRESH_EXPIRED' });
    }
    // Detección de REUSO: el hash presentado no coincide con el vigente -> token ya
    // rotado. Se revoca la familia (la sesión) y se registra el incidente.
    if (row.refresh_token_hash !== presentedHash) {
      await client.query(
        `UPDATE app.user_sessions
            SET is_active = FALSE, logout_time = NOW(), logout_type = 'refresh_reuse',
                session_metadata = COALESCE(session_metadata, '{}'::jsonb) || $2::jsonb,
                updated_at = NOW()
          WHERE session_id = $1`,
        [sessionId, JSON.stringify({ security: 'refresh_reuse_detected', at: new Date().toISOString() })]
      );
      await client.query('COMMIT');
      console.warn(`[SECURITY] refresh reuse detectado; sesión ${sessionId} (user ${row.user_id}) revocada.`);
      return res.status(401).json({ error: 'Reutilización detectada. Vuelve a iniciar sesión.', code: 'REFRESH_REUSE' });
    }

    // Válido: rotar access + refresh. Recuperar el email para conservar el payload.
    const { rows: userRows } = await client.query('SELECT email FROM app.users WHERE id = $1', [row.user_id]);
    const email = userRows[0]?.email;
    const token = signAccessToken({ userId: row.user_id, email, jti: sessionId });
    const nextRefresh = newRefreshToken(sessionId);
    await client.query(
      `UPDATE app.user_sessions
          SET jwt_token_hash = $2, jwt_expires_at = $3,
              refresh_token_hash = $4, refresh_expires_at = $5,
              last_activity = NOW(), updated_at = NOW()
        WHERE session_id = $1`,
      [sessionId, hashJWTToken(token), accessExpiresAt(), nextRefresh.hash, nextRefresh.expiresAt]
    );
    await client.query('COMMIT');
    return res.json({ token, refreshToken: nextRefresh.token });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* noop */ }
    console.error('Error en refresh rotatorio:', e.message);
    return res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    client.release();
  }
}

router.post('/refresh', async (req, res) => {
  try {
    // Vía nueva: refresh token rotatorio.
    const refreshToken = req.body?.refreshToken;
    if (refreshToken) {
      return await refreshWithRotatingToken(req, res, refreshToken);
    }

    // Vía legacy: el cliente antiguo manda el propio JWT (deslizante, fail-open).
    const bearer = req.headers.authorization?.split(' ')[1];
    const candidate = req.body?.token || bearer;
    if (!candidate) {
      return res.status(400).json({ error: 'Token requerido' });
    }

    let payload;
    try {
      payload = jwt.verify(candidate, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Token inválido o caducado' });
    }

    const oldHash = hashJWTToken(candidate);
    let sessionRow = null;
    try {
      const { rows } = await pool.query(
        'SELECT session_id, is_active FROM app.user_sessions WHERE jwt_token_hash = $1 ORDER BY login_time DESC LIMIT 1',
        [oldHash]
      );
      sessionRow = rows[0] || null;
      if (sessionRow && sessionRow.is_active === false) {
        return res.status(401).json({ error: 'Sesión cerrada. Vuelve a iniciar sesión.', code: 'SESSION_REVOKED' });
      }
      if (!sessionRow && AUTH_FAIL_CLOSED) {
        return res.status(401).json({ error: 'Sesión no encontrada. Vuelve a iniciar sesión.', code: 'SESSION_REVOKED' });
      }
    } catch (e) {
      console.warn('refresh: no se pudo verificar la sesión:', e.message);
      if (AUTH_FAIL_CLOSED) {
        return res.status(401).json({ error: 'No se pudo verificar la sesión.', code: 'SESSION_CHECK_FAILED' });
      }
    }

    // Preserva el jti si el token legacy ya lo tuviera (tokens emitidos por el PR 3).
    const token = signAccessToken({ userId: payload.userId, email: payload.email, jti: payload.jti });

    if (sessionRow) {
      try {
        await pool.query(
          'UPDATE app.user_sessions SET jwt_token_hash = $1, jwt_expires_at = $2, last_activity = NOW(), updated_at = NOW() WHERE session_id = $3',
          [hashJWTToken(token), accessExpiresAt(), sessionRow.session_id]
        );
      } catch (e) {
        console.warn('refresh: no se pudo rotar la sesión:', e.message);
      }
    }

    res.json({ token });
  } catch (error) {
    console.error('Error en refresh:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Logout de usuario
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const { logoutType = 'manual' } = req.body;

    // Registrar logout
    const logoutResult = await logUserLogout(req.user.userId, token, logoutType, {
      logoutTimestamp: new Date().toISOString(),
      userAgent: req.headers['user-agent'] || 'unknown'
    });

    if (logoutResult.success) {
      res.json({
        message: 'Logout exitoso',
        sessionId: logoutResult.sessionId,
        sessionDuration: logoutResult.duration
      });
    } else {
      // Aún así devolver éxito al cliente, solo logear el warning
      console.warn('Warning: No se pudo registrar el logout:', logoutResult.error);
      res.json({
        message: 'Logout exitoso',
        warning: 'Sesión no encontrada en logs'
      });
    }

  } catch (error) {
    console.error('Error en logout:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Heartbeat endpoint para mantener la sesión activa
router.post('/heartbeat', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Actualizar la actividad de la sesión en la base de datos si es necesario
    // Esto es opcional - el sessionManager lo maneja localmente

    res.json({
      success: true,
      timestamp: Date.now(),
      userId: userId,
      status: 'active'
    });

  } catch (error) {
    console.error('Error en heartbeat:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Verificar token
router.get('/verify', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Token no proporcionado' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const result = await pool.query(
      'SELECT id, nombre, apellido, email FROM app.users WHERE id = $1',
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Usuario no encontrado' });
    }

    res.json({ user: result.rows[0] });

  } catch (error) {
    console.error('Error verificando token:', error);
    res.status(401).json({ error: 'Token inválido' });
  }
});

// Obtener sesiones activas del usuario
router.get('/sessions', authenticateToken, async (req, res) => {
  try {
    const sessionsResult = await getUserActiveSessions(req.user.userId);
    
    if (sessionsResult.success) {
      res.json({
        activeSessions: sessionsResult.sessions.map(session => ({
          sessionId: session.session_id,
          loginTime: session.login_time,
          lastActivity: session.last_activity,
          ipAddress: session.ip_address,
          deviceInfo: session.device_info,
          idleTime: session.idle_time,
          sessionAge: session.session_age
        }))
      });
    } else {
      res.status(500).json({
        error: 'Error obteniendo sesiones',
        details: process.env.NODE_ENV === 'development' ? sessionsResult.error : undefined
      });
    }

  } catch (error) {
    console.error('Error obteniendo sesiones:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Obtener estadísticas de sesiones del usuario
router.get('/sessions/stats', authenticateToken, async (req, res) => {
  try {
    const statsResult = await getUserSessionStats(req.user.userId);
    
    if (statsResult.success) {
      res.json({
        stats: statsResult.stats
      });
    } else {
      res.status(500).json({
        error: 'Error obteniendo estadísticas',
        details: process.env.NODE_ENV === 'development' ? statsResult.error : undefined
      });
    }

  } catch (error) {
    console.error('Error obteniendo estadísticas de sesión:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Cerrar todas las sesiones del usuario (logout forzado)
router.post('/sessions/logout-all', authenticateToken, async (req, res) => {
  try {
    const { reason = 'user_requested' } = req.body;
    
    const result = await forceLogoutAllSessions(req.user.userId, reason);
    
    if (result.success) {
      res.json({
        message: 'Todas las sesiones han sido cerradas',
        closedSessions: result.closedSessions
      });
    } else {
      res.status(500).json({
        error: 'Error cerrando sesiones',
        details: process.env.NODE_ENV === 'development' ? result.error : undefined
      });
    }

  } catch (error) {
    console.error('Error cerrando todas las sesiones:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Obtener historial de sesiones (últimos 30 días)
router.get('/sessions/history', authenticateToken, async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    
    const result = await pool.query(`
      SELECT 
        session_id,
        login_time,
        logout_time,
        session_duration,
        ip_address,
        device_info->>'userAgent' as user_agent_info,
        logout_type,
        is_active,
        EXTRACT(EPOCH FROM session_duration) as duration_seconds
      FROM app.user_sessions
      WHERE user_id = $1
        AND login_time >= CURRENT_DATE - INTERVAL '30 days'
      ORDER BY login_time DESC
      LIMIT $2 OFFSET $3
    `, [req.user.userId, parseInt(limit), parseInt(offset)]);

    const countResult = await pool.query(`
      SELECT COUNT(*) as total
      FROM app.user_sessions
      WHERE user_id = $1
        AND login_time >= CURRENT_DATE - INTERVAL '30 days'
    `, [req.user.userId]);

    res.json({
      sessions: result.rows,
      pagination: {
        total: parseInt(countResult.rows[0].total),
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: parseInt(offset) + result.rows.length < parseInt(countResult.rows[0].total)
      }
    });

  } catch (error) {
    console.error('Error obteniendo historial de sesiones:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router;
