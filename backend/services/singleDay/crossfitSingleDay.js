/**
 * Generación de entrenamiento de "día único" (WOD) para CrossFit.
 *
 * Sigue el mismo patrón que calisteniaSingleDay.js / HipertrofiaV2 (single-day),
 * pero produce UN WOD del día en vez de una lista de ejercicios por series.
 * Reutiliza la persistencia genérica persistSingleDaySession para que el guardado
 * de progreso y el histórico funcionen igual que en el resto de metodologías; el
 * reproductor específico (WodSessionModal) se selecciona por disciplina en el
 * frontend.
 *
 * ── Fase 0: Contrato de "sesión WOD" ─────────────────────────────────────────
 * El generador produce (y el player consume) un descriptor de WOD así:
 *
 *   wod = {
 *     formato: 'amrap' | 'emom' | 'for_time' | 'chipper',
 *     time_cap_min: number,        // minutos de tope
 *     rounds: number | null,       // rondas fijas (for_time) o null (amrap)
 *     dominio_principal: string,   // foco del WOD ('Mixto' en full body)
 *     movimientos: [{
 *       nombre, dominio, exercise_id,
 *       reps,                      // texto: '12 reps', '15 cal', '200 m'…
 *       escala_rx, escala_scaled,  // pautas de escalado RX / Scaled
 *       duracion_seg, como_hacerlo, notas
 *     }]
 *   }
 *
 * El log post-WOD (Fase 4) registra: resultado_tipo (tiempo|rounds+reps), valor,
 * rpe (1-10) y escala_usada (scaled|rx|rx+).
 */

import { persistSingleDaySession } from './persistSingleDaySession.js';
import { logger } from '../hipertrofiaV2/logger.js';
import { getCrossfitFeatureFlags } from '../crossfit/featureFlags.js';
import { generateCrossfitSingleDayV2 } from '../crossfit/integration/singleDayService.js';

// Dominios reales en "Ejercicios_CrossFit".
const DOMAINS = ['Weightlifting', 'Gymnastic', 'Monostructural', 'Accesorios'];

// Jerarquía de niveles (acumulativa) tal y como la usa CrossFitService.
const LEVEL_HIERARCHY = ['Principiante', 'Intermedio', 'Avanzado', 'Elite'];

const NIVEL_NORMALIZED = {
  Principiante: 'basico',
  Intermedio: 'intermedio',
  Avanzado: 'avanzado',
  Elite: 'avanzado'
};

// Formatos de WOD disponibles con su tope de tiempo por defecto.
const WOD_FORMATS = {
  amrap: { formato: 'amrap', time_cap_min: 12, rounds: null, label: 'AMRAP 12 min' },
  for_time: { formato: 'for_time', time_cap_min: 15, rounds: 5, label: 'For Time (5 rondas)' },
  emom: { formato: 'emom', time_cap_min: 12, rounds: null, label: 'EMOM 12 min' },
  chipper: { formato: 'chipper', time_cap_min: 18, rounds: 1, label: 'Chipper' }
};

// Cuántos movimientos por formato.
const MOVEMENTS_BY_FORMAT = { amrap: 3, for_time: 3, emom: 4, chipper: 5 };

/**
 * Normaliza el nivel recibido a una clave de LEVEL_HIERARCHY.
 */
