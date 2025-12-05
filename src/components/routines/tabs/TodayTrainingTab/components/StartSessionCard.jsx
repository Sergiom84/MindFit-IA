/**
 * @fileoverview Componente para iniciar/reanudar sesión de entrenamiento
 *
 * Muestra el botón principal para iniciar o reanudar una sesión
 *
 * @module components/routines/tabs/TodayTrainingTab/components/StartSessionCard
 */

import React from 'react';
import { Dumbbell, Play, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Tarjeta para iniciar/reanudar sesión
 *
 * @param {Object} props
 * @param {string} props.dayName - Nombre del día actual
 * @param {number} props.exerciseCount - Número de ejercicios programados
 * @param {boolean} props.hasExistingSession - Si existe sesión previa
 * @param {boolean} props.isLoading - Si está cargando
 * @param {boolean} props.isLoadingStatus - Si está cargando el estado
 * @param {boolean} props.isStarting - Si está iniciando sesión
 * @param {Function} props.onStartSession - Handler para iniciar sesión
 * @param {Function} props.onResumeSession - Handler para reanudar sesión
 * @param {Function} props.onClick - Handler personalizado (override de lógica interna)
 */
export function StartSessionCard({
  dayName,
  exerciseCount = 0,
  hasExistingSession = false,
  isLoading = false,
  isLoadingStatus = false,
  isStarting = false,
  onStartSession,
  onResumeSession,
  onClick
}) {
  const handleClick = () => {
    // Si hay onClick personalizado, usarlo
    if (onClick) {
      onClick();
      return;
    }
    // Lógica por defecto
    if (hasExistingSession) {
      onResumeSession?.();
    } else {
      onStartSession?.(0);
    }
  };

  return (
    <div className="text-center py-6">
      <Dumbbell className="w-12 h-12 text-yellow-400 mx-auto mb-4" />
      <h3 className="text-lg font-medium text-white mb-2">
        Entrenamiento de {dayName}
      </h3>
      <p className="text-gray-400 mb-4">
        {exerciseCount} ejercicios programados
      </p>

      {isLoadingStatus ? (
        <div className="flex items-center justify-center gap-2 text-gray-400">
          <RefreshCw className="h-5 w-5 animate-spin" />
          <span>Verificando progreso...</span>
        </div>
      ) : (
        <Button
          onClick={handleClick}
          className="bg-yellow-500 hover:bg-yellow-600 text-black font-medium"
          disabled={isLoading || isStarting}
        >
          {isStarting ? (
            <>
              <RefreshCw className="h-5 w-5 animate-spin mr-2" />
              Iniciando...
            </>
          ) : (
            <>
              <Play className="h-5 w-5 mr-2" />
              {hasExistingSession ? 'Reanudar Entrenamiento' : 'Iniciar Entrenamiento'}
            </>
          )}
        </Button>
      )}
    </div>
  );
}

export default StartSessionCard;

