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
    <div className="text-center py-6 px-6 rounded-2xl bg-neutral-900/70 border border-white/10 border-l-2 border-l-yellow-400/35 ring-1 ring-white/5 shadow-[0_25px_60px_-50px_rgba(0,0,0,0.75)] backdrop-blur-lg transition-all duration-300 hover:border-white/20">
      <Dumbbell className="w-12 h-12 text-yellow-300 mx-auto mb-4" />
      <h3 className="text-lg font-semibold text-white mb-2 font-urbanist">
        Entrenamiento de {dayName}
      </h3>
      <p className="text-gray-300/80 mb-4">
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
          className="bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 text-black font-medium hover:from-yellow-200 hover:via-yellow-300 hover:to-amber-400 shadow-[0_12px_30px_-18px_rgba(250,204,21,0.8)]"
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
