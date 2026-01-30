/**
 * 🎯 Modal Unificado de Confirmación de Plan de Entrenamiento
 *
 * FUNCIONALIDAD:
 * - Modal único para confirmar cualquier plan generado (automático o manual)
 * - Muestra resumen del plan con ejercicios y justificación
 * - Botón "Comenzar Entrenamiento" que abre RoutineSessionModal DIRECTAMENTE
 * - NO navega a /routines - flujo directo
 */

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Badge } from '@/components/ui/badge.jsx';
import { Separator } from '@/components/ui/separator.jsx';
import ExerciseFeedbackModal from './ExerciseFeedbackModal.jsx';
import DayDetailModal from './modals/DayDetailModal.jsx';
import {
  X,
  CheckCircle,
  Target,
  Clock,
  TrendingUp,
  Zap,
  Dumbbell,
  Calendar,
  Brain
} from 'lucide-react';
import { useTrace } from '@/contexts/TraceContext.jsx';



// 🆕 Mapeo dinámico: el backend ahora proporciona días reales, no necesitamos mapeo estático


export default function TrainingPlanConfirmationModal({
  isOpen,
  onClose,
  onStartTraining, // Función para iniciar directamente
  onSavePlan, // NUEVA: Guardar plan sin iniciar sesión
  onGenerateAnother, // NUEVA: Función para generar otro plan
  plan,
  planId, // 🆕 ID del plan draft para eliminar si se cancela
  methodology,
  startConfig = null,
  aiJustification = null,
  planSource = { label: 'IA Avanzada' }, // NUEVO: Fuente del plan
  isLoading = false,
  isConfirming = false, // NUEVO: Estado de confirmación
  error = null // NUEVO: Error del modal
}) {
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [selectedDay, setSelectedDay] = useState(null);
  const [showDayDetailModal, setShowDayDetailModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { track } = useTrace();

  // Referencias para evitar loops infinitos en tracking
  const prevOpenRef = React.useRef(isOpen);
  const prevFeedbackModalRef = React.useRef(showFeedbackModal);

  // Tracking del modal principal - CORREGIDO
  React.useEffect(() => {
    if (prevOpenRef.current !== isOpen) {
      track(isOpen ? 'MODAL_OPEN' : 'MODAL_CLOSE', { name: 'TrainingPlanConfirmationModal' }, { component: 'TrainingPlanConfirmationModal' });
      prevOpenRef.current = isOpen;
    }
  }, [isOpen, track]);

  // Tracking del modal de feedback - CORREGIDO
  React.useEffect(() => {
    if (prevFeedbackModalRef.current !== showFeedbackModal) {
      track(showFeedbackModal ? 'MODAL_OPEN' : 'MODAL_CLOSE', { name: 'ExerciseFeedbackModal' }, { component: 'TrainingPlanConfirmationModal' });
      prevFeedbackModalRef.current = showFeedbackModal;
    }
  }, [showFeedbackModal, track]);

  const [isGeneratingAnother, setIsGeneratingAnother] = useState(false);
  const shouldSaveOnly = startConfig?.startDate === 'next_monday';

  // 🗑️ Función para eliminar draft cuando el usuario cancela
  const deleteDraft = async (draftId) => {
    if (!draftId) return;

    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3010';
      const token = localStorage.getItem('token');

      console.log(`🗑️ Eliminando draft ${draftId}...`);

      const response = await fetch(`${API_URL}/api/routine-generation/draft/${draftId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        console.log('✅ Draft eliminado:', data);
        track('DRAFT_DELETED', { planId: draftId, reason: 'user_cancelled' }, { component: 'TrainingPlanConfirmationModal' });
      } else {
        console.error('❌ Error eliminando draft:', response.status);
      }
    } catch (error) {
      console.error('❌ Error eliminando draft:', error);
      track('ERROR', { where: 'deleteDraft', message: error?.message }, { component: 'TrainingPlanConfirmationModal' });
    }
  };

  // 🚪 Handler para cerrar modal (elimina draft si no fue confirmado)
  const handleClose = async () => {
    // Si hay un planId y el usuario cierra sin confirmar, eliminar el draft
    if (planId && !isConfirming) {
      setIsDeleting(true);
      await deleteDraft(planId);
      setIsDeleting(false);
    }
    track('MODAL_CLOSE', { planId, wasConfirmed: isConfirming }, { component: 'TrainingPlanConfirmationModal' });
    onClose();
  };


  // 👁️ Handler para abrir modal de detalle de día
  const handleDayClick = (session, sessionDate) => {
    const muscleGroups = getMuscleGroupsPreview(session);

    let ejercicios = [];
    if (Array.isArray(session.ejercicios)) {
      ejercicios = session.ejercicios;
    } else if (Array.isArray(session.bloques)) {
      ejercicios = session.bloques.flatMap(bloque =>
        Array.isArray(bloque.ejercicios) ? bloque.ejercicios : []
      );
    }

    setSelectedDay({
      date: sessionDate,
      muscleGroups,
      ejercicios
    });
    setShowDayDetailModal(true);
    track('DAY_DETAIL_OPEN', { date: sessionDate, exerciseCount: ejercicios.length }, { component: 'TrainingPlanConfirmationModal' });
  };

  //  Función para extraer grupos musculares de una sesión
  const getMuscleGroupsPreview = (session) => {
    // HipertrofiaV2 MindFeed: grupos_musculares en JSON
    if (session.grupos_musculares) {
      const groups = Array.isArray(session.grupos_musculares)
        ? session.grupos_musculares
        : JSON.parse(session.grupos_musculares);
      return groups.slice(0, 2); // Máximo 2 grupos
    }

    // Otros planes: inferir de ejercicios
    let ejercicios = [];
    if (Array.isArray(session.ejercicios)) {
      ejercicios = session.ejercicios;
    } else if (Array.isArray(session.bloques)) {
      ejercicios = session.bloques.flatMap(bloque =>
        Array.isArray(bloque.ejercicios) ? bloque.ejercicios : []
      );
    }

    const groups = new Set();
    ejercicios.forEach(ex => {
      if (ex.grupo_muscular) groups.add(ex.grupo_muscular);
      if (ex.categoria) groups.add(ex.categoria);
    });

    return Array.from(groups).slice(0, 2); // Máximo 2 grupos
  };


  if (!isOpen || !plan) return null;

  // Manejar click en "Generar otro"
  const handleGenerateAnotherClick = () => {
    track('BUTTON_CLICK', { id: 'generate_another' }, { component: 'TrainingPlanConfirmationModal' });
    if (onGenerateAnother) {
      setShowFeedbackModal(true);
    }
  };

  // Manejar envío de feedback
  const handleFeedbackSubmit = async (feedbackData) => {
    try {
      setIsGeneratingAnother(true);
      track('FEEDBACK_SUBMIT', { source: 'generate_another', reasons: feedbackData?.reasons?.length || 0 }, { component: 'TrainingPlanConfirmationModal' });

      // 🗑️ Eliminar draft actual antes de generar nuevo
      if (planId) {
        console.log('🗑️ Eliminando draft anterior antes de generar nuevo...');
        await deleteDraft(planId);
      }

      // Llamar la función de generar otro con el feedback
      if (onGenerateAnother) {
        await onGenerateAnother(feedbackData);
      }

      // Cerrar modal de feedback
      setShowFeedbackModal(false);
    } catch (error) {
      track('ERROR', { where: 'handleFeedbackSubmit', message: error?.message }, { component: 'TrainingPlanConfirmationModal' });
    } finally {
      setIsGeneratingAnother(false);
    }
  };

  // Extraer información del plan
  const totalWeeks = plan.semanas?.length || 0;
  const totalSessions = plan.semanas?.reduce((acc, week) => acc + (week.sesiones?.length || 0), 0) || 0;

  // 🔢 CONTEO TOTAL DE EJERCICIOS (no únicos)
  // Soportar dos estructuras: sesion.ejercicios[] o sesion.bloques[].ejercicios[]
  let totalExercises = 0;
  const uniqueExercises = new Set();

  plan.semanas?.forEach(week => {
    week.sesiones?.forEach(session => {
      // Estructura directa: session.ejercicios
      if (Array.isArray(session.ejercicios)) {
        totalExercises += session.ejercicios.length;
        session.ejercicios.forEach(exercise => {
          uniqueExercises.add(exercise.nombre || exercise.name);
        });
      }
      // Estructura con bloques: session.bloques[].ejercicios
      if (Array.isArray(session.bloques)) {
        session.bloques.forEach(bloque => {
          if (Array.isArray(bloque.ejercicios)) {
            totalExercises += bloque.ejercicios.length;
            bloque.ejercicios.forEach(exercise => {
              uniqueExercises.add(exercise.nombre || exercise.name);
            });
          }
        });
      }
    });
  });

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="w-[95vw] sm:max-w-4xl lg:max-w-5xl max-h-[95vh] overflow-y-auto bg-neutral-900/95 border border-white/10 ring-1 ring-white/5 shadow-2xl backdrop-blur-xl z-50">
        <DialogHeader className="pb-4 border-b border-white/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-yellow-500/10 border border-yellow-400/30 rounded-full flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-yellow-300" />
              </div>
              <div>
                <DialogTitle className="text-xl font-urbanist text-white">
                  ¡Plan de Entrenamiento Listo!
                </DialogTitle>
                <DialogDescription className="text-gray-300/70">
                  {methodology} • {planSource?.label || 'IA Avanzada'}
                </DialogDescription>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => { track('BUTTON_CLICK', { id: 'close_icon' }, { component: 'TrainingPlanConfirmationModal' }); handleClose(); }}
              className="text-gray-300/70 hover:text-white hover:bg-white/10"
              disabled={isDeleting}
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {/* Justificación de IA */}
          {aiJustification && (
            <div className="bg-white/5 border border-white/10 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Brain className="w-5 h-5 text-yellow-300" />
                <h4 className="font-semibold text-yellow-300">Análisis IA</h4>
              </div>
              <p className="text-gray-200/80 text-sm leading-relaxed">
                {aiJustification}
              </p>
            </div>
          )}

          {/* Estadísticas del plan */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-3 bg-white/5 border border-white/10 rounded-lg border-l-2 border-l-yellow-400/30">
              <Calendar className="w-5 h-5 text-yellow-300 mx-auto mb-1" />
              <div className="text-lg font-semibold text-white">{totalWeeks}</div>
              <div className="text-xs text-gray-300/70">Semanas</div>
            </div>
            <div className="text-center p-3 bg-white/5 border border-white/10 rounded-lg border-l-2 border-l-yellow-400/30">
              <Zap className="w-5 h-5 text-yellow-300 mx-auto mb-1" />
              <div className="text-lg font-semibold text-white">{totalSessions}</div>
              <div className="text-xs text-gray-300/70">Sesiones</div>
            </div>
            <div className="text-center p-3 bg-white/5 border border-white/10 rounded-lg border-l-2 border-l-yellow-400/30">
              <Dumbbell className="w-5 h-5 text-yellow-300 mx-auto mb-1" />
              <div className="text-lg font-semibold text-white">{totalExercises}</div>
              <div className="text-xs text-gray-300/70">Ejercicios</div>
            </div>
            <div className="text-center p-3 bg-white/5 border border-white/10 rounded-lg border-l-2 border-l-yellow-400/30">
              <Target className="w-5 h-5 text-yellow-300 mx-auto mb-1" />
              <div className="text-lg font-semibold text-white">{methodology}</div>
              <div className="text-xs text-gray-300/70">Metodología</div>
            </div>
          </div>

          {/* Resumen semanal mejorado */}
          <div>
            <h4 className="font-semibold text-white mb-3 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-yellow-300" />
              Resumen del Plan
            </h4>
            <div className="space-y-4 max-h-[45vh] overflow-y-auto">
              {plan.semanas?.length === 0 && (
                <p className="text-gray-300/70 text-sm">No hay semanas para mostrar.</p>
              )}
              {plan.semanas?.map((semana, weekIndex) => (
                <div key={`week-${weekIndex}`} className="bg-white/5 border border-white/10 rounded-lg">
                  <div className="px-3 sm:px-4 py-2 border-b border-white/10 flex items-center justify-between">
                    <span className="text-gray-200 font-medium text-sm sm:text-base">
                      Semana {semana.numero || semana.semana}
                    </span>
                    <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-300 text-xs border border-yellow-400/20">
                      {semana.sesiones?.length || 0} sesiones
                    </Badge>
                  </div>
                  <div className="p-3 sm:p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {(semana.sesiones || []).map((sesion, sessionIndex) => {
                      // ✅ CORREGIDO: Usar el día real que viene del plan (backend ya lo calcula correctamente)
                      const cicloDay = sesion.ciclo_dia || sesion.cycle_day || (sessionIndex + 1);
                      const dayName = sesion.dia || 'N/A'; // El backend ya proporciona el día real

                      // Si el plan tiene fecha de inicio, podemos mostrar el número del día
                      let dayNumber = '';
                      if (plan.fecha_inicio && sesion.fecha) {
                        const sessionDate = new Date(sesion.fecha);
                        dayNumber = sessionDate.getDate();
                      }

                      // 🎯 Formato: D1 Lun 17 : Pecho + Tríceps
                      const headerText = dayNumber
                        ? `D${cicloDay} ${dayName} ${dayNumber}`
                        : `D${cicloDay} ${dayName}`;

                      // 💪 Obtener preview de grupos musculares
                      const muscleGroups = getMuscleGroupsPreview(sesion);

                      return (
                        <div
                          key={sesion.id || `w${weekIndex}-s${sessionIndex}`}
                          onClick={() => handleDayClick(sesion, headerText)}
                          className="bg-white/5 rounded-md p-2 border border-white/10 transition-all text-center cursor-pointer hover:border-yellow-400/40 hover:bg-white/10 min-h-[80px] flex flex-col justify-center"
                        >
                          {/* Formato: D1 Lun 17 : Pecho + Tríceps */}
                          <div className="text-yellow-200/90 font-semibold text-xs leading-tight break-words">
                            {headerText} : {muscleGroups.length > 0 ? muscleGroups.join(' + ') : 'Sin grupos definidos'}
                          </div>

                          {/* Descripción entre paréntesis si existe */}
                          {sesion.descripcion && (
                            <div className="text-gray-300/70 text-xs mt-1 leading-tight break-words">
                              ({sesion.descripcion})
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Separator className="bg-white/10" />

          {/* Mostrar error si existe */}
          {error && (
            <div className="bg-red-500/10 border border-red-400/30 rounded-xl p-3">
              <p className="text-red-200 text-sm">
                ⚠️ {error}
              </p>
            </div>
          )}

          {/* Botones de acción mejorados */}
          <div className="flex flex-col sm:flex-row gap-3 sm:justify-end">
            {/* Botón Generar otro - Solo si hay función disponible */}
            {onGenerateAnother && (
              <Button
                onClick={handleGenerateAnotherClick}
                variant="outline"
                className="border-white/10 text-gray-200/80 hover:bg-white/10 transition-colors rounded-xl"
                disabled={isLoading || isConfirming || isGeneratingAnother}
              >
                <TrendingUp className="w-4 h-4 mr-2" />
                {isGeneratingAnother ? 'Generando...' : 'Generar otro'}
              </Button>
            )}

            <div className="flex gap-3 sm:ml-auto">
              <Button
                onClick={() => { track('BUTTON_CLICK', { id: 'cancel' }, { component: 'TrainingPlanConfirmationModal' }); handleClose(); }}
                variant="outline"
                className="border-red-400/30 text-red-200 hover:bg-red-500/15 hover:text-red-100 rounded-xl"
                disabled={isLoading || isConfirming || isDeleting}
              >
                {isDeleting ? 'Cancelando...' : error ? 'Cerrar' : 'Cancelar'}
              </Button>
              <Button
                onClick={() => {
                  const buttonId = shouldSaveOnly ? 'save_plan' : 'start_training';
                  track('BUTTON_CLICK', { id: buttonId }, { component: 'TrainingPlanConfirmationModal' });
                  if (shouldSaveOnly) {
                    onSavePlan?.();
                  } else {
                    onStartTraining();
                  }
                }}
                className="bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 text-black font-semibold hover:from-yellow-200 hover:via-yellow-300 hover:to-amber-400 shadow-[0_12px_30px_-18px_rgba(250,204,21,0.8)] rounded-xl"
                disabled={isLoading || isConfirming}
              >
                {isLoading || isConfirming ? (
                  <>
                    <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin mr-2" />
                    {isConfirming
                      ? (shouldSaveOnly ? 'Guardando plan...' : 'Guardando rutina...')
                      : (shouldSaveOnly ? 'Guardando...' : 'Iniciando...')}
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 mr-2" />
                    {shouldSaveOnly ? 'Guardar plan' : 'Comenzar Entrenamiento'}
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>

      {/* Modal de Feedback */}
      <ExerciseFeedbackModal
        isOpen={showFeedbackModal}
        onClose={() => setShowFeedbackModal(false)}
        onSubmitFeedback={handleFeedbackSubmit}
        isSubmitting={isGeneratingAnother}
      />

      {/* Modal de Detalle de Día */}
      <DayDetailModal
        isOpen={showDayDetailModal}
        onClose={() => setShowDayDetailModal(false)}
        day={selectedDay}
      />
      </Dialog>

    </>
  );
}
