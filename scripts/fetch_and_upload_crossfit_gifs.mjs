/**
 * fetch_and_upload_crossfit_gifs.mjs
 *
 * 1. Para cada término de búsqueda único, llama /exercises/name/{term}
 * 2. Selecciona el mejor match por similitud de palabras
 * 3. Descarga el GIF de /image?exerciseId={id}&resolution=180
 * 4. Sube a Supabase Storage (bucket: exercise-gifs)
 * 5. Actualiza gif_url en app."Ejercicios_CrossFit"
 *
 * Uso: node scripts/fetch_and_upload_crossfit_gifs.mjs [--dry-run]
 */

import https from 'https';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { Pool } = require('pg');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '../backend/.env'), override: true });

const DRY_RUN = process.argv.includes('--dry-run');
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = 'exercise-gifs';

if (!RAPIDAPI_KEY) { console.error('❌ Falta RAPIDAPI_KEY'); process.exit(1); }
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) { console.error('❌ Faltan credenciales Supabase'); process.exit(1); }

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function rapidRequest(reqPath) {
  return new Promise((res, rej) => {
    const req = https.request({
      hostname: 'exercisedb.p.rapidapi.com',
      path: reqPath,
      headers: { 'X-RapidAPI-Key': RAPIDAPI_KEY, 'X-RapidAPI-Host': 'exercisedb.p.rapidapi.com' }
    }, r => {
      const chunks = [];
      r.on('data', c => chunks.push(c));
      r.on('end', () => res({ status: r.statusCode, contentType: r.headers['content-type'], buffer: Buffer.concat(chunks) }));
    });
    req.on('error', rej);
    req.setTimeout(20000, () => { req.destroy(); rej(new Error('timeout')); });
    req.end();
  });
}

async function supabaseUpload(fileName, buffer) {
  const hostname = new URL(SUPABASE_URL).hostname;
  return new Promise((res, rej) => {
    const req = https.request({
      hostname,
      path: `/storage/v1/object/${BUCKET}/${fileName}`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'image/gif',
        'Content-Length': buffer.length,
        'x-upsert': 'true'
      }
    }, r => {
      let d = ''; r.on('data', c => d += c);
      r.on('end', () => res({ status: r.statusCode, body: d }));
    });
    req.on('error', rej);
    req.write(buffer);
    req.end();
  });
}

