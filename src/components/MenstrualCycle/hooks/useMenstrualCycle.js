import { useState, useEffect, useCallback, useMemo } from 'react';

/**
 * Hook para gestionar el ciclo menstrual
 * Maneja configuración, registro diario y cálculo de fases
 */
export const useMenstrualCycle = (userId) => {
  const [config, setConfig] = useState(null);
  const [todayLog, setTodayLog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Cargar configuración del ciclo
  const loadConfig = useCallback(async () => {
    if (!userId) return;
    
    try {
      const token = localStorage.getItem('token');
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
      const token = localStorage.getItem('token');
      const today = new Date().toISOString().split('T')[0];
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

  // Cargar datos iniciales
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([loadConfig(), loadTodayLog()]);
      setLoading(false);
    };
    
    if (userId) {
      loadData();
    }
  }, [userId, loadConfig, loadTodayLog]);

  // Guardar configuración inicial (onboarding)
  const saveConfig = useCallback(async (configData) => {
    try {
      const token = localStorage.getItem('token');
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
      const token = localStorage.getItem('token');
      const today = new Date().toISOString().split('T')[0];
      
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
        return { success: true };
      }
      return { success: false };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }, [loadTodayLog, loadConfig]);

  // Registrar síntomas del día
  const logSymptoms = useCallback(async (symptoms) => {
    try {
      const token = localStorage.getItem('token');
      const today = new Date().toISOString().split('T')[0];
      
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
        return { success: true };
      }
      return { success: false };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }, [loadTodayLog]);

  // Calcular día del ciclo y fase actual
  const cycleInfo = useMemo(() => {
    if (!config?.last_period_start) {
      return {
        cycleDay: null,
        phase: null,
        phaseName: 'Sin datos',
        phaseDescription: 'Registra tu último periodo para comenzar el seguimiento',
        daysUntilNextPeriod: null
      };
    }

    const lastPeriod = new Date(config.last_period_start);
    const today = new Date();
    const diffTime = today - lastPeriod;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
    
    const cycleLength = config.cycle_length || 28;
    const periodLength = config.period_length || 5;
    
    // Calcular día del ciclo (considerando ciclos completos)
    let cycleDay = diffDays % cycleLength;
    if (cycleDay === 0) cycleDay = cycleLength;
    
    // Días hasta próximo periodo
    const daysUntilNextPeriod = cycleLength - cycleDay + 1;
    
    // Determinar fase (si no usa anticonceptivos hormonales)
    if (config.uses_hormonal_contraceptives) {
      return {
        cycleDay,
        phase: 'hormonal',
        phaseName: 'Anticonceptivos hormonales',
        phaseDescription: 'Con anticonceptivos hormonales, las fases naturales no aplican. Nos basamos en tus síntomas diarios.',
        daysUntilNextPeriod
      };
    }
    
    // Fases del ciclo natural
    let phase, phaseName, phaseDescription;
    
    if (cycleDay <= periodLength) {
      phase = 'menstrual';
      phaseName = 'Fase Menstrual';
      phaseDescription = 'Período activo. Prioriza el descanso y la recuperación. Entrenamientos de baja intensidad recomendados.';
    } else if (cycleDay <= Math.floor(cycleLength * 0.5)) {
      phase = 'follicular';
      phaseName = 'Fase Folicular';
      phaseDescription = 'Energía en aumento. Excelente momento para entrenamientos de fuerza e intensidad alta.';
    } else if (cycleDay <= Math.floor(cycleLength * 0.5) + 3) {
      phase = 'ovulation';
      phaseName = 'Ovulación';
      phaseDescription = 'Pico de energía y rendimiento. Aprovecha para tus entrenamientos más exigentes.';
    } else {
      phase = 'luteal';
      phaseName = 'Fase Lútea';
      phaseDescription = 'Energía decreciente. Enfócate en resistencia y técnica. Reduce intensidad si lo necesitas.';
    }
    
    return {
      cycleDay,
      phase,
      phaseName,
      phaseDescription,
      daysUntilNextPeriod
    };
  }, [config]);

  // Obtener ajuste de entrenamiento basado en síntomas + fase
  const getTrainingAdjustment = useCallback(() => {
    // Prioridad: síntomas reales del día > fase teórica
    if (todayLog) {
      const { energy_level, pain_level, sleep_quality } = todayLog;
      
      // Dolor alto = prioridad máxima
      if (pain_level >= 4) {
        return {
          type: 'low_impact',
          volumeModifier: -0.3,
          intensityModifier: -0.3,
          title: 'Día de recuperación activa',
          message: 'Detectamos malestar. Hoy mejor movilidad, técnica o paseo suave.',
          color: 'red',
          icon: '🩹'
        };
      }
      
      // Energía baja o mal sueño
      if (energy_level <= 2 || sleep_quality <= 2) {
        return {
          type: 'reduce_volume',
          volumeModifier: -0.2,
          intensityModifier: -0.1,
          title: 'Volumen reducido',
          message: 'Energía baja detectada. Reducimos series pero mantenemos calidad.',
          color: 'yellow',
          icon: '⚡'
        };
      }
      
      // Todo bien + buena energía
      if (energy_level >= 4 && pain_level <= 2 && sleep_quality >= 3) {
        return {
          type: 'optimal',
          volumeModifier: 0,
          intensityModifier: 0,
          title: 'Día óptimo',
          message: '¡Excelente estado! Puedes dar el 100% hoy.',
          color: 'green',
          icon: '💪'
        };
      }
    }
    
    // Sin registro de hoy: usar fase teórica
    if (cycleInfo.phase === 'menstrual') {
      return {
        type: 'menstrual_phase',
        volumeModifier: -0.15,
        intensityModifier: -0.2,
        title: 'Fase menstrual',
        message: 'Período activo. Escucha a tu cuerpo y ajusta según cómo te sientas.',
        color: 'purple',
        icon: '🩸'
      };
    }
    
    if (cycleInfo.phase === 'luteal' && cycleInfo.cycleDay > (config?.cycle_length || 28) - 5) {
      return {
        type: 'late_luteal',
        volumeModifier: -0.1,
        intensityModifier: -0.1,
        title: 'Fase premenstrual',
        message: 'Posibles síntomas premenstruales. No fuerces si no te sientes bien.',
        color: 'orange',
        icon: '🌙'
      };
    }
    
    // Default: plan normal
    return {
      type: 'normal',
      volumeModifier: 0,
      intensityModifier: 0,
      title: 'Plan normal',
      message: 'Sin ajustes necesarios. Sigue tu rutina planificada.',
      color: 'blue',
      icon: '✓'
    };
  }, [todayLog, cycleInfo, config]);

  return {
    // Estado
    config,
    todayLog,
    loading,
    error,
    cycleInfo,
    
    // Acciones
    saveConfig,
    logPeriodStart,
    logSymptoms,
    getTrainingAdjustment,
    
    // Refrescar datos
    refresh: useCallback(() => {
      loadConfig();
      loadTodayLog();
    }, [loadConfig, loadTodayLog])
  };
};

export default useMenstrualCycle;
