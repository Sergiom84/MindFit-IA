# 📘 GUÍA DE USO DE API - MÓDULOS NUTRICIONALES

## 🎯 Para Desarrolladores Frontend

Esta guía te muestra cómo integrar los nuevos módulos nutricionales en el frontend.

---

## 1️⃣ SISTEMA DE MEDICIONES CORPORALES

### Registrar Nueva Medición

```javascript
// POST /api/body-measurements
const registerMeasurement = async (measurementData) => {
  const response = await fetch("/api/body-measurements", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      weight: 75.5, // kg (OBLIGATORIO)
      waist: 82.0, // cm (OBLIGATORIO)
      biceps: 38.0, // cm (opcional)
      chest: 102.0, // cm (opcional)
      calf: 38.5, // cm (opcional)
      skinfold_abdominal: 15, // mm (opcional)
      conditions: {
        time_of_day: "morning", // morning, afternoon, evening, night
        fasted: true,
        post_workout: false,
        notes: "Medición semanal",
      },
      force_save: false, // true para forzar guardar pese a advertencias
    }),
  });

  const data = await response.json();

  // ✨ CASO 1: Medición con advertencias (requiere confirmación)
  if (data.requires_confirmation) {
    // Mostrar modal de advertencias al usuario
    showWarningsModal({
      warnings: data.warnings, // Array de advertencias
      severity: data.severity_summary, // { high: 1, medium: 2, low: 0 }
      recommendation: data.recommendation,
      measurement: data.measurement,
    });

    // Si usuario confirma → reenviar con force_save: true
    // Si usuario cancela → permitir corregir datos
  }

  // ✨ CASO 2: Medición guardada exitosamente
  if (data.success) {
    const { measurement, validation, phase_evaluation, progression_analysis } =
      data;

    // Mostrar medición guardada
    console.log("Medición:", measurement);

    // ⚠️ Verificar si hay alertas de ICG/IPG
    if (progression_analysis?.requires_reevaluation) {
      showProgressionAlert({
        alerts: progression_analysis.alerts,
        recommendations: progression_analysis.recommendations,
        summary: progression_analysis.summary,
      });
    }
  }
};
```

### Ejemplo de Modal de Advertencias

```javascript
function WarningsModal({ warnings, onConfirm, onCancel }) {
  const highSeverity = warnings.filter((w) => w.severity === "high");
  const mediumSeverity = warnings.filter((w) => w.severity === "medium");

  return (
    <div className="modal">
      <h2>⚠️ Mediciones Sospechosas Detectadas</h2>

      {highSeverity.length > 0 && (
        <div className="severity-high">
          <h3>🔴 Advertencias Críticas</h3>
          {highSeverity.map((warning, i) => (
            <div key={i} className="warning-item">
              <p>
                <strong>{warning.message}</strong>
              </p>
              <p className="suggestion">{warning.suggestion}</p>
              {warning.data && (
                <p className="data">
                  Cambio detectado: {warning.data.change}(
                  {warning.data.days_between} días)
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {mediumSeverity.length > 0 && (
        <div className="severity-medium">
          <h3>🟡 Advertencias</h3>
          {mediumSeverity.map((warning, i) => (
            <div key={i} className="warning-item">
              <p>{warning.message}</p>
              <p className="suggestion">{warning.suggestion}</p>
            </div>
          ))}
        </div>
      )}

      <div className="actions">
        <button onClick={onCancel}>Revisar Datos</button>
        <button onClick={onConfirm} className="confirm">
          Confirmar y Guardar de Todas Formas
        </button>
      </div>
    </div>
  );
}
```

### Verificar Progresión (ICG/IPG)

