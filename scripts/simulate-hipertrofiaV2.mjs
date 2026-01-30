import fs from "fs/promises";
import path from "path";

const API_BASE = process.env.API_BASE || "http://localhost:3010";
const CREATE_USER = process.env.SIM_CREATE_USER !== "0";
const EMAIL = process.env.ENTRENACONIA_EMAIL || "";
const PASSWORD = process.env.ENTRENACONIA_PASSWORD || "";
const START_DATE = process.env.START_DATE || "2026-01-26";
const TOTAL_WEEKS = Number(process.env.TOTAL_WEEKS || 10);
const INCLUDE_WEEK_0 = process.env.INCLUDE_WEEK_0 !== "0";
const INCLUDE_SATURDAYS = false;
const REQUEST_PAUSE_MS = Number(process.env.REQUEST_PAUSE_MS || 0);
const DEBUG = process.env.SIM_DEBUG === "1";
const FORCE_LEVEL = process.env.FORCE_LEVEL || "";
const DAY_SKIP_RATE = Number(process.env.DAY_SKIP_RATE || 0.15);
const DAY_OFFPLAN_RATE = Number(process.env.DAY_OFFPLAN_RATE || 0.15);
const DAY_FATIGUE_RATE = Number(process.env.DAY_FATIGUE_RATE || 0.2);
const DAY_TOP_RATE = Number(process.env.DAY_TOP_RATE || 0.2);
const DAY_OBJECTIVE_FATIGUE_RATE = Number(process.env.DAY_OBJECTIVE_FATIGUE_RATE || 0.2);

const TECH_DOC_PATH = path.join("docs", "REPORTE_HIPERTROFIA_V2_TECNICO.md");
const NARRATIVE_DOC_PATH = path.join("docs", "REPORTE_HIPERTROFIA_V2_NARRATIVO.md");

const DEFAULT_PROFILE = {
  nombre: "Miguel",
  apellido: "Angel Batista",
  edad: 24,
  sexo: "masculino",
  peso: 80,
  altura: 1.72,
  nivelEntrenamiento: "principiante",
  anosEntrenando: 0,
  frecuenciaSemanal: 0
};

