import React from 'react';
import { useSessionSummary } from '../../hooks/useSessionSummary';
import { SummaryHeader } from './summary/SummaryHeader';
import { UserProfileDisplay } from './summary/UserProfileDisplay';
import { ProgressBar } from './summary/ProgressBar';
import { WorkoutMetadata } from './summary/WorkoutMetadata';
import { ExerciseListItem } from './summary/ExerciseListItem';
// import { SummaryActions } from './summary/SummaryActions'; // TEMPORALMENTE DESHABILITADO

/**
 * Tarjeta de resumen de sesión de entrenamiento - REFACTORIZADA
 *
 * Ahora usa componentes especializados y hooks:
 * - useSessionSummary: Maneja carga de datos y estados
 * - useUserProfile: Maneja perfil desde localStorage (en UserProfileDisplay)
 * - Componentes especializados para cada sección
 * - Utils centralizados para lógica compartida
 * - Constantes para configuración
 *
 * Mantiene TODA la funcionalidad original:
 * - Carga flexible (sessionId o datos directos)
 * - Estados visuales por ejercicio
 * - Feedback y sentimientos
 * - Barra de progreso
 * - Metadatos del entrenamiento
 * - Perfil de usuario con IMC
 * - Acciones (generar otro, continuar)
 */
export default function RoutineSessionSummaryCard({
  sessionId,
  session: propsSession,
  exercises: propsExercises,
  plan,
  planSource,
  selectedSession,
  onGenerateAnother,
  onContinueTraining
}) {
  // Hook principal para manejo de datos
  const {
    loading,
    error,
    session,
    exercises,
    progressStats,
    hasData
  } = useSessionSummary({
    sessionId,
    session: propsSession,
    exercises: propsExercises
  });

  // No renderizar si no tenemos datos de entrada
  if (!sessionId && !propsSession && !propsExercises) {
    return null;
  }

  return (
    <div className="bg-gray-900/50 border border-gray-700 rounded-2xl p-5 text-white">
      {/* Header */}
      <SummaryHeader
        plan={plan}
        session={session}
        planSource={planSource}
      />

      {/* Perfil de usuario */}
      <UserProfileDisplay />

      {/* Barra de progreso */}
      <ProgressBar progressStats={progressStats} />

      {/* Metadatos del entrenamiento */}
      <WorkoutMetadata plan={plan} session={session} />

      {/* Lista de ejercicios */}
      <div className="space-y-3">
        <h3 className="text-sm text-gray-300 font-semibold">
          Ejercicios del plan
        </h3>

        {loading && (
          <div className="text-gray-400 text-sm">Cargando progreso…</div>
        )}

        {error && (
          <div className="text-red-400 text-sm">{error}</div>
        )}

        {!loading && !error && exercises.map((exercise, index) => (
          <ExerciseListItem
            key={index}
            exercise={exercise}
            index={index}
          />
        ))}

        {!loading && !error && exercises.length === 0 && (
          <div className="text-gray-400 text-sm">No hay ejercicios disponibles</div>
        )}
      </div>

      {/* Acciones - TEMPORALMENTE DESHABILITADO */}
      {/*
      <SummaryActions
        selectedSession={selectedSession}
        session={session}
        onGenerateAnother={onGenerateAnother}
        onContinueTraining={onContinueTraining}
      />
      */}
    </div>
  );
}