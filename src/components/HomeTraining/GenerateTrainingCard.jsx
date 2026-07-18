import { memo } from 'react';
import { Target } from 'lucide-react';
import { equipmentTypes, trainingTypes, cardBase } from './homeTrainingConfig';

// Tarjeta CTA "Generar Entrenamiento Personalizado".
// Extraído de HomeTrainingSection.jsx (ARCH-002) sin cambios de comportamiento.
const GenerateTrainingCard = ({ selectedEquipment, selectedTrainingType, isGenerating, onGenerate }) => {
  const equipmentLabel = selectedEquipment === 'personalizado' || selectedEquipment === 'usar_este_equipamiento'
    ? 'Mi equipamiento'
    : (equipmentTypes.find(eq => eq.id === selectedEquipment)?.title || '');
  const trainingLabel = trainingTypes.find(type => type.id === selectedTrainingType)?.title;

  return (
    <div className="max-w-4xl mx-auto mb-8">
      <div className={`${cardBase} rounded-2xl p-6 text-center border-yellow-400/20`}>
        <h3 className="text-xl font-semibold text-white mb-3 font-urbanist">
          Generar Entrenamiento Personalizado
        </h3>
        <p className="text-gray-200/80 mb-6">
          Basado en tu equipamiento: <span className="text-yellow-400 font-semibold">
            {equipmentLabel}
          </span> y tipo de entrenamiento: <span className="text-yellow-400 font-semibold">
            {trainingLabel}
          </span>
        </p>
        <button
          onClick={onGenerate}
          disabled={isGenerating}
          className="bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 hover:from-yellow-200 hover:via-yellow-300 hover:to-amber-400 disabled:opacity-60 disabled:cursor-not-allowed text-black font-semibold py-3 px-8 rounded-xl transition-all duration-200 flex items-center mx-auto shadow-[0_12px_30px_-18px_rgba(250,204,21,0.8)]"
        >
          {isGenerating ? (
            <div className="w-4 h-4 border-2 border-black/60 border-t-transparent rounded-full animate-spin mr-2" />
          ) : (
            <Target size={20} className="mr-2" />
          )}
          Generar Mi Entrenamiento
        </button>
      </div>
    </div>
  );
};

export default memo(GenerateTrainingCard);