function normalizeLevel(rawLevel) {
  const lvl = String(rawLevel || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  if (lvl.includes('elite')) return 'Elite';
  if (lvl.includes('avanz')) return 'Avanzado';
  if (lvl.includes('inter')) return 'Intermedio';
  return 'Principiante';
}

/**
 * Niveles acumulativos: para 'Intermedio' devuelve ['Principiante','Intermedio'].
 */
function getAccumulativeLevels(nivel) {
  const idx = LEVEL_HIERARCHY.indexOf(nivel);
  return LEVEL_HIERARCHY.slice(Math.max(0, idx - 1), idx + 1); // ventana deslizante: nivel + 1 por debajo (no acumula desde principiante)
}

/**
 * Elige el formato del WOD. Si focusGroup es un formato válido lo respeta;
 * si es un dominio o vacío, elige uno al azar.
 */
function resolveFormat(focusGroup) {
  const key = String(focusGroup || '').toLowerCase().replace(/\s+/g, '_');
  if (WOD_FORMATS[key]) return WOD_FORMATS[key];
  const keys = Object.keys(WOD_FORMATS);
  return WOD_FORMATS[keys[Math.floor(Math.random() * keys.length)]];
}

/**
 * Reps/medida por defecto de un movimiento según formato y dominio.
 */
function repsForMovement(formato, dominio) {
  const d = String(dominio || '').toLowerCase();
  if (d.includes('mono')) {
    if (formato === 'emom') return '12 cal';
    return formato === 'chipper' ? '400 m / 30 cal' : '200 m / 15 cal';
  }
  if (d.includes('weight')) {
    if (formato === 'emom') return '8 reps';
    return formato === 'chipper' ? '21-15-9' : '10 reps';
  }
  if (d.includes('gym')) {
    if (formato === 'emom') return '10 reps';
    return formato === 'chipper' ? '30 reps' : '12 reps';
  }
  // Accesorios u otros
  return formato === 'emom' ? '12 reps' : '15 reps';
}

/**
 * Selecciona movimientos para el WOD según el foco (dominio) o mezcla.
 * Devuelve `count` filas evitando repetir nombres.
 */
async function selectMovements(dbClient, { niveles, count, focusDomain = null }) {
  // Orden de dominios a recorrer: si hay foco, ese dominio primero y repetido.
  let domainOrder;
  if (focusDomain) {
    domainOrder = [focusDomain, ...DOMAINS.filter((d) => d !== focusDomain)];
  } else {
    // Mezcla equilibrada (un WOD metcon típico).
    domainOrder = ['Weightlifting', 'Gymnastic', 'Monostructural', 'Accesorios', 'Gymnastic'];
  }

  const chosen = [];
  const usedNames = [];

  for (const dominio of domainOrder) {
    if (chosen.length >= count) break;
    // Si hay foco, permitimos coger varios del dominio principal.
    const take = focusDomain && dominio === focusDomain ? count : 1;
    const params = [dominio, niveles];
    let exclude = '';
    if (usedNames.length > 0) {
      params.push(usedNames);
      exclude = `AND nombre <> ALL($${params.length})`;
    }
    params.push(Math.min(take, count - chosen.length));
    const limitPlaceholder = `$${params.length}`;

    const { rows } = await dbClient.query(`
      SELECT exercise_id, nombre, nivel, dominio, categoria, equipamiento,
             tipo_wod, intensidad, duracion_seg, descanso_seg,
             escalamiento, notas, rx_carga_sugerida,
             "Cómo_hacerlo" AS como_hacerlo, gif_url
        FROM "Ejercicios_CrossFit"
       WHERE dominio = $1
         AND nivel = ANY($2::text[])
         ${exclude}
       ORDER BY RANDOM()
       LIMIT ${limitPlaceholder}
    `, params);

    chosen.push(...rows);
    usedNames.push(...rows.map((r) => r.nombre));
  }

  return chosen.slice(0, count);
}

/**
 * Mapea una fila de Ejercicios_CrossFit a un movimiento del WOD + ejercicio
 * de reproducción (compatible con persistSingleDaySession / tracking).
 */
function toWodMovement(row, orden, formato) {
  const reps = repsForMovement(formato, row.dominio);
  return {
    orden,
    id: row.exercise_id,
    exercise_id: row.exercise_id,
    nombre: row.nombre,
    categoria: row.categoria || row.dominio,
    dominio: row.dominio,
    tipo_ejercicio: 'crossfit',
    equipamiento: row.equipamiento || null,
    // Campos WOD
    reps,
    escala_rx: row.rx_carga_sugerida || 'RX',
    escala_scaled: row.escalamiento || 'Versión escalada (reduce carga/reps)',
    duracion_seg: row.duracion_seg ?? null,
    intensidad: row.intensidad || null,
    // Compatibilidad con el modelo de series del persistidor/tracking
    series: 1,
    reps_objetivo: reps,
    series_reps_objetivo: reps,
    descanso_seg: row.descanso_seg ?? 0,
    como_hacerlo: row.como_hacerlo || null,
    notas: row.notas || '',
    gif_url: row.gif_url || null
  };
}

/**
 * Genera un WOD de día único de CrossFit y lo persiste.
 *
 * @param {object} dbClient
 * @param {number} userId
 * @param {string} rawNivel
 * @param {boolean} isWeekendExtra
 * @param {object} options - { selectionMode: 'full_body'|'focus', focusGroup }
 * @returns {Promise<{sessionId:number, workout:object}>}
 */
export async function generateCrossFitSingleDay(dbClient, userId, rawNivel, isWeekendExtra = true, options = {}) {
  if (getCrossfitFeatureFlags().generation) {
    return generateCrossfitSingleDayV2({
      db: dbClient,
      userId,
      options: { ...options, isWeekendExtra }
    });
  }
  const { selectionMode = 'full_body', focusGroup = null } = options || {};
  const nivel = normalizeLevel(rawNivel);
  const niveles = getAccumulativeLevels(nivel);

  logger.info('🏋️ [CROSSFIT-SINGLE-DAY] Generando para usuario:', userId, 'Nivel:', nivel, 'Modo:', selectionMode, 'Foco:', focusGroup);

  const isFocus = selectionMode === 'focus' && !!focusGroup;
  const formatSpec = resolveFormat(focusGroup);
  const formato = formatSpec.formato;

  // Si el foco es un dominio (no un formato), lo usamos para sesgar la selección.
  const focusDomain = isFocus && DOMAINS.includes(focusGroup) ? focusGroup : null;

  const count = MOVEMENTS_BY_FORMAT[formato] || 3;
  let rows = await selectMovements(dbClient, { niveles, count, focusDomain });

  // Fallback: completar con cualquier dominio si faltan movimientos.
  if (rows.length < Math.min(3, count)) {
    logger.warn(`⚠️ [CROSSFIT-SINGLE-DAY] Solo ${rows.length} movimientos; aplicando fallback.`);
    const usedNames = rows.map((r) => r.nombre);
    const params = [niveles];
    let exclude = '';
    if (usedNames.length > 0) {
      params.push(usedNames);
      exclude = `AND nombre <> ALL($${params.length})`;
    }
    params.push(count - rows.length);
    const { rows: extra } = await dbClient.query(`
      SELECT exercise_id, nombre, nivel, dominio, categoria, equipamiento,
             tipo_wod, intensidad, duracion_seg, descanso_seg,
             escalamiento, notas, rx_carga_sugerida,
             "Cómo_hacerlo" AS como_hacerlo, gif_url
        FROM "Ejercicios_CrossFit"
       WHERE nivel = ANY($1::text[])
         ${exclude}
       ORDER BY RANDOM()
       LIMIT $${params.length}
    `, params);
    rows = rows.concat(extra);
  }

  if (rows.length === 0) {
    throw new Error('No se encontraron movimientos de CrossFit para el nivel seleccionado');
  }

  const movimientos = rows.map((row, idx) => toWodMovement(row, idx + 1, formato));

  // Descriptor del WOD (Fase 0).
  const wod = {
    formato,
    time_cap_min: formatSpec.time_cap_min,
    rounds: formatSpec.rounds,
    label: formatSpec.label,
    dominio_principal: focusDomain || (isFocus ? focusGroup : 'Mixto'),
    movimientos: movimientos.map((m) => ({
      orden: m.orden,
      exercise_id: m.exercise_id,
      nombre: m.nombre,
      dominio: m.dominio,
      reps: m.reps,
      escala_rx: m.escala_rx,
      escala_scaled: m.escala_scaled,
      duracion_seg: m.duracion_seg,
      como_hacerlo: m.como_hacerlo,
      notas: m.notas
    }))
  };

  const focusLabel = focusDomain || focusGroup || formatSpec.label;
  const sessionLabel = isFocus
    ? `WOD ${focusLabel} - Sesión de Hoy`
    : `WOD del Día (${formatSpec.label})`;
  const planLabel = isFocus
    ? `WOD de ${focusLabel} - CrossFit`
    : 'WOD de CrossFit - Hoy';

  const { sessionId } = await persistSingleDaySession(dbClient, {
    userId,
    nivel,
    nivelNormalized: NIVEL_NORMALIZED[nivel] || 'basico',
    methodologyType: 'crossfit',
    exercises: movimientos,
    selectionMode,
    focusGroup: isFocus ? focusGroup : null,
    sessionLabel,
    planLabel,
    isWeekendExtra,
    extraSessionMetadata: { wod }
  });

  logger.info('✅ [CROSSFIT-SINGLE-DAY] WOD generado:', sessionId, 'Formato:', formato, 'Movimientos:', movimientos.length);

  return {
    sessionId,
    workout: {
      id: sessionId,
      type: isFocus ? 'crossfit-focus-single' : 'crossfit-wod-single',
      nivel,
      discipline: 'crossfit',
      wod,
      exercises_count: movimientos.length,
      exercises: movimientos
    }
  };
}
