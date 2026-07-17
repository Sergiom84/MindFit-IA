import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTrace } from '@/contexts/TraceContext.jsx';
import FatigueReportModal from '../../Methodologie/methodologies/HipertrofiaV2/components/FatigueReportModal';
import WeeklyReviewModal from '../../Methodologie/methodologies/HipertrofiaV2/components/WeeklyReviewModal';
import { extractSessionPatterns } from '@/utils/exerciseUtils.js';
import tokenManager from '../../../utils/tokenManager';

/**
 * Modal de resumen final de sesión
 *
 * Extraído de RoutineSessionModal.jsx para mejor organización
 * Muestra el resumen completo de la sesión al finalizar
 * Incluye estadísticas y opciones de navegación
 * FASE 2: Integra reporte de fatiga opcional
 */
export const SessionSummaryModal = ({
  show,
  endTitle,
  endMessage,
  progressState,
  session,
  sessionId,
  onClose,
  onEndSession,
  navigateToRoutines
}) => {
  const { track } = useTrace();
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [showFatigueReport, setShowFatigueReport] = React.useState(false);
  const [showWeeklyReview, setShowWeeklyReview] = React.useState(false);
  const [weeklyReviewLoading, setWeeklyReviewLoading] = React.useState(false);
  const [weeklyReviewError, setWeeklyReviewError] = React.useState(null);
  const [weeklyReviewData, setWeeklyReviewData] = React.useState(null);

  // Ref para evitar loop infinito en tracking
  const prevShowRef = React.useRef(show);

  // Tracking corregido con useRef
  React.useEffect(() => {
    if (prevShowRef.current !== show) {
      track(show ? 'MODAL_OPEN' : 'MODAL_CLOSE', { name: 'SessionSummaryModal' }, { component: 'SessionSummaryModal' });
      prevShowRef.current = show;
    }
  }, [show, track]);
  if (!show) return null;

  const { exerciseStates, total } = progressState;

  // Calcular estadísticas
  const completed = Object.values(exerciseStates).filter(state => state === 'completed').length;
  const skipped = Object.values(exerciseStates).filter(state => state === 'skipped').length;
  const cancelled = Object.values(exerciseStates).filter(state => state === 'cancelled').length;

  const handleViewProgress = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    track('BUTTON_CLICK', { id: 'view_progress' }, { component: 'SessionSummaryModal' });
    console.log('🎯 Terminando sesión y navegando a rutinas');

    try {
      // 🎯 PASO 1: Llamar a onEndSession y ESPERAR a que complete (incluye fetchTodayStatus)
      if (onEndSession) {
        console.log('📝 Llamando a onEndSession para completar sesión en BD');
        await onEndSession();
        console.log('✅ onEndSession completado, estado actualizado');
      }

      const isMindfeedSession = session?.metodologia === 'HipertrofiaV2_MindFeed' || session?.metodologia === 'HipertrofiaV2';

      // 🎯 PASO 1.25: Detectar fatiga automáticamente (si aplica)
      if (isMindfeedSession && sessionId) {
        try {
          console.log('🤖 [FATIGUE] Detectando fatiga automática para sesión', sessionId);
          const token = tokenManager.getToken();
          const fatigueResponse = await fetch(
            `${import.meta.env.VITE_API_URL || 'http://localhost:3010'}/api/hipertrofiav2/detect-auto-fatigue`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({ sessionId })
            }
          );

          if (fatigueResponse.ok) {
            const fatigueResult = await fatigueResponse.json();
            console.log('✅ [FATIGUE] Resultado detección automática:', fatigueResult);
          } else {
            console.error('❌ [FATIGUE] Error detectando fatiga automática:', await fatigueResponse.text());
          }
        } catch (fatigueError) {
          console.error('❌ [FATIGUE] Error inesperado en detección automática:', fatigueError);
        }
      }

      const sessionPatterns = extractSessionPatterns(session);

      // 🎯 PASO 1.5: Si es HipertrofiaV2 MindFeed, avanzar el ciclo D1-D5
      if (isMindfeedSession) {
        console.log('🔄 [MINDFEED] Detectado HipertrofiaV2, avanzando ciclo...');

        // Extraer cycle_day del nombre de sesión (formato: "D1: ...", "D2: ...", etc.)
        const sessionName = session?.session_name || session?.sessionName || '';
        const cycleMatch = sessionName.match(/^D(\d)/);

        if (cycleMatch) {
          const cycleDay = `D${cycleMatch[1]}`;
          console.log(`🔄 [MINDFEED] Avanzando ciclo desde ${cycleDay}...`);

          try {
            const token = tokenManager.getToken();
            const response = await fetch(
              `${import.meta.env.VITE_API_URL || 'http://localhost:3010'}/api/hipertrofiav2/advance-cycle`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                  sessionDayName: cycleDay,
                  sessionPatterns
                })
              }
            );

            if (response.ok) {
              const cycleResult = await response.json();
              console.log('✅ [MINDFEED] Ciclo avanzado:', cycleResult);

              // Si completó microciclo, mostrar mensaje especial
              if (cycleResult.microcycle_completed) {
                console.log('🎉 [MINDFEED] ¡Microciclo completado!', cycleResult.progression);
              }
            } else {
              console.error('❌ [MINDFEED] Error avanzando ciclo:', await response.text());
            }
          } catch (error) {
            console.error('❌ [MINDFEED] Error en advance-cycle:', error);
            // No bloquear la navegación si falla el advance-cycle
          }
        } else {
          console.warn('⚠️ [MINDFEED] No se pudo extraer cycle_day del session_name:', sessionName);
        }
      }

      // 🎯 PASO 2: Esperar más tiempo para asegurar que el estado se propagó completamente
      // Incrementado de 300ms a 500ms para dar tiempo a la BD
      console.log('⏳ Esperando propagación del estado (500ms)...');
      await new Promise(resolve => setTimeout(resolve, 500));

      // 🎯 PASO 3: Cerrar modal ANTES de navegar para asegurar limpieza de estado
      console.log('🔒 Cerrando modal antes de navegar');
      onClose?.();

      // 🎯 PASO 4: Esperar dos frames para asegurar que el modal se cerró Y el estado se actualizó
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      // 🎯 PASO 5: Navegar a Rutinas (estado ya está actualizado)
      console.log('🚀 Navegando a rutinas con estado actualizado');
      if (typeof navigateToRoutines === 'function') {
        navigateToRoutines();
      } else {
        navigate('/routines');
      }
    } catch (error) {
      console.error('❌ Error en handleViewProgress:', error);
    } finally {
      // Evitar quedarse bloqueado si algo falla
      setTimeout(() => setIsSubmitting(false), 500);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-4 pt-[calc(6rem+env(safe-area-inset-top))] pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <div
        className="absolute inset-0 bg-black/60"
        onClick={() => {
          track('MODAL_DISMISS', { via: 'backdrop' }, { component: 'SessionSummaryModal' });
      onClose?.();
      onEndSession?.();
    }}
      />

      <div className="relative bg-neutral-900 border border-white/10 ring-1 ring-white/10 rounded-3xl p-6 w-full max-w-md max-h-[calc(100vh-14rem)] overflow-y-auto shadow-[0_40px_90px_-60px_rgba(0,0,0,0.9)]">
        {/* Header */}
        <div className="text-center mb-4">
          <h3 className="text-white text-xl font-semibold font-urbanist mb-2">{endTitle}</h3>
          <p className="text-gray-200/80">{endMessage}</p>
        </div>

        {/* Estadísticas detalladas */}
        <div className="bg-white/10 border border-white/10 rounded-2xl p-4 mb-6">
          <h4 className="text-white font-semibold mb-3 text-center font-urbanist">Resumen de la sesión</h4>

          <div className="space-y-2">
            {/* Total de ejercicios */}
            <div className="flex items-center justify-between">
              <span className="text-gray-300/70">Total de ejercicios:</span>
              <span className="text-white font-semibold">{total}</span>
            </div>

            {/* Completados */}
            {completed > 0 && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 bg-emerald-400 rounded-full"></span>
                  <span className="text-emerald-200">Completados:</span>
                </div>
                <span className="text-emerald-300 font-semibold">{completed}</span>
              </div>
            )}

            {/* Saltados */}
            {skipped > 0 && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 bg-yellow-400 rounded-full"></span>
                  <span className="text-yellow-200">Saltados:</span>
                </div>
                <span className="text-yellow-400 font-semibold">{skipped}</span>
              </div>
            )}

            {/* Cancelados */}
            {cancelled > 0 && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 bg-red-400 rounded-full"></span>
                  <span className="text-red-200">Cancelados:</span>
                </div>
                <span className="text-red-400 font-semibold">{cancelled}</span>
              </div>
            )}

            {/* Progreso visual */}
            <div className="mt-4 pt-3 border-t border-white/10">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-300/70 text-sm">Progreso:</span>
                <span className="text-white text-sm font-semibold">
                  {Math.round((completed / total) * 100)}%
                </span>
              </div>
              <div className="w-full bg-white/10 rounded-full h-2">
                <div
                  className="bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${(completed / total) * 100}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Mensaje motivacional */}
        <div className="bg-gradient-to-r from-yellow-500/10 to-amber-500/10 border border-yellow-400/30 rounded-2xl p-4 mb-6">
          <div className="text-center">
            {completed === total ? (
              <div>
                <div className="text-2xl mb-2">🎉</div>
                <p className="text-yellow-100 text-sm">
                  ¡Increíble! Has completado todos los ejercicios. ¡Sigue así!
                </p>
              </div>
            ) : completed > total / 2 ? (
              <div>
                <div className="text-2xl mb-2">💪</div>
                <p className="text-yellow-100 text-sm">
                  ¡Gran trabajo! Has completado la mayoría de ejercicios.
                </p>
              </div>
            ) : completed > 0 ? (
              <div>
                <div className="text-2xl mb-2">👏</div>
                <p className="text-yellow-100 text-sm">
                  ¡Buen esfuerzo! Cada paso cuenta en tu progreso.
                </p>
              </div>
            ) : (
              <div>
                <div className="text-2xl mb-2">🌟</div>
                <p className="text-yellow-100 text-sm">
                  ¡No te rindas! El siguiente entrenamiento será mejor.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Botones de acción */}
        <div className="flex flex-col gap-3">
          <button
            onClick={handleViewProgress}
            disabled={isSubmitting}
            className={`w-full px-4 py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 ${isSubmitting ? 'bg-emerald-500/40 text-white cursor-not-allowed opacity-70' : 'bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 text-gray-900 hover:from-yellow-200 hover:via-yellow-300 hover:to-amber-400 shadow-[0_12px_30px_-18px_rgba(250,204,21,0.8)]'}`}
          >
            {isSubmitting ? 'Guardando y navegando…' : 'Ver progreso en Rutinas'}
          </button>

          {/* 🩺 FASE 2: Botón de Reporte de Fatiga (opcional) */}
          {(session?.metodologia === 'HipertrofiaV2_MindFeed' || session?.metodologia === 'HipertrofiaV2') && (
          <button
            onClick={() => {
              track('BUTTON_CLICK', { id: 'fatigue_report' }, { component: 'SessionSummaryModal' });
              setShowFatigueReport(true);
            }}
            className="w-full px-4 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-semibold transition-colors border border-white/10 flex items-center justify-center gap-2"
          >
            <span>🩺</span>
            Reportar Recuperación (opcional)
          </button>
          )}

          {/* 🧮 Revisión semanal (adaptación) */}
          {(session?.metodologia === 'HipertrofiaV2_MindFeed' || session?.metodologia === 'HipertrofiaV2') && (() => {
            // Detectar si la sesión actual es D5 (cierre de microciclo/semana)
            const sessionName = session?.session_name || session?.sessionName || '';
            const cycleMatch = sessionName.match(/^D(\d)/);
            const isD5 = cycleMatch && cycleMatch[1] === '5';

            if (!isD5) return null;

            const handleWeeklyReview = async () => {
              setWeeklyReviewError(null);
              setWeeklyReviewData(null);
              setWeeklyReviewLoading(true);
              setShowWeeklyReview(true);

              try {
                const token = tokenManager.getToken();
                const response = await fetch(
                  `${import.meta.env.VITE_API_URL || 'http://localhost:3010'}/api/adaptation/auto-evaluate-week`,
                  {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${token}`
                    }
                  }
                );

                const result = await response.json();

                if (!response.ok || result.success === false) {
                  throw new Error(result.error || 'No se pudo evaluar la semana');
                }

                setWeeklyReviewData(result);
              } catch (err) {
                console.error('❌ [ADAPTACIÓN] Error en revisión semanal:', err);
                setWeeklyReviewError(err.message || 'Error al calcular la revisión semanal');
              } finally {
                setWeeklyReviewLoading(false);
              }
            };

            return (
              <button
                onClick={handleWeeklyReview}
                className="w-full px-4 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-semibold transition-colors border border-white/10 flex items-center justify-center gap-2"
              >
                <span>📅</span>
                Revisión semanal (adaptación)
              </button>
            );
          })()}

          <button
            onClick={() => {
              track('BUTTON_CLICK', { id: 'close' }, { component: 'SessionSummaryModal' });
              onClose?.();
              onEndSession?.();
            }}
            className="w-full px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl font-medium transition-colors border border-white/10"
          >
            Cerrar
          </button>
        </div>

        {/* Footer con recordatorio */}
        <div className="mt-4 pt-3 border-t border-white/10">
          <p className="text-xs text-gray-300/70 text-center">
            Tu progreso ha sido guardado automáticamente
          </p>
        </div>
      </div>

      {/* 🩺 FASE 2: Modal de Reporte de Fatiga */}
      <FatigueReportModal
        show={showFatigueReport}
        onClose={() => setShowFatigueReport(false)}
        onSubmit={(result) => {
          console.log('✅ [FATIGUE] Reporte completado:', result);

          // Si se creó un flag, mostrar notificación
          if (result.flag_created) {
            // TODO: Mostrar toast o notificación
            console.log(`🚨 Flag de fatiga creado: ${result.flag.flag_type}`);
          }

          setShowFatigueReport(false);
        }}
      />

      {/* 📅 Modal de revisión semanal (adaptación) */}
      <WeeklyReviewModal
        show={showWeeklyReview}
        loading={weeklyReviewLoading}
        error={weeklyReviewError}
        data={weeklyReviewData}
        onClose={() => setShowWeeklyReview(false)}
      />
    </div>
  );
};

export default SessionSummaryModal;
