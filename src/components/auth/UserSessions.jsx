import React, { useState, useEffect, useCallback } from 'react';
import { Monitor, Smartphone, Globe, LogOut, Shield, Clock, AlertCircle, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';
import { useUserSessions } from '../../hooks/useUserSessions';
import ErrorPopup from '../ui/ErrorPopup';

const UserSessions = () => {
  const [activeTab, setActiveTab] = useState('active');
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [errorPopup, setErrorPopup] = useState({ show: false, message: '', title: '' });

  const {
    // Estado
    activeSessions,
    sessionHistory,
    sessionStats,
    loading,
    error,

    // Acciones
    loadActiveSessions,
    loadSessionHistory,
    loadSessionStats,
    logoutAllSessions,
    clearState,

    // Utilidades
    formatDuration,
    getDeviceInfo,
    getDeviceType,
    getLogoutTypeLabel,

    // Estado derivado
    hasActiveSessions,
    hasMultipleSessions
  } = useUserSessions();

  // Cargar datos según pestaña activa
  const loadSessionData = useCallback(async () => {
    try {
      if (activeTab === 'active') {
        await loadActiveSessions();
      } else if (activeTab === 'history') {
        await loadSessionHistory();
      } else if (activeTab === 'stats') {
        await loadSessionStats();
      }
    } catch (error) {
      setErrorPopup({
        show: true,
        title: 'Error cargando datos',
        message: error.message || 'No se pudieron cargar los datos de sesiones.'
      });
    }
  }, [activeTab, loadActiveSessions, loadSessionHistory, loadSessionStats]);

  // Cargar datos cuando cambia la pestaña
  useEffect(() => {
    loadSessionData();
  }, [loadSessionData]);

  // Limpiar estado al desmontar
  useEffect(() => {
    return () => clearState();
  }, [clearState]);

  // Mostrar errores en popup
  useEffect(() => {
    if (error) {
      setErrorPopup({
        show: true,
        title: 'Error',
        message: error
      });
    }
  }, [error]);

  // Manejar logout de todas las sesiones con confirmación
  const handleLogoutAll = async () => {
    if (!confirmLogout) {
      setConfirmLogout(true);
      return;
    }

    try {
      await logoutAllSessions();
      setConfirmLogout(false);
    } catch (error) {
      setErrorPopup({
        show: true,
        title: 'Error cerrando sesiones',
        message: error.message || 'No se pudieron cerrar las sesiones activas.'
      });
      setConfirmLogout(false);
    }
  };

  // Cancelar confirmación de logout
  const cancelLogout = () => {
    setConfirmLogout(false);
  };

  // Obtener icono de dispositivo usando el hook
  const getDeviceIcon = (deviceInfo) => {
    const deviceType = getDeviceType(deviceInfo);
    return deviceType === 'mobile'
      ? <Smartphone className="h-4 w-4" />
      : <Monitor className="h-4 w-4" />;
  };

  // Recargar datos manualmente
  const handleRefresh = () => {
    loadSessionData();
  };

  // Renderizar pestañas con tema oscuro
  const renderTabs = () => (
    <div className="flex space-x-1 bg-gray-800 rounded-lg p-1 mb-6">
      {[
        { key: 'active', label: 'Sesiones Activas', count: activeSessions.length },
        { key: 'history', label: 'Historial', count: sessionHistory.length },
        { key: 'stats', label: 'Estadísticas' }
      ].map(tab => (
        <button
          key={tab.key}
          onClick={() => setActiveTab(tab.key)}
          className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === tab.key
              ? 'bg-yellow-400 text-gray-900 shadow-sm'
              : 'text-gray-300 hover:text-yellow-300'
          }`}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span className="ml-2 bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full text-xs">
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );

  // Renderizar sesiones activas
  const renderActiveSessions = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-100">Sesiones Activas</h3>
        <div className="flex gap-2">
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="flex items-center px-3 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>

          {hasMultipleSessions && (
            <button
              onClick={handleLogoutAll}
              className={`flex items-center px-4 py-2 rounded-lg transition-colors ${
                confirmLogout
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'bg-red-600 text-white hover:bg-red-700'
              }`}
            >
              <LogOut className="h-4 w-4 mr-2" />
              {confirmLogout ? '¿Confirmar?' : 'Cerrar Todas'}
            </button>
          )}

          {confirmLogout && (
            <button
              onClick={cancelLogout}
              className="flex items-center px-3 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors"
            >
              Cancelar
            </button>
          )}
        </div>
      </div>

      {!hasActiveSessions ? (
        <div className="text-center py-8 text-gray-400">
          <Monitor className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No hay sesiones activas</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {activeSessions.map((session, index) => (
            <motion.div
              key={session.sessionId}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="bg-gray-800 border border-gray-700 rounded-lg p-4"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-3">
                  <div className="p-2 bg-yellow-400/20 rounded-lg">
                    {getDeviceIcon(session.deviceInfo)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-100">
                      {getDeviceInfo(session.deviceInfo)}
                    </p>
                    <div className="flex items-center space-x-4 mt-2 text-xs text-gray-400">
                      <div className="flex items-center">
                        <Globe className="h-3 w-3 mr-1" />
                        {session.ipAddress}
                      </div>
                      <div className="flex items-center">
                        <Clock className="h-3 w-3 mr-1" />
                        Desde: {new Date(session.loginTime).toLocaleString()}
                      </div>
                    </div>
                    <div className="mt-1 text-xs text-gray-400">
                      Última actividad: {new Date(session.lastActivity).toLocaleString()}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-400/20 text-green-400">
                    <div className="w-1.5 h-1.5 bg-green-400 rounded-full mr-1.5"></div>
                    Activa
                  </span>
                  <p className="text-xs text-gray-400 mt-1">
                    Duración: {formatDuration(session.sessionAge)}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );

  // Renderizar historial
  const renderHistory = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-100">Historial de Sesiones</h3>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="flex items-center px-3 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      {sessionHistory.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No hay historial disponible</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessionHistory.map((session, index) => (
            <motion.div
              key={session.sessionId}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="bg-gray-800 border border-gray-700 rounded-lg p-4"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-3">
                  <div className="p-2 bg-gray-700 rounded-lg">
                    {getDeviceIcon(session.deviceInfo)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center space-x-4 text-sm">
                      <div className="flex items-center text-gray-300">
                        <Globe className="h-3 w-3 mr-1" />
                        {session.ipAddress}
                      </div>
                      <div className="flex items-center text-gray-300">
                        <Clock className="h-3 w-3 mr-1" />
                        {new Date(session.loginTime).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      {session.loginTime && `Login: ${new Date(session.loginTime).toLocaleTimeString()}`}
                      {session.logoutTime && ` - Logout: ${new Date(session.logoutTime).toLocaleTimeString()}`}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                    session.isActive
                      ? 'bg-green-400/20 text-green-400'
                      : 'bg-gray-600/50 text-gray-300'
                  }`}>
                    {session.isActive ? 'Activa' : getLogoutTypeLabel(session.logoutType)}
                  </span>
                  {session.durationSeconds && (
                    <p className="text-xs text-gray-400 mt-1">
                      {formatDuration(session.durationSeconds)}
                    </p>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );

  // Renderizar estadísticas
  const renderStats = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-100">Estadísticas de Sesiones</h3>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="flex items-center px-3 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      {loading && !sessionStats ? (
        <div className="text-center py-8 text-gray-400">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-400 mx-auto mb-4"></div>
          <p>Cargando estadísticas...</p>
        </div>
      ) : sessionStats ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid md:grid-cols-2 gap-6"
        >
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
            <h4 className="text-sm font-medium text-gray-100 mb-4">Resumen General</h4>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-400">Total de sesiones:</span>
                <span className="font-medium text-yellow-400">{sessionStats.total_sessions || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Sesiones activas:</span>
                <span className="font-medium text-green-400">{sessionStats.active_sessions || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">IPs únicas:</span>
                <span className="font-medium text-gray-100">{sessionStats.unique_ips || 0}</span>
              </div>
            </div>
          </div>

          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
            <h4 className="text-sm font-medium text-gray-100 mb-4">Actividad</h4>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-400">Último login:</span>
                <span className="font-medium text-gray-100 text-right max-w-[150px] truncate">
                  {sessionStats.last_login ? new Date(sessionStats.last_login).toLocaleString() : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Duración promedio:</span>
                <span className="font-medium text-gray-100">
                  {sessionStats.avg_session_duration ? formatDuration(sessionStats.avg_session_duration) : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Dispositivo preferido:</span>
                <span className="font-medium text-gray-100">{sessionStats.most_used_device || 'N/A'}</span>
              </div>
            </div>
          </div>
        </motion.div>
      ) : (
        <div className="text-center py-8 text-gray-400">
          <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No hay estadísticas disponibles</p>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-900">
      <div className="max-w-4xl mx-auto p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h2 className="text-2xl font-bold text-gray-100 mb-2">Gestión de Sesiones</h2>
          <p className="text-gray-400">Administra tus sesiones activas y revisa tu historial de acceso</p>
        </motion.div>

        {renderTabs()}

        {loading && !activeSessions.length && !sessionHistory.length && !sessionStats ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-400 mx-auto mb-4"></div>
            <p className="text-gray-400">Cargando...</p>
          </div>
        ) : (
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
          >
            {activeTab === 'active' && renderActiveSessions()}
            {activeTab === 'history' && renderHistory()}
            {activeTab === 'stats' && renderStats()}
          </motion.div>
        )}

        {/* Error Popup */}
        <ErrorPopup
          show={errorPopup.show}
          title={errorPopup.title}
          message={errorPopup.message}
          onClose={() => setErrorPopup({ show: false, message: '', title: '' })}
        />
      </div>
    </div>
  );
};

export default UserSessions;