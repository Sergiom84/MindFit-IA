/**
 * fetch_crossfit_gifs_exercisedb.mjs
 *
 * Consulta ExerciseDB (RapidAPI) para obtener GIFs animados reales
 * y actualiza gif_url en app."Ejercicios_CrossFit".
 *
 * Uso:
 *   node scripts/fetch_crossfit_gifs_exercisedb.mjs
 *
 * Requiere RAPIDAPI_KEY en backend/.env
 */

import https from 'https';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pg = require('pg');
const { Pool } = pg;

// Cargar .env del backend
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '../backend/.env') });

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
if (!RAPIDAPI_KEY || RAPIDAPI_KEY === 'PENDIENTE_API_KEY') {
  console.error('❌ Falta RAPIDAPI_KEY en backend/.env');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

function apiGet(path) {
  return new Promise((res, rej) => {
    const options = {
      hostname: 'exercisedb.p.rapidapi.com',
      path,
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': 'exercisedb.p.rapidapi.com'
      }
    };
    const req = https.request(options, (r) => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => {
        try { res({ status: r.statusCode, data: JSON.parse(d) }); }
        catch (e) { rej(new Error('JSON parse error: ' + d.slice(0, 200))); }
      });
    });
    req.on('error', rej);
    req.setTimeout(10000, () => { req.destroy(); rej(new Error('timeout')); });
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function normalize(str) {
  return str.toLowerCase()
    .replace(/[()[\]]/g, '')
    .replace(/\d+\/\d+\s*(lbs?|kg|cal)?/gi, '')
    .replace(/\b(rx|heavy|pesado|light|ligero|scaled|escalado|moderate|moderado|fast|rápido|slow|lento|elite|competition|competición|strict|estricto|principiante|intermedio|avanzado|elite|unbroken)\b/gi, '')
    .replace(/\s+/g, ' ').trim();
}

function wordScore(a, b) {
  const wa = new Set(normalize(a).split(' ').filter(w => w.length > 2));
  const wb = new Set(normalize(b).split(' ').filter(w => w.length > 2));
  if (wa.size === 0 || wb.size === 0) return 0;
  let common = 0;
  wa.forEach(w => { if (wb.has(w)) common++; });
  return (2 * common / (wa.size + wb.size)) * 100;
}

// Tabla de traducción español → inglés para búsqueda en ExerciseDB
const SEARCH_TERMS = {
  'Sentadillas al aire':               'bodyweight squat',
  'Sentadillas traseras (185/135 lbs)':'back squat barbell',
  'Sentadillas frontales (135/95 lbs)':'front squat',
  'Sentadillas frontales (ligero)':    'front squat',
  'Sentadilla goblet':                 'goblet squat',
  'Sentadilla sobre cabeza':           'overhead squat',
  'Sentadilla sobre cabeza (pesado, 185/135 lbs)': 'overhead squat',
  'Sentadilla sobre cabeza (pesado)':  'overhead squat',
  'Sentadilla a una pierna (Pistol)':  'pistol squat',
  'Sentadilla a una pierna con peso (Pistol)': 'pistol squat',
  'Sentadilla Pistol con peso (pesado)': 'pistol squat',
  'Sentadilla a una pierna con peso (pesado)': 'pistol squat',
  'Saltos a cajón (24"/20")':          'box jump',
  'Subidas a cajón':                   'box step up',
  'Subidas a cajón (cardio)':          'box step up',
  'Subidas a cajón (rápidas, 24/20")': 'box step up',
  'Burpees (RX)':                      'burpee',
  'Burpees (escalado)':                'burpee',
  'Burpee + Muscle-Up en barra':       'burpee',
  'Burpee salto sobre cajón':          'burpee box jump',
  'Burpee + salto largo':              'burpee broad jump',
  'Dominadas pecho a barra':           'chest to bar pull up',
  'Dominadas estrictas':               'strict pull up',
  'Dominadas escapulares':             'scapular pull up',
  'Doble salto a la comba':            'jump rope double under',
  'Triple salto a la comba':           'jump rope',
  'Comba (saltos simples)':            'jump rope',
  'Peso muerto (225/155 lbs)':         'deadlift barbell',
  'Peso muerto (pesado, 315/225 lbs)': 'deadlift barbell',
  'Peso muerto (esfuerzo máximo, 400+/300+ lbs)': 'deadlift barbell',
  'Peso muerto rumano':                'romanian deadlift',
  'Peso muerto sumo + jalón alto (75/55 lbs)': 'sumo deadlift high pull',
  'Flexiones en pino (HSPU)':          'handstand push up',
  'HSPU en déficit (4")':              'handstand push up',
  'HSPU sin pared':                    'handstand push up',
  'HSPU en anillas':                   'handstand push up',
  'Flexiones con despegue de manos':   'hand release push up',
  'Flexiones':                         'push up',
  'Aguante en pino (pared)':           'handstand hold',
  'Caminar en pino':                   'handstand walk',
  'Caminar en pino (50 pies sin pausa)': 'handstand walk',
  'Thrusters (95/65 lbs)':             'thruster',
  'Thrusters (competición, 185/135 lbs)': 'thruster',
  'Thrusters (pesado, 135/95 lbs)':    'thruster',
  'Clean & Jerk':                      'clean and jerk',
  'Clean & Jerk (competición, 245/185 lbs)': 'clean and jerk',
  'Clean & Jerk (pesado, 185/135 lbs)': 'clean and jerk',
  'Power Clean':                       'power clean',
  'Power Snatch desde colgado':        'hang power snatch',
  'Clean en sentadilla desde colgado': 'hang squat clean',
  'Snatch en sentadilla desde colgado':'hang squat snatch',
  'Snatch con mancuerna':              'dumbbell snatch',
  'Snatch (competición, 185/135 lbs)': 'snatch barbell',
  'Snatch completo (135/95 lbs)':      'squat snatch',
  'Snatch en sentadilla (pesado)':     'squat snatch',
  'Power Snatch (toque y sigue, 135/95 lbs)': 'power snatch',
  'Balance de Snatch (pesado)':        'snatch balance',
  'Push Jerk':                         'push jerk',
  'Split Jerk (pesado)':               'split jerk',
  'Press de empuje (ligero)':          'push press',
  'Press con mancuernas':              'dumbbell press',
  'Remo con mancuerna':                'dumbbell row',
  'Remo en anillas':                   'ring row',
  'Remo (ritmo lento)':                'rowing machine',
  'Remo (ritmo moderado, 500m)':       'rowing machine',
  'Remo (ritmo rápido, 1000m)':        'rowing machine',
  'Remo (ritmo élite, 2000m)':         'rowing machine',
  'Escalada de cuerda (15 pies)':      'rope climb',
  'Escalada de cuerda sin piernas':    'rope climb legless',
  'Balanceo con kettlebell (americano, 53/35 lbs)': 'kettlebell swing american',
  'Balanceo con kettlebell (ruso)':    'kettlebell swing russian',
  'Turkish Get-Up':                    'turkish get up',
  'Zancadas caminando':                'walking lunge',
  'Zancadas caminando con peso sobre cabeza (pesado)': 'overhead walking lunge',
  'Marcha del granjero (pesado)':      'farmers carry',
  'Rodillas a codos':                  'knees to elbows',
  'Pies a barra':                      'toes to bar',
  'Pies a barra (estrictos)':          'strict toes to bar',
  'Abdominales en GHD':                'ghd sit up',
  'Abdominales en V':                  'v up',
  'Abdominales':                       'sit up',
  'Aguante en posición hueca':         'hollow body hold',
  'Balanceos en posición hueca':       'hollow rock',
  'Aguante en posición Superman':      'superman hold',
  'Puente de glúteos':                 'glute bridge',
  'Plancha':                           'plank',
  'Saltos de tijera':                  'jumping jack',
  'L-Sit (anillas/paralelas)':         'l sit',
  'Aguante en soporte de anillas':     'ring support hold',
  'Fondos (anillas/paralelas)':        'ring dip',
  'Fondos en anillas (con peso)':      'ring dip weighted',
  'Muscle-Ups en barra':               'bar muscle up',
  'Muscle-Ups en barra (estrictos)':   'bar muscle up strict',
  'Muscle-Up en barra a L-Sit':        'bar muscle up',
  'Muscle-Ups en anillas':             'ring muscle up',
  'Muscle-Ups estrictos':              'strict muscle up',
  'Extensiones de cadera (GHD)':       'hip extension ghd',
  'Colgado muerto':                    'dead hang',
  'Apertura de hombros con banda':     'band pull apart',
  'Buenos días con banda':             'good morning banded',
  'Cluster (135/95 lbs)':              'cluster barbell',
  'Complejo: Clean en sentadilla + Sentadilla frontal + Jerk': 'squat clean front squat jerk',
  'Clean en sentadilla (pesado, 185/135 lbs)': 'squat clean',
  'Lanzamientos a pared (20/14 lbs)':  'wall ball',
  'Lanzamientos a pared (ligero)':     'wall ball',
  'Assault Bike (100 cal)':            'assault bike',
  'Assault Bike (20/15 cal)':          'assault bike',
  'Assault Bike (50/35 cal)':          'assault bike',
  'Assault Bike (ritmo moderado)':     'assault bike',
  'Ski Erg (moderado)':                'ski erg',
  'Ski Erg (500m)':                    'ski erg',
  'Ski Erg (1000m)':                   'ski erg',
  'Carrera (ritmo suave)':             'running',
  'Carrera (400m-800m)':               'running',
  'Carrera (1 milla)':                 'running',
  'Carrera (5K)':                      'running',
  'Carreras de ida y vuelta (25 pies)':'shuttle run',
  'Escalada de clavijas (Pegboard)':   'pegboard',
  'Volteo de neumático en equipo (Worm)': 'tire flip',
  'Devil Press (pesado, mancuernas 50/35 lbs)': 'devil press dumbbell',
};

async function main() {
  // Obtener todos los ejercicios CrossFit
  const { rows } = await pool.query(
    'SELECT exercise_id, nombre FROM app."Ejercicios_CrossFit" ORDER BY exercise_id'
  );

  // Descargar catálogo completo de ExerciseDB una sola vez (más eficiente)
  console.log('📥 Descargando catálogo ExerciseDB...');
  let allExercises = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const r = await apiGet(`/exercises?limit=${limit}&offset=${offset}`);
    if (r.status !== 200) { console.error('Error API:', r.status, r.data); break; }
    if (!r.data || r.data.length === 0) break;
    allExercises = allExercises.concat(r.data);
    console.log(`  Descargados: ${allExercises.length}`);
    if (r.data.length < limit) break;
    offset += limit;
    await sleep(300);
  }

  console.log(`✅ Catálogo: ${allExercises.length} ejercicios`);

  const updates = [];
  const noMatch = [];

  for (const ex of rows) {
    const searchTerm = SEARCH_TERMS[ex.nombre];
    if (!searchTerm) { noMatch.push(ex.nombre + ' (sin término de búsqueda)'); continue; }

    // Buscar mejor match por nombre
    let bestScore = 0;
    let bestEx = null;
    for (const apiEx of allExercises) {
      const s = wordScore(searchTerm, apiEx.name);
      if (s > bestScore) { bestScore = s; bestEx = apiEx; }
    }

    if (bestEx && bestScore >= 30) {
      updates.push({ id: ex.exercise_id, nombre: ex.nombre, match: bestEx.name, score: bestScore.toFixed(0), url: bestEx.gifUrl });
    } else {
      noMatch.push(ex.nombre + ` (mejor: ${bestEx?.name} @${bestScore.toFixed(0)}%)`);
    }
  }

  console.log(`\n✅ Con GIF animado: ${updates.length}`);
  updates.forEach(u => console.log(`  ${u.id} | ${u.nombre.substring(0,40).padEnd(40)} → ${u.match} (${u.score}%)`));

  if (noMatch.length > 0) {
    console.log(`\n⚠️  Sin match (${noMatch.length}):`);
    noMatch.forEach(n => console.log('  -', n));
  }

  if (updates.length > 0) {
    const cases = updates.map(u => `WHEN exercise_id = ${u.id} THEN '${u.url.replace(/'/g, "''")}'`).join('\n');
    const ids = updates.map(u => u.id).join(',');
    const r = await pool.query(`UPDATE app."Ejercicios_CrossFit" SET gif_url = CASE\n${cases}\nEND WHERE exercise_id IN (${ids})`);
    console.log(`\n🎬 Actualizados en BD: ${r.rowCount} ejercicios con GIFs animados reales`);
  }

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
