/**
 * 🧭 Assessment determinista de Calistenia (PR-CAL-01 Subfase C).
 *
 * Cierra el NIVEL y un GATE DE SEGURIDAD con reglas puras (sin BD, sin IA). La IA pasa a EXPLICAR
 * este resultado ya cerrado (`requires_ai_explanation`), nunca a decidirlo; si la IA falla, el
 * assessment se devuelve tal cual, sin prosa.
 *
 * Reglas (spec §5.2 reconstruida; sign-off de Sergio 2026-07-23):
 *  - Nivel efectivo = skill demostrado > self-report validado. La EXPERIENCIA declarada NUNCA
 *    eleva el nivel por sí sola (sin self-report/skill válidos → insufficient_data).
 *  - Lesión declarada activa = patrón limitante + cap a 'intermedio' (nunca 'avanzado') + confianza
 *    ≤ media. Se reutiliza `injuryContraindications` (zonas: hombro/lumbar/rodilla/muñeca/tobillo/codo).
 *  - Dolor AGUDO / contraindicación seria → `decision:'refer'`, `level:null`, gate NO pasa (no se
 *    prescribe; se deriva a valoración profesional).
 *  - Datos insuficientes → `decision:'insufficient_data'`, `level:null`, confianza 'low' (honesto:
 *    "no lo sé"; el consumidor aplica su default seguro por su cuenta).
 *
 * @module routineGeneration/methodologies/calisteniaAssessment
 */
import { extractInjuryText, activeInjuryRules } from '../injuryContraindications.js';
import { normalizeMethodologyLevel } from './methodologyRegistry.js';
import { logger } from '../logger.js';

export const CALISTHENICS_ASSESSMENT_VERSION = 'calisthenics-assessment/v1';

/**
 * ¿Está activo el assessment determinista? Flag de rollback (PR-CAL-01: el assessment determinista
 * es la AUTORIDAD por defecto; el flag existe solo para volver a la lectura legacy si hiciera falta).
 * Ausente → true (nuevo default). 'true'/'1' (case-insensitive) → true. 'false'/'0' → false
 * (rollback explícito). Cualquier otro valor (typo) → false + warning: un valor no reconocido NUNCA
 * debe activar el comportamiento nuevo por accidente, pero tampoco debe fallar en silencio.
 * @param {Record<string,string|undefined>} [env]
 * @returns {boolean}
 */
export function isCalisthenicsAssessmentEnabled(env = process.env) {
  const rawValue = env?.CALISTHENICS_ASSESSMENT_V1_ENABLED;
  if (rawValue === undefined) return true;
  const raw = String(rawValue).toLowerCase().trim();
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  logger.warn(
    `⚠️ CALISTHENICS_ASSESSMENT_V1_ENABLED='${rawValue}' no reconocido; usando 'false' (legacy) por seguridad.`
  );
  return false;
}

const LEVEL_ORDER = ['principiante', 'intermedio', 'avanzado'];
const INJURY_LEVEL_CAP = 'intermedio';

/** Limita `level` para que no supere `maxLevel` según el orden canónico. */
function capLevel(level, maxLevel) {
  const i = LEVEL_ORDER.indexOf(level);
  const cap = LEVEL_ORDER.indexOf(maxLevel);
  if (i < 0 || cap < 0) return level;
  return i > cap ? maxLevel : level;
}

/**
 * Evalúa el perfil de calistenia de forma determinista.
 * @param {object} [input]
 * @param {string} [input.selfReportedLevel] nivel autoevaluado (frontend/usuario)
 * @param {string} [input.demonstratedLevel] nivel respaldado por evidencia de skill (manda sobre el self-report)
 * @param {number} [input.experienceYears] años declarados (NO elevan el nivel por sí solos)
 * @param {string} [input.injuryText] texto de lesiones/limitaciones (si se omite/vacío, se extrae de
 *   limitaciones_fisicas/limitaciones/lesiones del input; nunca se pierde una lesión declarada).
 *   Cobertura de patrones = zonas de injuryContraindications (hombro/lumbar/rodilla/muñeca/tobillo/
 *   codo); una lesión en zona no mapeada NO capa el nivel (limitación heredada del filtro compartido).
 * @param {string} [input.painStatus] 'none'|'stable'|'increasing'|'acute'. SOLO 'acute' dispara
 *   'refer' aquí; el bloqueo por dolor 'increasing' es de la política de progresión (CAL-04), no del gate.
 * @returns {{decision:'ok'|'insufficient_data'|'refer', level:string|null, confidence:'low'|'medium'|'high', limiting_patterns:string[], safety_gate:{passed:boolean, reasons:string[]}, reasons:string[], requires_ai_explanation:boolean, version:string}}
 */
