/**
 * fix_crossfit_catalog_quality.mjs
 *
 * Corrección integral de calidad del catálogo app."Ejercicios_CrossFit":
 *   1. Rellena "Cómo_hacerlo" (técnica breve) en el 100% de ejercicios.
 *   2. Convierte cargas de lbs → kg en el nombre y las estructura en rx_carga_sugerida.
 *   3. Marca is_benchmark en los movimientos benchmark clásicos.
 *   4. Remapea gif_url erróneos (placeholders .jpg de free-exercise-db) al GIF
 *      animado correcto del bucket Supabase; anula los que no tienen asset fiable.
 *   5. Elimina duplicados (pistols con peso repetidos).
 *   6. Puebla wod_types (formatos compatibles reales) y duracion_seg de las
 *      isometrías, para que el formato WOD deje de vivir sólo en tipo_wod.
 *   7. Inserta movimientos estándar que faltaban (wall walk, empuje de trineo).
 *
 * Uso:  node scripts/fix_crossfit_catalog_quality.mjs [--dry]
 * Requiere DATABASE_URL en backend/.env
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { Pool } = require('pg');
const dotenv = require('dotenv');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../backend/.env') });

const DRY = process.argv.includes('--dry');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const GIF = code => `https://sbqcnlwpvjavmljzkmfy.supabase.co/storage/v1/object/public/exercise-gifs/crossfit/${code}.gif`;

// ── 5. Duplicados a eliminar (pistol con peso repetido en "Accesorios") ──────
const DELETE_IDS = [99, 119];

// ── 2. Renombrado lbs → kg (estándares CrossFit redondeados a disco real) ────
// id → [nombreNuevo, rxCargaKg]
const KG = {
  86:  ['Clean & Jerk (pesado, 84/61 kg)', '84/61 kg'],
  83:  ['Clean en sentadilla (pesado, 84/61 kg)', '84/61 kg'],
  88:  ['Cluster (61/43 kg)', '61/43 kg'],
  87:  ['Devil Press (pesado, mancuernas 22,5/15 kg)', '22,5/15 kg'],
  90:  ['Peso muerto (pesado, 143/102 kg)', '143/102 kg'],
  84:  ['Thrusters (pesado, 61/43 kg)', '61/43 kg'],
  81:  ['Snatch completo (61/43 kg)', '61/43 kg'],
  109: ['Clean & Jerk (competición, 111/84 kg)', '111/84 kg'],
  112: ['Peso muerto (esfuerzo máximo, 180+/136+ kg)', '180+/136+ kg'],
  115: ['Power Snatch (toque y sigue, 61/43 kg)', '61/43 kg'],
  110: ['Sentadilla sobre cabeza (pesado, 84/61 kg)', '84/61 kg'],
  108: ['Snatch (competición, 84/61 kg)', '84/61 kg'],
  111: ['Thrusters (competición, 84/61 kg)', '84/61 kg'],
  50:  ['Balanceo con kettlebell (americano, 24/16 kg)', '24/16 kg'],
  49:  ['Lanzamientos a pared (9/6 kg)', '9/6 kg'],
  46:  ['Peso muerto (102/70 kg)', '102/70 kg'],
  48:  ['Peso muerto sumo + jalón alto (34/25 kg)', '34/25 kg'],
  53:  ['Sentadillas frontales (61/43 kg)', '61/43 kg'],
  55:  ['Sentadillas traseras (84/61 kg)', '84/61 kg'],
  43:  ['Thrusters (43/30 kg)', '43/30 kg'],
};

// ── 3. Benchmark movements (staples de "the girls" / Open) ───────────────────
const BENCH = [43, 84, 111, 32, 35, 49, 60, 34, 46, 52, 81, 71, 72, 73, 36, 50, 57, 59, 75, 47, 44];

// ── 6. Isometrías → duración objetivo (seg) ──────────────────────────────────
const HOLD_SECS = { 4: 30, 24: 30, 25: 30, 79: 20, 40: 30, 68: 30, 28: 30 };

// ── 4. Remapeo de gif_url ─────────────────────────────────────────────────────
// id → código de gif animado del bucket, 'NULL' si no hay asset fiable.
const GIF_FIX = {
  68: '0677', 66: '2135', 24: '2135', 28: '3293', 1: '3293',
  74: '3302', 73: '3302', 76: '3302', 106: '3302', 103: '3302', 101: '3302',
  72: '0631', 71: '0631', 107: '0631', 105: '0631',
  39: '0456', 36: '0456', 41: '0456', 98: '0456',
  42: '1374', 6: '1374', 23: '1374', 63: '1374',
  89: '1460', 83: '0648', 56: '0648', 87: '1293',
  81: '0529', 82: '0529', 91: '0529', 113: '0529', 115: '0529', 45: '0529',
  92: '1700', 54: '1700', 49: '0550', 15: '0550', 114: '0537',
  // Sin GIF fiable en el bucket (correr / remo ergo / shuttle): mejor sin imagen que una falsa
  95: 'NULL', 117: 'NULL', 19: 'NULL', 59: 'NULL', 64: 'NULL',
  57: 'NULL', 93: 'NULL', 116: 'NULL', 17: 'NULL',
};

// ── 1. Cómo_hacerlo (técnica breve, español) ─────────────────────────────────
const COMO = {
  100: 'Con anillas en apoyo y lastre, baja controlando hasta pasar el hombro del codo y empuja a bloqueo sin balanceo.',
  98:  'Colgado sin kipping, lleva las puntas de los pies a la barra elevando la pelvis con el core.',
  120: 'En equipo, agarre bajo el implemento, extiende cadera y rodillas a la vez para voltearlo hacia delante.',
  65:  'Cadera al borde del GHD, baja el tronco atrás con control y sube tocando el suelo tras la cabeza sólo hasta donde domines.',
  68:  'Sobre anillas en bloqueo de codos, hombros abajo y core firme, mantén las anillas pegadas al cuerpo.',
  66:  'Lumbar pegada al suelo, balancéate como una mecedora manteniendo hombros y piernas despegados.',
  67:  'Cadera sobre el GHD, baja el tronco flexionando cadera y sube extendiendo glúteo sin hiperextender la lumbar.',
  69:  'Agarra el peso a los lados, pecho alto y core firme, camina a pasos cortos sin encoger los hombros.',
  70:  'Desde tumbado con el peso arriba, levántate paso a paso hasta ponerte de pie sin perder el brazo vertical.',
  24:  'Lumbar pegada al suelo, brazos y piernas extendidos y despegados, mantén la tensión sin arquear.',
  25:  'Boca abajo, eleva brazos y piernas a la vez contrayendo glúteo y espalda baja.',
  27:  'Banda a la altura del pecho, brazos extendidos, sepárala juntando escápulas sin encoger el cuello.',
  29:  'Banda bajo los pies y en la nuca, bisagra de cadera con espalda neutra y vuelve extendiendo glúteo.',
  28:  'Cuelga de la barra con agarre firme, hombros activos (no encogidos) y core estable.',
  30:  'Colgado con los brazos rectos, baja los hombros y aprieta escápulas sin flexionar los codos.',
  26:  'Tumbado con los pies apoyados, empuja con talones y eleva la cadera apretando glúteo arriba.',
  80:  'Haz un burpee, salta a la barra y encadena un muscle-up de barra en cada repetición.',
  74:  'En pino sobre tu equilibrio, desplázate con pequeños pasos de manos manteniendo el core apretado.',
  75:  'Sujeta la cuerda con los pies (J-hook), estira piernas y brazos alternando hasta arriba y baja controlando.',
  73:  'En pino contra la pared, baja la cabeza al suelo con codos controlados y empuja hasta bloquear.',
  76:  'HSPU con las manos elevadas sobre discos; baja la cabeza por debajo del nivel de las manos.',
  79:  'En paralelas o anillas, bloquea codos, eleva piernas rectas al frente formando una L y mantén.',
  72:  'Desde las anillas, tira explosivo hasta la transición y empuja a bloqueo de codos por encima de las anillas.',
  71:  'Kipping potente con el pecho a la barra, gira las muñecas sobre la barra y empuja a brazos extendidos.',
  77:  'Sin kipping: dominada explosiva profunda, transición y fondo hasta bloqueo, todo con fuerza pura.',
  78:  'A una pierna sujetando peso, baja controlando con la otra extendida al frente y sube sin apoyarte.',
  106: 'Desplázate en pino de forma continua repartiendo el peso y corrigiendo con pasos cortos.',
  104: 'Con las clavijas en mano, sube el tablero colocándolas en huecos alternos usando core y tirón.',
  102: 'Trepa la cuerda usando sólo los brazos, en posición de L-sit, sin ayuda de las piernas.',
  103: 'En pino con las manos en anillas bajas, controla la inestabilidad y empuja a bloqueo.',
  101: 'Libre en pino, baja la cabeza al suelo y empuja manteniendo el equilibrio sin apoyo.',
  107: 'Muscle-up de barra terminando en apoyo con las piernas en L al frente.',
  105: 'Muscle-up de barra sin balanceo, con dominada y fondo estrictos.',
  39:  'Tumbado, sube tronco y piernas rectas a la vez tocando manos con pies formando una V.',
  40:  'Sube a pino apoyando los talones en la pared, cuerpo alineado y hombros activos.',
  42:  'Burpee y salto por encima del cajón cayendo al otro lado en cada repetición.',
  35:  'Pecho y muslos al suelo, sube y da un salto con palmada arriba en cada repetición.',
  31:  'Sin balanceo, tira hasta pasar la barbilla la barra y baja a brazos extendidos.',
  32:  'Tira hasta tocar la barra con el pecho, usando kipping coordinado de cadera.',
  33:  'Flexión tocando el suelo con el pecho y despegando las manos antes de empujar.',
  37:  'En apoyo, baja hasta que el hombro pase el codo y empuja a bloqueo.',
  36:  'Colgado, balancea y lleva las puntas de los pies a la barra con el core.',
  41:  'Colgado, lleva las rodillas hacia los codos con control y baja sin balancearte.',
  34:  'Salta con ambos pies al cajón, cae en cuclillas y extiende la cadera arriba.',
  38:  'A una pierna, baja controlando con la otra extendida al frente y sube sin apoyo.',
  7:   'Con AbMat, baja la espalda y sube tocando los pies con las manos.',
  8:   'Baja al suelo, vuelve arriba y da un pequeño salto; sin exigencia de palmada.',
  2:   'Cuerpo recto, baja el pecho al suelo con los codos a 45° y empuja.',
  4:   'Antebrazos y puntas de pies, cuerpo alineado, aprieta core y glúteo sin hundir la cadera.',
  1:   'Cuerpo recto colgando de las anillas, tira del pecho a las anillas apretando escápulas.',
  5:   'Salta abriendo piernas y subiendo brazos, y vuelve al centro de forma rítmica.',
  3:   'Pies a la anchura de hombros, baja la cadera bajo la rodilla y sube extendiendo.',
  6:   'Sube al cajón apoyando todo el pie y extiende la cadera arriba, alternando piernas.',
  94:  'Pedalea y empuja/tira con los brazos de forma coordinada a ritmo alto hasta las calorías objetivo.',
  95:  'Corre a ritmo sostenible, con zancada relajada y respiración constante.',
  93:  'Secuencia piernas-cadera-brazos al empujar y brazos-cadera-piernas al recoger, a ritmo fuerte.',
  97:  'De pie, tira de las asas hacia abajo usando core y cadera, no sólo los brazos.',
  96:  'Salta alto y pasa la comba tres veces por salto con giro rápido de muñeca.',
  118: 'Ritmo máximo sostenible coordinando brazos y piernas hasta completar las calorías.',
  117: 'Ritmo continuo aeróbico, controlando la respiración y la cadencia.',
  116: 'Ritmo élite con secuencia eficiente piernas-cadera-brazos y recuperación controlada.',
  58:  'Sprint corto coordinando brazos y piernas hasta las calorías objetivo.',
  62:  'Tras el burpee, salto horizontal largo cayendo con las dos piernas.',
  59:  'Ritmo fuerte y sostenido, con zancada eficiente y brazos relajados.',
  64:  'Sprints cortos de ida y vuelta tocando la línea al cambiar de sentido.',
  60:  'Salta y pasa la comba dos veces por salto con giro de muñeca, cuerpo firme.',
  57:  'Ritmo moderado, secuencia piernas-cadera-brazos y respiración constante.',
  61:  'Tira de las asas hacia abajo con cadera y core a ritmo moderado.',
  63:  'Sube y baja del cajón a ritmo alto alternando piernas de forma continua.',
  18:  'Pedaleo continuo y cómodo coordinando brazos y piernas.',
  19:  'Trote ligero y conversacional para calentar o base aeróbica.',
  20:  'Salta pasando la comba una vez por salto, con botes pequeños y muñeca relajada.',
  17:  'Remo suave y técnico, cuida la secuencia y no tires sólo con los brazos.',
  21:  'Tirones controlados usando cadera y core a ritmo cómodo.',
  23:  'Sube y baja del cajón a ritmo constante alternando piernas.',
  22:  'Da un paso largo y baja la rodilla trasera casi al suelo, alternando piernas.',
  86:  'Cargada al hombro en un tiempo y jerk sobre la cabeza; espalda firme y extensión potente de cadera.',
  83:  'Tira de la barra, recíbela en sentadilla profunda al hombro y levántate.',
  88:  'Squat clean y thruster encadenados: recibe en sentadilla y empuja sobre la cabeza en un flujo.',
  87:  'Con mancuernas, burpee al suelo y llévalas de un envión por encima de la cabeza.',
  90:  'Espalda neutra, empuja el suelo y extiende cadera y rodillas juntas con la barra pegada.',
  85:  'Con la barra bloqueada arriba en agarre ancho, baja a sentadilla profunda manteniéndola sobre la cabeza.',
  81:  'De un tirón, lleva la barra del suelo a brazos extendidos recibiéndola en sentadilla.',
  82:  'Arranque completo recibiendo en sentadilla profunda; extensión y meterse debajo rápido.',
  91:  'Desde por encima de la rodilla, arranque a sentadilla en un solo tiempo.',
  92:  'Dip y empuje explosivo metiéndote bajo la barra en tijera, y recupera los pies.',
  84:  'Front squat y, sin pausa, empuja la barra sobre la cabeza aprovechando el impulso de piernas.',
  89:  'Con el peso bloqueado arriba, zancadas caminando manteniendo el brazo vertical y estable.',
  113: 'Con la barra en la espalda, empújate bajo ella recibiéndola en sentadilla con brazos extendidos.',
  109: 'Cargada y jerk con carga cercana al máximo; técnica y agresividad.',
  114: 'Squat clean, sentadilla frontal y jerk encadenados sin soltar la barra.',
  112: 'Levantamiento a esfuerzo casi máximo con espalda neutra y bloqueo de cadera arriba.',
  115: 'Arranque de potencia recibiendo por encima de media sentadilla, toque y sigue sin soltar.',
  110: 'Sentadilla profunda con la barra bloqueada arriba en agarre de arrancada, torso vertical.',
  108: 'Arranque completo a sentadilla con carga máxima; velocidad bajo la barra.',
  111: 'Front squat a envión sobre la cabeza con carga alta, sin pausas.',
  50:  'Bisagra de cadera y proyecta la kettlebell hasta encima de la cabeza con el impulso de cadera.',
  52:  'Cargada al hombro y jerk sobre la cabeza; extensión de cadera y recepción firme.',
  56:  'Desde colgado sobre la rodilla, recibe la barra en sentadilla al hombro.',
  49:  'Sentadilla profunda y lanza el balón al objetivo alto, recíbelo y encadena.',
  46:  'Espalda neutra, empuja el suelo y extiende cadera y rodillas con la barra pegada.',
  48:  'Peso muerto sumo y tira alto llevando los codos por encima hasta la clavícula.',
  44:  'Tira de la barra y recíbela al hombro por encima de media sentadilla con codos rápidos.',
  45:  'Desde colgado, arranque de potencia a brazos extendidos sin llegar a sentadilla.',
  54:  'Dip de piernas y empuje explosivo metiéndote bajo la barra con los pies fijos.',
  47:  'Barra bloqueada arriba en agarre ancho, baja a sentadilla profunda manteniendo el torso vertical.',
  53:  'Barra en rack frontal, codos altos, baja a sentadilla profunda y sube con el torso erguido.',
  55:  'Barra en la espalda alta, baja la cadera bajo la rodilla y sube extendiendo cadera y rodillas.',
  51:  'De un tirón lleva la mancuerna del suelo a brazo extendido sobre la cabeza, alternando mano.',
  43:  'Front squat y, sin pausa, empuja la barra sobre la cabeza en un solo movimiento.',
  11:  'Bisagra de cadera y proyecta la kettlebell hasta la altura de los ojos con el impulso de cadera.',
  15:  'Sentadilla y lanza el balón al objetivo; recíbelo bajando de nuevo a sentadilla.',
  12:  'Bisagra de cadera con piernas casi rectas, baja la barra pegada y sube apretando glúteo.',
  10:  'De pie, empuja las mancuernas desde los hombros hasta bloqueo sin arquear la lumbar.',
  16:  'Dip corto de piernas y empuja la barra sobre la cabeza aprovechando el impulso.',
  13:  'Con la espalda neutra, tira de la mancuerna al costado apretando la escápula.',
  9:   'Sujeta el peso al pecho y baja a sentadilla profunda con el torso vertical.',
  14:  'Barra en rack frontal con codos altos, sentadilla profunda y controlada.',
};

// ── 7. Movimientos estándar que faltaban ─────────────────────────────────────
const INSERTS = [
  {
    nombre: 'Wall Walk (subida a la pared)', nivel: 'Intermedio', dominio: 'Gymnastic',
    categoria: 'Press', tipo_wod: 'For Time', intensidad: 'RPE 8',
    escalamiento: 'Subir sólo hasta la mitad', gif: '3302',
    como: 'Desde plancha con los pies en la pared, camina con las manos hacia la pared subiendo hasta pino y baja controlando.',
  },
  {
    nombre: 'Empuje de trineo (Sled Push)', nivel: 'Intermedio', dominio: 'Monostructural',
    categoria: 'Cardio', tipo_wod: 'For Distance', intensidad: 'RPE 8',
    escalamiento: 'Reducir el peso', gif: 'NULL',
    como: 'Empuja el trineo con los brazos extendidos y pasos potentes, manteniendo el torso inclinado y firme.',
  },
];

function wodTypesFor(dominio) {
  switch (dominio) {
    case 'Weightlifting': return ['Strength', 'For Time', 'EMOM', 'AMRAP'];
    case 'Gymnastic':     return ['For Time', 'AMRAP', 'EMOM'];
    case 'Monostructural':return ['For Time', 'AMRAP', 'EMOM'];
    default:              return ['EMOM', 'For Time', 'AMRAP'];
  }
}

async function main() {
  const client = await pool.connect();
  const log = [];
  try {
    await client.query('BEGIN');

    // 5. Eliminar duplicados
    const del = await client.query(
      'DELETE FROM app."Ejercicios_CrossFit" WHERE exercise_id = ANY($1::int[])', [DELETE_IDS]);
    log.push(`Duplicados eliminados: ${del.rowCount} (${DELETE_IDS.join(', ')})`);

    // Cargar filas vivas
    const { rows } = await client.query(
      'SELECT exercise_id, nombre, dominio, intensidad, rx_carga_sugerida FROM app."Ejercicios_CrossFit"');

    let comoN = 0, kgN = 0, rxN = 0, gifN = 0, gifNull = 0, wodN = 0, durN = 0, benchN = 0;

    for (const r of rows) {
      const id = r.exercise_id;
      const sets = [];
      const vals = [];
      const push = (col, val) => { vals.push(val); sets.push(`${col} = $${vals.length}`); };

      // 1. Cómo_hacerlo
      if (COMO[id]) { push('"Cómo_hacerlo"', COMO[id]); comoN++; }

      // 2. Nombre kg + rx_carga
      if (KG[id]) { push('nombre', KG[id][0]); push('rx_carga_sugerida', KG[id][1]); kgN++; rxN++; }
      else if (r.dominio === 'Weightlifting' && !r.rx_carga_sugerida && r.intensidad && /%/.test(r.intensidad)) {
        push('rx_carga_sugerida', r.intensidad); rxN++;   // % 1RM como objetivo de carga
      }

      // 3. Benchmark
      if (BENCH.includes(id)) { push('is_benchmark', 1); benchN++; }

      // 4. gif
      if (GIF_FIX[id]) {
        if (GIF_FIX[id] === 'NULL') { push('gif_url', null); gifNull++; }
        else { push('gif_url', GIF(GIF_FIX[id])); gifN++; }
      }

      // 6. wod_types + duracion
      push('wod_types', wodTypesFor(r.dominio)); wodN++;
      if (HOLD_SECS[id]) { push('duracion_seg', HOLD_SECS[id]); durN++; }

      if (sets.length) {
        vals.push(id);
        await client.query(
          `UPDATE app."Ejercicios_CrossFit" SET ${sets.join(', ')}, updated_at = now() WHERE exercise_id = $${vals.length}`,
          vals);
      }
    }
    log.push(`Cómo_hacerlo: ${comoN} · kg renombrados: ${kgN} · rx_carga: ${rxN} · gif remapeado: ${gifN} · gif anulado: ${gifNull} · wod_types: ${wodN} · duración holds: ${durN} · benchmarks: ${benchN}`);

    // 7. Inserts (con nuevos exercise_id incrementales)
    const { rows: mx } = await client.query('SELECT COALESCE(MAX(exercise_id),0) m FROM app."Ejercicios_CrossFit"');
    let nextId = mx[0].m + 1;
    for (const ins of INSERTS) {
      // no duplicar si ya existe por nombre
      const ex = await client.query('SELECT 1 FROM app."Ejercicios_CrossFit" WHERE nombre = $1', [ins.nombre]);
      if (ex.rowCount) { log.push(`Insert omitido (ya existe): ${ins.nombre}`); continue; }
      await client.query(
        `INSERT INTO app."Ejercicios_CrossFit"
          (exercise_id, nombre, nivel, dominio, categoria, tipo_wod, intensidad, escalamiento,
           "Cómo_hacerlo", gif_url, wod_types, is_benchmark, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,0,now(),now())`,
        [nextId, ins.nombre, ins.nivel, ins.dominio, ins.categoria, ins.tipo_wod, ins.intensidad,
         ins.escalamiento, ins.como, ins.gif === 'NULL' ? null : GIF(ins.gif), wodTypesFor(ins.dominio)]);
      log.push(`Insertado: ${ins.nombre} (id ${nextId})`);
      nextId++;
    }

    if (DRY) { await client.query('ROLLBACK'); log.push('DRY RUN → ROLLBACK (nada persistido)'); }
    else { await client.query('COMMIT'); log.push('COMMIT ✅'); }
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('❌ Error, ROLLBACK:', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
    console.log(log.join('\n'));
  }
}

main();
