import { useState, useEffect } from 'react';
import { Calendar, Dumbbell, Save, X } from 'lucide-react';

const TrainingPreferencesCard = () => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  // Estados de preferencias
  const [usarPreferenciasIA, setUsarPreferenciasIA] = useState(false);
  const [diasPreferidos, setDiasPreferidos] = useState([]);
  const [ejerciciosPorDia, setEjerciciosPorDia] = useState(8);
  const [semanasEntrenamiento, setSemanasEntrenamiento] = useState(4);

  const diasSemana = [
    { id: 'lunes', label: 'Lun' },
    { id: 'martes', label: 'Mar' },
    { id: 'miercoles', label: 'Mié' },
    { id: 'jueves', label: 'Jue' },
    { id: 'viernes', label: 'Vie' },
    { id: 'sabado', label: 'Sáb' },
    { id: 'domingo', label: 'Dom' }
  ];

  // Cargar preferencias al montar el componente
  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const userId = JSON.parse(localStorage.getItem('userProfile'))?.id;

      if (!token || !userId) {
        setMessage({ type: 'error', text: 'Debes iniciar sesión' });
        return;
      }

      const response = await fetch(`/api/users/${userId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Error al cargar preferencias');
      }

      const data = await response.json();
      const userProfile = data.user || data;

      // Cargar switch ON/OFF
      setUsarPreferenciasIA(userProfile.usar_preferencias_ia || false);

      // Cargar días preferidos (JSONB array)
      const dias = userProfile.dias_preferidos_entrenamiento || ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'];
      setDiasPreferidos(dias);

      // Cargar ejercicios por día
      setEjerciciosPorDia(userProfile.ejercicios_por_dia_preferido || 8);

      // Cargar semanas de entrenamiento
      setSemanasEntrenamiento(userProfile.semanas_entrenamiento || 4);

    } catch (error) {
      console.error('Error loading preferences:', error);
      setMessage({ type: 'error', text: 'Error al cargar preferencias' });
    } finally {
      setLoading(false);
    }
  };

  const toggleDia = (diaId) => {
    setDiasPreferidos(prev => {
      if (prev.includes(diaId)) {
        // No permitir deseleccionar si solo queda 1 día
        if (prev.length <= 1) {
          setMessage({ type: 'warning', text: 'Debes seleccionar al menos 1 día' });
          return prev;
        }
        return prev.filter(d => d !== diaId);
      } else {
        return [...prev, diaId];
      }
    });
  };

  const handleEjerciciosChange = (value) => {
    const num = parseInt(value);
    if (num >= 4 && num <= 15) {
      setEjerciciosPorDia(num);
      setMessage({ type: '', text: '' });
    } else {
      setMessage({ type: 'warning', text: 'Debe estar entre 4 y 15 ejercicios' });
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setMessage({ type: '', text: '' });

      if (diasPreferidos.length === 0) {
        setMessage({ type: 'error', text: 'Debes seleccionar al menos 1 día' });
        return;
      }

      if (ejerciciosPorDia < 4 || ejerciciosPorDia > 15) {
        setMessage({ type: 'error', text: 'Ejercicios por día debe estar entre 4 y 15' });
        return;
      }

      const token = localStorage.getItem('token');
      const userId = JSON.parse(localStorage.getItem('userProfile'))?.id;

      if (!token || !userId) {
        setMessage({ type: 'error', text: 'Debes iniciar sesión' });
        return;
      }

      const response = await fetch(`/api/users/${userId}/training-preferences`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          usar_preferencias_ia: usarPreferenciasIA,
          dias_preferidos_entrenamiento: diasPreferidos,
          ejercicios_por_dia_preferido: ejerciciosPorDia,
          semanas_entrenamiento: semanasEntrenamiento
        })
      });

      if (!response.ok) {
        throw new Error('Error al guardar preferencias');
      }

      setMessage({ type: 'success', text: '✅ Preferencias guardadas correctamente' });

      // Auto-ocultar mensaje después de 3 segundos
      setTimeout(() => {
        setMessage({ type: '', text: '' });
      }, 3000);

    } catch (error) {
      console.error('Error saving preferences:', error);
      setMessage({ type: 'error', text: 'Error al guardar preferencias' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-neutral-900/70 rounded-2xl p-6 border border-white/10 ring-1 ring-white/5">
        <div className="animate-pulse">
          <div className="h-6 bg-white/10 rounded w-1/3 mb-4"></div>
          <div className="h-4 bg-white/10 rounded w-2/3"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-neutral-900/70 rounded-2xl p-6 border border-white/10 ring-1 ring-white/5">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-yellow-400/20 rounded-xl flex items-center justify-center">
            <Calendar className="w-6 h-6 text-yellow-400" />
          </div>
          <div>
            <h3 className="text-xl font-semibold font-urbanist text-white">Preferencias de Entrenamiento</h3>
            <p className="text-sm text-gray-300/70">Configura tu planificación semanal</p>
          </div>
        </div>
      </div>

      {/* Switch ON/OFF */}
      <div className="mb-6 p-4 bg-white/5 rounded-lg border border-white/10">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <label className="text-sm font-medium text-white flex items-center gap-2">
              <span>🤖 Activar Preferencias Personalizadas</span>
            </label>
            <p className="text-xs text-gray-300/70 mt-1">
              {usarPreferenciasIA
                ? '✅ ON - La IA tomará en cuenta tus preferencias de entrenamiento'
                : '⏸️ OFF - La IA generará entrenamientos estándar'}
            </p>
          </div>
            <button
              onClick={() => setUsarPreferenciasIA(!usarPreferenciasIA)}
              className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors duration-200 focus:outline-none ${
                usarPreferenciasIA ? 'bg-yellow-400' : 'bg-white/10'
              }`}
            >
            <span
              className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform duration-200 ${
                usarPreferenciasIA ? 'translate-x-7' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Días preferidos */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-200/80 mb-3">
          Días de la semana para entrenar
        </label>
        <div className="grid grid-cols-7 gap-2">
          {diasSemana.map(dia => (
            <button
              key={dia.id}
              onClick={() => toggleDia(dia.id)}
              className={`
                py-3 px-2 rounded-lg text-sm font-medium transition-all duration-200
                ${diasPreferidos.includes(dia.id)
                  ? 'bg-yellow-400 text-gray-900 hover:bg-yellow-500'
                  : 'bg-white/5 text-gray-200/80 hover:bg-white/10'
                }
              `}
            >
              {dia.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-300/70 mt-2">
          Seleccionados: {diasPreferidos.length} {diasPreferidos.length === 1 ? 'día' : 'días'}
        </p>
      </div>

      {/* Semanas de entrenamiento */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-200/80 mb-3">
          Duración del plan de entrenamiento
        </label>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min="1"
            max="8"
            value={semanasEntrenamiento}
            onChange={(e) => setSemanasEntrenamiento(parseInt(e.target.value))}
            className="flex-1 h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-yellow-400"
          />
          <span className="text-2xl font-bold text-yellow-400 min-w-[80px] text-center">
            {semanasEntrenamiento}
            <span className="text-sm text-gray-300/70 ml-1">
              {semanasEntrenamiento === 1 ? 'semana' : 'semanas'}
            </span>
          </span>
        </div>
        <p className="text-xs text-gray-300/70 mt-2">
          La IA generará un plan progresivo de {semanasEntrenamiento} {semanasEntrenamiento === 1 ? 'semana' : 'semanas'}
        </p>
      </div>

      {/* Ejercicios por día */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-200/80 mb-3 flex items-center gap-2">
          <Dumbbell className="w-4 h-4" />
          Ejercicios por sesión (4-15)
        </label>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min="4"
            max="15"
            value={ejerciciosPorDia}
            onChange={(e) => handleEjerciciosChange(e.target.value)}
            className="flex-1 h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-yellow-400"
          />
          <span className="text-2xl font-bold text-yellow-400 min-w-[60px] text-center">
            {ejerciciosPorDia}
          </span>
        </div>
        <p className="text-xs text-gray-300/70 mt-2">
          La IA generará exactamente esta cantidad de ejercicios por sesión
        </p>
      </div>

      {/* Mensaje de estado */}
      {message.text && (
        <div className={`
          p-3 rounded-lg mb-4 text-sm flex items-center gap-2
          ${message.type === 'success' ? 'bg-green-500/20 text-green-400 border border-green-500/30' : ''}
          ${message.type === 'error' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : ''}
          ${message.type === 'warning' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' : ''}
        `}>
          {message.type === 'success' && <span>✅</span>}
          {message.type === 'error' && <X className="w-4 h-4" />}
          {message.type === 'warning' && <span>⚠️</span>}
          <span>{message.text}</span>
        </div>
      )}

      {/* Botón guardar */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full bg-yellow-400 hover:bg-yellow-500 disabled:bg-white/10 disabled:text-gray-500 disabled:cursor-not-allowed text-gray-900 font-semibold py-3 px-6 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2"
      >
        {saving ? (
          <>
            <div className="w-5 h-5 border-2 border-gray-900/30 border-t-gray-900 rounded-full animate-spin" />
            Guardando...
          </>
        ) : (
          <>
            <Save className="w-5 h-5" />
            Guardar Preferencias
          </>
        )}
      </button>

      {/* Info adicional */}
      <div className="mt-4 p-4 bg-white/5 rounded-lg border border-white/10">
        <p className="text-xs text-gray-300/70 leading-relaxed">
          <strong className="text-yellow-400">💡 Tip:</strong> Estas preferencias se aplicarán cuando generes un <strong>plan de metodología Casa</strong> (desde Metodologías → Entrenamiento en Casa).
          {usarPreferenciasIA && (
            <span className="block mt-2 text-green-400">
              ✅ Preferencias activadas: La IA respetará tus días preferidos, duración del plan ({semanasEntrenamiento} {semanasEntrenamiento === 1 ? 'semana' : 'semanas'}) y ejercicios por sesión ({ejerciciosPorDia}).
            </span>
          )}
          {!usarPreferenciasIA && (
            <span className="block mt-2 text-gray-300/60">
              ⏸️ Preferencias desactivadas: La IA usará valores estándar (4 semanas, 8 ejercicios/día).
            </span>
          )}
        </p>
      </div>
    </div>
  );
};

export default TrainingPreferencesCard;
