// Genera output/catalog-audit/fixes/01_gifs_mal.sql a partir del juicio semántico manual.
const fs = require('fs');
const path = require('path');
const root = __dirname;

const map = {
  'ejercicios|43': [null, 'sin equivalente exacto de shrimp squat'],
  'ejercicios|1': [null, 'sin pike push-up en free-exercise-db'],
  'ejercicios|8': ['Inverted_Row', 'remo invertido en barra, cuerpo recto y piernas extendidas'],
  'ejercicios|10': ['Inverted_Row', 'remo invertido en barra (variante estandar, pies en suelo)'],
  'ejercicios|17': [null, 'sin hollow body en free-exercise-db'],
  'ejercicios|18': ['Bodyweight_Squat', 'sentadilla libre con peso corporal'],
  'ejercicios|19': ['Split_Squat_with_Dumbbells', 'split squat bulgaro con pie trasero elevado (con mancuernas ligeras)'],
  'ejercicios|9': ['Superman', 'superman isometrico tumbado boca abajo'],
  'ejercicios|47': [null, 'sin flexion contra pared en free-exercise-db'],
  'ejercicios|49': [null, 'sin flexion en rodillas en free-exercise-db'],
  'ejercicios|50': [null, 'sin flexion escapular en free-exercise-db'],
  'ejercicios|53': [null, 'sin hollow body tuck en free-exercise-db'],
  'ejercicios|57': ['Bodyweight_Squat', 'sentadilla al aire con peso corporal'],
  'ejercicios|59': ['Step-up_with_Knee_Raise', 'step-up a cajon con peso corporal (incluye elevacion de rodilla)'],
  'ejercicios|61': ['Inverted_Row', 'remo invertido en barra'],
  'ejercicios|62': [null, 'sin dead hang bilateral en free-exercise-db (solo One_Handed_Hang)'],
  'ejercicios|63': ['Scapular_Pull-Up', 'scap pull colgado de barra, retraccion escapular sin flexion de brazos'],
  'ejercicios|65': [null, 'sin soporte estatico en paralelas en free-exercise-db'],
  'ejercicios|112': [null, 'renegade row en fedb es con kettlebells, no mancuernas'],
  'ejercicios|86': ['Split_Squat_with_Dumbbells', 'split squat bulgaro con pie trasero elevado en banco'],
  'ejercicios|88': ['Inverted_Row_with_Straps', 'remo invertido colgado de correas/suspension'],
  'ejercicios|90': ['Shoulder_Press_-_With_Bands', 'press de hombros con bandas elasticas'],
  'ejercicios|72': ['Superman', 'superman isometrico tumbado boca abajo'],
  'ejercicios|79': ['Bodyweight_Squat', 'sentadilla con peso corporal (sin la elevacion de brazos)'],
  'ejercicios|208': ['Standing_Long_Jump', 'salto de longitud sin carrera (broad jump)'],
  'ejercicios|213': [null, 'sin waiter carry overhead en free-exercise-db'],
  'ejercicios|214': ['Yoke_Walk', 'yoke walk con estructura a la espalda'],
  'ejercicios|215': [null, 'sin sandbag a hombro en free-exercise-db'],
  'ejercicios|217': [null, 'sin devil press en free-exercise-db'],
  'ejercicios|218': [null, 'sin man makers en free-exercise-db'],
  'ejercicios|184': [null, 'sin press landmine unilateral en free-exercise-db'],
  'ejercicios|187': [null, 'sin remo invertido a una mano en free-exercise-db'],
  'ejercicios|189': ['Split_Squat_with_Dumbbells', 'split squat bulgaro con pie trasero elevado'],
  'ejercicios|190': ['Kettlebell_One-Legged_Deadlift', 'peso muerto a una pierna con kettlebell'],
  'ejercicios|166': [null, 'sin flexion en pared en free-exercise-db'],
  'ejercicios|167': [null, 'sin flexion en rodillas en free-exercise-db'],
  'ejercicios|168': ['Standing_Dumbbell_Press', 'press overhead de pie con mancuernas'],
  'ejercicios|169': ['Inverted_Row_with_Straps', 'remo en suspension con correas (equivalente TRX)'],
  'ejercicios|170': [null, 'sin dead hang bilateral en free-exercise-db'],
  'ejercicios|171': ['Inverted_Row', 'remo invertido en barra con pies en suelo'],
  'ejercicios|174': ['Step-up_with_Knee_Raise', 'step-up a cajon con peso corporal'],
  'ejercicios|261': ['Snatch', 'snatch completo con barra desde suelo'],
  'ejercicios|262': ['Snatch_from_Blocks', 'snatch con barra desde bloques'],
  'ejercicios|264': ['Snatch', 'snatch completo con barra (representa el complejo)'],
  'ejercicios|267': ['Snatch', 'snatch con barra (representa el complejo high pull + snatch)'],
  'ejercicios|268': ['Clean', 'clean completo con barra desde suelo'],
  'ejercicios|273': ['Clean_and_Jerk', 'clean and jerk con barra (representa el complejo)'],
  'ejercicios|274': [null, 'sin jerk tras nuca desde bloques en free-exercise-db'],
  'ejercicios|275': [null, 'sin tall jerk en free-exercise-db'],
  'ejercicios|276': ['Clean', 'clean con barra (parte inicial del complejo clean + front squats)'],
  'ejercicios|281': [null, 'sin overhead lunge con agarre snatch en free-exercise-db'],
  'ejercicios|282': [null, 'sin Sotts press en free-exercise-db'],
  'ejercicios|239': ['Power_Snatch', 'power snatch con barra desde suelo'],
  'ejercicios|240': ['Hang_Snatch', 'hang snatch con barra desde posicion colgada'],
  'ejercicios|244': ['Muscle_Snatch', 'muscle snatch con barra'],
  'ejercicios|249': ['Power_Jerk', 'power/push jerk con barra sin split'],
  'ejercicios|255': ['Standing_Military_Press', 'press estricto de pie con barra'],
  'ejercicios|256': ['One_Leg_Barbell_Squat', 'sentadilla bulgara con barra y pie trasero en banco'],
  'ejercicios|257': [null, 'sin overhead walking lunge con barra en free-exercise-db'],
  'ejercicios|259': [null, 'sin Sotts press en free-exercise-db'],
  'ejercicios|223': ['Muscle_Snatch', 'muscle snatch con barra (demo del patron para PVC)'],
  'ejercicios|229': ['Standing_Military_Press', 'press estricto de pie con barra'],
  'ejercicios|230': [null, 'sin Sotts press en free-exercise-db'],
  'ejercicios|236': [null, 'sin overhead walking lunge en free-exercise-db'],
  'ejercicios|284': ['Hang_Snatch', 'hang snatch con barra desde encima de rodilla'],
  'ejercicios|308': ['Dumbbell_Shoulder_Press', 'press de hombros con mancuernas'],
  'ejercicios|371': ['Standing_Military_Press', 'press militar con barra libre'],
  'ejercicios|378': ['Standing_Military_Press', 'press militar con barra libre de pie'],
  'ejercicios|390': ['Split_Squat_with_Dumbbells', 'sentadilla bulgara con mancuernas y pie trasero elevado'],
  'ejercicios|394': ['Dips_-_Triceps_Version', 'fondos en paralelas version triceps (torso vertical, codos pegados)'],
  'ejercicios|329': ['Weighted_Sissy_Squat', 'sissy squat con lastre (disco al pecho)'],
  'ejercicios|357': ['Split_Squat_with_Dumbbells', 'sentadilla bulgara con mancuernas y pie trasero elevado'],
  'ejercicios|481': [null, 'sin belt squat en free-exercise-db'],
  'ejercicios|453': ['Split_Squat_with_Dumbbells', 'sentadilla bulgara con mancuernas y pie trasero elevado'],
  'ejercicios|513': ['Bent_Over_Barbell_Row', 'remo inclinado con barra'],
  'crossfit|1': ['Inverted_Row_with_Straps', 'remo en suspension con correas (equivalente a anillas)'],
  'crossfit|3': ['Bodyweight_Squat', 'air squat con peso corporal'],
  'crossfit|5': [null, 'sin jumping jacks en free-exercise-db'],
  'crossfit|6': ['Step-up_with_Knee_Raise', 'subida a cajon con peso corporal'],
  'crossfit|15': [null, 'sin wall ball en free-exercise-db'],
  'crossfit|18': [null, 'sin assault/fan bike en free-exercise-db'],
  'crossfit|23': ['Step-up_with_Knee_Raise', 'subida a cajon con peso corporal'],
  'crossfit|24': [null, 'sin hollow hold en free-exercise-db'],
  'crossfit|25': ['Superman', 'superman isometrico tumbado boca abajo'],
  'crossfit|28': [null, 'sin dead hang bilateral en free-exercise-db'],
  'crossfit|36': ['Hanging_Pike', 'pike colgado de barra llevando pies hacia la barra'],
  'crossfit|41': ['Hanging_Leg_Raise', 'elevacion de piernas/rodillas colgado de barra'],
  'crossfit|45': ['Hang_Snatch', 'snatch con barra desde posicion colgada'],
  'crossfit|49': [null, 'sin wall ball en free-exercise-db'],
  'crossfit|52': ['Clean_and_Jerk', 'clean and jerk con barra'],
  'crossfit|54': ['Power_Jerk', 'power/push jerk con barra sin split'],
  'crossfit|58': [null, 'sin assault/fan bike en free-exercise-db'],
  'crossfit|63': ['Step-up_with_Knee_Raise', 'subida a cajon con peso corporal'],
  'crossfit|66': [null, 'sin hollow rocks en free-exercise-db'],
  'crossfit|81': ['Snatch', 'snatch completo con barra'],
  'crossfit|82': ['Snatch', 'squat snatch completo con barra'],
  'crossfit|86': ['Clean_and_Jerk', 'clean and jerk con barra'],
  'crossfit|87': [null, 'sin devil press en free-exercise-db'],
  'crossfit|89': [null, 'sin overhead walking lunge en free-exercise-db'],
  'crossfit|91': ['Hang_Snatch', 'hang squat snatch con barra'],
  'crossfit|92': ['Split_Jerk', 'split jerk con barra'],
  'crossfit|94': [null, 'sin assault/fan bike en free-exercise-db'],
  'crossfit|98': ['Hanging_Pike', 'pike colgado de barra llevando pies hacia la barra'],
  'crossfit|104': [null, 'sin pegboard en free-exercise-db'],
  'crossfit|108': ['Snatch', 'snatch completo con barra'],
  'crossfit|109': ['Clean_and_Jerk', 'clean and jerk con barra'],
  'crossfit|113': ['Snatch_Balance', 'snatch balance con barra'],
  'crossfit|114': ['Clean_and_Jerk', 'clean and jerk con barra (representa el complejo)'],
  'crossfit|115': ['Power_Snatch', 'power snatch con barra'],
  'crossfit|118': [null, 'sin assault/fan bike en free-exercise-db'],
};

