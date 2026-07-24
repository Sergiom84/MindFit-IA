import { useCallback, useEffect, useRef, useState } from 'react';

import { sendCrossfitRuntimeItem } from './runtimeApi.js';
import {
  acknowledgeCrossfitRuntimeItem,
  createCrossfitRuntimeState,
  crossfitRuntimeStorageKey,
  currentCrossfitElapsed,
  discardRejectedCrossfitSubstitution,
  hydrateCrossfitRuntimeState,
  queueCrossfitSubstitution,
  queueCrossfitTimerAction,
  withCrossfitRuntimeSyncError
} from './runtimeState.js';

function readStoredState(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}

function writeStoredState(key, state) {
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // El estado sigue vivo en memoria; el UI informa si la cola no puede sincronizar.
  }
}

export default function useCrossfitWodRuntime({
  enabled,
  sessionId,
  movementIds,
  timeCapSeconds,
  onStartSession
}) {
  const options = { sessionId, movementIds, timeCapSeconds };
  const [runtime, setRuntime] = useState(() => createCrossfitRuntimeState(options));
  const [clock, setClock] = useState(Date.now());
  const runtimeRef = useRef(runtime);
  const flushPromiseRef = useRef(null);
  const storageKey = crossfitRuntimeStorageKey(sessionId);
  const movementSignature = movementIds.join('|');

  const commit = useCallback((next) => {
    runtimeRef.current = next;
    setRuntime(next);
    if (enabled) writeStoredState(crossfitRuntimeStorageKey(next.session_id), next);
    return next;
  }, [enabled]);

  const flushPending = useCallback(async () => {
    if (!enabled || !sessionId) return runtimeRef.current.pending.length === 0;
    if (flushPromiseRef.current) await flushPromiseRef.current;
    if (runtimeRef.current.pending.length === 0) return true;
    const task = (async () => {
      while (runtimeRef.current.pending.length > 0) {
        const item = runtimeRef.current.pending[0];
        try {
          const response = await sendCrossfitRuntimeItem(sessionId, item);
          if (response?.queued) return false;
          commit(acknowledgeCrossfitRuntimeItem(
            runtimeRef.current,
            item.body.idempotency_key,
            response
          ));
        } catch (error) {
          const withoutRejected = item.kind === 'substitution' && error.retryable === false
            ? discardRejectedCrossfitSubstitution(runtimeRef.current, item.body.idempotency_key)
            : runtimeRef.current;
          commit(withCrossfitRuntimeSyncError(withoutRejected, error));
          return false;
        }
      }
      return true;
    })();
    flushPromiseRef.current = task;
    try {
      return await task;
    } finally {
      if (flushPromiseRef.current === task) flushPromiseRef.current = null;
    }
  }, [commit, enabled, sessionId]);

  useEffect(() => {
    const currentOptions = {
      sessionId,
      movementIds: movementSignature ? movementSignature.split('|') : [],
      timeCapSeconds
    };
    const next = enabled
      ? hydrateCrossfitRuntimeState(readStoredState(storageKey), currentOptions)
      : createCrossfitRuntimeState(currentOptions);
    commit(next);
  }, [commit, enabled, movementSignature, sessionId, storageKey, timeCapSeconds]);

  useEffect(() => {
    if (!enabled) return undefined;
    const handleOnline = () => void flushPending();
    window.addEventListener('online', handleOnline);
    window.addEventListener('connectionOnline', handleOnline);
    void flushPending();
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('connectionOnline', handleOnline);
    };
  }, [enabled, flushPending]);

  useEffect(() => {
    if (!enabled || runtime.timer.state !== 'running') return undefined;
    const interval = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [enabled, runtime.timer.state]);

  const start = useCallback(async () => {
    if (!enabled) return false;
    if (runtimeRef.current.timer.state === 'idle' && typeof onStartSession === 'function') {
      await onStartSession();
    }
    commit(queueCrossfitTimerAction(runtimeRef.current, 'start'));
    void flushPending();
    return true;
  }, [commit, enabled, flushPending, onStartSession]);

  const pause = useCallback(async () => {
    if (!enabled) return false;
    commit(queueCrossfitTimerAction(runtimeRef.current, 'pause'));
    return flushPending();
  }, [commit, enabled, flushPending]);

  const reset = useCallback(async () => {
    if (!enabled) return false;
    commit(queueCrossfitTimerAction(runtimeRef.current, 'reset'));
    return flushPending();
  }, [commit, enabled, flushPending]);

  const substitute = useCallback(async (movementId, input) => {
    if (!enabled) return { synced: false };
    commit(queueCrossfitSubstitution(runtimeRef.current, { movementId, ...input }));
    const synced = await flushPending();
    return {
      synced,
      substitution: runtimeRef.current.substitutions[String(movementId)] ?? null,
      error: runtimeRef.current.sync_error
    };
  }, [commit, enabled, flushPending]);

  return {
    elapsedSeconds: currentCrossfitElapsed(runtime, clock),
    running: runtime.timer.state === 'running'
      && currentCrossfitElapsed(runtime, clock) < runtime.timer.time_cap_seconds,
    timerState: runtime.timer.state,
    scales: runtime.scales,
    substitutions: runtime.substitutions,
    pendingCount: runtime.pending.length,
    syncError: runtime.sync_error,
    start,
    pause,
    reset,
    substitute,
    ensureSynced: flushPending
  };
}
