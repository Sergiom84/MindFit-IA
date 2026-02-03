const PHASE_MULTIPLIERS = {
  menstruation: { intensity: 0.95, volume: 0.95, restSeconds: 15 },
  follicular: { intensity: 1.0, volume: 1.0, restSeconds: 0 },
  ovulation: { intensity: 1.0, volume: 1.0, restSeconds: 0 },
  luteal: { intensity: 0.97, volume: 0.95, restSeconds: 20 },
  luteal_late: { intensity: 0.95, volume: 0.9, restSeconds: 40 }
};

const SYMPTOM_MULTIPLIERS = {
  0: { intensity: 1.0, volume: 1.0, restSeconds: 0 },
  1: { intensity: 0.98, volume: 0.95, restSeconds: 15 },
  2: { intensity: 0.95, volume: 0.9, restSeconds: 30 },
  3: { intensity: 0.9, volume: 0.85, restSeconds: 60 }
};

const HORMONAL_CONTRACEPTION = new Set([
  "combined",
  "progestin_only",
  "hormonal_iud",
  "other/unknown"
]);

const CONFIDENCE_WEIGHTS = {
  high: 0.5,
  medium: 0.65,
  low: 0.8
};

export function clamp(value, min = 0.8, max = 1.1) {
  if (!Number.isFinite(value)) return value;
  return Math.min(max, Math.max(min, value));
}

export function enforceNoDoubleIncrease(intensity, volume) {
  if (intensity > 1 && volume > 1) {
    if (intensity >= volume) {
      return { intensity, volume: 1 };
    }
    return { intensity: 1, volume };
  }
  return { intensity, volume };
}

export function computeCycleLengthEMA(lengths = [], alpha = 0.3) {
  if (!Array.isArray(lengths) || lengths.length === 0) return null;
  let average = lengths[0];
  for (let i = 1; i < lengths.length; i += 1) {
    average = alpha * lengths[i] + (1 - alpha) * average;
  }
  return average;
}

export function computeCycleVariation(lengths = []) {
  if (!Array.isArray(lengths) || lengths.length === 0) return null;
  const max = Math.max(...lengths);
  const min = Math.min(...lengths);
  return max - min;
}

export function computeCycleConfidence({
  cycleLengths = [],
  hasLastBleedStartDate = true,
  hasRecentLogs = true,
  contraceptionType = "none"
} = {}) {
  if (!hasLastBleedStartDate || !hasRecentLogs) return "low";
  if (HORMONAL_CONTRACEPTION.has(contraceptionType)) return "low";
  if (!Array.isArray(cycleLengths) || cycleLengths.length < 2) return "low";

  const lastThree = cycleLengths.slice(-3);
  const variation = computeCycleVariation(lastThree);

  let confidence = "low";
  if (variation !== null) {
    if (variation <= 3) confidence = "high";
    else if (variation <= 7) confidence = "medium";
    else confidence = "low";
  }

  if (cycleLengths.length < 3) {
    if (confidence === "high") confidence = "medium";
    else if (confidence === "medium") confidence = "low";
  }

  return confidence;
}

export function determineMode({
  contraceptionType = "none",
  cycleConfidence = "low",
  lastBleedStartDate,
  hasRecentLogs = true
} = {}) {
  if (HORMONAL_CONTRACEPTION.has(contraceptionType)) return "symptoms";
  if (cycleConfidence === "low") return "symptoms";
  if (!lastBleedStartDate) return "symptoms";
  if (!hasRecentLogs) return "symptoms";
  return "phase";
}

export function computeCycleDay({ lastBleedStartDate, today, cycleLengthDays } = {}) {
  if (!lastBleedStartDate || !today) return null;
  const lastBleedDate = new Date(lastBleedStartDate);
  const todayDate = new Date(today);
  if (Number.isNaN(lastBleedDate.getTime()) || Number.isNaN(todayDate.getTime())) return null;

  const diffDays = Math.floor((todayDate - lastBleedDate) / (1000 * 60 * 60 * 24)) + 1;
  if (diffDays <= 0) return null;
  if (!cycleLengthDays) return diffDays;

  const mod = diffDays % cycleLengthDays;
  return mod === 0 ? cycleLengthDays : mod;
}

export function computePhase({
  cycleDay,
  bleedLengthDays,
  cycleLengthDays,
  lutealLengthDays,
  confidence = "low"
} = {}) {
  if (!cycleDay || !bleedLengthDays || !cycleLengthDays || !lutealLengthDays) return null;
  if (confidence !== "high" && confidence !== "medium") return null;

  const ovulationDay = cycleLengthDays - lutealLengthDays;
  const window = confidence === "high" ? 1 : 2;
  const ovulationStart = ovulationDay - window;
  const ovulationEnd = ovulationDay + window;
  const lutealLateStart = cycleLengthDays - 4;

  if (cycleDay <= bleedLengthDays) return "menstruation";
  if (cycleDay >= lutealLateStart) return "luteal_late";
  if (cycleDay >= ovulationStart && cycleDay <= ovulationEnd) return "ovulation";
  if (cycleDay < ovulationStart) return "follicular";
  return "luteal";
}

export function computeSeverity({ pain = 0, fatigue = 0, sleep = 0, stress = 0 } = {}) {
  const values = [pain, fatigue, sleep, stress].map(value => (Number.isFinite(value) ? value : 0));
  return Math.max(...values);
}

