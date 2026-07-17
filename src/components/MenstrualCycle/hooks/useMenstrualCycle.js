import { useState, useEffect, useCallback, useMemo } from 'react';
import tokenManager from '../../../utils/tokenManager';

// Devuelve la fecha local (no UTC) en formato YYYY-MM-DD para evitar desfases por zona horaria
const getLocalDate = () => {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().split('T')[0];
};

/**
 * Hook para gestionar el ciclo menstrual
 * Maneja configuración, registro diario y cálculo de fases
 */
export const useMenstrualCycle = (userId) => {
  const [config, setConfig] = useState(null);
  const [todayLog, setTodayLog] = useState(null);
  const [trainingData, setTrainingData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Cargar configuración del ciclo
  const loadConfig = useCallback(async () => {
    if (!userId) return;
    
    try {
      const token = tokenManager.getToken() || tokenManager.getToken();
      const response = await fetch('/api/menstrual-cycle/config', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setConfig(data.config);
      }
    } catch (err) {
      console.error('Error cargando config del ciclo:', err);
      setError(err.message);
    }
  }, [userId]);

  // Cargar registro de hoy
  const loadTodayLog = useCallback(async () => {
    if (!userId) return;
    
    try {
      const token = tokenManager.getToken() || tokenManager.getToken();
      const today = getLocalDate();
      const response = await fetch(`/api/menstrual-cycle/log/${today}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setTodayLog(data.log);
      }
    } catch (err) {
      console.error('Error cargando log de hoy:', err);
    }
  }, [userId]);

  // Cargar ajuste de entrenamiento (backend v3)
  const loadTrainingAdjustment = useCallback(async () => {
    if (!userId) return;

    try {
      const token = tokenManager.getToken() || tokenManager.getToken();
      const response = await fetch('/api/menstrual-cycle/training-adjustment', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setTrainingData(data);
      }
    } catch (err) {
      console.error('Error cargando ajuste de ciclo:', err);
    }
  }, [userId]);

  // Cargar datos iniciales
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([loadConfig(), loadTodayLog(), loadTrainingAdjustment()]);
      setLoading(false);
    };
    
    if (userId) {
      loadData();
    }
  }, [userId, loadConfig, loadTodayLog, loadTrainingAdjustment]);

  // Guardar configuración inicial (onboarding)
  const saveConfig = useCallback(async (configData) => {
    try {
      const token = tokenManager.getToken() || tokenManager.getToken();
      const response = await fetch('/api/menstrual-cycle/config', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(configData)
      });
      
      if (response.ok) {
        const data = await response.json();
        setConfig(data.config);
        return { success: true };
      } else {
        const errorData = await response.json();
        return { success: false, error: errorData.error };
      }
    } catch (err) {
      return { success: false, error: err.message };
    }
  }, []);

  // Registrar "Hoy me bajó"
  const logPeriodStart = useCallback(async () => {
    try {
      const token = tokenManager.getToken() || tokenManager.getToken();
      const today = getLocalDate();
      
      const response = await fetch('/api/menstrual-cycle/log', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          log_date: today,
          is_period_day: true
        })
      });
      
      if (response.ok) {
        await loadTodayLog();
        await loadConfig(); // Actualizar last_period_start
        await loadTrainingAdjustment();
        return { success: true };
      }
      return { success: false };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }, [loadTodayLog, loadConfig, loadTrainingAdjustment]);

  // Registrar síntomas del día
  const logSymptoms = useCallback(async (symptoms) => {
    try {
      const token = tokenManager.getToken() || tokenManager.getToken();
      const today = getLocalDate();
      
      const response = await fetch('/api/menstrual-cycle/log', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          log_date: today,
          ...symptoms
        })
      });
      
      if (response.ok) {
        await loadTodayLog();
        await loadTrainingAdjustment();
        return { success: true };
      }
      return { success: false };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }, [loadTodayLog, loadTrainingAdjustment]);

  const resolvePhaseLabels = (phase) => {
    const labels = {
      menstrual: {
        phaseName: 'Fase Menstrual',
        phaseDescription: 'Período activo. Prioriza el descanso y la recuperación. Entrenamientos de baja intensidad recomendados.'
      },
      follicular: {
        phaseName: 'Fase Folicular',
        phaseDescription: 'Energía en aumento. Excelente momento para entrenamientos de fuerza e intensidad alta.'
      },
      ovulation: {
        phaseName: 'Ovulación',
        phaseDescription: 'Pico de energía y rendimiento. Aprovecha para tus entrenamientos más exigentes.'
      },
      luteal: {
        phaseName: 'Fase Lútea',
        phaseDescription: 'Energía decreciente. Enfócate en resistencia y técnica. Reduce intensidad si lo necesitas.'
      },
      hormonal: {
        phaseName: 'Anticonceptivos hormonales',
        phaseDescription: 'Con anticonceptivos hormonales, las fases naturales no aplican. Nos basamos en tus síntomas diarios.'
      }
    };
    return labels[phase] || { phaseName: 'Sin datos', phaseDescription: 'Registra tu ciclo para comenzar el seguimiento.' };
  };

  // Calcular día del ciclo y fase actual (con override del backend v3)
  const cycleInfo = useMemo(() => {
    if (!config) {
      return {
        hasConfig: false,
        cycleDay: null,
        phase: null,
        phaseName: 'Sin datos',
        phaseDescription: 'Registra tu último periodo para comenzar el seguimiento',
        daysUntilNextPeriod: null
      };
    }

    if (!config.last_period_start) {
      return {
        hasConfig: true,
        cycleDay: null,
        phase: null,
        phaseName: 'Sin datos',
        phaseDescription: 'Registra tu último periodo para comenzar el seguimiento',
        daysUntilNextPeriod: null
      };
    }

    const lastPeriod = new Date(config.last_period_start);
    const today = new Date(getLocalDate());
    const diffTime = today - lastPeriod;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
    
    const cycleLength = config.cycle_length || 28;
    const periodLength = config.period_length || 5;
    
    // Calcular día del ciclo (considerando ciclos completos)
    let cycleDay = diffDays % cycleLength;
    if (cycleDay === 0) cycleDay = cycleLength;
    
    // Días hasta próximo periodo
    const daysUntilNextPeriod = cycleLength - cycleDay + 1;
    
    let phase = null;

    // Determinar fase (si no usa anticonceptivos hormonales)
    if (config.uses_hormonal_contraceptives) {
      phase = 'hormonal';
    } else if (cycleDay <= periodLength) {
      phase = 'menstrual';
    } else if (cycleDay <= Math.floor(cycleLength * 0.5)) {
      phase = 'follicular';
    } else if (cycleDay <= Math.floor(cycleLength * 0.5) + 3) {
      phase = 'ovulation';
    } else {
      phase = 'luteal';
    }

    const baseLabels = resolvePhaseLabels(phase);

    const backendMode = trainingData?.mode;
    const backendCycleDay = trainingData?.cycleDay ?? trainingData?.cycle_day ?? null;
    const backendPhase = trainingData?.phase ?? null;

    if (backendMode === 'symptoms') {
      return {
        hasConfig: true,
        cycleDay: null,
        phase: null,
        phaseName: 'Modo síntomas',
        phaseDescription: 'Usamos tus síntomas y rendimiento para ajustar la sesión.',
        daysUntilNextPeriod: null
      };
    }

    if (backendCycleDay || backendPhase) {
      const overrideLabels = backendPhase ? resolvePhaseLabels(backendPhase) : baseLabels;
      return {
        hasConfig: true,
        cycleDay: backendCycleDay ?? cycleDay,
        phase: backendPhase ?? phase,
        phaseName: overrideLabels.phaseName,
        phaseDescription: overrideLabels.phaseDescription,
        daysUntilNextPeriod
      };
    }

    return {
      hasConfig: true,
      cycleDay,
      phase,
      phaseName: baseLabels.phaseName,
      phaseDescription: baseLabels.phaseDescription,
      daysUntilNextPeriod
    };
  }, [config, trainingData]);

  // Obtener ajuste de entrenamiento basado en backend v3
  const getTrainingAdjustment = useCallback(() => {
    if (!trainingData?.adjustment) return null;

    const { type = 'normal', message } = trainingData.adjustment;
    const base = {
      low_impact: {
        title: 'Día de recuperación activa',
        color: 'red',
        icon: '🩹'
      },
      reduce_volume: {
        title: 'Volumen reducido',
        color: 'yellow',
        icon: '⚡'
      },
      menstrual_phase: {
        title: 'Fase menstrual',
        color: 'purple',
        icon: '🩸'
      },
      late_luteal: {
        title: 'Fase premenstrual',
        color: 'orange',
        icon: '🌙'
      },
      optimal: {
        title: 'Día óptimo',
        color: 'green',
        icon: '💪'
      },
      normal: {
        title: 'Plan normal',
        color: 'blue',
        icon: '✓'
      }
    };

    const fallback = base[type] || base.normal;
    return {
      type,
      title: fallback.title,
      color: fallback.color,
      icon: fallback.icon,
      message: message || 'Sin ajustes necesarios.'
    };
  }, [trainingData]);

  return {
    // Estado
    config,
    todayLog,
    loading,
    error,
    cycleInfo,
    trainingData,
    
    // Acciones
    saveConfig,
    logPeriodStart,
    logSymptoms,
    getTrainingAdjustment,
    
    // Refrescar datos
    refresh: useCallback(() => {
      loadConfig();
      loadTodayLog();
      loadTrainingAdjustment();
    }, [loadConfig, loadTodayLog, loadTrainingAdjustment])
  };
};

export default useMenstrualCycle;
