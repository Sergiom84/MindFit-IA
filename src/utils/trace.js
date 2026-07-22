/**
 * 📍 Trace Utility - Eventos de UI en tiempo real
 * - Emite CustomEvent('uiTrace') para que un panel pueda mostrarlos al vuelo
 * - Persiste un buffer circular en localStorage (TRACE_EVENTS)
 * - Intenta capturar archivo/línea desde el stack en modo dev
 */

import { createContextLogger } from './logger';

const IS_DEV = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV;
const STORAGE_KEY = 'TRACE_EVENTS';
const MAX_EVENTS = 500;

function getCallerFromStack() {
  try {
    const err = new Error();
    const stack = (err.stack || '').split('\n').slice(2, 8).join('\n');
    // Heurística: buscar primero "(...src/...)" o "at ...src/...:line:col"
    const m1 = stack.match(/\(([^)]+src\/[^)]+)\)/);
    const m2 = !m1 && stack.match(/at\s+([^\s]*src\/[^\s:]+:\d+:\d+)/);
    const match = m1 || m2;
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function persistEvent(rec) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const prev = raw ? JSON.parse(raw) : [];
    const next = [...prev, rec].slice(-MAX_EVENTS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignorar errores de storage
  }
}

export function track(event, data = {}, ctx = {}) {
  const file = ctx.file || (IS_DEV ? getCallerFromStack() : undefined);
  const record = {
    ts: Date.now(),
    event,
    data,
    ctx: {
      component: ctx.component,
      file,
      note: ctx.note,
    }
  };

  // Log en consola en dev para feedback inmediato
  if (IS_DEV) {
    const clog = createContextLogger(ctx.component || 'TRACE');
    clog.info(`EVENT ${event}`, { ...data, file });
  }

  // Persistir buffer y emitir evento global
  persistEvent(record);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('uiTrace', { detail: record }));
  }

  return record;
}

export function getRecentTraces(limit = 200) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const prev = raw ? JSON.parse(raw) : [];
    return prev.slice(-limit);
  } catch {
    return [];
  }
}

export function clearTraces() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) { console.warn('Trace error:', e); }
}

// Pequeña ayuda para envolver handlers
export function withTrace(handler, meta = {}) {
  return (...args) => {
    try {
      track(meta.event || 'HANDLER', meta.data, { component: meta.component, note: meta.note });
    } catch (e) { console.warn('Trace error:', e); }
    return handler?.(...args);
  };
}

export default { track, getRecentTraces, clearTraces, withTrace };

