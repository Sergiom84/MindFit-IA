// ==========================================================================
// SESSION UTILITIES
// Utilidades para manejo de sesiones de usuario y device info
// ==========================================================================

import crypto from 'crypto';
import { pool } from '../db.js';

// ==========================================================================
// FUNCIONES DE PARSING DE DEVICE INFO
// ==========================================================================

/**
 * Extrae información detallada del user-agent
 */
export function parseUserAgent(userAgent) {
    if (!userAgent) {
        return {
            browser: 'unknown',
            version: 'unknown',
            platform: 'unknown',
            mobile: false,
            raw: ''
        };
    }

    const ua = userAgent.toLowerCase();
    
    // Detectar navegador
    let browser = 'unknown';
    let version = 'unknown';
    
    if (ua.includes('chrome')) {
        browser = 'chrome';
        const match = ua.match(/chrome\/(\d+)/);
        version = match ? match[1] : 'unknown';
    } else if (ua.includes('firefox')) {
        browser = 'firefox';
        const match = ua.match(/firefox\/(\d+)/);
        version = match ? match[1] : 'unknown';
    } else if (ua.includes('safari') && !ua.includes('chrome')) {
        browser = 'safari';
        const match = ua.match(/version\/(\d+)/);
        version = match ? match[1] : 'unknown';
    } else if (ua.includes('edge')) {
        browser = 'edge';
        const match = ua.match(/edge\/(\d+)/);
        version = match ? match[1] : 'unknown';
    }
    
    // Detectar plataforma
    let platform = 'unknown';
    if (ua.includes('windows')) platform = 'windows';
    else if (ua.includes('mac')) platform = 'macos';
    else if (ua.includes('linux')) platform = 'linux';
    else if (ua.includes('android')) platform = 'android';
    else if (ua.includes('iphone') || ua.includes('ipad')) platform = 'ios';
    
    // Detectar si es móvil
    const mobile = /mobile|android|iphone|ipad|phone/i.test(userAgent);
    
    return {
        browser,
        version,
        platform,
        mobile,
        raw: userAgent
    };
}

/**
 * Extrae información de la IP
 */
export function parseIPInfo(ip) {
    const result = {
        ip: ip || 'unknown',
        type: 'unknown',
        local: false
    };
    
    if (!ip) return result;
    
    // Detectar tipo de IP
    if (ip.includes(':')) {
        result.type = 'ipv6';
    } else if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
        result.type = 'ipv4';
    }
    
    // Detectar IP local
    const localPatterns = [
        /^127\./,           // localhost
        /^192\.168\./,      // private
        /^10\./,            // private
        /^172\.(1[6-9]|2\d|3[0-1])\./,  // private
        /^::1$/,            // IPv6 localhost
        /^fc00:/,           // IPv6 private
        /^fe80:/            // IPv6 link-local
    ];
    
    result.local = localPatterns.some(pattern => pattern.test(ip));
    
    return result;
}

/**
 * Construye el objeto device_info completo
 */
export function buildDeviceInfo(req) {
    const userAgent = req.headers['user-agent'] || '';
    const forwarded = req.headers['x-forwarded-for'] || 
                     req.headers['x-real-ip'] || 
                     req.connection?.remoteAddress || 
                     req.socket?.remoteAddress || 
                     req.ip || 
                     'unknown';
    
    // Obtener la primera IP si hay múltiples
    const clientIP = forwarded.split(',')[0].trim();
    
    const uaInfo = parseUserAgent(userAgent);
    const ipInfo = parseIPInfo(clientIP, req);
    
    return {
        userAgent: uaInfo,
        network: ipInfo,
        headers: {
            acceptLanguage: req.headers['accept-language'] || 'unknown',
            acceptEncoding: req.headers['accept-encoding'] || 'unknown',
            connection: req.headers['connection'] || 'unknown'
        },
        timestamp: new Date().toISOString(),
        timezone: req.headers['timezone'] || null
    };
}

// ==========================================================================
// FUNCIONES DE GESTIÓN DE SESIONES
// ==========================================================================

