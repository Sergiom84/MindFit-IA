// Capa ligera de API para Rutinas (metodologías)
import apiClient from '../../lib/apiClient.js';

// Función helper para obtener token
const getToken = () => apiClient.getAuthToken();

export async function getPlan({ id, type }) {
  const token = getToken();
  const resp = await fetch(`/api/routines/plan?id=${encodeURIComponent(id)}&type=${encodeURIComponent(type)}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.success) throw new Error(data.error || 'No se pudo cargar el plan');
  return data.plan;
}

export async function bootstrapPlan(routine_plan_id) {
  const token = getToken();
  const resp = await fetch('/api/routines/bootstrap-plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ routine_plan_id })
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.success) throw new Error(data.error || 'No se pudo preparar el plan');
  return data.methodology_plan_id;
}

export async function startSession({ methodology_plan_id, day_id = null, week_number = null, day_name = null, session_date = null }) {
  const payload = { methodology_plan_id };
  if (session_date) payload.session_date = session_date; // resolución autoritativa por fecha
  if (day_id !== null && day_id !== undefined) payload.day_id = day_id;
  if (week_number !== null && week_number !== undefined) payload.week_number = week_number;
  if (day_name) payload.day_name = day_name;

  console.log('🔄 [API] Llamando a startSession con:', payload);

  try {
    const data = await apiClient.post('/routines/sessions/start', payload, {
      timeout: 30000
    });
    console.log('✅ [API] startSession respuesta:', data);
    if (!data.success) throw new Error(data.error || 'No se pudo iniciar la sesión');
    return data; // { session_id, total_exercises }
  } catch (error) {
    console.error('❌ [API] Error en startSession:', error);
    throw error;
  }
}

export async function updateExercise({ sessionId, exerciseOrder, series_completed, status, time_spent_seconds }) {
  const token = getToken();
  const resp = await fetch(`/api/routines/sessions/${sessionId}/exercise/${exerciseOrder}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ series_completed, status, time_spent_seconds })
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.success) throw new Error(data.error || 'No se pudo actualizar el ejercicio');
  return data;
}

export async function finishSession(sessionId) {
  const token = getToken();
  const resp = await fetch(`/api/routines/sessions/${sessionId}/finish`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.success) throw new Error(data.error || 'No se pudo finalizar la sesión');
  return data;
}

export async function getSessionProgress(sessionId) {
  const token = getToken();
  const resp = await fetch(`/api/routines/sessions/${sessionId}/progress`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.success) throw new Error(data.error || 'No se pudo cargar el progreso');
  return data; // { session, exercises, summary }
}

export async function confirmRoutinePlan({ methodology_plan_id /*, routine_plan_id (legacy ignored) */ }) {
  const token = getToken();
  const resp = await fetch('/api/routines/confirm-plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ methodology_plan_id })
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.success) throw new Error(data.error || 'No se pudo confirmar la rutina');
  return data; // { success, confirmed_at, status, etc }
}

export async function getTodaySessionStatus({ methodology_plan_id, week_number, day_name, session_date, day_id }) {
  const token = getToken();

  // Construir query parameters (preferimos day_id si está disponible)
  const params = new URLSearchParams();
  if (methodology_plan_id != null) params.set('methodology_plan_id', String(methodology_plan_id));
  if (day_id != null) params.set('day_id', String(day_id));
  if (!day_id) {
    if (week_number != null) params.set('week_number', String(week_number));
    if (day_name) params.set('day_name', String(day_name));
  }
  if (session_date) params.set('session_date', session_date);

  const resp = await fetch(`/api/routines/sessions/today-status?${params.toString()}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.success) {
    if (resp.status === 404) return null; // No hay sesión para hoy
    throw new Error(data.error || 'No se pudo obtener el estado de la sesión');
  }
  return data; // { session, exercises, summary }
}

// Estado de sesión de fin de semana. Devuelve los datos si hay sesión, o null.
export async function getWeekendStatus() {
  try {
    const token = getToken();
    if (!token) return null;
    const resp = await fetch('/api/training-session/weekend-status', {
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
    });
    if (!resp.ok) return null;
    const data = await resp.json().catch(() => ({}));
    return data?.hasWeekendSession ? data : null;
  } catch (error) {
    console.error('Error cargando estado de fin de semana:', error);
    return null;
  }
}

export async function getProgressData({ methodology_plan_id }) {
  const token = getToken();
  const resp = await fetch(`/api/routines/progress-data?methodology_plan_id=${encodeURIComponent(methodology_plan_id)}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.success) throw new Error(data.error || 'No se pudieron cargar los datos de progreso');
  return data.data; // Datos de progreso histórico
}

export async function getActivePlan() {
  // ⏱️ Timeout aumentado a 30s: este endpoint puede tardar al generar programación
  const data = await apiClient.get('/routines/active-plan', {
    timeout: 30000, // 30 segundos
    cache: false // Siempre consultar datos frescos
  });
  if (!data.success) throw new Error(data.error || 'No se pudo obtener la rutina activa');
  return data; // { hasActivePlan, routinePlan, planSource, planId, methodology_plan_id }
}

