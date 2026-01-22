import fs from "fs/promises";
import path from "path";

const API_BASE = process.env.API_BASE || "http://localhost:3010";
const EMAIL = process.env.ENTRENACONIA_EMAIL || "entrenaconia@test.com";
const PASSWORD = process.env.ENTRENACONIA_PASSWORD;
const START_DATE = process.env.START_DATE || "2026-01-26";
const TOTAL_WEEKS = Number(process.env.TOTAL_WEEKS || 10);
const INCLUDE_WEEK_0 = false;
const INCLUDE_SATURDAYS = false;
const REQUEST_PAUSE_MS = Number(process.env.REQUEST_PAUSE_MS || 0);
const DEBUG = process.env.SIM_DEBUG === "1";

const TECH_DOC_PATH = path.join("docs", "REPORTE_HIPERTROFIA_V2_TECNICO.md");
const NARRATIVE_DOC_PATH = path.join("docs", "REPORTE_HIPERTROFIA_V2_NARRATIVO.md");

if (!PASSWORD) {
  console.error("❌ Falta ENTRENACONIA_PASSWORD en el entorno.");
  process.exit(1);
}

const runLog = {
  startedAt: new Date().toISOString(),
  config: {
    apiBase: API_BASE,
    email: EMAIL,
    startDate: START_DATE,
    totalWeeks: TOTAL_WEEKS,
    includeWeek0: INCLUDE_WEEK_0,
    includeSaturdays: INCLUDE_SATURDAYS,
    requestPauseMs: REQUEST_PAUSE_MS
  },
  user: {},
  plan: {},
  totals: {
    sessions: 0,
    exercises: 0,
    sets: 0,
    volumeLoad: 0
  },
  sessions: [],
  microcycles: [],
  deloads: [],
  finalStatus: {},
  progressSummary: {},
  errors: []
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const redactBody = (body) => {
  if (!body || typeof body !== "object") return body;
  const clone = Array.isArray(body) ? [...body] : { ...body };
  if ("password" in clone) clone.password = "****";
  if ("token" in clone) clone.token = "****";
  return clone;
};

const logDebug = (...args) => {
  if (DEBUG) {
    console.log(...args);
  }
};

const resolveExerciseIdByName = async (exerciseName, token, cache) => {
  if (!exerciseName) return null;
  if (cache.has(exerciseName)) return cache.get(exerciseName);
  try {
    const encodedName = encodeURIComponent(exerciseName);
    const response = await fetchJson(`/api/exercise-catalog/search/by-name/${encodedName}`, { token });
    const exercise = response.data?.exercise;
    const resolved = exercise?.exercise_id ?? exercise?.id ?? null;
    cache.set(exerciseName, resolved);
    return resolved;
  } catch (error) {
    cache.set(exerciseName, null);
    runLog.errors.push({
      step: "resolve_exercise_id",
      message: error.message,
      endpoint: error.endpoint,
      status: error.status,
      data: error.data
    });
    return null;
  }
};

const fetchJson = async (endpoint, options = {}) => {
  const { method = "GET", token, body } = options;
  const url = endpoint.startsWith("http") ? endpoint : `${API_BASE}${endpoint}`;
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const safeBody = redactBody(body);

  logDebug(`➡️ ${method} ${endpoint}`, safeBody ? JSON.stringify(safeBody) : "");

  const startedAt = Date.now();
  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const durationMs = Date.now() - startedAt;
  const text = await response.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  logDebug(`⬅️ ${method} ${endpoint} ${response.status} (${durationMs}ms)`);

  if (!response.ok || (data && data.success === false)) {
    const message = data?.error || data?.message || `HTTP ${response.status}`;
    const error = new Error(`${method} ${endpoint} -> ${message}`);
    error.status = response.status;
    error.data = data;
    error.durationMs = durationMs;
    error.endpoint = endpoint;
    error.method = method;
    error.requestBody = safeBody;
    throw error;
  }

  return { data, durationMs };
};

const normalizeLevel = (rawLevel) => {
  const value = String(rawLevel || "").toLowerCase().trim();
  if (value.includes("avan")) return "Avanzado";
  if (value.includes("inter")) return "Intermedio";
  return "Principiante";
};

const hashString = (value) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
};

