import https from 'https';
import pg from 'pg';
const { Pool } = pg;

function get(url) {
  return new Promise((res, rej) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (r) => {
      if (r.statusCode === 302 || r.statusCode === 301) return get(r.headers.location).then(res).catch(rej);
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => res(d));
      r.on('error', rej);
    }).on('error', rej);
  });
}

// Nombre crossfit en español → nombre exacto en yuhonas
const MANUAL_MAP = {
  'Sentadillas al aire':               'Bodyweight Squat',
  'Sentadillas traseras (185/135 lbs)':'Barbell Full Squat',
  'Saltos a cajón (24"/20")':          'Box Jump (Multiple Response)',
  'Subidas a cajón':                   'Front Box Jump',
  'Subidas a cajón (cardio)':          'Front Box Jump',
  'Subidas a cajón (rápidas, 24/20")': 'Front Box Jump',
  'Burpee + salto largo':              'Freehand Jump Squat',
  'Burpees (RX)':                      'Freehand Jump Squat',
  'Burpees (escalado)':                'Freehand Jump Squat',
  'Burpee + Muscle-Up en barra':       'Freehand Jump Squat',
  'Burpee salto sobre cajón':          'Box Jump (Multiple Response)',
  'Dominadas pecho a barra':           'Wide-Grip Rear Pull-Up',
  'Dominadas estrictas':               'Band Assisted Pull-Up',
  'Doble salto a la comba':            'Rope Jumping',
  'Triple salto a la comba':           'Rope Jumping',
  'Comba (saltos simples)':            'Rope Jumping',
  'Peso muerto (225/155 lbs)':         'Barbell Deadlift',
  'Peso muerto (pesado, 315/225 lbs)': 'Barbell Deadlift',
  'Peso muerto (esfuerzo máximo, 400+/300+ lbs)': 'Deficit Deadlift',
  'Peso muerto rumano':                'Romanian Deadlift',
  'Peso muerto sumo + jalón alto (75/55 lbs)': 'Kettlebell Sumo High Pull',
  'HSPU en déficit (4")':              'Handstand Push-Ups',
  'HSPU sin pared':                    'Handstand Push-Ups',
  'HSPU en anillas':                   'Handstand Push-Ups',
  'Flexiones en pino (HSPU)':          'Handstand Push-Ups',
  'Flexiones con despegue de manos':   'Plyo Kettlebell Pushups',
  'Sentadillas frontales (135/95 lbs)':'Front Barbell Squat',
  'Sentadillas frontales (ligero)':    'Front Barbell Squat',
  'Sentadilla goblet':                 'Goblet Squat',
  'Sentadilla sobre cabeza':           'Overhead Squat',
  'Sentadilla sobre cabeza (pesado, 185/135 lbs)': 'Overhead Squat',
  'Sentadilla sobre cabeza (pesado)':  'Overhead Squat',
  'Sentadilla a una pierna (Pistol)':  'Kettlebell Pistol Squat',
  'Sentadilla a una pierna con peso (Pistol)': 'Kettlebell Pistol Squat',
  'Sentadilla Pistol con peso (pesado)': 'Kettlebell Pistol Squat',
  'Sentadilla a una pierna con peso (pesado)': 'Kettlebell Pistol Squat',
  'Balanceo con kettlebell (americano, 53/35 lbs)': 'One-Arm Kettlebell Swings',
  'Balanceo con kettlebell (ruso)':    'One-Arm Kettlebell Swings',
  'Turkish Get-Up':                    'Kettlebell Turkish Get-Up (Squat style)',
  'Thrusters (95/65 lbs)':             'Kettlebell Thruster',
  'Thrusters (competición, 185/135 lbs)': 'Kettlebell Thruster',
  'Thrusters (pesado, 135/95 lbs)':    'Kettlebell Thruster',
  'Escalada de cuerda (15 pies)':      'Rope Climb',
  'Escalada de cuerda sin piernas':    'Rope Climb',
  'Zancadas caminando':                'Split Squats',
  'Zancadas caminando con peso sobre cabeza (pesado)': 'Split Squats',
  'Clean & Jerk':                      'One-Arm Kettlebell Clean and Jerk',
  'Clean & Jerk (competición, 245/185 lbs)': 'One-Arm Kettlebell Clean and Jerk',
  'Clean & Jerk (pesado, 185/135 lbs)': 'One-Arm Kettlebell Clean and Jerk',
  'Power Clean':                       'Kettlebell Dead Clean',
  'Power Snatch desde colgado':        'One-Arm Kettlebell Snatch',
  'Clean en sentadilla desde colgado': 'Kettlebell Hang Clean',
  'Snatch en sentadilla desde colgado':'Double Kettlebell Snatch',
  'Snatch con mancuerna':              'One-Arm Kettlebell Snatch',
  'Snatch (competición, 185/135 lbs)': 'Double Kettlebell Snatch',
  'Snatch completo (135/95 lbs)':      'Double Kettlebell Snatch',
  'Snatch en sentadilla (pesado)':     'Double Kettlebell Snatch',
  'Power Snatch (toque y sigue, 135/95 lbs)': 'One-Arm Kettlebell Snatch',
  'Push Jerk':                         'One-Arm Kettlebell Jerk',
  'Split Jerk (pesado)':               'One-Arm Kettlebell Split Jerk',
  'Press de empuje (ligero)':          'Double Kettlebell Push Press',
  'Press con mancuernas':              'Alternating Kettlebell Press',
  'Remo con mancuerna':                'Alternating Kettlebell Row',
  'Remo en anillas':                   'Rope Straight-Arm Pulldown',
  'Marcha del granjero (pesado)':      'Kettlebell Figure 8',
  'Rodillas a codos':                  'Rope Crunch',
  'Pies a barra':                      'Rope Crunch',
  'Pies a barra (estrictos)':          'Rope Crunch',
  'Abdominales':                       'Rope Crunch',
  'Saltos de tijera':                  'Freehand Jump Squat',
  'Complejo: Clean en sentadilla + Sentadilla frontal + Jerk': 'Front Squat Clean Grip',
  'Clean en sentadilla (pesado, 185/135 lbs)': 'Kettlebell Hang Clean',
  'Fondos (anillas/paralelas)':        'Rope Straight-Arm Pulldown',
  'Fondos en anillas (con peso)':      'Rope Straight-Arm Pulldown',
  'Cluster (135/95 lbs)':              'Kettlebell Hang Clean',
  'Aguante en pino (pared)':           'Handstand Push-Ups',
  'Caminar en pino':                   'Handstand Push-Ups',
  'Caminar en pino (50 pies sin pausa)': 'Handstand Push-Ups',
  'L-Sit (anillas/paralelas)':         'Rope Straight-Arm Pulldown',
  'Aguante en soporte de anillas':     'Rope Straight-Arm Pulldown',
  'Extensiones de cadera (GHD)':       'Romanian Deadlift',
  'Abdominales en GHD':                'Rope Crunch',
  'Muscle-Ups en barra':               'Wide-Grip Rear Pull-Up',
  'Muscle-Ups en barra (estrictos)':   'Wide-Grip Rear Pull-Up',
  'Muscle-Up en barra a L-Sit':        'Wide-Grip Rear Pull-Up',
  'Muscle-Ups en anillas':             'Wide-Grip Rear Pull-Up',
  'Muscle-Ups estrictos':              'Wide-Grip Rear Pull-Up',
  'Abdominales en V':                  'Rope Crunch',
  'Aguante en posición hueca':         'Rope Crunch',
  'Balanceos en posición hueca':       'Rope Crunch',
  'Aguante en posición Superman':      'Romanian Deadlift',
  'Puente de glúteos':                 'Romanian Deadlift',
  'Colgado muerto':                    'Band Assisted Pull-Up',
  'Plancha':                           'Rope Crunch',
  'Flexiones':                         'Plyo Kettlebell Pushups',
  'Remo (ritmo lento)':                'Battling Ropes',
  'Remo (ritmo moderado, 500m)':       'Battling Ropes',
  'Remo (ritmo rápido, 1000m)':        'Battling Ropes',
  'Remo (ritmo élite, 2000m)':         'Battling Ropes',
  'Carrera (ritmo suave)':             'Rope Jumping',
  'Carrera (400m-800m)':               'Rope Jumping',
  'Carrera (1 milla)':                 'Rope Jumping',
  'Carrera (5K)':                      'Rope Jumping',
  'Carreras de ida y vuelta (25 pies)':'Rope Jumping',
  'Ski Erg (moderado)':                'Battling Ropes',
  'Ski Erg (500m)':                    'Battling Ropes',
  'Ski Erg (1000m)':                   'Battling Ropes',
  'Devil Press (pesado, mancuernas 50/35 lbs)': 'Alternating Kettlebell Press',
  'Escalada de clavijas (Pegboard)':   'Rope Climb',
  'Volteo de neumático en equipo (Worm)': 'Battling Ropes',
};

const BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';

async function main() {
  const pool = new Pool({
    connectionString: 'postgresql://postgres.sbqcnlwpvjavmljzkmfy:REDACTED_ROTATE_ME@aws-0-eu-west-1.pooler.supabase.com:5432/postgres',
    ssl: { rejectUnauthorized: false }
  });

  const { rows: crossfit } = await pool.query(
    'SELECT exercise_id, nombre FROM app."Ejercicios_CrossFit" WHERE gif_url IS NULL ORDER BY nombre'
  );

  const raw = await get('https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json');
  const yuhonas = JSON.parse(raw);
  const byName = {};
  yuhonas.forEach(e => { byName[e.name] = e; });

  const updates = [];
  const noMatch = [];

  for (const ex of crossfit) {
    const mapped = MANUAL_MAP[ex.nombre];
    if (!mapped) { noMatch.push(ex.nombre); continue; }
    const y = byName[mapped];
    if (!y || !y.images || y.images.length === 0) { noMatch.push(ex.nombre + ' (no images)'); continue; }
    const url = BASE + y.id + '/images/' + y.images[0];
    updates.push({ id: ex.exercise_id, nombre: ex.nombre, match: mapped, url });
  }

  console.log('ACTUALIZABLES:', updates.length);
  updates.forEach(u => console.log(' ✓', u.id, '|', u.nombre.substring(0,45).padEnd(45), '→', u.match));
  if (noMatch.length > 0) {
    console.log('\nSIN MATCH:', noMatch.length);
    noMatch.forEach(n => console.log(' -', n));
  }

  // Aplicar updates
  if (updates.length > 0) {
    const cases = updates.map(u => `WHEN exercise_id = ${u.id} THEN '${u.url}'`).join('\n');
    const ids = updates.map(u => u.id).join(',');
    const sql = `UPDATE app."Ejercicios_CrossFit" SET gif_url = CASE \n${cases}\nEND WHERE exercise_id IN (${ids})`;
    const r = await pool.query(sql);
    console.log('\n✅ Actualizados en BD:', r.rowCount, 'ejercicios');
  }

  await pool.end();
}

main().catch(console.error);
