// Configuración de cierre de sesión por metodología (ARCH-002).
// Extraído de TodayTrainingTab.jsx: helpers puros, sin estado ni props.

// Endpoint de "session-result"/"wod-result" por clave de metodología.
export const EFFORT_ENDPOINTS = {
  calistenia: '/methodology-session/calistenia/session-result',
  casa: '/methodology-session/casa/session-result',
  funcional: '/methodology-session/funcional/session-result',
  crossfit: '/methodology-session/crossfit/wod-result',
  halterofilia: '/methodology-session/halterofilia/session-result',
  powerlifting: '/methodology-session/powerlifting/session-result',
  'heavy-duty': '/methodology-session/heavy-duty/session-result',
};

// Normaliza la cadena de metodología del plan a una clave de cierre.
// Tolerante a variantes ('Heavy Duty'/'heavy_duty', 'Gimnasio'→funcional, etc.).
export function resolveEffortMethodKey(raw) {
  const m = String(raw || '').toLowerCase();
  if (!m) return null;
  if (m.includes('calistenia')) return 'calistenia';
  if (m.includes('crossfit') || m.includes('cross-fit') || m.includes('cross fit')) return 'crossfit';
  if (m.includes('halterofilia') || m.includes('weightlifting')) return 'halterofilia';
  if (m.includes('powerlifting') || m.includes('power lifting')) return 'powerlifting';
  if (m.includes('heavy')) return 'heavy-duty';
  if (m.includes('funcional') || m.includes('functional') || m.includes('gimnasio')) return 'funcional';
  if (m.includes('casa') || m.includes('home')) return 'casa';
  return null; // hipertrofia y desconocidos: sin modal de esfuerzo común
}
