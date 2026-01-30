import { useState } from 'react';
import { Droplet, Calendar, ChevronDown, ChevronUp, Info } from 'lucide-react';
import TagsInput from '../../ui/TagsInput'

// Constantes para estilos reutilizables
const INPUT_STYLES = {
  base: "w-full bg-gray-700/50 border rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400 transition-colors",
  normal: "border-gray-600",
  error: "border-red-500"
};

const LABEL_STYLES = "block text-white font-medium mb-2";
const ERROR_MESSAGE_STYLES = "text-red-400 text-sm mt-1";

const GoalsStep = ({ formData, onInputChange, errors = {} }) => {
  const [showCycleConfig, setShowCycleConfig] = useState(false);
  const isFemale = formData.sexo === 'femenino';

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
        <h2 className="text-2xl font-bold text-yellow-400 mb-2">Metas y Objetivos</h2>
        <p className="text-gray-400">Define tus objetivos para crear un plan personalizado</p>
      </div>

      {/* Sección: Metas principales */}
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Objetivo Principal */}
          <div>
            <label className={LABEL_STYLES}>Objetivo Principal</label>
            <select
              name="objetivoPrincipal"
              value={formData.objetivoPrincipal}
              onChange={handleChange}
              className={getInputClassName('objetivoPrincipal')}
            >
              <option value="">Seleccionar objetivo</option>
              <option value="perder_peso">Perder peso</option>
              <option value="ganar_musculo">Ganar músculo</option>
              <option value="tonificar">Tonificar</option>
              <option value="mejorar_resistencia">Mejorar resistencia</option>
              <option value="fuerza">Aumentar fuerza</option>
              <option value="mantener_forma">Mantener forma física</option>
              <option value="rehabilitacion">Rehabilitación</option>
            </select>
            <ErrorMessage fieldName="objetivoPrincipal" />
          </div>

          {/* Meta de Peso */}
          <div>
            <label className={LABEL_STYLES}>Meta de Peso (kg)</label>
            <input
              type="number"
              name="metaPeso"
              value={formData.metaPeso}
              onChange={handleChange}
              placeholder="Ej: 65"
              min="30"
              max="300"
              step="0.1"
              className={getInputClassName('metaPeso')}
            />
            <ErrorMessage fieldName="metaPeso" />
          </div>

          {/* Meta de % Grasa Corporal */}
          <div>
            <label className={LABEL_STYLES}>Meta de % Grasa Corporal</label>
            <input
              type="number"
              name="metaGrasaCorporal"
              value={formData.metaGrasaCorporal}
              onChange={handleChange}
              placeholder="Ej: 15"
              min="5"
              max="50"
              step="0.1"
              className={getInputClassName('metaGrasaCorporal')}
            />
            <ErrorMessage fieldName="metaGrasaCorporal" />
          </div>

          {/* Enfoque de Entrenamiento */}
          <div>
            <label className={LABEL_STYLES}>Enfoque de Entrenamiento</label>
            <select
              name="enfoqueEntrenamiento"
              value={formData.enfoqueEntrenamiento}
              onChange={handleChange}
              className={getInputClassName('enfoqueEntrenamiento')}
            >
              <option value="">Seleccionar enfoque</option>
              <option value="fuerza">Fuerza</option>
              <option value="hipertrofia">Hipertrofia</option>
              <option value="resistencia">Resistencia</option>
              <option value="funcional">Funcional</option>
              <option value="hiit">HIIT</option>
              <option value="mixto">Mixto</option>
            </select>
            <ErrorMessage fieldName="enfoqueEntrenamiento" />
          </div>
        </div>
      </div>

      {/* Sección: Preferencias de nutrición y horarios */}
      <div className="border-t border-gray-600 pt-8">
        <h3 className="text-xl font-semibold text-yellow-400 mb-6">Preferencias de Nutrición y Horarios</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Horario Preferido */}
          <div>
            <label className={LABEL_STYLES}>Horario Preferido</label>
            <select
              name="horarioPreferido"
              value={formData.horarioPreferido}
              onChange={handleChange}
              className={getInputClassName('horarioPreferido')}
            >
              <option value="">Seleccionar horario</option>
              <option value="mañana">Mañana (6:00 - 10:00)</option>
              <option value="media_mañana">Media mañana (10:00 - 14:00)</option>
              <option value="tarde">Tarde (14:00 - 18:00)</option>
              <option value="noche">Noche (18:00 - 22:00)</option>
            </select>
            <ErrorMessage fieldName="horarioPreferido" />
          </div>

          {/* Comidas por Día */}
          <div>
            <label className={LABEL_STYLES}>Comidas por Día</label>
            <input
              type="number"
              name="comidasPorDia"
              value={formData.comidasPorDia}
              onChange={handleChange}
              placeholder="Ej: 4"
              min="2"
              max="8"
              className={getInputClassName('comidasPorDia')}
            />
            <ErrorMessage fieldName="comidasPorDia" />
          </div>
        </div>

        <div className="space-y-6 mt-6">
          {/* Suplementación */}
          <div>
            <label className={LABEL_STYLES}>Suplementación</label>
            <TagsInput
              value={getTagsValue(formData.suplementacion)}
              onChange={(arr) => onInputChange('suplementacion', arr)}
              placeholder="Escribe un suplemento y pulsa Enter"
            />
            <ErrorMessage fieldName="suplementacion" />
          </div>

          {/* Alimentos Excluidos */}
          <div>
            <label className={LABEL_STYLES}>Alimentos Excluidos</label>
            <TagsInput
              value={getTagsValue(formData.alimentosExcluidos)}
              onChange={(arr) => onInputChange('alimentosExcluidos', arr)}
              placeholder="Escribe un alimento y pulsa Enter"
            />
            <ErrorMessage fieldName="alimentosExcluidos" />
          </div>
        </div>
      </div>

      {/* Sección: Ciclo Menstrual (solo para mujeres) */}
      {isFemale && (
        <div className="border-t border-gray-600 pt-8">
          <div 
            className="flex items-center justify-between cursor-pointer"
            onClick={() => setShowCycleConfig(!showCycleConfig)}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-pink-500/20 flex items-center justify-center">
                <Droplet className="w-5 h-5 text-pink-400" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-pink-400">Seguimiento del Ciclo Menstrual</h3>
                <p className="text-sm text-gray-400">Opcional - Configúralo ahora o después en tu perfil</p>
              </div>
            </div>
            <button type="button" className="p-2 hover:bg-gray-700 rounded-lg">
              {showCycleConfig ? (
                <ChevronUp className="w-5 h-5 text-gray-400" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-400" />
              )}
            </button>
          </div>

          {showCycleConfig && (
            <div className="mt-6 space-y-6 bg-pink-500/5 rounded-lg p-6 border border-pink-500/20">
              <div className="flex items-start gap-3 p-3 bg-pink-500/10 rounded-lg">
                <Info className="w-5 h-5 text-pink-400 mt-0.5" />
                <p className="text-sm text-gray-300">
                  El seguimiento del ciclo nos permite adaptar tus entrenamientos según tu fase hormonal, 
                  optimizando resultados y respetando tu cuerpo.
                </p>
              </div>

              {/* Activar seguimiento */}
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  name="cycleTrackingEnabled"
                  checked={formData.cycleTrackingEnabled || false}
                  onChange={(e) => onInputChange('cycleTrackingEnabled', e.target.checked)}
                  className="w-5 h-5 text-pink-500 bg-gray-700 border-gray-600 rounded focus:ring-pink-500 focus:ring-2"
                />
                <label className="text-white font-medium">
                  Quiero activar el seguimiento del ciclo
                </label>
              </div>

              {formData.cycleTrackingEnabled && (
                <div className="space-y-4 mt-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Fecha último periodo */}
                    <div>
                      <label className={LABEL_STYLES}>
                        <Calendar className="w-4 h-4 inline mr-2 text-pink-400" />
                        Fecha del último periodo
                      </label>
                      <input
                        type="date"
                        name="lastPeriodStart"
                        value={formData.lastPeriodStart || ''}
                        onChange={handleChange}
                        max={new Date().toISOString().split('T')[0]}
                        className={getInputClassName('lastPeriodStart')}
                      />
                    </div>

                    {/* Duración del ciclo */}
                    <div>
                      <label className={LABEL_STYLES}>Duración del ciclo (días)</label>
                      <input
                        type="number"
                        name="cycleLength"
                        value={formData.cycleLength || 28}
                        onChange={handleChange}
                        min="21"
                        max="35"
                        className={getInputClassName('cycleLength')}
                      />
                      <p className="text-xs text-gray-500 mt-1">Normalmente entre 21-35 días. Si no sabes, déjalo en 28.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Ciclo regular */}
                    <div>
                      <label className={LABEL_STYLES}>¿Tu ciclo es regular?</label>
                      <select
                        name="cycleIsRegular"
                        value={formData.cycleIsRegular ?? ''}
                        onChange={handleChange}
                        className={getInputClassName('cycleIsRegular')}
                      >
                        <option value="">Seleccionar</option>
                        <option value="true">Sí, es bastante regular</option>
                        <option value="false">No, es irregular</option>
                      </select>
                    </div>

                    {/* Anticonceptivos */}
                    <div>
                      <label className={LABEL_STYLES}>¿Usas anticonceptivos hormonales?</label>
                      <select
                        name="usesHormonalContraceptives"
                        value={formData.usesHormonalContraceptives ?? ''}
                        onChange={handleChange}
                        className={getInputClassName('usesHormonalContraceptives')}
                      >
                        <option value="">Seleccionar</option>
                        <option value="false">No</option>
                        <option value="true">Sí (píldora, parche, DIU hormonal...)</option>
                      </select>
                    </div>
                  </div>

                  {formData.usesHormonalContraceptives === 'true' && (
                    <div className="p-3 bg-blue-900/30 border border-blue-500/30 rounded-lg text-sm text-blue-200">
                      💡 Con anticonceptivos hormonales, las fases naturales no aplican igual. 
                      Nos basaremos principalmente en cómo te sientes cada día.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Sección: Resumen motivacional */}
      <div className="bg-gradient-to-r from-yellow-900/20 to-yellow-800/20 rounded-lg p-6 border border-yellow-700/50">
        <h3 className="text-lg font-semibold text-yellow-400 mb-4">🎯 ¡Estás a punto de comenzar!</h3>
        <div className="space-y-3 text-gray-300">
          <p>
            Con la información que has proporcionado, nuestra IA creará un plan de entrenamiento
            completamente personalizado para ti.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 bg-yellow-400 rounded-full"></div>
              <span className="text-sm">Rutinas adaptadas a tu nivel</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 bg-yellow-400 rounded-full"></div>
              <span className="text-sm">Progreso automático</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 bg-yellow-400 rounded-full"></div>
              <span className="text-sm">Seguimiento detallado</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 bg-yellow-400 rounded-full"></div>
              <span className="text-sm">Ajustes inteligentes</span>
            </div>
          </div>
        </div>
      </div>

      {/* Sección: Términos y condiciones */}
      <div className="bg-gray-700/30 rounded-lg p-6 border border-gray-600">
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            name="acceptTerms"
            checked={formData.acceptTerms || false}
            onChange={(e) => onInputChange('acceptTerms', e.target.checked)}
            className="mt-1 w-4 h-4 text-yellow-400 bg-gray-700 border-gray-600 rounded focus:ring-yellow-400 focus:ring-2"
          />
          <label htmlFor="acceptTerms" className="text-sm text-gray-300">
            Acepto los{' '}
            <a href="#" className="text-yellow-400 hover:text-yellow-300 underline">
              términos y condiciones
            </a>{' '}
            y la{' '}
            <a href="#" className="text-yellow-400 hover:text-yellow-300 underline">
              política de privacidad
            </a>
            . Entiendo que esta aplicación no reemplaza el consejo médico profesional.
          </label>
        </div>
        <ErrorMessage fieldName="acceptTerms" />
      </div>
    </div>
  );
};

export default GoalsStep;
