import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Timer, Play, Pause, RotateCcw, Flag, X, Dumbbell, ChevronDown, RefreshCw, ShieldCheck, WifiOff } from 'lucide-react';

import CrossfitSubstitutionPanel from './crossfit/CrossfitSubstitutionPanel.jsx';
import useCrossfitWodRuntime from './crossfit/useCrossfitWodRuntime.js';
import { crossfitMovementId, isCrossfitV2Presentation } from './crossfit/runtimeState.js';

/**
 * Reproductor de WOD para CrossFit (single-day y plan).
 *
 * A diferencia de RoutineSessionModal (basado en series/reps), este player
 * muestra UN WOD: formato + tope de tiempo + lista de movimientos con su
 * escalado por movimiento y un cronómetro. Al terminar invoca
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

const LEGACY_SCALES = [
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

function doseLabel(dose = {}) {
  if (dose.type === 'reps') return `${dose.reps} reps`;
  if (dose.type === 'duration') return `${dose.duration_seconds}s`;
  if (dose.type === 'calories') return `${dose.calories} cal`;
  if (dose.type === 'distance') return `${dose.distance_m} m`;
  return 'Dosis adaptada';
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
  const movimientos = useMemo(() => wod.movimientos || [], [wod.movimientos]);
  const isV2 = isCrossfitV2Presentation(session);
  const movementIds = useMemo(
    () => movimientos.map((movement, index) => crossfitMovementId(movement, index)),
    [movimientos]
  );

  const [scale, setScale] = useState('rx');
  const [legacyElapsed, setLegacyElapsed] = useState(0);
  const [legacyRunning, setLegacyRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [startError, setStartError] = useState(null);
  const [movementScales, setMovementScales] = useState({});
  const [substitutionMovement, setSubstitutionMovement] = useState(null);
  const [substitutionLoading, setSubstitutionLoading] = useState(false);
  const [substitutionError, setSubstitutionError] = useState(null);
  const [showEarlyFinish, setShowEarlyFinish] = useState(false);
  const intervalRef = useRef(null);
  const startPersistedRef = useRef(false);
  const runtime = useCrossfitWodRuntime({
    enabled: isV2,
    sessionId,
    movementIds,
    timeCapSeconds,
    onStartSession
  });
  const elapsed = isV2 ? runtime.elapsedSeconds : legacyElapsed;
  const running = isV2 ? runtime.running : legacyRunning;

  useEffect(() => {
    const initial = Object.fromEntries((wod.movimientos || []).map((movement, index) => [
      crossfitMovementId(movement, index),
      movement.scale_id ?? 'rx'
    ]));
    setMovementScales(initial);
    setScale(isV2 ? 'base' : 'rx');
    setStartError(null);
    setSubstitutionMovement(null);
    setSubstitutionError(null);
    setShowEarlyFinish(false);
    startPersistedRef.current = false;
  }, [isV2, sessionId, wod.movimientos]);

  useEffect(() => {
    if (isV2 || !legacyRunning) return undefined;
    intervalRef.current = setInterval(() => {
      setLegacyElapsed((prev) => {
        const next = prev + 1;
        if (next >= timeCapSeconds) {
          setLegacyRunning(false);
          return timeCapSeconds;
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, [isV2, legacyRunning, timeCapSeconds]);

  useEffect(() => () => clearInterval(intervalRef.current), []);

  if (!isOpen) return null;

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
      crossfitMovementId(movement, index),
      nextScale
    ])));
  };

  const handleTimerToggle = async () => {
    if (isV2) {
      try {
        if (running) runtime.pause();
        else await runtime.start();
        setStartError(null);
      } catch (error) {
        setStartError(error?.message || 'No se pudo registrar el inicio. Reintenta.');
      }
      return;
    }
    if (running) {
      setLegacyRunning(false);
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
    setLegacyRunning(true);
  };

  const handleReset = () => {
    if (isV2) runtime.reset();
    else {
      setLegacyRunning(false);
      setLegacyElapsed(0);
    }
  };

  const handleSubstitution = async (movement, input) => {
    const movementId = crossfitMovementId(movement);
    setSubstitutionLoading(true);
    setSubstitutionError(null);
    const result = await runtime.substitute(movementId, input);
    setSubstitutionLoading(false);
    if (result.substitution) {
      setSubstitutionMovement(null);
      return;
    }
    if (result.error?.safe_fallback === 'stop_session_and_refer') runtime.pause();
    setSubstitutionError(
      result.error?.message
      || (result.synced ? 'No existe una sustitución segura.' : 'Sin conexión: no realices este movimiento hasta validarlo.')
    );
  };

  const handleFinish = async (forcedStatus = null) => {
    if (isV2) {
      if (runtime.timerState === 'idle' && forcedStatus !== 'cancelled') {
        setStartError('Inicia el WOD antes de registrar el resultado.');
        return;
      }
      if (runtime.timerState === 'running') await runtime.pause();
      const synced = await runtime.ensureSynced();
      if (!synced) {
        setStartError('Hay eventos del WOD sin sincronizar. Recupera la conexión antes de cerrar.');
        return;
      }
    } else {
      setLegacyRunning(false);
    }
    setFinished(true);
    let persistenceFailures = 0;
    // V2 cierra progreso + sesión + resultado en una única transacción tras el feedback.
    if (!isV2 && typeof onFinishExercise === 'function') {
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
      try {
        const terminalStatus = forcedStatus ?? (atCap ? 'capped' : 'completed');
        const resolvedScale = isV2 && Object.values(runtime.scales).some((value) => value !== 'base')
          ? 'scaled'
          : isV2 ? 'base' : scale;
        await onCompleteSession({
          escala: resolvedScale,
          elapsedSeconds: elapsed,
          timeCapSeconds,
          formato: wod.formato,
          scoreType: wod.score_type || 'none',
          status: terminalStatus,
          scales: movimientos.map((movement, index) => {
            const movementId = crossfitMovementId(movement, index);
            return {
              movement_id: movementId,
              scale_id: isV2
                ? runtime.scales[movementId] ?? 'base'
                : movementScales[movementId] ?? scale
            };
          }),
          substitutions: Object.values(runtime.substitutions),
          runtimeVersion: isV2 ? 'crossfit-runtime-event/v2' : null,
          sessionId: sessionId ?? session?.sessionId ?? null
        });
        setShowEarlyFinish(false);
      } catch (error) {
        setFinished(false);
        setStartError(error?.message || 'No se pudo cerrar el WOD. Reintenta.');
      }
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-3 sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="crossfit-wod-title"
        data-testid="crossfit-wod-player"
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/10 border-l-2 border-l-yellow-400/40 bg-neutral-900/95 shadow-2xl backdrop-blur-xl"
      >
        {/* Cabecera */}
        <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-yellow-500/10 p-3 text-yellow-300">
              <Dumbbell className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="crossfit-wod-title" className="text-lg font-semibold text-white font-urbanist">{wod.label || 'WOD del Día'}</h2>
                <span className="rounded-md border border-yellow-400/30 bg-yellow-400/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-yellow-200">
                  {formatLabel}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-gray-400">
                Tope {Math.round(timeCapSeconds / 60)} min · Foco: {wod.dominio_principal || 'Mixto'}
                {wod.rounds ? ` · ${wod.rounds} rondas` : ''}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-gray-400 transition hover:bg-white/5 hover:text-gray-200" aria-label="Cerrar">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {isV2 ? (
            <div className="mb-4 flex gap-3 rounded-xl border border-emerald-400/20 bg-emerald-500/5 p-3 text-sm text-emerald-100">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-semibold">Escalado por movimiento</p>
                <p className="mt-0.5 text-xs text-emerald-100/70">No se puede elegir RX+ manualmente. Cada adaptación se valida contra seguridad, material y estímulo.</p>
              </div>
            </div>
          ) : (
            <div className="mb-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Escala legacy</p>
              <div className="grid grid-cols-3 gap-2">
                {LEGACY_SCALES.map((s) => (
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
          )}

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
                onClick={handleReset}
                className="flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm text-gray-200 transition hover:bg-white/5"
              >
                <RotateCcw className="h-4 w-4" /> Reiniciar
              </button>
            </div>
            {startError && <p className="mt-2 text-xs text-red-300" role="alert">{startError}</p>}
            {isV2 && runtime.pendingCount > 0 && (
              <p className="mt-2 flex items-center justify-center gap-1 text-xs text-amber-200" role="status">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" /> {runtime.pendingCount} evento(s) pendiente(s) de sincronizar
              </p>
            )}
            {isV2 && runtime.syncError && (
              <p className="mt-2 flex items-center justify-center gap-1 text-xs text-red-200" role="alert">
                <WifiOff className="h-3.5 w-3.5" /> {runtime.syncError.message}
              </p>
            )}
          </div>

          {/* Movimientos */}
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Movimientos</p>
          <ul className="space-y-2">
            {movimientos.map((m, i) => {
              const movementId = crossfitMovementId(m, i);
              const substitution = isV2 ? runtime.substitutions[movementId] : null;
              const replacement = substitution?.replacement;
              const instructions = replacement?.instruction_text || m.como_hacerlo;
              const dose = replacement ? doseLabel(replacement.dose) : (m.reps || m.repeticiones || m.reps_objetivo);
              return (
                <li key={movementId} className="rounded-xl border border-white/10 bg-white/5">
                  <div className="flex items-start justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-white">{dose ? `${dose} · ` : ''}{replacement?.name || m.nombre}</span>
                        {replacement && <span className="rounded bg-emerald-400/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-200">Validada</span>}
                      </div>
                      {replacement && <p className="mt-1 text-[11px] text-gray-400">Sustituye a {m.nombre}</p>}
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        {m.dominio && (
                          <span className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-gray-300">{m.dominio}</span>
                        )}
                        <span className="text-xs text-yellow-200/90">
                          {isV2
                            ? replacement
                              ? `Estímulo preservado · Δ ${Math.round(Number(substitution.stimulus_delta) * 100)}%`
                              : `Prescripción base · ${m.escala_rx || 'según plan'}`
                            : scalingTextFor(m, movementScales[movementId] ?? scale)}
                        </span>
                        {isV2 ? (
                          <button
                            type="button"
                            onClick={() => {
                              setSubstitutionMovement(substitutionMovement === movementId ? null : movementId);
                              setSubstitutionError(null);
                            }}
                            className="rounded border border-yellow-400/30 px-2 py-1 text-[11px] text-yellow-100 hover:bg-yellow-400/10"
                          >
                            {replacement ? 'Cambiar adaptación' : 'Sustituir'}
                          </button>
                        ) : (
                          <select
                            aria-label={`Escala para ${m.nombre}`}
                            value={movementScales[movementId] ?? scale}
                            onChange={(event) => setMovementScales((current) => ({ ...current, [movementId]: event.target.value }))}
                            className="rounded border border-white/10 bg-neutral-800 px-1.5 py-1 text-[11px] text-gray-200"
                          >
                            {LEGACY_SCALES.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                          </select>
                        )}
                      </div>
                    </div>
                    {instructions && (
                      <button
                        onClick={() => setExpanded(expanded === i ? null : i)}
                        className="shrink-0 rounded-lg p-1.5 text-gray-400 transition hover:bg-white/5 hover:text-gray-200"
                        aria-label="Ver detalles"
                      >
                        <ChevronDown className={`h-4 w-4 transition ${expanded === i ? 'rotate-180' : ''}`} />
                      </button>
                    )}
                  </div>
                  {expanded === i && instructions && (
                    <div className="border-t border-white/10 px-4 py-3 text-xs text-gray-300">{instructions}</div>
                  )}
                  {isV2 && substitutionMovement === movementId && (
                    <CrossfitSubstitutionPanel
                      movement={m}
                      loading={substitutionLoading}
                      error={substitutionError}
                      onCancel={() => setSubstitutionMovement(null)}
                      onSubmit={(input) => handleSubstitution(m, input)}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        {/* Pie */}
        <div className="border-t border-white/10 px-5 py-4">
          {isV2 && showEarlyFinish && (
            <div className="mb-4 rounded-xl border border-amber-400/20 bg-amber-500/5 p-3">
              <p className="text-xs font-semibold text-amber-100">¿Cómo termina esta sesión?</p>
              <p className="mt-1 text-[11px] text-gray-400">El feedback posterior es obligatorio y el historial no se podrá reescribir.</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <button
                  type="button"
                  disabled={runtime.timerState === 'idle'}
                  onClick={() => handleFinish('partial')}
                  className="rounded-lg border border-white/10 px-3 py-2 text-xs text-gray-200 hover:bg-white/5 disabled:opacity-40"
                >
                  Guardar parcial
                </button>
                <button
                  type="button"
                  disabled={runtime.timerState === 'idle'}
                  onClick={() => handleFinish('abandoned')}
                  className="rounded-lg border border-orange-400/30 px-3 py-2 text-xs text-orange-100 hover:bg-orange-400/10 disabled:opacity-40"
                >
                  Abandonar WOD
                </button>
                <button
                  type="button"
                  onClick={() => handleFinish('cancelled')}
                  className="rounded-lg border border-red-400/30 px-3 py-2 text-xs text-red-100 hover:bg-red-400/10"
                >
                  Cancelar sesión
                </button>
              </div>
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <button onClick={onClose} className="rounded-xl px-3 py-2 text-sm text-gray-400 transition hover:text-gray-200">
              Salir y reanudar después
            </button>
            <div className="flex items-center gap-2">
              {isV2 && (
                <button
                  type="button"
                  onClick={() => setShowEarlyFinish((current) => !current)}
                  disabled={finished || substitutionLoading || runtime.pendingCount > 0}
                  className="rounded-xl border border-white/10 px-3 py-2.5 text-sm text-gray-300 transition hover:bg-white/5 disabled:opacity-40"
                >
                  Finalizar antes
                </button>
              )}
              <button
                onClick={() => handleFinish()}
                disabled={finished || substitutionLoading || (isV2 && runtime.pendingCount > 0)}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 px-5 py-2.5 text-sm font-semibold text-black transition hover:from-yellow-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Flag className="h-4 w-4" />
                {finished ? 'Pendiente de feedback' : 'Terminar WOD'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
