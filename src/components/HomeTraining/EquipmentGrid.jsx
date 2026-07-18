import { memo } from 'react';
import { Dumbbell } from 'lucide-react';
import UserEquipmentSummaryCard from './UserEquipmentSummaryCard';
import { equipmentTypes, cardBase } from './homeTrainingConfig';

// Grid de tarjetas de equipamiento + tarjeta "Usar mi equipamiento".
// Extraído de HomeTrainingSection.jsx (ARCH-002) sin cambios de comportamiento.
const EquipmentGrid = ({ selectedEquipment, onSelectEquipment }) => (
  <div className="grid md:grid-cols-2 gap-6 max-w-6xl mx-auto">
    {equipmentTypes.map((equipment) => (
      <div
        key={equipment.id}
        data-trace="equipment-card"
        data-trace-id={equipment.id}
        data-trace-label={equipment.title}
        onClick={() => onSelectEquipment(equipment.id, equipment.title)}
        className={`${cardBase} ${equipment.accentBorder} rounded-2xl p-6 cursor-pointer transition-all duration-300 ${
          selectedEquipment === equipment.id
            ? `${equipment.borderColor} bg-white/10 ring-2 ring-yellow-400/20 shadow-[0_20px_40px_-30px_rgba(250,204,21,0.6)]`
            : 'hover:border-yellow-400/30 hover:bg-white/5'
        }`}
      >
        <div className="flex items-center mb-4">
          <equipment.icon size={24} className={`${equipment.accent} mr-3`} />
          <h3 className="text-lg font-semibold text-white">{equipment.title}</h3>
        </div>

        <div className="mb-4">
          <p className="text-sm text-gray-200/80 mb-2">Equipamiento:</p>
          <div className="flex flex-wrap gap-1">
            {equipment.equipment.map((item, idx) => (
              <span key={idx} className="text-xs bg-white/5 border border-white/10 text-gray-200/80 px-2 py-1 rounded-full">
                {item}
              </span>
            ))}
          </div>
        </div>

        <div>
          <p className="text-sm text-gray-200/80 mb-2">Ejercicios ejemplo:</p>
          <div className="space-y-1">
            {equipment.exercises.map((exercise, idx) => (
              <div key={idx} className="flex items-center text-xs text-gray-300/80">
                <span className="w-1.5 h-1.5 bg-yellow-400/80 rounded-full mr-2"></span>
                {exercise}
              </div>
            ))}
          </div>
        </div>
      </div>
    ))}
    <div
      data-trace="equipment-card"
      data-trace-id="personalizado"
      data-trace-label="Usar mi equipamiento"
      onClick={() => onSelectEquipment('personalizado', 'Usar mi equipamiento')}
      className={`${cardBase} border-l-2 border-l-yellow-400/40 rounded-2xl p-6 cursor-pointer transition-all duration-300 ${
        selectedEquipment === 'personalizado'
          ? 'border-yellow-400/50 bg-white/10 ring-2 ring-yellow-400/20 shadow-[0_20px_40px_-30px_rgba(250,204,21,0.6)]'
          : 'hover:border-yellow-400/30 hover:bg-white/5'
      }`}
    >
      <div className="flex items-center mb-4">
        <Dumbbell size={24} className="text-yellow-300 mr-3" />
        <h3 className="text-lg font-semibold text-white">Usar mi equipamiento</h3>
      </div>

      <div className="mb-4 text-center">
        <p className="text-sm text-gray-200/80 mb-2">Equipamiento:</p>
        <UserEquipmentSummaryCard />
      </div>
    </div>
  </div>
);

export default memo(EquipmentGrid);
