import { useState } from 'react';
import tokenManager from '../utils/tokenManager';

// Componente ligero para encapsular la llamada al backend IA y devolver el plan
// Props:
// - onPlanReady(plan): callback con el JSON enriquecido del plan
// - equipment (minimo|basico|avanzado)
// - training (funcional|hiit|fuerza)
// - onError(msg)
export default function IAHomeTraining({ equipment, training, onPlanReady, onError }) {
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    if (!equipment || !training) return;
    setLoading(true);
    try {
      const token = tokenManager.getToken();
      const resp = await fetch('/api/ia-home-training/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ equipment_type: equipment, training_type: training })
      });
      const data = await resp.json();
      if (!resp.ok || !data.success) {
        throw new Error(data.error || 'Error generando plan');
      }
      onPlanReady?.(data.plan);
    } catch (e) {
      console.error('IAHomeTraining error:', e);
      onError?.(e.message);
    } finally {
      setLoading(false);
    }
  };

  // Este componente no renderiza UI propia; expone una función render-prop
  return (
    <button onClick={generate} disabled={loading} className="bg-yellow-400 hover:bg-yellow-500 text-black font-semibold py-3 px-8 rounded-lg transition-colors duration-200 flex items-center">
      {loading ? 'Generando...' : 'Generar con IA'}
    </button>
  );
}

