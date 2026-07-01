/**
 * fix_powerlifting_catalog_quality.mjs
 *
 * Corrección integral de calidad de los ejercicios de powerlifting en
 * app.ejercicios (disciplina='powerlifting', 77 ejercicios):
 *   1. Rellena como_hacerlo / consejos / errores_comunes / criterio_de_progreso
 *      al 100% (antes 0/77).
 *   2. Arregla gif_url de los 54 sin GIF sin depender de RapidAPI: como casi todo
 *      son variantes de los 3 básicos (sentadilla/banca/peso muerto), se reutiliza
 *      el GIF base correcto (Supabase animado para el peso muerto, free-exercise-db
 *      para sentadilla/banca) y assistance con su fedb específico.
 *
 * series_reps_objetivo ya está al 100%. Los gif_url existentes no se tocan.
 *
 * Uso:  node scripts/fix_powerlifting_catalog_quality.mjs [--dry]
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

const SQUAT = 'FE:Barbell_Full_Squat';
const BENCH = 'FE:Barbell_Bench_Press_-_Medium_Grip';
const DL = 'SB:0032';

// gif_url para los 54 sin GIF (ids FE verificados 200; SB verificado 200).
const GIF = {
  // Asistencia Inferior
  453: 'FE:Barbell_Side_Split_Squat', 481: SQUAT, 482: 'FE:Glute_Ham_Raise',
  483: 'FE:Dumbbell_Step_Ups', 509: 'SB:1460',
  // Asistencia Superior
  458: 'FE:Seated_Triceps_Press', 460: 'FE:Bent_Over_Barbell_Row', 485: 'FE:Bent_Over_Barbell_Row',
  486: 'FE:Band_Pull_Apart', 514: 'FE:Barbell_Shoulder_Press',
  // Peso Muerto (variantes → DL animado; sumo/específicos aparte)
  450: DL, 451: DL, 452: DL, 475: DL, 476: DL, 477: DL, 478: DL, 479: DL, 480: DL,
  493: DL, 494: DL, 495: DL, 504: DL, 506: DL, 507: 'FE:Sumo_Deadlift',
  // Press Banca (variantes → banca base; narrow → close grip)
  444: BENCH, 445: BENCH, 446: BENCH, 448: BENCH, 468: BENCH, 470: 'FE:Close-Grip_Barbell_Bench_Press',
  471: BENCH, 472: BENCH, 473: BENCH, 474: BENCH, 490: BENCH, 491: BENCH, 492: BENCH, 500: BENCH,
  // Sentadilla (variantes → back squat base; front → animado)
  439: SQUAT, 440: SQUAT, 441: SQUAT, 442: SQUAT, 461: SQUAT, 463: SQUAT, 464: SQUAT,
  465: SQUAT, 466: SQUAT, 467: SQUAT, 487: SQUAT, 488: SQUAT, 489: SQUAT, 496: SQUAT, 499: 'SB:0042',
};

// [como_hacerlo, consejos, errores_comunes, criterio_de_progreso] para los 77.
const T = {
  // Sentadilla
  439: ['Con la barra en la espalda baja (sobre el deltoides posterior), baja la cadera bajo el paralelo y sube.', 'Torso algo más inclinado; empuja con toda la planta.', 'Levantar los talones o redondear la espalda.', 'Sube carga al alcanzar profundidad de competición con técnica.'],
  440: ['Sentadilla con 2s de pausa en el fondo sin perder tensión, y sube.', 'Mantén la presión abdominal en la pausa.', 'Relajar y rebotar tras la pausa.', 'Sube carga manteniendo la pausa firme.'],
  441: ['Baja en 3s controlados, sin pausa, y sube en 1s manteniendo la técnica.', 'Cuenta el tempo mentalmente.', 'Acelerar la bajada.', 'Sube carga respetando el tempo completo.'],
  442: ['Con la barra de seguridad sobre los hombros, baja a sentadilla manteniendo el torso erguido.', 'Resiste la tendencia a irte adelante.', 'Dejar caer el pecho.', 'Sube carga al mantener el torso vertical.'],
  443: ['Barra en rack frontal con codos altos, baja a sentadilla profunda con torso vertical.', 'Mantén los codos arriba en todo el recorrido.', 'Dejar caer los codos.', 'Sube carga al conservar el rack frontal.'],
  461: ['Sentadilla de competición a máxima carga con profundidad válida (cadera bajo la rodilla).', 'Sigue el ritual: prepara, desciende, empuja.', 'No alcanzar la profundidad válida.', 'Progresa acercándote a tu 1RM con técnica válida.'],
  462: ['Con los pies muy abiertos y puntas afuera, baja empujando las rodillas hacia fuera.', 'Enfatiza cadera y aductores.', 'Que las rodillas colapsen hacia dentro.', 'Sube carga al mantener las rodillas alineadas.'],
  463: ['Sentadilla con 3s de pausa en el fondo sin perder tensión y sube.', 'Máxima presión abdominal durante la pausa.', 'Perder la tensión en la pausa.', 'Sube carga manteniendo la pausa larga.'],
  464: ['En el rack con pines al fondo, arranca la sentadilla desde parado sin rebote.', 'Genera tensión antes de empujar.', 'Rebotar en los pines.', 'Sube carga arrancando limpio desde los pines.'],
  465: ['Arranca la sentadilla desde el fondo (barra en pines bajos) sin fase excéntrica.', 'Explota desde parado con el core firme.', 'Impulso de cadera descontrolado.', 'Sube carga manteniendo el arranque limpio.'],
  466: ['Sentadilla con bandas que aumentan la resistencia arriba; controla abajo y explota.', 'Acelera para vencer la tensión creciente.', 'Frenar en la subida.', 'Sube carga o tensión de banda al mejorar la velocidad.'],
  467: ['Sentadilla con cadenas que se descargan abajo y cargan arriba; explota en la subida.', 'Mantén la técnica pese al cambio de carga.', 'Perder la postura arriba.', 'Sube carga al mantener la velocidad de subida.'],
  487: ['Sentadilla a esfuerzo máximo (1-3RM) con técnica de competición.', 'Calienta progresivo y usa observadores.', 'Sacrificar la profundidad por la carga.', 'Progresa el tope manteniendo profundidad válida.'],
  488: ['Sentadillas explosivas con carga submáxima (50-60%) a máxima velocidad.', 'Prioriza la velocidad de la barra.', 'Hacerlas lento como fuerza máxima.', 'Mejora la velocidad antes de subir carga.'],
  489: ['Sentadilla con bandas o cadenas para variar la resistencia en el rango.', 'Explota siempre en la subida.', 'Frenar cuando aumenta la resistencia.', 'Sube carga o resistencia acomodada progresivamente.'],
  496: ['Con la barra en la espalda alta (trapecio), baja a sentadilla profunda con torso vertical.', 'Rodillas siguiendo la línea de los pies.', 'Levantar los talones.', 'Sube carga al mantener profundidad y postura.'],
  497: ['Sujeta la pesa al pecho y baja a sentadilla profunda con torso vertical.', 'Codos por dentro de las rodillas abajo.', 'Redondear la espalda.', 'Sube carga al dominar la técnica y profundidad.'],
  498: ['Siéntate en un cajón a la altura objetivo con control y levántate empujando la cadera.', 'No te desplomes; mantén la tensión al tocar.', 'Rebotar en el cajón.', 'Baja la altura o sube carga al mejorar.'],
  499: ['Barra en rack frontal con codos altos, sentadilla controlada aprendiendo la posición.', 'Empieza ligero para dominar el rack.', 'Dejar caer los codos.', 'Sube carga al asegurar el rack frontal.'],
  // Press Banca
  444: ['Banca de competición: barra al pecho con pausa, pies firmes y glúteos en el banco, y empuja.', 'Retrae escápulas y crea un arco estable.', 'Despegar los glúteos del banco.', 'Progresa hacia tu 1RM con pausa válida.'],
  445: ['Baja la barra al pecho, mantén 2s inmóvil y empuja.', 'No pierdas la tensión de la espalda en la pausa.', 'Hundir la barra o rebotar.', 'Sube carga manteniendo la pausa firme.'],
  446: ['Baja en 3s, 1s de pausa, empuja en 1s controlando el recorrido.', 'Respeta cada fase del tempo.', 'Acelerar la bajada.', 'Sube carga respetando el tempo.'],
  447: ['Tumbado en el suelo, baja hasta que los tríceps toquen el suelo y empuja.', 'Enfatiza el bloqueo y el tríceps.', 'Rebotar los codos en el suelo.', 'Sube carga al completar el rango con control.'],
  448: ['Con tablas sobre el pecho, baja hasta tocarlas y empuja; acorta el rango para el bloqueo.', 'Trabaja el punto débil del press.', 'Hundir las tablas con impulso.', 'Sube carga o reduce tablas al mejorar el bloqueo.'],
  468: ['Banca con arco de competición: escápulas retraídas, arco torácico y empuje potente con leg drive.', 'Pies firmes y empuje de piernas.', 'Perder el arco o despegar glúteos.', 'Progresa el tope manteniendo la técnica de competición.'],
  469: ['Press de banca con agarre ancho para enfatizar el pecho.', 'Controla los hombros; no bajes demasiado ancho.', 'Forzar el hombro con agarre excesivo.', 'Sube carga al completar el rango sin molestia.'],
  470: ['Press con agarre estrecho pegando los codos para enfatizar el tríceps.', 'Codos cerca del cuerpo.', 'Abrir los codos.', 'Sube carga manteniendo los codos pegados.'],
  471: ['Press con bandas que aumentan la resistencia arriba; controla abajo y explota.', 'Acelera para vencer la tensión creciente.', 'Frenar en el bloqueo.', 'Sube carga o tensión al mejorar la velocidad.'],
  472: ['Press con cadenas que cargan arriba y descargan abajo; explota en el empuje.', 'Mantén la técnica pese al cambio de carga.', 'Perder la trayectoria.', 'Sube carga al mantener la velocidad.'],
  473: ['Press con slingshot que asiste abajo permitiendo sobrecarga en el bloqueo.', 'Úsalo para tolerar más carga en el bloqueo.', 'Depender del rebote del slingshot.', 'Sube carga manteniendo el control.'],
  474: ['En el rack con pines, arranca el press desde parado a la altura del pecho sin rebote.', 'Genera tensión antes de empujar.', 'Rebotar en los pines.', 'Sube carga arrancando limpio.'],
  490: ['Press a esfuerzo máximo (1-3RM) con técnica de competición.', 'Calienta progresivo y usa observador.', 'Perder el arco por la carga.', 'Progresa el tope con técnica válida.'],
  491: ['Press explosivo con carga submáxima (50-60%) a máxima velocidad.', 'Prioriza la velocidad de la barra.', 'Hacerlo lento.', 'Mejora la velocidad antes de subir carga.'],
  492: ['Press con camiseta de fuerza (equipped) trabajando la ranura del material.', 'Requiere técnica de equipped y observadores.', 'Bajar la barra sin control con la camiseta.', 'Progresa según la adaptación al material.'],
  500: ['Tumbado, baja la barra al pecho controlando y empuja hasta extender.', 'Retrae escápulas y mantén los pies firmes.', 'Rebotar la barra en el pecho.', 'Sube carga al completar el rango con control.'],
  501: ['En banco inclinado, baja la barra a la parte alta del pecho y empuja.', 'No bajes demasiado hacia el cuello.', 'Despegar los glúteos.', 'Sube carga al completar el rango con técnica.'],
  502: ['Press con agarre estrecho (a la anchura de hombros) pegando los codos para el tríceps.', 'Codos cerca del cuerpo.', 'Abrir los codos.', 'Sube carga manteniendo los codos pegados.'],
  503: ['Tumbado con mancuernas, baja hasta la altura del pecho y empuja juntándolas arriba.', 'Controla el rango; mayor recorrido que la barra.', 'Chocar las mancuernas sin control.', 'Sube carga al dominar la estabilidad.'],
  // Peso Muerto
  449: ['Con los pies muy abiertos y agarre por dentro, empuja el suelo y extiende cadera y rodillas.', 'Abre las rodillas y mantén el pecho alto.', 'Redondear la espalda o adelantar la cadera.', 'Sube carga al bloquear con técnica limpia.'],
  450: ['Peso muerto con pausa a la altura de la rodilla antes de completar.', 'Mantén la tensión de la espalda en la pausa.', 'Perder la posición en la pausa.', 'Sube carga manteniendo la pausa firme.'],
  451: ['Peso muerto de pie sobre un disco (déficit 2-3") aumentando el rango.', 'Cuida la espalda en el mayor rango.', 'Redondear la lumbar abajo.', 'Sube carga manteniendo la espalda neutra.'],
  452: ['Peso muerto desde bloques a la altura de la rodilla, enfatizando el bloqueo.', 'Genera tensión antes de tirar.', 'Tirón brusco sin preparar la espalda.', 'Sube carga al completar el bloqueo con control.'],
  475: ['Peso muerto de competición (convencional o sumo) desde el suelo hasta el bloqueo válido.', 'Sigue tu técnica; bloquea los hombros atrás.', 'Hiperextender la espalda al bloquear.', 'Progresa hacia tu 1RM con bloqueo válido.'],
  476: ['Peso muerto de pie sobre 4" de déficit, aumentando el recorrido y la exigencia.', 'Extrema el control de la espalda abajo.', 'Redondear la lumbar.', 'Sube carga manteniendo la técnica en el déficit.'],
  477: ['Peso muerto con varias pausas (bajo y sobre la rodilla) antes de completar.', 'Mantén tensión en cada pausa.', 'Perder la posición entre pausas.', 'Sube carga controlando todas las pausas.'],
  478: ['Peso muerto con agarre ancho (de arrancada) aumentando el rango y el trabajo de espalda alta.', 'Aprieta los dorsales y mantén la barra pegada.', 'Redondear la espalda alta.', 'Sube carga manteniendo la postura.'],
  479: ['Peso muerto con bandas que aumentan la resistencia arriba; explota en el bloqueo.', 'Acelera para vencer la tensión creciente.', 'Frenar cerca del bloqueo.', 'Sube carga o tensión al mejorar la velocidad.'],
  480: ['Peso muerto explosivo con carga submáxima (50-60%) a máxima velocidad.', 'Cada rep rápida y con técnica; resetea entre reps.', 'Encadenar reps con rebote.', 'Mejora la velocidad antes de subir carga.'],
  493: ['Peso muerto a esfuerzo máximo (1-3RM) con técnica de competición.', 'Calienta progresivo; bloquea con seguridad.', 'Redondear la espalda por la carga.', 'Progresa el tope con bloqueo válido.'],
  494: ['Peso muerto explosivo submáximo priorizando la velocidad de despegue.', 'Genera tensión y tira rápido.', 'Hacerlo lento como fuerza máxima.', 'Mejora la velocidad antes de subir carga.'],
  495: ['Peso muerto con sobrecarga usando straps para superar el agarre.', 'Úsalo para acostumbrar la espalda a cargas altas.', 'Descuidar la técnica por el strap.', 'Sube carga manteniendo la postura neutra.'],
  504: ['Con pies a la anchura de caderas, empuja el suelo y extiende cadera y rodillas con la barra pegada.', 'Pecho alto y barra pegada a las piernas.', 'Redondear la espalda o adelantar la cadera.', 'Sube carga al bloquear con técnica limpia.'],
  505: ['Bisagra de cadera con piernas casi rectas bajando la barra pegada.', 'Lleva la cadera atrás y aprieta el glúteo.', 'Doblar mucho las rodillas o redondear la espalda.', 'Sube carga al completar el rango con control.'],
  506: ['Peso muerto parcial desde pines a la altura de la rodilla, enfatizando el bloqueo.', 'Aprieta dorsales y bloquea con glúteo.', 'Hiperextender la espalda al bloquear.', 'Sube carga al completar el bloqueo con control.'],
  507: ['Peso muerto sumo aprendiendo la posición: pies abiertos, agarre por dentro, empuja el suelo.', 'Empieza ligero abriendo bien las rodillas.', 'Redondear la espalda.', 'Sube carga al dominar la técnica sumo.'],
  // Asistencia Inferior
  453: ['Con el pie trasero elevado en un banco, baja la rodilla y sube con la pierna delantera.', 'Torso ligeramente inclinado para el glúteo.', 'Que la rodilla delantera colapse.', 'Sube carga al completar las reps por pierna con control.'],
  454: ['Barra en la espalda, bisagra de cadera bajando el torso con piernas casi rectas y sube.', 'Cadera atrás y espalda neutra; carga conservador.', 'Flexionar mucho la rodilla o redondear la espalda.', 'Sube carga al completar el rango con espalda neutra.'],
  455: ['Con la espalda alta apoyada en un banco y la barra en la cadera, empuja la cadera hasta la extensión.', 'Aprieta el glúteo arriba y mete la barbilla.', 'Hiperextender la lumbar en vez del glúteo.', 'Sube carga al bloquear la cadera con glúteo.'],
  456: ['En el GHD, baja el torso con control y sube usando los isquios y el glúteo.', 'Mantén la cadera extendida y el core firme.', 'Romper la cadera para ayudarte.', 'Progresa a reps completas o con lastre.'],
  481: ['Con el cinturón cargado entre las piernas, baja a sentadilla sin cargar la espalda.', 'Ideal para volumen de pierna sin estrés lumbar.', 'Inclinarte demasiado adelante.', 'Sube carga al completar el rango con control.'],
  482: ['De rodillas con los tobillos fijos, baja el cuerpo resistiendo con los isquios y vuelve.', 'Frena lo máximo posible en la bajada.', 'Romper la cadera para caer.', 'Aumenta el rango controlado o añade reps.'],
  483: ['Sube a un cajón apoyando todo el pie y extiende la cadera arriba con carga, alternando.', 'Empuja con el talón de la pierna de arriba.', 'Impulsarte con la pierna de abajo.', 'Sube carga al completar las reps por pierna.'],
  508: ['En la prensa, baja la plataforma flexionando las rodillas hasta 90° y empuja sin bloquear.', 'No despegues la lumbar del respaldo.', 'Bajar tanto que se levante la pelvis.', 'Sube carga al completar el rango con control.'],
  509: ['Camina dando pasos largos bajando la rodilla trasera casi al suelo.', 'Torso erguido y paso amplio.', 'Dar pasos cortos que adelantan la rodilla.', 'Sube carga o distancia al mejorar la técnica.'],
  510: ['En la máquina, flexiona las rodillas llevando los talones al glúteo y baja controlando.', 'Exprime el isquio arriba; sin impulso.', 'Levantar la cadera del apoyo.', 'Sube carga o reps con flexión completa.'],
  511: ['De pie, sube al máximo de puntillas y baja controlando el rango completo.', 'Pausa arriba y estira abajo.', 'Rebotar sin control.', 'Sube carga o reps con rango completo.'],
  // Asistencia Superior
  457: ['Tumbado, baja la barra hacia la parte alta del pecho con los codos cerrados (mezcla press y extensión) y empuja.', 'Codos algo adelantados; controla la bajada.', 'Abrir los codos como en press normal.', 'Sube carga al completar el rango sin molestia de codo.'],
  458: ['Con la barra o mancuerna sobre la cabeza, baja tras la nuca flexionando los codos y extiende.', 'Codos apuntando arriba y fijos.', 'Abrir los codos.', 'Sube carga al completar el rango con control.'],
  459: ['Tira de la cuerda hacia la cara abriendo los codos y rotando los hombros hacia fuera.', 'Aprieta las escápulas; sin impulso.', 'Tirar con la lumbar o encoger el cuello.', 'Sube carga o reps con contracción controlada.'],
  460: ['Desde el suelo con el torso paralelo, tira de la barra al abdomen y devuélvela al suelo.', 'Espalda neutra y tirón explosivo desde parado.', 'Usar impulso de cadera o redondear la espalda.', 'Sube carga manteniendo el torso paralelo.'],
  484: ['De pie, alterna el press llevando la barra por delante y por detrás de la cabeza sin bloquear.', 'Recorrido corto y controlado; carga ligera.', 'Golpear la nuca con la barra.', 'Sube carga manteniendo el control del recorrido.'],
  485: ['Tumbado boca abajo en un banco alto, tira de la barra al banco apretando la espalda.', 'Aísla la espalda sin usar impulso.', 'Despegar el pecho del banco.', 'Sube carga al completar el rango con control.'],
  486: ['Banda a la altura del pecho, brazos extendidos, sepárala juntando escápulas.', 'Sin encoger el cuello; retrae escápulas.', 'Flexionar los codos.', 'Aumenta reps o tensión de la banda al mejorar.'],
  512: ['En paralelas con el torso vertical, baja flexionando los codos y empuja a bloqueo para el tríceps.', 'Mantén el torso vertical para el tríceps.', 'Inclinarte y cargar el pecho.', 'Sube reps o lastre manteniendo el aislamiento.'],
  513: ['Con el torso inclinado y espalda neutra, tira de la barra al abdomen y baja controlando.', 'Aprieta escápulas; sin impulso lumbar.', 'Redondear la espalda o usar impulso.', 'Sube carga manteniendo el torso estable.'],
  514: ['De pie, empuja la barra desde los hombros sobre la cabeza sin impulso de piernas.', 'Aprieta glúteo y core; mete la cabeza al pasar.', 'Arquear la lumbar para empujar.', 'Sube carga al completar el rango estricto.'],
  515: ['Colgado, tira hasta pasar la barbilla la barra y baja a brazos extendidos.', 'Inicia deprimiendo las escápulas.', 'Balancearte o hacer medio rango.', 'Añade lastre o reps al completar el rango.'],
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
             WHERE id = $${vals.length} AND disciplina = 'powerlifting'`, vals);
        if (r.rowCount === 0) log.push(`⚠️ id ${id} no encontrado en powerlifting`);
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
