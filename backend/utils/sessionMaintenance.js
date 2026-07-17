// ==========================================================================
// SESSION MAINTENANCE SCHEDULER
// Sistema de mantenimiento automático para sesiones de usuario
// ==========================================================================

import cron from 'node-cron';
import { performSessionCleanup } from './sessionUtils.js';
import { pool } from '../db.js';
import { withAdvisoryLock, LOCK_KEYS } from './advisoryLock.js';

// ==========================================================================
// CONFIGURACIÓN DE MANTENIMIENTO
// ==========================================================================

const MAINTENANCE_CONFIG = {
    // Ejecutar limpieza cada 4 horas
    cleanupSchedule: '0 */4 * * *',
    
    // Ejecutar estadísticas diarias a las 2 AM
    statsSchedule: '0 2 * * *',
    
    // Configuraciones de timeouts
    inactiveSessionTimeout: '24 hours',
    oldSessionRetention: '90 days'
};

// ==========================================================================
// FUNCIONES DE MANTENIMIENTO
// ==========================================================================

/**
 * Función principal de mantenimiento de sesiones
 */
async function runSessionMaintenance() {
    console.log('[SessionMaintenance] Iniciando mantenimiento de sesiones...');
    
    try {
        const result = await performSessionCleanup();
        
        if (result.success) {
            console.log('[SessionMaintenance] Completado:', result.result);
        } else {
            console.error('[SessionMaintenance] Error:', result.error);
        }
        
        // Generar estadísticas de resumen
        await generateMaintenanceSummary();
        
    } catch (error) {
        console.error('[SessionMaintenance] Error crítico en mantenimiento:', error);
    }
}

/**
 * Generar resumen estadístico después del mantenimiento
 */
async function generateMaintenanceSummary() {
    try {
        const summaryResult = await pool.query(`
            SELECT
                COUNT(*) FILTER (WHERE is_active = TRUE) as active_sessions,
                COUNT(*) FILTER (WHERE is_active = FALSE) as inactive_sessions,
                COUNT(DISTINCT user_id) as unique_active_users,
                COUNT(*) FILTER (WHERE login_time >= CURRENT_DATE) as today_logins,
                COUNT(*) FILTER (WHERE logout_time >= CURRENT_DATE AND logout_type = 'timeout') as timeout_logouts,
                AVG(EXTRACT(EPOCH FROM (COALESCE(logout_time, last_activity, CURRENT_TIMESTAMP) - login_time)))
                    FILTER (WHERE login_time IS NOT NULL) as avg_session_duration_seconds
            FROM app.user_sessions
            WHERE login_time >= CURRENT_DATE - INTERVAL '1 day'
        `);
        
        const stats = summaryResult.rows[0];
        
        console.log('[SessionMaintenance] Estadísticas del día:');
        console.log(`  - Sesiones activas: ${stats.active_sessions}`);
        console.log(`  - Sesiones inactivas: ${stats.inactive_sessions}`);
        console.log(`  - Usuarios únicos activos: ${stats.unique_active_users}`);
        console.log(`  - Logins hoy: ${stats.today_logins}`);
        console.log(`  - Timeouts hoy: ${stats.timeout_logouts}`);
        console.log(`  - Duración promedio de sesión: ${Math.round(stats.avg_session_duration_seconds / 60)} minutos`);
        
    } catch (error) {
        console.error('[SessionMaintenance] Error generando resumen:', error);
    }
}

/**
 * Función para generar reporte de estadísticas detallado
 */
