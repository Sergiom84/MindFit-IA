/**
 * fetch_and_upload_ejercicios_gifs.mjs
 *
 * Igual que el script de CrossFit, pero para app.ejercicios (515 ejercicios,
 * tablas de Gym, Funcional, Casa, Halterofilia, Powerlifting, Heavy Duty, etc.)
 *
 * Uso:
 *   node scripts/fetch_and_upload_ejercicios_gifs.mjs [--dry-run]
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

// API directa de ExerciseDB (no pasa por RapidAPI, sin cuota mensual)
function exercisedbRequest(reqPath) {
  return new Promise((res, rej) => {
    const req = https.request({
      hostname: 'exercisedb.io',
      path: reqPath,
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
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

// Fallback: RapidAPI (si ejercisedb.io falla)
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

// Descarga un GIF desde la URL directa del CDN de ExerciseDB (sin cuota RapidAPI)
function downloadGifDirect(gifUrl) {
  return new Promise((res, rej) => {
    const url = new URL(gifUrl);
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'GET',
    }, r => {
      // Seguir redirect si 301/302
      if ((r.statusCode === 301 || r.statusCode === 302) && r.headers.location) {
        return downloadGifDirect(r.headers.location).then(res).catch(rej);
      }
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
    .replace(/\d+\s*(kg|lbs?|%|seg|rep|min|cm|")/gi, '')
    .replace(/\b(con|sin|en|de|del|la|las|los|el|un|una|al|a|por|para|y|o|e|u|más|pesado|ligero|básico|avanzado|moderado|completo|bilateral|unilateral|asistido|estático|dinámico|intermedio|mínimo|máximo|lento|rápido|corto|largo|alto|bajo|plano|inclinado|declinado|profundo|controlado|explosivo|paused|pause|comp|competition|introducción|adaptado|simulado|modificado|simplificado|robusta|silla|toalla|portátil|mesa|pared|suelo|rodillas)\b/gi, '')
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

// Diccionario nombre → término de búsqueda en inglés para ExerciseDB
// Cubre ejercicios en español y nombres compuestos
const TERM_MAP = {
  // ── SENTADILLAS ────────────────────────────────────────────────────
  'back squat':                           'back squat',
  'front squat':                          'front squat',
  'overhead squat':                       'overhead squat',
  'pause squat':                          'pause squat',
  'pause front squat':                    'front squat',
  'tempo squat':                          'squat',
  'dynamic effort squat':                 'squat',
  'max effort squat':                     'squat',
  'competition squat':                    'squat',
  'anderson squats':                      'squat',
  'accommodating resistance squat':       'squat',
  'squat con bandas':                     'squat',
  'squat con cadenas':                    'squat',
  'safety bar squat':                     'squat',
  'pin squats':                           'squat',
  'box squat':                            'box squat',
  'sentadilla aire':                      'air squat',
  'sentadilla a caja':                    'box squat',
  'sentadilla a cajón':                   'box squat',
  'sentadilla al cajón':                  'box squat',
  'sentadilla con salto':                 'jump squat',
  'sentadilla elevación de brazos':       'squat',
  'sentadilla libre':                     'squat',
  'sentadilla olímpica':                  'squat',
  'sentadilla trasera':                   'back squat',
  'sentadilla trasera alta':              'back squat',
  'sentadilla sissy':                     'sissy squat',
  'sentadilla búlgara':                   'bulgarian split squat',
  'sentadillas asistidas':                'squat',
  'sentadillas búlgaras':                 'bulgarian split squat',
  'bulgarian split squat':               'bulgarian split squat',
  'belt squats':                          'squat',
  'goblet squat':                         'goblet squat',
  'pistol squat':                         'pistol squat',
  'pistol squat a caja':                  'pistol squat',
  'pistol squat asistida':                'pistol squat',
  'shrimp squat':                         'squat',
  'sentadilla en prensa':                 'leg press',
  'prensa 45':                            'leg press',
  'prensa inclinada':                     'leg press',
  'hack squat':                           'hack squat',
  'sentadilla con salto':                 'jump squat',
  'cossack squat':                        'cossack squat',
  'sentadilla asistida':                  'squat',

  // ── PESO MUERTO ────────────────────────────────────────────────────
  'conventional deadlift':               'deadlift',
  'sumo deadlift':                       'sumo deadlift',
  'deadlift con bandas':                 'deadlift',
  'deficit deadlift':                    'deficit deadlift',
  'snatch grip deadlift':               'deadlift',
  'rack pulls':                          'rack pull',
  'block pulls':                         'deadlift',
  'paused deadlift':                     'deadlift',
  'overload deadlift':                   'deadlift',
  'speed deadlifts':                     'deadlift',
  'max effort deadlift':                 'deadlift',
  'dynamic effort deadlift':             'deadlift',
  'competition deadlift':                'deadlift',
  'rdl con barra':                       'romanian deadlift',
  'peso muerto rumano':                  'romanian deadlift',
  'peso muerto a una pierna':            'single leg deadlift',
  'peso muerto con barra a una pierna':  'single leg deadlift',
  'peso muerto rumano con mancuernas':   'romanian deadlift',

  // ── PRESS BANCA / PECHO ────────────────────────────────────────────
  'bench press plano':                   'bench press',
  'competition bench press':             'bench press',
  'competition bench':                   'bench press',
  'dynamic effort bench':                'bench press',
  'max effort bench':                    'bench press',
  'paused bench press':                  'bench press',
  'tempo bench':                         'bench press',
  'bench con bandas':                    'bench press',
  'bench con cadenas':                   'bench press',
  'board press':                         'bench press',
  'narrow grip bench':                   'bench press',
  'pin press':                           'bench press',
  'slingshot press':                     'bench press',
  'jm press':                            'bench press',
  'shirt work':                          'bench press',
  'aperturas con mancuernas':            'dumbbell fly',
  'aperturas con cable':                 'cable fly',
  'aperturas en máquina':                'chest fly machine',
  'pec-deck':                            'pec deck',
  'pullover en máquina':                 'pullover',
  'pullover en polea':                   'pullover',
  'pullover recto en polea':             'pullover',

  // ── ESPALDA / TRACCIÓN ─────────────────────────────────────────────
  'dominadas':                           'pull up',
  'dominada pronación':                  'pull up',
  'dominadas negativas':                 'pull up',
  'dominadas con lastre':                'weighted pull up',
  'dominadas lastradas':                 'weighted pull up',
  'remo invertido':                      'inverted row',
  'remo en polea baja':                  'seated cable row',
  'jalón en polea':                      'lat pulldown',
  'jalón supino':                        'lat pulldown',
  'pendlay row':                         'bent over row',
  'seal row':                            'bent over row',
  'dead hang':                           'dead hang',
  'scap pull':                           'scapular pull up',
  'front lever':                         'front lever',
  'back lever':                          'back lever',
  'human flag':                          'human flag',
  'muscle-up en barra':                  'bar muscle up',
  'muscle-up en anillas':                'ring muscle up',
  'muscle up en barra':                  'bar muscle up',
  'muscle-up asistido':                  'muscle up',
  'remo trx':                            'inverted row',

  // ── HOMBROS ───────────────────────────────────────────────────────
  'overhead press':                      'overhead press',
  'push press con barra':                'push press',
  'strict press':                        'overhead press',
  'push press':                          'push press',
  'push jerk':                           'push jerk',
  'press militar':                       'overhead press',
  'press tras nuca':                     'overhead press',
  'press militar con mancuernas':        'dumbbell shoulder press',
  'elevación lateral':                   'lateral raise',
  'elevación lateral en cable':          'cable lateral raise',
  'press overhead con mancuerna':        'dumbbell shoulder press',
  'press de hombros con banda':          'shoulder press',
  'shrugs':                              'shrugs',
  'pájaros en polea':                    'reverse fly',
  'reverse fly':                         'reverse fly',

  // ── TRÍCEPS ───────────────────────────────────────────────────────
  'fondos en paralelas':                 'dips',
  'fondos en paralelas lastrados':       'weighted dips',
  'fondos pesados lastrados':            'weighted dips',
  'fondos en barras paralelas asistidos':'assisted dips',
  'fondos unilateral asistido':          'dips',
  'dips en paralelas':                   'dips',
  'dips en máquina asistida':            'assisted dips',
  'extensión francesa':                  'skull crusher',
  'press francés':                       'skull crusher',
  'jm press':                            'skull crusher',
  'tricep extensions overhead':          'overhead tricep extension',
  'tríceps en máquina':                  'tricep machine',
  'explosive dips':                      'dips',

  // ── BÍCEPS ────────────────────────────────────────────────────────
  'curl de bíceps':                      'bicep curl',
  'curl concentrado':                    'concentration curl',
  'curl en predicador':                  'preacher curl',
  'curl scott':                          'preacher curl',
  'curl en polea baja':                  'cable curl',
  'curls isométricos con banda':         'bicep curl',
  'curl femoral':                        'leg curl',
  'curl femoral tumbado':                'lying leg curl',
  'curl femoral unilateral':             'leg curl',
  'curl de bíceps con toalla':           'bicep curl',
  'curl complejos':                      'bicep curl',

  // ── CORE ─────────────────────────────────────────────────────────
  'plank':                               'plank',
  'plancha frontal':                     'plank',
  'plancha con toque de hombro':         'plank shoulder tap',
  'plancha con salto de pies':           'plank jack',
  'plancha completa':                    'plank',
  'plancha hollow hold':                 'hollow body hold',
  'plank pesado':                        'plank',
  'hollow body':                         'hollow body hold',
  'hollow body tuck':                    'hollow body hold',
  'tuck planche':                        'planche',
  'planche lean':                        'planche lean',
  'pseudo planche push-up':              'planche push up',
  'l-sit':                               'l-sit',
  'l-sit tuck':                          'l-sit',
  'l-sit hold':                          'l-sit',
  'l-sit ponderado':                     'l-sit',
  'v-sit':                               'v sit',
  'v-sit hold':                          'v sit',
  'ab wheel':                            'ab wheel rollout',
  'ab wheel rollout':                    'ab wheel rollout',
  'rueda abdominal':                     'ab wheel rollout',
  'dragon flag':                         'dragon flag',
  'toes-to-bar':                         'toes to bar',
  'crunch en polea':                     'cable crunch',
  'crunch con carga':                    'crunch',
  'crunches en banco declinado':         'decline crunch',
  'pallof press':                        'pallof press',
  'hanging knee raises':                 'hanging knee raise',
  'dead bug':                            'dead bug',
  'bird dog':                            'bird dog',
  'plancha con toque':                   'plank shoulder tap',
  'windshield wipers':                   'windshield wiper',
  'farmer carry':                        'farmers walk',
  'farmer\'s walk':                      'farmers walk',
  'suitcase carry':                      'suitcase carry',
  'waiter carry':                        'farmers walk',
  'yoke carry':                          'farmers walk',
  'abdominales bicicleta':               'bicycle crunch',

  // ── PIERNAS ──────────────────────────────────────────────────────
  'nordic curl':                         'nordic hamstring curl',
  'nordic hamstring curls':              'nordic hamstring curl',
  'extensión de rodilla':                'leg extension',
  'hip thrust':                          'hip thrust',
  'hip circles':                         'hip circle',
  'buenos días con barra':               'good morning',
  'elevación de gemelos':                'calf raise',
  'elevación de talones':                'calf raise',
  'elevaciones de talón':                'calf raise',
  'elevaciones de pantorrilla':          'calf raise',
  'elevación de talones en prensa':      'calf raise',
  'step-up':                             'step up',
  'step-ups':                            'step up',
  'step up':                             'step up',
  'walking lunges':                      'walking lunge',
  'overhead walking lunges':             'overhead walking lunge',
  'snatch grip overhead lunges':         'overhead walking lunge',
  'reverse lunge':                       'reverse lunge',
  'zancada asistida':                    'lunge',
  'zancadas estáticas':                  'lunge',
  'lunges caminando':                    'walking lunge',
  'sentadilla búlgara con mancuernas':   'bulgarian split squat',

  // ── HALTEROFILIA / TÉCNICA ────────────────────────────────────────
  'snatch completo':                     'snatch',
  'power snatch':                        'power snatch',
  'hang power snatch':                   'hang power snatch',
  'hang snatch':                         'hang snatch',
  'snatch pull':                         'snatch pull',
  'snatch balance':                      'snatch balance',
  'snatch high pull':                    'snatch pull',
  'snatch grip high pull':               'upright row',
  'snatch grip rdl':                     'romanian deadlift',
  'muscle snatch':                       'muscle snatch',
  'drop snatch':                         'snatch',
  'overhead squat con barra':            'overhead squat',
  'overhead squat con pvc':              'overhead squat',
  'clean completo':                      'squat clean',
  'power clean':                         'power clean',
  'hang clean':                          'hang clean',
  'hang power clean':                    'hang power clean',
  'clean pull':                          'clean pull',
  'clean + 3 front squats':              'squat clean',
  'clean complejo':                      'squat clean',
  'clean desde suelo':                   'squat clean',
  'power clean desde suelo':             'power clean',
  'push jerk':                           'push jerk',
  'split jerk':                          'split jerk',
  'jerk desde bloques':                  'split jerk',
  'tall clean':                          'squat clean',
  'tall jerk':                           'split jerk',
  'hang pull':                           'hang clean',
  'muscle clean con pvc':                'power clean',
  'muscle snatch con pvc':               'muscle snatch',
  'push press con barra vacía':          'push press',
  'sotts press':                         'overhead squat',
  'pause front squat':                   'front squat',
  'front squat con carga':               'front squat',
  'good morning pesado':                 'good morning',

  // ── CALISTENIA / MOVILIDAD ────────────────────────────────────────
  'pike push-up':                        'pike push up',
  'pike hold':                           'handstand',
  'pseudo planche':                      'planche push up',
  'planche lean avanzada':               'planche lean',
  'handstand asistido':                  'handstand',
  'crow pose':                           'crow pose',
  'soporte en paralelas':                'ring support',
  'back lever':                          'back lever',
  'front lever hold':                    'front lever',
  'ring muscle-up':                      'ring muscle up',
  'muscle-up adaptado':                  'muscle up',
  'jefferson curl':                      'jefferson curl',
  'pancake stretch':                     'pancake stretch',
  'cossack squat dinámico':              'cossack squat',
  'deep squat hold':                     'squat',
  'pigeon pose':                         'pigeon pose',
  'child pose':                          'child pose',
  'cat-cow':                             'cat cow',
  'bird dog':                            'bird dog',
  'scorpion stretch':                    'scorpion stretch',
  'shoulder dislocates':                 'shoulder dislocates',
  'thread the needle':                   'thread the needle',
  'lizard pose':                         'lizard stretch',
  'king pigeon pose':                    'pigeon pose',
  'bretzel stretch':                     'stretch',
  'spiderman stretch':                   'spiderman stretch',
  'frog stretch':                        'frog stretch',
  'hip circles 90/90':                   'hip stretch',
  'rotaciones torácicas':                'thoracic rotation',
  'rotaciones de cadera':                'hip circle',
  'leg swings':                          'leg swings',
  'círculos de brazos':                  'arm circle',
  'estiramiento de cuádriceps':          'quad stretch',
  'estiramiento de isquiotibiales':      'hamstring stretch',
  'estiramiento mariposa':               'butterfly stretch',
  'flexión lateral de cuello':           'neck stretch',
  'rotaciones de tobillo':               'ankle circle',
  'apertura de pecho en pared':          'chest stretch',

  // ── CARDIO / HIIT ─────────────────────────────────────────────────
  'burpee':                              'burpee',
  'burpees completos':                   'burpee',
  'burpees modificados':                 'burpee',
  'burpee broad jump':                   'burpee',
  'burpees al ritmo':                    'burpee',
  '180 degree burpees':                  'burpee',
  '180 degree jump squat':               'jump squat',
  'box jumps':                           'box jump',
  'box jumps con silla':                 'box jump',
  'broad jumps':                         'broad jump',
  'tuck jumps':                          'tuck jump',
  'jumping jacks':                       'jumping jacks',
  'jumping jacks modificados':           'jumping jacks',
  'mountain climbers':                   'mountain climber',
  'escaladores lentos':                  'mountain climber',
  'high knees':                          'high knees',
  'skaters':                             'skaters',
  'saltos laterales':                    'lateral jump',
  'single leg burpees':                  'burpee',
  'clapping push-ups':                   'clap push up',
  'plyo push-ups':                       'plyometric push up',
  'battle rope':                         'battle rope',
  'shadow boxing':                       'boxing',
  'sprints en el sitio':                 'high knees',
  'quick feet':                          'high knees',
  'knee drives':                         'high knees',
  'step touch lateral':                  'step touch',
  'sprawls explosivos':                  'sprawl',
  'inchworm':                            'inchworm',
  'reverse lunge con rodilla alta':      'reverse lunge',
  'sentadilla elevación de brazos':      'squat',
  'caminata con elevación de rodillas':  'walking',
  'marcha en el sitio':                  'marching',
  'marcha con brazos en cruz':           'marching',
  'saltos de cuerda simulados':          'jump rope',
  'toe taps':                            'toe tap',
  'fondos en silla':                     'dips',
  'plancha con salto de pies':           'plank jack',
  'man makers':                          'man maker',
  'devil press':                         'devil press',

  // ── FUNCIONAL / CALISTENIA CASA ───────────────────────────────────
  'dominadas en barra portátil':         'pull up',
  'pistol squats':                       'pistol squat',
  'kettlebell swing':                    'kettlebell swing',
  'remo invertido con toalla':           'inverted row',
  'remo invertido con pies':             'inverted row',
  'remo invertido piernas':              'inverted row',
  'remo invertido rodillas':             'inverted row',
  'sentadillas asistidas con silla':     'squat',
  'flexiones inclinadas en silla':       'push up',
  'fondos en silla':                     'dips',
  'sentadillas búlgaras con silla':      'bulgarian split squat',
  'elevaciones de pantorrilla en escalón': 'calf raise',
  'zancadas estáticas':                  'lunge',
  'hip thrust con banda':                'hip thrust',
  'press de hombros con banda':          'shoulder press',
  'plancha sobre rodillas':              'plank',
  'puente de glúteo':                    'glute bridge',
  'superman hold':                       'superman',
  'curl de bíceps con toalla':           'bicep curl',
  'remo invertido con toalla/mesa':      'inverted row',
  'muscle-up adaptado con toalla':       'muscle up',
  'box jumps con silla robusta':         'box jump',
  'battle rope simulado con toallas':    'battle rope',
  'muscle-up en barra':                  'bar muscle up',
  'desplazamientos laterales':           'lateral shuffle',

  // ── CARGA / CALISTENIA AVANZADA ───────────────────────────────────
  'farmer carry':                        'farmers walk',
  'suitcase carry':                      'suitcase carry',
  'waiter carry':                        'farmers walk',
  'sandbag shoulder':                    'sandbag carry',
  'yoke carry':                          'farmers walk',

  // ── EMPUJE AVANZADO ──────────────────────────────────────────────
  'flexión diamante':                    'diamond push up',
  'flexión en rodillas':                 'push up',
  'tuck planche':                        'planche',
  'planche lean':                        'planche lean',
};

function getSearchTerm(nombre) {
  const n = nombre.toLowerCase()
    .replace(/\s*\(.*?\)/g, '')   // quitar paréntesis
    .replace(/[,\/]/g, ' ')
    .replace(/\s+/g, ' ').trim();

  // Buscar en el mapa de mayor a menor longitud de clave
  for (const [key, term] of Object.entries(TERM_MAP)) {
    if (n.includes(key.toLowerCase())) return term;
  }

  // Fallback: usar el nombre normalizado directamente (muchos ya en inglés)
  return n.replace(/\b(con|sin|en|de|del|la|las|los|el|un|una|al|a|por|para|y|o|pesado|ligero|básico|avanzado|moderado|completo|bilateral|unilateral|asistido)\b/gi, '').trim() || nombre;
}

async function searchExerciseDB(term) {
  const encoded = encodeURIComponent(term.slice(0, 50));
  // Intentar primero la API directa (sin cuota RapidAPI)
  let r = await exercisedbRequest(`/api/v1/exercises/name/${encoded}?limit=8&offset=0`);
  if (r.status === 200) {
    try {
      const data = JSON.parse(r.buffer.toString());
      return Array.isArray(data) ? data : (data.exercises || data.data || []);
    } catch { /* caer a RapidAPI */ }
  }
  // Fallback RapidAPI
  r = await rapidRequest(`/exercises/name/${encoded}?limit=8`);
  if (r.status !== 200) return [];
  try { return JSON.parse(r.buffer.toString()); } catch { return []; }
}

