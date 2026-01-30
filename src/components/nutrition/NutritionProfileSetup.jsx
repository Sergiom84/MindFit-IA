import { useState, useEffect } from 'react';
import { User, Activity, Target, Utensils, AlertCircle, CheckCircle2 } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3010';

/**
 * Componente de configuración de perfil nutricional
 * Permite al usuario ingresar sus datos para cálculo determinista
 */
export default function NutritionProfileSetup({ onProfileSaved }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [estimaciones, setEstimaciones] = useState(null);

  const [formData, setFormData] = useState({
    sexo: 'hombre',
    edad: '',
    altura_cm: '',
    peso_kg: '',
    objetivo: 'mant',
    actividad: 'moderado',
    comidas_dia: 4,
    preferencias: {
      vegetariano: false,
      vegano: false,
      sin_gluten: false,
      sin_lactosa: false
    },
    alergias: []
  });

  const [alergiaInput, setAlergiaInput] = useState('');

  // Cargar perfil existente
  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_URL}/api/nutrition-v2/profile`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setFormData({
          sexo: data.sexo,
          edad: data.edad,
          altura_cm: data.altura_cm,
          peso_kg: data.peso_kg,
          objetivo: data.objetivo,
          actividad: data.actividad,
          comidas_dia: data.comidas_dia,
          preferencias: data.preferencias || {},
          alergias: data.alergias || []
        });
      }
    } catch (err) {
      // Si no existe perfil, es normal - el usuario lo creará
      console.log('No hay perfil previo, creando nuevo');
    }
  };

  const handleChange = (e) => {
    const { name, value, type } = e.target;

    if (type === 'number') {
      setFormData(prev => ({
        ...prev,
        [name]: value === '' ? '' : Number(value)
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  const handlePreferenceChange = (pref) => {
    setFormData(prev => ({
      ...prev,
      preferencias: {
        ...prev.preferencias,
        [pref]: !prev.preferencias[pref]
      }
    }));
  };

  const addAlergia = () => {
    if (alergiaInput.trim() && !formData.alergias.includes(alergiaInput.trim())) {
      setFormData(prev => ({
        ...prev,
        alergias: [...prev.alergias, alergiaInput.trim()]
      }));
      setAlergiaInput('');
    }
  };

  const removeAlergia = (alergia) => {
    setFormData(prev => ({
      ...prev,
      alergias: prev.alergias.filter(a => a !== alergia)
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_URL}/api/nutrition-v2/profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });

      if (!response.ok) {
        throw new Error('Error al guardar perfil');
      }

      const data = await response.json();
      setEstimaciones(data.estimaciones);
      setSuccess(true);

      // Notificar al componente padre
      if (onProfileSaved) {
        onProfileSaved(data);
      }

      // Auto-ocultar mensaje de éxito
      setTimeout(() => setSuccess(false), 5000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-neutral-900/70 border border-white/10 ring-1 ring-white/5 rounded-2xl p-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <User className="w-8 h-8 text-yellow-400" />
          <div>
            <h2 className="text-2xl font-bold font-urbanist tracking-tight text-white">Perfil Nutricional</h2>
            <p className="text-gray-400 text-sm">Configura tus datos para cálculos personalizados</p>
          </div>
        </div>

        {/* Mensajes de estado */}
        {error && (
          <div className="mb-4 p-4 bg-red-500/10 border border-red-500 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-500" />
            <p className="text-red-500">{error}</p>
          </div>
        )}

        {success && (
          <div className="mb-4 p-4 bg-green-500/10 border border-green-500 rounded-lg flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-500" />
            <p className="text-green-500">¡Perfil guardado exitosamente!</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Sección: Datos Personales */}
          <div>
            <h3 className="text-lg font-semibold font-urbanist text-white mb-4 flex items-center gap-2">
              <User className="w-5 h-5 text-yellow-400" />
              Datos Personales
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Sexo */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Sexo
                </label>
                <select
                  name="sexo"
                  value={formData.sexo}
                  onChange={handleChange}
                  className="w-full bg-white/5 border border-white/10 text-white rounded-lg px-4 py-2 focus:ring-2 focus:ring-yellow-400 outline-none"
                  required
                >
                  <option value="hombre">Hombre</option>
                  <option value="mujer">Mujer</option>
                </select>
              </div>

              {/* Edad */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Edad (años)
                </label>
                <input
                  type="number"
                  name="edad"
                  value={formData.edad}
                  onChange={handleChange}
                  min="13"
                  max="90"
                  className="w-full bg-white/5 border border-white/10 text-white rounded-lg px-4 py-2 focus:ring-2 focus:ring-yellow-400 outline-none"
                  required
                />
              </div>

              {/* Altura */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Altura (cm)
                </label>
                <input
                  type="number"
                  name="altura_cm"
                  value={formData.altura_cm}
                  onChange={handleChange}
                  min="120"
                  max="230"
                  className="w-full bg-white/5 border border-white/10 text-white rounded-lg px-4 py-2 focus:ring-2 focus:ring-yellow-400 outline-none"
                  required
                />
              </div>

              {/* Peso */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Peso (kg)
                </label>
                <input
                  type="number"
                  name="peso_kg"
                  value={formData.peso_kg}
                  onChange={handleChange}
                  min="30"
                  max="250"
                  step="0.1"
                  className="w-full bg-white/5 border border-white/10 text-white rounded-lg px-4 py-2 focus:ring-2 focus:ring-yellow-400 outline-none"
                  required
                />
              </div>
            </div>
          </div>

          {/* Sección: Objetivo */}
          <div>
            <h3 className="text-lg font-semibold font-urbanist text-white mb-4 flex items-center gap-2">
              <Target className="w-5 h-5 text-yellow-400" />
              Objetivo
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { value: 'cut', label: 'Definición', desc: 'Perder grasa', color: 'red' },
                { value: 'mant', label: 'Mantenimiento', desc: 'Mantener peso', color: 'blue' },
                { value: 'bulk', label: 'Volumen', desc: 'Ganar músculo', color: 'green' }
              ].map(({ value, label, desc, color }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, objetivo: value }))}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    formData.objetivo === value
                      ? `border-${color}-500 bg-${color}-500/10`
                      : 'border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20'
                  }`}
                >
                  <div className="text-white font-semibold">{label}</div>
                  <div className="text-gray-400 text-sm">{desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Sección: Actividad Física */}
          <div>
            <h3 className="text-lg font-semibold font-urbanist text-white mb-4 flex items-center gap-2">
              <Activity className="w-5 h-5 text-yellow-400" />
              Nivel de Actividad
            </h3>

            <select
              name="actividad"
              value={formData.actividad}
              onChange={handleChange}
              className="w-full bg-white/5 border border-white/10 text-white rounded-lg px-4 py-3 focus:ring-2 focus:ring-yellow-400 outline-none"
              required
            >
              <option value="sedentario">Sedentario (poco o ningún ejercicio)</option>
              <option value="ligero">Ligero (ejercicio 1-3 días/semana)</option>
              <option value="moderado">Moderado (ejercicio 3-5 días/semana)</option>
              <option value="alto">Alto (ejercicio intenso 6-7 días/semana)</option>
              <option value="muy_alto">Muy Alto (ejercicio muy intenso + trabajo físico)</option>
            </select>
          </div>

          {/* Sección: Comidas al Día */}
          <div>
            <h3 className="text-lg font-semibold font-urbanist text-white mb-4 flex items-center gap-2">
              <Utensils className="w-5 h-5 text-yellow-400" />
              Comidas al Día
            </h3>

            <div className="flex gap-2">
              {[3, 4, 5, 6].map(num => (
                <button
                  key={num}
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, comidas_dia: num }))}
                  className={`flex-1 py-3 rounded-lg font-semibold transition-all ${
                    formData.comidas_dia === num
                      ? 'bg-yellow-400 text-gray-900'
                      : 'bg-white/5 text-gray-200/80 hover:bg-white/10'
                  }`}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>

          {/* Sección: Preferencias Alimentarias */}
          <div>
            <h3 className="text-lg font-semibold font-urbanist text-white mb-4">
              Preferencias Alimentarias
            </h3>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { key: 'vegetariano', label: 'Vegetariano' },
                { key: 'vegano', label: 'Vegano' },
                { key: 'sin_gluten', label: 'Sin gluten' },
                { key: 'sin_lactosa', label: 'Sin lactosa' }
              ].map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => handlePreferenceChange(key)}
                  className={`p-3 rounded-lg text-sm font-medium transition-all ${
                    formData.preferencias[key]
                      ? 'bg-yellow-400 text-gray-900'
                      : 'bg-white/5 text-gray-200/80 hover:bg-white/10'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Sección: Alergias */}
          <div>
            <h3 className="text-lg font-semibold font-urbanist text-white mb-4">
              Alergias o Restricciones
            </h3>

            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={alergiaInput}
                onChange={(e) => setAlergiaInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addAlergia())}
                placeholder="Ej: frutos secos, mariscos..."
                className="flex-1 bg-white/5 border border-white/10 text-white rounded-lg px-4 py-2 focus:ring-2 focus:ring-yellow-400 outline-none"
              />
              <button
                type="button"
                onClick={addAlergia}
                className="px-4 py-2 bg-yellow-400 text-gray-900 rounded-lg font-semibold hover:bg-yellow-500 transition-colors"
              >
                Añadir
              </button>
            </div>

            {formData.alergias.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {formData.alergias.map(alergia => (
                  <span
                    key={alergia}
                    className="inline-flex items-center gap-2 bg-red-500/20 text-red-400 px-3 py-1 rounded-full text-sm"
                  >
                    {alergia}
                    <button
                      type="button"
                      onClick={() => removeAlergia(alergia)}
                      className="hover:text-red-300"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Botón de Guardar */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-yellow-400 text-gray-900 py-4 rounded-lg font-bold text-lg hover:bg-yellow-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Guardando...' : 'Guardar Perfil'}
          </button>
        </form>

        {/* Estimaciones */}
        {estimaciones && (
          <div className="mt-6 p-4 bg-green-500/10 border border-green-500 rounded-lg">
            <h4 className="text-green-400 font-semibold mb-3">📊 Estimaciones Calculadas:</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-white">
              <div>
                <div className="text-gray-400 text-sm">TMB (Metabolismo Basal)</div>
                <div className="text-2xl font-bold text-yellow-400">{estimaciones.bmr} kcal</div>
              </div>
              <div>
                <div className="text-gray-400 text-sm">TDEE (Gasto Total Diario)</div>
                <div className="text-2xl font-bold text-yellow-400">{estimaciones.tdee} kcal</div>
              </div>
              <div>
                <div className="text-gray-400 text-sm">Calorías Objetivo</div>
                <div className="text-2xl font-bold text-green-400">{estimaciones.kcal_objetivo} kcal</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
