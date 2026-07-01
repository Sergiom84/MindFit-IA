/**
 * fix_casa_catalog_quality.mjs
 *
 * Corrección integral de calidad de los ejercicios de entrenamiento en casa en
 * app.ejercicios (disciplina='casa', 100 ejercicios):
 *   1. Rellena como_hacerlo / consejos / errores_comunes / criterio_de_progreso
 *      al 100% (antes 0/100).
 *   2. Arregla gif_url sin depender de RapidAPI: reutiliza GIFs animados del bucket
 *      Supabase para el trabajo de fuerza/HIIT/cardio con equivalente (flexión,
 *      sentadilla, plancha, zancada, puente, burpee, comba, dip, pistol, KB swing,
 *      L-sit) y free-exercise-db (mountain climber, bicycle crunch, jump squat…).
 *      La movilidad (estiramientos/posturas) se deja sin imagen: no hay asset
 *      fiable y el texto la describe con precisión (mejor sin GIF que uno falso).
 *
 * series_reps_objetivo ya está al 100%. Los gif_url existentes no se tocan.
 *
 * Uso:  node scripts/fix_casa_catalog_quality.mjs [--dry]
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

// gif_url para el trabajo con equivalente animado/estático (movilidad se deja NULL).
const GIF = {
  // Cardio
  96: 'SB:1160', 119: 'SB:1160', 120: 'SB:1374', 136: 'SB:2612', 137: 'SB:1160',
  141: 'SB:1160', 142: 'SB:1160', 145: 'SB:1273', 77: 'FE:Mountain_Climbers', 98: 'FE:Mountain_Climbers',
  // Fuerza
  70: 'SB:2135', 71: 'SB:1409', 72: 'SB:0803', 74: 'FE:Dumbbell_Bicep_Curl', 91: 'SB:2135',
  92: 'FE:Barbell_Hip_Thrust', 95: 'FE:Air_Bike', 114: 'SB:3419', 116: 'SB:0549', 118: 'SB:0631',
  // Funcional
  66: 'SB:0750', 67: 'FE:Incline_Push-Up', 68: 'FE:Standing_Calf_Raises', 69: 'SB:1460',
  86: 'FE:Barbell_Side_Split_Squat', 88: 'SB:3293', 89: 'SB:1460', 90: 'SB:1700', 108: 'SB:0544', 110: 'SB:3293',
  // HIIT
  79: 'SB:0750', 80: 'SB:2135', 100: 'FE:Freehand_Jump_Squat', 101: 'SB:0677', 102: 'SB:2135',
  103: 'SB:1460', 123: 'SB:1160', 124: 'FE:Freehand_Jump_Squat', 125: 'SB:1273', 126: 'SB:1160',
  127: 'FE:Freehand_Jump_Squat',
};

// [como_hacerlo, consejos, errores_comunes, criterio_de_progreso] para los 100.
const T = {
  // Cardio
  75: ['De pie, marcha elevando las rodillas alternando los brazos de forma rítmica.', 'Core activo y espalda recta.', 'Encorvar la espalda o mirar al suelo.', 'Aumenta la duración o el ritmo progresivamente.'],
  76: ['Abre una pierna al lado subiendo los brazos y vuelve, alternando sin salto.', 'Movimiento controlado, de bajo impacto.', 'Perder el ritmo o encoger los hombros.', 'Aumenta el ritmo o pasa a la versión con salto.'],
  77: ['En plancha alta, lleva una rodilla al pecho alternando de forma lenta y controlada.', 'Cadera baja y core firme.', 'Subir la cadera o rebotar.', 'Aumenta el ritmo o las reps.'],
  78: ['En el sitio, eleva las rodillas a la altura de la cadera alternando a ritmo moderado.', 'Apoya en la punta del pie y usa los brazos.', 'Encorvarte hacia atrás.', 'Aumenta el ritmo o la duración.'],
  96: ['Baja a plancha, haz una flexión opcional, vuelve y ponte de pie sin salto.', 'Apoya bien las manos y controla la bajada.', 'Dejar caer la cadera en la plancha.', 'Añade el salto o más reps al progresar.'],
  97: ['Salta abriendo piernas y subiendo los brazos, y vuelve al centro.', 'Aterriza suave con rodillas ligeramente flexionadas.', 'Aterrizar rígido.', 'Aumenta el ritmo o la duración.'],
  98: ['En plancha alta, lleva las rodillas al pecho alternando rápido con la cadera baja.', 'Core firme y hombros sobre las manos.', 'Subir la cadera o perder la plancha.', 'Aumenta el ritmo o el tiempo.'],
  99: ['Salta lateralmente de una pierna a otra cruzando la pierna libre atrás.', 'Aterriza suave y mantén el equilibrio.', 'Perder el control al aterrizar.', 'Aumenta la amplitud o el ritmo.'],
  119: ['Baja a plancha, flexión, vuelve y salta con palmada arriba en cada rep.', 'Encadena con ritmo y buena técnica.', 'Redondear la espalda por la fatiga.', 'Aumenta las reps o el ritmo.'],
  120: ['Salta con ambos pies a una silla firme, cae en cuclillas y baja con control.', 'Asegura que la silla no resbale.', 'Usar una superficie inestable.', 'Sube la altura o las reps con seguridad.'],
  121: ['Corre en el sitio a máxima intensidad elevando rodillas y bombeando los brazos.', 'Apoya en la punta del pie.', 'Encorvarte.', 'Aumenta la duración de los intervalos.'],
  122: ['Sujeta una toalla en cada mano y haz ondas rápidas alternando los brazos.', 'Core firme en semisentadilla.', 'Erguirte perdiendo la tensión.', 'Aumenta el ritmo o la duración.'],
  131: ['Da un paso lateral y junta el otro pie tocando el suelo, alternando lados.', 'Mantén el ritmo y usa los brazos.', 'Movimiento rígido sin ritmo.', 'Aumenta la amplitud o el ritmo.'],
  132: ['Camina en el sitio elevando la rodilla al pecho en cada paso.', 'Core activo y espalda recta.', 'Encorvarte.', 'Aumenta el ritmo o la duración.'],
  133: ['Lanza golpes controlados al aire manteniendo la guardia y moviendo los pies.', 'Rota el tronco en cada golpe.', 'Tirar los brazos sin control.', 'Aumenta el ritmo o los combos.'],
  134: ['Toca alternando la punta del pie sobre un escalón o línea a ritmo ágil.', 'Apoya en la punta y mantente ligero.', 'Mirar constantemente los pies.', 'Aumenta el ritmo.'],
  135: ['Marcha en el sitio abriendo y cerrando los brazos en cruz de forma coordinada.', 'Coordina brazos y piernas.', 'Perder la coordinación.', 'Aumenta el ritmo o la duración.'],
  136: ['Salta con pequeños botes girando las muñecas como si tuvieras comba.', 'Botes bajos apoyando en la punta.', 'Saltar demasiado alto.', 'Aumenta el ritmo o la duración.'],
  137: ['Encadena burpees a un ritmo constante manteniendo la técnica.', 'Respira de forma rítmica.', 'Perder la postura por la fatiga.', 'Aumenta las reps o el ritmo.'],
  138: ['Lanza combinaciones rápidas de golpes moviendo los pies y el tronco.', 'Mantén la guardia y rota la cadera.', 'Bajar la guardia.', 'Aumenta el ritmo o la duración.'],
  139: ['Impulsa una rodilla arriba con fuerza alternando, como un sprint explosivo.', 'Usa los brazos y el core.', 'Encorvarte hacia atrás.', 'Aumenta el ritmo o las reps.'],
  140: ['Mueve los pies lo más rápido posible en el sitio, ligero sobre las puntas.', 'Mantente ágil y bajo.', 'Aterrizar de talón.', 'Aumenta la velocidad o la duración.'],
  141: ['Haz un burpee y en el salto gira 180° cayendo en sentido contrario.', 'Aterriza suave y estable.', 'Perder el equilibrio al girar.', 'Aumenta las reps o el ritmo.'],
  142: ['Desde de pie, lanza los pies atrás a plancha y vuelve explosivo sin flexión.', 'Rápido y con el core firme.', 'Dejar caer la cadera.', 'Aumenta el ritmo o las reps.'],
  143: ['Salta lateralmente de un lado a otro de una línea con los pies juntos.', 'Aterriza suave y sigue el ritmo.', 'Aterrizar rígido.', 'Aumenta la amplitud o el ritmo.'],
  144: ['Combina ondas de brazos (toallas) con pequeños saltos manteniendo el ritmo.', 'Coordina brazos y piernas.', 'Perder la tensión del core.', 'Aumenta el ritmo o la duración.'],
  145: ['Flexión explosiva despegando las manos y desplazándote lateralmente al caer.', 'Amortigua con los codos al caer.', 'Caer con los codos rígidos.', 'Aumenta las reps o el desplazamiento.'],
  // Fuerza
  70: ['Sobre antebrazos y rodillas, mantén el cuerpo alineado con el core apretado.', 'Retroversión pélvica; no hundas la cadera.', 'Subir o hundir la cadera.', 'Aumenta el tiempo o pasa a plancha completa.'],
  71: ['Tumbado con los pies apoyados, empuja con los talones y eleva la cadera apretando el glúteo.', 'Retroversión arriba; sin arquear la lumbar.', 'Empujar con la lumbar.', 'Aumenta las reps o pasa a una pierna.'],
  72: ['Boca abajo, eleva brazos y piernas contrayendo glúteo y espalda baja, y mantén.', 'Cuello neutro mirando al suelo.', 'Hiperextender el cuello.', 'Aumenta el tiempo o las reps.'],
  73: ['En cuadrupedia, extiende brazo y pierna opuestos manteniendo la cadera estable.', 'Movimiento lento sin rotar la cadera.', 'Arquear la lumbar.', 'Aumenta el tiempo o las reps.'],
  74: ['Sujeta una toalla y haz el curl auto-resistiendo con la otra mano o el pie.', 'Aprieta el bíceps arriba.', 'Usar impulso.', 'Aumenta la resistencia o las reps.'],
  91: ['Sobre antebrazos y puntas de pies, cuerpo alineado; aprieta core y glúteo.', 'Retroversión pélvica para no hundir la cadera.', 'Subir o hundir la cadera.', 'Aumenta el tiempo progresivamente.'],
  92: ['Con la espalda alta apoyada y una banda sobre la cadera, empuja hasta la extensión.', 'Aprieta el glúteo arriba y mete la barbilla.', 'Empujar con la lumbar.', 'Aumenta la tensión de la banda o las reps.'],
  95: ['Tumbado, pedalea llevando el codo a la rodilla contraria alternando.', 'Sin tirar del cuello; gira desde el core.', 'Tirar de la cabeza con las manos.', 'Aumenta el ritmo o las reps.'],
  113: ['Tumbado agarrando un apoyo tras la cabeza, eleva el cuerpo recto y baja lento.', 'Cuerpo como una tabla; aprieta glúteo y abdomen.', 'Arquear la lumbar.', 'Aumenta las reps o ralentiza la bajada.'],
  114: ['En apoyo (sillas o suelo) con codos bloqueados, eleva las piernas rectas formando una L.', 'Deprime los hombros y empuja hacia abajo.', 'Encoger los hombros.', 'Aumenta el tiempo o extiende más las piernas.'],
  116: ['Bisagra de cadera y proyecta la kettlebell hasta la altura de los ojos con el impulso de cadera.', 'La potencia sale de la cadera, no de los brazos.', 'Sentadillar en vez de bisagra.', 'Sube carga o reps con técnica.'],
  118: ['Con toallas sobre una barra firme, tira explosivo y haz la transición a apoyo.', 'Asegura bien el agarre y la barra.', 'Forzar la transición sin impulso.', 'Reduce la asistencia al ganar fuerza.'],
  // Funcional
  66: ['Baja a sentadilla tocando la silla con control y levántate.', 'Reparte el peso en los talones.', 'Desplomarte en la silla.', 'Reduce la ayuda o aumenta las reps.'],
  67: ['Manos en una silla firme, flexiona bajando el pecho y empuja.', 'Cuerpo recto; cuanto más baja la superficie, más difícil.', 'Hundir la cadera.', 'Baja la altura o aumenta las reps.'],
  68: ['En un escalón, sube al máximo de puntillas y baja estirando el gemelo.', 'Rango completo con pausa arriba.', 'Rebotar sin control.', 'Aumenta las reps o pasa a una pierna.'],
  69: ['En posición de zancada, baja la rodilla trasera casi al suelo y sube, sin avanzar.', 'Torso erguido y rodilla alineada.', 'Adelantar la rodilla más allá del pie.', 'Aumenta las reps o añade carga.'],
  86: ['Con el pie trasero en una silla, baja la rodilla y sube con la pierna delantera.', 'Torso ligeramente inclinado para el glúteo.', 'Que la rodilla delantera colapse.', 'Aumenta las reps o añade carga.'],
  88: ['Bajo una mesa firme o con toallas, tira del pecho hacia el borde apretando la espalda.', 'Cuerpo recto y escápulas apretadas.', 'Dejar caer la cadera.', 'Baja el ángulo o aumenta las reps.'],
  89: ['Camina dando pasos largos bajando la rodilla trasera casi al suelo.', 'Torso erguido y paso amplio.', 'Pasos cortos que adelantan la rodilla.', 'Aumenta las reps o añade carga.'],
  90: ['Pisa la banda y empuja las asas desde los hombros sobre la cabeza.', 'Aprieta glúteo y core; sin arquear.', 'Arquear la lumbar.', 'Usa una banda más dura o más reps.'],
  108: ['A una pierna, baja controlando con la otra extendida al frente y sube sin apoyo.', 'Brazos al frente como contrapeso.', 'Colapsar la rodilla hacia dentro.', 'Reduce la asistencia o aumenta las reps.'],
  110: ['En una barra segura, tira hasta pasar la barbilla y baja a brazos extendidos.', 'Verifica la fijación de la barra.', 'Balancearte o hacer medio rango.', 'Añade reps o lastre al progresar.'],
  // HIIT
  79: ['Baja a sentadilla y al subir eleva los brazos por encima de la cabeza.', 'Coordina la subida con los brazos.', 'Redondear la espalda.', 'Aumenta el ritmo o las reps.'],
  80: ['En plancha alta, toca el hombro contrario con la mano sin mover la cadera.', 'Abre los pies para estabilizar.', 'Balancear la cadera.', 'Aumenta el ritmo o las reps.'],
  81: ['En semisentadilla, desplázate lateralmente con pasos rápidos manteniéndote bajo.', 'Mantente bajo y ágil.', 'Erguirte al desplazarte.', 'Aumenta la amplitud o el ritmo.'],
  82: ['De pie, baja las manos al suelo y camina hasta plancha, y regresa caminando las manos.', 'Piernas casi rectas al caminar las manos.', 'Doblar mucho las rodillas.', 'Añade una flexión o más reps.'],
  100: ['Baja a sentadilla y salta explosivo extendiendo el cuerpo, y amortigua al caer.', 'Aterriza suave en cuclillas.', 'Caer con las rodillas hacia dentro.', 'Aumenta las reps o la altura.'],
  101: ['Manos en el borde de una silla firme, baja flexionando los codos y empuja.', 'Codos hacia atrás, no hacia fuera.', 'Bajar demasiado forzando el hombro.', 'Aleja los pies o añade reps.'],
  102: ['En plancha, abre y cierra las piernas con saltos manteniendo la cadera estable.', 'Core firme; sin subir la cadera.', 'Balancear la cadera.', 'Aumenta el ritmo o las reps.'],
  103: ['Da un paso atrás a zancada y al subir eleva esa rodilla al pecho.', 'Equilibrio y torso erguido.', 'Perder el equilibrio.', 'Aumenta el ritmo o las reps.'],
  123: ['Haz un burpee y añade un salto largo hacia delante en cada repetición.', 'Aterriza con las dos piernas amortiguando.', 'Aterrizar rígido.', 'Aumenta la distancia o las reps.'],
  124: ['Salta llevando las rodillas al pecho y amortigua al caer.', 'Aterriza suave en cuclillas.', 'Aterrizar con las piernas rígidas.', 'Aumenta las reps o la altura.'],
  125: ['Flexión explosiva despegando las manos para dar una palmada y caer controlado.', 'Amortigua con los codos al caer.', 'Caer con los codos rígidos.', 'Aumenta las reps.'],
  126: ['Haz el burpee apoyando y empujando con una sola pierna, alternando.', 'Mantén el core firme y el equilibrio.', 'Perder la postura de la plancha.', 'Aumenta las reps o el ritmo.'],
  127: ['Salta desde la sentadilla girando 180° y cae en cuclillas en sentido contrario.', 'Aterriza suave y estable.', 'Perder el equilibrio al girar.', 'Aumenta las reps o el ritmo.'],
  // Movilidad (sin GIF: descrita en texto)
  83: ['Sentado con las piernas extendidas, inclínate hacia los pies con la espalda larga.', 'Ve a la sensación de estiramiento, no al dolor.', 'Redondear la espalda de golpe.', 'Aumenta el rango o el tiempo progresivamente.'],
  84: ['En cuadrupedia, alterna redondear (gato) y arquear (vaca) la columna con la respiración.', 'Muévete lento vértebra a vértebra.', 'Forzar el rango bruscamente.', 'Aumenta el número de ciclos.'],
  85: ['Tumbado o en apoyo, dibuja círculos amplios con la rodilla movilizando la cadera.', 'Rango controlado en ambas direcciones.', 'Compensar con la lumbar.', 'Aumenta la amplitud o las reps.'],
  106: ['Sentado en 90/90, gira las caderas de un lado a otro cambiando la posición de las piernas.', 'Mantén el torso erguido.', 'Redondear la espalda.', 'Aumenta el rango progresivamente.'],
  107: ['Con los pies muy abiertos, desplaza el peso a una pierna flexionándola mientras la otra queda extendida.', 'Talón apoyado en la pierna que flexiona.', 'Levantar el talón.', 'Aumenta la profundidad o las reps.'],
  128: ['De pie, enrolla la columna vértebra a vértebra bajando con peso ligero y sube igual.', 'Muévete muy lento y controlado.', 'Bajar de golpe con peso alto.', 'Aumenta el rango o el peso muy gradualmente.'],
  129: ['Sentado con las piernas abiertas, inclínate al frente con la espalda larga de forma dinámica.', 'Bascula desde la cadera.', 'Redondear la espalda.', 'Aumenta el rango progresivamente.'],
  130: ['En zancada baja con las manos dentro, rota el tronco abriendo un brazo al techo.', 'Respira en el estiramiento.', 'Forzar la rotación.', 'Aumenta el rango o el tiempo.'],
  146: ['De pie, dibuja círculos amplios con los brazos hacia delante y atrás.', 'Movimiento controlado y completo.', 'Encoger los hombros.', 'Aumenta la amplitud o las reps.'],
  147: ['Apoya el antebrazo en el marco de una puerta y gira el cuerpo abriendo el pecho.', 'Estira sin dolor articular.', 'Forzar el hombro.', 'Aumenta el tiempo del estiramiento.'],
  148: ['De pie, lleva el talón al glúteo sujetando el pie con la mano.', 'Rodillas juntas y cadera adelante.', 'Arquear la lumbar.', 'Aumenta el tiempo o el rango.'],
  149: ['Eleva un pie y dibuja círculos con el tobillo en ambas direcciones.', 'Rango completo y controlado.', 'Movimiento brusco.', 'Aumenta las reps.'],
  150: ['Sentado, junta las plantas de los pies y deja caer las rodillas abriendo las caderas.', 'Espalda larga; presiona suave las rodillas.', 'Rebotar las rodillas.', 'Aumenta el tiempo o el rango.'],
  151: ['De rodillas, siéntate sobre los talones y estira los brazos al frente bajando el pecho.', 'Respira y relaja la espalda.', 'Tensar los hombros.', 'Aumenta el tiempo del estiramiento.'],
  152: ['Inclina la cabeza hacia un hombro sintiendo el estiramiento del lado del cuello.', 'Movimiento suave; no fuerces.', 'Tirar bruscamente de la cabeza.', 'Aumenta el tiempo progresivamente.'],
  153: ['En cuadrupedia, pasa un brazo por debajo del otro rotando la columna dorsal.', 'Rota desde la espalda alta.', 'Cargar el cuello.', 'Aumenta el rango o el tiempo.'],
  154: ['Sujeto a un apoyo, balancea la pierna adelante y atrás de forma controlada.', 'Torso estable; balanceo activo.', 'Arquear la lumbar.', 'Aumenta la amplitud o las reps.'],
  155: ['Sujeto a un apoyo, balancea la pierna de lado a lado cruzando el cuerpo.', 'Cadera estable; movimiento controlado.', 'Rotar el torso en exceso.', 'Aumenta la amplitud o las reps.'],
  156: ['En cuadrupedia, abre las rodillas al máximo cómodo y mece la cadera atrás.', 'Espalda neutra; presiona suave.', 'Redondear la lumbar.', 'Aumenta el rango o el tiempo.'],
  157: ['Boca abajo, cruza una pierna por detrás hacia el lado opuesto rotando la cadera.', 'Movimiento suave y controlado.', 'Forzar la rotación lumbar.', 'Aumenta el rango progresivamente.'],
  158: ['Con una pierna flexionada delante y la otra extendida atrás, baja el torso sobre la delantera.', 'Cadera cuadrada; respira.', 'Cargar la rodilla delantera.', 'Aumenta el tiempo o el rango.'],
  159: ['Tumbado de lado, sujeta un pie atrás y la rodilla opuesta delante rotando el tronco.', 'Respira profundo en la rotación.', 'Forzar la rotación.', 'Aumenta el tiempo del estiramiento.'],
  160: ['Desplaza el peso de una pierna a otra de forma fluida en sentadilla lateral profunda.', 'Talón apoyado; torso erguido.', 'Levantar el talón.', 'Aumenta la profundidad o el ritmo.'],
  161: ['En zancada baja con las manos en el suelo, rota abriendo un brazo al techo.', 'Respira en el estiramiento.', 'Forzar la rotación.', 'Aumenta el rango o las reps.'],
  162: ['Baja a sentadilla profunda y mantén la posición con los codos empujando las rodillas.', 'Talones apoyados y pecho alto.', 'Levantar los talones.', 'Aumenta el tiempo en la posición.'],
  163: ['Con una toalla ancha, pasa los brazos rectos de delante a atrás por encima de la cabeza.', 'Agarre ancho; movimiento lento.', 'Doblar los codos o forzar.', 'Reduce el ancho del agarre progresivamente.'],
  164: ['Sentado con las piernas abiertas, inclínate al frente con la espalda larga y mantén.', 'Bascula desde la cadera; respira.', 'Redondear la espalda.', 'Aumenta el rango o el tiempo.'],
  165: ['Desde pigeon, flexiona la pierna trasera y sujeta el pie llevándolo hacia la cabeza.', 'Postura avanzada; entra gradualmente.', 'Forzar el hombro o la lumbar.', 'Aumenta el rango muy progresivamente.'],
  // Ejercicios que ya tenían GIF (sólo faltaba el texto)
  93: ['De pie, flexiona los codos subiendo las mancuernas con supinación y baja controlando.', 'Codos pegados; sin balancear el torso.', 'Usar impulso de espalda.', 'Sube carga o reps con técnica estricta.'],
  94: ['Tumbado en el suelo, baja las mancuernas hasta que los tríceps toquen y empuja.', 'El suelo limita el rango y protege el hombro.', 'Rebotar los codos en el suelo.', 'Sube carga al completar el rango con control.'],
  115: ['En pino contra la pared, baja la cabeza con control y empuja; usa apoyo si hace falta.', 'Core firme y cuerpo alineado.', 'Arquear la espalda o abrir los codos.', 'Reduce la asistencia o aumenta las reps.'],
  117: ['A una pierna sujetando una kettlebell al pecho como contrapeso, baja y sube.', 'La pesa al pecho ayuda al equilibrio.', 'Colapsar la rodilla hacia dentro.', 'Sube carga o reps al ganar control.'],
  87: ['Cuerpo recto, baja el pecho al suelo con los codos a 45° y empuja.', 'Aprieta glúteo y abdomen para no arquear.', 'Hundir la cadera o abrir los codos a 90°.', 'Aumenta las reps o pasa a variantes más difíciles.'],
  109: ['Flexión con las manos juntas formando un diamante para enfatizar el tríceps.', 'Pega los codos al cuerpo al bajar.', 'Abrir los codos hacia fuera.', 'Aumenta las reps o eleva los pies.'],
  111: ['Desde tumbado con la kettlebell arriba, levántate paso a paso sin perder el brazo vertical.', 'Fija la vista en la pesa durante toda la subida.', 'Perder la verticalidad del brazo.', 'Sube carga al dominar la secuencia.'],
  112: ['En plancha sobre mancuernas, rema una a cada lado sin rotar la cadera.', 'Abre los pies y aprieta el core anti-rotación.', 'Balancear la cadera al remar.', 'Sube carga o reps manteniendo la plancha estable.'],
  104: ['Haz una flexión y al subir rota abriendo un brazo al techo formando una T.', 'Aprieta el core al rotar; mira la mano.', 'Dejar caer la cadera al rotar.', 'Aumenta las reps o el ritmo.'],
  105: ['En zancada baja, apoya el codo dentro del pie delantero y rota abriendo el brazo al techo.', 'Respira en cada posición del estiramiento.', 'Forzar la rotación o encorvarte.', 'Aumenta el rango o el tiempo.'],
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
             WHERE id = $${vals.length} AND disciplina = 'casa'`, vals);
        if (r.rowCount === 0) log.push(`⚠️ id ${id} no encontrado en casa`);
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
