// PERF-001: instrumentación de Web Vitals (LCP, INP, CLS, FCP, TTFB).
// En dev se registran en consola; en prod se pueden enviar a analítica (hook `report`).
// Umbrales "good" según web.dev para clasificar cada métrica.
import { onCLS, onINP, onLCP, onFCP, onTTFB } from 'web-vitals';

const THRESHOLDS = { LCP: 2500, INP: 200, CLS: 0.1, FCP: 1800, TTFB: 800 };

function rate(name, value) {
  const t = THRESHOLDS[name];
  if (t == null) return 'n/a';
  return value <= t ? 'good' : value <= t * 1.5 ? 'needs-improvement' : 'poor';
}

/**
 * Inicializa el reporte de Web Vitals.
 * @param {(metric:{name:string,value:number,rating:string})=>void} [report]
 *        callback opcional para enviar a analítica en producción.
 */
export function initWebVitals(report) {
  const handler = (metric) => {
    const enriched = { name: metric.name, value: metric.value, rating: rate(metric.name, metric.value) };
    if (import.meta.env.DEV) {
      console.log(`[web-vitals] ${enriched.name}: ${Math.round(enriched.value)} (${enriched.rating})`);
    }
    try { report?.(enriched); } catch { /* no romper por analítica */ }
  };
  onLCP(handler);
  onINP(handler);
  onCLS(handler);
  onFCP(handler);
  onTTFB(handler);
}
