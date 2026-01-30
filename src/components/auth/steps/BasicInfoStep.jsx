import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

// Constantes para estilos reutilizables
const INPUT_STYLES = {
  base: "w-full bg-white/5 border rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400/60 transition-colors",
  normal: "border-white/10",
  error: "border-red-500"
};

const LABEL_STYLES = "block text-gray-200/90 font-medium mb-2";
const REQUIRED_INDICATOR = <span className="text-red-400">*</span>;
const ERROR_MESSAGE_STYLES = "text-red-400 text-sm mt-1";

const BasicInfoStep = ({ formData, onInputChange, errors = {} }) => {
  const [showPassword, setShowPassword] = useState(false);

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
      {/* Sección: Información de cuenta */}
      <>
        <div className="text-center mb-8">
          <h2 className="text-2xl font-semibold text-white mb-2 font-urbanist">Información de Cuenta</h2>
          <p className="text-gray-300/80">Crea tu cuenta para comenzar tu entrenamiento personalizado</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Nombre */}
          <div>
            <label className={LABEL_STYLES}>
              Nombre {REQUIRED_INDICATOR}
            </label>
            <input
              type="text"
              name="nombre"
              value={formData.nombre}
              onChange={handleChange}
              placeholder="Tu nombre"
              className={getInputClassName('nombre')}
              required
            />
            <ErrorMessage fieldName="nombre" />
          </div>

          {/* Apellido */}
          <div>
            <label className={LABEL_STYLES}>
              Apellido {REQUIRED_INDICATOR}
            </label>
            <input
              type="text"
              name="apellido"
              value={formData.apellido}
              onChange={handleChange}
              placeholder="Tu apellido"
              className={getInputClassName('apellido')}
              required
            />
            <ErrorMessage fieldName="apellido" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Email */}
          <div>
            <label className={LABEL_STYLES}>
              Email {REQUIRED_INDICATOR}
            </label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="tu@email.com"
              className={getInputClassName('email')}
              required
            />
            <ErrorMessage fieldName="email" />
          </div>

          {/* Contraseña */}
          <div>
            <label className={LABEL_STYLES}>
              Contraseña {REQUIRED_INDICATOR}
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="Mínimo 6 caracteres"
                className={`${getInputClassName('password')} pr-12`}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
            <ErrorMessage fieldName="password" />
          </div>
        </div>
      </>

      {/* Sección: Datos personales básicos */}
      <div className="border-t border-white/10 pt-8">
        <h3 className="text-xl font-semibold text-yellow-300 mb-6 font-urbanist">Datos Personales</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Edad */}
          <div>
            <label className={LABEL_STYLES}>Edad {REQUIRED_INDICATOR}</label>
            <input
              type="number"
              name="edad"
              value={formData.edad}
              onChange={handleChange}
              placeholder="Ej: 25"
              min="13"
              max="100"
              className={getInputClassName('edad')}
            />
            <ErrorMessage fieldName="edad" />
          </div>

          {/* Sexo */}
          <div>
            <label className={LABEL_STYLES}>Sexo {REQUIRED_INDICATOR}</label>
            <select
              name="sexo"
              value={formData.sexo}
              onChange={handleChange}
              className={getInputClassName('sexo')}
            >
              <option value="">Seleccionar</option>
              <option value="masculino">Masculino</option>
              <option value="femenino">Femenino</option>
              <option value="otro">Otro</option>
            </select>
            <ErrorMessage fieldName="sexo" />
          </div>

          {/* Peso */}
          <div>
            <label className={LABEL_STYLES}>Peso (kg) {REQUIRED_INDICATOR}</label>
            <input
              type="number"
              name="peso"
              value={formData.peso}
              onChange={handleChange}
              placeholder="Ej: 70"
              min="30"
              max="300"
              step="0.1"
              className={getInputClassName('peso')}
            />
            <ErrorMessage fieldName="peso" />
          </div>

          {/* Altura */}
          <div>
            <label className={LABEL_STYLES}>Altura (cm) {REQUIRED_INDICATOR}</label>
            <input
              type="number"
              name="altura"
              value={formData.altura}
              onChange={handleChange}
              placeholder="Ej: 175"
              min="120"
              max="250"
              className={getInputClassName('altura')}
            />
            <ErrorMessage fieldName="altura" />
          </div>
        </div>
      </div>

      {/* Sección: Experiencia en entrenamiento */}
      <div className="border-t border-gray-600 pt-8">
        <h3 className="text-xl font-semibold text-yellow-400 mb-6">Experiencia en Entrenamiento</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Nivel de Entrenamiento */}
          <div>
            <label className={LABEL_STYLES}>Nivel de Entrenamiento</label>
            <select
              name="nivelEntrenamiento"
              value={formData.nivelEntrenamiento}
              onChange={handleChange}
              className={getInputClassName('nivelEntrenamiento')}
            >
              <option value="">Seleccionar nivel</option>
              <option value="principiante">Principiante</option>
              <option value="intermedio">Intermedio</option>
              <option value="avanzado">Avanzado</option>
            </select>
            <ErrorMessage fieldName="nivelEntrenamiento" />
          </div>

          {/* Años Entrenando */}
          <div>
            <label className={LABEL_STYLES}>Años Entrenando</label>
            <input
              type="number"
              name="anosEntrenando"
              value={formData.anosEntrenando}
              onChange={handleChange}
              placeholder="Ej: 3"
              min="0"
              max="50"
              className={getInputClassName('anosEntrenando')}
            />
            <ErrorMessage fieldName="anosEntrenando" />
          </div>

          {/* Frecuencia Semanal */}
          <div>
            <label className={LABEL_STYLES}>Frecuencia Semanal (días)</label>
            <input
              type="number"
              name="frecuenciaSemanal"
              value={formData.frecuenciaSemanal}
              onChange={handleChange}
              placeholder="Ej: 4"
              min="1"
              max="7"
              className={getInputClassName('frecuenciaSemanal')}
            />
            <ErrorMessage fieldName="frecuenciaSemanal" />
          </div>

          {/* Metodología Preferida */}
          <div>
            <label className={LABEL_STYLES}>Metodología Preferida</label>
            <select
              name="metodologiaPreferida"
              value={formData.metodologiaPreferida}
              onChange={handleChange}
              className={getInputClassName('metodologiaPreferida')}
            >
              <option value="">Seleccionar metodología</option>
              <option value="powerlifting">Powerlifting</option>
              <option value="bodybuilding">Bodybuilding</option>
              <option value="crossfit">CrossFit</option>
              <option value="calistenia">Calistenia</option>
              <option value="entrenamiento_casa">Entrenamiento en Casa</option>
              <option value="heavy_duty">Heavy Duty</option>
              <option value="entrenamiento_funcional">Entrenamiento Funcional</option>
            </select>
            <ErrorMessage fieldName="metodologiaPreferida" />
          </div>

          {/* Nivel de Actividad */}
          <div className="md:col-span-2">
            <label className={LABEL_STYLES}>Nivel de Actividad</label>
            <select
              name="nivelActividad"
              value={formData.nivelActividad}
              onChange={handleChange}
              className={getInputClassName('nivelActividad')}
            >
              <option value="">Seleccionar</option>
              <option value="sedentario">Sedentario</option>
              <option value="ligero">Ligero</option>
              <option value="moderado">Moderado</option>
              <option value="activo">Activo</option>
              <option value="muy_activo">Muy Activo</option>
            </select>
            <ErrorMessage fieldName="nivelActividad" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default BasicInfoStep;
