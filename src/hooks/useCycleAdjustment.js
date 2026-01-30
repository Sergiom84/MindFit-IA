import { useState, useEffect, useCallback } from 'react';

/**
 * Hook para obtener los ajustes de entrenamiento basados en el ciclo menstrual
 * Usado en HomeTraining, HipertrofiaV2, etc.
 * 
 * @returns {Object} - Datos del ciclo y ajustes de entrenamiento
 */
const useCycleAdjustment = () => {
  const [cycleData, setCycleData] = useState({
    hasConfig: false,
    cycleDay: null,
    phase: null,
    todayLog: null,
    adjustment: null,
    loading: true,
    error: null
  });

  const loadCycleData = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setCycleData(prev => ({ ...prev, loading: false }));
        return;
      }

      const response = await fetch('/api/menstrual-cycle/training-adjustment', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) {
        setCycleData(prev => ({ ...prev, loading: false }));
        return;
      }

      const data = await response.json();
      
      setCycleData({
        hasConfig: data.hasConfig || false,
        cycleDay: data.cycleDay,
        phase: data.phase,
        todayLog: data.todayLog,
        adjustment: data.adjustment,
        loading: false,
        error: null
      });
    } catch (err) {
      console.error('Error cargando ajustes de ciclo:', err);
      setCycleData(prev => ({
        ...prev,
        loading: false,
        error: err.message
      }));
    }
  }, []);

  useEffect(() => {
    loadCycleData();
  }, [loadCycleData]);

  /**
   * Aplica modificadores de volumen/intensidad a un entrenamiento
   * @param {number} baseVolume - Volumen base (ej: número de series)
   * @param {number} baseIntensity - Intensidad base (ej: RPE)
   * @returns {Object} - Valores ajustados
   */
  const applyAdjustment = useCallback((baseVolume, baseIntensity = null) => {
    if (!cycleData.adjustment || cycleData.adjustment.type === 'normal') {
      return { volume: baseVolume, intensity: baseIntensity };
    }

    const { volumeModifier, intensityModifier } = cycleData.adjustment;

    const adjustedVolume = Math.round(baseVolume * (1 + volumeModifier));
    const adjustedIntensity = baseIntensity 
      ? Math.round(baseIntensity * (1 + intensityModifier) * 10) / 10
      : null;

    return {
      volume: Math.max(1, adjustedVolume), // Mínimo 1 serie
      intensity: adjustedIntensity ? Math.max(1, Math.min(10, adjustedIntensity)) : null
    };
  }, [cycleData.adjustment]);

  /**
   * Verifica si se debe mostrar una alerta al usuario
   * @returns {Object|null} - Objeto con tipo y mensaje de alerta, o null
   */
  const getAlert = useCallback(() => {
    if (!cycleData.hasConfig || !cycleData.adjustment) return null;
    
    const { type, message, reason } = cycleData.adjustment;
    
    if (type === 'normal' || type === 'optimal') return null;

    const alertTypes = {
      low_impact: 'warning',
      reduce_volume: 'info',
      menstrual_phase: 'info',
      late_luteal: 'info'
    };

    return {
      type: alertTypes[type] || 'info',
      message,
      reason,
      adjustmentType: type
    };
  }, [cycleData]);

  /**
   * Obtener texto descriptivo para mostrar en UI
   */
  const getPhaseDescription = useCallback(() => {
    if (!cycleData.phase) return null;

    const descriptions = {
      menstrual: {
        name: 'Fase Menstrual',
        tip: 'Es normal sentir menos energía. Escucha a tu cuerpo y prioriza el descanso si lo necesitas.'
      },
      follicular: {
        name: 'Fase Folicular', 
        tip: 'Tu energía suele aumentar. Buen momento para entrenamientos más intensos.'
      },
      ovulation: {
        name: 'Ovulación',
        tip: 'Pico de energía típico. Aprovecha para entrenamientos de fuerza o alta intensidad.'
      },
      luteal: {
        name: 'Fase Lútea',
        tip: 'La energía puede fluctuar. Adapta la intensidad según cómo te sientas cada día.'
      },
      hormonal: {
        name: 'Anticonceptivos hormonales',
        tip: 'Las fases pueden variar. Registra tus síntomas para personalizar mejor los ajustes.'
      }
    };

    return descriptions[cycleData.phase] || null;
  }, [cycleData.phase]);

  return {
    ...cycleData,
    applyAdjustment,
    getAlert,
    getPhaseDescription,
    refresh: loadCycleData
  };
};

export default useCycleAdjustment;
