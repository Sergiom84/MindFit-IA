import { useMemo } from 'react';
import RoutineSessionModal from './RoutineSessionModal';
import { HIPERTROFIA_PERSISTED_TYPE } from '../../utils/hipertrofiaIdentity';

/**
 * 🧬 Reproductor propio de HipertrofiaV2 (MindFeed) para la pestaña "Hoy".
 *
 * Por qué existe: el sistema D1-D5 de MindFeed etiqueta los días de `plan_data`
 * con NOMBRES DE DÍA (semana 1 → Lunes/Martes/Miércoles/... = D1/D2/D3/...), que
 * NO se corresponden con el calendario real (methodology_plan_days/workout_schedule
 * redistribuyen por fecha, y hoy puede ser una sesión de calibración). El
 * reproductor común (RoutineSessionModal alimentado por `effectiveSession`) toma
 * los ejercicios de `plan_data` vía findTodaySession y acaba mostrando la sesión
 * equivocada (p.ej. D3 de 5 ejercicios en vez de la calibración de 1).
 *
 * Solución aislada: este componente construye la sesión SIEMPRE desde el backend
 * (`todayStatus.exercises`, que es la sesión real de hoy) y reutiliza el render de
 * RoutineSessionModal (con sus sub-modales de RIR y series de aproximación) SIN
 * modificarlo. Así HipertrofiaV2 tiene su propia fuente de datos sin tocar el
 * reproductor común ni el resto de metodologías.
 */
export default function HipertrofiaSessionModal({
  todayStatus,
  sessionId,
  methodologyPlanId,
  metodologia,
  onClose,
  onFinishExercise,
  onSkipExercise,
  onCancelExercise,
  onEndSession,
  navigateToRoutines,
  onProgressUpdate
}) {
  // Sesión construida desde el backend (nunca desde plan_data). Se preservan los
  // campos que necesitan los sub-modales de HipertrofiaV2 (exercise_id, rir_target,
  // intensidad_porcentaje, patron_movimiento) y se añaden los alias de display.
  const backendSession = useMemo(() => {
    const raw = Array.isArray(todayStatus?.exercises) ? todayStatus.exercises : [];
    const ejercicios = raw.map((ex, i) => {
      const order = Number.isFinite(ex.exercise_order) ? Number(ex.exercise_order) : i;
      return {
        ...ex,
        nombre: ex.exercise_name || ex.nombre || `Ejercicio ${i + 1}`,
        series: ex.series_total ?? ex.series ?? '—',
        repeticiones: ex.repeticiones ?? ex.reps ?? '—',
        descanso_seg: ex.descanso_seg ?? null,
        exercise_id: ex.exercise_id ?? ex.id ?? null,
        // El índice original alinea el PUT /exercise/:order del backend.
        originalIndex: order,
        order
      };
    });
    return {
      sessionId,
      methodologyPlanId,
      metodologia: metodologia || HIPERTROFIA_PERSISTED_TYPE,
      methodology_type: HIPERTROFIA_PERSISTED_TYPE,
      dia: todayStatus?.session?.day_name || null,
      tipo: todayStatus?.session?.session_name || 'Entrenamiento del día',
      currentExerciseIndex: 0,
      ejercicios
    };
  }, [todayStatus, sessionId, methodologyPlanId, metodologia]);

  if (!backendSession.ejercicios.length) return null;

  return (
    <RoutineSessionModal
      session={backendSession}
      sessionId={sessionId}
      onClose={onClose}
      onFinishExercise={onFinishExercise}
      onSkipExercise={onSkipExercise}
      onCancelExercise={onCancelExercise}
      onEndSession={onEndSession}
      navigateToRoutines={navigateToRoutines}
      onProgressUpdate={onProgressUpdate}
    />
  );
}
