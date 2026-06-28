import { useMemo, useState } from "react";
import { Brain, CheckCircle2, AlertCircle, Activity } from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3010";

const PROFILE_LABELS = {
  tolerante: "Mas carbo",
  mixto: "Equilibrado",
  intolerante: "Mas grasas"
};

function getProfileLabel(profile) {
  return PROFILE_LABELS[profile] || PROFILE_LABELS.mixto;
}

const QUESTIONS = [
  { id: "somnolencia_carbs", label: "Somnolencia o bajada de energía tras comidas altas en carbohidratos", scoreIfYes: 2 },
  { id: "energia_estable_carbs", label: "Energía estable tras comidas con carbohidratos (sin somnolencia)", scoreIfYes: -2 },
  { id: "hambre_nocturna", label: "Despertarse por la noche con hambre tras cena con carbohidratos simples", scoreIfYes: 1 },
  { id: "dormir_mejor_fruta", label: "Duerme mejor si consume fruta o carbohidratos antes de dormir", scoreIfYes: -1 },
  { id: "preferencia_graso_salado", label: "Preferencia marcada por alimentos grasos y salados frente a dulces", scoreIfYes: 1 },
  { id: "preferencia_dulces", label: "Preferencia marcada por alimentos dulces frente a salados", scoreIfYes: -1 },
  { id: "acumula_grasa_abdominal", label: "Acumulación de grasa abdominal con facilidad (patrón central)", scoreIfYes: 2 },
  { id: "sin_comer_sin_sintomas", label: "Puede estar varias horas sin comer sin síntomas negativos", scoreIfYes: -1 },
  { id: "cansancio_matutino", label: "Cansancio matutino frecuente o sensación de sueño prolongado", scoreIfYes: 1 },
  { id: "responde_bien_hidratos", label: "Responde bien a hidratos (no acumula grasa con facilidad en fases previas)", scoreIfYes: -1 }
];

function initialAnswers() {
  return QUESTIONS.map((q) => ({ id: q.id, value: null }));
}