```javascript
// GET /api/body-measurements/progression-check
const checkProgression = async () => {
  const response = await fetch("/api/body-measurements/progression-check", {
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await response.json();

  if (!data.has_data) {
    // No hay suficientes mediciones
    return null;
  }

  const { analysis } = data;

  // 🎨 Renderizar semáforo ICG/IPG
  if (analysis.indicators.icg) {
    const { value, status, message } = analysis.indicators.icg;

    // status puede ser: 'green_plus', 'green', 'yellow', 'red'
    return (
      <div className={`icg-indicator ${status}`}>
        <span className="value">ICG: {value?.toFixed(2)}</span>
        <span className="status">{getStatusEmoji(status)}</span>
        <p>{message}</p>
      </div>
    );
  }

  // 🚨 Mostrar alertas si las hay
  if (analysis.requires_reevaluation) {
    analysis.alerts.forEach((alert) => {
      showNotification({
        type: alert.severity, // 'high', 'medium', 'low'
        title: alert.type,
        message: alert.message,
        timestamp: alert.triggered_at,
      });
    });

    // Mostrar recomendaciones
    analysis.recommendations.forEach((rec) => {
      console.log("💡 Recomendación:", rec);
    });
  }
};

function getStatusEmoji(status) {
  const emojis = {
    green_plus: "🟢✨",
    green: "🟢",
    yellow: "🟡",
    red: "🔴",
  };
  return emojis[status] || "⚪";
}
```

### Obtener Historial con Gráficas

```javascript
// GET /api/body-measurements/changes
const getChangesHistory = async () => {
  const response = await fetch("/api/body-measurements/changes", {
    headers: { Authorization: `Bearer ${token}` },
  });

  const { changes } = await response.json();

  // changes incluye:
  // - measurement_date
  // - weight_kg, waist_cm
  // - weight_change_kg, waist_change_cm
  // - icg_ratio, ipg_ratio (si aplica)
  // - days_between

  return changes.map((change) => ({
    date: change.measurement_date,
    weight: change.weight_kg,
    waist: change.waist_cm,
    weightChange: change.weight_change_kg,
    waistChange: change.waist_change_cm,
    icg: change.icg_ratio,
    ipg: change.ipg_ratio,
  }));
};

// Renderizar con librería de gráficas (Chart.js, Recharts, etc.)
function ProgressChart({ changes }) {
  return (
    <LineChart data={changes}>
      <Line dataKey="weight" stroke="#3b82f6" name="Peso (kg)" />
      <Line dataKey="waist" stroke="#ef4444" name="Cintura (cm)" />
      <Line dataKey="icg" stroke="#f59e0b" name="ICG" />
    </LineChart>
  );
}
```

---

## 2️⃣ TIMING DE CARBOHIDRATOS

### Antes del Entreno

```javascript
// POST /api/carb-timing/pre-workout
const getPreWorkoutRecommendation = async (sessionData) => {
  const response = await fetch("/api/carb-timing/pre-workout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      methodology: "hipertrofia", // calistenia, oposicion, powerlifting, crossfit
      session_intensity: "alta", // baja, media, alta, muy_alta
      session_duration: 75, // minutos
      hours_until_workout: 1.5, // horas hasta entreno
    }),
  });

  const data = await response.json();

  /*
  data.recommendation = {
    carbs_g: 60,
    timing: '1-2h antes',
    carb_type: 'Moderados',
    carb_type_description: 'Índice glucémico medio',
    examples: ['Avena', 'Arroz basmati', 'Boniato', ...],
    meal_recommendations: [
      {
        name: 'Comida pre-entreno completa',
        foods: [
          { item: 'Arroz basmati', amount: '100g secos', carbs: 80 },
          { item: 'Pechuga de pollo', amount: '120g', protein: 30 }
        ],
        total_carbs: 80,
        notes: 'Energía sostenida, consumir 2-3h antes'
      },
      ...
    ],
    rationale: 'Para hipertrofia a intensidad alta por 75 min...'
  }
  */

  return data.recommendation;
};

// 🎨 Componente de Recomendación Pre-Entreno
function PreWorkoutRecommendation({ recommendation }) {
  return (
    <div className="pre-workout-card">
      <h3>🍽️ Pre-Entreno: {recommendation.timing}</h3>

      <div className="macros">
        <span className="carbs">{recommendation.carbs_g}g carbohidratos</span>
        <span className="type">{recommendation.carb_type}</span>
      </div>

      <div className="meal-examples">
        <h4>Opciones de comidas:</h4>
        {recommendation.meal_recommendations.map((meal, i) => (
          <div key={i} className="meal-card">
            <h5>{meal.name}</h5>
            <ul>
              {meal.foods.map((food, j) => (
                <li key={j}>
                  {food.item} - {food.amount}
                  {food.carbs && ` (${food.carbs}g carbos)`}
                </li>
              ))}
            </ul>
            <p className="notes">{meal.notes}</p>
          </div>
        ))}
      </div>

      <p className="rationale">{recommendation.rationale}</p>
    </div>
  );
}
```

