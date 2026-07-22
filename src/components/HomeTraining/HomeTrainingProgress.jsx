import React from 'react';
import { TrendingUp, Clock, Target, Calendar } from 'lucide-react';
import HomeTrainingUserProgressCard from './HomeTrainingUserProgressCard';
import { UserProfileDisplay } from '../routines/summary/UserProfileDisplay';

const HomeTrainingProgress = ({
  currentPlan,
  sessionExercises = [],
  progress,
  userStats,
  onContinueTraining,
  onGenerateNewPlan,
  onCancelAll,
  onGenerateNewAfterCompleted
}) => {
  const formatDuration = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const getNivelLabel = (nivel) => {
    const niveles = {
      'principiante': 'Principiante',
      'intermedio': 'Intermedio',
      'avanzado': 'Avanzado'
    };
    return niveles[nivel] || 'Intermedio';
  };

  const getEquipmentLabel = (equipment) => {
    const equipments = {
      'minimo': 'Mínimo',
      'basico': 'Básico',
      'avanzado': 'Avanzado'
    };
    return equipments[equipment] || equipment;
  };

  const getTrainingTypeLabel = (type) => {
    const types = {
      'funcional': 'Funcional',
      'hiit': 'HIIT',
      'fuerza': 'Fuerza'
    };
    return types[type] || type;
  };
  const cardBase = 'bg-neutral-900/70 border border-white/10 ring-1 ring-white/5 shadow-[0_25px_60px_-50px_rgba(0,0,0,0.8)] backdrop-blur-lg';

  if (!currentPlan) {
    return null;
  }

  return (
    <div className="max-w-4xl mx-auto mb-8">
      {/* Estadísticas del usuario */}
      {userStats && (
        <HomeTrainingUserProgressCard userStats={userStats} />
      )}

      {/* Plan actual */}
      <div className={`${cardBase} rounded-2xl p-6`}>
        <div className="flex items-center mb-4 gap-2">
          <Target className="text-yellow-300" size={22} />
          <h3 className="text-xl font-semibold text-yellow-200 font-urbanist">
            {(getTrainingTypeLabel(currentPlan.training_type) || 'ENTRENAMIENTO').toUpperCase()} en Casa
          </h3>
        </div>
        
        <p className="text-gray-200/80 mb-4">Entrenamiento personalizado adaptado a tu equipamiento</p>

        <div className="space-y-2 text-sm mb-6">
          <p className="text-gray-200/80">
            <span className="font-semibold">Fuente del plan:</span> {currentPlan.plan_source?.label || 'OpenAI'}{currentPlan.plan_source?.detail ? ` (${currentPlan.plan_source.detail})` : ''}
          </p>

          {/* Perfil del usuario con detalles completos */}
          <div className="mt-4 bg-white/5 border border-white/10 rounded-xl p-4">
            <UserProfileDisplay />
          </div>
        </div>

        {/* Barra de progreso */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <span className="text-white font-semibold">Progreso</span>
            <span className="text-white font-semibold">{Math.round(progress.percentage)}%</span>
          </div>
          <div className="w-full bg-white/10 rounded-full h-3">
            <div 
              className="bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 h-3 rounded-full transition-all duration-500"
              style={{ width: `${progress.percentage}%` }}
            ></div>
          </div>
        </div>

        {/* Información del entrenamiento */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-gray-200/70 mb-6">
          <div className="flex items-center">
            <Calendar size={16} className="mr-2" />
            <span>Fecha: {new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })}</span>
          </div>
          <div className="flex items-center">
            <Target size={16} className="mr-2" />
            <span>Equipo: {getEquipmentLabel(currentPlan.equipment_type)}</span>
          </div>
          <div className="flex items-center">
            <TrendingUp size={16} className="mr-2" />
            <span>Tipo: {getTrainingTypeLabel(currentPlan.training_type)}</span>
          </div>
          <div className="flex items-center">
            <Clock size={16} className="mr-2" />
            <span>Duración estimada: {currentPlan.estimated_duration} min</span>
          </div>
        </div>

        {/* Lista de ejercicios con progreso */}
        {currentPlan.exercises && (
          <div className="mb-6">
            <h4 className="text-lg font-semibold text-white mb-4 font-urbanist">Ejercicios del Plan</h4>
            <div className="space-y-3">
              {currentPlan.exercises.map((ejercicio, idx) => {
                // Enlazar datos del backend (status/feedback y total_series) si existen
                const exSession = sessionExercises?.find(e => e.exercise_order === idx);
                // No marcar "en progreso" por defecto: sólo si el backend lo reporta
                const status = exSession?.status
                  ? exSession.status
                  : (progress.completedExercises.includes(idx) ? 'completed' : 'pending');
                const isCompleted = status === 'completed';
                const isCurrent = status === 'in_progress';
                const sentiment = exSession?.feedback_sentiment;
                const comment = exSession?.feedback_comment || exSession?.comment;

                return (
                  <div
                    key={idx}
                    className={`rounded-xl p-4 border ${
                      isCompleted
                        ? 'bg-emerald-500/10 border-emerald-400/40'
                        : isCurrent
                        ? 'bg-blue-500/10 border-blue-400/40'
                        : status === 'cancelled'
                        ? 'bg-red-500/10 border-red-400/40'
                        : status === 'skipped'
                        ? 'bg-yellow-400/10 border-yellow-400/30'
                        : 'bg-white/5 border-white/10'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <h5 className={`font-semibold ${
                        isCompleted ? 'text-emerald-300' : isCurrent ? 'text-blue-300' : status === 'cancelled' ? 'text-red-300' : 'text-white'
                      }`}>
                        {ejercicio.nombre}
                        {isCompleted && (
                          <span className="ml-2 text-xs">
                            ✓ Completado
                            {sentiment && <span className="ml-1 text-yellow-300 font-medium">• {sentiment === 'like' ? 'Me gusta' : sentiment === 'hard' ? 'Es difícil' : 'No me gusta'}</span>}
                          </span>
                        )}
                        {!isCompleted && isCurrent && <span className="ml-2 text-xs text-blue-300">• En progreso</span>}
                        {!isCompleted && !isCurrent && status === 'skipped' && (
                          <span className="ml-2 text-xs text-gray-300">
                            • Saltado
                            {sentiment && <span className="ml-1 text-yellow-300 font-medium">• {sentiment === 'like' ? 'Me gusta' : sentiment === 'hard' ? 'Es difícil' : 'No me gusta'}</span>}
                          </span>
                        )}
                        {!isCompleted && !isCurrent && status === 'cancelled' && (
                          <span className="ml-2 text-xs text-red-300">
                            • Cancelado
                            {sentiment && <span className="ml-1 text-yellow-300 font-medium">• {sentiment === 'like' ? 'Me gusta' : sentiment === 'hard' ? 'Es difícil' : 'No me gusta'}</span>}
                          </span>
                        )}
                      </h5>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm text-gray-200/80 mt-2">
                      <span>Series: {ejercicio.series}</span>
                      {ejercicio.repeticiones && <span>Reps: {ejercicio.repeticiones}</span>}
                      {ejercicio.duracion_seg && <span>Duración: {ejercicio.duracion_seg}s</span>}
                      <span>Descanso: {ejercicio.descanso_seg}s</span>
                    </div>

                    {ejercicio.notas && (
                      <p className="text-xs text-gray-300/70 italic mt-2">{ejercicio.notas}</p>
                    )}

                    {/* Mostrar comentario del usuario si existe */}
                    {comment && comment.trim() && (
                      <div className="mt-2 p-2 bg-yellow-400/10 border border-yellow-400/30 rounded text-xs">
                        <span className="text-yellow-400 font-medium">Mi comentario: </span>
                        <span className="text-yellow-200">{comment}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Botones de acción */}
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
          {progress.percentage < 100 ? (
            <>
              <div className="flex gap-3 sm:gap-4 flex-1">
                <button
                  onClick={onGenerateNewPlan}
                  className="flex-1 bg-white/10 hover:bg-white/15 text-white font-semibold py-3 px-6 rounded-xl transition-colors duration-200 border border-white/10 hover:border-yellow-400/30"
                >
                  Generar Otro Plan
                </button>
                <button
                  onClick={onContinueTraining}
                  className="flex-1 bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 hover:from-yellow-200 hover:via-yellow-300 hover:to-amber-400 text-black font-semibold py-3 px-6 rounded-xl transition-all duration-200 shadow-[0_12px_30px_-18px_rgba(250,204,21,0.8)]"
                >
                  {progress.percentage === 0 ? 'Comenzar Entrenamiento' : 'Continuar Entrenamiento'}
                </button>
              </div>
              {/* Botón para cancelar todo y reiniciar - SOLO si no está completado */}
              <button
                onClick={onCancelAll}
                className="bg-red-500/10 hover:bg-red-500/20 text-red-200 font-semibold py-3 px-6 rounded-xl transition-colors duration-200 border border-red-400/30"
              >
                Cancelar todo
              </button>
            </>
          ) : (
            /* 🎉 ENTRENAMIENTO COMPLETADO */
            <div className="w-full space-y-4">
              {/* Mensaje de completado con tiempo y fecha */}
              <div className="bg-emerald-500/10 border border-emerald-400/40 rounded-2xl p-4">
                <div className="text-center">
                  <p className="text-emerald-300 font-bold text-lg mb-2">
                    🎉 ¡Has completado el entrenamiento!
                  </p>
                  <p className="text-emerald-200 text-sm">
                    Tiempo total: <span className="font-semibold">
                      {(() => {
                        // Calcular tiempo total sumando duration_seconds de todos los ejercicios
                        const totalSeconds = sessionExercises?.reduce((acc, ex) => {
                          return acc + (ex.duration_seconds || 0);
                        }, 0) || 0;

                        if (totalSeconds === 0) return 'N/A';

                        const hours = Math.floor(totalSeconds / 3600);
                        const minutes = Math.floor((totalSeconds % 3600) / 60);
                        const seconds = totalSeconds % 60;

                        if (hours > 0) {
                          return `${hours}h ${minutes}m ${seconds}s`;
                        } else if (minutes > 0) {
                          return `${minutes}m ${seconds}s`;
                        } else {
                          return `${seconds}s`;
                        }
                      })()}
                    </span>
                  </p>
                  <p className="text-emerald-200 text-sm">
                    Fecha: <span className="font-semibold">
                      {new Date().toLocaleDateString('es-ES', {
                        day: '2-digit',
                        month: '2-digit'
                      })} {new Date().toLocaleTimeString('es-ES', {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </p>
                </div>
              </div>

              {/* Botón para generar nuevo entrenamiento */}
              <button
                onClick={onGenerateNewAfterCompleted}
                className="w-full bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 hover:from-yellow-200 hover:via-yellow-300 hover:to-amber-400 text-black font-semibold py-3 px-6 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 shadow-[0_12px_30px_-18px_rgba(250,204,21,0.8)]"
              >
                <Target size={20} />
                Generar otro entrenamiento
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default HomeTrainingProgress;
