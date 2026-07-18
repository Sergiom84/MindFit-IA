import { memo } from 'react';
import { trainingGuides, cardBase } from './homeTrainingConfig';

// Tarjeta informativa con las guías del tipo de entrenamiento seleccionado.
// Extraído de HomeTrainingSection.jsx (ARCH-002) sin cambios de comportamiento.
const TrainingGuideCard = ({ trainingType }) => {
  const guide = trainingGuides[trainingType];
  if (!guide) return null;

  return (
    <div className="max-w-4xl mx-auto mb-8">
      <div className={`${cardBase} rounded-2xl p-6 border-l-2 border-yellow-400/40`}>
        <h3 className="text-xl font-semibold text-white mb-4 font-urbanist">
          {guide.title}
        </h3>
        <ul className="space-y-3">
          {guide.points.map((point, idx) => (
            <li key={idx} className="flex items-start text-gray-200/80">
              <span className="w-2 h-2 bg-yellow-400/80 rounded-full mr-3 mt-2 flex-shrink-0"></span>
              <span className="text-sm leading-relaxed">{point}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default memo(TrainingGuideCard);
