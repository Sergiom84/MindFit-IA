/**
 * Contención P0 del timing de carbohidratos (doc 04, Nutrición Fase 0, §14).
 *
 * Hasta corregir cantidades y mensajes (PR2+, cálculo desde catálogo real §14.5), NO se
 * muestran recomendaciones personalizadas numéricas de carbTiming. El flag está APAGADO
 * por defecto: mientras lo esté, los endpoints devuelven una respuesta educativa sin
 * gramos (§14.4), en vez de números derivados de divisores mágicos, peso inventado de
 * 75 kg, metodología por defecto Hipertrofia y cuenta atrás de "ventana anabólica".
 */

/** ¿Está habilitada la recomendación personalizada numérica? Por defecto NO. */
export function isCarbTimingPersonalizedEnabled() {
  const raw = String(process.env.CARB_TIMING_PERSONALIZED_ENABLED ?? 'false').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

/** Reason code de la respuesta educativa temporal (§14.4). */
export const PERSONALIZED_TIMING_PENDING_REASON = 'PERSONALIZED_TIMING_PENDING_VALIDATION';

/**
 * Respuesta educativa segura (§14.4): contexto pre/post SIN gramos ni urgencia.
 * @param {object} [extra] campos adicionales (p. ej. contexto de metodología del plan).
 */
export function buildEducationalTimingResponse(extra = {}) {
  return {
    success: true,
    mode: 'educational',
    personalized: false,
    guidance: [
      'Prioriza el total diario y una comida tolerable alrededor del entrenamiento.',
      'La reposición rápida cobra más importancia si hay otra sesión exigente en pocas horas.'
    ],
    reason_code: PERSONALIZED_TIMING_PENDING_REASON,
    ...extra
  };
}
