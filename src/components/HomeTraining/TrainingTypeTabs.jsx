import { memo } from 'react';
import { trainingTypes } from './homeTrainingConfig';

// Selector (tabs) de tipo de entrenamiento.
// Extraído de HomeTrainingSection.jsx (ARCH-002) sin cambios de comportamiento.
const TrainingTypeTabs = ({ selectedTrainingType, onSelectTrainingType }) => (
  <div className="max-w-2xl mx-auto mb-8">
    <div className="grid grid-cols-3 gap-2 rounded-2xl border border-white/10 bg-black/60 p-2 backdrop-blur">
      {trainingTypes.map((type) => (
        <button
          key={type.id}
          data-trace="training-type"
          data-trace-id={type.id}
          data-trace-label={type.title}
          onClick={() => onSelectTrainingType(type.id, type.title)}
          className={`py-3 px-3 rounded-xl text-xs sm:text-sm font-semibold uppercase tracking-wider transition-all duration-200 ${
            selectedTrainingType === type.id
              ? 'bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 text-black shadow-[0_12px_30px_-18px_rgba(250,204,21,0.8)]'
              : 'text-gray-200 hover:text-white hover:bg-white/5'
          }`}
        >
          {type.title}
        </button>
      ))}
    </div>
  </div>
);

export default memo(TrainingTypeTabs);
