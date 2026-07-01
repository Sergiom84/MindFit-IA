/**
 * fix_heavyduty_catalog_quality.mjs
 *
 * Corrección integral de calidad de los ejercicios de Heavy Duty (HIT/Mentzer)
 * en app.ejercicios (disciplina='heavy_duty', 44 ejercicios):
 *   1. Rellena como_hacerlo / consejos / errores_comunes / criterio_de_progreso
 *      al 100% (antes 0/44). El criterio refleja la filosofía HIT (progreso al
 *      alcanzar el fallo muscular en el rango objetivo).
 *   2. Arregla gif_url de los 22 sin GIF sin depender de RapidAPI: free-exercise-db
 *      (culturismo/máquinas; ids ya verificados 200 en las metodologías previas) y
 *      Supabase animado (fondos 0677).
 *
 * series_reps_objetivo y criterio ya... (criterio estaba a 44/44 en total pero
 * vacío en como/consejos/errores). Los gif_url existentes no se tocan.
 *
 * Uso:  node scripts/fix_heavyduty_catalog_quality.mjs [--dry]
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

// gif_url para los 22 sin GIF (todos los ids FE verificados 200; SB verificado 200).
const GIF = {
  311: 'FE:Close-Grip_Front_Lat_Pulldown', 319: 'FE:Cable_Crunch', 289: 'FE:Seated_Cable_Rows',
  290: 'FE:Straight-Arm_Pulldown', 304: 'FE:Straight-Arm_Pulldown', 321: 'FE:Close-Grip_Front_Lat_Pulldown',
  299: 'FE:Calf_Press_On_The_Leg_Press_Machine', 318: 'FE:Standing_Calf_Raises', 325: 'FE:Standing_Calf_Raises',
  298: 'FE:Barbell_Hip_Thrust', 324: 'FE:Barbell_Shoulder_Press', 309: 'FE:Reverse_Machine_Flyes',
  316: 'FE:Romanian_Deadlift', 287: 'FE:Butterfly', 302: 'FE:Butterfly', 322: 'SB:0677',
  295: 'FE:Leg_Press', 315: 'FE:Leg_Press', 320: 'FE:Barbell_Full_Squat', 297: 'FE:Lying_Leg_Curls',
  312: 'FE:Lying_Triceps_Press', 313: 'SB:0677',
};

// [como_hacerlo, consejos, errores_comunes, criterio_de_progreso] para los 44.
const T = {
  294: ['Sentado en la máquina, flexiona los codos subiendo hasta la contracción máxima y baja controlando.', 'Codos fijos; exprime arriba.', 'Usar impulso del torso.', 'Al llegar al fallo muscular en el rango, sube carga la próxima sesión.'],
  310: ['De pie con la barra Z, flexiona los codos sin moverlos y baja hasta casi extender.', 'Codos pegados a los lados.', 'Balancear el cuerpo para subir.', 'Sube carga cuando alcances el fallo con técnica.'],
  311: ['Con agarre supino a la anchura de hombros, tira de la barra al pecho llevando los codos abajo.', 'Aprieta dorsales y bíceps; pecho alto.', 'Balancear el torso para tirar.', 'Sube carga al llegar al fallo en el rango.'],
  300: ['En la máquina, flexiona el tronco enrollando la columna contra la resistencia y vuelve.', 'Exhala al contraer; sin tirar del cuello.', 'Usar la cadera en vez del abdomen.', 'Sube carga o reps al alcanzar el fallo con control.'],
  301: ['De pie con la polea al costado, extiende los brazos al frente resistiendo la rotación y vuelve.', 'Aprieta el core; no dejes que el tronco gire.', 'Rotar hacia la polea.', 'Aumenta carga o tiempo al mejorar el control anti-rotación.'],
  319: ['De rodillas ante la polea alta con cuerda, enrolla la columna acercando los codos a los muslos.', 'Redondea la espalda; sin tirar con los brazos.', 'Flexionar la cadera en vez del abdomen.', 'Sube carga al alcanzar el fallo con técnica.'],
  288: ['Agarre ancho, tira de la barra al pecho llevando los codos abajo y atrás.', 'Pecho alto; aprieta las escápulas.', 'Balancearte o tirar tras la nuca.', 'Sube carga al llegar al fallo en el rango completo.'],
  289: ['Sentado, tira del agarre al abdomen apretando la espalda y vuelve controlando.', 'Pecho alto y sin impulso lumbar.', 'Redondear la espalda o usar impulso.', 'Sube carga al alcanzar el fallo con técnica.'],
  290: ['Con brazos casi rectos, lleva el agarre desde arriba hacia los muslos abriendo el dorsal.', 'Movimiento amplio con el dorsal, no con los codos.', 'Flexionar mucho los codos.', 'Sube carga al llegar al fallo con rango completo.'],
  304: ['De pie ante la polea alta con barra recta y brazos casi rectos, baja hasta los muslos con el dorsal.', 'Siente el estiramiento arriba y aprieta abajo.', 'Convertirlo en un jalón flexionando los codos.', 'Sube carga al alcanzar el fallo controlado.'],
  305: ['Agarre supino, tira de la barra al pecho llevando los codos abajo; enfatiza dorsal y bíceps.', 'Pecho alto; codos pegados al cuerpo.', 'Balancear el torso.', 'Sube carga al llegar al fallo en el rango.'],
  306: ['Con el torso inclinado ~45° y espalda neutra, tira de la barra al abdomen y baja controlando.', 'Aprieta escápulas; sin impulso lumbar.', 'Redondear la espalda.', 'Sube carga al alcanzar el fallo con técnica.'],
  327: ['Desde el suelo con el torso paralelo, tira de la barra al abdomen y devuélvela al suelo.', 'Espalda neutra y tirón explosivo desde parado.', 'Usar impulso de cadera o redondear la espalda.', 'Sube carga al llegar al fallo manteniendo el torso paralelo.'],
  323: ['Con pies a la anchura de caderas, empuja el suelo y extiende cadera y rodillas con la barra pegada.', 'Pecho alto y barra pegada a las piernas.', 'Redondear la espalda o adelantar la cadera.', 'Sube carga al bloquear con técnica limpia (fallo técnico, no muscular).'],
  321: ['Con agarre supino en la polea alta, tira de la barra al pecho llevando los codos abajo.', 'Aprieta dorsales y bíceps; pecho alto.', 'Balancear el torso.', 'Sube carga al alcanzar el fallo en el rango.'],
  299: ['En la prensa con las puntas en el borde, empuja extendiendo los tobillos y baja estirando.', 'Pausa arriba y estira abajo el rango completo.', 'Rebotar sin control.', 'Sube carga al alcanzar el fallo con rango completo.'],
  318: ['De pie, sube al máximo de puntillas y baja controlando el rango completo.', 'Pausa arriba y estira abajo.', 'Rebotar con impulso.', 'Sube carga o reps al llegar al fallo.'],
  325: ['De pie con carga, sube al máximo de puntillas y baja estirando el gemelo.', 'Rango completo con pausa arriba.', 'Acortar el recorrido.', 'Sube carga al alcanzar el fallo con control.'],
  298: ['Con la espalda alta apoyada y la resistencia en la cadera, empuja hasta la extensión completa.', 'Aprieta el glúteo arriba y mete la barbilla.', 'Hiperextender la lumbar en vez del glúteo.', 'Sube carga al bloquear con glúteo hasta el fallo.'],
  328: ['Con la espalda alta en un banco y la barra en la cadera, empuja la cadera hasta la extensión.', 'Retroversión pélvica arriba; barbilla metida.', 'Empujar con la lumbar.', 'Sube carga al alcanzar el fallo con glúteo.'],
  291: ['Sentado, empuja las asas desde los hombros sobre la cabeza y baja controlando.', 'Core firme; sin arquear.', 'Rango parcial arriba.', 'Sube carga al alcanzar el fallo en el rango.'],
  308: ['Sentado o de pie, empuja las mancuernas desde los hombros sobre la cabeza.', 'Aprieta glúteo y core; sin arquear.', 'Arquear la lumbar para empujar.', 'Sube carga al llegar al fallo con técnica.'],
  324: ['Empuja la barra desde los hombros sobre la cabeza (o tras la nuca con movilidad suficiente).', 'Sólo tras nuca si tienes movilidad de hombro.', 'Bajar tras la nuca sin control.', 'Sube carga al alcanzar el fallo estricto.'],
  292: ['En la máquina, eleva los brazos lateralmente hasta la horizontal liderando con el codo.', 'Sin impulso; controla la bajada.', 'Subir por encima de la horizontal con el trapecio.', 'Sube carga al llegar al fallo con técnica.'],
  307: ['De pie, eleva las mancuernas lateralmente hasta la horizontal liderando con el codo y baja controlando.', 'Ligera inclinación del meñique arriba; sin balanceo.', 'Usar impulso del torso.', 'Sube carga al alcanzar el fallo con control.'],
  309: ['Con codos ligeramente flexionados, abre los brazos atrás juntando escápulas para el deltoides posterior.', 'Sin impulso; contracción controlada.', 'Usar la espalda alta en vez del deltoides.', 'Sube carga al llegar al fallo con técnica.'],
  317: ['En la máquina, flexiona las rodillas llevando los talones bajo el asiento y vuelve controlando.', 'Exprime el isquio abajo; sin levantar la cadera.', 'Usar impulso.', 'Sube carga al alcanzar el fallo con rango completo.'],
  316: ['Bisagra de cadera con piernas casi rectas bajando la barra pegada.', 'Cadera atrás y aprieta el glúteo al subir.', 'Doblar mucho las rodillas o redondear la espalda.', 'Sube carga al llegar al fallo con espalda neutra.'],
  285: ['Sentado, empuja las asas al frente hasta extender y vuelve controlando.', 'Retrae escápulas; sin bloquear de golpe.', 'Despegar la espalda del respaldo.', 'Sube carga al alcanzar el fallo en el rango.'],
  286: ['En banco inclinado, baja las mancuernas a la altura del pecho y empuja juntándolas arriba.', 'Controla el rango; no choques las mancuernas.', 'Bajar demasiado forzando el hombro.', 'Sube carga al llegar al fallo con control.'],
  287: ['En la máquina, junta los brazos al frente apretando el pecho y vuelve controlando el estiramiento.', 'Codos a la altura de los hombros; aprieta al centro.', 'Usar impulso o rango parcial.', 'Sube carga al alcanzar el fallo con contracción completa.'],
  302: ['En la máquina, junta los brazos al frente apretando el pecho y controla el estiramiento al abrir.', 'Aprieta 1s al centro.', 'Abrir demasiado forzando el hombro.', 'Sube carga al llegar al fallo con control.'],
  303: ['En banco inclinado, baja la barra a la parte alta del pecho y empuja.', 'No bajes hacia el cuello; escápulas retraídas.', 'Despegar los glúteos.', 'Sube carga al alcanzar el fallo con técnica.'],
  326: ['Tumbado, baja la barra al pecho, pausa breve y empuja hasta extender.', 'Retrae escápulas y mantén los pies firmes.', 'Rebotar la barra en el pecho.', 'Sube carga al llegar al fallo manteniendo la pausa.'],
  322: ['En paralelas, baja hasta que el hombro pase el codo y empuja a bloqueo; inclínate para el pecho.', 'Ligera inclinación para pecho, vertical para tríceps.', 'Bajar demasiado forzando el hombro.', 'Añade lastre al alcanzar el fallo con técnica.'],
  295: ['Baja la plataforma flexionando las rodillas hasta ~90° y empuja sin bloquear del todo.', 'Lumbar pegada al respaldo.', 'Bajar hasta levantar la pelvis.', 'Sube carga al alcanzar el fallo con control.'],
  296: ['En la máquina, extiende las rodillas hasta arriba y baja controlando.', 'Exprime el cuádriceps arriba 1s.', 'Usar impulso o rango parcial.', 'Sube carga al llegar al fallo con extensión completa.'],
  314: ['En la máquina, extiende las rodillas hasta la contracción máxima y baja controlando.', 'Pausa arriba; controla la bajada.', 'Balancear la carga.', 'Sube carga al alcanzar el fallo con control.'],
  315: ['Baja la plataforma flexionando las rodillas y empuja sin bloquear del todo.', 'No despegues la lumbar del respaldo.', 'Rango parcial.', 'Sube carga al llegar al fallo con rango completo.'],
  320: ['Barra en la espalda, baja la cadera bajo la rodilla con el torso erguido y sube.', 'Talones apoyados; rodillas alineadas.', 'Redondear la espalda o levantar los talones.', 'Sube carga al alcanzar el fallo técnico con profundidad.'],
  297: ['Tumbado en la máquina, flexiona las rodillas llevando los talones al glúteo y baja controlando.', 'Sin levantar la cadera del apoyo.', 'Usar impulso.', 'Sube carga al llegar al fallo con rango completo.'],
  293: ['Con la barra o cuerda en polea alta, extiende los codos hacia abajo y vuelve controlando.', 'Codos pegados al cuerpo.', 'Mover los codos o usar el torso.', 'Sube carga al alcanzar el fallo con extensión completa.'],
  312: ['Tumbado con la barra Z, baja hacia la frente flexionando los codos y extiende.', 'Codos fijos apuntando arriba.', 'Abrir los codos hacia fuera.', 'Sube carga al llegar al fallo sin molestia de codo.'],
  313: ['En paralelas con el torso vertical, baja flexionando los codos y empuja a bloqueo para el tríceps.', 'Mantén el torso vertical para el tríceps.', 'Inclinarte y cargar el pecho.', 'Añade lastre al alcanzar el fallo con técnica.'],
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
    let comoN = 0, gifN = 0, gifNull = 0;

    const ids = new Set([...Object.keys(T), ...Object.keys(GIF)].map(Number));
    for (const id of ids) {
      const sets = [], vals = [];
      const push = (col, val) => { vals.push(val); sets.push(`${col} = $${vals.length}`); };

      if (T[id]) {
        push('como_hacerlo', T[id][0]);
        push('consejos', T[id][1]);
        push('errores_comunes', T[id][2]);
        push('criterio_de_progreso', T[id][3]);
        comoN++;
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
             WHERE id = $${vals.length} AND disciplina = 'heavy_duty'`, vals);
        if (r.rowCount === 0) log.push(`⚠️ id ${id} no encontrado en heavy_duty`);
      }
    }
    log.push(`textos completos: ${comoN} · gif animado/estático: ${gifN} · gif anulado: ${gifNull}`);

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
