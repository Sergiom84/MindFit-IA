/**
 * fix_hipertrofia_catalog_quality.mjs
 *
 * Corrección de calidad de los ejercicios de hipertrofia en app.ejercicios
 * (disciplina='hipertrofia', 110 ejercicios). A diferencia de otras metodologías,
 * 68/110 ya tenían texto; aquí se completan los 42 restantes y se arreglan los GIFs.
 *
 *   1. Rellena como_hacerlo / consejos / errores_comunes / criterio_de_progreso
 *      en los 42 ejercicios que estaban vacíos.
 *   2. Arregla gif_url de los 67 ejercicios sin GIF, sin depender de RapidAPI:
 *      match CURADO contra free-exercise-db (culturismo, sin API key) revisando a
 *      mano los candidatos del mapper del repo; reutiliza GIFs animados del bucket
 *      Supabase para movimientos con equivalente; anula sólo skills sin asset.
 *
 * series_reps_objetivo ya está al 100%. Los gif_url existentes no se tocan.
 *
 * Uso:  node scripts/fix_hipertrofia_catalog_quality.mjs [--dry]
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
const FE = id => `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/${id}/0.jpg`;

// gif_url curado para los 67 ejercicios sin GIF (todos los ids FE verificados 200).
const GIF = {
  352: 'FE:Machine_Triceps_Extension', 377: 'FE:Dumbbell_Shoulder_Press', 421: 'FE:JM_Press',
  403: 'FE:Side_Lateral_Raise', 371: 'FE:Machine_Shoulder_Military_Press', 360: 'FE:Hack_Squat',
  390: 'FE:Barbell_Side_Split_Squat', 354: 'FE:Pallof_Press', 430: 'FE:Reverse_Machine_Flyes',
  332: 'FE:Side_Lateral_Raise', 382: 'FE:Seated_Cable_Rows', 379: 'SB:3293',
  396: 'FE:Barbell_Hip_Thrust', 330: 'FE:Dumbbell_Bicep_Curl', 367: 'FE:Concentration_Curls',
  404: 'FE:Farmers_Walk', 342: 'FE:Hack_Squat', 347: 'FE:Cable_Crunch', 427: 'FE:Dead_Bug',
  333: 'SB:1460', 329: 'FE:Dumbbell_Squat', 335: 'FE:Barbell_Curl', 368: 'FE:Barbell_Full_Squat',
  411: 'FE:Lying_Leg_Curls', 356: 'FE:Barbell_Curl', 372: 'SB:0032', 417: 'FE:Lying_Triceps_Press',
  351: 'FE:Leg_Extensions', 393: 'SB:0677', 402: 'FE:Dumbbell_Flyes', 391: 'FE:Bent-Arm_Dumbbell_Pullover',
  366: 'FE:Barbell_Curl', 334: 'SB:0544', 380: 'FE:V-Bar_Pulldown', 399: 'FE:Dumbbell_Step_Ups',
  388: 'FE:Calf_Press_On_The_Leg_Press_Machine', 364: 'SB:0677', 336: 'SB:0677',
  331: 'FE:Seated_Triceps_Press', 355: 'SB:0677', 395: 'FE:Seated_Leg_Curl', 436: 'FE:Barbell_Ab_Rollout',
  416: 'FE:Standing_Biceps_Cable_Curl', 410: 'FE:Seated_Calf_Raise', 363: 'FE:Dip_Machine',
  385: 'FE:Leg_Press', 407: 'FE:Thigh_Abductor', 408: 'FE:Standing_Calf_Raises',
  381: 'FE:Close-Grip_Front_Lat_Pulldown', 337: 'FE:Barbell_Shrug', 409: 'SB:0044',
  422: 'FE:Cable_Crossover', 423: 'FE:Butterfly', 373: 'FE:Barbell_Ab_Rollout',
  438: 'FE:Straight-Arm_Pulldown', 345: 'FE:Barbell_Full_Squat', 426: 'FE:Reverse_Machine_Flyes',
  370: 'SB:3419', 338: 'FE:Standing_Biceps_Cable_Curl', 361: 'FE:Leg_Press', 386: 'FE:Leg_Press',
  429: 'NULL', 374: 'NULL', 359: 'SB:2135', 341: 'FE:Crunches',
  431: 'FE:Hyperextensions_Back_Extensions', 428: 'FE:Decline_Crunch',
};

// [como_hacerlo, consejos, errores_comunes, criterio_de_progreso] para los 42 sin texto.
const T = {
  330: ['En el banco predicador, apoya el tríceps y flexiona el codo subiendo la mancuerna sin despegar el brazo.', 'Controla la bajada casi hasta la extensión.', 'Despegar el brazo del banco o usar impulso.', 'Sube carga al completar todas las series con bajada controlada.'],
  335: ['En el banco Scott, sube la barra flexionando el codo sin despegar los brazos y baja controlando.', 'No extiendas de golpe al final.', 'Rebotar en la parte baja.', 'Progresa en carga al completar el rango con técnica.'],
  338: ['Con la banda, mantén el codo flexionado a 90° resistiendo la tensión de forma isométrica.', 'Aprieta el bíceps y respira.', 'Perder el ángulo por la fatiga.', 'Aumenta el tiempo o la tensión de la banda al mejorar.'],
  353: ['De pie, flexiona un codo a la vez subiendo la mancuerna con supinación y baja controlando.', 'Sin balancear el torso; codo pegado.', 'Usar impulso de espalda.', 'Sube carga o reps con técnica estricta.'],
  356: ['Con la barra EZ, flexiona los codos subiendo la barra sin moverlos y baja controlando.', 'Codos fijos a los lados.', 'Balancear el cuerpo para subir.', 'Progresa en carga al completar el rango con control.'],
  362: ['De pie, flexiona los codos subiendo la barra hasta arriba y baja hasta casi extender.', 'Rango completo y sin impulso lumbar.', 'Acortar el recorrido.', 'Añade carga cuando completes todas las series limpias.'],
  366: ['Curl con barra hasta cerca del fallo, breve pausa y exprime repeticiones extra.', 'Mantén la técnica pese a la fatiga.', 'Perder la postura en las reps finales.', 'Aumenta reps totales antes de subir carga.'],
  367: ['Sentado, apoya el codo en el muslo y flexiona subiendo la mancuerna con máxima contracción.', 'Exprime el bíceps arriba 1s.', 'Mover el hombro para ayudarte.', 'Sube carga al lograr el pico de contracción en todas las reps.'],
  354: ['De pie con la banda al costado, extiende los brazos al frente resistiendo la rotación y vuelve.', 'Aprieta el core; no dejes que el tronco gire.', 'Rotar hacia la banda.', 'Aléjate de la banda o alarga el tiempo al mejorar el control.'],
  359: ['En plancha con un disco en la espalda, mantén el cuerpo alineado y el core apretado.', 'Retroversión pélvica; no hundas la cadera.', 'Arquear la lumbar bajo la carga.', 'Añade peso o tiempo cuando mantengas la técnica.'],
  370: ['En paralelas con lastre, eleva las piernas rectas al frente formando una L y mantén.', 'Deprime los hombros y empuja hacia abajo.', 'Encoger los hombros.', 'Aumenta tiempo o lastre al mantener la posición limpia.'],
  373: ['De rodillas o de pie, rueda hacia delante extendiendo el cuerpo y vuelve con el abdomen.', 'Mete la pelvis; no arquees la lumbar.', 'Hiperextender la espalda al estirar.', 'Progresa el rango o pasa a de pie al dominarlo.'],
  374: ['Tumbado agarrando un apoyo tras la cabeza, eleva el cuerpo recto y baja lento sin arquear.', 'Cuerpo como tabla; aprieta glúteo y abdomen.', 'Arquear la lumbar o doblar la cadera.', 'Aumenta reps o ralentiza la bajada al mejorar.'],
  427: ['Boca arriba con peso en las manos, baja brazo y pierna opuestos sin despegar la lumbar y alterna.', 'Muévete despacio con la lumbar pegada.', 'Arquear la espalda al extender.', 'Sube carga o reps manteniendo la lumbar estable.'],
  428: ['En banco declinado con un disco al pecho, flexiona el tronco elevando los hombros y baja controlando.', 'Enrolla la columna; no tires del cuello.', 'Usar impulso o tirar de la cabeza.', 'Añade carga al completar el rango con control.'],
  429: ['Tumbado, eleva el cuerpo con las rodillas recogidas (tuck) y baja lento controlando.', 'Progresa extendiendo las piernas poco a poco.', 'Arquear la lumbar.', 'Extiende más las piernas al ganar control.'],
  337: ['De pie con la barra, encoge los hombros hacia las orejas y baja controlando.', 'Sin rotar los hombros; sube en vertical.', 'Usar impulso o rotar los hombros.', 'Sube carga al completar el rango con pausa arriba.'],
  365: ['Sentado, parte con las palmas hacia ti y rota mientras empujas las mancuernas sobre la cabeza.', 'Rotación fluida y core firme.', 'Arquear la lumbar al empujar.', 'Progresa en carga manteniendo la rotación controlada.'],
  369: ['De pie, empuja una mancuerna desde el hombro sobre la cabeza estabilizando el core.', 'Aprieta glúteo y core anti-inclinación.', 'Inclinar el tronco hacia el lado.', 'Sube carga al mantener el tronco estable.'],
  371: ['De pie, empuja la barra sobre la cabeza con una pausa breve arriba, sin impulso de piernas.', 'Mete la cabeza al pasar la barra.', 'Arquear la lumbar para empujar.', 'Sube carga al completar las reps con pausa.'],
  372: ['Con agarre ancho, tira explosivo llevando la barra alto con los codos por encima.', 'Extiende la cadera antes de tirar con los brazos.', 'Tirar con los brazos antes de extender.', 'Sube carga manteniendo la altura del tirón.'],
  332: ['De pie junto a la polea baja, eleva el brazo lateral hasta la horizontal y baja controlando.', 'Lidera con el codo; no uses impulso.', 'Subir el hombro o balancearte.', 'Sube carga o reps con subida controlada.'],
  426: ['Con las poleas cruzadas, abre los brazos atrás juntando escápulas para el deltoides posterior.', 'Codos ligeramente flexionados; sin impulso.', 'Usar la espalda alta en vez del deltoides.', 'Progresa en carga con contracción controlada.'],
  329: ['De puntillas, inclina el torso atrás flexionando las rodillas hacia delante y sube.', 'Controla el rango; usa apoyo si hace falta.', 'Perder el equilibrio o forzar la rodilla.', 'Aumenta el rango o la carga al mejorar el control.'],
  333: ['Camina dando pasos largos bajando la rodilla trasera casi al suelo con mancuernas.', 'Torso erguido y paso amplio.', 'Dar pasos cortos que adelantan la rodilla.', 'Sube carga al completar la distancia con técnica.'],
  334: ['A una pierna con apoyo ligero, baja controlando con la otra extendida y sube.', 'Usa el apoyo sólo lo justo para el equilibrio.', 'Colapsar la rodilla hacia dentro.', 'Reduce la asistencia al ganar fuerza y equilibrio.'],
  349: ['En la prensa, baja la plataforma flexionando las rodillas hasta 90° y empuja sin bloquear.', 'No despegues la lumbar del respaldo.', 'Bajar tanto que se levante la pelvis.', 'Sube carga al completar el rango con control.'],
  350: ['Sujeta la pesa al pecho y baja a sentadilla profunda con el torso vertical.', 'Codos por dentro de las rodillas abajo.', 'Redondear la espalda.', 'Sube carga al dominar la profundidad y la técnica.'],
  351: ['En la máquina, extiende una rodilla hasta arriba y baja controlando.', 'Exprime el cuádriceps arriba 1s.', 'Usar impulso o rango parcial.', 'Sube carga o reps con extensión completa.'],
  357: ['Con el pie trasero en un banco, baja la rodilla y sube con la pierna delantera.', 'Inclina ligeramente el torso para el glúteo.', 'Que la rodilla delantera colapse.', 'Sube carga al completar las reps por pierna con control.'],
  360: ['En la hack squat, baja flexionando las rodillas con la espalda apoyada y empuja.', 'Pies a la anchura de hombros; rango completo.', 'Despegar la lumbar del respaldo.', 'Sube carga al completar el rango con control.'],
  361: ['En la prensa 45°, baja la plataforma flexionando las rodillas y empuja sin bloquear del todo.', 'Lumbar pegada al respaldo.', 'Bajar hasta levantar la pelvis.', 'Sube carga al completar el rango con técnica.'],
  368: ['Barra en la espalda, baja a sentadilla profunda con el torso lo más vertical posible y sube.', 'Codos bajo la barra y talones apoyados.', 'Redondear la espalda o levantar los talones.', 'Sube carga al mantener profundidad y postura.'],
  331: ['Sentado con la barra EZ sobre la cabeza, baja tras la nuca flexionando los codos y extiende.', 'Codos apuntando arriba y fijos.', 'Abrir los codos hacia fuera.', 'Sube carga al completar el rango sin molestia de codo.'],
  336: ['En paralelas con asistencia, baja el cuerpo y empuja centrando el trabajo en un lado.', 'Controla la bajada; usa la ayuda justa.', 'Bajar demasiado forzando el hombro.', 'Reduce la asistencia al ganar fuerza.'],
  352: ['En la máquina, extiende los codos empujando hacia abajo y vuelve controlando.', 'Codos pegados; exprime abajo.', 'Usar el torso para empujar.', 'Sube carga al completar el rango con control.'],
  355: ['En paralelas con lastre, baja hasta que el hombro pase el codo y empuja a bloqueo.', 'Ligera inclinación para pecho, vertical para tríceps.', 'Bajar demasiado forzando el hombro.', 'Sube el lastre al completar las reps limpias.'],
  358: ['Con la cuerda en polea alta, extiende los codos abriendo la cuerda abajo y vuelve controlando.', 'Codos pegados al cuerpo.', 'Mover los codos o usar el torso.', 'Sube carga o reps con extensión completa.'],
  363: ['En la máquina de fondos asistidos, baja y empuja controlando con la ayuda seleccionada.', 'Reduce la asistencia según progreses.', 'Bajar demasiado o rebotar.', 'Baja la asistencia al ganar fuerza.'],
  364: ['En paralelas con banda o ayuda, baja el cuerpo y empuja a bloqueo con técnica.', 'Controla la bajada; hombros abajo.', 'Encoger los hombros al bajar.', 'Reduce la asistencia progresivamente.'],
  393: ['En paralelas con lastre pesado, baja controlando y empuja a bloqueo.', 'Rango completo y core firme.', 'Rebotar en el fondo.', 'Sube el lastre al completar las reps con técnica.'],
  394: ['En paralelas con el torso vertical, baja poco flexionando sólo los codos y extiende para aislar el tríceps.', 'Mantén el torso vertical para el tríceps.', 'Inclinarte y convertirlo en fondo de pecho.', 'Sube reps o lastre manteniendo el aislamiento.'],
};

function gifUrl(v) {
  if (!v || v === 'NULL') return null;
  const i = v.indexOf(':');
  const k = v.slice(0, i), rest = v.slice(i + 1);
  return k === 'SB' ? SB(rest) : FE(rest);
}

async function main() {
  const client = await pool.connect();
  const log = [];
  try {
    await client.query('BEGIN');
    let comoN = 0, critN = 0, gifN = 0, gifNull = 0;

    const ids = new Set([...Object.keys(T), ...Object.keys(GIF)].map(Number));
    for (const id of ids) {
      const sets = [], vals = [];
      const push = (col, val) => { vals.push(val); sets.push(`${col} = $${vals.length}`); };

      if (T[id]) {
        push('como_hacerlo', T[id][0]);
        push('consejos', T[id][1]);
        push('errores_comunes', T[id][2]);
        push('criterio_de_progreso', T[id][3]);
        comoN++; critN++;
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
             WHERE id = $${vals.length} AND disciplina = 'hipertrofia'`, vals);
        if (r.rowCount === 0) log.push(`⚠️ id ${id} no encontrado en hipertrofia`);
      }
    }
    log.push(`textos (como/consejos/errores): ${comoN} · criterio_de_progreso: ${critN} · gif animado/estático: ${gifN} · gif anulado (skills sin asset): ${gifNull}`);

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
