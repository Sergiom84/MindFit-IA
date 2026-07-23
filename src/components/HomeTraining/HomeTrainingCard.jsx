import { Clock, TrendingUp, CheckCircle } from 'lucide-react';

const HomeTrainingCard = ({ trainingType }) => {
  const { title, description, icon: Icon, difficulty, duration, exercises, color, benefits } = trainingType;

  const handleStartTraining = () => {
    // TODO: Implementar navegación a la rutina específica
    console.log(`Iniciando entrenamiento: ${title}`);
  };

  return (
    <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-2xl p-6 hover:bg-gray-800/70 transition-colors duration-200 hover:shadow-2xl group">
      {/* Header de la tarjeta */}
      <div className="flex items-center justify-between mb-4">
        <div className={`p-3 rounded-full bg-gradient-to-r ${color} bg-opacity-20`}>
          <Icon size={32} className="text-white" />
        </div>
        <div className="text-right">
          <span className="text-xs bg-yellow-400/20 text-yellow-400 px-2 py-1 rounded-full">
            {difficulty}
          </span>
        </div>
      </div>

      {/* Título y descripción */}
      <h3 className="text-xl font-semibold mb-2 text-white group-hover:text-yellow-400 transition-colors">
        {title}
      </h3>
      <p className="text-gray-400 text-sm mb-4 leading-relaxed">
        {description}
      </p>

      {/* Información de duración */}
      <div className="flex items-center mb-4 text-gray-300">
        <Clock size={16} className="mr-2" />
        <span className="text-sm">{duration}</span>
      </div>

      {/* Lista de ejercicios */}
      <div className="mb-4">
        <h4 className="text-sm font-semibold text-gray-300 mb-2 flex items-center">
          <TrendingUp size={14} className="mr-1" />
          Ejercicios incluidos:
        </h4>
        <div className="space-y-1">
          {exercises.slice(0, 3).map((exercise, idx) => (
            <div key={idx} className="flex items-center text-xs text-gray-400">
              <CheckCircle size={12} className="mr-2 text-green-400" />
              {exercise}
            </div>
          ))}
          {exercises.length > 3 && (
            <div className="text-xs text-gray-500 ml-5">
              +{exercises.length - 3} ejercicios más
            </div>
          )}
        </div>
      </div>

      {/* Beneficios */}
      <div className="mb-6">
        <h4 className="text-sm font-semibold text-gray-300 mb-2">Beneficios:</h4>
        <div className="flex flex-wrap gap-1">
          {benefits.map((benefit, idx) => (
            <span
              key={idx}
              className="text-xs bg-gray-700/50 text-gray-300 px-2 py-1 rounded-full"
            >
              {benefit}
            </span>
          ))}
        </div>
      </div>

      {/* Botón de acción */}
      <button
        onClick={handleStartTraining}
        className={`w-full bg-gradient-to-r ${color} text-white font-semibold py-3 px-4 rounded-lg hover:shadow-lg transition-all duration-200 transform hover:scale-105`}
      >
        Comenzar Entrenamiento
      </button>

      {/* Indicador de IA */}
      <div className="mt-3 text-center">
        <span className="text-xs text-yellow-400 bg-yellow-400/10 px-2 py-1 rounded-full">
          🤖 Rutina generada por IA
        </span>
      </div>
    </div>
  );
};

export default HomeTrainingCard;
