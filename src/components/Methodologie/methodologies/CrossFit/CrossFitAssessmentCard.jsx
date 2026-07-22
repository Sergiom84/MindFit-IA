import { useState, useEffect } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Check,
  ClipboardCheck,
  Dumbbell,
  Info,
  LoaderCircle,
  RefreshCw,
  ShieldCheck
} from "lucide-react";

import { useUserContext } from "@/contexts/UserContext";
import tokenManager from "../../../../utils/tokenManager";

const ASSESSMENT_VERSION = "crossfit-assessment/v2";

const DIMENSION_COPY = {
  technique: {
    label: "Tecnica por patron",
    hint: "Sentadilla, bisagra, zancada, empuje, traccion y locomocion.",
    levels: ["No evaluado", "Base sin dolor", "Carga moderada estable", "Estable bajo fatiga observada"]
  },
  strength: {
    label: "Fuerza submaxima",
    hint: "Pruebas seguras, sin necesidad de buscar un 1RM.",
    levels: ["No evaluado", "Cargas basicas a RPE <=7", "Ratios intermedios o equivalentes", "Ratios avanzados o equivalentes"]
  },
  aerobic: {
    label: "Capacidad aerobica",
    hint: "Trabajo continuo e intervalos repetibles.",
    levels: ["No evaluado", "10 min a RPE <=6", "20 min a RPE <=7", "30 min a RPE <=7"]
  },
  gymnastics: {
    label: "Gimnasia",
    hint: "Control corporal; los skills dinamicos se validan aparte.",
    levels: ["No evaluado", "Hollow, row y push-up adaptado", "Pull-up/regresion y knee raises", "Pull-up, dip, TTB/regresion y DU"]
  },
  weightlifting: {
    label: "Halterofilia",
    hint: "Calidad tecnica antes que carga o velocidad.",
    levels: ["No evaluado", "PVC/barra y derivados estables", "Power clean/snatch tecnico", "Repeticiones estables al 60% tecnico"]
  },
  pacing: {
    label: "Pacing",
    hint: "Capacidad para sostener el ritmo sin perder tecnica.",
    levels: ["No evaluado", "Termina dentro del cap", "Drift entre intervalos <=12%", "Drift entre intervalos <=8%"]
  },
  volume: {
    label: "Tolerancia a volumen",
    hint: "Adherencia y recuperacion entre sesiones.",
    levels: ["No evaluado", "2-3 sesiones sin dolor residual", "3-4 sesiones; recupera en 24-48 h", "4-5 sesiones; dos estimulos controlados"]
  },
  recovery: {
    label: "Recuperacion",
    hint: "Sueno, fatiga y readiness sostenidos.",
    levels: ["No evaluado", "Readiness medio >=3/5", ">=3/5 sin fatiga acumulada", ">=3,5/5 con tendencia estable"]
  }
};

const LEVEL_COPY = {
  beginner: { label: "Principiante", tone: "text-emerald-300", ring: "border-emerald-400/30 bg-emerald-400/10" },
  intermediate: { label: "Intermedio", tone: "text-amber-300", ring: "border-amber-400/30 bg-amber-400/10" },
  advanced: { label: "Avanzado", tone: "text-orange-300", ring: "border-orange-400/30 bg-orange-400/10" }
};
const CONFIDENCE_COPY = { low: "baja", medium: "media", high: "alta" };

const FREQUENCIES_BY_LEVEL = {
  beginner: [2, 3],
  intermediate: [3, 4],
  advanced: [4, 5]
};

const MINUTES_BY_LEVEL = {
  beginner: [45, 60],
  intermediate: [55, 60, 70],
  advanced: [60, 75, 90]
};

function newScores() {
  return Object.fromEntries(Object.keys(DIMENSION_COPY).map((dimension) => [dimension, null]));
}

