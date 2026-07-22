// Constantes para estilos reutilizables
const INPUT_STYLES = {
  base: "w-full bg-white/5 border rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400/60 transition-colors",
  normal: "border-white/10",
  error: "border-red-500"
};

const LABEL_STYLES = "block text-gray-200/90 font-medium mb-2";
const ERROR_MESSAGE_STYLES = "text-red-400 text-sm mt-1";

// Configuración de medidas corporales
const BODY_MEASUREMENTS = {
  cintura: { label: "Cintura (cm)", placeholder: "Ej: 80", min: 50, max: 200 },
  pecho: { label: "Pecho (cm)", placeholder: "Ej: 95", min: 50, max: 200 },
  brazos: { label: "Brazos (cm)", placeholder: "Ej: 35", min: 20, max: 80 },
  muslo: { label: "Muslo (cm)", placeholder: "Ej: 55", min: 30, max: 100 },
  cuello: { label: "Cuello (cm)", placeholder: "Ej: 38", min: 25, max: 60 },
  antebrazos: { label: "Antebrazos (cm)", placeholder: "Ej: 28", min: 15, max: 50 }
};

const BodyMeasurementsStep = ({ formData, onInputChange, errors = {} }) => {
  const handleChange = (e) => {
    const { name, value } = e.target;
    onInputChange(name, value);
  };

  // Función helper para generar clases de input
  const getInputClassName = (fieldName) => {
    const hasError = errors[fieldName];
    return `${INPUT_STYLES.base} ${hasError ? INPUT_STYLES.error : INPUT_STYLES.normal}`;
  };

  // Componente reutilizable para mostrar errores
  const ErrorMessage = ({ fieldName }) => {
    if (!errors[fieldName]) return null;
    return <p className={ERROR_MESSAGE_STYLES}>{errors[fieldName]}</p>;
  };

  return (
    <div className="space-y-8">
      {/* Sección: Header y descripción */}
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-yellow-300 mb-2 font-urbanist">Medidas Corporales (Opcional)</h2>
        <p className="text-gray-300/80">Estas medidas nos ayudarán a personalizar mejor tu entrenamiento</p>
      </div>

      {/* Sección: Campos de medidas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {Object.entries(BODY_MEASUREMENTS).map(([name, config]) => (
          <div key={name}>
            <label className={LABEL_STYLES}>{config.label}</label>
            <input
              type="number"
              name={name}
              value={formData[name]}
              onChange={handleChange}
              placeholder={config.placeholder}
              min={config.min}
              max={config.max}
              step="0.1"
              className={getInputClassName(name)}
            />
            <ErrorMessage fieldName={name} />
          </div>
        ))}
      </div>

      {/* Sección: Información sobre el propósito */}
      <div className="bg-white/5 rounded-lg p-6 border border-white/10 border-l-2 border-l-yellow-400/40">
        <h3 className="text-lg font-semibold text-yellow-300 mb-4 font-urbanist">¿Por qué necesitamos estas medidas?</h3>
        <div className="space-y-3 text-gray-300/80">
          <div className="flex items-start gap-3">
            <div className="w-2 h-2 bg-yellow-400 rounded-full mt-2 flex-shrink-0"></div>
            <p><strong>Personalización:</strong> Nos permite crear rutinas específicas para tu tipo de cuerpo</p>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-2 h-2 bg-yellow-400 rounded-full mt-2 flex-shrink-0"></div>
            <p><strong>Seguimiento:</strong> Podrás ver tu progreso de forma visual y detallada</p>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-2 h-2 bg-yellow-400 rounded-full mt-2 flex-shrink-0"></div>
            <p><strong>Objetivos:</strong> Establecemos metas realistas basadas en tu composición actual</p>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-2 h-2 bg-yellow-400 rounded-full mt-2 flex-shrink-0"></div>
            <p><strong>Opcional:</strong> Puedes completar estas medidas más tarde en tu perfil</p>
          </div>
        </div>
      </div>

      {/* Sección: Consejos para tomar medidas */}
      <div className="bg-white/5 rounded-lg p-6 border border-white/10 border-l-2 border-l-sky-400/40">
        <h3 className="text-lg font-semibold text-sky-300 mb-4 font-urbanist">💡 Consejos para tomar medidas precisas</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-300/80">
          <div>
            <h4 className="font-medium text-sky-200 mb-2">Cintura:</h4>
            <p>Mide en la parte más estrecha, generalmente a la altura del ombligo</p>
          </div>
          <div>
            <h4 className="font-medium text-sky-200 mb-2">Pecho:</h4>
            <p>Mide alrededor de la parte más ancha del pecho, pasando por los pezones</p>
          </div>
          <div>
            <h4 className="font-medium text-sky-200 mb-2">Brazos:</h4>
            <p>Mide la parte más ancha del bíceps con el brazo flexionado</p>
          </div>
          <div>
            <h4 className="font-medium text-sky-200 mb-2">Muslos:</h4>
            <p>Mide la parte más ancha del muslo, aproximadamente a 15cm de la rodilla</p>
          </div>
          <div>
            <h4 className="font-medium text-sky-200 mb-2">Cuello:</h4>
            <p>Mide alrededor del cuello, justo debajo de la nuez de Adán</p>
          </div>
          <div>
            <h4 className="font-medium text-sky-200 mb-2">Antebrazos:</h4>
            <p>Mide la parte más ancha del antebrazo, cerca del codo</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BodyMeasurementsStep;