async function generateDailyStatsReport() {
    console.log('[SessionMaintenance] Generando reporte de estadísticas diarias...');
    
    try {
        // Estadísticas generales
        const generalStats = await pool.query(`
            SELECT
                DATE(login_time) as date,
                COUNT(*) as total_logins,
                COUNT(DISTINCT user_id) as unique_users,
                COUNT(DISTINCT ip_address) as unique_ips,
                AVG(EXTRACT(EPOCH FROM (COALESCE(logout_time, last_activity, CURRENT_TIMESTAMP) - login_time))) as avg_session_seconds,
                COUNT(*) FILTER (WHERE logout_type = 'manual') as manual_logouts,
                COUNT(*) FILTER (WHERE logout_type = 'timeout') as timeout_logouts,
                COUNT(*) FILTER (WHERE logout_type = 'forced') as forced_logouts
            FROM app.user_sessions
            WHERE login_time >= CURRENT_DATE - INTERVAL '7 days'
            GROUP BY DATE(login_time)
            ORDER BY date DESC
        `);
        
        // Top usuarios más activos
        const topUsers = await pool.query(`
            SELECT
                u.email,
                COUNT(us.session_id) as session_count,
                MAX(us.login_time) as last_login,
                AVG(EXTRACT(EPOCH FROM (COALESCE(us.logout_time, us.last_activity, CURRENT_TIMESTAMP) - us.login_time))) as avg_session_seconds
            FROM app.user_sessions us
            JOIN app.users u ON us.user_id = u.id
            WHERE us.login_time >= CURRENT_DATE - INTERVAL '7 days'
            GROUP BY u.id, u.email
            ORDER BY session_count DESC
            LIMIT 10
        `);
        
        // Dispositivos más utilizados
        const topDevices = await pool.query(`
            SELECT 
                device_info->>'userAgent'->>'platform' as platform,
                device_info->>'userAgent'->>'browser' as browser,
                COUNT(*) as usage_count
            FROM app.user_sessions
            WHERE login_time >= CURRENT_DATE - INTERVAL '7 days'
              AND device_info IS NOT NULL
            GROUP BY device_info->>'userAgent'->>'platform', device_info->>'userAgent'->>'browser'
            ORDER BY usage_count DESC
            LIMIT 5
        `);
        
        console.log('[SessionMaintenance] Reporte de la última semana:');
        console.log('\n=== ESTADÍSTICAS GENERALES ===');
        generalStats.rows.forEach(day => {
            console.log(`${day.date}: ${day.total_logins} logins, ${day.unique_users} usuarios únicos, ${day.unique_ips} IPs únicas`);
        });
        
        console.log('\n=== TOP USUARIOS ACTIVOS ===');
        topUsers.rows.forEach((user, index) => {
            console.log(`${index + 1}. ${user.email}: ${user.session_count} sesiones, último login: ${user.last_login}`);
        });
        
        console.log('\n=== DISPOSITIVOS MÁS UTILIZADOS ===');
        topDevices.rows.forEach((device, index) => {
            console.log(`${index + 1}. ${device.platform || 'unknown'} / ${device.browser || 'unknown'}: ${device.usage_count} usos`);
        });
        
    } catch (error) {
        console.error('[SessionMaintenance] Error generando reporte diario:', error);
    }
}

/**
 * Función para detectar patrones sospechosos
 */
async function detectSuspiciousActivity() {
    console.log('[SessionMaintenance] Detectando actividad sospechosa...');
    
    try {
        // Detectar múltiples logins desde IPs diferentes en corto tiempo
        const suspiciousLogins = await pool.query(`
            SELECT 
                user_id,
                COUNT(DISTINCT ip_address) as unique_ips,
                COUNT(*) as login_count,
                MIN(login_time) as first_login,
                MAX(login_time) as last_login
            FROM app.user_sessions
            WHERE login_time >= CURRENT_TIMESTAMP - INTERVAL '1 hour'
            GROUP BY user_id
            HAVING COUNT(DISTINCT ip_address) > 3 OR COUNT(*) > 10
            ORDER BY unique_ips DESC, login_count DESC
        `);
        
        if (suspiciousLogins.rows.length > 0) {
            console.log('[SessionMaintenance] ⚠️  ACTIVIDAD SOSPECHOSA DETECTADA:');
            suspiciousLogins.rows.forEach(user => {
                console.log(`  Usuario ID ${user.user_id}: ${user.login_count} logins desde ${user.unique_ips} IPs diferentes en la última hora`);
            });
        }
        
        // Detectar sesiones de muy larga duración (posibles cuentas comprometidas)
        const longSessions = await pool.query(`
            SELECT 
                user_id,
                session_id,
                login_time,
                last_activity,
                (CURRENT_TIMESTAMP - login_time) as session_age,
                ip_address
            FROM app.user_sessions
            WHERE is_active = TRUE
              AND (CURRENT_TIMESTAMP - login_time) > INTERVAL '7 days'
            ORDER BY session_age DESC
        `);
        
        if (longSessions.rows.length > 0) {
            console.log('[SessionMaintenance] ⏰ SESIONES DE LARGA DURACIÓN:');
            longSessions.rows.forEach(session => {
                console.log(`  Usuario ID ${session.user_id}: Sesión activa desde hace ${session.session_age} (IP: ${session.ip_address})`);
            });
        }
        
    } catch (error) {
        console.error('[SessionMaintenance] Error detectando actividad sospechosa:', error);
    }
}