export function computeDominantDomain({ pain = 0, fatigue = 0, sleep = 0, stress = 0 } = {}) {
  const normalized = {
    pain: Number.isFinite(pain) ? pain : 0,
    fatigue: Number.isFinite(fatigue) ? fatigue : 0,
    sleep: Number.isFinite(sleep) ? sleep : 0,
    stress: Number.isFinite(stress) ? stress : 0
  };
  const max = Math.max(...Object.values(normalized));
  const order = ["pain", "fatigue", "sleep", "stress"];
  return order.find(key => normalized[key] === max) || "pain";
}

export function getPhaseMultipliers(phase) {
  return PHASE_MULTIPLIERS[phase] || { intensity: 1.0, volume: 1.0, restSeconds: 0 };
}

export function getSymptomMultipliers(severity) {
  return SYMPTOM_MULTIPLIERS[severity] || SYMPTOM_MULTIPLIERS[0];
}

export function getWeightForConfidence(confidence, mode) {
  if (mode === "symptoms") return 1.0;
  return CONFIDENCE_WEIGHTS[confidence] ?? CONFIDENCE_WEIGHTS.low;
}

export function combineMultipliers({ phaseMultipliers, symptomMultipliers, weight }) {
  const phase = phaseMultipliers || getPhaseMultipliers();
  const symptoms = symptomMultipliers || getSymptomMultipliers(0);
  const w = Number.isFinite(weight) ? weight : 1.0;

  const rawIntensity = (1 - w) * phase.intensity + w * symptoms.intensity;
  const rawVolume = (1 - w) * phase.volume + w * symptoms.volume;

  const intensity = clamp(rawIntensity, 0.8, 1.1);
  const volume = clamp(rawVolume, 0.8, 1.1);

  return enforceNoDoubleIncrease(intensity, volume);
}

export function computeRestExtra({ phaseRest = 0, symptomRest = 0, sleep = 0, mode = "symptoms" } = {}) {
  const base = mode === "symptoms" ? symptomRest : phaseRest + symptomRest;
  const sleepExtra = sleep >= 2 ? 30 : 0;
  return base + sleepExtra;
}

/**
 * Construye el ajuste v3 del ciclo menstrual.
 * @returns {{mode: string, cycleConfidence: string, cycleDay: number|null, phase: string|null, severity: number, dominantDomain: string, weightSymptoms: number, multipliers: {intensity: number, volume: number}, restExtraSeconds: number, phaseMultipliers: {intensity: number, volume: number, restSeconds: number}, symptomMultipliers: {intensity: number, volume: number, restSeconds: number}}}
 */
export function buildCycleAdjustment({
  config = {},
  dailyLog = {},
  hasRecentLogs = true,
  today = new Date().toISOString().split("T")[0],
  deloadActive = false
} = {}) {
  const cycleConfidence = config.cycle_confidence || "low";
  const contraceptionType = config.contraception_type || "none";
  const lastBleedStartDate = config.last_bleed_start_date;
  const cycleLengthDays = config.cycle_length_days;
  const bleedLengthDays = config.bleed_length_days;
  const lutealLengthDays = config.luteal_length_days;

  const baseMode = determineMode({
    contraceptionType,
    cycleConfidence,
    lastBleedStartDate,
    hasRecentLogs
  });

  const mode = deloadActive ? "symptoms" : baseMode;

  const cycleDay = computeCycleDay({
    lastBleedStartDate,
    today,
    cycleLengthDays
  });

  const phase = mode === "phase"
    ? computePhase({
      cycleDay,
      bleedLengthDays,
      cycleLengthDays,
      lutealLengthDays,
      confidence: cycleConfidence
    })
    : null;

  let severity = computeSeverity({
    pain: dailyLog.pain_0_3,
    fatigue: dailyLog.fatigue_0_3,
    sleep: dailyLog.sleep_0_3,
    stress: dailyLog.stress_0_3
  });
  if (deloadActive) severity = Math.max(severity, 3);

  const dominantDomain = computeDominantDomain({
    pain: dailyLog.pain_0_3,
    fatigue: dailyLog.fatigue_0_3,
    sleep: dailyLog.sleep_0_3,
    stress: dailyLog.stress_0_3
  });

  const phaseMultipliers = getPhaseMultipliers(phase);
  const symptomMultipliers = getSymptomMultipliers(severity);
  const weight = deloadActive ? 1.0 : getWeightForConfidence(cycleConfidence, mode);

  const { intensity, volume } = combineMultipliers({
    phaseMultipliers,
    symptomMultipliers,
    weight
  });

  const restExtraSeconds = computeRestExtra({
    phaseRest: phaseMultipliers.restSeconds,
    symptomRest: symptomMultipliers.restSeconds,
    sleep: dailyLog.sleep_0_3 ?? 0,
    mode
  });

  return {
    mode,
    cycleConfidence,
    cycleDay,
    phase,
    severity,
    dominantDomain,
    weightSymptoms: weight,
    multipliers: {
      intensity,
      volume
    },
    restExtraSeconds,
    phaseMultipliers,
    symptomMultipliers,
    deloadActive: Boolean(deloadActive)
  };
}
