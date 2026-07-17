/**
 * CycleStatusBadge - Badge de estado del ciclo D1-D5 MindFeed
 *
 * Muestra:
 * - Día actual del ciclo (D1-D5)
 * - Microciclos completados
 * - Estado de deload
 * - Próxima sesión
 * - Prioridad muscular activa (FASE 2 Módulo 4)
 *
 * @version 1.1.0 - MindFeed Integration + Prioridad Muscular
 */

import React, { useEffect, useState } from 'react';
import { TrendingUp, AlertCircle, CheckCircle, Loader, Target } from 'lucide-react';
import tokenManager from '../../../../../utils/tokenManager';

export default function CycleStatusBadge({ userId, methodologyPlanId, className = '' }) {
  const [cycleState, setCycleState] = useState(null);
  const [priorityState, setPriorityState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    const fetchCycleStatus = async () => {
      try {
        setLoading(true);
        const token = tokenManager.getToken();

        // Fetch cycle status
        const cycleResponse = await fetch(
          `${import.meta.env.VITE_API_URL || 'http://localhost:3010'}/api/hipertrofiav2/cycle-status/${userId}`,
          {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          }
        );

        if (cycleResponse.ok) {
          const data = await cycleResponse.json();
          setCycleState(data.cycleState);
          setError(null);
          console.log('🔄 [BADGE] Estado de ciclo cargado:', data.cycleState);
        } else if (cycleResponse.status === 404) {
          // Usuario sin estado de ciclo (no tiene plan HipertrofiaV2 activo)
          setCycleState(null);
          setError(null);
        } else {
          throw new Error('Error cargando estado del ciclo');
        }

        // 🎯 FASE 2: Fetch priority status
        try {
          const priorityResponse = await fetch(
            `${import.meta.env.VITE_API_URL || 'http://localhost:3010'}/api/hipertrofiav2/priority-status/${userId}`,
            {
              headers: {
                'Authorization': `Bearer ${token}`
              }
            }
          );

          if (priorityResponse.ok) {
            const priorityData = await priorityResponse.json();
            if (priorityData.success && priorityData.priority) {
              setPriorityState(priorityData.priority);
              console.log('🎯 [BADGE] Prioridad activa:', priorityData.priority);
            } else {
              setPriorityState(null);
            }
          }
        } catch (priorityErr) {
          console.warn('⚠️ [BADGE] Error cargando prioridad (no crítico):', priorityErr);
          setPriorityState(null);
        }
      } catch (err) {
        console.error('❌ [BADGE] Error:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchCycleStatus();
  }, [userId, methodologyPlanId]);

  // No mostrar nada si no hay estado de ciclo
  if (loading) {
    return (
      <div className={`inline-flex items-center gap-2 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg ${className}`}>
        <Loader className="w-4 h-4 animate-spin text-blue-400" />
        <span className="text-sm text-gray-400">Cargando ciclo...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`inline-flex items-center gap-2 px-3 py-2 bg-red-900/20 border border-red-700/50 rounded-lg ${className}`}>
        <AlertCircle className="w-4 h-4 text-red-400" />
        <span className="text-sm text-red-300">Error cargando ciclo</span>
      </div>
    );
  }

  if (!cycleState) {
    // No hay estado de ciclo (usuario no tiene plan HipertrofiaV2 activo)
    return null;
  }

  // Renderizar badge con estado del ciclo
  const { cycle_day, microcycles_completed, next_session, next_session_name, deload_active } = cycleState;

  return (
    <div className={`inline-flex flex-col gap-2 ${className}`}>
      {/* Badge principal: Día del ciclo */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold ${
          deload_active
            ? 'bg-orange-900/30 border border-orange-700/50'
            : 'bg-blue-900/30 border border-blue-700/50'
        }`}>
          <TrendingUp className={`w-5 h-5 ${deload_active ? 'text-orange-400' : 'text-blue-400'}`} />
          <div className="flex flex-col">
            <span className={`text-lg ${deload_active ? 'text-orange-200' : 'text-blue-200'}`}>
              {deload_active ? '⚠️ DELOAD' : `Ciclo ${next_session}`}
            </span>
            <span className="text-xs text-gray-400">
              {next_session_name}
            </span>
          </div>
        </div>

        {/* Badge secundario: Microciclos completados */}
        <div className="inline-flex items-center gap-2 px-3 py-2 bg-green-900/20 border border-green-700/50 rounded-lg">
          <CheckCircle className="w-4 h-4 text-green-400" />
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-green-200">
              {microcycles_completed} microciclos
            </span>
            <span className="text-xs text-gray-400">
              {6 - (microcycles_completed % 6)} para deload
            </span>
          </div>
        </div>

        {/* 🎯 FASE 2: Badge de prioridad muscular */}
        {priorityState && (
          <div className="inline-flex items-center gap-2 px-3 py-2 bg-yellow-900/20 border border-yellow-700/50 rounded-lg">
            <Target className="w-4 h-4 text-yellow-400" />
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-yellow-200">
                🎯 {priorityState.priority_muscle}
              </span>
              <span className="text-xs text-gray-400">
                {priorityState.priority_microcycles_completed || 0} / 3 microciclos
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Mensaje informativo si está en deload */}
      {deload_active && (
        <div className="text-xs text-orange-300 bg-orange-900/10 border border-orange-700/30 rounded px-3 py-2">
          🛡️ Estás en semana de descarga. Cargas reducidas -30%, volumen -50%
        </div>
      )}

      {/* 🎯 FASE 2: Mensaje informativo si hay prioridad activa */}
      {priorityState && (
        <div className="text-xs text-yellow-300 bg-yellow-900/10 border border-yellow-700/30 rounded px-3 py-2">
          🎯 Prioridad activa: +20% volumen, +1 top set/semana para {priorityState.priority_muscle}
        </div>
      )}
    </div>
  );
}
