/**
 * fix_funcional_catalog_quality.mjs
 *
 * Corrección integral de calidad de los ejercicios de entrenamiento funcional en
 * app.ejercicios (disciplina='funcional'):
 *   1. Rellena como_hacerlo (técnica breve) al 100% (antes 1/54).
 *   2. Rellena consejos y errores_comunes (antes 1/54).
 *   3. Arregla gif_url sin depender de RapidAPI (cuota agotada): reutiliza GIFs
 *      ANIMADOS del bucket Supabase para movimientos equivalentes, conserva/asigna
 *      estáticos correctos de free-exercise-db y anula los que no tienen asset
 *      fiable (skills avanzadas: planche, front lever, dragon flag, ab wheel,
 *      movilidad, bird dog…).
 *
 * series_reps_objetivo y criterio_de_progreso ya están al 100% → no se tocan.
 *
 * Uso:  node scripts/fix_funcional_catalog_quality.mjs [--dry]
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

// Sólo se listan los ids cuyo gif se CAMBIA. Los que ya tienen un estático
// correcto de free-exercise-db (Pallof, Med-ball twist, Dead bug, side plank,
// landmine floor press, TGU, face pull, rear lunge, bulgarian) se dejan intactos.
const GIF = {
  // Carga
  215: 'SB:0648', 213: 'SB:2133', 214: 'SB:2133', 197: 'SB:2133', 198: 'SB:2133',
  // Core
  212: 'NULL', 209: 'NULL', 210: 'SB:3419', 211: 'NULL', 194: 'SB:3419',
  193: 'SB:2135', 175: 'SB:2135', 178: 'NULL',
  // Empuje
  199: 'FE:Single-Arm_Push-Up', 201: 'NULL', 183: 'FE:Single-Arm_Push-Up',
  182: 'SB:1273', 166: 'SB:1273', 167: 'SB:1273', 168: 'SB:1293',
  // Movilidad
  179: 'NULL', 181: 'NULL', 180: 'NULL',
  // Piernas
  206: 'SB:0085', 205: 'SB:0544', 190: 'SB:0085', 219: 'SB:0085',
  172: 'SB:0750', 174: 'SB:1374', 173: 'SB:0534',
  // Pliométrico
  207: 'SB:1374', 208: 'SB:1374', 216: 'SB:1160', 217: 'SB:1160', 218: 'SB:1160', 192: 'SB:1374',
  // Tracción
  202: 'SB:3293', 204: 'NULL', 203: 'SB:0631', 186: 'SB:3293', 187: 'SB:3293',
  170: 'SB:3293', 171: 'SB:3293', 169: 'SB:3293',
};

// como_hacerlo / consejos / errores_comunes por id
const T = {
  // Carga
  215: ['Levanta el saco del suelo y súbelo a un hombro con extensión de cadera, alternando lados.', 'Abraza el saco pegado al cuerpo y empuja con las piernas.', 'Tirar sólo con la espalda.'],
  213: ['Sostén la kettlebell sobre la cabeza con el brazo bloqueado y camina estable.', 'Muñeca neutra y hombro empaquetado.', 'Dejar caer el codo o arquear la lumbar.'],
  214: ['Con el yugo sobre la espalda alta, camina a pasos cortos y firmes manteniendo el core.', 'Aguanta la presión abdominal (Valsalva) y avanza decidido.', 'Dar pasos largos que descontrolan la carga.'],
  197: ['Agarra el peso a los lados, pecho alto y core firme, camina a pasos cortos.', 'No encojas los hombros; escápulas abajo.', 'Balancear el peso al caminar.'],
  198: ['Carga el peso en un solo lado y camina sin inclinarte hacia ese lado.', 'Aprieta el oblicuo contrario para mantenerte recto.', 'Ladear el tronco hacia la carga.'],
  // Core
  212: ['De rodillas, rueda la rueda hacia delante extendiendo el cuerpo y vuelve con el abdomen.', 'Mete la pelvis y no arquees la lumbar.', 'Hiperextender la espalda al estirarte.'],
  209: ['Tumbado agarrando un apoyo tras la cabeza, eleva el cuerpo recto y baja lento.', 'Cuerpo como una tabla; aprieta glúteo y abdomen.', 'Arquear la lumbar o doblar la cadera.'],
  210: ['Sentado, eleva tronco y piernas rectas formando una V y mantén.', 'Compresión de cadera y abdomen firme.', 'Redondear la espalda.'],
  211: ['Colgado con las piernas arriba, gíralas de lado a lado como un limpiaparabrisas.', 'Controla el giro con los oblicuos, sin impulso.', 'Balancearte descontroladamente.'],
  194: ['En paralelas con codos bloqueados, eleva las piernas rectas al frente y mantén.', 'Deprime los hombros y empuja hacia abajo.', 'Encoger los hombros o doblar las rodillas.'],
  195: ['De pie con la banda al costado, extiende los brazos al frente resistiendo la rotación.', 'Aprieta el core y no dejes que el tronco gire.', 'Rotar el tronco hacia la polea.'],
  193: ['En plancha alta, toca el hombro contrario con la mano sin mover la cadera.', 'Abre los pies para estabilizar y aprieta el glúteo.', 'Balancear la cadera al tocar.'],
  196: ['Sentado con el tronco inclinado, gira el balón de lado a lado tocando el suelo.', 'Pecho alto y giro desde el core.', 'Redondear la espalda.'],
  178: ['En cuadrupedia, extiende brazo y pierna opuestos manteniendo la cadera estable.', 'No dejes que la cadera rote; movimiento lento.', 'Arquear la lumbar al extender.'],
  177: ['Boca arriba, baja brazo y pierna opuestos sin despegar la lumbar y alterna.', 'Muévete despacio con la lumbar pegada.', 'Arquear la espalda.'],
  175: ['Sobre antebrazos y puntas de pies, cuerpo alineado; aprieta core y glúteo.', 'Retroversión pélvica para no hundir la cadera.', 'Subir o hundir la cadera.'],
  176: ['De lado, apóyate en el antebrazo y eleva la cadera en línea recta.', 'Apila hombro sobre codo y aprieta el oblicuo.', 'Dejar caer la cadera.'],
  // Empuje
  199: ['Flexión con una sola mano y pies abiertos, bajando con control.', 'Abre las piernas para estabilizar y aprieta el core.', 'Rotar el tronco en exceso.'],
  200: ['En pino contra la pared, baja la cabeza al suelo y empuja a bloqueo.', 'Core firme y cuerpo alineado.', 'Arquear la espalda o abrir los codos.'],
  201: ['En plancha, inclina los hombros por delante de las manos y aguanta la tensión.', 'Protrae escápulas y aprieta abdomen y glúteo.', 'Dejar la cadera baja.'],
  183: ['Flexión desplazando el peso a un brazo mientras el otro se extiende lateral.', 'Alterna lados y controla la bajada.', 'Dejar caer la cadera.'],
  182: ['Flexión con las manos juntas en diamante para enfatizar el tríceps.', 'Pega los codos al cuerpo.', 'Abrir los codos hacia fuera.'],
  184: ['Con la barra en landmine, empuja en diagonal hacia arriba con un brazo.', 'Acompaña con una ligera rotación del tronco.', 'Arquear la lumbar para empujar.'],
  185: ['Desde tumbado con la kettlebell arriba, levántate paso a paso sin perder el brazo vertical.', 'Fija la vista en la pesa durante toda la subida.', 'Perder la verticalidad del brazo.'],
  166: ['De pie frente a la pared, flexiona los codos acercando el pecho y empuja.', 'Cuanto más lejos los pies, más intensidad.', 'Despegar los talones o arquear.'],
  167: ['Flexión apoyando las rodillas con tronco y cadera alineados.', 'Línea recta rodilla-hombro.', 'Dejar la cadera atrás.'],
  168: ['De pie, empuja la mancuerna desde el hombro hasta bloquear sin arquear.', 'Aprieta glúteo y core para proteger la lumbar.', 'Arquear la espalda al empujar.'],
  // Movilidad
  179: ['En cuadrupedia, alterna redondear (gato) y arquear (vaca) la columna con la respiración.', 'Muévete lento vértebra a vértebra.', 'Forzar el rango bruscamente.'],
  181: ['En apoyo, dibuja círculos amplios con la rodilla movilizando la cadera.', 'Rango controlado en ambas direcciones.', 'Compensar con la zona lumbar.'],
  180: ['En cuadrupedia con una mano en la nuca, abre el codo rotando el tórax hacia el techo.', 'Rota desde la columna dorsal, no desde la lumbar.', 'Girar la cadera en vez del tórax.'],
  // Piernas
  206: ['Bisagra de cadera sobre una pierna bajando la barra mientras la otra se eleva atrás.', 'Cadera cuadrada y espalda neutra.', 'Abrir la cadera o redondear la espalda.'],
  205: ['A una pierna, baja controlando con la otra extendida al frente y sube sin apoyo.', 'Brazos al frente como contrapeso.', 'Colapsar la rodilla hacia dentro.'],
  190: ['Sobre una pierna, baja la kettlebell haciendo bisagra mientras la otra pierna sube atrás.', 'Movimiento lento buscando el equilibrio.', 'Redondear la espalda.'],
  189: ['Con el pie trasero elevado en un banco, baja la rodilla y sube con la pierna delantera.', 'Inclina ligeramente el torso para el glúteo.', 'Que la rodilla delantera colapse hacia dentro.'],
  191: ['Camina dando pasos largos bajando la rodilla trasera casi al suelo.', 'Torso erguido y paso amplio.', 'Dar pasos cortos que adelantan la rodilla.'],
  219: ['Bisagra de cadera con piernas casi rectas bajando las mancuernas pegadas.', 'Lleva la cadera atrás y aprieta el glúteo al subir.', 'Doblar mucho las rodillas o redondear la espalda.'],
  172: ['Baja sentándote en el cajón con control y levántate.', 'Toca sin dejarte caer.', 'Desplomarte en el cajón.'],
  173: ['Sujeta la pesa al pecho y baja a sentadilla profunda con el torso vertical.', 'Codos por dentro de las rodillas abajo.', 'Redondear la espalda.'],
  174: ['Sube al cajón apoyando todo el pie y extiende la cadera, alternando.', 'Empuja con el talón de la pierna de arriba.', 'Impulsarte con la pierna de abajo.'],
  // Pliométrico
  207: ['Salta con ambos pies a un cajón alto, cae amortiguando y extiende la cadera.', 'Aterriza suave con las rodillas alineadas.', 'Caer con las rodillas hacia dentro.'],
  208: ['Salta hacia delante lo más lejos posible y cae amortiguando con las dos piernas.', 'Usa los brazos para impulsarte.', 'Aterrizar rígido sin flexionar.'],
  216: ['Haz un burpee, salta a la barra y encadena una dominada en cada repetición.', 'Encadena con ritmo controlado.', 'Perder la técnica por la fatiga.'],
  217: ['Con dos mancuernas, burpee al suelo y llévalas de un envión sobre la cabeza.', 'Usa el impulso de cadera para subir el peso.', 'Subir el peso sólo con los brazos.'],
  218: ['Con mancuernas: flexión con remo a cada lado, salto y clean a press sobre la cabeza.', 'Mantén la espalda neutra en el remo.', 'Perder la postura en la fase de suelo.'],
  192: ['Salta con ambos pies al cajón, cae en cuclillas y extiende la cadera arriba.', 'Baja del cajón con control, no saltes hacia atrás.', 'Caer con las rodillas hacia dentro.'],
  // Tracción
  202: ['Dominada con chaleco o cinturón lastrado, tirando hasta pasar la barbilla la barra.', 'Añade peso progresivamente manteniendo el rango completo.', 'Acortar el recorrido por el lastre.'],
  204: ['Colgado, eleva el cuerpo horizontal bajo la barra boca arriba y mantén.', 'Deprime y retrae escápulas; progresa de tuck a straddle.', 'Dejar caer la cadera.'],
  203: ['Dominada explosiva pecho a la barra, transición sobre la barra y empuja a bloqueo.', 'Tira alto y mete el cuerpo rápido.', 'No subir suficiente antes de la transición.'],
  186: ['Con una banda en la barra bajo los pies, haz la dominada completa con ayuda.', 'Reduce la asistencia según ganes fuerza.', 'Rebotar en la parte baja de la banda.'],
  188: ['Tira de la cuerda hacia la cara abriendo los codos y rotando los hombros hacia fuera.', 'Aprieta las escápulas y no uses impulso.', 'Tirar con la lumbar o encoger el cuello.'],
  187: ['Bajo una barra baja o TRX, tira con un solo brazo llevando el pecho a la mano.', 'Mantén el cuerpo rígido y sin rotar la cadera.', 'Rotar el tronco para ayudarte.'],
  170: ['Cuelga de la barra con agarre firme, hombros activos y core estable.', 'Respira y aguanta; mejora el agarre.', 'Colgar pasivo encogiendo los hombros.'],
  171: ['Bajo una barra baja con los pies apoyados, tira del pecho a la barra.', 'Cuerpo recto y escápulas apretadas.', 'Dejar caer la cadera.'],
  169: ['Con el TRX, inclínate atrás con el cuerpo recto y tira del pecho a las manos.', 'Cuanto más horizontal, más difícil.', 'Doblar la cadera para ayudarte.'],
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
             WHERE id = $${vals.length} AND disciplina = 'funcional'`, vals);
        if (r.rowCount === 0) log.push(`⚠️ id ${id} no encontrado en funcional`);
      }
    }
    log.push(`como_hacerlo: ${comoN} · consejos: ${tipN} · errores_comunes: ${errN} · gif animado/estático: ${gifN} · gif anulado (skills/movilidad sin asset): ${gifNull}`);

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
