/**
 * 🧭 TraceContext - Proveedor de trazas en tiempo real para UI
 * - Escucha CustomEvent('uiTrace') y mantiene una cola en memoria
 * - Expone track/clear/pause y la lista de eventos
 * - Pensado para usarse junto con TraceConsole (panel flotante)
 */

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import TraceUtil, { track as baseTrack, getRecentTraces, clearTraces as clearStore } from '../utils/trace';

const TraceContext = createContext({
  track: () => {},
  events: [],
  paused: false,
  setPaused: () => {},
  clear: () => {},
});

export const useTrace = () => useContext(TraceContext);

export const TraceProvider = ({ children }) => {
  const [events, setEvents] = useState(() => getRecentTraces(200));
  const [paused, setPaused] = useState(false);
  const bufferRef = useRef(events);
  bufferRef.current = events;

  useEffect(() => {
    function onUiTrace(e) {
      if (paused) return;
      const rec = e.detail;
      setEvents((prev) => {
        const next = [...prev, rec];
        if (next.length > 300) next.shift();
        return next;
      });
    }

    window.addEventListener('uiTrace', onUiTrace);
    return () => window.removeEventListener('uiTrace', onUiTrace);
  }, [paused]);

  const track = useMemo(() => (event, data = {}, ctx = {}) => baseTrack(event, data, ctx), []);

  const clear = () => {
    clearStore();
    setEvents([]);
  };

  const value = useMemo(() => ({ track, events, paused, setPaused, clear }), [track, events, paused]);

  return (
    <TraceContext.Provider value={value}>
      {children}
    </TraceContext.Provider>
  );
};

export default TraceContext;