export function assessCalistenia(input = {}) {
  const src = input || {};
  const selfLevel = normalizeMethodologyLevel('calistenia', src.selfReportedLevel);
  const demoLevel = normalizeMethodologyLevel('calistenia', src.demonstratedLevel);
  const painStatus = typeof src.painStatus === 'string' ? src.painStatus.toLowerCase().trim() : null;

  // Patrones limitantes desde las lesiones declaradas (reusa el filtro compartido).
  // Hardening H1/H2 (revisión adversarial): NUNCA perder una lesión declarada. Se combina el
  // canal directo `injuryText` (string u array) con los campos de perfil (limitaciones_fisicas/
  // limitaciones/lesiones vía extractInjuryText). Un `injuryText` vacío o de tipo raro NO suprime
  // las lesiones declaradas en otros campos.
  const directInjury = typeof src.injuryText === 'string'
    ? src.injuryText
    : Array.isArray(src.injuryText)
      ? src.injuryText.filter(Boolean).join('. ')
      : '';
  const injuryText = [directInjury, extractInjuryText(src)]
    .filter((t) => typeof t === 'string' && t.trim())
    .join('. ');
  const limiting_patterns = activeInjuryRules(injuryText).map((r) => r.zona);
  const hasInjury = limiting_patterns.length > 0;

  // 1) Gate de seguridad duro: dolor agudo → derivar, no prescribir.
  if (painStatus === 'acute') {
    return {
      decision: 'refer',
      level: null,
      confidence: 'high',
      limiting_patterns,
      safety_gate: { passed: false, reasons: ['dolor_agudo_declarado'] },
      reasons: ['Dolor agudo declarado: derivar a valoración profesional antes de entrenar.'],
      requires_ai_explanation: true,
      version: CALISTHENICS_ASSESSMENT_VERSION
    };
  }

  // 2) Nivel efectivo: skill demostrado manda; si no, self-report. La experiencia NO eleva sola.
  const baseLevel = demoLevel || selfLevel;
  if (!baseLevel) {
    return {
      decision: 'insufficient_data',
      level: null,
      confidence: 'low',
      limiting_patterns,
      safety_gate: { passed: true, reasons: [] },
      reasons: [
        'Sin nivel autoevaluado válido ni evidencia de skill; la experiencia declarada no eleva el nivel por sí sola.'
      ],
      requires_ai_explanation: true,
      version: CALISTHENICS_ASSESSMENT_VERSION
    };
  }

  // 3) Cap por lesión: nunca 'avanzado' con contraindicación activa.
  const level = hasInjury ? capLevel(baseLevel, INJURY_LEVEL_CAP) : baseLevel;

  // 4) Confianza: 'high' solo con evidencia de skill y sin lesión; en otro caso 'medium'.
  const confidence = demoLevel && !hasInjury ? 'high' : 'medium';

  const reasons = [
    demoLevel
      ? 'Nivel corroborado por evidencia de skill.'
      : 'Nivel basado en autoevaluación (sin evidencia de skill).'
  ];
  if (hasInjury) {
    reasons.push(
      `Nivel limitado por lesión declarada (${limiting_patterns.join(', ')}); no se sube por rendimiento.`
    );
  }

  return {
    decision: 'ok',
    level,
    confidence,
    limiting_patterns,
    safety_gate: {
      passed: true,
      reasons: hasInjury ? limiting_patterns.map((z) => `contraindicacion_${z}`) : []
    },
    reasons,
    requires_ai_explanation: true,
    version: CALISTHENICS_ASSESSMENT_VERSION
  };
}