export default function MetabolicQuestionnaire({ onResult, objective = null }) {
  const [mode, setMode] = useState(null); // null = choosing, 'basic', 'precise'
  const [answers, setAnswers] = useState(initialAnswers);
  const [signals, setSignals] = useState({
    icgFlag: "none",
    performanceLossCut: false,
    stableEnergyWithCarbs: false,
    waistStableOrDown: false
  });
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);

  const summary = useMemo(() => {
    const answered = answers.filter((a) => a.value !== null).length;
    const score = answers.reduce((sum, a) => sum + (Number(a.value) || 0), 0);
    return { answered, score };
  }, [answers]);

  const setAnswer = (id, value) => {
    setAnswers((prev) => prev.map((a) => (a.id === id ? { ...a, value } : a)));
  };

  const handleSignalChange = (field, value) => {
    setSignals((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    setLoading(true);
    setStatus(null);
    try {
      const token = localStorage.getItem("authToken");
      const response = await fetch(`${API_URL}/api/metabolic-profile/evaluate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          // Convertir array de answers a objeto {question_id: 'si'|'no'|'no_se'}
          answers: answers.reduce((acc, a) => {
            const q = QUESTIONS.find(q => q.id === a.id);
            if (a.value === null) {
              acc[a.id] = 'no_se';
            } else if (a.value === q?.scoreIfYes) {
              acc[a.id] = 'si';
            } else {
              acc[a.id] = 'no';
            }
            return acc;
          }, {}),
          objectiveData: {
            objetivo: objective,
            waistIncreasing: signals.icgFlag === "high",
            performanceLoss: signals.performanceLossCut,
            frequentNightHunger: signals.performanceLossCut,
            stableEnergyWithCarbs: signals.stableEnergyWithCarbs,
            waistMaintained: signals.waistStableOrDown
          }
        })
      });

      if (!response.ok) {
        let backendMessage = "No se pudo evaluar el perfil metabólico";
        try {
          const errorPayload = await response.json();
          backendMessage = errorPayload?.error || errorPayload?.message || backendMessage;
        } catch {
          // Mantener mensaje genérico si no llega JSON válido
        }
        throw new Error(backendMessage);
      }

      const data = await response.json();
      const evaluation = data.evaluation || data;
      setStatus({
        type: "success",
        data: {
          applied_type: evaluation.appliedProfile,
          confidence: evaluation.confidence,
          score: evaluation.rawScore,
          pending_type: evaluation.changeValidation?.needsConfirmation ? evaluation.calculatedProfile : null,
          pending_count: evaluation.pendingCount ?? (evaluation.changeValidation?.needsConfirmation ? 1 : 0),
          macros: evaluation.macros
        }
      });
      if (onResult) {
        onResult({
          metabolic_type: evaluation.appliedProfile,
          metabolic_confidence: evaluation.confidence,
          metabolic_score: evaluation.rawScore,
          metabolic_pending_type: evaluation.pendingType ?? (evaluation.changeValidation?.needsConfirmation ? evaluation.calculatedProfile : null),
          metabolic_pending_count: evaluation.pendingCount ?? (evaluation.changeValidation?.needsConfirmation ? 1 : 0),
          macros: evaluation.macros
        });
      }
    } catch (error) {
      setStatus({ type: "error", message: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleBasicMode = () => {
    setMode("basic");
    if (onResult) {
      onResult({
        metabolic_type: "mixto",
        metabolic_confidence: "baja",
        metabolic_score: 0,
        metabolic_pending_type: null,
        metabolic_pending_count: 0,
        macros: null
      });
    }
    setStatus({
      type: "success",
      data: {
        applied_type: "mixto",
        confidence: "baja",
        score: 0,
        pending_type: null,
        pending_count: 0
      }
    });
  };

  if (mode === null) {
    return (
      <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-yellow-400/10 border border-yellow-400/30">
            <Brain className="w-5 h-5 text-yellow-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Reparto de macros</p>
            <p className="text-xs text-gray-400">
              Esto ajusta como repartimos proteinas/carbos/grasas, no tus calorias totales.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={handleBasicMode}
            className="flex flex-col items-start gap-2 p-4 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors text-left"
          >
            <p className="text-sm font-semibold text-white">Basico (sin cuestionario)</p>
            <p className="text-xs text-gray-400">Distribucion equilibrada de macros. Puedes personalizar luego.</p>
          </button>
          <button
            type="button"
            onClick={() => setMode("precise")}
            className="flex flex-col items-start gap-2 p-4 rounded-lg border border-yellow-400/30 bg-yellow-400/5 hover:bg-yellow-400/10 transition-colors text-left"
          >
            <p className="text-sm font-semibold text-yellow-300">Preciso (con cuestionario)</p>
            <p className="text-xs text-gray-400">10 preguntas para personalizar la distribucion de macros.</p>
          </button>
        </div>
      </div>
    );
  }

  if (mode === "basic") {
    return (
      <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <p className="text-sm font-semibold text-white">Reparto actual: {getProfileLabel("mixto")} (basico)</p>
        </div>
        <p className="text-xs text-gray-400">Distribucion equilibrada de macros aplicada. Puedes cambiar a modo preciso en cualquier momento.</p>
        <button
          type="button"
          onClick={() => setMode("precise")}
          className="text-xs text-yellow-300/80 hover:text-yellow-200 underline"
        >
          Cambiar a modo preciso
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-4">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-yellow-400/10 border border-yellow-400/30">
          <Brain className="w-5 h-5 text-yellow-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white">Cuestionario metabolico</p>
          <p className="text-xs text-gray-400">
            Esto ajusta como repartimos proteinas/carbos/grasas, no tus calorias totales.
            Dos reevaluaciones consecutivas son necesarias para cambiar de categoria (anti-ruido).
          </p>
        </div>
      </div>

      <div className="grid gap-3">
        {QUESTIONS.map((q) => (
          <div key={q.id} className="bg-neutral-900/40 border border-white/5 rounded-lg p-3">
            <p className="text-sm text-white mb-2">{q.label}</p>
            <div className="flex flex-wrap gap-2 text-xs">
              <button
                type="button"
                onClick={() => setAnswer(q.id, q.scoreIfYes)}
                className={`px-3 py-1 rounded-lg border ${
                  answers.find((a) => a.id === q.id)?.value === q.scoreIfYes
                    ? "border-green-500 text-green-300 bg-green-500/10"
                    : "border-white/10 text-gray-200"
                }`}
              >
                Sí ({q.scoreIfYes > 0 ? "+" : ""}{q.scoreIfYes})
              </button>
              <button
                type="button"
                onClick={() => setAnswer(q.id, 0)}
                className={`px-3 py-1 rounded-lg border ${
                  answers.find((a) => a.id === q.id)?.value === 0
                    ? "border-blue-400 text-blue-200 bg-blue-500/10"
                    : "border-white/10 text-gray-200"
                }`}
              >
                No (0)
              </button>
              <button
                type="button"
                onClick={() => setAnswer(q.id, null)}
                className={`px-3 py-1 rounded-lg border ${
                  answers.find((a) => a.id === q.id)?.value === null
                    ? "border-gray-500 text-gray-300 bg-gray-500/10"
                    : "border-white/10 text-gray-200"
                }`}
              >
                No sé
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-neutral-900/40 border border-white/5 rounded-lg p-3">
          <p className="text-xs uppercase tracking-wide text-gray-400 mb-2">Señales objetivas (opcionales)</p>
          <div className="space-y-2 text-sm text-white">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={signals.performanceLossCut}
                onChange={(e) => handleSignalChange("performanceLossCut", e.target.checked)}
                className="accent-yellow-400"
              />
              Hambre/rendimiento bajo en definición (añade +1)
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={signals.stableEnergyWithCarbs}
                onChange={(e) => handleSignalChange("stableEnergyWithCarbs", e.target.checked)}
                className="accent-yellow-400"
              />
              Energía estable con carbohidratos
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={signals.waistStableOrDown}
                onChange={(e) => handleSignalChange("waistStableOrDown", e.target.checked)}
                className="accent-yellow-400"
              />
              Cintura estable o bajando con carbohidratos
            </label>
          </div>
        </div>

        <div className="bg-neutral-900/40 border border-white/5 rounded-lg p-3">
          <p className="text-xs uppercase tracking-wide text-gray-400 mb-2">ICG en volumen</p>
          <div className="flex gap-2 text-sm">
            <button
              type="button"
              onClick={() => handleSignalChange("icgFlag", "none")}
              className={`flex-1 px-3 py-2 rounded-lg border ${
                signals.icgFlag === "none" ? "border-blue-400 text-blue-200 bg-blue-500/10" : "border-white/10 text-white"
              }`}
            >
              Sin alerta
            </button>
            <button
              type="button"
              onClick={() => handleSignalChange("icgFlag", "high")}
              className={`flex-1 px-3 py-2 rounded-lg border ${
                signals.icgFlag === "high" ? "border-red-500 text-red-200 bg-red-500/10" : "border-white/10 text-white"
              }`}
            >
              ICG amarillo/rojo (+1)
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <div className="flex items-center gap-2 text-gray-300">
          <Activity className="w-4 h-4 text-yellow-400" />
          <span>Respondidas: {summary.answered}/10 · Score parcial: {summary.score}</span>
        </div>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading}
          className="px-4 py-2 rounded-lg bg-yellow-500 text-black font-semibold shadow hover:bg-yellow-400 disabled:opacity-60"
        >
          {loading ? "Calculando..." : "Calcular perfil metabólico"}
        </button>
      </div>

      {status?.type === "success" && (
        <div className="p-3 rounded-lg border border-green-500/40 bg-green-500/10 text-sm text-white flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-green-400" />
          <div>
            <p className="font-semibold">Perfil aplicado: {getProfileLabel(status.data.applied_type)}</p>
            <p className="text-gray-200">
              Score S: {status.data.score} · Confianza: {status.data.confidence}. Pendiente:{" "}
              {status.data.pending_type ? `${getProfileLabel(status.data.pending_type)} (${status.data.pending_count}/2)` : "ninguno"}.
            </p>
          </div>
        </div>
      )}

      {status?.type === "error" && (
        <div className="p-3 rounded-lg border border-red-500/40 bg-red-500/10 text-sm text-white flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-400" />
          <p>{status.message}</p>
        </div>
      )}
    </div>
  );
}
