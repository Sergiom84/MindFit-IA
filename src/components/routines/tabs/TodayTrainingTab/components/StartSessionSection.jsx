/**
 * @fileoverview Sección "Iniciar / Reanudar sesión del día" (ARCH-002)
 *
 * Bloque presentacional extraído del monolito. Renderiza la tarjeta de
 * inicio/reanudación (StartSessionCard) y la lista de ejercicios del día.
 * Toda la lógica de decisión (reanudar vs iniciar) llega por callbacks; este
 * componente no mantiene estado propio y preserva el comportamiento original.
 *
 * @module components/routines/tabs/TodayTrainingTab/components/StartSessionSection
 */

import { ExerciseList, StartSessionCard } from './index';

export default function StartSessionSection({
  currentTodayName,
  todaySessionData,
  todayStatus,
  ui,
  loadingTodayStatus,
  isLoadingSession,
  shouldResume,
  hasUnfinishedWorkToday,
  hasActiveSession,
  handleResumeSession,
  handleStartSession,
  exerciseProgress,
  session,
  estimatedDuration,
  plan,
  hasCompletedSession
}) {
  return (
    <section className="transition-opacity duration-300 ease-in-out opacity-100">

      {/* Componente modular para iniciar/reanudar sesión */}
      <StartSessionCard
        dayName={currentTodayName}
        exerciseCount={todaySessionData?.ejercicios?.length || 0}
        hasExistingSession={Boolean(todayStatus?.session?.id)}
        isLoading={ui.isLoading}
        isLoadingStatus={loadingTodayStatus && !todayStatus}
        isStarting={isLoadingSession}
        onClick={() => {
          // 🎯 FIX: Verificar si existe sesión en BD antes de decidir
          const hasExistingSession = Boolean(todayStatus?.session?.id);

          console.log('🔍 DEBUG Button Click Decision:', {
            hasExistingSession,
            sessionId: todayStatus?.session?.id,
            shouldResume,
            hasUnfinishedWorkToday,
            todayStatusCanResume: todayStatus?.session?.canResume,
            sessionStatus: todayStatus?.session?.session_status,
            hasActiveSession
          });

          // 🎯 LÓGICA CORREGIDA:
          // - Si existe sesión en BD → Reanudar
          // - Si NO existe sesión en BD → Iniciar nueva
          if (hasExistingSession && (shouldResume || hasUnfinishedWorkToday)) {
            handleResumeSession();
          } else {
            handleStartSession(0);
          }
        }}
      />

      {/* Lista de ejercicios - Componente modular */}
      {todaySessionData?.ejercicios && todaySessionData.ejercicios.length > 0 && !hasCompletedSession && (
        <div className="mt-6">
          <ExerciseList
            exercises={todaySessionData.ejercicios}
            todayStatus={todayStatus}
            exerciseProgress={exerciseProgress}
            session={session}
            hasActiveSession={hasActiveSession}
            dayName={currentTodayName}
            estimatedDuration={estimatedDuration}
            methodologyType={plan.methodologyType || 'Rutina'}
          />
        </div>
      )}
    </section>
  );
}