const baseWeightForExercise = (exercise) => {
  const type = String(exercise.tipo_ejercicio || "").toLowerCase();
  const seed = hashString(exercise.nombre || exercise.exercise_name || "ejercicio");
  const seedFactor = (seed % 100) / 100;
  let base = 25;

  if (type === "multiarticular") base = 40;
  if (type === "unilateral") base = 25;
  if (type === "analitico") base = 20;

  return base + seedFactor * 10;
};

const parseReps = (value) => {
  if (value === null || value === undefined) return 10;
  if (typeof value === "number") return value;
  const match = String(value).match(/(\d+)\s*-\s*(\d+)/);
  if (match) {
    const min = Number(match[1]);
    const max = Number(match[2]);
    return Math.round((min + max) / 2);
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 10;
};

const round = (value, decimals = 2) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

const formatCycleDay = (session, fallbackIndex) => {
  const cycleDay = session.ciclo_dia || session.cycle_day || session.cycleDay || session.orden || fallbackIndex + 1;
  return `D${cycleDay}`;
};

const shouldSkipWeekZero = (week) => {
  const number = week?.numero ?? week?.semana ?? week?.week ?? week?.week_number;
  return Number(number) === 0;
};

const buildSessionName = (session, cycleDay) => {
  return session.nombre || session.session_name || session.name || `${cycleDay}: Sesion`;
};

const extractProgression = (responseData) => {
  if (!responseData) return null;
  const nested = responseData.progression || responseData.progression_result || responseData.result;
  if (nested && typeof nested === "object") {
    return nested;
  }
  const flat = {
    progression_applied: responseData.progression_applied ?? responseData.progressionApplied,
    increment_pct: responseData.increment_pct ?? responseData.incrementPct,
    mean_rir: responseData.mean_rir ?? responseData.meanRir
  };
  const hasData = Object.values(flat).some((value) => value !== undefined && value !== null);
  return hasData ? flat : null;
};

const summarizeWeekSessions = (sessions, weekNumber) => {
  const weekSessions = sessions.filter((entry) => entry.week === weekNumber);
  const totalVolume = weekSessions.reduce((acc, entry) => acc + entry.totals.volumeLoad, 0);
  const rirValues = weekSessions
    .map((entry) => entry.totals.meanRir)
    .filter((value) => Number.isFinite(value));
  const meanRir = rirValues.length
    ? round(rirValues.reduce((acc, value) => acc + value, 0) / rirValues.length, 2)
    : null;
  return { totalVolume: round(totalVolume, 2), meanRir };
};

const renderTable = (rows) => {
  if (rows.length === 0) return "Sin datos.";
  const headers = Object.keys(rows[0]);
  const headerLine = `| ${headers.join(" | ")} |`;
  const separator = `| ${headers.map(() => "---").join(" | ")} |`;
  const bodyLines = rows.map((row) => `| ${headers.map((key) => row[key]).join(" | ")} |`);
  return [headerLine, separator, ...bodyLines].join("\n");
};

const formatErrorDetail = (detail) => {
  if (!detail) return "—";
  const text = JSON.stringify(detail);
  return text.length > 160 ? `${text.slice(0, 157)}...` : text;
};

const writeDocs = async (data) => {
  const { microcycles, deloads, sessions, totals, plan, user, progressSummary, finalStatus } = data;
  const weeks = Array.from(new Set(sessions.map((entry) => entry.week))).sort((a, b) => a - b);

  const weekSummaries = weeks.map((weekNumber) => {
    const summary = summarizeWeekSessions(sessions, weekNumber);
    return {
      Semana: weekNumber,
      Sesiones: sessions.filter((entry) => entry.week === weekNumber).length,
      "RIR medio": summary.meanRir ?? "—",
      "Volumen total": summary.totalVolume
    };
  });

  const sessionTable = sessions.map((entry) => ({
    Semana: entry.week,
    Dia: entry.dayName,
    Ciclo: entry.cycleDay,
    Sesion: entry.sessionName,
    "RIR medio": entry.totals.meanRir ?? "—",
    Volumen: round(entry.totals.volumeLoad, 2)
  }));

  const microcycleTable = microcycles.map((entry) => ({
    Microciclo: entry.microcycle,
    Semana: entry.week,
    Progresion: entry.progression?.progression_applied ? "Aplicada" : "No aplicada",
    "Incremento %": entry.progression?.increment_pct ?? entry.progression?.increment ?? entry.progression?.incrementPct ?? "—",
    "RIR medio": entry.progression?.mean_rir ?? entry.progression?.meanRir ?? "—"
  }));

  const deloadTable = deloads.map((entry) => ({
    Microciclo: entry.microcycle,
    Semana: entry.week,
    Accion: entry.action,
    Motivo: entry.reason || "—"
  }));

  const errorTable = (data.errors || []).map((entry) => ({
    Paso: entry.step || "—",
    Mensaje: entry.message || "—",
    Endpoint: entry.endpoint || "—",
    Estado: entry.status || "—",
    Detalle: formatErrorDetail(entry.data)
  }));

  const techDoc = `# Reporte tecnico - Simulacion HipertrofiaV2

## Configuracion de ejecucion
- Usuario: ${user.email || "desconocido"} (ID ${user.id || "—"})
- API_BASE: ${data.config.apiBase}
- Inicio plan: ${data.config.startDate}
- Semanas simuladas: ${data.config.totalWeeks}
- Semana 0: omitida
- Sabados: ${data.config.includeSaturdays ? "si" : "no"}
- Plan: ${plan.methodologyPlanId || "—"} (${plan.nivel || "—"})
- Motor: ${plan.systemInfo?.motor || "—"} | Progresion: ${plan.systemInfo?.progresion || "—"}

## Flujo ejecutado
1. Login usuario
2. Cancelacion de plan activo
3. Generacion de plan D1-D5 HipertrofiaV2
4. Confirmacion del plan
5. Simulacion de 10 semanas x 5 sesiones
6. Registro de sets, progreso y cierre de sesion
7. Avance de ciclo y progresion por microciclo
8. Verificacion de deload
9. Resumen de progreso y estado final

## Resumen global
- Sesiones completadas: ${totals.sessions}
- Ejercicios completados: ${totals.exercises}
- Sets registrados: ${totals.sets}
- Volumen total estimado: ${round(totals.volumeLoad, 2)}

## Progresion por microciclo
${renderTable(microcycleTable)}

## Eventos de deload
${renderTable(deloadTable)}

## Resumen por semana
${renderTable(weekSummaries)}

## Sesiones (detalle)
${renderTable(sessionTable)}

## Estado final
${finalStatus?.cycleState ? `- Cycle day: ${finalStatus.cycleState.cycle_day}
- Microciclos completados: ${finalStatus.cycleState.microcycles_completed}
- Deload activo: ${finalStatus.cycleState.deload_active ? "si" : "no"}` : "Sin datos"}

## Progreso agregado
${progressSummary?.completedSessions != null ? `- Sesiones completadas: ${progressSummary.completedSessions}
- Ejercicios completados: ${progressSummary.completedExercises}
- Series completadas: ${progressSummary.totalSeriesCompleted}` : "Sin datos"}

## Errores
${errorTable.length ? renderTable(errorTable) : "Sin errores."}

## Observaciones
- La semana 0 se omitio porque el endpoint de sesiones no acepta week_number=0.
- Las fechas reales de sesion quedan con la fecha actual del servidor; el calendario del plan se respeta via week_number/day_name.
`;

  const narrativeLines = [];
  narrativeLines.push("# Reporte narrativo - Simulacion HipertrofiaV2");
  narrativeLines.push("");
  narrativeLines.push(`Miguel Angel inicio su plan el ${data.config.startDate} y entreno 10 semanas completas de HipertrofiaV2, 5 dias por semana.`);
  narrativeLines.push("La semana 0 se omitio para esta simulacion.");
  narrativeLines.push("El sistema MindFeed genero el plan y ajusto las cargas por microciclo segun el rendimiento (RIR medio).");
  narrativeLines.push("");

  for (const weekNumber of weeks) {
    narrativeLines.push(`## Semana ${weekNumber}`);
    const weekSessions = sessions.filter((entry) => entry.week === weekNumber);
    for (const session of weekSessions) {
      const rirText = session.totals.meanRir != null ? `${session.totals.meanRir}` : "—";
      const volumeText = round(session.totals.volumeLoad, 2);
      narrativeLines.push(`- ${session.dayName} (${session.cycleDay}): completo "${session.sessionName}" con RIR medio ${rirText} y volumen ${volumeText}.`);
    }

    const microcycleEvent = microcycles.find((entry) => entry.week === weekNumber);
    if (microcycleEvent) {
      const progression = microcycleEvent.progression;
      if (progression?.progression_applied) {
        const increment = progression.increment_pct ?? progression.increment ?? progression.incrementPct ?? "—";
        const meanRir = progression.mean_rir ?? progression.meanRir ?? "—";
        narrativeLines.push(`- La IA aplico progresion de +${increment}% al cerrar el microciclo (RIR medio ${meanRir}).`);
      } else {
        narrativeLines.push("- La IA mantuvo la carga al cerrar el microciclo.");
      }
    }

    const deloadEvent = deloads.find((entry) => entry.week === weekNumber);
    if (deloadEvent) {
      narrativeLines.push(`- Se registro un evento de deload: ${deloadEvent.action} (${deloadEvent.reason || "sin motivo"}).`);
    }

    narrativeLines.push("");
  }

  await fs.writeFile(TECH_DOC_PATH, techDoc, "utf8");
  await fs.writeFile(NARRATIVE_DOC_PATH, narrativeLines.join("\n"), "utf8");
};

const main = async () => {
  try {
    const login = await fetchJson("/api/auth/login", {
      method: "POST",
      body: { email: EMAIL, password: PASSWORD }
    });

    const token = login.data.token;
    const userId = login.data.user?.id;

    runLog.user = { id: userId, email: login.data.user?.email };

    let profile = null;
    try {
      const profileResp = await fetchJson(`/api/users/${userId}`, { token });
      profile = profileResp.data.user;
    } catch (error) {
      runLog.errors.push({ step: "profile", message: error.message });
    }

    const nivel = normalizeLevel(profile?.nivel_entrenamiento);

    try {
      await fetchJson("/api/training/cancel-plan", { method: "POST", token });
    } catch (error) {
      if (error.status !== 404) {
        throw error;
      }
    }

    const planResponse = await fetchJson("/api/hipertrofiav2/generate-d1d5", {
      method: "POST",
      token,
      body: {
        nivel,
        totalWeeks: TOTAL_WEEKS,
        includeWeek0: INCLUDE_WEEK_0,
        startConfig: {
          startDate: START_DATE,
          includeSaturdays: INCLUDE_SATURDAYS,
          distributionOption: INCLUDE_SATURDAYS ? "saturdays" : "standard"
        }
      }
    });

    const planData = planResponse.data.plan;
    const methodologyPlanId = planResponse.data.methodologyPlanId;

    runLog.plan = {
      methodologyPlanId,
      nivel,
      systemInfo: planResponse.data.system_info,
      totalWeeks: planData?.total_weeks
    };

    await fetchJson("/api/routines/confirm-plan", {
      method: "POST",
      token,
      body: { methodology_plan_id: methodologyPlanId }
    });

    const exerciseBaseWeights = new Map();
    const exerciseIdCache = new Map();
    let microcycleIndex = 0;
    let deloadActive = false;
    let deloadMicrocyclesRemaining = 0;
    let globalSessionIndex = 0;

    const weeks = (planData?.semanas || []).filter((week) => !shouldSkipWeekZero(week));

    for (const week of weeks) {
      const weekNumber = Number(week?.numero ?? week?.semana ?? week?.week ?? week?.week_number);
      const sessions = Array.isArray(week?.sesiones)
        ? [...week.sesiones].sort((a, b) => {
            const aOrder = a.ciclo_dia || a.cycle_day || a.cycleDay || a.orden || 0;
            const bOrder = b.ciclo_dia || b.cycle_day || b.cycleDay || b.orden || 0;
            return Number(aOrder) - Number(bOrder);
          })
        : [];

      for (let sessionIndex = 0; sessionIndex < sessions.length; sessionIndex += 1) {
        const sessionDef = sessions[sessionIndex];
        const cycleDay = formatCycleDay(sessionDef, sessionIndex);
        const sessionName = buildSessionName(sessionDef, cycleDay);
        const dayName = sessionDef.dia || sessionDef.dia_semana || cycleDay;

        const startResp = await fetchJson("/api/training-session/start/methodology", {
          method: "POST",
          token,
          body: {
            methodology_plan_id: methodologyPlanId,
            week_number: weekNumber,
            day_name: dayName
          }
        });

        const sessionId = startResp.data.session_id;
        const exercises = Array.isArray(sessionDef.ejercicios) ? sessionDef.ejercicios : [];

        const sessionLog = {
          week: weekNumber,
          dayName,
          cycleDay,
          sessionName,
          sessionId,
          exercises: [],
          totals: {
            exercises: 0,
            sets: 0,
            volumeLoad: 0,
            meanRir: 0
          }
        };

        let sessionRirSum = 0;

        for (let exerciseIndex = 0; exerciseIndex < exercises.length; exerciseIndex += 1) {
          const exercise = exercises[exerciseIndex];
          const exerciseName = exercise.nombre || exercise.exercise_name || `Ejercicio ${exerciseIndex + 1}`;
          const rawExerciseId = exercise.exercise_id || exercise.id || null;
          let exerciseId = rawExerciseId != null && !Number.isNaN(Number(rawExerciseId))
            ? Number(rawExerciseId)
            : null;
          const exerciseKey = exerciseId ? String(exerciseId) : exerciseName;

          if (!exerciseBaseWeights.has(exerciseKey)) {
            exerciseBaseWeights.set(exerciseKey, baseWeightForExercise(exercise));
          }

          if (!exerciseId) {
            exerciseId = await resolveExerciseIdByName(exerciseName, token, exerciseIdCache);
          }

          const baseWeight = exerciseBaseWeights.get(exerciseKey);
          const microcycleMultiplier = 1 + microcycleIndex * 0.025;
          const deloadMultiplier = deloadActive ? 0.7 : 1;
          const sessionMultiplier = 1 + globalSessionIndex * 0.001;
          const weight = round(baseWeight * microcycleMultiplier * deloadMultiplier * sessionMultiplier, 2);

          const seriesTotal = Number(exercise.series || 3);
          const reps = parseReps(exercise.reps_objetivo || exercise.repeticiones);
          const rir = 3;
          const setsToLog = deloadActive ? Math.max(1, Math.ceil(seriesTotal * 0.5)) : seriesTotal;

          if (exerciseId) {
            for (let setNumber = 1; setNumber <= setsToLog; setNumber += 1) {
              await fetchJson("/api/hipertrofiav2/save-set", {
                method: "POST",
                token,
                body: {
                  userId,
                  methodologyPlanId,
                  sessionId,
                  exerciseId,
                  exerciseName,
                  setNumber,
                  weight,
                  reps,
                  rir,
                  isWarmup: false
                }
              });

              sessionLog.totals.sets += 1;
              runLog.totals.sets += 1;
              const volumeLoad = weight * reps;
              sessionLog.totals.volumeLoad += volumeLoad;
              runLog.totals.volumeLoad += volumeLoad;
            }
          } else {
            runLog.errors.push({
              step: "save_set_skipped",
              message: `Sin exercise_id para "${exerciseName}", se omiten sets`,
              data: { sessionId, weekNumber, cycleDay }
            });
          }

          await fetchJson(`/api/training-session/progress/methodology/${sessionId}/${exerciseIndex}`, {
            method: "PUT",
            token,
            body: {
              series_completed: setsToLog,
              status: "completed",
              time_spent_seconds: setsToLog * 60
            }
          });

          sessionLog.exercises.push({
            name: exerciseName,
            exerciseId,
            sets: setsToLog,
            reps,
            weight,
            rir
          });

          sessionLog.totals.exercises += 1;
          runLog.totals.exercises += 1;
          sessionRirSum += rir;
        }

        await fetchJson(`/api/training-session/complete/methodology/${sessionId}`, {
          method: "POST",
          token,
          body: { outcome: "auto" }
        });

        const advanceCycleResp = await fetchJson("/api/hipertrofiav2/advance-cycle", {
          method: "POST",
          token,
          body: { sessionDayName: cycleDay }
        });

        sessionLog.totals.meanRir = exercises.length ? round(sessionRirSum / exercises.length, 2) : null;
        runLog.sessions.push(sessionLog);
        runLog.totals.sessions += 1;

        if (cycleDay === "D5") {
          const progression = extractProgression(advanceCycleResp.data);
          runLog.microcycles.push({
            microcycle: microcycleIndex + 1,
            week: weekNumber,
            progression
          });

          microcycleIndex += 1;

          const deloadCheck = await fetchJson(`/api/hipertrofiav2/check-deload/${userId}`, { token });
          if (!deloadActive && deloadCheck.data?.should_trigger) {
            const deloadResp = await fetchJson("/api/hipertrofiav2/activate-deload", {
              method: "POST",
              token,
              body: {
                methodologyPlanId,
                reason: deloadCheck.data.reason || "planificado"
              }
            });

            deloadActive = true;
            deloadMicrocyclesRemaining = 1;
            runLog.deloads.push({
              microcycle: microcycleIndex,
              week: weekNumber,
              action: "activar",
              reason: deloadResp.data?.reason || deloadCheck.data.reason
            });
          } else if (deloadActive) {
            deloadMicrocyclesRemaining -= 1;
            if (deloadMicrocyclesRemaining <= 0) {
              const deloadResp = await fetchJson("/api/hipertrofiav2/deactivate-deload", {
                method: "POST",
                token
              });
              deloadActive = false;
              runLog.deloads.push({
                microcycle: microcycleIndex,
                week: weekNumber,
                action: "desactivar",
                reason: deloadResp.data?.message || "deload completado"
              });
            }
          }
        }

        globalSessionIndex += 1;
        if (REQUEST_PAUSE_MS > 0) await sleep(REQUEST_PAUSE_MS);
      }
    }

    try {
      const progress = await fetchJson(`/api/routines/progress-data?methodology_plan_id=${methodologyPlanId}`, { token });
      runLog.progressSummary = progress.data.data || progress.data;
    } catch (error) {
      runLog.errors.push({ step: "progress_summary", message: error.message });
    }

    try {
      const statusResp = await fetchJson(`/api/hipertrofiav2/cycle-status/${userId}`, { token });
      runLog.finalStatus = statusResp.data;
    } catch (error) {
      runLog.errors.push({ step: "cycle_status", message: error.message });
    }

    await writeDocs(runLog);
  } catch (error) {
    runLog.errors.push({
      step: "fatal",
      message: error.message,
      endpoint: error.endpoint,
      status: error.status,
      data: error.data
    });
    await writeDocs(runLog);
    console.error("❌ Error en simulacion:", error.message);
    if (error.data) {
      console.error("Detalles:", JSON.stringify(error.data, null, 2));
    }
    process.exit(1);
  }
};

main();
