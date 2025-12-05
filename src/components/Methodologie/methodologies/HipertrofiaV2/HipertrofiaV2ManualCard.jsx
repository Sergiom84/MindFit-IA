/**
 * HipertrofiaV2 Manual Card - Sistema de Tracking con RIR
 * Full Body con variedad de ejercicios y autorregulación
 *
 * @version 2.2.0 - Modal de día de inicio (Jue-Dom)
 */

import React, { useEffect, useState } from 'react';
import {
  Dumbbell,
  TrendingUp,
  CheckCircle,
  AlertTriangle,
  Loader,
  Target,
  Calendar
} from 'lucide-react';
import { useAuth } from '../../../../contexts/AuthContext';
import {
  BEGINNER_FULL_BODY_PATTERNS
} from './config/fullBodyPatterns';
import AdaptationBlockSelection from './components/AdaptationBlockSelection.jsx';
import AdaptationTrackingBadge from './components/AdaptationTrackingBadge.jsx';
import AdaptationTransitionModal from './components/AdaptationTransitionModal.jsx';
import AdaptationDashboard from '../../../HipertrofiaV2/AdaptationDashboard.jsx';
import StartDayModal from './components/StartDayModal.jsx';
import { useTrace } from '../../../../contexts/TraceContext';

export default function HipertrofiaV2ManualCard({ onGenerate, isLoading, error, startConfig }) {
  const { user } = useAuth();
  const { track } = useTrace();

  const [step, setStep] = useState('evaluation'); // 'evaluation' | 'confirmed' | 'adaptation'
  const [evaluating, setEvaluating] = useState(false);
  const [evaluation, setEvaluation] = useState(null);
  const [generating, setGenerating] = useState(false); // Estado local de generación
  const [adaptation, setAdaptation] = useState({
    loading: false,
    hasBlock: false,
    readyForTransition: false,
    block: null,
    weeks: []
  });
  const [showAdaptationSelect, setShowAdaptationSelect] = useState(false);
  const [showTransitionModal, setShowTransitionModal] = useState(false);
  const [showAdaptationDashboard, setShowAdaptationDashboard] = useState(false);
  const [showStartDayModal, setShowStartDayModal] = useState(false);
  const [pendingStartConfig, setPendingStartConfig] = useState(null);

  // Helpers: carga de progreso de adaptación
  const fetchAdaptationProgress = async () => {
    setAdaptation((prev) => ({ ...prev, loading: true }));
    try {
      const token = localStorage.getItem('authToken');
      const resp = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:3010'}/api/adaptation/progress`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );
      const data = await resp.json();

      if (!resp.ok || data.success === false) {
        throw new Error(data.error || 'No se pudo cargar progreso de adaptación');
      }

      if (data.hasActiveBlock) {
        setAdaptation({
          loading: false,
          hasBlock: true,
          readyForTransition: data.block?.readyForTransition || false,
          block: data.block || null,
          weeks: data.weeks || []
        });
      } else {
        setAdaptation({
          loading: false,
          hasBlock: false,
          readyForTransition: false,
          block: null,
          weeks: []
        });
      }
    } catch (err) {
      console.error('❌ [ADAPTACIÓN] Error cargando progreso:', err);
      setAdaptation((prev) => ({ ...prev, loading: false }));
    }
  };

  useEffect(() => {
    // Cargar progreso de adaptación al montar
    fetchAdaptationProgress();
  }, []);

  // Evaluar perfil del usuario
  const handleEvaluate = async () => {
    track('hipertrofia_evaluate_start', {
      userId: user.id,
      component: 'HipertrofiaV2ManualCard'
    });

    setEvaluating(true);

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/hipertrofia-specialist/evaluate-profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        },
        body: JSON.stringify({
          userId: user.id
        })
      });

      if (!response.ok) {
        throw new Error('Error al evaluar perfil');
      }

      const data = await response.json();

      track('hipertrofia_evaluate_result', {
        userId: user.id,
        level: data.nivel_hipertrofia,
        confidence: data.confidence,
        hasAdaptationTags: !!data.tags_adaptacion,
        adaptationTags: data.tags_adaptacion,
        component: 'HipertrofiaV2ManualCard'
      });

      setEvaluation({
        level: data.nivel_hipertrofia || 'Principiante',
        experience: data.experiencia || 'Sin experiencia',
        recommendation: data.recomendacion || 'Full Body 3x/semana'
      });

      // Si es principiante absoluto, mostrar modal de selección de bloque de adaptación
      if (data.nivel_hipertrofia === 'Principiante' && data.tags_adaptacion?.includes('novato')) {
        track('hipertrofia_adaptation_selection_required', {
          userId: user.id,
          reason: 'novato_tag_detected',
          component: 'HipertrofiaV2ManualCard'
        });
        setShowAdaptationSelect(true); // ✅ Mostrar modal de selección Full Body vs Half Body
        setStep('adaptation');
      } else if (data.nivel_hipertrofia === 'Principiante') {
        // Principiante con experiencia: Mostrar también selección (pueden elegir)
        track('hipertrofia_adaptation_selection_optional', {
          userId: user.id,
          reason: 'principiante_con_experiencia',
          component: 'HipertrofiaV2ManualCard'
        });
        setShowAdaptationSelect(true);
        setStep('adaptation');
      } else {
        // Intermedio/Avanzado: Saltar adaptación, ir directo a D1-D5
        track('hipertrofia_skip_adaptation', {
          userId: user.id,
          level: data.nivel_hipertrofia,
          component: 'HipertrofiaV2ManualCard'
        });
        setStep('confirmed');
      }
    } catch (error) {
      track('hipertrofia_evaluate_error', {
        userId: user.id,
        error: error.message,
        component: 'HipertrofiaV2ManualCard'
      });
      console.error('Error evaluando perfil:', error);
      // Fallback: Asignar principiante por defecto
      setEvaluation({
        level: 'Principiante',
        experience: 'Sin evaluación',
        recommendation: 'Full Body 3x/semana - Recomendado para comenzar'
      });
      setStep('confirmed');
    } finally {
      setEvaluating(false);
    }
  };

  /**
   * Verifica si necesita mostrar modal de selección de día
   * Jueves-Domingo: Mostrar modal
   * Lunes-Miércoles: Continuar directamente
   */
  const needsStartDayModal = () => {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0=Dom, 1=Lun, ... 4=Jue, 5=Vie, 6=Sáb
    // Jueves (4), Viernes (5), Sábado (6), Domingo (0) → mostrar modal
    return dayOfWeek === 4 || dayOfWeek === 5 || dayOfWeek === 6 || dayOfWeek === 0;
  };

  /**
   * Handler para cuando el usuario selecciona una opción en el StartDayModal
   */
  const handleStartDaySelection = (selectedConfig) => {
    console.log('📅 [STARTDAY] Opción seleccionada:', selectedConfig);
    setPendingStartConfig(selectedConfig);
    setShowStartDayModal(false);

    // Si eligió "vinagre", primero generamos sesión suelta y luego el plan formal
    if (selectedConfig.option === 'vinagre') {
      track('start_day_vinagre_selected', {
        userId: user.id,
        startDate: selectedConfig.startDate,
        component: 'HipertrofiaV2ManualCard'
      });
      // TODO: Generar sesión suelta para hoy
      // Por ahora, continuamos con la generación del plan que empieza el lunes
    }

    // Continuar con la generación usando la configuración seleccionada
    executeGenerate(selectedConfig);
  };

  /**
   * Ejecuta la generación del plan con la configuración dada
   */
  const executeGenerate = async (configOverride = null) => {
    setGenerating(true); // Activar loading local

    try {
      const userLevel = evaluation?.level || 'Principiante';

      console.log('🏋️ [MINDFEED] Generando plan D1-D5 para nivel:', userLevel);

      // 🎯 Preparar configuración de inicio
      const finalStartConfig = configOverride || pendingStartConfig || startConfig || {
        startDate: new Date().toISOString().split('T')[0],
        distributionOption: 'standard',
        includeSaturdays: false
      };

      console.log('📅 [MINDFEED] Configuración de inicio:', finalStartConfig);

      // Llamar al nuevo endpoint de generación D1-D5
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/hipertrofiav2/generate-d1d5`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('authToken')}`
          },
          body: JSON.stringify({
            nivel: userLevel,
            totalWeeks: userLevel === 'Principiante' ? 10 : 12,  // 10 semanas principiante, 12 intermedio/avanzado (teoría MindFeed)
            startConfig: finalStartConfig,
            includeWeek0: true  // Semana 0 de calibración al 70% 1RM
          })
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al generar plan D1-D5');
      }

      const data = await response.json();

      console.log('✅ [MINDFEED] Plan D1-D5 generado:', data);

      // 🔧 TRANSFORMAR ESTRUCTURA: sessions[] → semanas[] para compatibilidad con validatePlanData
      // El plan D1-D5 se repite durante totalWeeks semanas
      const totalWeeks = data.plan.total_weeks || 6;
      const baseSessions = data.plan.sessions.map((session, idx) => ({
        id: session.id || idx,
        dia: session.session_name || session.nombre_sesion || `D${idx + 1}`,
        dia_semana: session.session_name || session.nombre_sesion || `D${idx + 1}`,
        ejercicios: session.ejercicios || session.exercises || []
      }));

      const transformedPlan = {
        ...data.plan,
        methodologyPlanId: data.methodologyPlanId,
        fecha_inicio: new Date().toISOString(),
        // Generar 6 semanas con las mismas 5 sesiones D1-D5 en cada una
        semanas: Array.from({ length: totalWeeks }, (_, weekIdx) => ({
          numero: weekIdx + 1,
          semana: weekIdx + 1,
          sesiones: baseSessions.map((session) => ({
            ...session,
            // Asegurar IDs únicos por semana
            id: `${session.id}-w${weekIdx + 1}`
          }))
        }))
      };

      // Transformar estructura para compatibilidad con onGenerate
      const hipertrofiaV2Data = {
        metodologia: 'HipertrofiaV2_MindFeed',
        mode: 'manual',
        nivel: userLevel,
        ciclo_type: 'D1-D5',
        semanas_totales: data.plan.total_weeks,
        sessions: data.plan.sessions,  // Array de 5 sesiones D1-D5
        methodologyPlanId: data.methodologyPlanId,
        system_info: data.system_info,

        // Estructura compatible con el callback (ahora con semanas[])
        planData: transformedPlan
      };

      console.log('✅ [MINDFEED] Datos transformados, llamando a onGenerate callback');

      // Llamar al callback de MethodologiesScreen
      onGenerate(hipertrofiaV2Data);

    } catch (error) {
      console.error('❌ [MINDFEED] Error generando plan D1-D5:', error);
      alert(`Error al generar plan: ${error.message}`);
    } finally {
      setGenerating(false); // Desactivar loading
    }
  };

  /**
   * Handler principal: Decide si mostrar modal de día o generar directamente
   */
  const handleGenerate = () => {
    if (needsStartDayModal()) {
      track('start_day_modal_shown', {
        userId: user.id,
        dayOfWeek: new Date().getDay(),
        component: 'HipertrofiaV2ManualCard'
      });
      setShowStartDayModal(true);
    } else {
      // Lunes-Miércoles: Generar directamente empezando hoy
      const defaultConfig = {
        option: 'start_today',
        startDate: new Date().toISOString().split('T')[0],
        includeSaturday: false,
        distributionOption: 'standard',
        description: 'Empezar HOY (L-V estándar)'
      };
      executeGenerate(defaultConfig);
    }
  };

  // Iniciar bloque de adaptación
  const handleGenerateAdaptation = async ({ blockType, durationWeeks }) => {
    track('adaptation_generate_start', {
      userId: user.id,
      blockType,
      durationWeeks,
      component: 'HipertrofiaV2ManualCard'
    });

    try {
      const token = localStorage.getItem('authToken');
      const resp = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:3010'}/api/adaptation/generate`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            blockType,
            durationWeeks
          })
        }
      );

      const data = await resp.json();
      if (!resp.ok || data.success === false) {
        throw new Error(data.error || 'No se pudo crear bloque de adaptación');
      }

      track('adaptation_generate_success', {
        userId: user.id,
        blockType,
        durationWeeks,
        blockId: data.blockId,
        component: 'HipertrofiaV2ManualCard'
      });

      await fetchAdaptationProgress();
      setShowAdaptationSelect(false);

      // 🔥 ACTIVAR DASHBOARD DE ADAPTACIÓN después de crear el bloque
      track('adaptation_dashboard_activated', {
        userId: user.id,
        reason: 'block_created_successfully',
        component: 'HipertrofiaV2ManualCard'
      });
      setShowAdaptationDashboard(true);
      setStep('adaptation');

    } catch (err) {
      track('adaptation_generate_error', {
        userId: user.id,
        blockType,
        durationWeeks,
        error: err.message,
        component: 'HipertrofiaV2ManualCard'
      });
      console.error('❌ [ADAPTACIÓN] Error creando bloque:', err);
      alert(err.message || 'Error al crear bloque de adaptación');
    }
  };

  // Transicionar a D1-D5
  const handleTransition = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const resp = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:3010'}/api/adaptation/transition`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          }
        }
      );
      const data = await resp.json();
      if (!resp.ok || data.success === false) {
        throw new Error(data.error || 'No se pudo transicionar');
      }
      // Una vez listo, generar D1-D5
      await handleGenerate();
      setShowTransitionModal(false);
      await fetchAdaptationProgress();
    } catch (err) {
      console.error('❌ [ADAPTACIÓN] Error en transición:', err);
      alert(err.message || 'Error al transicionar a D1-D5');
    }
  };


  return (
    <div className="bg-gray-900">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-6 -mx-6 -mt-6 mb-6 rounded-t-lg">
        <div className="flex items-center gap-3">
          <Dumbbell className="w-8 h-8 text-white" />
          <div>
            <h2 className="text-2xl font-bold text-white">
              Hipertrofia V2 - MindFeed
            </h2>
            <p className="text-blue-100 text-sm">
              Sistema de Periodización Inteligente D1-D5
            </p>
          </div>
        </div>

        {/* Badge de Adaptación si aplica */}
        {evaluation?.level === 'Principiante' && !showAdaptationDashboard && (
          <div className="mt-3">
            <AdaptationTrackingBadge
              loading={adaptation.loading}
              hasBlock={adaptation.hasBlock}
              block={adaptation.block}
              readyForTransition={adaptation.readyForTransition}
              onReload={fetchAdaptationProgress}
              onTransition={() => setShowTransitionModal(true)}
            />
          </div>
        )}
      </div>

      <div>
        {/* Dashboard de Adaptación Mejorado para Principiantes */}
        {showAdaptationDashboard ? (
          <AdaptationDashboard
            userId={user.id}
            onTransitionReady={() => {
              setShowAdaptationDashboard(false);
              setStep('confirmed');
            }}
            onGenerateD1D5={handleGenerate}
          />
        ) : (
          <>
            {/* PASO 1: Evaluación */}
            {step === 'evaluation' && (
            <div className="space-y-6">
              <div className="text-center">
                <Target className="w-16 h-16 text-blue-400 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-white mb-2">
                  Evaluación de Perfil
                </h3>
                <p className="text-gray-400">
                  Analizaremos tu perfil para determinar el nivel adecuado
                </p>
              </div>

              <div className="bg-gray-800/50 border border-blue-500/20 rounded-lg p-6">
                <h4 className="font-semibold text-white mb-3">
                  🎯 Características del Sistema MindFeed:
                </h4>
                <ul className="space-y-2 text-gray-300 text-sm">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                    <span><strong>Ciclo D1-D5:</strong> 5 sesiones rotativas (entrena cuando quieras)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                    <span><strong>Progresión por Microciclo:</strong> +2.5% al completar D1-D5 completo</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                    <span><strong>Tracking RIR:</strong> Registra peso, reps y RIR por serie</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                    <span><strong>Deload Automático:</strong> Cada 6 microciclos completados</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                    <span><strong>Motor de Ciclo:</strong> Avanza solo cuando completas sesiones reales</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                    <span><strong>Ejercicios Clasificados:</strong> Multiarticulares, unilaterales y analíticos</span>
                  </li>
                </ul>
              </div>

              <button
                onClick={handleEvaluate}
                disabled={evaluating}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {evaluating ? (
                  <>
                    <Loader className="w-5 h-5 animate-spin" />
                    Evaluando...
                  </>
                ) : (
                  <>
                    <TrendingUp className="w-5 h-5" />
                    Evaluar Perfil
                  </>
                )}
              </button>
            </div>
          )}

          {/* PASO 2: Confirmación y Generación */}
          {step === 'confirmed' && evaluation && (
            <div className="space-y-6">
              <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-6">
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-6 h-6 text-green-400 flex-shrink-0 mt-1" />
                  <div>
                    <h4 className="font-semibold text-white mb-2">
                      ✅ Evaluación Completada
                    </h4>
                    <div className="space-y-2 text-sm text-gray-300">
                      <p><strong>Nivel:</strong> {evaluation.level}</p>
                      <p><strong>Experiencia:</strong> {evaluation.experience}</p>
                      <p><strong>Recomendación:</strong> {evaluation.recommendation}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-gray-800/50 border border-blue-500/20 rounded-lg p-6">
                <div className="flex items-start gap-3 mb-4">
                  <Calendar className="w-6 h-6 text-blue-400" />
                  <h4 className="font-semibold text-white">
                    🔄 Motor de Ciclo Inteligente
                  </h4>
                </div>
                <p className="text-gray-400 text-sm">
                  El ciclo D1-D5 avanza SOLO cuando completas sesiones reales.
                  Entrena en los días que prefieras - el sistema se adapta a tu calendario y progresa cuando TÚ entrenas.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep('evaluation')}
                  disabled={isLoading || generating}
                  className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-semibold disabled:opacity-50"
                >
                  Volver
                </button>
                {/* Simplificado: siempre permitir generar plan directamente (adaptación opcional en el dashboard) */}
                <button
                  onClick={handleGenerate}
                  disabled={isLoading || generating}
                  className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {(isLoading || generating) ? (
                    <>
                      <Loader className="w-5 h-5 animate-spin" />
                      Generando...
                    </>
                  ) : (
                    'Generar Plan'
                  )}
                </button>
              </div>

              {/* Mensaje de carga visible */}
              {generating && (
                <div className="mt-4 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Loader className="w-5 h-5 text-blue-400 animate-spin flex-shrink-0" />
                    <div>
                      <h4 className="font-semibold text-blue-400 mb-1">
                        La IA está generando tu entrenamiento
                      </h4>
                      <p className="text-sm text-blue-300">
                        Analizando tu perfil para crear la rutina idónea…
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          </>
        )}

        {/* Mostrar error si existe */}
        {error && (
          <div className="mt-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-red-400 mb-1">Error</h4>
                <p className="text-sm text-red-300">{error}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modales de adaptación */}
      <AdaptationBlockSelection
        show={showAdaptationSelect}
        onClose={() => setShowAdaptationSelect(false)}
        onConfirm={handleGenerateAdaptation}
      />

      <AdaptationTransitionModal
        show={showTransitionModal}
        onClose={() => setShowTransitionModal(false)}
        onConfirm={handleTransition}
        block={adaptation.block}
      />

      {/* Modal de selección de día de inicio (Jue-Dom) */}
      <StartDayModal
        isOpen={showStartDayModal}
        onClose={() => setShowStartDayModal(false)}
        onSelect={handleStartDaySelection}
        methodology="HipertrofiaV2"
      />
    </div>
  );
}
