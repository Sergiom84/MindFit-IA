/**
 * 🩹 Contraindicaciones por lesión/limitación física (compartido entre metodologías).
 *
 * Cada zona mapea:
 *  - `match`: regex sobre el texto de limitaciones_fisicas del perfil (detecta la zona).
 *  - `avoid`: regex sobre nombre/categoría/dominio/patrón del ejercicio (movimientos a EVITAR).
 *
 * IMPORTANTE: tanto el texto de lesiones como el del ejercicio se normalizan SIN
 * acentos y en minúsculas antes de aplicar los regex (por eso los patrones van sin
 * tildes). Sin esto, "Flexión" (con tilde) evadía el patrón /flexion/ y se colaban
 * movimientos contraindicados.
 *
 * Cubre movimientos de barra (CrossFit/fuerza) y de peso corporal (Calistenia),
 * por eso las listas son amplias. Es conservador a propósito: ante una lesión
 * declarada, mejor excluir de más que colar un movimiento peligroso.
 *
 * @module routineGeneration/injuryContraindications
 */

/** Normaliza a minúsculas y sin diacríticos (á→a, ñ→n, ó→o, ...). */
export function stripDiacritics(str = '') {
  try {
    return String(str).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  } catch {
    return String(str).toLowerCase();
  }
}

export const INJURY_CONTRAINDICATIONS = [
  {
    zona: 'hombro',
    match: /hombro|deltoid|manguito|rotador|shoulder|supraespinoso/,
    // C-02: 'encima de la cabeza' cubre variantes como "extensión de tríceps por
    // encima de la cabeza" que 'sobre cabeza' no atrapaba.
    avoid: /overhead|sobre.?cabeza|encima de la cabeza|por encima de la cabeza|snatch|arranc|jerk|press|thruster|hspu|handstand|pino|parada de mano|muscle.?up|kipping|wall.?ball|pull.?up|dominad|dip|fondos|push.?up|flexion|lagartija|plancha|planche|pike|pseudo|crow|cuervo|equilibrio\/soporte|hollow.*hold/
  },
  {
    zona: 'lumbar',
    match: /lumbar|espalda baja|zona baja|hernia|columna|discal|ciatic/,
    // C-02: la flexión lumbar cargada incluye crunch/encogimientos/sit-up, que no
    // estaban vetados (se colaba "Crunch con carga").
    avoid: /deadlift|peso muerto|good ?morning|buenos dias|clean|cargada|snatch|arranc|swing|kettlebell|box ?jump|salto al caj|thruster|overhead squat|sentadilla sobre|barbell row|remo con barra|hinge|bisagra|front lever|back lever|hollow|arch|superman|hiperextens|crunch|encogimiento|sit.?up|elevacion de tronco|elevacion de piernas|leg raise|toes ?to ?bar|pies a barra|l-?sit|dragon flag/
  },
  {
    zona: 'rodilla',
    match: /rodilla|menisco|ligament|lca|lcp|patel|knee/,
    // C-02: la sentadilla búlgara / split squat es una zancada unilateral y debe
    // vetarse igual que 'lunge'/'zancada' (se colaba "Sentadilla búlgara").
    avoid: /box ?jump|salto|pistol|squat ?jump|sentadilla con salto|lunge|zancada|bulgar|split.?squat|wall.?ball|thruster|running|carrera|fartlek|intervalos|double.?under|comba|shrimp|sissy|step.?up|subida al caj/,
    // Contraindicación BLANDA: movimientos relevantes/inevitables que se MANTIENEN
    // con aviso de precaución en vez de excluirse (la caution gana al avoid).
    caution: /burpee/,
    cautionMsg:
      'Tienes molestias de rodilla y este ejercicio incluye impacto. Es útil para la prueba, ' +
      'pero adáptalo: baja el ritmo, amortigua la caída o sustituye el salto por un paso atrás. ' +
      'Si notas dolor articular (no muscular), párate y avísanos.'
  },
  {
    zona: 'muñeca',
    // Lesión de muñeca: fuera TODO apoyo de peso sobre las manos. Incluye la
    // categoría "Empuje" (flexiones) y "Equilibrio/Soporte" (crow, pino, planche,
    // L-sit, soportes en paralelas) además de los nombres concretos.
    match: /muneca|wrist/,
    avoid: /front squat|sentadilla frontal|clean|cargada|snatch|arranc|handstand|pino|parada de mano|apoyo de mano|hspu|press|push.?up|flexion|lagartija|thruster|plancha|planche|pike|fondos|dip|burpee|empuje|equilibrio\/soporte|soporte|paralel|crow|cuervo|rana|frog|elbow.?lever|palanca de codo|l-?sit/
  },
  {
    zona: 'tobillo',
    match: /tobillo|ankle|aquiles/,
    avoid: /box ?jump|salto|running|carrera|fartlek|intervalos|double.?under|comba|pistol|lunge|zancada|jump|jumping/
  },
  {
    zona: 'codo',
    // Codo (epicondilitis/tendinitis): fuera tracción/flexión y también la
    // EXTENSIÓN de tríceps cargada (francesa/skull/patada/jalón/pushdown), que
    // es un agravante clásico. 'press' ya cubre press francés/cerrado.
    match: /codo|elbow|epicondil/,
    avoid: /muscle.?up|dip|fondos|pull.?up|dominad|chin.?up|press|hspu|handstand|pino|remo|row|curl|plancha|planche|front lever|crow|cuervo|elbow.?lever|palanca de codo|extensi[oó]n francesa|extensi[oó]n .*tr[ií]ceps|tr[ií]ceps.*(polea|cuerda|barra|mancuerna)|patada.*tr[ií]ceps|jal[oó]n.*tr[ií]ceps|pushdown|kickback|skull/
  }
];

