/**
 * 📋 Exercise List - Lista de ejercicios del día actual
 * 
 * RAZONAMIENTO:
 * - Extraído de TodayTrainingTab.jsx para reducir complejidad
 * - Componente especializado en mostrar ejercicios de la sesión
 * - Reutilizable y con mejor separación de responsabilidades
 */

import { Button } from '../../ui/button';
import { Card, CardContent } from '../../ui/card';
import { Badge } from '../../ui/badge';
import { Clock, Target, Zap } from 'lucide-react';
import { formatExerciseName, getSentimentIcon, getExerciseStatus } from '../../../utils/exerciseUtils';
import SafeComponent from '../../ui/SafeComponent';

/**
 * Componente individual para mostrar un ejercicio
 */
const ExerciseCard = ({ 
  exercise, 
  exerciseIndex, 
  sessionStatus, 
  onStartSession 
}) => {
  const exerciseData = sessionStatus?.exercises?.[exerciseIndex];
  const status = getExerciseStatus(exerciseData);
  const feedback = exerciseData?.feedback;
  const sentimentData = feedback?.sentiment ? getSentimentIcon(feedback.sentiment) : null;

  return (
    <Card className="bg-gray-800/50 border-gray-700 hover:border-gray-600 transition-colors">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-medium text-white truncate pr-2">
            {formatExerciseName(exercise.nombre)}
          </h4>
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Badge de estado */}
            <Badge 
              variant="outline" 
              className={`${status.color} ${status.bg} ${status.border} text-xs`}
            >
              {status.icon} {status.label}
            </Badge>
            
            {/* Indicador de sentimiento si existe */}
            {sentimentData && (
              <div className={`p-1 rounded ${sentimentData.bg} ${sentimentData.border} border`}>
                <sentimentData.icon className={`w-3 h-3 ${sentimentData.color}`} />
              </div>
            )}
          </div>
        </div>

        {/* Detalles del ejercicio */}
        <div className="grid grid-cols-3 gap-2 mb-3 text-sm">
          <div className="flex items-center gap-1 text-gray-400">
            <Target className="w-3 h-3" />
            <span>{exercise.series} series</span>
          </div>
          <div className="flex items-center gap-1 text-gray-400">
            <Zap className="w-3 h-3" />
            <span>{exercise.repeticiones} reps</span>
          </div>
          <div className="flex items-center gap-1 text-gray-400">
            <Clock className="w-3 h-3" />
            <span>{exercise.descanso}</span>
          </div>
        </div>

        {/* Comentario de feedback si existe */}
        {feedback?.comment && (
          <div className="mb-3 p-2 bg-gray-900/50 rounded text-xs text-gray-300 italic">
            "{feedback.comment}"
          </div>
        )}

        {/* Progreso de series si está en progreso */}
        {exerciseData?.series_completed !== undefined && exerciseData?.total_series && (
          <div className="mb-3">
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>Progreso</span>
              <span>{exerciseData.series_completed}/{exerciseData.total_series} series</span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2">
              <div 
                className="bg-yellow-400 h-2 rounded-full transition-all duration-300"
                style={{ 
                  width: `${(exerciseData.series_completed / exerciseData.total_series) * 100}%` 
                }}
              />
            </div>
          </div>
        )}

        {/* Notas del ejercicio si existen */}
        {exercise.notas && (
          <div className="text-xs text-gray-400 mb-3 italic">
            {exercise.notas}
          </div>
        )}

        {/* Botón de acción según el estado */}
        {status.label === 'Pendiente' && (
          <Button
            onClick={() => onStartSession(exerciseIndex)}
            className="w-full bg-yellow-400 text-black hover:bg-yellow-500 text-sm"
            size="sm"
          >
            Comenzar ejercicio
          </Button>
        )}
        
        {status.label === 'Completado' && exerciseData?.duration_seconds && (
          <div className="text-center text-xs text-green-400">
            Completado en {Math.round(exerciseData.duration_seconds / 60)} minutos
          </div>
        )}
      </CardContent>
    </Card>
  );
};

/**
 * Lista principal de ejercicios
 */
export const ExerciseList = ({ 
  exercises, 
  sessionStatus, 
  onStartSession,
  className = ""
}) => {
  if (!exercises || exercises.length === 0) {
    return (
      <SafeComponent context="ExerciseList" showMinimalError>
        <div className={`text-center py-8 ${className}`}>
          <div className="text-gray-400 mb-2">
            No hay ejercicios programados para hoy
          </div>
          <div className="text-sm text-gray-500">
            ¡Día de descanso! 🎉
          </div>
        </div>
      </SafeComponent>
    );
  }

  return (
    <SafeComponent context="ExerciseList">
      <div className={`space-y-4 ${className}`}>
        {exercises.map((exercise, index) => (
          <ExerciseCard
            key={index}
            exercise={exercise}
            exerciseIndex={index}
            sessionStatus={sessionStatus}
            onStartSession={onStartSession}
          />
        ))}
      </div>
    </SafeComponent>
  );
};

/**
 * Resumen de progreso de la sesión
 */
export const SessionProgressSummary = ({ sessionStatus }) => {
  if (!sessionStatus?.summary) {
    return null;
  }

  const { summary } = sessionStatus;
  const total = (summary.completed || 0) + (summary.skipped || 0) + (summary.cancelled || 0);
  const remaining = (sessionStatus.exercises?.length || 0) - total;

  if (total === 0) {
    return null;
  }

  return (
    <SafeComponent context="SessionProgressSummary" showMinimalError>
      <Card className="bg-gray-800/30 border-gray-700">
        <CardContent className="p-4">
          <h4 className="text-sm font-medium text-gray-300 mb-3">
            Resumen de la sesión
          </h4>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
            <div className="space-y-1">
              <div className="text-lg font-bold text-green-400">
                {summary.completed || 0}
              </div>
              <div className="text-xs text-gray-400">Completados</div>
            </div>
            
            <div className="space-y-1">
              <div className="text-lg font-bold text-orange-400">
                {summary.skipped || 0}
              </div>
              <div className="text-xs text-gray-400">Saltados</div>
            </div>
            
            <div className="space-y-1">
              <div className="text-lg font-bold text-red-400">
                {summary.cancelled || 0}
              </div>
              <div className="text-xs text-gray-400">Cancelados</div>
            </div>
            
            <div className="space-y-1">
              <div className="text-lg font-bold text-gray-400">
                {remaining}
              </div>
              <div className="text-xs text-gray-400">Pendientes</div>
            </div>
          </div>

          {summary.isComplete && (
            <div className="mt-3 text-center">
              <Badge variant="outline" className="text-green-400 bg-green-900/20 border-green-500/20">
                🎉 ¡Sesión completada!
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>
    </SafeComponent>
  );
};

export default ExerciseList;