/**
 * Crea un hash del JWT token para tracking
 */
export function hashJWTToken(token) {
    return crypto
        .createHash('sha256')
        .update(token)
        .digest('hex');
}

/**
 * Registra una nueva sesión de login.
 *
 * AUTH-001 (PR 3): `sessionFields` opcional permite fijar el session_id (para ligarlo
 * como `jti` del access token) y guardar el refresh token rotatorio (solo su hash):
 *   { sessionId, refreshTokenHash, refreshExpiresAt, jwtExpiresAt }
 * Si no se pasan, se conserva el comportamiento legacy (session_id por defecto de la BD,
 * sin refresh, expiración a 7 días).
 */
export async function logUserLogin(userId, token, req, additionalMetadata = {}, sessionFields = {}) {
    try {
        const deviceInfo = buildDeviceInfo(req);
        const tokenHash = hashJWTToken(token);

        // Extraer IP para almacenamiento directo
        const clientIP = (req.headers['x-forwarded-for'] ||
                         req.headers['x-real-ip'] ||
                         req.connection?.remoteAddress ||
                         req.socket?.remoteAddress ||
                         req.ip ||
                         'unknown').split(',')[0].trim();

        // Expiración del access token: la que indique el llamador (deriva de ACCESS_TOKEN_TTL)
        // o el legacy de 7 días.
        const jwtExpiresAt = sessionFields.jwtExpiresAt
            || new Date(Date.now() + (7 * 24 * 60 * 60 * 1000));

        const sessionMetadata = {
            ...additionalMetadata,
            loginMethod: 'password',
            source: 'web-app'
        };

        // Columnas base + (opcional) session_id explícito y refresh rotatorio.
        const cols = ['user_id', 'ip_address', 'user_agent', 'device_info', 'jwt_token_hash', 'jwt_expires_at', 'session_metadata'];
        const vals = [userId, clientIP, req.headers['user-agent'] || 'unknown', JSON.stringify(deviceInfo), tokenHash, jwtExpiresAt, JSON.stringify(sessionMetadata)];
        if (sessionFields.sessionId) { cols.push('session_id'); vals.push(sessionFields.sessionId); }
        if (sessionFields.refreshTokenHash) { cols.push('refresh_token_hash'); vals.push(sessionFields.refreshTokenHash); }
        if (sessionFields.refreshExpiresAt) { cols.push('refresh_expires_at'); vals.push(sessionFields.refreshExpiresAt); }
        const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');

        const result = await pool.query(
            `INSERT INTO app.user_sessions (${cols.join(', ')}) VALUES (${placeholders})
             RETURNING session_id, login_time`,
            vals
        );

        const session = result.rows[0];

        console.log(`Nueva sesión registrada - User: ${userId}, Session: ${session.session_id}, IP: ${clientIP}`);

        return {
            success: true,
            sessionId: session.session_id,
            loginTime: session.login_time
        };

    } catch (error) {
        console.error('Error registrando sesión de login:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Registra un logout de usuario
 */
export async function logUserLogout(userId, token, logoutType = 'manual', additionalInfo = {}) {
    try {
        const tokenHash = hashJWTToken(token);
        
        const result = await pool.query(`
            UPDATE app.user_sessions 
            SET 
                logout_time = CURRENT_TIMESTAMP,
                is_active = FALSE,
                logout_type = $3,
                session_metadata = session_metadata || $4,
                updated_at = CURRENT_TIMESTAMP
            WHERE user_id = $1 
              AND jwt_token_hash = $2 
              AND is_active = TRUE
            RETURNING session_id, login_time, logout_time, session_duration
        `, [
            userId,
            tokenHash,
            logoutType,
            JSON.stringify(additionalInfo)
        ]);
        
        if (result.rows.length > 0) {
            const session = result.rows[0];
            console.log(`Logout registrado - User: ${userId}, Session: ${session.session_id}, Duración: ${session.session_duration}`);
            
            return {
                success: true,
                sessionId: session.session_id,
                duration: session.session_duration
            };
        } else {
            console.warn(`No se encontró sesión activa para logout - User: ${userId}`);
            return {
                success: false,
                error: 'No se encontró sesión activa'
            };
        }
        
    } catch (error) {
        console.error('Error registrando logout:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Actualiza la última actividad de una sesión
 */
export async function updateSessionActivity(userId, token) {
    try {
        const tokenHash = hashJWTToken(token);
        
        await pool.query(`
            UPDATE app.user_sessions 
            SET last_activity = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE user_id = $1 
              AND jwt_token_hash = $2 
              AND is_active = TRUE
        `, [userId, tokenHash]);
        
    } catch (error) {
        console.error('Error actualizando actividad de sesión:', error);
    }
}

/**
 * Cierra todas las sesiones activas de un usuario (útil para logout forzado)
 */
export async function forceLogoutAllSessions(userId, reason = 'forced_by_admin') {
    try {
        const result = await pool.query(`
            UPDATE app.user_sessions 
            SET 
                logout_time = CURRENT_TIMESTAMP,
                is_active = FALSE,
                logout_type = 'forced',
                session_metadata = session_metadata || $2,
                updated_at = CURRENT_TIMESTAMP
            WHERE user_id = $1 AND is_active = TRUE
            RETURNING session_id
        `, [userId, JSON.stringify({ reason })]);
        
        console.log(`Forzado logout de ${result.rows.length} sesiones para usuario ${userId}`);
        
        return {
            success: true,
            closedSessions: result.rows.length
        };
        
    } catch (error) {
        console.error('Error forzando logout de sesiones:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Obtiene las sesiones activas de un usuario
 */
export async function getUserActiveSessions(userId) {
    try {
        const result = await pool.query(`
            SELECT 
                session_id,
                login_time,
                last_activity,
                ip_address,
                device_info,
                (CURRENT_TIMESTAMP - last_activity) as idle_time,
                (CURRENT_TIMESTAMP - login_time) as session_age
            FROM app.user_sessions
            WHERE user_id = $1 AND is_active = TRUE
            ORDER BY last_activity DESC
        `, [userId]);
        
        return {
            success: true,
            sessions: result.rows
        };
        
    } catch (error) {
        console.error('Error obteniendo sesiones activas:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Obtiene estadísticas de sesión para un usuario
 */
export async function getUserSessionStats(userId) {
    try {
        const result = await pool.query(`
            SELECT * FROM app.get_user_session_stats($1)
        `, [userId]);
        
        return {
            success: true,
            stats: result.rows[0] || null
        };
        
    } catch (error) {
        console.error('Error obteniendo estadísticas de sesión:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

// ==========================================================================
// MIDDLEWARE FUNCTIONS
// ==========================================================================

/**
 * Middleware para actualizar automáticamente la actividad de sesión
 */
export function sessionActivityMiddleware(req, res, next) {
    // Solo aplicar si hay token de autorización
    const token = req.headers.authorization?.split(' ')[1];
    if (token && req.user && req.user.userId) {
        // Actualizar en background, no bloquear la request
        updateSessionActivity(req.user.userId, token).catch(err => {
            console.error('Error en sessionActivityMiddleware:', err);
        });
    }
    next();
}

/**
 * Función para ejecutar limpieza automática de sesiones
 */
export async function performSessionCleanup() {
    try {
        const result = await pool.query(`SELECT app.session_maintenance()`);
        const maintenanceResult = result.rows[0]?.session_maintenance || 'No result';
        
        console.log('Session maintenance executed:', maintenanceResult);
        return { success: true, result: maintenanceResult };
        
    } catch (error) {
        console.error('Error en mantenimiento de sesiones:', error);
        return { success: false, error: error.message };
    }
}

// ==========================================================================
// EXPORT DEFAULT
// ==========================================================================

export default {
    parseUserAgent,
    parseIPInfo,
    buildDeviceInfo,
    hashJWTToken,
    logUserLogin,
    logUserLogout,
    updateSessionActivity,
    forceLogoutAllSessions,
    getUserActiveSessions,
    getUserSessionStats,
    sessionActivityMiddleware,
    performSessionCleanup
};