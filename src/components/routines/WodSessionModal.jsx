import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Timer, Play, Pause, RotateCcw, Flag, X, Dumbbell, ChevronDown } from 'lucide-react';

/**
 * Reproductor de WOD para CrossFit (single-day y plan).
 *
 * A diferencia de RoutineSessionModal (basado en series/reps), este player
 * muestra UN WOD: formato + tope de tiempo + lista de movimientos con su
 * escalado (Scaled / RX / RX+) y un cronómetro. Al terminar invoca
 * onCompleteSession con el resumen ({ escala, elapsedSeconds }) para que el
 * flujo padre registre el resultado (CrossFitEffortModal en Fase 4).
 *
 * Consume el contrato de WOD definido en crossfitSingleDay.js:
 *   session.wod = { formato, time_cap_min, rounds, label, dominio_principal, movimientos[] }
 * Si no llega `wod`, cae a session.ejercicios (compatibilidad).
 */

const FORMAT_LABELS = {
  amrap: 'AMRAP',
  emom: 'EMOM',
  e2mom: 'E2MOM',
  e3mom: 'E3MOM',
  for_time: 'For Time',
  rft: 'Rondas por tiempo',
  chipper: 'Chipper',
  intervals: 'Intervalos',
  strength_only: 'Fuerza',
  skill_only: 'Técnica'
};

const SCALES = [
  { id: 'scaled', label: 'Scaled', hint: 'Versión adaptada' },
  { id: 'rx', label: 'RX', hint: 'Estándar' },
  { id: 'rxplus', label: 'RX+', hint: 'Competitivo' }
];