const runLog = {
  startedAt: new Date().toISOString(),
  config: {
    apiBase: API_BASE,
    email: EMAIL,
    createUser: CREATE_USER,
    startDate: START_DATE,
    totalWeeks: TOTAL_WEEKS,
    includeWeek0: INCLUDE_WEEK_0,
    includeSaturdays: INCLUDE_SATURDAYS,
    requestPauseMs: REQUEST_PAUSE_MS,
    daySkipRate: DAY_SKIP_RATE,
    dayOffPlanRate: DAY_OFFPLAN_RATE,
    dayFatigueRate: DAY_FATIGUE_RATE,
    dayTopRate: DAY_TOP_RATE,
    dayObjectiveFatigueRate: DAY_OBJECTIVE_FATIGUE_RATE
  },
  user: {},
  plan: {},
  totals: {
    sessions: 0,
    exercises: 0,
    sets: 0,
    volumeLoad: 0,
    skippedSessions: 0,
    offPlanDays: 0,
    fatigueDays: 0,
    topDays: 0,
    objectiveFatigueDays: 0
  },
  sessions: [],
  microcycles: [],
  deloads: [],
  adaptation: {
    block: null,
    sessions: [],
    totals: {
      sessions: 0,
      skipped: 0,
      offPlan: 0
    },
    evaluation: null,
    transition: null
  },
  validations: {
    intensity: { total: 0, ok: 0, outOfRange: 0, missing: 0 },
    reps: { totalSets: 0, okSets: 0, range: "8-12" },
    rir: { totalSets: 0, okSets: 0, week0Total: 0, week0Ok: 0, range: "2-3", rangeWeek0: "3-4" },
    order: { sessions: 0, ok: 0, failed: 0, unknown: 0 },
    volume: { sessions: 0, matched: 0, mismatched: 0 }
  },
  planChecks: {
    baselineWeek: null,
    volumeVariations: []
  },
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

const buildRandomEmail = () => {
  const stamp = Date.now();
  const rand = Math.floor(Math.random() * 1000);
  return `sim_novato_${stamp}_${rand}@test.com`;
};

const buildRandomPassword = () => {
  const stamp = Date.now().toString(36);
  return `Sim-${stamp}-Novato`;
};

const registerUser = async () => {
  const email = EMAIL || buildRandomEmail();
  const password = PASSWORD || buildRandomPassword();

  const payload = {
    ...DEFAULT_PROFILE,
    email,
    password
  };

  try {
    const response = await fetchJson("/api/auth/register", {
      method: "POST",
      body: payload
    });
    return {
      user: response.data.user,
      token: response.data.token,
      email,
      password
    };
  } catch (error) {
    if (error?.data?.error?.toLowerCase?.().includes("ya existe")) {
      const fallbackEmail = buildRandomEmail();
      const fallbackResponse = await fetchJson("/api/auth/register", {
        method: "POST",
        body: { ...payload, email: fallbackEmail }
      });
      return {
        user: fallbackResponse.data.user,
        token: fallbackResponse.data.token,
        email: fallbackEmail,
        password
      };
    }
    throw error;
  }
};

const loginUser = async () => {
  if (!EMAIL || !PASSWORD) {
    throw new Error("Faltan ENTRENACONIA_EMAIL o ENTRENACONIA_PASSWORD para login.");
  }
  const response = await fetchJson("/api/auth/login", {
    method: "POST",
    body: { email: EMAIL, password: PASSWORD }
  });
  return {
    user: response.data.user,
    token: response.data.token,
    email: EMAIL,
    password: PASSWORD
  };
};

const normalizeExerciseId = (value) => {
  if (value === null || value === undefined) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const normalizeExerciseKey = (value) => String(value || "").trim().toLowerCase();

const normalizeExerciseType = (value) => {
  const raw = String(value || "").toLowerCase().trim();
  if (!raw) return "unknown";
  if (raw.includes("multi")) return "multi";
  if (raw.includes("uni")) return "uni";
  if (raw.includes("anal") || raw.includes("aisl")) return "analitico";
  return "unknown";
};

const exerciseTypeRank = (type) => {
  if (type === "multi") return 1;
  if (type === "uni") return 2;
  if (type === "analitico") return 3;
  return 99;
};

const isNonDecreasing = (values) => {
  for (let i = 1; i < values.length; i += 1) {
    if (values[i] < values[i - 1]) return false;
  }
  return true;
};

const expectedIntensityRange = (cycleDay, weekNumber) => {
  if (Number(weekNumber) === 0) {
    return { min: 0.7, max: 0.7, label: "70%" };
  }
  if (cycleDay === "D4" || cycleDay === "D5") {
    return { min: 0.7, max: 0.75, label: "70-75%" };
  }
  return { min: 0.8, max: 0.8, label: "80%" };
};

const expectedRepsRange = (weekNumber) => {
  if (Number(weekNumber) === 0) return { min: 8, max: 12, label: "8-12" };
  return { min: 8, max: 12, label: "8-12" };
};

const expectedRirRange = (weekNumber) => {
  if (Number(weekNumber) === 0) return { min: 3, max: 4, label: "3-4" };
  return { min: 2, max: 3, label: "2-3" };
};


const isWithinRange = (value, min, max, tolerance = 0.01) => {
  if (!Number.isFinite(value)) return false;
  return value >= min - tolerance && value <= max + tolerance;
};

const parseSeries = (value) => {
  if (value === null || value === undefined) return 3;
  if (typeof value === "number") return value > 0 ? value : 3;
  const text = String(value);
  const rangeMatch = text.match(/(\d+)\s*-\s*(\d+)/);
  if (rangeMatch) {
    const min = Number(rangeMatch[1]);
    const max = Number(rangeMatch[2]);
    if (Number.isFinite(min) && Number.isFinite(max)) {
      return Math.round((min + max) / 2);
    }
  }
  const numeric = Number(text);
  if (!Number.isFinite(numeric) || numeric <= 0) return 3;
  return numeric;
};

const resolveExerciseIdByName = async (exerciseName, token, cache) => {
  if (!exerciseName) return null;
  if (cache.has(exerciseName)) return cache.get(exerciseName);
  try {
    const encodedName = encodeURIComponent(exerciseName);
    const response = await fetchJson(`/api/exercise-catalog/search/by-name/${encodedName}`, { token });
    const exercise = response.data?.exercise;
    const raw = exercise?.exercise_id ?? exercise?.id ?? null;
    const resolved = normalizeExerciseId(raw);
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
  if (typeof value === "number") return value > 0 ? value : 10;
  const match = String(value).match(/(\d+)\s*-\s*(\d+)/);
  if (match) {
    const min = Number(match[1]);
    const max = Number(match[2]);
    return Math.round((min + max) / 2);
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 10;
  return numeric;
};

const parseIntensity = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    if (value <= 0) return null;
    if (value <= 1) return value;
    if (value <= 100) return value / 100;
    return null;
  }
  const text = String(value).replace("%", "").trim();
  const rangeMatch = text.match(/(\d+(?:[.,]\d+)?)\s*-\s*(\d+(?:[.,]\d+)?)/);
  if (rangeMatch) {
    const min = Number(rangeMatch[1].replace(",", "."));
    const max = Number(rangeMatch[2].replace(",", "."));
    if (Number.isFinite(min) && Number.isFinite(max)) {
      const avg = (min + max) / 2;
      return avg > 1 ? avg / 100 : avg;
    }
  }
  const numeric = Number(text.replace(",", "."));
  if (!Number.isFinite(numeric)) return null;
  return numeric > 1 ? numeric / 100 : numeric;
};

const round = (value, decimals = 2) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const roundToStep = (value, step = 0.5) => {
  const inv = 1 / step;
  return Math.round(value * inv) / inv;
};

const deterministicUnit = (...parts) => {
  const seed = parts.filter(Boolean).join("|");
  return (hashString(seed) % 1000) / 1000;
};

const deterministicNoise = (...parts) => deterministicUnit(...parts) * 2 - 1;

const decideDayProfile = ({ userId, planId, weekNumber, cycleDay, rates = null }) => {
  const effectiveRates = rates || {
    skip: DAY_SKIP_RATE,
    offPlan: DAY_OFFPLAN_RATE,
    fatigue: DAY_FATIGUE_RATE,
    top: DAY_TOP_RATE
  };
  const roll = deterministicUnit(userId, planId, weekNumber, cycleDay, "day_profile");
  if (roll < effectiveRates.skip) return "miss";
  if (roll < effectiveRates.skip + effectiveRates.offPlan) return "off_plan";
  if (roll < effectiveRates.skip + effectiveRates.offPlan + effectiveRates.fatigue) return "fatigue";
  if (roll < effectiveRates.skip + effectiveRates.offPlan + effectiveRates.fatigue + effectiveRates.top) return "top";
  return "normal";
};

const shouldTriggerObjectiveFatigue = ({ userId, planId, weekNumber, cycleDay, dayProfile }) => {
  if (dayProfile === "miss") return false;
  if (Number(weekNumber) === 0) return false;
  const roll = deterministicUnit(userId, planId, weekNumber, cycleDay, "objective_fatigue");
  return roll < DAY_OBJECTIVE_FATIGUE_RATE;
};

const buildSubjectiveFatiguePayload = ({ userId, planId, weekNumber, cycleDay }) => {
  const seed = deterministicUnit(userId, planId, weekNumber, cycleDay, "fatigue_subjective");
  const sleepQuality = 4 + Math.round(seed);
  const energyLevel = 4 + Math.round(deterministicUnit(userId, planId, weekNumber, cycleDay, "fatigue_energy"));
  const domsLevel = 6 + Math.round(deterministicUnit(userId, planId, weekNumber, cycleDay, "fatigue_doms"));
  const focusLevel = 6 + Math.round(deterministicUnit(userId, planId, weekNumber, cycleDay, "fatigue_focus"));
  const motivationLevel = 6 + Math.round(deterministicUnit(userId, planId, weekNumber, cycleDay, "fatigue_motivation"));

  return {
    sleep_quality: clamp(sleepQuality, 4, 5),
    energy_level: clamp(energyLevel, 4, 5),
    doms_level: clamp(domsLevel, 6, 7),
    joint_pain_level: 0,
    focus_level: clamp(focusLevel, 6, 8),
    motivation_level: clamp(motivationLevel, 6, 8),
    notes: "Fatiga subjetiva leve (simulada)"
  };
};

const formatCycleDay = (session, fallbackIndex) => {
  const cycleDay = session.ciclo_dia || session.cycle_day || session.cycleDay || session.orden || fallbackIndex + 1;
  return `D${cycleDay}`;
};

const resolveWeekNumber = (week, fallbackIndex, sessions) => {
  const raw =
    week?.numero ??
    week?.semana ??
    week?.week ??
    week?.week_number ??
    week?.weekNumber ??
    null;
  const numeric = Number(raw);
  if (Number.isFinite(numeric)) return numeric;

  const idSource = week?.id || sessions?.[0]?.id || "";
  const match = String(idSource).match(/W(\d+)/i);
  if (match && match[1] != null) {
    const parsed = Number(match[1]);
    if (Number.isFinite(parsed)) return parsed;
  }

  if (Number.isFinite(fallbackIndex)) {
    return INCLUDE_WEEK_0 ? fallbackIndex : fallbackIndex + 1;
  }

  return null;
};

const resolveDayName = (sessionDef, cycleDay) =>
  sessionDef.dia || sessionDef.dia_semana || sessionDef.day_name || sessionDef.dayName || cycleDay;

const shouldSkipWeekZero = (week, includeWeek0) => {
  if (includeWeek0) return false;
  const number = week?.numero ?? week?.semana ?? week?.week ?? week?.week_number;
  return Number(number) === 0;
};

const resolveDeloadInfo = (week) => {
  const weekType = String(week?.tipo || "").toLowerCase();
  const weekFlag = Boolean(week?.es_deload) || weekType === "deload";
  const sessions = Array.isArray(week?.sesiones) ? week.sesiones : [];
  const sessionFlag = sessions.some((session) => {
    const sessionType = String(session?.tipo || "").toLowerCase();
    return Boolean(session?.es_deload) || sessionType === "deload" || Boolean(session?.deload_reason);
  });

  if (!weekFlag && !sessionFlag) return { isDeload: false, reason: null };

  const reason =
    week?.deload_reason ||
    sessions.find((session) => session?.deload_reason)?.deload_reason ||
    "planificado";

  return { isDeload: true, reason };
};

const buildSessionName = (session, cycleDay) => {
  return session.nombre || session.session_name || session.name || `${cycleDay}: Sesion`;
};

const computeBaseRir = ({ cycleDay, weekNumber, intensityPct, dayProfile }) => {
  let base = Number(weekNumber) === 0 ? 3.8 : 3.4;

  if (cycleDay === "D5") base -= 0.3;
  if (cycleDay === "D4") base -= 0.15;

  if (Number.isFinite(intensityPct)) {
    if (intensityPct >= 0.8) base -= 0.4;
    if (intensityPct <= 0.7) base += 0.2;
  }

  if (dayProfile === "fatigue") base += 0.7;
  if (dayProfile === "top") base -= 0.4;

  return clamp(base, 1.5, 4.8);
};

const computeAdaptationBaseRir = ({ intensityPct, dayProfile }) => {
  let base = 3.6;

  if (Number.isFinite(intensityPct)) {
    if (intensityPct <= 0.7) base += 0.1;
  }

  if (dayProfile === "fatigue") base += 0.4;
  if (dayProfile === "top") base -= 0.3;

  return clamp(base, 3, 4);
};

const computeSetsToLog = ({ seriesTotal, dayProfile, objectiveFatigue }) => {
  let reduction = 0;
  if (dayProfile === "fatigue") reduction += 1;
  if (objectiveFatigue) reduction += 1;

  const minSets = objectiveFatigue && seriesTotal >= 2 ? 2 : 1;
  const target = seriesTotal - reduction;
  return clamp(target, minSets, seriesTotal);
};

const buildSetRirs = ({ baseRir, setsToLog, exerciseKey, weekNumber, cycleDay, minRir = 0, maxRir = 5 }) => {
  const exerciseNoise = deterministicNoise(exerciseKey, weekNumber, cycleDay, "rir");
  const noiseAmplitude = 0.6;
  const baseWithNoise = baseRir + exerciseNoise * noiseAmplitude;

  const setRirs = [];
  for (let setNumber = 1; setNumber <= setsToLog; setNumber += 1) {
    const fatigueDrop = (setNumber - 1) * 0.25;
    const rawRir = baseWithNoise - fatigueDrop;
    let rir = clamp(Math.round(rawRir), minRir, maxRir);
    setRirs.push(rir);
  }
  return setRirs;
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
    Perfil: entry.dayProfile || "normal",
    Saltada: entry.skipped ? "Si" : "No",
    "Fatiga subj": entry.fatigueReport?.flag_created ? entry.fatigueReport.flag?.flag_type || "light" : "—",
    "Fatiga obj": entry.autoFatigue?.flag_detected ? entry.autoFatigue.flag_type || "light" : "—",
    "RIR medio": entry.totals.meanRir ?? "—",
    Volumen: round(entry.totals.volumeLoad, 2),
    "Intensidad avg": entry.validation?.intensity?.avgPct ?? "—",
    "Intensidad exp": entry.validation?.intensity?.expected ?? "—",
    "Orden M/U/A": entry.validation?.order?.status ?? "—",
    "Reps ok": entry.validation?.reps
      ? `${entry.validation.reps.okSets}/${entry.validation.reps.totalSets}`
      : "—",
    "RIR ok": entry.validation?.rir
      ? `${entry.validation.rir.okSets}/${entry.validation.rir.totalSets}`
      : "—"
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

  const intensityChecks = data.validations?.intensity || {};
  const repsChecks = data.validations?.reps || {};
  const rirChecks = data.validations?.rir || {};
  const orderChecks = data.validations?.order || {};
  const volumeChecks = data.validations?.volume || {};

  const validationSummary = [
    {
      Check: "Intensidad por día",
      "OK/Total": intensityChecks.total ? `${intensityChecks.ok}/${intensityChecks.total}` : "—",
      "Fuera rango": intensityChecks.outOfRange ?? 0,
      Faltantes: intensityChecks.missing ?? 0
    },
    {
      Check: "Reps objetivo 8-12",
      "OK/Total": repsChecks.totalSets ? `${repsChecks.okSets}/${repsChecks.totalSets}` : "—",
      "Fuera rango": repsChecks.totalSets ? repsChecks.totalSets - repsChecks.okSets : "—",
      Faltantes: 0
    },
    {
      Check: `RIR objetivo ${rirChecks.range || "2-3"} / semana 0 ${rirChecks.rangeWeek0 || "3-4"}`,
      "OK/Total": rirChecks.totalSets ? `${rirChecks.okSets}/${rirChecks.totalSets}` : "—",
      "Fuera rango": rirChecks.totalSets ? rirChecks.totalSets - rirChecks.okSets : "—",
      Faltantes: 0
    },
    {
      Check: "Orden Multi→Uni→Analítico",
      "OK/Total": orderChecks.sessions ? `${orderChecks.ok}/${orderChecks.sessions}` : "—",
      "Fuera rango": orderChecks.failed ?? 0,
      Faltantes: orderChecks.unknown ?? 0
    },
    {
      Check: "Volumen fijo (series)",
      "OK/Total": volumeChecks.sessions ? `${volumeChecks.matched}/${volumeChecks.sessions}` : "—",
      "Fuera rango": volumeChecks.mismatched ?? 0,
      Faltantes: 0
    }
  ];

  const volumeVariationTable = (data.planChecks?.volumeVariations || []).map((entry) => ({
    Semana: entry.week,
    Ciclo: entry.cycleDay,
    Motivo: "Cambio de series/ejercicios vs baseline"
  }));

  const adaptationBlock = data.adaptation?.block || {};
  const adaptationTotals = data.adaptation?.totals || {};
  const adaptationEval = data.adaptation?.evaluation || {};
  const adaptationTransition = data.adaptation?.transition || {};

  const techDoc = `# Reporte tecnico - Simulacion HipertrofiaV2

## Configuracion de ejecucion
- Usuario: ${user.email || "desconocido"} (ID ${user.id || "—"})
- API_BASE: ${data.config.apiBase}
- Inicio plan: ${data.config.startDate}
- Semanas simuladas: ${data.config.totalWeeks}
- Semana 0: ${data.config.includeWeek0 ? "incluida" : "omitida"}
- Sabados: ${data.config.includeSaturdays ? "si" : "no"}
- Plan: ${plan.methodologyPlanId || "—"} (${plan.nivel || "—"})
- Motor: ${plan.systemInfo?.motor || "—"} | Progresion: ${plan.systemInfo?.progresion || "—"}
- Perfil dias: ${Math.round(data.config.daySkipRate * 100)}% skip, ${Math.round(data.config.dayOffPlanRate * 100)}% off-plan, ${Math.round(data.config.dayFatigueRate * 100)}% fatiga, ${Math.round(data.config.dayTopRate * 100)}% top
- Fatiga objetiva simulada: ${Math.round(data.config.dayObjectiveFatigueRate * 100)}% (leve)

## Bloque de adaptacion (novato total)
- Bloque ID: ${adaptationBlock.id || "—"} | Plan ID: ${adaptationBlock.methodologyPlanId || "—"}
- Tag IA: ${adaptationBlock.aiTag || "—"} | Tipo: ${adaptationBlock.blockType || "—"}
- Duracion: ${adaptationBlock.durationWeeks || "—"} semanas | Sesiones/semana: ${adaptationBlock.sessionsPerWeek || "—"}
- Sesiones ejecutadas: ${adaptationTotals.sessions || 0} | Saltadas: ${adaptationTotals.skipped || 0} | Off-plan: ${adaptationTotals.offPlan || 0}
- Evaluacion: ${adaptationEval?.week?.allCriteriaMet === true ? "OK" : "Pendiente"}
- Transicion: ${adaptationTransition?.readyForD1D5 ? "OK" : adaptationTransition?.error || "—"}

## Flujo ejecutado
1. Registro/login usuario
2. Cancelacion de plan activo
3. Generacion y ejecucion de bloque de adaptacion
4. Evaluacion y transicion a D1-D5
5. Generacion de plan D1-D5 HipertrofiaV2
6. Confirmacion del plan
7. Simulacion de ${data.config.totalWeeks}${data.config.includeWeek0 ? " + semana 0" : ""} semanas x 5 sesiones
8. Registro de sets, progreso y cierre de sesion
9. Avance de ciclo y progresion por microciclo
10. Verificacion de deload
11. Resumen de progreso y estado final

## Resumen global
- Sesiones simuladas: ${totals.sessions}
- Sesiones saltadas: ${totals.skippedSessions}
- Dias con fatiga subjetiva: ${totals.fatigueDays}
- Dias top: ${totals.topDays}
- Dias con fatiga objetiva (intencion): ${totals.objectiveFatigueDays}
- Ejercicios completados: ${totals.exercises}
- Sets registrados: ${totals.sets}
- Volumen total estimado: ${round(totals.volumeLoad, 2)}

## Validaciones adicionales (script)
${renderTable(validationSummary)}

${volumeVariationTable.length
  ? `\n### Variaciones de volumen detectadas (baseline semana ${data.planChecks?.baselineWeek ?? "—"})\n${renderTable(volumeVariationTable)}`
  : `\n### Variaciones de volumen detectadas\nSin cambios vs baseline (series/ejercicios constantes).\n`}

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
${data.config.includeWeek0
  ? "- La semana 0 se simulo como calibracion (RIR 3-4, sin progresion)."
  : "- La semana 0 se omitio por configuracion de simulacion."}
- Las fechas reales de sesion quedan con la fecha actual del servidor; el calendario del plan se respeta via week_number/day_name.
`;

  const narrativeLines = [];
  narrativeLines.push("# Reporte narrativo - Simulacion HipertrofiaV2");
  narrativeLines.push("");
  narrativeLines.push(`Miguel Angel inicio su plan el ${data.config.startDate} y entreno ${data.config.totalWeeks}${data.config.includeWeek0 ? " + semana 0" : ""} semanas completas de HipertrofiaV2, 5 dias por semana.`);
  narrativeLines.push(data.config.includeWeek0
    ? "La semana 0 se utilizo como calibracion (sin progresion)."
    : "La semana 0 se omitio para esta simulacion.");
  narrativeLines.push("El sistema MindFeed genero el plan y ajusto las cargas por microciclo segun el rendimiento (RIR medio).");
  narrativeLines.push(`Se simularon dias con fallos (${Math.round(data.config.daySkipRate * 100)}%), fatiga (${Math.round(data.config.dayFatigueRate * 100)}%), dias top (${Math.round(data.config.dayTopRate * 100)}%) y fatiga objetiva leve (${Math.round(data.config.dayObjectiveFatigueRate * 100)}%).`);
  narrativeLines.push("");

  for (const weekNumber of weeks) {
    narrativeLines.push(`## Semana ${weekNumber}`);
    const weekSessions = sessions.filter((entry) => entry.week === weekNumber);
    for (const session of weekSessions) {
      if (session.skipped) {
        narrativeLines.push(`- ${session.dayName} (${session.cycleDay}): sesion omitida (skip).`);
        continue;
      }
      const rirText = session.totals.meanRir != null ? `${session.totals.meanRir}` : "—";
      const volumeText = round(session.totals.volumeLoad, 2);
      const perfil = session.dayProfile ? ` (${session.dayProfile})` : "";
      const fatigueAuto = session.autoFatigue?.flag_detected
        ? ` Fatiga objetiva: ${session.autoFatigue.flag_type || "light"}.`
        : "";
      const fatigueSubj = session.fatigueReport?.flag_created
        ? ` Fatiga subjetiva: ${session.fatigueReport.flag?.flag_type || "light"}.`
        : "";
      narrativeLines.push(`- ${session.dayName} (${session.cycleDay}): completo "${session.sessionName}"${perfil} con RIR medio ${rirText} y volumen ${volumeText}.${fatigueSubj}${fatigueAuto}`);
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

const DAY_ORDER = { Lun: 1, Mar: 2, Mie: 3, Jue: 4, Vie: 5, Sab: 6, Dom: 7 };

const simulateAdaptationBlock = async ({ token, userId, exerciseIdCache }) => {
  const generateResp = await fetchJson("/api/adaptation/generate", {
    method: "POST",
    token,
    body: {}
  });

  runLog.adaptation.block = generateResp.data.block || null;

  const sessionsResp = await fetchJson("/api/adaptation/sessions", { token });
  const adaptationPlanId = sessionsResp.data.methodology_plan_id || generateResp.data.block?.methodologyPlanId;
  const sessions = Array.isArray(sessionsResp.data.sessions) ? sessionsResp.data.sessions : [];

  const sortedSessions = [...sessions].sort((a, b) => {
    const weekDiff = Number(a.week_number || 0) - Number(b.week_number || 0);
    if (weekDiff !== 0) return weekDiff;
    const aOrder = DAY_ORDER[a.day_name] || 99;
    const bOrder = DAY_ORDER[b.day_name] || 99;
    return aOrder - bOrder;
  });

  const adaptationRates = {
    skip: 0,
    offPlan: DAY_OFFPLAN_RATE,
    fatigue: DAY_FATIGUE_RATE,
    top: DAY_TOP_RATE
  };

  const sessionWeightAverages = [];
  let totalRirSum = 0;
  let totalRirCount = 0;

  for (let sessionIndex = 0; sessionIndex < sortedSessions.length; sessionIndex += 1) {
    const sessionInfo = sortedSessions[sessionIndex];
    const weekNumber = Number(sessionInfo.week_number || 1);
    const dayName = sessionInfo.day_name;

    const startResp = await fetchJson("/api/training-session/start/methodology", {
      method: "POST",
      token,
      body: {
        methodology_plan_id: adaptationPlanId,
        week_number: weekNumber,
        day_name: dayName
      }
    });

    const sessionId = startResp.data.session_id;
    const cycleKey = `${weekNumber}-${dayName}`;
    const dayProfile = decideDayProfile({
      userId,
      planId: adaptationPlanId,
      weekNumber,
      cycleDay: cycleKey,
      rates: adaptationRates
    });

    const sessionLog = {
      week: weekNumber,
      dayName,
      sessionId,
      dayProfile,
      skipped: dayProfile === "miss",
      exercises: [],
      totals: {
        sets: 0,
        volumeLoad: 0,
        meanRir: null,
        avgWeight: null
      }
    };

    if (dayProfile === "miss") {
      await fetchJson(`/api/training-session/complete/methodology/${sessionId}`, {
        method: "POST",
        token,
        body: { outcome: "skip_remaining" }
      });

      runLog.adaptation.sessions.push(sessionLog);
      runLog.adaptation.totals.sessions += 1;
      runLog.adaptation.totals.skipped += 1;
      continue;
    }

    if (dayProfile === "off_plan") runLog.adaptation.totals.offPlan += 1;

    const progressResp = await fetchJson(`/api/training-session/progress/methodology/${sessionId}`, { token });
    const exercises = Array.isArray(progressResp.data.exercises) ? progressResp.data.exercises : [];
    const offPlanLimit = dayProfile === "off_plan"
      ? Math.max(1, Math.floor(exercises.length * 0.6))
      : exercises.length;

    const dayWeightMultiplier = dayProfile === "fatigue" ? 0.93 : dayProfile === "top" ? 1.05 : 1;
    const maxProgressionPct = 0.1;
    const progressionFactorBase = 1 + (sessionIndex / Math.max(1, sortedSessions.length - 1)) * maxProgressionPct;
    const progressionFactor = sessionIndex === sortedSessions.length - 1
      ? Math.max(progressionFactorBase, 1 + maxProgressionPct)
      : progressionFactorBase;

    let sessionWeightSum = 0;
    let sessionWeightCount = 0;
    let sessionRirSum = 0;

    for (let exerciseIndex = 0; exerciseIndex < exercises.length; exerciseIndex += 1) {
      const exercise = exercises[exerciseIndex];
      if (exerciseIndex >= offPlanLimit) {
        continue;
      }

      const exerciseName = exercise.exercise_name || exercise.exerciseName || `Ejercicio ${exerciseIndex + 1}`;
      const exerciseKey = exerciseName;
      let exerciseId = normalizeExerciseId(exercise.exercise_id || exercise.id);
      if (!exerciseId) {
        exerciseId = await resolveExerciseIdByName(exerciseName, token, exerciseIdCache);
      }
      const intensityPct = parseIntensity(exercise.intensidad ?? exercise.intensity);
      const baseWeight = baseWeightForExercise(exercise);
      const targetWeight = Number.isFinite(intensityPct) ? baseWeight * intensityPct : baseWeight;
      const weight = roundToStep(targetWeight * dayWeightMultiplier * progressionFactor, 0.5);

      const seriesTotal = parseSeries(exercise.series_total ?? exercise.series ?? 2);
      const reps = parseReps(exercise.repeticiones ?? exercise.reps ?? 12);
      const baseRir = computeAdaptationBaseRir({ intensityPct, dayProfile });
      const setsToLog = computeSetsToLog({ seriesTotal, dayProfile, objectiveFatigue: false });
      const setRirs = buildSetRirs({
        baseRir,
        setsToLog,
        exerciseKey,
        weekNumber,
        cycleDay: cycleKey,
        minRir: 3,
        maxRir: 4
      });

      for (let setIndex = 0; setIndex < setsToLog; setIndex += 1) {
        await fetchJson("/api/hipertrofiav2/save-set", {
          method: "POST",
          token,
          body: {
            userId,
            methodologyPlanId: adaptationPlanId,
            sessionId,
            exerciseId,
            exerciseName,
            setNumber: setIndex + 1,
            weight,
            reps,
            rir: setRirs[setIndex],
            isWarmup: false
          }
        });

        sessionWeightSum += weight;
        sessionWeightCount += 1;
        sessionRirSum += setRirs[setIndex];
        totalRirSum += setRirs[setIndex];
        totalRirCount += 1;
        sessionLog.totals.sets += 1;
        sessionLog.totals.volumeLoad += weight * reps;
      }

      await fetchJson(`/api/training-session/progress/methodology/${sessionId}/${exercise.exercise_order}`, {
        method: "PUT",
        token,
        body: {
          series_completed: setsToLog,
          status: "completed",
          time_spent_seconds: setsToLog * 60
        }
      });
    }

    sessionLog.totals.meanRir = sessionLog.totals.sets
      ? round(sessionRirSum / sessionLog.totals.sets, 2)
      : null;
    sessionLog.totals.avgWeight = sessionWeightCount ? round(sessionWeightSum / sessionWeightCount, 2) : null;
    if (sessionLog.totals.avgWeight != null) {
      sessionWeightAverages.push(sessionLog.totals.avgWeight);
    }

    await fetchJson(`/api/training-session/complete/methodology/${sessionId}`, {
      method: "POST",
      token,
      body: { outcome: dayProfile === "off_plan" ? "skip_remaining" : "auto" }
    });

    runLog.adaptation.sessions.push(sessionLog);
    runLog.adaptation.totals.sessions += 1;
  }

  const sessionsCompleted = runLog.adaptation.sessions.filter((s) => !s.skipped).length;
  const meanRir = totalRirCount ? round(totalRirSum / totalRirCount, 2) : null;
  const initialAverageWeight = sessionWeightAverages[0] ?? null;
  const currentAverageWeight = sessionWeightAverages[sessionWeightAverages.length - 1] ?? null;

  try {
    const evaluationResp = await fetchJson("/api/adaptation/evaluate-week", {
      method: "POST",
      token,
      body: {
        weekNumber: 1,
        sessionsCompleted,
        meanRir,
        techniqueFlagsCount: 0,
        initialAverageWeight,
        currentAverageWeight
      }
    });
    runLog.adaptation.evaluation = evaluationResp.data;
  } catch (error) {
    runLog.errors.push({
      step: "adaptation_evaluate_week",
      message: error.message,
      endpoint: error.endpoint,
      status: error.status,
      data: error.data
    });
  }

  try {
    const transitionResp = await fetchJson("/api/adaptation/transition", {
      method: "POST",
      token,
      body: {}
    });
    runLog.adaptation.transition = transitionResp.data;
  } catch (error) {
    runLog.adaptation.transition = error.data || null;
    runLog.errors.push({
      step: "adaptation_transition",
      message: error.message,
      endpoint: error.endpoint,
      status: error.status,
      data: error.data
    });
    throw error;
  }

  return adaptationPlanId;
};

const main = async () => {
  try {
    const auth = CREATE_USER ? await registerUser() : await loginUser();
    const token = auth.token;
    const userId = auth.user?.id;

    runLog.user = { id: userId, email: auth.email, created: CREATE_USER };
    runLog.config.email = auth.email;

    let profile = null;
    try {
      const profileResp = await fetchJson(`/api/users/${userId}`, { token });
      profile = profileResp.data.user;
    } catch (error) {
      runLog.errors.push({ step: "profile", message: error.message });
    }

    const nivel = FORCE_LEVEL
      ? normalizeLevel(FORCE_LEVEL)
      : normalizeLevel(profile?.nivel_entrenamiento);

    const exerciseBaseWeights = new Map();
    const exerciseNameToId = new Map();
    const exerciseMetaByName = new Map();
    const planSessionsByWeek = new Map();
    const exerciseIdCache = new Map();

    try {
      await fetchJson("/api/training/cancel-plan", { method: "POST", token });
    } catch (error) {
      if (error.status !== 404) {
        throw error;
      }
    }

    try {
      await simulateAdaptationBlock({ token, userId, exerciseIdCache });
    } catch (error) {
      throw error;
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
      totalWeeks: planData?.total_weeks,
      forcedLevel: FORCE_LEVEL ? normalizeLevel(FORCE_LEVEL) : null
    };

    await fetchJson("/api/routines/confirm-plan", {
      method: "POST",
      token,
      body: { methodology_plan_id: methodologyPlanId }
    });

    let microcycleIndex = 0;
    let lastKnownDeload = null;

    const weeks = (planData?.semanas || []).filter((week) => !shouldSkipWeekZero(week, INCLUDE_WEEK_0));

    for (let weekIndex = 0; weekIndex < weeks.length; weekIndex += 1) {
      const week = weeks[weekIndex];
      const sessions = Array.isArray(week?.sesiones) ? week.sesiones : [];
      const weekNumber = resolveWeekNumber(week, weekIndex, sessions);
      const weekMap = new Map();

      for (let sessionIndex = 0; sessionIndex < sessions.length; sessionIndex += 1) {
        const sessionDef = sessions[sessionIndex];
        const cycleDay = formatCycleDay(sessionDef, sessionIndex);
        const exercises = Array.isArray(sessionDef?.ejercicios) ? sessionDef.ejercicios : [];
        const plannedExercises = exercises.map((exercise, exIndex) => {
          const name = exercise?.nombre || exercise?.exercise_name || `Ejercicio ${exIndex + 1}`;
          const nameKey = normalizeExerciseKey(name);
          const type = normalizeExerciseType(
            exercise?.tipo_ejercicio ||
            exercise?.tipo ||
            exercise?.tipo_base ||
            exercise?.["Tipo base"]
          );
          const series = parseSeries(exercise?.series ?? exercise?.series_total ?? exercise?.series_objetivo);
          const reps = parseReps(exercise?.repeticiones ?? exercise?.reps_objetivo ?? exercise?.reps);
          const intensityPct = parseIntensity(
            exercise?.intensidad_porcentaje ??
            exercise?.intensidad ??
            exercise?.intensity ??
            exercise?.intensidad_objetivo
          );

          if (nameKey && !exerciseMetaByName.has(nameKey)) {
            exerciseMetaByName.set(nameKey, { type, series, reps, intensityPct });
          }

          return {
            name,
            nameKey,
            type,
            series,
            reps,
            intensityPct
          };
        });

        if (Number.isFinite(weekNumber)) {
          weekMap.set(cycleDay, plannedExercises);
        }
      }

      if (Number.isFinite(weekNumber)) {
        planSessionsByWeek.set(weekNumber, weekMap);
      }
    }

    // Baseline para volumen fijo (primer microciclo real, no semana 0)
    const baselineWeek = weeks
      .map((week, index) => resolveWeekNumber(week, index, week?.sesiones))
      .find((weekNumber) => Number.isFinite(weekNumber) && Number(weekNumber) !== 0)
      ?? weeks.map((week, index) => resolveWeekNumber(week, index, week?.sesiones)).find(Number.isFinite);

    if (baselineWeek != null) {
      runLog.planChecks.baselineWeek = baselineWeek;
      const baselineSessions = planSessionsByWeek.get(baselineWeek) || new Map();
      for (const [cycleDay, exercises] of baselineSessions.entries()) {
        const baselineSignature = exercises.map((exercise) => `${exercise.nameKey}:${exercise.series}`).join("|");
        for (const [weekNumber, weekSessions] of planSessionsByWeek.entries()) {
          const plannedSession = weekSessions.get(cycleDay) || [];
          const currentSignature = plannedSession.map((exercise) => `${exercise.nameKey}:${exercise.series}`).join("|");
          if (!baselineSignature) continue;
          if (currentSignature && currentSignature !== baselineSignature) {
            runLog.planChecks.volumeVariations.push({
              week: weekNumber,
              cycleDay,
              baseline: baselineSignature,
              current: currentSignature
            });
          }
          if (currentSignature) {
            runLog.validations.volume.sessions += 1;
            if (currentSignature === baselineSignature) {
              runLog.validations.volume.matched += 1;
            } else {
              runLog.validations.volume.mismatched += 1;
            }
          }
        }
      }
    }

    for (const week of weeks) {
      const sessionDefs = Array.isArray(week?.sesiones) ? week.sesiones : [];
      for (const sessionDef of sessionDefs) {
        const exercises = Array.isArray(sessionDef?.ejercicios) ? sessionDef.ejercicios : [];
        for (const exercise of exercises) {
          const nameKey = normalizeExerciseKey(exercise?.nombre || exercise?.exercise_name);
          if (!nameKey || exerciseNameToId.has(nameKey)) continue;
          const candidateId = normalizeExerciseId(exercise?.exercise_id ?? exercise?.id);
          if (candidateId) {
            exerciseNameToId.set(nameKey, candidateId);
          }
        }
      }
    }

    for (let weekIndex = 0; weekIndex < weeks.length; weekIndex += 1) {
      const week = weeks[weekIndex];
      const sessions = Array.isArray(week?.sesiones)
        ? [...week.sesiones].sort((a, b) => {
            const aOrder = a.ciclo_dia || a.cycle_day || a.cycleDay || a.orden || 0;
            const bOrder = b.ciclo_dia || b.cycle_day || b.cycleDay || b.orden || 0;
            return Number(aOrder) - Number(bOrder);
          })
        : [];
      const weekNumber = resolveWeekNumber(week, weekIndex, sessions);
      const deloadInfo = resolveDeloadInfo(week);

      if (deloadInfo.isDeload && Number(weekNumber) !== 0) {
        const alreadyLogged = runLog.deloads.some((entry) => entry.week === weekNumber);
        if (!alreadyLogged) {
          runLog.deloads.push({
            microcycle: microcycleIndex + 1,
            week: weekNumber,
            action: "planificado",
            reason: deloadInfo.reason
          });
        }
      }

      for (let sessionIndex = 0; sessionIndex < sessions.length; sessionIndex += 1) {
        const sessionDef = sessions[sessionIndex];
        const cycleDay = formatCycleDay(sessionDef, sessionIndex);
        const sessionName = buildSessionName(sessionDef, cycleDay);
        const dayName = resolveDayName(sessionDef, cycleDay);
        const isWeekZero = Number(weekNumber) === 0;

        if (!methodologyPlanId || !Number.isFinite(weekNumber) || !dayName) {
          const errorDetails = {
            methodologyPlanId,
            weekNumber,
            dayName,
            weekKeys: Object.keys(week || {}),
            sessionKeys: Object.keys(sessionDef || {})
          };
          runLog.errors.push({
            step: "start_session_payload",
            message: "Payload incompleto para start/methodology",
            data: errorDetails
          });
          throw new Error(`Payload incompleto start/methodology: ${JSON.stringify(errorDetails)}`);
        }

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
        const dayProfile = decideDayProfile({ userId, planId: methodologyPlanId, weekNumber, cycleDay });
        const objectiveFatigue = shouldTriggerObjectiveFatigue({
          userId,
          planId: methodologyPlanId,
          weekNumber,
          cycleDay,
          dayProfile
        });

        const sessionLog = {
          week: weekNumber,
          dayName,
          cycleDay,
          sessionName,
          sessionId,
          dayProfile,
          objectiveFatigue,
          skipped: dayProfile === "miss",
          fatigueReport: null,
          autoFatigue: null,
          exercises: [],
          totals: {
            exercises: 0,
            sets: 0,
            volumeLoad: 0,
            meanRir: 0
          }
        };

        if (dayProfile === "miss") {
          await fetchJson(`/api/training-session/complete/methodology/${sessionId}`, {
            method: "POST",
            token,
            body: { outcome: "skip_remaining" }
          });

          const advanceCycleResp = await fetchJson("/api/hipertrofiav2/advance-cycle", {
            method: "POST",
            token,
            body: { sessionDayName: cycleDay }
          });

          sessionLog.totals.meanRir = null;
          runLog.sessions.push(sessionLog);
          runLog.totals.sessions += 1;
          runLog.totals.skippedSessions += 1;

          if (cycleDay === "D5") {
            const progression = extractProgression(advanceCycleResp.data);
            if (!isWeekZero) {
              runLog.microcycles.push({
                microcycle: microcycleIndex + 1,
                week: weekNumber,
                progression
              });
              microcycleIndex += 1;
            }
          }

          if (REQUEST_PAUSE_MS > 0) await sleep(REQUEST_PAUSE_MS);
          continue;
        }

        if (dayProfile === "off_plan") runLog.totals.offPlanDays += 1;
        if (dayProfile === "fatigue") runLog.totals.fatigueDays += 1;
        if (dayProfile === "top") runLog.totals.topDays += 1;
        if (objectiveFatigue) runLog.totals.objectiveFatigueDays += 1;

        const progressResp = await fetchJson(`/api/training-session/progress/methodology/${sessionId}`, { token });
        const exercises = Array.isArray(progressResp.data.exercises) ? progressResp.data.exercises : [];

        let sessionRirSum = 0;
        let objectiveFatigueSetsRemaining = objectiveFatigue ? 2 : 0;
        const sessionTypeSequence = [];
        const sessionIntensityValues = [];
        let sessionIntensityMissing = 0;
        let sessionIntensityOutOfRange = 0;
        let sessionRepsSetsOk = 0;
        let sessionRepsSetsTotal = 0;
        let sessionRirSetsOk = 0;
        let sessionRirSetsTotal = 0;

        const dayWeightMultiplier = dayProfile === "fatigue" ? 0.93 : dayProfile === "top" ? 1.05 : 1;
        const objectiveWeightMultiplier = objectiveFatigue ? 0.93 : 1;

        const offPlanLimit = dayProfile === "off_plan"
          ? Math.max(1, Math.floor(exercises.length * 0.6))
          : exercises.length;

        for (let exerciseIndex = 0; exerciseIndex < exercises.length; exerciseIndex += 1) {
          const exercise = exercises[exerciseIndex];
          if (exerciseIndex >= offPlanLimit) {
            continue;
          }
          const rawExerciseOrder = Number(exercise.exercise_order ?? exercise.exerciseOrder ?? exerciseIndex);
          const exerciseOrder = Number.isFinite(rawExerciseOrder) ? rawExerciseOrder : exerciseIndex;
          const exerciseName = exercise.exercise_name || exercise.exerciseName || `Ejercicio ${exerciseIndex + 1}`;
          const rawExerciseId = exercise.exercise_id || exercise.id || null;
          let exerciseId = normalizeExerciseId(rawExerciseId);
          const exerciseKey = exerciseId ? String(exerciseId) : exerciseName;
          const nameKey = normalizeExerciseKey(exerciseName);
          const meta = exerciseMetaByName.get(nameKey) || {};

          if (!exerciseBaseWeights.has(exerciseKey)) {
            exerciseBaseWeights.set(exerciseKey, baseWeightForExercise(exercise));
          }

          if (!exerciseId) {
            const mappedId = exerciseNameToId.get(nameKey);
            if (mappedId) {
              exerciseId = mappedId;
            }
          }

          if (!exerciseId) {
            exerciseId = await resolveExerciseIdByName(exerciseName, token, exerciseIdCache);
          }

          const baseWeight = exerciseBaseWeights.get(exerciseKey);
          const intensityPct = parseIntensity(
            exercise.intensidad ??
            exercise.intensity ??
            meta.intensityPct ??
            meta.intensidad
          );
          const targetWeight = Number.isFinite(intensityPct) ? baseWeight * intensityPct : baseWeight;
          const weight = roundToStep(targetWeight * dayWeightMultiplier * objectiveWeightMultiplier, 0.5);

          const rawSeriesTotal = Number(exercise.series_total ?? exercise.series ?? meta.series ?? 3);
          const seriesTotal = Number.isFinite(rawSeriesTotal) ? rawSeriesTotal : 3;
          const reps = parseReps(exercise.repeticiones ?? exercise.reps_objetivo ?? exercise.reps ?? meta.reps);
          const baseRir = computeBaseRir({ cycleDay, weekNumber, intensityPct, dayProfile });
          const minRir = Number(weekNumber) === 0 ? 3 : 2;
          const setsToLog = computeSetsToLog({
            seriesTotal,
            dayProfile,
            objectiveFatigue
          });
          const setRirs = buildSetRirs({
            baseRir,
            setsToLog,
            exerciseKey,
            weekNumber,
            cycleDay,
            minRir
          });

          if (objectiveFatigueSetsRemaining > 0) {
            for (let i = 0; i < setRirs.length && objectiveFatigueSetsRemaining > 0; i += 1) {
              setRirs[i] = 1;
              objectiveFatigueSetsRemaining -= 1;
            }
          }
          const exerciseMeanRir = setRirs.length
            ? round(setRirs.reduce((acc, value) => acc + value, 0) / setRirs.length, 2)
            : baseRir;

          const exerciseType = normalizeExerciseType(meta.type || exercise.tipo_ejercicio || exercise.tipo);
          sessionTypeSequence[exerciseOrder] = exerciseType;

          const repsRange = expectedRepsRange(weekNumber);
          const repsWithin = reps >= repsRange.min && reps <= repsRange.max;
          const repsSets = setsToLog;
          sessionRepsSetsTotal += repsSets;
          runLog.validations.reps.totalSets += repsSets;
          if (repsWithin) {
            sessionRepsSetsOk += repsSets;
            runLog.validations.reps.okSets += repsSets;
          }

          const rirRange = expectedRirRange(weekNumber);
          for (const rirValue of setRirs) {
            const rirOk = rirValue >= rirRange.min && rirValue <= rirRange.max;
            sessionRirSetsTotal += 1;
            runLog.validations.rir.totalSets += 1;
            if (Number(weekNumber) === 0) {
              runLog.validations.rir.week0Total += 1;
              if (rirOk) runLog.validations.rir.week0Ok += 1;
            }
            if (rirOk) {
              sessionRirSetsOk += 1;
              runLog.validations.rir.okSets += 1;
            }
          }

          const intensityRange = expectedIntensityRange(cycleDay, weekNumber);
          if (Number.isFinite(intensityPct)) {
            sessionIntensityValues.push(intensityPct);
            runLog.validations.intensity.total += 1;
            if (isWithinRange(intensityPct, intensityRange.min, intensityRange.max)) {
              runLog.validations.intensity.ok += 1;
            } else {
              runLog.validations.intensity.outOfRange += 1;
              sessionIntensityOutOfRange += 1;
            }
          } else {
            runLog.validations.intensity.missing += 1;
            sessionIntensityMissing += 1;
          }

          if (exerciseId) {
            for (let setNumber = 1; setNumber <= setsToLog; setNumber += 1) {
              const rirForSet = setRirs[setNumber - 1] ?? exerciseMeanRir;
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
                  rir: rirForSet,
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

          await fetchJson(`/api/training-session/progress/methodology/${sessionId}/${exerciseOrder}`, {
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
            rir: exerciseMeanRir
          });

          sessionLog.totals.exercises += 1;
          runLog.totals.exercises += 1;
          sessionRirSum += exerciseMeanRir;
        }

        const orderedTypes = sessionTypeSequence.filter((value) => value);
        const hasUnknownType = orderedTypes.some((value) => value === "unknown");
        const typeRanks = orderedTypes.map(exerciseTypeRank);
        let orderStatus = "unknown";
        if (orderedTypes.length > 0 && !hasUnknownType) {
          orderStatus = isNonDecreasing(typeRanks) ? "ok" : "fail";
        }

        runLog.validations.order.sessions += 1;
        if (orderStatus === "ok") runLog.validations.order.ok += 1;
        else if (orderStatus === "fail") runLog.validations.order.failed += 1;
        else runLog.validations.order.unknown += 1;

        const intensityRangeSummary = expectedIntensityRange(cycleDay, weekNumber);
        const intensityAvg = sessionIntensityValues.length
          ? round(sessionIntensityValues.reduce((acc, value) => acc + value, 0) / sessionIntensityValues.length * 100, 2)
          : null;

        const repsRangeSummary = expectedRepsRange(weekNumber);
        const rirRangeSummary = expectedRirRange(weekNumber);

        sessionLog.validation = {
          intensity: {
            expected: intensityRangeSummary.label,
            avgPct: intensityAvg != null ? intensityAvg : "—",
            missing: sessionIntensityMissing,
            outOfRange: sessionIntensityOutOfRange
          },
          reps: {
            expected: repsRangeSummary.label,
            okSets: sessionRepsSetsOk,
            totalSets: sessionRepsSetsTotal
          },
          rir: {
            expected: rirRangeSummary.label,
            okSets: sessionRirSetsOk,
            totalSets: sessionRirSetsTotal
          },
          order: {
            status: orderStatus,
            sequence: orderedTypes.length ? orderedTypes.join(" → ") : "—"
          }
        };

        await fetchJson(`/api/training-session/complete/methodology/${sessionId}`, {
          method: "POST",
          token,
          body: { outcome: dayProfile === "off_plan" ? "skip_remaining" : "auto" }
        });

        if (dayProfile === "fatigue") {
          try {
            const fatiguePayload = buildSubjectiveFatiguePayload({ userId, planId: methodologyPlanId, weekNumber, cycleDay });
            const fatigueResp = await fetchJson("/api/hipertrofiav2/submit-fatigue-report", {
              method: "POST",
              token,
              body: fatiguePayload
            });
            sessionLog.fatigueReport = fatigueResp.data;
          } catch (error) {
            runLog.errors.push({
              step: "submit_fatigue_report",
              message: error.message,
              endpoint: error.endpoint,
              status: error.status,
              data: error.data
            });
          }
        }

        try {
          const autoFatigueResp = await fetchJson("/api/hipertrofiav2/detect-auto-fatigue", {
            method: "POST",
            token,
            body: { sessionId }
          });
          sessionLog.autoFatigue = autoFatigueResp.data;
        } catch (error) {
          runLog.errors.push({
            step: "detect_auto_fatigue",
            message: error.message,
            endpoint: error.endpoint,
            status: error.status,
            data: error.data
          });
        }

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
          if (!isWeekZero) {
            runLog.microcycles.push({
              microcycle: microcycleIndex + 1,
              week: weekNumber,
              progression
            });
            microcycleIndex += 1;
          }
        }

        if (advanceCycleResp.data?.deload_active !== undefined) {
          const currentDeload = Boolean(advanceCycleResp.data.deload_active);
          if (lastKnownDeload !== null && currentDeload !== lastKnownDeload) {
            runLog.deloads.push({
              microcycle: microcycleIndex,
              week: weekNumber,
              action: currentDeload ? "activar" : "desactivar",
              reason: advanceCycleResp.data.deload_reason || "actualizado por backend"
            });
          }
          lastKnownDeload = currentDeload;
        }

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
