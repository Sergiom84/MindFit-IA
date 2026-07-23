import React, { useState } from 'react';
import { X, Calendar, TrendingUp, Clock } from 'lucide-react';

/**
 * Modal de Distribución de Sesiones
 * Aparece cuando el usuario comienza en un día que no es Lunes
 * Pregunta: ¿Entrenar sábados o añadir semana extra?
 */
const SessionDistributionModal = ({ isOpen, onClose, onConfirm, config }) => {
  const [selectedOption, setSelectedOption] = useState(null);

  if (!isOpen || !config) return null;

  const {
    startDay,
    totalSessions = 30,
    sessionsPerWeek = 5,
    missingSessions = 1
  } = config;

  const handleConfirm = () => {
    if (!selectedOption) return;
    onConfirm(selectedOption);
  };

  // Calcular distribución para cada opción
  const optionA = {
    id: 'saturdays',
    title: '📅 Entrenar Sábados (Recomendado)',
    description: `Completarás las ${totalSessions} sesiones en ${Math.ceil(totalSessions / 6)} semanas exactas`,
    details: [
      `Semanas 1-${Math.floor(totalSessions / 6)}: ${startDay}-Sábado (6 sesiones/semana)`,
      totalSessions % 6 > 0 ? `Última semana: ${totalSessions % 6} sesión(es)` : null
    ].filter(Boolean),
    color: 'blue',
    weeks: Math.ceil(totalSessions / 6)
  };

  const optionB = {
    id: 'extra_week',
    title: '🗓️ Añadir Semana Extra',
    description: `Completarás las ${totalSessions} sesiones en ${Math.ceil((totalSessions - (sessionsPerWeek - missingSessions)) / sessionsPerWeek) + 1} semanas`,
    details: [
      `Semana 1: ${startDay}-Viernes (${sessionsPerWeek - missingSessions} sesiones)`,
      `Semanas 2-${Math.floor((totalSessions - (sessionsPerWeek - missingSessions)) / sessionsPerWeek) + 1}: Lunes-Viernes (${sessionsPerWeek} sesiones/semana)`,
      `Última semana: ${((totalSessions - (sessionsPerWeek - missingSessions)) % sessionsPerWeek) || sessionsPerWeek} sesión(es)`
    ],
    color: 'purple',
    weeks: Math.ceil((totalSessions - (sessionsPerWeek - missingSessions)) / sessionsPerWeek) + 1
  };

  const options = [optionA, optionB];

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-6 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Calendar className="w-7 h-7 text-blue-500" />
              Distribución de Sesiones
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Has comenzado en <span className="font-semibold text-blue-600 dark:text-blue-400">{startDay}</span>. 
              ¿Cómo prefieres completar las {totalSessions} sesiones?
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Options */}
        <div className="p-6 space-y-4">
          {options.map((option) => {
            const isSelected = selectedOption === option.id;
            
            return (
              <button
                key={option.id}
                onClick={() => setSelectedOption(option.id)}
                className={`w-full text-left p-6 rounded-xl border-2 transition-all ${
                  isSelected
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-lg'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-md'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className={`p-3 rounded-lg ${
                    option.color === 'blue' ? 'bg-blue-100 dark:bg-blue-900/30' :
                    'bg-purple-100 dark:bg-purple-900/30'
                  }`}>
                    {option.id === 'saturdays' ? (
                      <TrendingUp className={`w-6 h-6 ${
                        option.color === 'blue' ? 'text-blue-600 dark:text-blue-400' :
                        'text-purple-600 dark:text-purple-400'
                      }`} />
                    ) : (
                      <Clock className={`w-6 h-6 ${
                        option.color === 'blue' ? 'text-blue-600 dark:text-blue-400' :
                        'text-purple-600 dark:text-purple-400'
                      }`} />
                    )}
                  </div>
                  <div className="flex-1">
                    <h3 className={`font-semibold text-lg mb-2 ${
                      isSelected ? 'text-blue-900 dark:text-blue-100' : 'text-gray-900 dark:text-white'
                    }`}>
                      {option.title}
                    </h3>
                    <p className={`text-sm mb-3 ${
                      isSelected ? 'text-blue-700 dark:text-blue-300' : 'text-gray-600 dark:text-gray-400'
                    }`}>
                      {option.description}
                    </p>
                    
                    {/* Detalles de distribución */}
                    <div className="space-y-1.5">
                      {option.details.map((detail, idx) => (
                        <div key={idx} className={`text-xs flex items-start gap-2 ${
                          isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-500'
                        }`}>
                          <span className="mt-0.5">•</span>
                          <span>{detail}</span>
                        </div>
                      ))}
                    </div>

                    {/* Badge de duración */}
                    <div className="mt-3">
                      <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold ${
                        option.color === 'blue' 
                          ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                          : 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300'
                      }`}>
                        <Calendar className="w-3 h-3" />
                        {option.weeks} semanas
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-6 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-6 py-3 rounded-xl border-2 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedOption}
            className={`flex-1 px-6 py-3 rounded-xl font-semibold transition-colors ${
              selectedOption
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
            }`}
          >
            Continuar
          </button>
        </div>
      </div>
    </div>
  );
};

export default SessionDistributionModal;

