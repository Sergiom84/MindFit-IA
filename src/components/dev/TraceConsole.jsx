/**
 * 🪟 TraceConsole - Panel flotante de trazas en tiempo real (solo dev)
 * - Muestra eventos emitidos por TraceContext/trace.js
 * - Filtro por texto, pausa, limpiar, copiar
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTrace } from '../../contexts/TraceContext';

const IS_DEV = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV;
const formatTime = (ts) => new Date(ts).toLocaleTimeString();

export default function TraceConsole() {
  const { events, clear, paused, setPaused } = useTrace();
  const [open, setOpen] = useState(() => (IS_DEV ? true : false));
  const [query, setQuery] = useState('');
  const containerRef = useRef(null);

  // Autoscroll si no está en pausa
  useEffect(() => {
    if (paused) return;
    const el = containerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [events, paused]);

  // Atajo teclado: Ctrl+~ para abrir/cerrar
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '`') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const filtered = useMemo(() => {
    if (!query) return events;
    const q = query.toLowerCase();
    return events.filter((e) => {
      try {
        const str = `${e.event} ${e.ctx?.component || ''} ${e.ctx?.file || ''} ${JSON.stringify(e.data || {})}`.toLowerCase();
        return str.includes(q);
      } catch {
        return false;
      }
    });
  }, [events, query]);

  if (!IS_DEV) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 text-sm">
      {/* Botón flotante */}
      {!open && (
        <button
          className="bg-yellow-500 hover:bg-yellow-600 text-black font-semibold px-3 py-2 rounded shadow"
          onClick={() => setOpen(true)}
          title="Abrir Trace Console (Ctrl+` )"
        >
          🐞 Trace
        </button>
      )}

      {/* Panel */}
      {open && (
        <div className="w-[36rem] max-h-[60vh] bg-gray-900/95 border border-gray-700 rounded-lg shadow-xl backdrop-blur overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 bg-gray-800 border-b border-gray-700">
            <div className="flex items-center gap-2">
              <span className="text-yellow-400">🪵</span>
              <span className="text-white font-semibold">Trace Console</span>
              <span className="text-gray-400 text-xs">({events.length})</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filtrar..."
                className="bg-gray-700 text-white text-xs px-2 py-1 rounded outline-none"
              />
              <button
                onClick={() => setPaused((p) => !p)}
                className={`px-2 py-1 rounded text-xs ${paused ? 'bg-blue-600' : 'bg-gray-700'} text-white`}
                title="Pausar/Reanudar autoscroll"
              >
                {paused ? 'Reanudar' : 'Pausar'}
              </button>
              <button
                onClick={clear}
                className="px-2 py-1 rounded text-xs bg-red-600 text-white"
                title="Limpiar buffer"
              >
                Limpiar
              </button>
              <button
                onClick={() => setOpen(false)}
                className="px-2 py-1 rounded text-xs bg-gray-600 text-white"
                title="Cerrar"
              >
                Cerrar
              </button>
            </div>
          </div>

          {/* Lista */}
          <div ref={containerRef} className="max-h-[50vh] overflow-auto divide-y divide-gray-800">
            {filtered.map((e, idx) => (
              <TraceRow key={e.ts + '-' + idx} rec={e} />
            ))}
            {filtered.length === 0 && (
              <div className="p-3 text-gray-400">Sin eventos que coincidan.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TraceRow({ rec }) {
  const time = formatTime(rec.ts);
  const summary = buildSummary(rec);
  return (
    <div className="p-3 text-gray-200 hover:bg-gray-800/70">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-400">{time}</span>
        <span className="text-yellow-400 font-semibold">{rec.event}</span>
        {rec.ctx?.component && (
          <span className="text-xs bg-gray-700 text-gray-200 px-2 py-0.5 rounded">{rec.ctx.component}</span>
        )}
        {rec.ctx?.file && (
          <span className="text-[10px] text-gray-400 truncate max-w-[18rem]" title={rec.ctx.file}>{rec.ctx.file}</span>
        )}
      </div>
      {summary && (
        <div className="mt-1 text-gray-300 text-xs whitespace-pre-wrap">
          {summary}
        </div>
      )}
    </div>
  );
}

function buildSummary(rec) {
  const { event, data = {} } = rec;
  if (event === 'BUTTON_CLICK') {
    return `Botón: ${data.id || data.label || 'desconocido'}  acción: ${data.action || 'click'}`;
  }
  if (event === 'NAVIGATE') {
    return `Ruta: ${data.path}  search: ${data.search || ''}`;
  }
  if (event === 'API_REQUEST') {
    return `API ➜ ${data.method || 'GET'} ${data.url}`;
  }
  if (event === 'API_RESPONSE') {
    return `API ⇦ status: ${data.status} ${data.url}`;
  }
  try {
    return JSON.stringify(data);
  } catch {
    return '';
  }
}

