/**
 * fix_halterofilia_catalog_quality.mjs
 *
 * Corrección integral de calidad de los ejercicios de halterofilia en
 * app.ejercicios (disciplina='halterofilia'):
 *   1. Rellena como_hacerlo (técnica breve) al 100% (antes 1/65).
 *   2. Rellena consejos y errores_comunes (antes 1/65).
 *   3. Arregla gif_url sin depender de RapidAPI (cuota agotada): reutiliza GIFs
 *      ANIMADOS del bucket Supabase para movimientos equivalentes (snatch, clean,
 *      jerk, sentadillas, tirones, press), conserva estáticos correctos de
 *      free-exercise-db y anula los sin asset fiable.
 *
 * series_reps_objetivo y criterio_de_progreso ya están al 100% → no se tocan.
 *
 * Uso:  node scripts/fix_halterofilia_catalog_quality.mjs [--dry]
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

// Sólo ids cuyo gif se CAMBIA. Se dejan intactos los estáticos correctos ya
// presentes: 269 C&J, 270 Split Jerk, 251 Clean+FS, 250 Power Jerk, 254/226 RDL,
// 231 Clean Deadlift, 227 Good Morning, 234 Hang Clean, 235 Hang Snatch,
// 221 Front Squat, 237 Behind-neck Press.
const GIF = {
  // Accesorios
  281: 'SB:1460', 283: 'SB:0085', 282: 'SB:1700', 256: 'SB:1460', 257: 'SB:1460',
  260: 'NULL', 258: 'SB:0032', 259: 'SB:1700', 236: 'SB:1460', 238: 'SB:2135',
  // Clean & Jerk
  276: 'SB:0537', 273: 'SB:0537', 268: 'SB:0537', 271: 'SB:0032', 274: 'SB:1700',
  247: 'SB:0032', 246: 'SB:0648', 245: 'SB:0648', 249: 'SB:1700', 233: 'SB:0648',
  // Fuerza Base
  277: 'FE:Barbell_Full_Squat', 272: 'SB:0042', 280: 'SB:0044', 279: 'SB:0042',
  253: 'FE:Barbell_Full_Squat', 248: 'SB:0042', 255: 'SB:1700', 222: 'FE:Barbell_Full_Squat',
  232: 'SB:0032', 229: 'SB:1700',
  // Snatch
  278: 'SB:0032', 264: 'SB:0529', 261: 'SB:0529', 262: 'SB:0529', 267: 'SB:0529',
  263: 'SB:0032', 240: 'SB:0529', 239: 'SB:0529', 242: 'SB:0032', 284: 'SB:0529',
  // Técnica
  265: 'SB:0069', 266: 'SB:0069', 275: 'SB:1700', 244: 'SB:0529', 243: 'SB:0069',
  241: 'SB:0069', 252: 'SB:0648', 224: 'SB:0648', 223: 'SB:0529', 220: 'SB:0069',
  228: 'SB:1700', 225: 'SB:0069', 230: 'SB:1700',
};

// como_hacerlo / consejos / errores_comunes por id
const T = {
  // Accesorios
  281: ['Con la barra bloqueada arriba en agarre de arrancada, haz zancadas manteniéndola estable.', 'Codos bloqueados y mirada al frente; core firme.', 'Perder la verticalidad de la barra.'],
  283: ['Con agarre ancho, bisagra de cadera bajando la barra pegada con espalda neutra.', 'Lleva la cadera atrás y aprieta los dorsales.', 'Redondear la espalda alta.'],
  282: ['En el fondo de la sentadilla frontal, presiona la barra sobre la cabeza sin subir.', 'Exige mucha movilidad de hombro y dorsal; ve ligero.', 'Subir la cadera para ayudarte a empujar.'],
  256: ['Con el pie trasero elevado y la barra en la espalda, baja la rodilla y sube.', 'Torso ligeramente inclinado para el glúteo.', 'Que la rodilla delantera colapse.'],
  257: ['Con la barra bloqueada arriba, camina en zancadas manteniéndola estable.', 'Estabiliza el hombro y aprieta el core.', 'Arquear la lumbar bajo la carga.'],
  260: ['Desde el suelo con el torso paralelo, tira de la barra al abdomen y devuélvela al suelo.', 'Espalda neutra y tirón explosivo desde parado.', 'Usar impulso de cadera o redondear la espalda.'],
  258: ['Con agarre ancho, tira explosivo llevando la barra alto con los codos por encima.', 'Extiende la cadera antes de tirar con los brazos.', 'Tirar con los brazos antes de extender.'],
  259: ['En el fondo de la sentadilla frontal, presiona la barra sobre la cabeza con carga ligera.', 'Trabaja la movilidad; mantén el torso vertical.', 'Perder la posición de sentadilla.'],
  236: ['Con la barra bloqueada arriba (ligera), camina en zancadas controladas.', 'Codos bloqueados y mirada al frente.', 'Dejar caer la barra adelante.'],
  238: ['En posición de plancha/hueco, mantén el cuerpo alineado con el core apretado.', 'Retroversión pélvica; no hundas la cadera.', 'Arquear la lumbar.'],
  237: ['Con agarre ancho y barra tras la nuca, presiona sobre la cabeza.', 'Requiere movilidad de hombro; carga conservador.', 'Empujar con la cabeza adelantada.'],
  // Clean & Jerk
  269: ['Cargada al hombro desde el suelo y jerk sobre la cabeza en dos tiempos.', 'Extensión completa de cadera antes de meterte bajo la barra.', 'Tirar con los brazos antes de la triple extensión.'],
  276: ['Haz una cargada y encadena tres sentadillas frontales sin soltar la barra.', 'Mantén los codos altos en cada sentadilla.', 'Dejar caer los codos y perder el rack.'],
  273: ['Encadena power clean, clean completo y jerk sin soltar la barra.', 'Controla la fatiga técnica en cada fase.', 'Perder la postura al acumular repeticiones.'],
  268: ['Tira la barra del suelo y recíbela en sentadilla profunda al hombro, y levántate.', 'Barra pegada al cuerpo durante todo el tirón.', 'Separar la barra del cuerpo en el tirón.'],
  271: ['Tirón de cargada con sobrecarga: triple extensión potente sin recibir la barra.', 'Termina en puntillas encogiendo los trapecios.', 'Doblar los brazos pronto.'],
  274: ['Desde bloques y barra tras la nuca, dip y empuje metiéndote bajo la barra.', 'Empuje vertical y recepción firme.', 'Empujar la barra hacia delante.'],
  270: ['Dip y empuje explosivo metiéndote bajo la barra en tijera, y recupera los pies.', 'Pie delantero plano, trasero en punta; barra sobre la nuca.', 'Tijera corta o barra adelantada.'],
  251: ['Cargada al hombro seguida de una sentadilla frontal, sin soltar la barra.', 'Codos altos y torso erguido en la sentadilla.', 'Perder el rack frontal.'],
  247: ['Tirón de cargada desde el suelo con triple extensión, sin recibir la barra.', 'Acelera la barra tras pasar las rodillas.', 'Tirar con los brazos antes de extender.'],
  246: ['Desde la rodilla, tira y recibe la barra al hombro en sentadilla.', 'Inicia con una bisagra hasta la rodilla.', 'Redondear la espalda en el hang.'],
  245: ['Tira la barra del suelo y recíbela al hombro por encima de media sentadilla.', 'Codos rápidos al recibir.', 'Recibir con los codos bajos.'],
  250: ['Dip y empuje recibiendo la barra en media sentadilla con los pies casi fijos.', 'Empuje vertical potente y recepción firme.', 'Empujar la barra hacia delante.'],
  249: ['Dip de piernas y empuje explosivo metiéndote bajo la barra con los pies fijos.', 'Usa el impulso de piernas, no sólo los hombros.', 'Empezar el empuje con los brazos.'],
  233: ['Desde encima de la rodilla, tira y recibe la barra al hombro en media sentadilla.', 'Mantén la barra cerca del cuerpo.', 'Alejar la barra en el tirón.'],
  234: ['Desde el hang, tirón de cargada con triple extensión sin recibir la barra.', 'Extiende la cadera antes de encogerte.', 'Doblar los brazos pronto.'],
  // Fuerza Base
  277: ['Barra en la espalda alta, baja la cadera bajo la rodilla y sube extendiendo.', 'Aprieta el core y mantén el pecho alto.', 'Redondear la espalda o levantar los talones.'],
  272: ['Barra en rack frontal con codos altos, sentadilla profunda con torso vertical.', 'Mantén los codos arriba en todo el recorrido.', 'Dejar caer los codos.'],
  280: ['Barra en la espalda, bisagra de cadera bajando el torso con piernas casi rectas.', 'Espalda neutra y cadera atrás; carga conservador.', 'Flexionar mucho la rodilla o redondear la espalda.'],
  279: ['Sentadilla frontal con pausa de 2-3s en el fondo antes de subir.', 'Mantén la tensión y los codos altos en la pausa.', 'Relajar el core en la pausa.'],
  253: ['Sentadilla trasera con carga alta bajando bajo el paralelo y subiendo.', 'Controla la bajada y empuja el suelo al subir.', 'Colapsar las rodillas hacia dentro.'],
  248: ['Barra en rack frontal, baja a sentadilla profunda y sube con torso erguido.', 'Codos altos y talones apoyados.', 'Perder el rack frontal.'],
  254: ['Bisagra de cadera con piernas casi rectas bajando la barra pegada.', 'Cadera atrás y aprieta el glúteo al subir.', 'Redondear la espalda.'],
  255: ['De pie sin impulso de piernas, empuja la barra sobre la cabeza hasta bloquear.', 'Aprieta glúteo y core; la barra termina sobre la nuca.', 'Arquear la lumbar para empujar.'],
  222: ['Barra en la espalda, baja la cadera bajo la rodilla y sube extendiendo.', 'Rodillas siguiendo la línea de los pies.', 'Levantar los talones.'],
  231: ['Peso muerto con agarre de cargada: empuja el suelo y extiende cadera y rodillas.', 'Barra pegada y espalda neutra.', 'Adelantar la cadera antes que el pecho.'],
  227: ['Barra en la espalda, bisagra de cadera bajando el torso con piernas casi rectas.', 'Cadera atrás y espalda neutra.', 'Redondear la espalda.'],
  232: ['Desde medio muslo, tirón con triple extensión sin recibir la barra.', 'Encoge los trapecios al final del tirón.', 'Tirar con los brazos temprano.'],
  235: ['Desde el hang con agarre ancho, tirón de arrancada con triple extensión.', 'Barra pegada y aceleración al final.', 'Doblar los brazos pronto.'],
  226: ['Bisagra de cadera con piernas casi rectas bajando la barra pegada.', 'Lleva la cadera atrás y aprieta el glúteo.', 'Doblar mucho las rodillas.'],
  229: ['De pie, empuja la barra desde los hombros sobre la cabeza sin impulso de piernas.', 'Mete la cabeza al pasar la barra.', 'Arquear la espalda.'],
  // Snatch
  278: ['Tirón de arrancada desde un déficit (de pie sobre discos) con triple extensión.', 'Aumenta el recorrido manteniendo la barra pegada.', 'Redondear la espalda en el mayor rango.'],
  264: ['Encadena snatch pull, power snatch y snatch completo sin soltar la barra.', 'Controla la técnica pese a la fatiga.', 'Perder la postura al acumular fases.'],
  261: ['De un tirón lleva la barra del suelo a brazos extendidos recibiéndola en sentadilla.', 'Barra pegada y velocidad bajo la barra.', 'Separar la barra del cuerpo.'],
  262: ['Desde bloques a la altura de la rodilla, arranque completo a sentadilla.', 'Explota desde la posición de bloque.', 'Tirar sin extender la cadera.'],
  267: ['Encadena un tirón alto de arrancada y una arrancada completa.', 'Mantén la trayectoria de la barra en ambas.', 'Perder la postura entre fases.'],
  263: ['Tirón de arrancada con sobrecarga: triple extensión potente sin recibir.', 'Termina en puntillas encogiendo los trapecios.', 'Doblar los brazos pronto.'],
  240: ['Desde medio muslo, arranque completo a sentadilla en un tiempo.', 'Inicia con una bisagra manteniendo la barra pegada.', 'Perder la verticalidad del tirón.'],
  239: ['Arranque recibiendo la barra por encima de media sentadilla.', 'Extensión completa antes de meterte debajo.', 'Recibir sin bloquear los codos.'],
  242: ['Tirón de arrancada desde el suelo con triple extensión, sin recibir.', 'Acelera la barra tras las rodillas.', 'Tirón con los brazos temprano.'],
  284: ['Desde encima de la rodilla, arranque de potencia a brazos extendidos.', 'Barra pegada y recepción alta.', 'Alejar la barra del cuerpo.'],
  // Técnica
  265: ['Sin impulso de piernas, mete el cuerpo bajo la barra recibiéndola en sentadilla con brazos bloqueados.', 'Velocidad bajo la barra; codos firmes.', 'Empujar la barra en vez de meterte debajo.'],
  266: ['Con la barra bloqueada arriba en agarre ancho, baja a sentadilla profunda manteniéndola sobre la cabeza.', 'Torso vertical y barra ligeramente atrás.', 'Dejar caer la barra adelante.'],
  275: ['De puntillas sin dip, mete el cuerpo bajo la barra recibiéndola sobre la cabeza.', 'Trabaja la velocidad de recepción del jerk.', 'Hacer un dip para ayudarte.'],
  244: ['Arranque sin sentadilla ni reagrupamiento, llevando la barra arriba con los brazos.', 'Mantén la barra pegada y los codos altos.', 'Recibir en sentadilla (deja de ser muscle).'],
  243: ['Barra bloqueada arriba en agarre ancho, sentadilla profunda con torso vertical.', 'Empuja la barra hacia arriba y atrás.', 'Inclinar el torso adelante.'],
  241: ['Con la barra en la espalda, empújate bajo ella recibiéndola en sentadilla con brazos extendidos.', 'Reacciona rápido metiéndote debajo.', 'Empujar la barra en vez de bajar el cuerpo.'],
  252: ['De puntillas sin extensión, mete el cuerpo bajo la barra recibiéndola al hombro.', 'Codos rapidísimos en la recepción.', 'Tirar de la barra hacia arriba en exceso.'],
  221: ['Barra en rack frontal con codos altos, sentadilla profunda controlada.', 'Ideal para técnica: mantén los codos arriba.', 'Dejar caer los codos.'],
  224: ['Cargada sin sentadilla ni reagrupamiento, llevando la barra al hombro con los brazos.', 'Herramienta técnica con PVC; codos rápidos.', 'Recibir en sentadilla.'],
  223: ['Arranque sin sentadilla llevando el PVC arriba con los brazos.', 'Barra pegada y trayectoria vertical.', 'Alejar la barra del cuerpo.'],
  220: ['Con el PVC bloqueado arriba en agarre ancho, sentadilla profunda con torso vertical.', 'Trabaja la movilidad de hombro y tobillo.', 'Perder la verticalidad del torso.'],
  228: ['Dip corto de piernas y empuja la barra sobre la cabeza aprovechando el impulso.', 'Sincroniza el dip con el empuje.', 'Empezar con los brazos antes que las piernas.'],
  225: ['Con la barra o PVC en la espalda, empújate bajo ella recibiéndola en sentadilla.', 'Herramienta técnica: reacciona rápido debajo.', 'Empujar la barra en vez de bajar.'],
  230: ['En el fondo de la sentadilla frontal, presiona el PVC sobre la cabeza.', 'Ejercicio de movilidad; mantén el torso vertical.', 'Subir la cadera para empujar.'],
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
             WHERE id = $${vals.length} AND disciplina = 'halterofilia'`, vals);
        if (r.rowCount === 0) log.push(`⚠️ id ${id} no encontrado en halterofilia`);
      }
    }
    log.push(`como_hacerlo: ${comoN} · consejos: ${tipN} · errores_comunes: ${errN} · gif animado/estático: ${gifN} · gif anulado (sin asset): ${gifNull}`);

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
