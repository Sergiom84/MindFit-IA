import TagsInput from '../../ui/TagsInput'

// Constantes para estilos reutilizables
const INPUT_STYLES = {
  base: "w-full bg-white/5 border rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400/60 transition-colors",
  normal: "border-white/10",
  error: "border-red-500"
};

const TEXTAREA_STYLES = {
  base: "w-full bg-white/5 border rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400/60 transition-colors resize-none",
  normal: "border-white/10",
  error: "border-red-500"
};

const LABEL_STYLES = "block text-gray-200/90 font-medium mb-2";
const ERROR_MESSAGE_STYLES = "text-red-400 text-sm mt-1";
const HELP_TEXT_STYLES = "text-gray-400/70 text-sm mt-1";

const HealthInfoStep = ({ formData, onInputChange, errors = {} }) => {
  const handleChange = (e) => {
    const { name, value } = e.target;
    onInputChange(name, value);
  };

  // Función helper para generar clases de textarea
  const getTextareaClassName = (fieldName) => {
    const hasError = errors[fieldName];
    return `${TEXTAREA_STYLES.base} ${hasError ? TEXTAREA_STYLES.error : TEXTAREA_STYLES.normal}`;
  };

  // Componente reutilizable para mostrar errores
  const ErrorMessage = ({ fieldName }) => {
    if (!errors[fieldName]) return null;
    return <p className={ERROR_MESSAGE_STYLES}>{errors[fieldName]}</p>;
  };

  // Helper para manejar arrays en TagsInput
  const getTagsValue = (value) => {
    if (Array.isArray(value)) return value;
    if (!value) return [];
    return String(value).split(',').map(s => s.trim()).filter(Boolean);
  };

  return (
    <div className="space-y-8">
      {/* Sección: Header y descripción */}
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-yellow-300 mb-2 font-urbanist">Información de Salud (Opcional)</h2>
        <p className="text-gray-300/80">Esta información nos ayuda a crear entrenamientos seguros y personalizados</p>
      </div>

      {/* Sección: Información médica */}
      <div className="space-y-6">
        {/* Historial Médico */}
        <div>
          <label className={LABEL_STYLES}>Historial Médico</label>
          <textarea
            name="historialMedico"
            value={formData.historialMedico}
            onChange={handleChange}
            placeholder="Describe cualquier condición médica relevante..."
            rows={4}
            className={getTextareaClassName('historialMedico')}
          />
          <ErrorMessage fieldName="historialMedico" />
          <p className={HELP_TEXT_STYLES}>
            Ejemplo: Diabetes, hipertensión, problemas cardíacos, etc.
          </p>
        </div>

        {/* Limitaciones Físicas */}
        <div>
          <label className={LABEL_STYLES}>Lesiones</label>
          <textarea
            name="limitacionesFisicas"
            value={formData.limitacionesFisicas}
            onChange={handleChange}
            placeholder="Lesiones, dolores, limitaciones de movimiento..."
            rows={4}
            className={getTextareaClassName('limitacionesFisicas')}
          />
          <ErrorMessage fieldName="limitacionesFisicas" />
          <p className={HELP_TEXT_STYLES}>
            Ejemplo: Dolor de espalda, lesión de rodilla, limitación en el hombro, etc.
          </p>
        </div>

        {/* Alergias */}
        <div>
          <label className={LABEL_STYLES}>Alergias</label>
          <TagsInput
            value={getTagsValue(formData.alergias)}
            onChange={(arr) => onInputChange('alergias', arr)}
            placeholder="Escribe una alergia y pulsa Enter"
          />
          <ErrorMessage fieldName="alergias" />
          <p className={HELP_TEXT_STYLES}>
            Ejemplo: Nueces, lácteos, gluten, polen, etc.
          </p>
        </div>

        {/* Medicamentos */}
        <div>
          <label className={LABEL_STYLES}>Medicamentos</label>
          <TagsInput
            value={getTagsValue(formData.medicamentos)}
            onChange={(arr) => onInputChange('medicamentos', arr)}
            placeholder="Escribe un medicamento y pulsa Enter"
          />
          <ErrorMessage fieldName="medicamentos" />
          <p className={HELP_TEXT_STYLES}>
            Ejemplo: Aspirina, vitaminas, suplementos, etc.
          </p>
        </div>
      </div>

      {/* Sección: Advertencia médica */}
      <div className="bg-white/5 rounded-lg p-6 border border-white/10 border-l-2 border-l-yellow-400/40">
        <h3 className="text-lg font-semibold text-yellow-300 mb-4 font-urbanist">⚠️ Importante</h3>
        <div className="space-y-3 text-gray-300/80 text-sm">
          <p>
            <strong>Consulta médica:</strong> Si tienes condiciones médicas serias o dudas sobre tu capacidad
            para hacer ejercicio, consulta con un profesional de la salud antes de comenzar cualquier programa
            de entrenamiento.
          </p>
          <p>
            <strong>No somos médicos:</strong> Esta aplicación no reemplaza el consejo médico profesional.
            Los entrenamientos generados son sugerencias basadas en la información que proporcionas.
          </p>
          <p>
            <strong>Escucha a tu cuerpo:</strong> Detén cualquier ejercicio si sientes dolor, mareos o
            malestar. Tu seguridad es lo más importante.
          </p>
        </div>
      </div>
    </div>
  );
};

export default HealthInfoStep;