### Después del Entreno

```javascript
// POST /api/carb-timing/post-workout
const getPostWorkoutRecommendation = async (sessionData) => {
  const response = await fetch("/api/carb-timing/post-workout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      methodology: "hipertrofia",
      session_intensity: "alta",
      session_duration: 75,
      hours_since_workout: 0.5, // Recién terminado
    }),
  });

  const data = await response.json();

  /*
  data.recommendation = {
    carbs_g: 75,
    protein_g: 25,
    timing: 'Primeros 30min',
    urgency: 'high',  // 'high', 'medium', 'low'
    rationale: '🔥 Ventana anabólica abierta! Consume 75g carbos + 25g proteína...',
    meal_recommendations: [...]
  }
  */

  // 🔥 Si urgencia alta, mostrar notificación
  if (data.recommendation.urgency === "high") {
    showUrgentNotification({
      title: "🔥 ¡Ventana Anabólica Activa!",
      message: `Come AHORA: ${data.recommendation.carbs_g}g carbos + ${data.recommendation.protein_g}g proteína`,
      duration: 1800000, // 30 minutos
    });
  }

  return data.recommendation;
};

// 🎨 Componente Post-Entreno con Urgencia
function PostWorkoutRecommendation({ recommendation }) {
  const urgencyColors = {
    high: "bg-red-500",
    medium: "bg-orange-500",
    low: "bg-green-500",
  };

  return (
    <div
      className={`post-workout-card ${urgencyColors[recommendation.urgency]}`}
    >
      <div className="urgency-badge">
        {recommendation.urgency === "high" && "🔥 URGENTE"}
        {recommendation.urgency === "medium" && "⏰ RECOMENDADO"}
        {recommendation.urgency === "low" && "✅ OPCIONAL"}
      </div>

      <h3>Post-Entreno: {recommendation.timing}</h3>

      <div className="macros">
        <span className="carbs">{recommendation.carbs_g}g carbohidratos</span>
        <span className="protein">{recommendation.protein_g}g proteína</span>
      </div>

      <p className="rationale">{recommendation.rationale}</p>

      <div className="meal-examples">
        {recommendation.meal_recommendations.map((meal, i) => (
          <MealCard key={i} meal={meal} />
        ))}
      </div>
    </div>
  );
}
```

### Integración en Sesión de Entreno

```javascript
// Cuando usuario termina sesión de entreno
const handleSessionCompleted = async (sessionId, sessionData) => {
  // 1. Notificar al bridge que sesión completó
  await fetch("/api/bridge/session-completed", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      session_id: sessionId,
      exercises_completed: sessionData.exercises.length,
      total_volume: sessionData.totalVolume,
      perceived_effort: sessionData.rpe, // 1-10
      session_duration: sessionData.duration,
    }),
  });

  // 2. Obtener recomendación post-entreno automática
  const postWorkout = await fetch("/api/carb-timing/session-completed", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      session_id: sessionId,
      methodology: sessionData.methodology,
      intensity: sessionData.intensity,
      duration_min: sessionData.duration,
      volume_lifted: sessionData.totalVolume,
    }),
  });

  const { post_workout_recommendation, urgency, message } =
    await postWorkout.json();

  // 3. Mostrar modal post-entreno
  showPostWorkoutModal({
    recommendation: post_workout_recommendation,
    urgency,
    message,
  });
};
```