function requestId() {
  if (globalThis.crypto?.randomUUID) return `crossfit-assessment-${globalThis.crypto.randomUUID()}`;
  return `crossfit-assessment-${Date.now()}`;
}

async function apiRequest(endpoint, options = {}) {
  const response = await fetch(endpoint, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tokenManager.getToken()}`,
      ...options.headers
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || "No se pudo completar la evaluacion");
    error.code = payload.code;
    throw error;
  }
  return payload;
}

function getProfileFrequency(userData) {
  const value = Number(userData?.frecuencia_semanal);
  return Number.isInteger(value) && value >= 2 && value <= 5 ? value : 3;
}

function buildAssessment({ scores, comparableSessions, adherence, pauseDays, observedAt }) {
  return {
    dimension_scores: scores,
    evidence: {
      version: ASSESSMENT_VERSION,
      dimensions: Object.fromEntries(
        Object.keys(scores).map((dimension) => [dimension, {
          observed_at: observedAt,
          test_ids: [`SELF-${dimension.toUpperCase()}`]
        }])
      ),
      comparable_sessions: comparableSessions,
      comparable_exposures_per_dimension: 0,
      weeks_in_level: 0,
      technique_verified: false,
      verification_source: "self_report"
    },
    skill_permissions: {},
    adherence_rate: adherence,
    pause_days: pauseDays
  };
}

function DimensionField({ dimension, value, onChange, disabled }) {
  const copy = DIMENSION_COPY[dimension];
  return (
    <fieldset className="rounded-2xl border border-white/10 bg-zinc-950/80 p-4">
      <legend className="px-1 text-sm font-semibold text-white">{copy.label}</legend>
      <p className="mb-3 text-xs leading-5 text-zinc-400">{copy.hint}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {copy.levels.map((label, score) => {
          const selected = value === score;
          return (
            <label
              key={label}
              className={`rounded-xl border p-2 text-center transition-colors ${disabled ? "cursor-not-allowed opacity-70" : "cursor-pointer"} ${selected
                ? "border-amber-300 bg-amber-300 text-black"
                : "border-white/10 bg-black text-zinc-300 hover:border-amber-300/50"}`}
            >
              <input
                className="sr-only"
                type="radio"
                name={`crossfit-${dimension}`}
                value={score}
                checked={selected}
                disabled={disabled}
                onChange={() => onChange(dimension, score)}
              />
              <span className="block text-lg font-black">{score}</span>
              <span className="block text-[10px] leading-4">{label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export default function CrossFitAssessmentCard({ onGenerate, isLoading, error, capabilities }) {
  const { userData } = useUserContext();
  const [scores, setScores] = useState(newScores);
  const [comparableSessions, setComparableSessions] = useState(3);
  const [adherence, setAdherence] = useState(0.8);
  const [pauseDays, setPauseDays] = useState(0);
  const [frequency, setFrequency] = useState(() => getProfileFrequency(userData));
  const [availableMinutes, setAvailableMinutes] = useState(60);
  const [painScore, setPainScore] = useState(0);
  const [painLocation, setPainLocation] = useState("");
  const [redFlag, setRedFlag] = useState(false);
  const [acuteInjury, setAcuteInjury] = useState(false);
  const [equipment, setEquipment] = useState({ curated: [], custom: [], loaded: false });
  const [evaluation, setEvaluation] = useState(null);
  const [submittedAssessmentId, setSubmittedAssessmentId] = useState(null);
  const [submittedAssessment, setSubmittedAssessment] = useState(null);
  const [submittedCheckIn, setSubmittedCheckIn] = useState(null);
  const [evaluationError, setEvaluationError] = useState("");
  const [evaluating, setEvaluating] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/equipment/user", {
      headers: { Authorization: `Bearer ${tokenManager.getToken()}` },
      signal: controller.signal
    })
      .then((response) => response.json())
      .then((payload) => {
        if (payload.success) {
          setEquipment({
            curated: payload.curated || [],
            custom: payload.custom || [],
            loaded: true
          });
        } else {
          setEquipment((current) => ({ ...current, loaded: true }));
        }
      })
      .catch((fetchError) => {
        if (fetchError.name !== "AbortError") {
          setEquipment((current) => ({ ...current, loaded: true }));
        }
      });
    return () => controller.abort();
  }, []);

  const dimensionsComplete = Object.values(scores).every((value) => value !== null);
  const classifiedLevel = evaluation?.classification?.global_level;
  const blocked = evaluation?.classification?.status === "blocked" || evaluation?.safety?.blocked;
  const supportedFrequencies = classifiedLevel
    ? FREQUENCIES_BY_LEVEL[classifiedLevel]
    : [2, 3, 4, 5];
  const supportedMinutes = classifiedLevel
    ? MINUTES_BY_LEVEL[classifiedLevel]
    : [45, 60, 70, 90];

  const handleScore = (dimension, value) => {
    setScores((current) => ({ ...current, [dimension]: value }));
    setEvaluation(null);
  };

  const evaluate = async () => {
    if (!dimensionsComplete) return;
    setEvaluating(true);
    setEvaluationError("");
    try {
      const observedAt = new Date().toISOString();
      const assessment = buildAssessment({
        scores,
        comparableSessions: Number(comparableSessions),
        adherence: Number(adherence),
        pauseDays: Number(pauseDays),
        observedAt
      });
      const checkIn = {
        pain: {
          score: Number(painScore),
          locations: painLocation ? [painLocation] : []
        },
        red_flag: redFlag,
        acute_injury: acuteInjury
      };
      const payload = await apiRequest("/api/crossfit-specialist/evaluate-profile", {
        method: "POST",
        body: JSON.stringify({
          schema_version: ASSESSMENT_VERSION,
          request_id: requestId(),
          crossfitAssessment: assessment,
          check_in: checkIn
        })
      });
      const result = payload.evaluation;
      setEvaluation(result);
      setSubmittedAssessmentId(payload.metadata?.assessment_id ?? null);
      setSubmittedAssessment(assessment);
      setSubmittedCheckIn(checkIn);
      const level = result.classification?.global_level;
      if (level) {
        const frequencies = FREQUENCIES_BY_LEVEL[level];
        const minutes = MINUTES_BY_LEVEL[level];
        if (!frequencies.includes(frequency)) setFrequency(frequencies[0]);
        if (!minutes.includes(availableMinutes)) setAvailableMinutes(minutes[0]);
      }
    } catch (assessmentError) {
      setEvaluationError(assessmentError.message);
    } finally {
      setEvaluating(false);
    }
  };

  const generate = () => {
    if (!evaluation || blocked || !submittedAssessmentId || !submittedAssessment || !classifiedLevel) return;
    const availableEquipment = [
      ...equipment.curated.map((item) => item.key),
      ...equipment.custom.map((item) => item.name)
    ];
    onGenerate({
      methodology: "crossfit",
      source: "crossfit-v2-assessment",
      request_id: requestId(),
      schema_version: capabilities.assessment_schema_version,
      crossfit_assessment_id: submittedAssessmentId,
      crossfitAssessment: submittedAssessment,
      check_in: submittedCheckIn,
      selectedLevel: classifiedLevel,
      level: classifiedLevel,
      frecuencia_semanal: Number(frequency),
      available_minutes: Number(availableMinutes),
      available_equipment: availableEquipment,
      goals: userData?.objetivo_principal || "salud_general",
      version: capabilities.level_model_version
    });
  };

  const levelCopy = classifiedLevel ? LEVEL_COPY[classifiedLevel] : null;
  const lowDimensions = evaluation?.classification
    ? Object.entries(evaluation.classification.dimension_scores)
      .filter(([, value]) => value === Math.min(...Object.values(evaluation.classification.dimension_scores)))
      .map(([dimension]) => DIMENSION_COPY[dimension].label)
    : [];
  const equipmentLabels = [
    ...equipment.curated.map((item) => item.label),
    ...equipment.custom.map((item) => item.name)
  ];

  return (
    <div className="min-h-[80vh] bg-black p-4 text-white sm:p-7" data-testid="crossfit-v2-assessment">
      <div className="mx-auto max-w-5xl">
        <header className="relative mb-7 overflow-hidden rounded-3xl border border-amber-300/20 bg-zinc-950 px-5 py-7 sm:px-8">
          <div className="absolute -right-16 -top-20 h-52 w-52 rounded-full bg-orange-500/10 blur-3xl" />
          <div className="relative">
            <div className="mb-4 flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">
              <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1">Level model 2.0</span>
              <span>Evaluacion conservadora</span>
            </div>
            <h2 className="max-w-3xl text-3xl font-black leading-tight sm:text-4xl">
              Acondicionamiento funcional de alta intensidad
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400 sm:text-base">
              Clasificamos capacidad, tecnica y recuperacion por separado. El nivel no equivale a Rx o Scaled y la antiguedad nunca sustituye evidencia.
            </p>
          </div>
        </header>

        {(error || evaluationError) && (
          <div role="alert" className="mb-6 flex gap-3 rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <span>{evaluationError || error}</span>
          </div>
        )}

        <section aria-labelledby="crossfit-capabilities-title" className="mb-7">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Paso 1</p>
              <h3 id="crossfit-capabilities-title" className="text-xl font-bold">Valora las ocho capacidades</h3>
            </div>
            <span className="text-xs text-zinc-500">0 desconocido · 3 avanzado</span>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {Object.keys(DIMENSION_COPY).map((dimension) => (
              <DimensionField
                key={dimension}
                dimension={dimension}
                value={scores[dimension]}
                onChange={handleScore}
                disabled={Boolean(evaluation)}
              />
            ))}
          </div>
        </section>

        <section aria-labelledby="crossfit-context-title" className="mb-7 rounded-3xl border border-white/10 bg-zinc-950 p-5 sm:p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Paso 2</p>
          <h3 id="crossfit-context-title" className="mb-5 text-xl font-bold">Contexto y screening de hoy</h3>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm text-zinc-300">
              Sesiones comparables recientes
              <input
                className="mt-2 w-full rounded-xl border border-white/10 bg-black px-3 py-2 text-white focus:border-amber-300 focus:outline-none"
                type="number"
                min="0"
                max="1000"
                value={comparableSessions}
                disabled={Boolean(evaluation)}
                onChange={(event) => setComparableSessions(event.target.value)}
              />
            </label>
            <label className="text-sm text-zinc-300">
              Adherencia reciente
              <select
                className="mt-2 w-full rounded-xl border border-white/10 bg-black px-3 py-2 text-white focus:border-amber-300 focus:outline-none"
                value={adherence}
                disabled={Boolean(evaluation)}
                onChange={(event) => setAdherence(event.target.value)}
              >
                <option value="0.5">50%</option>
                <option value="0.6">60%</option>
                <option value="0.7">70%</option>
                <option value="0.8">80%</option>
                <option value="0.9">90%</option>
                <option value="1">100%</option>
              </select>
            </label>
            <label className="text-sm text-zinc-300">
              Dias desde la ultima sesion
              <input
                className="mt-2 w-full rounded-xl border border-white/10 bg-black px-3 py-2 text-white focus:border-amber-300 focus:outline-none"
                type="number"
                min="0"
                max="3650"
                value={pauseDays}
                disabled={Boolean(evaluation)}
                onChange={(event) => setPauseDays(event.target.value)}
              />
            </label>
            <label className="text-sm text-zinc-300">
              Dolor actual: {painScore}/10
              <input
                className="mt-4 w-full accent-amber-300"
                type="range"
                min="0"
                max="10"
                value={painScore}
                disabled={Boolean(evaluation)}
                onChange={(event) => setPainScore(event.target.value)}
              />
            </label>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <label className="text-sm text-zinc-300">
              Zona con dolor
              <select
                className="mt-2 w-full rounded-xl border border-white/10 bg-black px-3 py-2 text-white focus:border-amber-300 focus:outline-none"
                value={painLocation}
                disabled={Boolean(evaluation)}
                onChange={(event) => setPainLocation(event.target.value)}
              >
                <option value="">Ninguna</option>
                <option value="hombro">Hombro</option>
                <option value="muneca">Muneca</option>
                <option value="lumbar">Lumbar</option>
                <option value="rodilla">Rodilla</option>
                <option value="cadera">Cadera</option>
                <option value="tobillo">Tobillo</option>
              </select>
            </label>
            <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-black p-3 text-sm text-zinc-300">
              <input
                className="mt-1 accent-red-400"
                type="checkbox"
                checked={acuteInjury}
                disabled={Boolean(evaluation)}
                onChange={(event) => setAcuteInjury(event.target.checked)}
              />
              <span>Existe una lesion aguda pendiente de valoracion.</span>
            </label>
            <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-black p-3 text-sm text-zinc-300">
              <input
                className="mt-1 accent-red-400"
                type="checkbox"
                checked={redFlag}
                disabled={Boolean(evaluation)}
                onChange={(event) => setRedFlag(event.target.checked)}
              />
              <span>Hay un sintoma de alarma durante esfuerzo o en reposo.</span>
            </label>
          </div>
          <div className="mt-5 flex gap-3 rounded-xl border border-sky-300/20 bg-sky-300/5 p-4 text-xs leading-5 text-sky-100/80">
            <Info className="h-5 w-5 shrink-0 text-sky-300" />
            Este screening no diagnostica ni trata lesiones. Dolor severo, lesion aguda o sintomas de alarma bloquean la sesion y requieren valoracion profesional.
          </div>
        </section>

        <section className="mb-7 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-2xl border border-white/10 bg-zinc-950 p-5">
            <div className="mb-3 flex items-center gap-2">
              <Dumbbell className="h-5 w-5 text-amber-300" />
              <h3 className="font-semibold">Material reutilizado de tu perfil</h3>
            </div>
            <p className="text-sm leading-6 text-zinc-400">
              {equipment.loaded && equipmentLabels.length
                ? equipmentLabels.slice(0, 8).join(", ")
                : equipment.loaded
                  ? "No hay material guardado; el motor solo usara opciones sin equipamiento."
                  : "Consultando tu material guardado..."}
            </p>
            <a className="mt-3 inline-flex text-sm font-semibold text-amber-300 hover:text-amber-200" href="/profile?tab=equipment">
              Gestionar material <ArrowRight className="ml-1 h-4 w-4" />
            </a>
          </div>
          <div className="rounded-2xl border border-white/10 bg-zinc-950 p-5">
            <div className="mb-3 flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-amber-300" />
              <h3 className="font-semibold">Datos ya conocidos</h3>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-zinc-500">Objetivo</dt><dd className="mt-1 text-zinc-200">{userData?.objetivo_principal || "Salud general"}</dd></div>
              <div><dt className="text-zinc-500">Frecuencia perfil</dt><dd className="mt-1 text-zinc-200">{getProfileFrequency(userData)} dias</dd></div>
            </dl>
          </div>
        </section>

        {!evaluation && (
          <button
            type="button"
            onClick={evaluate}
            disabled={!dimensionsComplete || evaluating}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-300 px-6 py-4 font-black text-black transition-colors hover:bg-amber-200 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
          >
            {evaluating ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <ShieldCheck className="h-5 w-5" />}
            {evaluating ? "Aplicando reglas de clasificacion..." : "Evaluar nivel y seguridad"}
          </button>
        )}

        {evaluation && (
          <section className={`rounded-3xl border p-5 sm:p-7 ${blocked
            ? "border-red-400/30 bg-red-400/10"
            : levelCopy.ring}`}
          >
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">Resultado reproducible</p>
                <h3 className={`mt-2 text-3xl font-black ${blocked ? "text-red-300" : levelCopy.tone}`}>
                  {blocked ? "Sesion bloqueada por seguridad" : levelCopy.label}
                </h3>
                <p className="mt-2 text-sm text-zinc-300">
                  Confianza: {CONFIDENCE_COPY[evaluation.confidence] || evaluation.confidence}. Escala y variante se decidiran por movimiento, no por esta etiqueta.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEvaluation(null)}
                className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2 text-sm text-zinc-200 hover:border-white/30"
              >
                <RefreshCw className="h-4 w-4" /> Revisar respuestas
              </button>
            </div>

            {!blocked && lowDimensions.length > 0 && (
              <div className="mt-5 rounded-xl border border-white/10 bg-black/30 p-4 text-sm text-zinc-300">
                Capacidades que limitan skills o dosis: <strong>{lowDimensions.join(", ")}</strong>.
              </div>
            )}
            {evaluation.requires_verified_technique_for_advanced && classifiedLevel !== "advanced" && !blocked && (
              <p className="mt-4 text-xs leading-5 text-zinc-400">
                La autoevaluacion permite como maximo confianza media. Avanzado requiere tecnica verificada y evidencia reciente registrada por un profesional; una marca aislada no promociona.
              </p>
            )}
            {evaluation.classification?.reason_codes?.length > 0 && (
              <details className="mt-4 text-xs text-zinc-400">
                <summary className="cursor-pointer font-semibold text-zinc-300">Trazabilidad de la decision</summary>
                <p className="mt-2 font-mono">{evaluation.classification.reason_codes.join(" · ")}</p>
              </details>
            )}

            {!blocked && (
              <div className="mt-6 grid gap-4 border-t border-white/10 pt-6 sm:grid-cols-2">
                <label className="text-sm text-zinc-300">
                  Dias por semana compatibles
                  <select
                    className="mt-2 w-full rounded-xl border border-white/10 bg-black px-3 py-3 text-white focus:border-amber-300 focus:outline-none"
                    value={frequency}
                    onChange={(event) => setFrequency(event.target.value)}
                  >
                    {supportedFrequencies.map((value) => <option key={value} value={value}>{value} dias</option>)}
                  </select>
                </label>
                <label className="text-sm text-zinc-300">
                  Tiempo por sesion
                  <select
                    className="mt-2 w-full rounded-xl border border-white/10 bg-black px-3 py-3 text-white focus:border-amber-300 focus:outline-none"
                    value={availableMinutes}
                    onChange={(event) => setAvailableMinutes(event.target.value)}
                  >
                    {supportedMinutes.map((value) => <option key={value} value={value}>{value} minutos</option>)}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={generate}
                  disabled={isLoading}
                  className="flex items-center justify-center gap-2 rounded-2xl bg-amber-300 px-6 py-4 font-black text-black hover:bg-amber-200 disabled:cursor-not-allowed disabled:bg-zinc-700 sm:col-span-2"
                >
                  {isLoading ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
                  {isLoading ? "Generando bloque validado..." : `Generar bloque ${levelCopy.label.toLowerCase()}`}
                </button>
              </div>
            )}
          </section>
        )}

        <footer className="mt-7 flex items-start gap-3 border-t border-white/10 pt-5 text-xs leading-5 text-zinc-500">
          <Activity className="mt-0.5 h-4 w-4 shrink-0" />
          El producto principal cubre principiante, intermedio y avanzado no competitivo. Elite, dobles sesiones y preparacion competitiva quedan fuera de alcance.
        </footer>
      </div>
    </div>
  );
}
