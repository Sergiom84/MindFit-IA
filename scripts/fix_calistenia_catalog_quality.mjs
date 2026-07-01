/**
 * fix_calistenia_catalog_quality.mjs
 *
 * Corrección integral de calidad de los ejercicios de calistenia en
 * app.ejercicios (disciplina='calistenia'):
 *   1. Rellena como_hacerlo (técnica breve) en el 100% (antes 1/65).
 *   2. Rellena consejos y errores_comunes (antes 1/65).
 *   3. Arregla gif_url: sin depender de RapidAPI (cuota agotada), reutiliza los
 *      GIFs ANIMADOS ya subidos al bucket Supabase para movimientos equivalentes
 *      y conserva/asigna estáticos correctos de free-exercise-db; anula los que
 *      no tienen asset fiable (skills avanzadas: planche, levers, human flag…).
 *
 * series_reps_objetivo y criterio_de_progreso ya están al 100% → no se tocan.
 *
 * Uso:  node scripts/fix_calistenia_catalog_quality.mjs [--dry]
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

const SB = code => `https://sbqcnlwpvjavmljzkmfy.supabase.co/storage/v1/object/public/exercise-gifs/crossfit/${code}.gif`;
const FE = name => `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/${name}/0.jpg`;

// ── gif_url por id: 'SB:code' animado del bucket · 'FE:Name' estático correcto · 'NULL' ──
const GIF = {
  // Core
  39: 'NULL', 40: 'SB:3419', 45: 'FE:Hanging_Leg_Raise', 41: 'SB:3419',
  14: 'FE:Hanging_Leg_Raise', 15: 'FE:Hanging_Leg_Raise', 17: 'SB:2135', 16: 'SB:3419',
  54: 'FE:Dead_Bug', 53: 'SB:2135', 51: 'SB:2135', 52: 'FE:Push_Up_to_Side_Plank', 9: 'SB:0803',
  // Empuje
  37: 'NULL', 46: 'SB:0677', 25: 'FE:Single-Arm_Push-Up', 26: 'SB:1273', 27: 'SB:3302',
  29: 'NULL', 30: 'NULL', 5: 'FE:Single-Arm_Push-Up', 4: 'FE:Decline_Push-Up', 3: 'SB:1273',
  2: 'SB:1273', 7: 'SB:0677', 1: 'SB:1273', 6: 'SB:1273', 47: 'SB:1273', 49: 'SB:1273',
  50: 'SB:1273', 48: 'FE:Incline_Push-Up', 64: 'SB:3302',
  // Equilibrio/Soporte
  28: 'SB:3302', 24: 'NULL', 23: 'SB:3302', 65: 'SB:0677',
  // Piernas
  44: 'NULL', 42: 'SB:0544', 43: 'SB:0544', 19: 'SB:1460', 22: 'NULL', 21: 'NULL',
  20: 'SB:0544', 18: 'SB:0750', 60: 'NULL', 55: 'SB:1409', 56: 'SB:0750', 57: 'SB:0750',
  59: 'SB:1374', 58: 'SB:1460',
  // Tracción
  32: 'SB:3293', 31: 'SB:3293', 36: 'NULL', 38: 'NULL', 35: 'SB:0631', 34: 'SB:0631',
  33: 'FE:One_Arm_Chin-Up', 12: 'SB:3293', 11: 'SB:3293', 13: 'SB:3293', 8: 'SB:3293',
  10: 'SB:3293', 62: 'SB:3293', 61: 'SB:3293', 63: 'SB:3293',
};

// ── como_hacerlo / consejos / errores_comunes por id ─────────────────────────
const T = {
  // Core
  39: ['Tumbado, agárrate detrás de la cabeza y eleva el cuerpo recto como una tabla, bajando lento sin arquear.', 'Aprieta glúteo y abdomen para mantener la línea recta.', 'Arquear la zona lumbar o doblar la cadera al bajar.'],
  40: ['En paralelas con codos bloqueados, eleva las piernas rectas al frente formando una L y mantén.', 'Deprime los hombros y empuja el suelo hacia abajo.', 'Encoger los hombros o doblar las rodillas.'],
  45: ['Colgado de la barra, lleva las puntas de los pies a tocar la barra usando el core y baja con control.', 'Usa un balanceo compacto, no un impulso suelto.', 'Balancearte sin control y tirar sólo con los brazos.'],
  41: ['Sentado, eleva tronco y piernas rectas formando una V y mantén el equilibrio.', 'Busca compresión de cadera activando el abdomen.', 'Redondear la espalda o doblar las rodillas.'],
  14: ['Colgado, sube las rodillas hacia el pecho con control y baja sin balanceo.', 'Inicia retrayendo la pelvis, no con impulso.', 'Balancearte para ayudarte a subir.'],
  15: ['Colgado, sube las piernas rectas hasta la horizontal y baja controlando.', 'Mantén el core firme y evita el columpio.', 'Doblar mucho las rodillas o usar impulso.'],
  17: ['Tumbado, lumbar pegada al suelo, brazos y piernas extendidos y despegados; mantén.', 'Hunde las costillas y aprieta el abdomen.', 'Despegar la lumbar del suelo.'],
  16: ['En paralelas, eleva las rodillas al pecho manteniendo los codos bloqueados.', 'Progresa extendiendo poco a poco las piernas.', 'Hundir los hombros.'],
  54: ['Boca arriba, baja brazo y pierna opuestos sin despegar la lumbar y alterna.', 'Muévete despacio manteniendo la lumbar pegada.', 'Arquear la espalda al extender.'],
  53: ['Tumbado con rodillas recogidas y hombros despegados, mantén la tensión abdominal.', 'Es la regresión del hollow: lumbar siempre pegada.', 'Perder la posición y arquear.'],
  51: ['Sobre antebrazos y puntas de pies, cuerpo alineado; aprieta core y glúteo.', 'Mete la pelvis (retroversión) para no hundir la cadera.', 'Subir la cadera o hundir la zona lumbar.'],
  52: ['De lado, apóyate en el antebrazo y eleva la cadera formando una línea recta.', 'Apila hombro sobre codo y aprieta el oblicuo.', 'Dejar caer la cadera.'],
  9:  ['Boca abajo, eleva brazos y piernas suavemente contrayendo glúteo y espalda baja.', 'Mantén el cuello neutro mirando al suelo.', 'Hiperextender el cuello o tirar del lumbar en exceso.'],
  // Empuje
  37: ['Colgado boca abajo, extiende el cuerpo horizontal bajo la barra y mantén la posición.', 'Progresa de tuck a straddle ganando tiempo bajo tensión.', 'Perder la horizontal o arquear la espalda.'],
  46: ['En anillas o paralelas, baja controlando y empuja explosivo hasta despegar.', 'Controla la fase excéntrica antes de explotar.', 'Rebotar en el fondo sin control.'],
  25: ['Flexión con una sola mano y pies abiertos, bajando el pecho con control.', 'Abre las piernas para estabilizar y aprieta el core.', 'Rotar el tronco en exceso.'],
  26: ['Flexión empujando con fuerza para despegar las manos del suelo.', 'Amortigua la caída con los codos ligeramente flexionados.', 'Caer con los codos rígidos.'],
  27: ['En pino contra la pared, baja la cabeza al suelo y empuja hasta bloquear.', 'Mantén el core firme y el cuerpo alineado.', 'Arquear la espalda o abrir los codos.'],
  29: ['En plancha, inclina los hombros por delante de las manos aguantando la tensión.', 'Protrae escápulas y aprieta abdomen y glúteo.', 'Dejar la cadera baja o encoger los hombros.'],
  30: ['Sobre las manos, recoge las rodillas al pecho y despega los pies manteniendo el equilibrio.', 'Protracción escapular máxima e inclina el peso adelante.', 'Apoyarte en la cadera en vez de en los hombros.'],
  5:  ['Flexión desplazando el peso a un brazo mientras el otro se extiende lateralmente.', 'Alterna lados y controla la bajada.', 'Dejar caer la cadera.'],
  4:  ['Flexión con los pies elevados para cargar más el pecho superior y los hombros.', 'Mantén el cuerpo recto y baja con control.', 'Hundir la cadera.'],
  3:  ['Flexión con las manos juntas formando un diamante para enfatizar el tríceps.', 'Pega los codos al cuerpo al bajar.', 'Abrir los codos hacia fuera.'],
  2:  ['Cuerpo recto, baja el pecho al suelo con los codos a 45° y empuja.', 'Aprieta glúteo y abdomen para no arquear.', 'Hundir la cadera o abrir los codos a 90°.'],
  7:  ['En paralelas, baja hasta que el hombro pase el codo y empuja a bloqueo.', 'Inclínate para pecho, mantente vertical para tríceps.', 'Bajar demasiado forzando el hombro.'],
  1:  ['En V invertida con la cadera alta, baja la cabeza hacia el suelo y empuja.', 'Cuanto más vertical la cadera, más difícil.', 'Perder la posición de pica.'],
  6:  ['Flexión con las manos a la altura de la cintura y los hombros adelantados.', 'Inclina el peso hacia delante progresivamente.', 'Dejar las manos demasiado altas.'],
  47: ['De pie frente a la pared, flexiona los codos acercando el pecho y empuja.', 'Cuanto más lejos los pies, más intensidad.', 'Despegar los talones o arquear.'],
  49: ['Flexión apoyando las rodillas, manteniendo tronco y cadera alineados.', 'Línea recta rodilla-hombro, sin dejar la cadera atrás.', 'Doblar la cadera para acortar el recorrido.'],
  50: ['En posición de plancha con brazos rectos, junta y separa las escápulas.', 'Mueve sólo los hombros, no los codos.', 'Flexionar los codos.'],
  48: ['Manos en una superficie elevada, flexiona bajando el pecho y empuja.', 'Cuanto más baja la superficie, más difícil.', 'Hundir la cadera.'],
  64: ['En V invertida con la cadera alta y brazos extendidos, mantén la posición.', 'Empuja el suelo y lleva el peso a los hombros.', 'Encoger los hombros.'],
  // Equilibrio/Soporte
  28: ['Sube a pino y equilíbrate con el cuerpo alineado corrigiendo con los dedos.', 'Mira entre las manos y aprieta core y glúteo.', 'Arquear la espalda (banana).'],
  24: ['En cuclillas, apoya las rodillas en los tríceps y despega los pies equilibrando en las manos.', 'Mira ligeramente adelante y reparte el peso en los dedos.', 'Mirar a los pies, lo que te desequilibra atrás.'],
  23: ['Sube a pino apoyando los talones o el cuerpo en la pared, cuerpo alineado.', 'Practica la posición de hueco (hollow) contra la pared.', 'Separarte demasiado de la pared con arqueo.'],
  65: ['En paralelas, sostén el cuerpo con los brazos bloqueados y los pies apoyados.', 'Deprime los hombros y aprieta el core.', 'Encoger los hombros.'],
  // Piernas
  44: ['De rodillas con los tobillos fijos, sube el cuerpo desde abajo con los isquios.', 'Es la fase más difícil; usa un pequeño impulso de manos si hace falta.', 'Romper la cadera para ayudarte.'],
  42: ['A una pierna, baja controlando con la otra extendida al frente y sube sin apoyo.', 'Extiende los brazos como contrapeso.', 'Colapsar la rodilla hacia dentro.'],
  43: ['A una pierna sujetando el pie trasero, baja hasta tocar la rodilla en el suelo y sube.', 'Mantén el torso erguido y el equilibrio.', 'Perder el control en la bajada.'],
  19: ['Con el pie trasero elevado en un banco, baja la rodilla y sube con la pierna delantera.', 'Inclina ligeramente el torso para el glúteo.', 'Que la rodilla delantera se vaya hacia dentro.'],
  22: ['Sobre un escalón y a una pierna, sube al máximo de puntillas y baja con control.', 'Pausa arriba y estira abajo el rango completo.', 'Hacer rebotes cortos.'],
  21: ['De rodillas con los tobillos fijos, baja el cuerpo lo más lento posible resistiendo con los isquios.', 'Frena 3-5s y amortigua con las manos al final.', 'Caer rápido sin resistir.'],
  20: ['A una pierna, siéntate en una caja controlando y levántate sin apoyar la otra pierna.', 'Baja la altura de la caja según progreses.', 'Rebotar en la caja.'],
  18: ['Pies a la anchura de hombros, baja la cadera bajo la rodilla con el torso erguido.', 'Abre ligeramente las puntas y mantén los talones apoyados.', 'Levantar los talones o redondear la espalda.'],
  60: ['De pie, sube al máximo de puntillas y baja controlando el rango completo.', 'Pausa arriba y estira abajo.', 'Rebotar sin control.'],
  55: ['Tumbado con los pies apoyados, empuja con talones y eleva la cadera apretando glúteo.', 'Retroversión pélvica arriba, sin arquear la lumbar.', 'Empujar con la lumbar en vez del glúteo.'],
  56: ['Baja sentándote en una caja o banco con control y levántate.', 'Toca sin dejarte caer; controla la bajada.', 'Desplomarte en la caja.'],
  57: ['Pies a la anchura de hombros, baja la cadera y sube extendiendo.', 'Rodillas siguiendo la línea de los pies.', 'Que las rodillas colapsen hacia dentro.'],
  59: ['Sube a un escalón apoyando todo el pie y extiende la cadera arriba, alternando.', 'Empuja con el talón de la pierna de arriba.', 'Impulsarte con la pierna de abajo.'],
  58: ['Da un paso adelante y baja la rodilla trasera, ayudándote de un apoyo para el equilibrio.', 'Torso erguido y paso suficientemente largo.', 'Dar un paso corto que adelanta la rodilla.'],
  // Tracción
  32: ['Dominada desplazando el peso a un brazo mientras el otro se extiende lateral.', 'Alterna lados; el brazo extendido sólo asiste.', 'Ayudarte demasiado con el brazo extendido.'],
  31: ['Dominada tirando con fuerza para superar la barra o despegar las manos.', 'Genera potencia desde la espalda, no sólo de los brazos.', 'Usar balanceo descontrolado.'],
  36: ['Colgado, eleva el cuerpo horizontal bajo la barra boca arriba y mantén.', 'Deprime y retrae escápulas; progresa de tuck a straddle.', 'Dejar caer la cadera.'],
  38: ['Agarrado a una barra vertical, eleva el cuerpo horizontal en bandera.', 'Empuja con el brazo de abajo y tira con el de arriba.', 'Perder la línea del cuerpo.'],
  35: ['Desde las anillas, tira explosivo hasta la transición y empuja a bloqueo por encima.', 'Pega las anillas al cuerpo en la transición.', 'Transición lenta que frena el impulso.'],
  34: ['Dominada explosiva pecho a la barra, gira las muñecas y empuja a brazos extendidos.', 'Tira alto y mete el cuerpo rápido sobre la barra.', 'No subir suficiente antes de la transición.'],
  33: ['Dominada supina a un solo brazo, subiendo con control hasta la barbilla.', 'Progresa con dominadas asistidas a un brazo.', 'Girar el cuerpo con impulso.'],
  12: ['Agarre supino, tira hasta pasar la barbilla la barra y baja controlando.', 'Inicia deprimiendo las escápulas.', 'No completar el rango abajo.'],
  11: ['Agarre prono, tira hasta pasar la barbilla la barra y baja a brazos extendidos.', 'Lleva los codos hacia abajo y atrás.', 'Hacer medio recorrido o balancearte.'],
  13: ['Empieza arriba y baja lo más lento posible resistiendo con la espalda.', 'Frena 3-5s: ideal para ganar fuerza de dominada.', 'Bajar rápido sin resistir.'],
  8:  ['Bajo una barra baja y con el cuerpo recto, tira del pecho a la barra.', 'Aprieta escápulas y mantén el cuerpo rígido.', 'Dejar caer la cadera.'],
  10: ['Remo invertido con los pies elevados para aumentar la dificultad.', 'Cuerpo recto y tirón completo al pecho.', 'Encoger el cuello para llegar.'],
  62: ['Cuelga de la barra con agarre firme, hombros activos y core estable.', 'Respira y aguanta; mejora el agarre.', 'Colgar totalmente pasivo encogiendo los hombros.'],
  61: ['Bajo una barra baja y con las rodillas flexionadas, tira del pecho a la barra.', 'Es la regresión: cuanto más vertical, más fácil.', 'Empujar con las piernas en vez de tirar.'],
  63: ['Colgado con los brazos rectos, baja los hombros y aprieta escápulas sin doblar los codos.', 'Es la base del control escapular para dominadas.', 'Flexionar los codos.'],
};

function gifUrl(v) {
  if (!v || v === 'NULL') return null;
  const [k, rest] = v.split(':');
  return k === 'SB' ? SB(rest) : FE(rest);
}

async function main() {
  const client = await pool.connect();
  const log = [];
  try {
    await client.query('BEGIN');
    let comoN = 0, tipN = 0, errN = 0, gifN = 0, gifNull = 0;

    const ids = new Set([...Object.keys(T), ...Object.keys(GIF)].map(Number));
    for (const id of ids) {
      const sets = [], vals = [];
      const push = (col, val) => { vals.push(val); sets.push(`${col} = $${vals.length}`); };

      if (T[id]) {
        push('como_hacerlo', T[id][0]); comoN++;
        push('consejos', T[id][1]); tipN++;
        push('errores_comunes', T[id][2]); errN++;
      }
      if (id in GIF) {
        const url = gifUrl(GIF[id]);
        push('gif_url', url);
        if (url) gifN++; else gifNull++;
      }
      if (sets.length) {
        vals.push(id);
        const r = await client.query(
          `UPDATE app.ejercicios SET ${sets.join(', ')}, updated_at = now()
             WHERE id = $${vals.length} AND disciplina = 'calistenia'`, vals);
        if (r.rowCount === 0) log.push(`⚠️ id ${id} no encontrado en calistenia`);
      }
    }
    log.push(`como_hacerlo: ${comoN} · consejos: ${tipN} · errores_comunes: ${errN} · gif animado/estático: ${gifN} · gif anulado (skills sin asset): ${gifNull}`);

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