// ==========================================================================
// INICIALIZACIÓN DE SCHEDULERS
// ==========================================================================

/**
 * Inicializa todos los schedulers de mantenimiento
 */
export function initializeSessionMaintenance() {
    console.log('[SessionMaintenance] Inicializando sistema de mantenimiento...');
    
    // Scheduler principal de limpieza (cada 4 horas)
    // OPS-001: advisory lock -> con varias instancias solo una limpia.
    cron.schedule(MAINTENANCE_CONFIG.cleanupSchedule, () => {
        console.log('[SessionMaintenance] Ejecutando limpieza automática...');
        withAdvisoryLock(LOCK_KEYS.sessionMaintenance, 'sessionMaintenance', runSessionMaintenance);
    }, {
        scheduled: true,
        timezone: "Europe/Madrid"
    });

    // Scheduler de estadísticas diarias (2 AM todos los días)
    // OPS-001: advisory lock -> con varias instancias solo una genera el reporte.
    cron.schedule(MAINTENANCE_CONFIG.statsSchedule, () => {
        console.log('[SessionMaintenance] Generando reporte diario...');
        withAdvisoryLock(LOCK_KEYS.sessionMaintenanceStats, 'sessionMaintenanceStats', async () => {
            await generateDailyStatsReport();
            await detectSuspiciousActivity();
        });
    }, {
        scheduled: true,
        timezone: "Europe/Madrid"
    });
    
    console.log('[SessionMaintenance] Schedulers configurados:');
    console.log(`  - Limpieza automática: ${MAINTENANCE_CONFIG.cleanupSchedule}`);
    console.log(`  - Reporte diario: ${MAINTENANCE_CONFIG.statsSchedule}`);
    
    // Ejecutar una limpieza inicial al arrancar
    // OPS-001: guardada con advisory lock -> evita N limpiezas al arranque de N réplicas.
    setTimeout(() => {
        console.log('[SessionMaintenance] Ejecutando limpieza inicial...');
        withAdvisoryLock(LOCK_KEYS.sessionMaintenance, 'sessionMaintenance', runSessionMaintenance);
    }, 30000); // 30 segundos después del inicio
}

/**
 * Función manual para ejecutar mantenimiento
 */
export async function runManualMaintenance() {
    console.log('[SessionMaintenance] Ejecutando mantenimiento manual...');
    await runSessionMaintenance();
    await generateDailyStatsReport();
    await detectSuspiciousActivity();
}

// ==========================================================================
// FUNCIONES DE MONITOREO
// ==========================================================================

/**
 * Obtener estado actual del sistema de sesiones
 */
export async function getSessionSystemStatus() {
    try {
        const statusResult = await pool.query(`
            SELECT 
                COUNT(*) as total_sessions,
                COUNT(*) FILTER (WHERE is_active = TRUE) as active_sessions,
                COUNT(DISTINCT user_id) FILTER (WHERE is_active = TRUE) as active_users,
                COUNT(*) FILTER (WHERE login_time >= CURRENT_DATE) as today_logins,
                COUNT(*) FILTER (WHERE logout_time >= CURRENT_DATE) as today_logouts
            FROM app.user_sessions
        `);
        
        const recentActivity = await pool.query(`
            SELECT 
                COUNT(*) as logins_last_hour
            FROM app.user_sessions
            WHERE login_time >= CURRENT_TIMESTAMP - INTERVAL '1 hour'
        `);
        
        return {
            success: true,
            status: {
                ...statusResult.rows[0],
                logins_last_hour: recentActivity.rows[0].logins_last_hour,
                last_maintenance: new Date().toISOString()
            }
        };
        
    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
}

// ==========================================================================
// EXPORT
// ==========================================================================

export default {
    initializeSessionMaintenance,
    runManualMaintenance,
    getSessionSystemStatus,
    runSessionMaintenance,
    generateDailyStatsReport,
    detectSuspiciousActivity
};