async function main() {
  const { rows } = await pool.query(
    'SELECT id, nombre FROM app.ejercicios WHERE gif_url IS NULL ORDER BY nombre'
  );
  console.log(`Ejercicios sin gif_url: ${rows.length}`);
  if (DRY_RUN) console.log('🔍 DRY RUN — no se actualiza la BD ni Storage\n');

  // Agrupar por término de búsqueda para minimizar requests API
  const termMap = new Map(); // term → exercises[]
  for (const ex of rows) {
    const term = getSearchTerm(ex.nombre);
    if (!termMap.has(term)) termMap.set(term, []);
    termMap.get(term).push(ex);
  }
  console.log(`Términos únicos: ${termMap.size}\n`);

  // Buscar cada término en ExerciseDB
  const termToApi = new Map();
  let i = 0;
  for (const [term] of termMap) {
    i++;
    await sleep(300);
    process.stdout.write(`\r  [${i}/${termMap.size}] ${term.substring(0, 45)}...`);
    const results = await searchExerciseDB(term);
    if (results.length === 0) { termToApi.set(term, null); continue; }
    let best = results[0], bestScore = wordScore(term, results[0].name);
    for (const r of results.slice(1)) {
      const s = wordScore(term, r.name);
      if (s > bestScore) { bestScore = s; best = r; }
    }
    termToApi.set(term, bestScore >= 25 ? { id: best.id, name: best.name, gifUrl: best.gifUrl, score: bestScore } : null);
  }
  console.log('\n');

  const matched = [];
  for (const ex of rows) {
    const term = getSearchTerm(ex.nombre);
    const apiEx = termToApi.get(term);
    if (apiEx) matched.push({ id: ex.id, nombre: ex.nombre, term, apiId: apiEx.id, apiName: apiEx.name, gifUrl: apiEx.gifUrl, score: apiEx.score });
  }

  console.log(`🎯 Con match: ${matched.length} / ${rows.length}`);
  if (DRY_RUN) {
    matched.forEach(m => console.log(`  ${String(m.id).padStart(3)} | ${m.nombre.substring(0,45).padEnd(45)} → ${m.apiName} (${m.score.toFixed(0)}%)`));
    await pool.end();
    return;
  }

  // Descargar GIF + subir, deduplicando por apiId
  const apiIdToUrl = new Map();
  const updates = [];
  let gifCount = 0;

  for (const m of matched) {
    if (apiIdToUrl.has(m.apiId)) {
      updates.push({ id: m.id, url: apiIdToUrl.get(m.apiId) });
      continue;
    }
    await sleep(200);
    gifCount++;
    process.stdout.write(`\r  GIF [${gifCount}] ${m.nombre.substring(0, 50)}...`);

    // Usar gifUrl directa del resultado (CDN ExerciseDB, sin cuota RapidAPI)
    if (!m.gifUrl) {
      console.log(`\n  ⚠️  Sin gifUrl en resultado API: ${m.nombre}`);
      continue;
    }
    const gifRes = await downloadGifDirect(m.gifUrl);
    if (gifRes.status !== 200) {
      console.log(`\n  ⚠️  Sin GIF (${gifRes.status}): ${m.nombre}`);
      continue;
    }

    const fileName = `ejercicios/${m.apiId}.gif`;
    const up = await supabaseUpload(fileName, gifRes.buffer);
    if (up.status !== 200 && up.status !== 201) {
      console.log(`\n  ❌ Error subiendo ${fileName}: ${up.status} ${up.body}`);
      continue;
    }

    const url = publicUrl(fileName);
    apiIdToUrl.set(m.apiId, url);
    updates.push({ id: m.id, url });
  }

  console.log(`\n\n✅ GIFs subidos: ${apiIdToUrl.size} únicos → ${updates.length} ejercicios`);

  if (updates.length > 0) {
    const cases = updates.map(u => `WHEN id = ${u.id} THEN '${u.url}'`).join('\n    ');
    const ids = updates.map(u => u.id).join(',');
    const r = await pool.query(`
      UPDATE app.ejercicios SET gif_url = CASE ${cases} END WHERE id IN (${ids})
    `);
    console.log(`🎬 BD actualizada: ${r.rowCount} ejercicios con GIFs animados`);
  }

  await pool.end();
}

main().catch(e => { console.error('\n❌', e.message); process.exit(1); });