function publicUrl(fileName) {
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${fileName}`;
}

function normalize(str) {
  return str.toLowerCase()
    .replace(/[()[\]\/]/g, ' ')
    .replace(/\d+\s*(lbs?|kg|cal|pies|pies?|feet?|inch|"|')/gi, '')
    .replace(/\b(rx|heavy|light|scaled|moderate|fast|slow|elite|competition|strict|pesado|ligero|moderado|unbroken|freestanding|deficit|weighted|strict|barbell|dumbbell|kettlebell|machine|american|russian|legless)\b/gi, '')
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

// Mapeo: nombre CrossFit en español → término de búsqueda en inglés para ExerciseDB
const SEARCH_TERMS = {
  'Sentadillas al aire':               'air squat',
  'Sentadillas traseras (185/135 lbs)':'back squat',
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
  'Burpee + salto largo':              'burpee',
  'Dominadas pecho a barra':           'pull up',
  'Dominadas estrictas':               'pull up',
  'Dominadas escapulares':             'scapular pull up',
  'Doble salto a la comba':            'jump rope',
  'Triple salto a la comba':           'jump rope',
  'Comba (saltos simples)':            'jump rope',
  'Peso muerto (225/155 lbs)':         'deadlift',
  'Peso muerto (pesado, 315/225 lbs)': 'deadlift',
  'Peso muerto (esfuerzo máximo, 400+/300+ lbs)': 'deadlift',
  'Peso muerto rumano':                'romanian deadlift',
  'Peso muerto sumo + jalón alto (75/55 lbs)': 'sumo deadlift high pull',
  'Flexiones en pino (HSPU)':          'handstand push up',
  'HSPU en déficit (4")':              'handstand push up',
  'HSPU sin pared':                    'handstand push up',
  'HSPU en anillas':                   'handstand push up',
  'Flexiones con despegue de manos':   'push up',
  'Flexiones':                         'push up',
  'Aguante en pino (pared)':           'handstand',
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
  'Snatch (competición, 185/135 lbs)': 'snatch',
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
  'Remo (ritmo lento)':                'rowing',
  'Remo (ritmo moderado, 500m)':       'rowing',
  'Remo (ritmo rápido, 1000m)':        'rowing',
  'Remo (ritmo élite, 2000m)':         'rowing',
  'Escalada de cuerda (15 pies)':      'rope climb',
  'Escalada de cuerda sin piernas':    'rope climb',
  'Balanceo con kettlebell (americano, 53/35 lbs)': 'kettlebell swing',
  'Balanceo con kettlebell (ruso)':    'kettlebell swing',
  'Turkish Get-Up':                    'turkish get up',
  'Zancadas caminando':                'walking lunge',
  'Zancadas caminando con peso sobre cabeza (pesado)': 'overhead lunge',
  'Marcha del granjero (pesado)':      'farmers walk',
  'Rodillas a codos':                  'knees to elbow',
  'Pies a barra':                      'toes to bar',
  'Pies a barra (estrictos)':          'toes to bar',
  'Abdominales en GHD':                'sit up',
  'Abdominales en V':                  'v up',
  'Abdominales':                       'sit up',
  'Aguante en posición hueca':         'hollow body hold',
  'Balanceos en posición hueca':       'hollow rock',
  'Aguante en posición Superman':      'superman',
  'Puente de glúteos':                 'glute bridge',
  'Plancha':                           'plank',
  'Saltos de tijera':                  'jumping jack',
  'L-Sit (anillas/paralelas)':         'l-sit',
  'Aguante en soporte de anillas':     'ring support',
  'Fondos (anillas/paralelas)':        'ring dip',
  'Fondos en anillas (con peso)':      'ring dip',
  'Muscle-Ups en barra':               'bar muscle up',
  'Muscle-Ups en barra (estrictos)':   'bar muscle up',
  'Muscle-Up en barra a L-Sit':        'bar muscle up',
  'Muscle-Ups en anillas':             'ring muscle up',
  'Muscle-Ups estrictos':              'muscle up',
  'Extensiones de cadera (GHD)':       'hip extension',
  'Colgado muerto':                    'dead hang',
  'Apertura de hombros con banda':     'band pull apart',
  'Buenos días con banda':             'good morning',
  'Cluster (135/95 lbs)':              'thruster',
  'Complejo: Clean en sentadilla + Sentadilla frontal + Jerk': 'squat clean',
  'Clean en sentadilla (pesado, 185/135 lbs)': 'squat clean',
  'Lanzamientos a pared (20/14 lbs)':  'wall ball',
  'Lanzamientos a pared (ligero)':     'wall ball',
  'Assault Bike (100 cal)':            'air bike',
  'Assault Bike (20/15 cal)':          'air bike',
  'Assault Bike (50/35 cal)':          'air bike',
  'Assault Bike (ritmo moderado)':     'air bike',
  'Ski Erg (moderado)':                'ski erg',
  'Ski Erg (500m)':                    'ski erg',
  'Ski Erg (1000m)':                   'ski erg',
  'Carrera (ritmo suave)':             'jogging',
  'Carrera (400m-800m)':               'jogging',
  'Carrera (1 milla)':                 'jogging',
  'Carrera (5K)':                      'jogging',
  'Carreras de ida y vuelta (25 pies)':'shuttle run',
  'Escalada de clavijas (Pegboard)':   'rope climb',
  'Volteo de neumático en equipo (Worm)': 'tire flip',
  'Devil Press (pesado, mancuernas 50/35 lbs)': 'devil press',
};

async function searchExerciseDB(term) {
  const encoded = encodeURIComponent(term);
  const r = await rapidRequest(`/exercises/name/${encoded}?limit=10`);
  if (r.status !== 200) return [];
  try { return JSON.parse(r.buffer.toString()); } catch { return []; }
}

async function main() {
  const { rows: crossfit } = await pool.query(
    'SELECT exercise_id, nombre FROM app."Ejercicios_CrossFit" ORDER BY exercise_id'
  );
  console.log(`CrossFit exercises: ${crossfit.length}`);
  if (DRY_RUN) console.log('🔍 DRY RUN — no se actualiza la BD ni se sube a Storage\n');

  // Agrupar por término de búsqueda único para minimizar llamadas API
  const termToExercises = new Map();
  const noTerm = [];
  for (const ex of crossfit) {
    const term = SEARCH_TERMS[ex.nombre];
    if (!term) { noTerm.push(ex.nombre); continue; }
    if (!termToExercises.has(term)) termToExercises.set(term, []);
    termToExercises.get(term).push(ex);
  }

  console.log(`Términos únicos de búsqueda: ${termToExercises.size}`);
  console.log(`Sin término: ${noTerm.length}`);

  // Para cada término único, buscar en ExerciseDB y escoger el mejor match
  const termToApiEx = new Map();
  let searchCount = 0;
  for (const [term] of termToExercises) {
    await sleep(300);
    searchCount++;
    process.stdout.write(`\r  Buscando [${searchCount}/${termToExercises.size}]: ${term.substring(0, 40)}...`);
    const results = await searchExerciseDB(term);
    if (results.length === 0) { termToApiEx.set(term, null); continue; }
    // Escoger el resultado con mayor score
    let best = results[0], bestScore = wordScore(term, results[0].name);
    for (const r of results.slice(1)) {
      const s = wordScore(term, r.name);
      if (s > bestScore) { bestScore = s; best = r; }
    }
    termToApiEx.set(term, { ...best, score: bestScore });
  }
  console.log('\n');

  // Construir lista de ejercicios con match
  const matched = [];
  for (const ex of crossfit) {
    const term = SEARCH_TERMS[ex.nombre];
    if (!term) continue;
    const apiEx = termToApiEx.get(term);
    if (!apiEx || apiEx.score < 25) continue;
    matched.push({ id: ex.exercise_id, nombre: ex.nombre, term, apiId: apiEx.id, apiName: apiEx.name, score: apiEx.score });
  }

  console.log(`🎯 Ejercicios con match: ${matched.length} / ${crossfit.length}`);
  matched.forEach(m => console.log(`  ${String(m.id).padStart(3)} | ${m.nombre.substring(0,45).padEnd(45)} → ${m.apiName} (${m.score.toFixed(0)}%)`));

  if (DRY_RUN) {
    await pool.end();
    return;
  }

  // Descargar GIF y subir — deduplicar por apiId para no gastar requests duplicados
  const apiIdToUrl = new Map();
  const updates = [];
  let gifCount = 0;

  for (const m of matched) {
    const existing = apiIdToUrl.get(m.apiId);
    if (existing) {
      updates.push({ id: m.id, nombre: m.nombre, url: existing });
      continue;
    }

    await sleep(400);
    gifCount++;
    process.stdout.write(`\r  GIF [${gifCount}] ${m.nombre.substring(0, 50)}...`);

    const gifRes = await rapidRequest(`/image?exerciseId=${m.apiId}&resolution=180`);
    if (gifRes.status !== 200 || !gifRes.contentType?.includes('gif')) {
      console.log(`\n  ⚠️  Sin GIF para ${m.nombre} (status: ${gifRes.status}, type: ${gifRes.contentType})`);
      continue;
    }

    const fileName = `crossfit/${m.apiId}.gif`;
    const uploadRes = await supabaseUpload(fileName, gifRes.buffer);
    if (uploadRes.status !== 200 && uploadRes.status !== 201) {
      console.log(`\n  ❌ Error subiendo ${fileName}: ${uploadRes.status} ${uploadRes.body}`);
      continue;
    }

    const url = publicUrl(fileName);
    apiIdToUrl.set(m.apiId, url);
    updates.push({ id: m.id, nombre: m.nombre, url });
  }

  console.log(`\n\n✅ GIFs subidos: ${apiIdToUrl.size} únicos → ${updates.length} ejercicios actualizables`);

  if (updates.length > 0) {
    const cases = updates.map(u => `WHEN exercise_id = ${u.id} THEN '${u.url}'`).join('\n    ');
    const ids = updates.map(u => u.id).join(',');
    const r = await pool.query(`
      UPDATE app."Ejercicios_CrossFit"
      SET gif_url = CASE ${cases} END
      WHERE exercise_id IN (${ids})
    `);
    console.log(`🎬 BD actualizada: ${r.rowCount} ejercicios con GIFs animados reales`);
  }

  if (noTerm.length > 0) {
    console.log(`\n⚠️  Sin término de búsqueda (${noTerm.length}):`);
    noTerm.forEach(n => console.log('  -', n));
  }

  await pool.end();
}

main().catch(e => { console.error('\n❌', e.message, e.stack); process.exit(1); });
