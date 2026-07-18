import { ArrowLeft, BarChart3 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { memo, useCallback } from 'react';
import HomeTrainingExerciseModal from './HomeTrainingExerciseModal';
import HomeTrainingProgress from './HomeTrainingProgress';
import HomeTrainingPlanModal from './HomeTrainingPlanModal';
import HomeTrainingRejectionModal from './HomeTrainingRejectionModal';
import HomeTrainingPreferencesHistory from './HomeTrainingPreferencesHistory';
import HomeTrainingWarmupModal from './HomeTrainingWarmupModal';
import HomeTrainingBackground from './HomeTrainingBackground';
import EquipmentGrid from './EquipmentGrid';
import TrainingTypeTabs from './TrainingTypeTabs';
import TrainingGuideCard from './TrainingGuideCard';
import GenerateTrainingCard from './GenerateTrainingCard';
import PersonalizedMessageModal from './PersonalizedMessageModal';
import GeneratingLoaderModal from './GeneratingLoaderModal';
import useHomeTrainingSession from './useHomeTrainingSession';

const HomeTrainingSection = () => {
  const navigate = useNavigate();
  const {
    track,
    mousePosition,
    selectedEquipment,
    setSelectedEquipment,
    selectedTrainingType,
    setSelectedTrainingType,
    isGenerating,
    showPersonalizedMessage,
    personalizedMessage,
    generatedPlan,
    currentSession,
    showExerciseModal,
    setShowExerciseModal,
    showWarmupModal,
    currentExerciseIndex,
    sessionProgress,
    exercisesProgress,
    userStats,
    showProgress,
    showRejectionModal,
    setShowRejectionModal,
    showPreferencesHistory,
    setShowPreferencesHistory,
    resetToInitialState,
    cancelRoutineCompletely,
    loadSessionProgress,
    generateTraining,
    proceedToGenerating,
    handleExerciseRejections,
    handleSkipRejection,
    regenerateWithRejectionModal,
    startTraining,
    continueTraining,
    handleWarmupComplete,
    handleWarmupSkip,
    handleExerciseComplete,
    handleExerciseSkip,
    handleExerciseCancel,
    handleUpdateProgress
  } = useHomeTrainingSession();

  const handleSelectEquipment = useCallback((id, title) => {
    setSelectedEquipment(id);
    try {
      track('CARD_CLICK', { id, title, group: 'equipment' }, { component: 'HomeTrainingSection' });
    } catch {
      // Ignore tracking errors
    }
  }, [setSelectedEquipment, track]);

  const handleSelectTrainingType = useCallback((id, title) => {
    setSelectedTrainingType(id);
    try {
      track('TAB_CLICK', { id, title, group: 'training-type' }, { component: 'HomeTrainingSection' });
    } catch {
      // Ignore tracking errors
    }
  }, [setSelectedTrainingType, track]);

  // Si está mostrando el historial de preferencias, renderizar solo ese componente
  if (showPreferencesHistory) {
    return (
      <HomeTrainingPreferencesHistory
        onBack={() => setShowPreferencesHistory(false)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#050506] text-white relative overflow-hidden font-body">
      <HomeTrainingBackground mousePosition={mousePosition} />
      <div className="relative z-10 container mx-auto px-4 py-8">
        <div className="space-y-10">
          <header className="space-y-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-3">
                <p className="text-xs uppercase tracking-[0.4em] text-yellow-200/80">Entrenamiento en casa</p>
                <h1 className="text-4xl md:text-5xl font-semibold font-urbanist">
                  Entrenamiento en Casa
                </h1>
                <p className="text-gray-200/80 max-w-2xl">
                  Modalidad multifuncional diseñada para maximizar resultados con el equipamiento
                  que tengas disponible, adaptándose a tu espacio y nivel.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => navigate('/')}
                  className="flex items-center gap-2 text-gray-200 hover:text-white transition-all duration-200 px-4 py-2 rounded-full border border-white/10 bg-white/5 hover:border-yellow-400/30"
                >
                  <ArrowLeft size={18} />
                  Volver al inicio
                </button>
                <button
                  onClick={() => setShowPreferencesHistory(true)}
                  className="flex items-center gap-2 text-yellow-200 hover:text-yellow-100 transition-all duration-200 px-4 py-2 rounded-full border border-yellow-400/30 bg-yellow-400/10 hover:bg-yellow-400/20"
                >
                  <BarChart3 size={18} />
                  Mis Preferencias
                </button>
              </div>
            </div>
          </header>

          {/* Tarjetas de equipamiento */}
          <EquipmentGrid
            selectedEquipment={selectedEquipment}
            onSelectEquipment={handleSelectEquipment}
          />

          {/* Fila de tipos de entrenamiento */}
          <TrainingTypeTabs
            selectedTrainingType={selectedTrainingType}
            onSelectTrainingType={handleSelectTrainingType}
          />

          {/* Tarjeta informativa */}
          {selectedTrainingType && (
            <TrainingGuideCard trainingType={selectedTrainingType} />
          )}

          {/* Tarjeta de generar entrenamiento */}
          {selectedEquipment && selectedTrainingType && !isGenerating && !generatedPlan && (
            <GenerateTrainingCard
              selectedEquipment={selectedEquipment}
              selectedTrainingType={selectedTrainingType}
              isGenerating={isGenerating}
              onGenerate={generateTraining}
            />
          )}

          {/* Modal de mensaje personalizado (Paso 3) */}
          {showPersonalizedMessage && !showProgress && !showExerciseModal && (
            <PersonalizedMessageModal
              personalizedMessage={personalizedMessage}
              onProceed={proceedToGenerating}
            />
          )}

          {/* Modal de carga (Paso 4) */}
          {isGenerating && <GeneratingLoaderModal />}

          {/* Mostrar progreso si hay un plan activo */}
          {showProgress && generatedPlan && !showExerciseModal && (
            <HomeTrainingProgress
              currentPlan={{
                ...generatedPlan.plan_entrenamiento,
                equipment_type: selectedEquipment,
                training_type: selectedTrainingType,
                user_profile: generatedPlan.plan_entrenamiento.perfil_usuario,
                estimated_duration: generatedPlan.plan_entrenamiento.duracion_estimada_min,
                exercises: generatedPlan.plan_entrenamiento.ejercicios
              }}
              sessionExercises={exercisesProgress}
              progress={sessionProgress}
              userStats={userStats}
              onContinueTraining={
                currentSession?.status === 'completed' || sessionProgress?.percentage >= 100
                  ? startTraining
                  : currentSession
                    ? continueTraining
                    : startTraining
              }
              onGenerateNewPlan={regenerateWithRejectionModal}
              onCancelAll={cancelRoutineCompletely}
              onGenerateNewAfterCompleted={resetToInitialState}
            />
          )}

          {/* Modal de resultado */}
          {generatedPlan && !showProgress && (
            <HomeTrainingPlanModal
              plan={generatedPlan.plan_entrenamiento}
              planSource={generatedPlan.plan_source}
              personalizedMessage={generatedPlan.mensaje_personalizado}
              onStart={startTraining}
              onGenerateAnother={regenerateWithRejectionModal}
              onClose={resetToInitialState}
              onCancel={cancelRoutineCompletely}
            />
          )}

          {showWarmupModal && (
            <HomeTrainingWarmupModal
              isOpen={showWarmupModal}
              trainingType={selectedTrainingType || generatedPlan?.plan_entrenamiento?.tipoEntrenamiento || 'funcional'}
              level={userStats?.training_level || userStats?.nivel_entrenamiento || userStats?.level || 'intermedio'}
              onSkip={handleWarmupSkip}
              onComplete={handleWarmupComplete}
              onClose={handleWarmupSkip}
            />
          )}

          {/* Modal de ejercicio individual */}
          {showExerciseModal &&
            generatedPlan &&
            generatedPlan.plan_entrenamiento.ejercicios &&
            generatedPlan.plan_entrenamiento.ejercicios[currentExerciseIndex] && (
            <HomeTrainingExerciseModal
              exercise={generatedPlan.plan_entrenamiento.ejercicios[currentExerciseIndex]}
              exerciseIndex={currentExerciseIndex}
              totalExercises={generatedPlan.plan_entrenamiento.ejercicios.length}
              isLastExercise={currentExerciseIndex >= generatedPlan.plan_entrenamiento.ejercicios.length - 1}
              onComplete={handleExerciseComplete}
              onSkip={handleExerciseSkip}
              onCancel={handleExerciseCancel}
              onClose={() => setShowExerciseModal(false)}
              onUpdateProgress={handleUpdateProgress}
              overrideSeriesTotal={exercisesProgress?.[currentExerciseIndex]?.total_series}
              sessionId={currentSession?.id}
              onFeedbackSubmitted={() => currentSession?.id && loadSessionProgress(currentSession.id)}
            />
          )}

          {/* Modal de rechazo de ejercicios */}
          {showRejectionModal && generatedPlan && generatedPlan.plan_entrenamiento?.ejercicios && (
            <HomeTrainingRejectionModal
              exercises={generatedPlan.plan_entrenamiento.ejercicios}
              equipmentType={selectedEquipment}
              trainingType={selectedTrainingType}
              onReject={handleExerciseRejections}
              onSkip={handleSkipRejection}
              onClose={() => setShowRejectionModal(false)}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default memo(HomeTrainingSection);
