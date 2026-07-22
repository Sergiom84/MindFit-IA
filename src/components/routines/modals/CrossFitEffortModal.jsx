import { useEffect, useState } from 'react';
import { AlertTriangle, Check, Flame, X } from 'lucide-react';

const RPE_OPTIONS = Array.from({ length: 10 }, (_, index) => index + 1);
const SCALE_OPTIONS = [
  { value: 'scaled', label: 'Scaled' },
  { value: 'rx', label: 'RX' },
  { value: 'rxplus', label: 'RX+' }
];
const TECHNIQUE_OPTIONS = [
  { value: 0, label: 'Detenida' },
  { value: 1, label: 'Inestable' },
  { value: 2, label: 'Sólida' },
  { value: 3, label: 'Consistente' }
];
const FEELING_OPTIONS = [
  { value: 'facil', label: 'Con margen' },
  { value: 'normal', label: 'Según lo previsto' },
  { value: 'dificil', label: 'Más duro de lo previsto' }
];
const PAIN_LOCATIONS = [
  'hombro', 'codo', 'muñeca', 'espalda', 'cadera', 'rodilla', 'tobillo', 'otra'
];
const READINESS_FIELDS = [
  { key: 'sleep', label: 'Sueño', low: 'Muy malo', high: 'Muy bueno' },
  { key: 'fatigue', label: 'Fatiga', low: 'Muy baja', high: 'Muy alta' },
  { key: 'recovery', label: 'Recuperación', low: 'Muy mala', high: 'Muy buena' },
  { key: 'stress', label: 'Estrés', low: 'Muy bajo', high: 'Muy alto' }
];

const RESULT_COPY = {
  baseline: { title: 'Referencia registrada', msg: 'Usaremos este resultado como punto de partida.' },
  hold: { title: 'Estímulo mantenido', msg: 'La próxima exposición conserva la dosis mientras reunimos más evidencia.' },
  progress_capacity: { title: 'Progresión de capacidad', msg: 'La siguiente progresión cambia una sola variable de trabajo.' },
  progress_skill: { title: 'Progresión técnica', msg: 'La siguiente exposición avanza un peldaño técnico sin subir a la vez la carga.' },
  regress: { title: 'Sesión ajustada', msg: 'Reduciremos volumen, complejidad o impacto hasta recuperar criterios seguros.' },
  deload: { title: 'Descarga programada', msg: 'La tendencia de fatiga requiere una reducción temporal de dosis.' },
  blocked: { title: 'Entrenamiento bloqueado', msg: 'No se programará alta intensidad hasta resolver el criterio de seguridad.' },
  progress: { title: 'Progresión registrada', msg: 'Ajustaremos una variable en la próxima exposición.' }
};

function scoreTypeFromSummary(summary) {
  if (summary?.scoreType) return summary.scoreType;
  if (['for_time', 'rft', 'chipper'].includes(summary?.formato)) return 'time';
  if (summary?.formato === 'amrap') return 'rounds_reps';
  if (['emom', 'e2mom', 'e3mom', 'intervals'].includes(summary?.formato)) return 'reps';
  if (summary?.formato === 'strength_only') return 'load';
  if (summary?.formato === 'skill_only') return 'quality';
  return 'none';
}

function scoreFromSummary(summary, { rounds, metric }, technique) {
  if (!summary || typeof summary !== 'object') return { type: 'none' };
  const type = scoreTypeFromSummary(summary);
  if (type === 'time' && Number.isFinite(summary.elapsedSeconds)) {
    return { type: 'time', elapsed_seconds: Math.max(0, Number(summary.elapsedSeconds)) };
  }
  if (type === 'rounds_reps') return { type, rounds: Number(rounds), reps: Number(metric) };
  if (type === 'quality') return { type, quality: `technique_${technique}` };
  const key = { reps: 'reps', calories: 'calories', load: 'load', distance: 'distance_m' }[type];
  if (key) return { type, [key]: Number(metric) };
  return { type: 'none' };
}