### Guía Rápida (Tabla de Referencia)

```javascript
// GET /api/carb-timing/quick-guide?methodology=hipertrofia
const getQuickGuide = async (methodology) => {
  const response = await fetch(
    `/api/carb-timing/quick-guide?methodology=${methodology}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  const data = await response.json();

  /*
  data = {
    methodology: 'Hipertrofia / Gym',
    user_weight_kg: 75,
    pre_workout: {
      timing: '1-2 horas antes',
      carbs_g: 37,
      examples: ['Avena + plátano', 'Arroz basmati + pollo'],
      tip: 'Carbos moderados para energía sostenida'
    },
    post_workout: {
      timing: 'Primeros 30-60 min',
      carbs_g: 75,
      protein_g: 22,
      examples: ['Arroz blanco + pollo', 'Batido whey + dextrosa + plátano'],
      tip: '🔥 Ventana anabólica: carbos rápidos + proteína'
    },
    general_tips: [...]
  }
  */

  return data;
};

// 🎨 Renderizar Tabla de Guía Rápida
function QuickGuideTable({ guide }) {
  return (
    <div className="quick-guide">
      <h2>{guide.methodology}</h2>
      <p>Tu peso: {guide.user_weight_kg}kg</p>

      <div className="guide-section">
        <h3>🍽️ Pre-Entreno</h3>
        <p>
          <strong>Timing:</strong> {guide.pre_workout.timing}
        </p>
        <p>
          <strong>Carbos:</strong> {guide.pre_workout.carbs_g}g
        </p>
        <p>
          <strong>Ejemplos:</strong> {guide.pre_workout.examples.join(", ")}
        </p>
        <p className="tip">💡 {guide.pre_workout.tip}</p>
      </div>

      <div className="guide-section">
        <h3>💪 Post-Entreno</h3>
        <p>
          <strong>Timing:</strong> {guide.post_workout.timing}
        </p>
        <p>
          <strong>Carbos:</strong> {guide.post_workout.carbs_g}g
        </p>
        <p>
          <strong>Proteína:</strong> {guide.post_workout.protein_g}g
        </p>
        <p>
          <strong>Ejemplos:</strong> {guide.post_workout.examples.join(", ")}
        </p>
        <p className="tip">💡 {guide.post_workout.tip}</p>
      </div>

      <div className="general-tips">
        <h4>Consejos Generales</h4>
        <ul>
          {guide.general_tips.map((tip, i) => (
            <li key={i}>{tip}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
```

---

## 3️⃣ GESTIÓN DE SALTOS DE DIETA

```javascript
// POST /api/diet-deviation/register
const registerCheatMeal = async (deviation) => {
  const response = await fetch("/api/diet-deviation/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      date: "2026-02-01",
      meal_slot: "cena", // desayuno, comida, cena, snack, extra
      excess_kcal: 800, // Calorías de EXCESO (no total)
      description: "Cena con amigos - pizza y cerveza",
      confidence_level: "medio", // bajo, medio, alto
      excess_protein: 15, // Opcional
      excess_carbs: 80, // Opcional
      excess_fat: 35, // Opcional
    }),
  });

  const data = await response.json();

  /*
  data = {
    success: true,
    deviation: { id, date, excess_kcal, ... },
    compensation_plan: [
      { date: '2026-02-02', kcal_adjustment: -133, is_applied: false },
      { date: '2026-02-03', kcal_adjustment: -133, is_applied: false },
      ...
    ],
    message: 'Salto registrado. Compensación distribuida en 6 días'
  }
  */

  // Mostrar plan de compensación al usuario
  showCompensationPlan(data.compensation_plan);
};

// GET /api/diet-deviation/today
const getTodayAdjusted = async () => {
  const response = await fetch("/api/diet-deviation/today", {
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await response.json();

  /*
  data = {
    date: '2026-02-02',
    base_target: 2200,
    compensations_today: [
      { deviation_id: 123, kcal_adjustment: -133, reason: 'Compensación salto del 01/02' }
    ],
    adjusted_target: 2067,  // 2200 - 133
    total_adjustment: -133,
    macros_adjusted: { protein_g: 165, carbs_g: 200, fat_g: 55 }
  }
  */

  return data;
};
```

---

## 🎨 COMPONENTES UI SUGERIDOS

### Dashboard de Progreso Corporal

```javascript
function BodyProgressDashboard() {
  const [progression, setProgression] = useState(null);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    loadProgressionData();
  }, []);

  const loadProgressionData = async () => {
    const progressionData = await checkProgression();
    const historyData = await getChangesHistory();

    setProgression(progressionData?.analysis);
    setHistory(historyData);
  };

  return (
    <div className="dashboard">
      {/* Indicador ICG/IPG */}
      {progression?.indicators && (
        <ICGIPGIndicator indicators={progression.indicators} />
      )}

      {/* Alertas activas */}
      {progression?.alerts?.length > 0 && (
        <AlertsPanel
          alerts={progression.alerts}
          recommendations={progression.recommendations}
        />
      )}

      {/* Gráfica de progreso */}
      <ProgressChart changes={history} />

      {/* Botón para nueva medición */}
      <button onClick={() => setShowMeasurementModal(true)}>
        ➕ Registrar Nueva Medición
      </button>
    </div>
  );
}
```

### Modal de Timing Pre-Entreno

```javascript
function PreWorkoutTimingModal({ session, onClose }) {
  const [recommendation, setRecommendation] = useState(null);

  useEffect(() => {
    loadRecommendation();
  }, [session]);

  const loadRecommendation = async () => {
    const rec = await getPreWorkoutRecommendation({
      methodology: session.methodology,
      session_intensity: session.intensity,
      session_duration: session.estimatedDuration,
      hours_until_workout: calculateHoursUntil(session.scheduledTime),
    });
    setRecommendation(rec);
  };

  if (!recommendation) return <Spinner />;

  return (
    <Modal onClose={onClose}>
      <PreWorkoutRecommendation recommendation={recommendation} />
      <button onClick={onClose}>Entendido</button>
    </Modal>
  );
}
```

---

## 📱 NOTIFICACIONES PUSH (Recomendado)

```javascript
// Configurar notificaciones para timing
function setupCarbTimingNotifications(sessionSchedule) {
  const { scheduledTime, methodology, intensity, duration } = sessionSchedule;

  // Notificación 2h antes
  scheduleNotification({
    time: scheduledTime - 2 * 60 * 60 * 1000,
    title: "🍽️ Pre-Entreno en 2 horas",
    body: "Es momento de tu comida pre-entreno",
    action: "view_recommendation",
  });

  // Notificación inmediata al terminar
  scheduleNotification({
    time: scheduledTime + duration * 60 * 1000,
    title: "🔥 ¡Ventana Anabólica Activa!",
    body: "Come carbos + proteína AHORA para máxima recuperación",
    action: "view_post_workout",
    urgency: "high",
  });
}
```

---

## ✅ CHECKLIST DE INTEGRACIÓN

- [ ] Crear formulario de mediciones corporales
- [ ] Implementar modal de advertencias de validación
- [ ] Crear dashboard de progreso con gráficas
- [ ] Añadir semáforo ICG/IPG visual
- [ ] Integrar timing pre-entreno en planificación de sesiones
- [ ] Mostrar recomendación post-entreno al finalizar sesión
- [ ] Implementar notificaciones push para timing
- [ ] Crear tabla de guía rápida por metodología
- [ ] Añadir registro de saltos de dieta
- [ ] Mostrar plan de compensación semanal

---

## 🚀 ¡Listo para Implementar!

Todos los endpoints están funcionando y documentados. Solo falta crear las interfaces visuales en el frontend para que los usuarios puedan aprovechar todas estas funcionalidades inteligentes. 💪