async function main() {
  const verdicts = JSON.parse(fs.readFileSync(path.join(root, '..', '..', 'backend', 'output', 'catalog-audit', 'gif_verdicts.json'), 'utf8'));
  const mal = verdicts.filter((x) => x.veredicto === 'MAL');
  const fedb = JSON.parse(fs.readFileSync(path.join(root, 'fedb.json'), 'utf8'));

  const missing = mal.filter((m) => !(m.src + '|' + m.id in map));
  if (missing.length) {
    missing.forEach((m) => console.log('MISSING', m.src, m.id, m.nombre));
    process.exit(1);
  }
  console.log('MAL rows:', mal.length, '| map entries:', Object.keys(map).length);

  const used = [...new Set(Object.values(map).map((x) => x[0]).filter(Boolean))];
  for (const id of used) {
    if (!fedb.find((x) => x.id === id)) {
      console.log('BAD FEDB ID', id);
      process.exit(1);
    }
  }
  console.log('unique fedb ids:', used.length);

  // HEAD check
  for (const id of used) {
    const url = `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/${id}/0.jpg`;
    const r = await fetch(url, { method: 'HEAD' });
    console.log(r.status, id);
    if (r.status !== 200) process.exit(1);
  }

  const esc = (s) => String(s).replace(/'/g, "''");
  const lines = [
    '-- 01_gifs_mal.sql — corrige los 110 gifs con veredicto MAL (auditoria catalogo 2026-07-12)',
    '-- Fuente de reemplazo: free-exercise-db (JPG estaticos, verificados HEAD 200) o NULL si no hay match exacto.',
    '-- Ningun gif animado del bucket exercise-gifs coincide exactamente con estos ejercicios.',
    '',
  ];
  let toFedb = 0, toNull = 0;
  for (const m of mal) {
    const [fid, why] = map[m.src + '|' + m.id];
    const url = fid
      ? `'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/${fid}/0.jpg'`
      : 'NULL';
    fid ? toFedb++ : toNull++;
    const comment = `-- ${esc(m.nombre)} | antes: ${esc(m.muestra)} | ahora: ${fid ? esc(why) + ' (' + fid + ')' : 'NULL — ' + esc(why)}`;
    let upd;
    if (m.src === 'ejercicios') {
      upd = `UPDATE app.ejercicios SET gif_url=${url}, updated_at=now() WHERE id=${m.id};`;
    } else if (m.src === 'crossfit') {
      upd = `UPDATE app."Ejercicios_CrossFit" SET gif_url=${url}, updated_at=now() WHERE exercise_id=${m.id};`;
    } else if (m.src === 'bomberos') {
      upd = `UPDATE app."Ejercicios_Bomberos" SET gif_url=${url}, updated_at=now() WHERE exercise_id=${m.id};`;
    } else {
      throw new Error('src desconocido: ' + m.src);
    }
    lines.push(comment, upd, '');
  }
  fs.mkdirSync(path.join(root, 'fixes'), { recursive: true });
  fs.writeFileSync(path.join(root, 'fixes', '01_gifs_mal.sql'), lines.join('\n'));
  console.log('SQL escrito. fedb:', toFedb, 'NULL:', toNull);
}
main();