/**
 * Extrae el texto de limitaciones/lesiones del perfil (array o string).
 * @param {object} profile
 * @returns {string}
 */
export function extractInjuryText(profile) {
  const raw = profile?.limitaciones_fisicas ?? profile?.limitaciones ?? profile?.lesiones ?? null;
  if (!raw) return '';
  if (Array.isArray(raw)) return raw.filter(Boolean).join(' ');
  return String(raw);
}

/**
 * Devuelve las reglas de contraindicación activas según el texto de lesiones.
 * @param {string} injuryText
 * @returns {Array<{zona:string, match:RegExp, avoid:RegExp}>}
 */
export function activeInjuryRules(injuryText) {
  if (!injuryText || !injuryText.trim()) return [];
  const normalized = stripDiacritics(injuryText);
  return INJURY_CONTRAINDICATIONS.filter((r) => r.match.test(normalized));
}

/**
 * True si el ejercicio está contraindicado por alguna de las reglas activas.
 * Revisa nombre, categoría, dominio, patrón y tipo_wod del ejercicio (sin acentos).
 * @param {object} ex
 * @param {Array} rules
 * @returns {boolean}
 */
function exerciseText(ex) {
  return stripDiacritics([
    ex?.nombre,
    ex?.categoria,
    ex?.dominio,
    ex?.patron,
    ex?.patron_movimiento,
    ex?.tipo_wod
  ].filter(Boolean).join(' '));
}

export function isContraindicated(ex, rules) {
  if (!rules.length) return false;
  const hay = exerciseText(ex);
  // La contraindicación BLANDA (caution) gana: si el ejercicio encaja en caution
  // NO se excluye (se mantiene con aviso; ver injuryCaution).
  return rules.some((r) => r.avoid.test(hay) && !(r.caution && r.caution.test(hay)));
}

/**
 * Si el ejercicio es una contraindicación BLANDA (relevante pero con impacto),
 * devuelve { zona, mensaje } para mostrar un aviso de precaución. Si no, null.
 * @param {object} ex
 * @param {Array} rules
 * @returns {{zona:string, mensaje:string}|null}
 */
export function injuryCaution(ex, rules) {
  if (!rules.length) return null;
  const hay = exerciseText(ex);
  for (const r of rules) {
    if (r.caution && r.caution.test(hay)) {
      return { zona: r.zona, mensaje: r.cautionMsg || `Precaución por lesión de ${r.zona}: adapta el ejercicio y detente si hay dolor.` };
    }
  }
  return null;
}
