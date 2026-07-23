/**
 * @fileoverview Cabecera de TodayTrainingTab (ARCH-002)
 *
 * Bloque presentacional extraído del monolito. Agrupa:
 * - Warnings de redistribución (FirstWeekWarning)
 * - Título con numerador global de sesión
 * - Aviso de plan que aún no comienza
 * - Badges de adaptación / ciclo MindFeed + botón de prioridad muscular
 * - Header enriquecido (SummaryHeader + perfil + barra de progreso)
 *
 * Sin estado propio: todos los datos y callbacks llegan por props. El
 * comportamiento (condiciones, textos, cálculos) es idéntico al original.
 *
 * @module components/routines/tabs/TodayTrainingTab/components/TodayTrainingHeader
 */

import { Target } from 'lucide-react';
import { Card } from '@/components/ui/card.jsx';

import { getTodayName } from '@/utils/training/dateHelpers';
import { isHipertrofiaMethodology } from '@/utils/hipertrofiaIdentity';
import { SummaryHeader } from '../../../summary/SummaryHeader.jsx';
import { UserProfileDisplay } from '../../../summary/UserProfileDisplay.jsx';
import { ProgressBar } from '../../../summary/ProgressBar.jsx';
import { FirstWeekWarning } from '../../../alerts/FirstWeekWarning.jsx';
import CycleStatusBadge from '../../../../Methodologie/methodologies/Hipertrofia/components/CycleStatusBadge';
import AdaptationTrackingBadge from '../../../../Methodologie/methodologies/Hipertrofia/components/AdaptationTrackingBadge.jsx';
import AdaptationProgressPanel from '../../../../Methodologie/methodologies/Hipertrofia/components/AdaptationProgressPanel';

export default function TodayTrainingHeader({
  methodologyPlanId,
  configLoading,
  planConfig,
  isPlanStartInFuture,
  planStartDisplay,
  plan,
  adaptationState,
  userId,
  fetchAdaptationProgress,
  goToMethodologies,
  setShowTransitionModal,
  currentPriority,
  setShowPriorityModal,
  session,
  headerProgressStats
}) {
  return (
    <>
      {/* 🎯 NUEVO: Mostrar warnings de redistribución si aplica */}
      {!configLoading && planConfig && (
        <FirstWeekWarning
          methodologyPlanId={methodologyPlanId}
          config={planConfig}
          onClose={(index) => {
            // Opcional: Manejar cierre de warnings individuales
            console.log('Warning cerrado:', index);
          }}
        />
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-white font-urbanist">
            Entrenamiento de Hoy
            {/* 🎯 Mostrar número de sesión SOLO si hoy tiene mapeo
                (antes renderizaba "(Sesión )" vacío cuando no había). */}
            {(() => {
              if (!planConfig?.day_mappings) return null;
              const today = getTodayName();
              const todayAbbrev = today.substring(0, 3);
              const todayCapitalized = todayAbbrev.charAt(0).toUpperCase() + todayAbbrev.slice(1);
              const mapping = planConfig.day_mappings[todayCapitalized];
              if (!mapping) return null;
              // Numerador GLOBAL (no el slot semanal 1-3): (semana-1)*sesiones_semana + slot.
              // Total robusto = total_weeks * sesiones/semana (no depende del expected_sessions
              // guardado, que en planes de principiante antiguos quedó hardcodeado a 12).
              const weeklySlot = parseInt(mapping.replace('sesion_', ''), 10) || 1;
              const perWeek = Object.keys(planConfig.day_mappings).length || 3;
              const totalWeeks = planConfig.total_weeks
                || Math.round((planConfig.expected_sessions || perWeek) / perWeek);
              const totalSessions = totalWeeks * perWeek;
              const currentWeek = plan?.currentWeek || 1;
              const globalNum = Math.min(totalSessions, (currentWeek - 1) * perWeek + weeklySlot);
              return (
                <span className="ml-3 text-lg font-normal text-yellow-400">
                  (Sesión {globalNum} de {totalSessions})
                </span>
              );
            })()}
          </h2>
          <p className="text-gray-300/80">
            {new Date().toLocaleDateString('es-ES', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })}
          </p>
        </div>
      </div>

      {isPlanStartInFuture && (
        <Card className="mt-4 border border-yellow-400/30 border-l-2 border-l-yellow-400/40 bg-black/60 backdrop-blur-md">
          <div className="p-4">
            <h3 className="text-lg font-semibold text-yellow-300 font-urbanist">
              Tu plan comienza el {planStartDisplay || 'próximo lunes'}
            </h3>
            <p className="text-sm text-gray-300/80 mt-1">
              Hemos guardado tu plan. El entrenamiento empezará automáticamente en la fecha indicada.
            </p>
          </div>
        </Card>
      )}

      {/* 🟣 Badge de adaptación (solo para fase de adaptación inicial, NO para MindFeed/D1-D5) */}
      {/* 🎯 FIX: Agregar validación de userId y mejor logging */}
      {(() => {
        const shouldRenderAdaptation = adaptationState.hasBlock &&
          !isHipertrofiaMethodology(plan?.metodologia) &&
          userId;

        if (adaptationState.hasBlock) {
          console.log('🔍 Condiciones AdaptationProgressPanel:', {
            hasBlock: adaptationState.hasBlock,
            metodologia: plan?.metodologia,
            userId: !!userId,
            shouldRender: shouldRenderAdaptation
          });
        }

        return shouldRenderAdaptation;
      })() && (
        <div className="mt-3 space-y-4">
          <AdaptationTrackingBadge
            loading={adaptationState.loading}
            hasBlock={adaptationState.hasBlock}
            block={adaptationState.block}
            readyForTransition={adaptationState.readyForTransition}
            onReload={fetchAdaptationProgress}
            onTransition={() => goToMethodologies()} // que vaya a metodologías para transicionar
          />

          {/* 🎯 Panel de progreso detallado de adaptación (solo fase inicial) */}
          <AdaptationProgressPanel
            userId={userId}
            onReadyForTransition={() => setShowTransitionModal(true)}
            onNeedRepeat={() => console.log('Necesita repetir')}
          />
        </div>
      )}

      {/* 🔄 Badge de estado del ciclo MindFeed (solo para Hipertrofia) */}
      {isHipertrofiaMethodology(plan?.metodologia) && (
        <div className="mt-4 space-y-3">
          <CycleStatusBadge
            userId={userId}
            methodologyPlanId={methodologyPlanId || plan?.methodologyPlanId}
          />

          {/* 🎯 FASE 2: Botón de Prioridad Muscular */}
          <button
            onClick={() => setShowPriorityModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg font-medium transition-colors"
          >
            <Target className="h-5 w-5" />
            {currentPriority ? 'Gestionar Prioridad' : 'Activar Prioridad Muscular'}
          </button>
        </div>
      )}

      {/* Header enriquecido con metodología, fuente, perfil y progreso */}
      <section className="mt-4">
        <SummaryHeader
          plan={plan?.currentPlan || plan}
          session={session}
          planSource={{ label: (plan?.planType === 'manual' || plan?.currentPlan?.generation_mode === 'manual') ? 'Manual' : 'IA' }}
        />
        <UserProfileDisplay />
        <ProgressBar progressStats={headerProgressStats} />
      </section>
    </>
  );
}
