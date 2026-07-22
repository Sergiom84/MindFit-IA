import React, { useState, useEffect } from 'react';
import { X, Calendar, Zap, Target, AlertCircle } from 'lucide-react';

/**
 * Modal de Confirmación de Día de Inicio
 * Aparece cuando el usuario selecciona una metodología en Jueves, Viernes, Sábado o Domingo
 */
const StartDayConfirmationModal = ({ isOpen, onClose, onConfirm, methodology }) => {
  const [selectedOption, setSelectedOption] = useState(null);
  const [currentDay, setCurrentDay] = useState('');
  const [options, setOptions] = useState([]);

  useEffect(() => {
    if (isOpen) {
      const today = new Date();
      const dayOfWeek = today.getDay(); // 0=Domingo, 1=Lunes, ..., 6=Sábado
      const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
      const dayName = dayNames[dayOfWeek];
      
      setCurrentDay(dayName);
      setSelectedOption(null);
      
      // Configurar opciones según el día
      const dayOptions = getDayOptions(dayOfWeek);
      setOptions(dayOptions);
    }
  }, [isOpen]);

  const getDayOptions = (dayOfWeek) => {
    switch (dayOfWeek) {
      case 4: // Jueves
        return [
          {
            id: 'monday',
            icon: Calendar,
            title: '🗓️ Empezar el LUNES (Recomendado)',
            description: 'Comenzarás con una semana completa',
            startDate: 'next_monday',
            color: 'blue'
          },
          {
            id: 'today_2days',
            icon: Zap,
            title: '💪 Empezar HOY (Jueves + Viernes)',
            description: 'Entrenas hoy y mañana, descansas el fin de semana, continúas el lunes',
            startDate: 'today',
            sessionsFirstWeek: 2,
            color: 'green'
          },
          {
            id: 'today_3days',
            icon: Target,
            title: '⚡ Empezar HOY (Jue + Vie + Sáb)',
            description: 'Entrenas hoy, mañana y el sábado, descansas el domingo, continúas el lunes',
            startDate: 'today',
            sessionsFirstWeek: 3,
            includeSaturdays: true,
            color: 'purple'
          }
        ];

      case 5: // Viernes
        return [
          {
            id: 'monday',
            icon: Calendar,
            title: '🗓️ Empezar el LUNES (Recomendado)',
            description: 'Comenzarás con una semana completa',
            startDate: 'next_monday',
            color: 'blue'
          },
          {
            id: 'today_2days',
            icon: Zap,
            title: '💪 Empezar HOY (Viernes + Sábado)',
            description: 'Entrenas hoy y mañana, descansas el domingo, continúas el lunes',
            startDate: 'today',
            sessionsFirstWeek: 2,
            includeSaturdays: true,
            color: 'green'
          },
          {
            id: 'today_1day',
            icon: Target,
            title: '⚡ Empezar HOY (solo Viernes)',
            description: 'Entrenas solo hoy, descansas el fin de semana, continúas el lunes',
            startDate: 'today',
            sessionsFirstWeek: 1,
            color: 'purple'
          }
        ];

      case 6: // Sábado
        return [
          {
            id: 'home_training',
            icon: Zap,
            title: '💪 Entrenamiento para HOY',
            description: 'Te generamos un entrenamiento único para hoy, y el lunes empiezas el plan completo',
            startDate: 'home_training_today',
            color: 'orange'
          },
          {
            id: 'today_continue_monday',
            icon: Target,
            title: '⚡ Empezar HOY (Sábado)',
            description: 'Entrenas hoy, descansas el domingo, continúas el lunes',
            startDate: 'today',
            sessionsFirstWeek: 1,
            includeSaturdays: true,
            color: 'green'
          }
        ];

      case 0: // Domingo
        return [
          {
            id: 'home_training',
            icon: Zap,
            title: '💪 Entrenamiento para HOY',
            description: 'Te generamos un entrenamiento único para hoy, y mañana empiezas el plan completo',
            startDate: 'home_training_today',
            color: 'orange'
          },
          {
            id: 'monday',
            icon: Calendar,
            title: '🗓️ Empezar MAÑANA (Lunes)',
            description: 'Descansas hoy, mañana empiezas el plan completo',
            startDate: 'next_monday',
            color: 'blue'
          }
        ];

      default:
        return [];
    }
  };

  const handleConfirm = () => {
    if (!selectedOption) return;
    
    const option = options.find(opt => opt.id === selectedOption);
    const today = new Date();
    const effectiveStartDay = option.startDate === 'next_monday' ? 1 : today.getDay();

    onConfirm({
      startDate: option.startDate,
      sessionsFirstWeek: option.sessionsFirstWeek,
      includeSaturdays: option.includeSaturdays,
      isHomeTraining: option.startDate === 'home_training_today',
      startDayOfWeek: effectiveStartDay // 0=Dom ... 6=Sáb (solo usamos jueves para sábados)
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-neutral-900/95 border border-white/10 ring-1 ring-white/5 shadow-2xl backdrop-blur-xl rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-neutral-900/95 border-b border-white/10 p-6 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-semibold font-urbanist text-white flex items-center gap-3">
              <span className="h-10 w-10 rounded-full border border-yellow-400/30 bg-yellow-500/10 flex items-center justify-center">
                <Calendar className="w-5 h-5 text-yellow-300" />
              </span>
              Hoy es {currentDay}
            </h2>
            <p className="text-sm text-gray-300/70 mt-2">
              ¿Cuándo quieres comenzar tu plan de {methodology}?
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg border border-white/10 bg-white/5 text-gray-300/70 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Options */}
        <div className="p-6 space-y-4">
          {options.map((option) => {
            const Icon = option.icon;
            const isSelected = selectedOption === option.id;
            
            return (
              <button
                key={option.id}
                onClick={() => setSelectedOption(option.id)}
                className={`w-full text-left p-5 rounded-xl border transition-all ${
                  isSelected
                    ? 'border-yellow-400/50 bg-gradient-to-br from-yellow-500/10 via-yellow-400/5 to-transparent shadow-[0_20px_40px_-30px_rgba(250,204,21,0.5)]'
                    : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className={`p-3 rounded-lg border border-white/10 ${
                    option.color === 'blue' ? 'bg-blue-500/10' :
                    option.color === 'green' ? 'bg-emerald-500/10' :
                    option.color === 'purple' ? 'bg-violet-500/10' :
                    'bg-orange-500/10'
                  }`}>
                    <Icon className={`w-6 h-6 ${
                      option.color === 'blue' ? 'text-blue-300' :
                      option.color === 'green' ? 'text-emerald-300' :
                      option.color === 'purple' ? 'text-violet-300' :
                      'text-orange-300'
                    }`} />
                  </div>
                  <div className="flex-1">
                    <h3 className={`font-semibold text-lg mb-1 ${
                      isSelected ? 'text-yellow-200' : 'text-white'
                    }`}>
                      {option.title}
                    </h3>
                    <p className={`text-sm ${
                      isSelected ? 'text-yellow-200/80' : 'text-gray-300/70'
                    }`}>
                      {option.description}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-neutral-900/95 border-t border-white/10 p-6 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-6 py-3 rounded-xl border border-white/10 text-gray-200/80 font-semibold hover:bg-white/10 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedOption}
            className={`flex-1 px-6 py-3 rounded-xl font-semibold transition-colors ${
              selectedOption
                ? 'bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 text-black hover:from-yellow-200 hover:via-yellow-300 hover:to-amber-400 shadow-[0_12px_30px_-18px_rgba(250,204,21,0.8)]'
                : 'bg-white/10 text-gray-500 cursor-not-allowed'
            }`}
          >
            Continuar
          </button>
        </div>
      </div>
    </div>
  );
};

export default StartDayConfirmationModal;