export async function saveExerciseFeedback({ sessionId, exerciseOrder, sentiment, comment, exerciseName }) {
  const token = getToken();
  const resp = await fetch(`/api/routines/sessions/${sessionId}/exercise/${exerciseOrder}/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ sentiment, comment, exerciseName })
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.success) throw new Error(data.error || 'No se pudo guardar el feedback');
  return data.feedback;
}

export async function getSessionFeedback({ sessionId }) {
  const token = getToken();
  const resp = await fetch(`/api/routines/sessions/${sessionId}/feedback`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.success) throw new Error(data.error || 'No se pudo cargar el feedback');
  return data.feedback;
}

export async function getPlanStatus({ methodologyPlanId }) {
  const token = getToken();
  const resp = await fetch(`/api/routines/plan-status/${methodologyPlanId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.success) throw new Error(data.error || 'No se pudo verificar el estado del plan');
  return data; // { isConfirmed, status, confirmedAt }
}

export async function cancelRoutine({ methodology_plan_id /*, routine_plan_id (legacy ignored) */ }) {
  const token = getToken();
  const resp = await fetch('/api/routines/cancel-routine', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ methodology_plan_id })
  });

  const data = await resp.json().catch(() => ({}));

  // Manejar casos especiales
  if (resp.ok && data.already_cancelled) {
    console.log('⚠️ La rutina ya había sido cancelada anteriormente');
    return data; // No es un error, la operación es idempotente
  }

  if (!resp.ok || !data.success) {
    // Para errores 404, dar un mensaje más claro
    if (resp.status === 404) {
      throw new Error('No se encontró la rutina a cancelar. Es posible que ya haya sido eliminada.');
    }
    throw new Error(data.error || 'No se pudo cancelar la rutina');
  }

  return data;
}

export async function getHistoricalData({ methodologyPlanId = null } = {}) {
  const token = getToken();
  const queryParams = new URLSearchParams();

  if (methodologyPlanId) {
    queryParams.set('methodology_plan_id', methodologyPlanId);
  }

  const url = `/api/routines/historical-data${queryParams.toString() ? '?' + queryParams.toString() : ''}`;

  const resp = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.success) throw new Error(data.error || 'No se pudieron cargar los datos históricos');
  return data.data; // Datos históricos completos del usuario
}



// Nueva función: obtener datos de una sesión específica completada
export async function getSessionById(sessionId) {
  const token = getToken();

  const resp = await fetch(`/api/routines/sessions/${sessionId}/details`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.success) {
    if (resp.status === 404) return null;
    throw new Error(data.error || 'No se pudo obtener la sesión');
  }
  return data; // { session, exercises, summary }
}

// Nueva función: obtener ejercicios únicos del plan para modales de cancelación
export async function getPlanExercises({ methodologyPlanId }) {
  const token = getToken();
  const resp = await fetch(`/api/routines/plan-exercises?methodology_plan_id=${encodeURIComponent(methodologyPlanId)}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.success) {
    if (resp.status === 404) return [];
    throw new Error(data.error || 'No se pudieron cargar los ejercicios del plan');
  }
  return data.exercises; // Array de ejercicios únicos del plan
}

// Nueva función: actualizar tiempo de calentamiento
export async function updateWarmupTime({ sessionId, warmupTimeSeconds }) {
  const token = getToken();
  const resp = await fetch(`/api/routines/sessions/${sessionId}/warmup-time`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ warmup_time_seconds: warmupTimeSeconds })
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.success) throw new Error(data.error || 'No se pudo actualizar el tiempo de calentamiento');
  return data;
}

// ===============================================
// 📊 RE-EVALUACIÓN PROGRESIVA
// ===============================================

/**
 * Verificar si debe mostrarse el modal de re-evaluación
 */
export async function shouldTriggerReEvaluation({ methodologyPlanId, currentWeek }) {
  const token = getToken();
  const params = new URLSearchParams({
    methodology_plan_id: methodologyPlanId,
    current_week: currentWeek
  });

  const resp = await fetch(`/api/progress/should-trigger?${params.toString()}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.success) {
    console.warn('⚠️ Error verificando trigger de re-evaluación:', data.error);
    return { should_trigger: false };
  }
  return data; // { should_trigger, current_week, last_re_evaluation }
}

/**
 * Enviar re-evaluación y obtener sugerencias de IA
 */
export async function submitReEvaluation({
  methodology,
  methodologyPlanId,
  week,
  sentiment,
  overallComment,
  exercises
}) {
  const token = getToken();
  const resp = await fetch('/api/progress/re-evaluation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({
      methodology,
      methodology_plan_id: methodologyPlanId,
      week,
      sentiment,
      overall_comment: overallComment,
      exercises
    })
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.success) {
    throw new Error(data.error || 'No se pudo guardar la re-evaluación');
  }
  return data; // { re_evaluation_id, adjustments, progress_assessment, motivational_feedback, warnings }
}

/**
 * Obtener ejercicios clave para re-evaluación
 */
export async function getKeyExercisesForReEvaluation({ methodologyPlanId, week }) {
  const token = getToken();
  const params = new URLSearchParams({
    methodology_plan_id: methodologyPlanId,
    week
  });

  const resp = await fetch(`/api/progress/key-exercises?${params.toString()}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.success) {
    throw new Error(data.error || 'No se pudieron cargar los ejercicios');
  }
  return data.exercises || [];
}

/**
 * Obtener historial de re-evaluaciones
 */
export async function getReEvaluationHistory({ methodologyPlanId = null } = {}) {
  const token = getToken();
  const params = methodologyPlanId
    ? `?methodology_plan_id=${encodeURIComponent(methodologyPlanId)}`
    : '';

  const resp = await fetch(`/api/progress/re-evaluation-history${params}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.success) {
    throw new Error(data.error || 'No se pudo cargar el historial');
  }
  return data.history || [];
}