function formatTime(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

export default function WodSessionModal({
  isOpen,
  session,
  sessionId,
  onClose,
  onStartSession,
  onFinishExercise,
  onCompleteSession
}) {
  // Descriptor del WOD (o reconstrucción mínima desde ejercicios).
  const wod = useMemo(() => {
    if (session?.wod) return session.wod;
    const movimientos = (session?.ejercicios || session?.exercises || []).map((e, i) => ({
      orden: e.orden || i + 1,
      exercise_id: e.exercise_id ?? e.id ?? null,
      nombre: e.nombre || e.exercise_name,
      dominio: e.dominio || e.categoria,
      reps: e.reps || e.reps_objetivo || '',
      escala_rx: e.escala_rx || e.rx_carga_sugerida || 'RX',
      escala_scaled: e.escala_scaled || e.escalamiento || 'Versión escalada',
      como_hacerlo: e.como_hacerlo || null,
      notas: e.notas || ''
    }));
    return { formato: 'for_time', time_cap_min: 15, rounds: null, label: 'WOD del Día', dominio_principal: 'Mixto', movimientos };
  }, [session]);

  const timeCapSeconds = Number(wod.time_cap_seconds)
    || Number(wod.time_cap_min || 15) * 60;

  const [scale, setScale] = useState('rx');
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [startError, setStartError] = useState(null);
  const [movementScales, setMovementScales] = useState({});
  const intervalRef = useRef(null);
  const startPersistedRef = useRef(false);

  useEffect(() => {
    const initial = Object.fromEntries((wod.movimientos || []).map((movement, index) => [
      movement.canonical_movement_id ?? movement.exercise_id ?? String(index),
      movement.scale_id ?? 'rx'
    ]));
    setMovementScales(initial);
    setStartError(null);
    startPersistedRef.current = false;
  }, [sessionId, wod.movimientos]);

  useEffect(() => {
    if (!running) return undefined;
    intervalRef.current = setInterval(() => {
      setElapsed((prev) => {
        const next = prev + 1;
        if (next >= timeCapSeconds) {
          setRunning(false);
          return timeCapSeconds;
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, [running, wod.formato, timeCapSeconds]);

  useEffect(() => () => clearInterval(intervalRef.current), []);

  if (!isOpen) return null;

  const movimientos = wod.movimientos || [];
  const formatLabel = FORMAT_LABELS[wod.formato] || wod.label || 'WOD';
  const atCap = elapsed >= timeCapSeconds;

  const scalingTextFor = (m, movementScale) => {
    if (movementScale === 'scaled') return m.escala_scaled;
    if (movementScale === 'rxplus') return `${m.escala_rx} · sube intensidad`;
    return m.escala_rx;
  };

  const setGlobalScale = (nextScale) => {
    setScale(nextScale);
    setMovementScales(Object.fromEntries(movimientos.map((movement, index) => [
      movement.canonical_movement_id ?? movement.exercise_id ?? String(index),
      nextScale
    ])));
  };

  const handleTimerToggle = async () => {
    if (running) {
      setRunning(false);
      return;
    }
    if (!startPersistedRef.current && typeof onStartSession === 'function') {
      try {
        await onStartSession();
        startPersistedRef.current = true;
      } catch (error) {
        setStartError(error?.message || 'No se pudo registrar el inicio. Reintenta.');
        return;
      }
    }
    setStartError(null);
    setRunning(true);
  };

  const handleFinish = async () => {
    setRunning(false);
    setFinished(true);
    let persistenceFailures = 0;
    // Marcar cada movimiento como completado para mantener el tracking coherente.
    if (typeof onFinishExercise === 'function') {
      for (let i = 0; i < movimientos.length; i += 1) {
        try {
          const persisted = await onFinishExercise(i, {
            status: 'completed',
            series_completed: 1,
            time_spent_seconds: Math.round(elapsed / Math.max(1, movimientos.length))
          });
          if (persisted?.success === false) persistenceFailures += 1;
        } catch (err) {
          console.error('❌ [WOD] Error registrando movimiento', i, err);
          persistenceFailures += 1;
        }
      }
    }
    if (persistenceFailures > 0) {
      setFinished(false);
      setStartError('No se guardó todo el WOD. Revisa la conexión y reintenta el cierre.');
      return;
    }
    if (typeof onCompleteSession === 'function') {
      onCompleteSession({
        escala: scale,
        elapsedSeconds: elapsed,
        timeCapSeconds,
        formato: wod.formato,
        scoreType: wod.score_type || 'none',
        status: atCap ? 'capped' : 'completed',
        scales: movimientos.map((movement, index) => ({
          movement_id: movement.canonical_movement_id ?? movement.exercise_id ?? String(index),
          scale_id: movementScales[movement.canonical_movement_id ?? movement.exercise_id ?? String(index)] ?? scale
        })),
        sessionId: sessionId ?? session?.sessionId ?? null
      });
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-3 sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/10 border-l-2 border-l-yellow-400/40 bg-neutral-900/95 shadow-2xl backdrop-blur-xl">
        {/* Cabecera */}
        <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-yellow-500/10 p-3 text-yellow-300">
              <Dumbbell className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-white font-urbanist">{wod.label || 'WOD del Día'}</h2>
                <span className="rounded-md border border-yellow-400/30 bg-yellow-400/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-yellow-200">
                  {formatLabel}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-gray-400">
                Tope {wod.time_cap_min} min · Foco: {wod.dominio_principal || 'Mixto'}
                {wod.rounds ? ` · ${wod.rounds} rondas` : ''}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-gray-400 transition hover:bg-white/5 hover:text-gray-200" aria-label="Cerrar">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Selector de escala */}
          <div className="mb-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Escala</p>
            <div className="grid grid-cols-3 gap-2">
              {SCALES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setGlobalScale(s.id)}
                  className={`rounded-xl border px-2 py-2 text-center transition ${
                    scale === s.id
                      ? 'border-yellow-400/60 bg-yellow-400/15 text-yellow-200'
                      : 'border-white/10 bg-white/5 text-gray-200 hover:border-yellow-400/30'
                  }`}
                >
                  <span className="block text-sm font-semibold">{s.label}</span>
                  <span className="block text-[10px] text-gray-400">{s.hint}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Cronómetro */}
          <div className="mb-4 rounded-2xl border border-white/10 bg-black/30 px-5 py-4 text-center">
            <div className="flex items-center justify-center gap-2 text-gray-400">
              <Timer className="h-4 w-4" />
              <span className="text-xs uppercase tracking-wide">{atCap ? 'Time cap alcanzado' : 'Cronómetro'}</span>
            </div>
            <div className={`mt-1 font-mono text-5xl font-bold tabular-nums ${atCap ? 'text-red-400' : 'text-white'}`}>
              {formatTime(elapsed)}
            </div>
            <div className="mt-3 flex items-center justify-center gap-2">
              <button
                onClick={handleTimerToggle}
                disabled={atCap}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 px-5 py-2.5 text-sm font-semibold text-black transition hover:from-yellow-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                {running ? 'Pausar' : 'Iniciar'}
              </button>
              <button
                onClick={() => { setRunning(false); setElapsed(0); }}
                className="flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm text-gray-200 transition hover:bg-white/5"
              >
                <RotateCcw className="h-4 w-4" /> Reiniciar
              </button>
            </div>
            {startError && <p className="mt-2 text-xs text-red-300" role="alert">{startError}</p>}
          </div>

          {/* Movimientos */}
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Movimientos</p>
          <ul className="space-y-2">
            {movimientos.map((m, i) => (
              <li key={m.exercise_id ?? i} className="rounded-xl border border-white/10 bg-white/5">
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white">{(m.reps || m.repeticiones || m.reps_objetivo) ? `${m.reps || m.repeticiones || m.reps_objetivo} · ` : ''}{m.nombre}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      {m.dominio && (
                        <span className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-gray-300">{m.dominio}</span>
                      )}
                      <span className="text-xs text-yellow-200/90">{scalingTextFor(m, movementScales[m.canonical_movement_id ?? m.exercise_id ?? String(i)] ?? scale)}</span>
                      <select
                        aria-label={`Escala para ${m.nombre}`}
                        value={movementScales[m.canonical_movement_id ?? m.exercise_id ?? String(i)] ?? scale}
                        onChange={(event) => setMovementScales((current) => ({
                          ...current,
                          [m.canonical_movement_id ?? m.exercise_id ?? String(i)]: event.target.value
                        }))}
                        className="rounded border border-white/10 bg-neutral-800 px-1.5 py-1 text-[11px] text-gray-200"
                      >
                        {SCALES.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                      </select>
                    </div>
                  </div>
                  {m.como_hacerlo && (
                    <button
                      onClick={() => setExpanded(expanded === i ? null : i)}
                      className="shrink-0 rounded-lg p-1.5 text-gray-400 transition hover:bg-white/5 hover:text-gray-200"
                      aria-label="Ver detalles"
                    >
                      <ChevronDown className={`h-4 w-4 transition ${expanded === i ? 'rotate-180' : ''}`} />
                    </button>
                  )}
                </div>
                {expanded === i && m.como_hacerlo && (
                  <div className="border-t border-white/10 px-4 py-3 text-xs text-gray-300">{m.como_hacerlo}</div>
                )}
              </li>
            ))}
          </ul>
        </div>

        {/* Pie */}
        <div className="flex items-center justify-between gap-3 border-t border-white/10 px-5 py-4">
          <button onClick={onClose} className="rounded-xl px-3 py-2 text-sm text-gray-400 transition hover:text-gray-200">
            Salir
          </button>
          <button
            onClick={handleFinish}
            disabled={finished}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 px-5 py-2.5 text-sm font-semibold text-black transition hover:from-yellow-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Flag className="h-4 w-4" />
            {finished ? 'Registrado' : 'Terminar WOD'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
