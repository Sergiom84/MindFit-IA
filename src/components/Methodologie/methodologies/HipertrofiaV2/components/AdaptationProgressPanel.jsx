/**
 * 🎯 Panel de Progreso de Adaptación
 * Muestra estado de los 4 criterios de transición a D1-D5
 *
 * Criterios:
 * 1. Adherencia: ≥80% sesiones (4/5 días)
 * 2. RIR Control: Media ≤4
 * 3. Técnica: <1 flag por semana
 * 4. Progreso: ≥8% incremento de peso
 */

import React, { useEffect, useState } from 'react';
import { Check, X, AlertCircle, TrendingUp, Zap, Target } from 'lucide-react';
import apiClient from '@/lib/apiClient';

export default function AdaptationProgressPanel({ userId, onReadyForTransition, onNeedRepeat }) {
  const [progressData, setProgressData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // 🛡️ GUARD: Si no hay userId, no hacer fetch
    if (!userId) {
      console.warn('⚠️ AdaptationProgressPanel: userId no disponible, saltando fetch');
      setLoading(false);
      setProgressData(null);
      return;
    }

    const fetchProgress = async () => {
      try {
        setLoading(true);
        console.log('📊 AdaptationProgressPanel: Fetching progress for userId:', userId);
        const response = await apiClient.get('/adaptation/progress');

        console.log('📊 Respuesta de /adaptation/progress:', {
          success: response.success,
          hasActiveBlock: response.hasActiveBlock,
          hasLatestCriteria: !!response.latestCriteria,
          weeksCount: response.weeks?.length
        });

        // 🎯 FIX: Validar hasActiveBlock ANTES de guardar datos
        if (response.success && response.hasActiveBlock && response.latestCriteria) {
          setProgressData({
            block: response.block || null,
            weeks: response.weeks || [],
            latestCriteria: response.latestCriteria,
          });
          setError(null);
        } else {
          // No hay bloque activo o datos incompletos → no mostrar panel
          console.log('ℹ️ AdaptationProgressPanel: No hay bloque activo o datos incompletos');
          setProgressData(null);
        }
      } catch (err) {
        console.error('Error fetching adaptation progress:', err);
        setError(err.message);
        setProgressData(null);
      } finally {
        setLoading(false);
      }
    };

    fetchProgress();
  }, [userId]);

  // 🛡️ GUARD: Si no hay userId, no renderizar nada
  if (!userId) {
    return null;
  }

  if (loading) {
    return (
      <div className="bg-gradient-to-br from-blue-900/20 to-purple-900/20 rounded-xl p-6 border border-blue-400/30">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-700 rounded w-1/3 mb-4"></div>
          <div className="grid grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-16 bg-gray-700/50 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // 🎯 FIX: Validación más robusta para evitar crashes
  if (error || !progressData || typeof progressData !== 'object') {
    return null; // Sin error, solo no mostrar si no hay bloque activo
  }

  // 🎯 FIX: Desestructuración segura con valores por defecto
  const { block = null, weeks = [], latestCriteria = null } = progressData || {};

  // Validar que latestCriteria existe y tiene la estructura esperada
  if (!latestCriteria || typeof latestCriteria !== 'object') {
    console.warn('⚠️ latestCriteria ausente o inválido:', { latestCriteria, progressData });
    return null;
  }

  // Validar estructura de latestCriteria
  if (!latestCriteria.adherence || !latestCriteria.rir || !latestCriteria.technique || !latestCriteria.progress) {
    console.warn('⚠️ latestCriteria incompleto:', latestCriteria);
    return null;
  }

  const currentWeek = weeks[weeks.length - 1];
  const totalWeeks = block?.durationWeeks || 4;
  const weeksCompleted = weeks.filter((w) => w.all_criteria_met).length;

  const getWeekProgress = () => {
    const currentWeekNum = weeks.length;
    return {
      current: currentWeekNum,
      total: totalWeeks,
      percentage: (currentWeekNum / totalWeeks) * 100,
    };
  };

  const weekProgress = getWeekProgress();

  const getCriterionColor = (met) => {
    return met ? 'text-green-400' : 'text-red-400';
  };

  const getCriterionBg = (met) => {
    return met
      ? 'bg-green-900/30 border-green-500/50'
      : 'bg-red-900/30 border-red-500/50';
  };

  const CriterionCard = ({ icon: Icon, label, value, met, details }) => (
    <div className={`rounded-lg border p-4 ${getCriterionBg(met)}`}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon className={`w-5 h-5 ${getCriterionColor(met)}`} />
          <span className="font-semibold text-sm text-gray-300">{label}</span>
        </div>
        {met ? (
          <Check className="w-5 h-5 text-green-400" />
        ) : (
          <X className="w-5 h-5 text-red-400" />
        )}
      </div>
      <div className="text-xs text-gray-400">{details}</div>
      {value && <div className="text-sm font-bold text-white mt-1">{value}</div>}
    </div>
  );

  return (
    <div className="space-y-4 mb-6">
      {/* Header con progreso semanal */}
      <div className="bg-gradient-to-r from-yellow-600/20 to-orange-600/20 rounded-xl p-4 border border-yellow-500/30">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-bold text-yellow-200">
              📊 Fase de Adaptación
            </h3>
            <p className="text-sm text-gray-400">
              Semana {weekProgress.current} de {weekProgress.total}
            </p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-yellow-300">
              {weekProgress.percentage.toFixed(0)}%
            </div>
            <div className="text-xs text-gray-400">Progreso</div>
          </div>
        </div>

        {/* Barra de progreso */}
        <div className="w-full bg-gray-800 rounded-full h-2">
          <div
            className="bg-gradient-to-r from-yellow-400 to-orange-400 h-2 rounded-full transition-all duration-300"
            style={{ width: `${weekProgress.percentage}%` }}
          ></div>
        </div>

        {/* Semanas completadas */}
        <div className="text-xs text-gray-400 mt-2">
          ✅ {weeksCompleted} semana(s) con criterios completos
        </div>
      </div>

      {/* Grid de criterios actuales */}
      <div>
        <h4 className="text-sm font-semibold text-gray-300 mb-3">
          Criterios de esta semana:
        </h4>
        <div className="grid grid-cols-2 gap-3">
          <CriterionCard
            icon={Zap}
            label="Adherencia"
            met={latestCriteria.adherence.met}
            value={
              currentWeek
                ? `${(currentWeek.adherence_percentage ?? 0).toFixed(0)}% (${currentWeek.adherence_met ? '✓' : '✗'})`
                : 'N/A'
            }
            details={`Meta: ${latestCriteria.adherence.threshold}% | Umbral: 4/5 sesiones`}
          />

          <CriterionCard
            icon={Target}
            label="RIR Control"
            met={latestCriteria.rir.met}
            value={
              currentWeek
                ? `${currentWeek.mean_rir?.toFixed(1) || 'N/A'}`
                : 'N/A'
            }
            details={`Meta: ≤${latestCriteria.rir.threshold}`}
          />

          <CriterionCard
            icon={AlertCircle}
            label="Técnica"
            met={latestCriteria.technique.met}
            value={
              currentWeek
                ? `${currentWeek.technique_flags_count || 0} flags`
                : 'N/A'
            }
            details={`Meta: <1 problema/semana`}
          />

          <CriterionCard
            icon={TrendingUp}
            label="Progreso Carga"
            met={latestCriteria.progress.met}
            value={
              currentWeek
                ? `${currentWeek.weight_progress_percentage?.toFixed(1) || 0}%`
                : 'N/A'
            }
            details={`Meta: ≥${latestCriteria.progress.threshold}% vs Sem 1`}
          />
        </div>
      </div>

      {/* Estado de transición */}
      <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <AlertCircle className="w-5 h-5 text-blue-400" />
          <span className="font-semibold text-blue-200">Estado de Transición</span>
        </div>

        {latestCriteria.allMet ? (
          <div className="space-y-2">
            <p className="text-sm text-green-300">
              ✅ ¡Felicitaciones! Cumples todos los criterios y estás listo para
              avanzar a D1-D5.
            </p>
            <p className="text-xs text-gray-400">
              Toca el botón "Comenzar D1-D5" para iniciar la siguiente fase.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-yellow-300">
              ⚠️ Aún no cumples todos los criterios. Continúa entrenando.
            </p>
            <div className="text-xs text-gray-400 space-y-1">
              {!latestCriteria.adherence.met && (
                <p>• Necesitas aumentar tu adherencia a sesiones</p>
              )}
              {!latestCriteria.rir.met && (
                <p>• Reduce tu esfuerzo (RIR medio está muy bajo)</p>
              )}
              {!latestCriteria.technique.met && (
                <p>• Mejora tu técnica (hay problemas reportados)</p>
              )}
              {!latestCriteria.progress.met && (
                <p>• Incrementa tu carga (no llegas al +8% requerido)</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Histórico de semanas */}
      {weeks.length > 1 && (
        <details className="bg-gray-800/50 rounded-lg p-3">
          <summary className="text-sm font-semibold text-gray-300 cursor-pointer">
            📋 Histórico de semanas ({weeks.length})
          </summary>
          <div className="mt-3 space-y-2">
            {weeks.map((week, idx) => (
              <div key={idx} className="text-xs p-2 bg-gray-900/50 rounded flex justify-between">
                <span className="text-gray-400">Semana {week.week_number}</span>
                <span className={week.all_criteria_met ? 'text-green-400' : 'text-orange-400'}>
                  {week.all_criteria_met ? '✓ Completa' : '○ Parcial'}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
