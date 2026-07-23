import { useState, useEffect, useMemo } from 'react';
import { getSessionProgress } from '../components/routines/api';

/**
 * Hook para gestionar datos de resumen de sesión
 * Maneja carga de datos, estados de error y cálculos derivados
 */
export const useSessionSummary = ({ sessionId, session: propsSession, exercises: propsExercises }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  // Si recibimos datos directos, no necesitamos cargar vía API
  const hasDirectData = propsSession && propsExercises;

  useEffect(() => {
    // Si tenemos datos directos, usarlos inmediatamente
    if (hasDirectData) {
      setData({ session: propsSession, exercises: propsExercises });
      setLoading(false);
      return;
    }

    // Solo cargar si tenemos sessionId y no tenemos datos directos
    if (!sessionId) return;

    let mounted = true;
    const loadSessionData = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await getSessionProgress(sessionId);
        if (mounted) {
          setData(response);
        }
      } catch (err) {
        if (mounted) {
          setError(err.message || 'No se pudo cargar el progreso de la sesión');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadSessionData();
    return () => { mounted = false; };
  }, [sessionId, hasDirectData, propsSession, propsExercises]);

  // Datos procesados
  const exercises = useMemo(() =>
    Array.isArray(data?.exercises) ? data.exercises : [],
    [data]
  );

  const session = useMemo(() => data?.session || {}, [data]);

  // Cálculos de progreso
  const progressStats = useMemo(() => {
    const total = exercises.length || 0;
    const completed = exercises.filter(e =>
      (e.status || '').toLowerCase() === 'completed'
    ).length;
    const skipped = exercises.filter(e =>
      (e.status || '').toLowerCase() === 'skipped'
    ).length;
    const cancelled = exercises.filter(e =>
      (e.status || '').toLowerCase() === 'cancelled'
    ).length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

    return {
      total,
      completed,
      skipped,
      cancelled,
      percentage,
      hasProgress: total > 0
    };
  }, [exercises]);

  // Refrescar datos manualmente
  const refresh = async () => {
    if (!sessionId || hasDirectData) return;

    setLoading(true);
    setError(null);

    try {
      const response = await getSessionProgress(sessionId);
      setData(response);
    } catch (err) {
      setError(err.message || 'Error al refrescar datos');
    } finally {
      setLoading(false);
    }
  };

  return {
    // Estados
    loading,
    error,

    // Datos
    session,
    exercises,
    progressStats,

    // Flags
    hasData: !!data,
    hasDirectData,

    // Acciones
    refresh
  };
};

export default useSessionSummary;