export default function CrossFitEffortModal({
  isOpen,
  onSubmit,
  onSkip,
  onContinue,
  result = null,
  defaultScale = 'rx',
  wodSummary = null,
  isLoading = false,
  submitError = null,
  isV2Result = false
}) {
  const structuredScales = Array.isArray(wodSummary?.scales) ? wodSummary.scales : [];
  const lockedScales = isV2Result || wodSummary?.runtimeVersion === 'crossfit-runtime-event/v2';
  const recordedScale = lockedScales && structuredScales.some((item) => item.scale_id !== 'base')
    ? 'scaled'
    : lockedScales ? 'base' : defaultScale;
  const [completed, setCompleted] = useState(null);
  const [rpe, setRpe] = useState(null);
  const [scale, setScale] = useState(recordedScale);
  const [technique, setTechnique] = useState(null);
  const [painScore, setPainScore] = useState(null);
  const [painLocation, setPainLocation] = useState('');
  const [painQuality, setPainQuality] = useState('');
  const [redFlag, setRedFlag] = useState(false);
  const [readiness, setReadiness] = useState({ sleep: null, fatigue: null, recovery: null, stress: null });
  const [feeling, setFeeling] = useState(null);
  const [scoreRounds, setScoreRounds] = useState('');
  const [scoreMetric, setScoreMetric] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setScale(recordedScale);
    setCompleted(null);
    setRpe(null);
    setTechnique(null);
    setPainScore(null);
    setPainLocation('');
    setPainQuality('');
    setRedFlag(false);
    setReadiness({ sleep: null, fatigue: null, recovery: null, stress: null });
    setFeeling(null);
    setScoreRounds('');
    setScoreMetric('');
  }, [isOpen, recordedScale]);

  if (!isOpen) return null;

  const readinessComplete = Object.values(readiness).every((value) => Number.isInteger(value));
  const painContextComplete = painScore === 0 || Boolean(painLocation);
  const scoreType = scoreTypeFromSummary(wodSummary);
  const scoreComplete = scoreType === 'rounds_reps'
    ? scoreRounds !== '' && scoreMetric !== ''
    : ['reps', 'calories', 'load', 'distance'].includes(scoreType)
      ? scoreMetric !== ''
      : true;
  const canSubmit = completed !== null
    && rpe !== null
    && technique !== null
    && painScore !== null
    && painContextComplete
    && readinessComplete
    && scoreComplete
    && !isLoading;
  const safetyStop = redFlag || painScore >= 5 || technique === 0;

  if (result) {
    const copy = RESULT_COPY[result] || RESULT_COPY.hold;
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4">
        <div className="w-full max-w-md rounded-2xl border border-white/10 border-l-2 border-l-yellow-400/40 bg-neutral-900/95 p-6 text-center shadow-2xl backdrop-blur-xl">
          <h2 className="font-urbanist text-xl font-semibold text-white">{copy.title}</h2>
          <p className="mt-2 text-sm text-gray-300">{copy.msg}</p>
          <button
            onClick={onContinue}
            className="mt-5 w-full rounded-xl bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 px-5 py-3 text-sm font-semibold text-black transition hover:from-yellow-200"
          >
            Continuar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-3 sm:p-4">
      <div className="flex max-h-[94vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-white/10 border-l-2 border-l-yellow-400/40 bg-neutral-900/95 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4 sm:px-6">
          <div className="rounded-xl bg-yellow-500/10 p-3 text-yellow-300">
            <Flame className="h-6 w-6" />
          </div>
          <div>
            <h2 className="font-urbanist text-lg font-semibold text-white">Cierre del WOD</h2>
            <p className="text-sm text-gray-400">Registra rendimiento, técnica y recuperación.</p>
          </div>
        </div>

        <div className="space-y-6 overflow-y-auto px-5 py-5 sm:px-6">
          <section>
            <p className="mb-2 text-sm font-semibold text-gray-200">¿Completaste el objetivo dentro del time cap?</p>
            <div className="flex gap-2">
              {[
                { value: true, label: 'Sí' },
                { value: false, label: 'No / cap alcanzado' }
              ].map((option) => (
                <button
                  key={String(option.value)}
                  type="button"
                  onClick={() => setCompleted(option.value)}
                  aria-pressed={completed === option.value}
                  className={`flex-1 rounded-xl border px-4 py-3 text-sm transition ${
                    completed === option.value
                      ? 'border-yellow-400/60 bg-yellow-400/15 text-yellow-200'
                      : 'border-white/10 bg-white/5 text-gray-200 hover:border-yellow-400/30'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </section>

          {scoreType !== 'none' && scoreType !== 'time' && scoreType !== 'quality' && (
            <section>
              <p className="mb-2 text-sm font-semibold text-gray-200">Resultado del WOD</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {scoreType === 'rounds_reps' && (
                  <label className="text-xs text-gray-400">
                    Rondas completas
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={scoreRounds}
                      onChange={(event) => setScoreRounds(event.target.value)}
                      className="mt-1 w-full rounded-lg border border-white/10 bg-neutral-800 px-3 py-2 text-sm text-white"
                    />
                  </label>
                )}
                <label className="text-xs text-gray-400">
                  {scoreType === 'rounds_reps' || scoreType === 'reps' ? 'Repeticiones adicionales/totales'
                    : scoreType === 'calories' ? 'Calorías'
                    : scoreType === 'load' ? 'Carga (kg)'
                    : 'Distancia (m)'}
                  <input
                    type="number"
                    min="0"
                    step={scoreType === 'load' ? '0.5' : '1'}
                    value={scoreMetric}
                    onChange={(event) => setScoreMetric(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-neutral-800 px-3 py-2 text-sm text-white"
                  />
                </label>
              </div>
            </section>
          )}

          <section>
            <p className="mb-2 text-sm font-semibold text-gray-200">Esfuerzo percibido (RPE 1-10)</p>
            <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
              {RPE_OPTIONS.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setRpe(value)}
                  aria-pressed={rpe === value}
                  className={`rounded-lg border py-2 text-sm font-semibold transition ${
                    rpe === value
                      ? 'border-yellow-400/60 bg-yellow-400/15 text-yellow-200'
                      : 'border-white/10 bg-white/5 text-gray-300 hover:border-yellow-400/30'
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>
          </section>

          <section>
            <p className="mb-2 text-sm font-semibold text-gray-200">Calidad técnica bajo fatiga</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {TECHNIQUE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setTechnique(option.value)}
                  aria-pressed={technique === option.value}
                  className={`rounded-xl border px-2 py-2.5 text-sm transition ${
                    technique === option.value
                      ? 'border-yellow-400/60 bg-yellow-400/15 text-yellow-200'
                      : 'border-white/10 bg-white/5 text-gray-300 hover:border-yellow-400/30'
                  }`}
                >
                  {option.value} · {option.label}
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-white/10 bg-black/15 p-4">
            <div className="flex items-center justify-between gap-4">
              <label htmlFor="crossfit-pain" className="text-sm font-semibold text-gray-200">Dolor durante el WOD</label>
              <span className="text-sm font-semibold text-yellow-200">{painScore ?? 'Sin valorar'}</span>
            </div>
            <input
              id="crossfit-pain"
              type="range"
              min="0"
              max="10"
              step="1"
              value={painScore ?? 0}
              onChange={(event) => setPainScore(Number(event.target.value))}
              className="mt-3 w-full accent-yellow-400"
            />
            <div className="mt-1 flex justify-between text-[11px] text-gray-500"><span>0 · ninguno</span><span>10 · máximo</span></div>
            {painScore > 0 && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-xs text-gray-400">
                  Zona
                  <select
                    value={painLocation}
                    onChange={(event) => setPainLocation(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-neutral-800 px-3 py-2 text-sm text-white"
                  >
                    <option value="">Selecciona</option>
                    {PAIN_LOCATIONS.map((location) => <option key={location} value={location}>{location}</option>)}
                  </select>
                </label>
                <label className="text-xs text-gray-400">
                  Sensación
                  <select
                    value={painQuality}
                    onChange={(event) => setPainQuality(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-neutral-800 px-3 py-2 text-sm text-white"
                  >
                    <option value="">Sin especificar</option>
                    <option value="molestia">Molestia difusa</option>
                    <option value="punzante">Punzante</option>
                    <option value="creciente">Creciente</option>
                    <option value="rigidez">Rigidez</option>
                  </select>
                </label>
              </div>
            )}
            <label className="mt-3 flex items-start gap-2 text-xs text-gray-300">
              <input
                type="checkbox"
                checked={redFlag}
                onChange={(event) => setRedFlag(event.target.checked)}
                className="mt-0.5 accent-red-500"
              />
              Hubo dolor súbito/punzante creciente, lesión aguda, dolor torácico, mareo o dificultad respiratoria inusual.
            </label>
          </section>

          {safetyStop && (
            <div className="flex gap-3 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100" role="alert">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <p>Este resultado prioriza seguridad: la app bloqueará o reducirá la siguiente sesión. Si hay síntomas intensos o agudos, busca valoración profesional.</p>
            </div>
          )}

          <section>
            <p className="mb-2 text-sm font-semibold text-gray-200">Readiness de hoy (1-5)</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {READINESS_FIELDS.map((field) => (
                <label key={field.key} className="text-xs text-gray-400">
                  {field.label}
                  <select
                    value={readiness[field.key] ?? ''}
                    onChange={(event) => setReadiness((current) => ({
                      ...current,
                      [field.key]: Number(event.target.value)
                    }))}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-neutral-800 px-3 py-2 text-sm text-white"
                  >
                    <option value="">Selecciona</option>
                    {[1, 2, 3, 4, 5].map((value) => (
                      <option key={value} value={value}>{value}{value === 1 ? ` · ${field.low}` : value === 5 ? ` · ${field.high}` : ''}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </section>

          {lockedScales ? (
            <section>
              <p className="mb-2 text-sm font-semibold text-gray-200">Escalado registrado en el WOD</p>
              <div className="space-y-2 rounded-xl border border-emerald-400/20 bg-emerald-500/5 p-3">
                {structuredScales.length > 0 ? structuredScales.map((item) => (
                  <div key={item.movement_id} className="flex items-center justify-between gap-3 text-xs">
                    <span className="font-mono text-gray-300">{item.movement_id}</span>
                    <span className="text-emerald-200">
                      {item.scale_id === 'base' ? 'Prescripción base' : 'Adaptación validada'}
                    </span>
                  </div>
                )) : (
                  <p className="text-xs text-emerald-100">El servidor reconstruirá cada escala desde el registro de ejecución.</p>
                )}
              </div>
              <p className="mt-2 text-xs text-gray-500">El resultado no puede reclasificar la escala después de terminar.</p>
            </section>
          ) : (
            <section>
              <p className="mb-2 text-sm font-semibold text-gray-200">Escala global usada</p>
              <div className="grid grid-cols-3 gap-2">
                {SCALE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setScale(option.value)}
                    aria-pressed={scale === option.value}
                    className={`rounded-xl border px-2 py-2.5 text-sm transition ${
                      scale === option.value
                        ? 'border-yellow-400/60 bg-yellow-400/15 text-yellow-200'
                        : 'border-white/10 bg-white/5 text-gray-200 hover:border-yellow-400/30'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </section>
          )}

          <section>
            <p className="mb-2 text-sm font-semibold text-gray-200">Percepción global <span className="font-normal text-gray-500">(opcional)</span></p>
            <div className="grid gap-2 sm:grid-cols-3">
              {FEELING_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setFeeling(feeling === option.value ? null : option.value)}
                  aria-pressed={feeling === option.value}
                  className={`rounded-xl border px-2 py-2.5 text-sm transition ${
                    feeling === option.value
                      ? 'border-yellow-400/60 bg-yellow-400/15 text-yellow-200'
                      : 'border-white/10 bg-white/5 text-gray-200 hover:border-yellow-400/30'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </section>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-white/10 px-5 py-4 sm:px-6">
          {lockedScales ? (
            <p className="text-xs text-gray-500">Feedback obligatorio para cerrar el resultado v2.</p>
          ) : (
            <button
              type="button"
              onClick={onSkip}
              className="flex items-center gap-1 rounded-xl px-3 py-2 text-sm text-gray-400 transition hover:text-gray-200"
            >
              <X className="h-4 w-4" /> Ahora no
            </button>
          )}
          {submitError && <p className="max-w-52 text-right text-xs text-red-300" role="alert">{submitError}</p>}
          <button
            type="button"
            onClick={() => canSubmit && onSubmit({
              rpe,
              completed,
              scale: lockedScales ? recordedScale : scale,
              technique,
              pain: {
                score: painScore,
                locations: painLocation ? [painLocation] : [],
                quality: painQuality || null,
                delta: 0,
                red_flag: redFlag,
                acute_injury: redFlag
              },
              readiness,
              score: scoreFromSummary(wodSummary, { rounds: scoreRounds, metric: scoreMetric }, technique),
              status: completed ? (wodSummary?.status || 'completed') : 'capped',
              completion: completed ? 1 : 0.9,
              feeling
            })}
            disabled={!canSubmit}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 px-5 py-2.5 text-sm font-semibold text-black transition hover:from-yellow-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Check className="h-4 w-4" />
            {isLoading ? 'Guardando...' : 'Guardar resultado'}
          </button>
        </div>
      </div>
    </div>
  );
}
