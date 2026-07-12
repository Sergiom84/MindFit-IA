// Generador del parche 04_crossfit.sql — valida cada exercise_id/nombre contra el JSON de auditoría.
const fs = require('fs');
const path = require('path');
const rows = require(path.join(__dirname, '..', 'ejercicios_crossfit.json'));
const byId = new Map(rows.map(r => [r.exercise_id, r]));
const esc = s => String(s).replace(/'/g, "''");
const T = 'app."Ejercicios_CrossFit"';
const assert = (c, m) => { if (!c) throw new Error(m); };

assert(rows.length === 120, 'se esperaban 120 filas, hay ' + rows.length);

// ---------- 1. supports_strength_block ----------
const STRENGTH = [12,14,16,44,45,46,47,52,53,54,55,56,81,82,83,84,85,86,88,90,91,92,108,109,110,111,112,113,114,115];
for (const id of STRENGTH) {
  const r = byId.get(id);
  assert(r, 'strength id inexistente ' + id);
  assert(r.dominio === 'Weightlifting', `id ${id} (${r.nombre}) no es Weightlifting`);
}

// ---------- 2. time_domain ----------
const SPRINT = [44,45,46,52,53,54,55,56,71,72,73,74,75,76,77,80,81,82,83,84,85,86,88,90,91,92,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,120,122];
const LARGO = [17,19,117];
const VARIABLE = [3,8,11,15,20,22,34,35,42,43,49,50,60,62,87];
const assigned = new Set([...SPRINT, ...LARGO, ...VARIABLE]);
assert(assigned.size === SPRINT.length + LARGO.length + VARIABLE.length, 'solapes en time_domain');
const MEDIO = rows.map(r => r.exercise_id).filter(id => !assigned.has(id));
for (const id of assigned) assert(byId.has(id), 'time_domain id inexistente ' + id);

// ---------- 3. pairing_tags ----------
const TAGS = {
  1:'pull,horizontal', 2:'push,horizontal', 3:'squat,legs', 4:'core', 5:'mono,legs',
  6:'legs', 7:'core', 8:'push,legs', 9:'squat,legs', 10:'push,vertical,shoulders',
  11:'hinge,explosivo', 12:'hinge,grip', 13:'pull,horizontal', 14:'squat,legs',
  15:'squat,push', 16:'push,vertical,explosivo', 17:'mono,pull', 18:'mono,legs',
  19:'mono,legs', 20:'mono,legs', 21:'mono,pull', 22:'legs,squat', 23:'mono,legs',
  24:'core', 25:'core', 26:'hinge', 27:'shoulders', 28:'grip', 29:'hinge',
  30:'pull,grip', 31:'pull,vertical,grip', 32:'pull,vertical,grip',
  33:'push,horizontal,explosivo', 34:'legs,explosivo', 35:'push,legs', 36:'core,grip',
  37:'push', 38:'squat,legs', 39:'core', 40:'push,vertical,shoulders', 41:'core,grip',
  42:'push,legs,explosivo', 43:'squat,push', 44:'hinge,pull,explosivo',
  45:'hinge,pull,explosivo', 46:'hinge,pull', 47:'squat,shoulders', 48:'hinge,pull',
  49:'squat,push', 50:'hinge,explosivo', 51:'hinge,pull,explosivo',
  52:'hinge,push,explosivo', 53:'squat,legs', 54:'push,vertical,explosivo',
  55:'squat,legs', 56:'hinge,squat,explosivo', 57:'mono,pull', 58:'mono,legs',
  59:'mono,legs', 60:'mono,legs', 61:'mono,pull', 62:'push,legs,explosivo',
  63:'mono,legs', 64:'mono,legs', 65:'core', 66:'core', 67:'hinge',
  68:'push,shoulders', 69:'grip,core', 70:'shoulders,core', 71:'pull,push,grip',
  72:'pull,push,grip', 73:'push,vertical', 74:'push,shoulders,core', 75:'pull,grip',
  76:'push,vertical', 77:'pull,push,grip', 78:'squat,legs', 79:'core',
  80:'pull,push,grip', 81:'hinge,pull,explosivo', 82:'hinge,squat,explosivo',
  83:'hinge,squat,explosivo', 84:'squat,push', 85:'squat,shoulders',
  86:'hinge,push,explosivo', 87:'hinge,push,explosivo', 88:'hinge,squat,push',
  89:'legs,shoulders', 90:'hinge,pull', 91:'hinge,squat,explosivo',
  92:'push,vertical,explosivo', 93:'mono,pull', 94:'mono,legs', 95:'mono,legs',
  96:'mono,legs', 97:'mono,pull', 98:'core,grip', 100:'push', 101:'push,vertical',
  102:'pull,grip', 103:'push,vertical', 104:'pull,grip', 105:'pull,push,grip',
  106:'push,shoulders,core', 107:'pull,push,core', 108:'hinge,pull,explosivo',
  109:'hinge,push,explosivo', 110:'squat,shoulders', 111:'squat,push',
  112:'hinge,pull', 113:'squat,shoulders,explosivo', 114:'hinge,squat,push',
  115:'hinge,pull,explosivo', 116:'mono,pull', 117:'mono,legs', 118:'mono,legs',
  120:'hinge,explosivo', 121:'push,shoulders,core', 122:'legs,push'
};
for (const r of rows) assert(TAGS[r.exercise_id], 'sin pairing_tags: ' + r.exercise_id);
assert(Object.keys(TAGS).length === 120, 'TAGS != 120');

const AVOID = {
  43:'squat,push', 84:'squat,push', 111:'squat,push',          // thrusters: no duplicar squat+push
  15:'squat,push', 49:'squat,push',                            // wall balls: mismo patrón que thruster
  88:'squat,push',                                             // cluster
  46:'hinge,pull', 90:'hinge,pull', 112:'hinge,pull',          // pesos muertos pesados
  48:'hinge,pull',                                             // SDHP castiga cadena posterior y agarre
  50:'hinge',                                                  // KB swing americano
  69:'grip', 75:'grip', 102:'grip', 104:'grip',                // agarre intensivo
  36:'grip,core', 98:'grip,core',                              // toes-to-bar
  71:'grip', 72:'grip', 77:'grip', 80:'grip', 105:'grip', 107:'grip', // muscle-ups
  73:'push,vertical', 76:'push,vertical', 101:'push,vertical', 103:'push,vertical', // HSPU
  54:'push,vertical', 92:'push,vertical',                      // jerks
  85:'squat,shoulders', 110:'squat,shoulders'                  // OHS pesado
};
for (const id of Object.keys(AVOID)) assert(byId.has(+id), 'avoid id inexistente ' + id);

// ---------- Puntuales: verificación de nombre ----------
const expect = {
  7: 'Abdominales', 22: 'Zancadas caminando', 38: 'Sentadilla a una pierna (Pistol)',
  54: 'Push Jerk', 62: 'Burpee + salto largo', 78: 'Sentadilla a una pierna con peso (Pistol)',
  98: 'Pies a barra (estrictos)', 111: 'Thrusters (competición, 84/61 kg)',
  117: 'Carrera (5K)', 120: 'Volteo de neumático en equipo (Worm)',
  121: 'Wall Walk (subida a la pared)', 122: 'Empuje de trineo (Sled Push)'
};
for (const [id, nom] of Object.entries(expect)) {
  assert(byId.get(+id) && byId.get(+id).nombre === nom, `nombre no coincide para id ${id}: ${byId.get(+id) && byId.get(+id).nombre}`);
}
assert(byId.get(78).nivel === 'Avanzado', 'id 78 no es Avanzado');
assert(byId.get(38).nivel === 'Intermedio', 'id 38 no es Intermedio');
assert(byId.get(122).dominio === 'Monostructural', 'id 122 dominio inesperado');

// ---------- Generación ----------
const L = [];
L.push('-- =====================================================================');
L.push('-- 04_crossfit.sql — Parche de auditoría para app."Ejercicios_CrossFit"');
L.push('-- Generado el 2026-07-12 a partir de output/catalog-audit/ejercicios_crossfit.json');
L.push('-- 120 filas verificadas (exercise_id 1-122, sin 99 ni 119).');
L.push('-- Sin BEGIN/COMMIT: ejecutar dentro de la transacción que decida el operador.');
L.push('-- =====================================================================');
L.push('');

L.push('-- ---------------------------------------------------------------------');
L.push('-- FIX 1: supports_strength_block = 1 para movimientos de fuerza/halterofilia');
L.push('-- con barra aptos para bloque de fuerza (squats, pesos muertos, cleans,');
L.push('-- snatches, presses/jerks, OHS, thrusters pesados). Todos verificados como');
L.push(`-- dominio Weightlifting en el JSON. ${STRENGTH.length} filas. El resto queda a 0`);
L.push('-- (ya lo está en la tabla). Excluidos a propósito: 43 (Thruster 43/30, peso');
L.push('-- de metcon), 48 (SDHP 34/25, movimiento de acondicionamiento), 87 (Devil');
L.push('-- Press con mancuernas) y 89 (zancadas OH, no es levantamiento de bloque).');
L.push('-- ---------------------------------------------------------------------');
L.push(`UPDATE ${T} SET supports_strength_block = 1`);
L.push(`WHERE exercise_id IN (${STRENGTH.join(', ')});`);
L.push('');

L.push('-- ---------------------------------------------------------------------');
L.push('-- FIX 2: time_domain para las 120 filas.');
L.push(`--   sprint   (${SPRINT.length}): levantamientos pesados/olímpicos, gimnásticos de alta`);
L.push('--                 destreza en series cortas (muscle-ups, HSPU, rope climb,');
L.push('--                 pino), implementos pesados (Worm, trineo).');
L.push(`--   largo    (${LARGO.length}):  carrera suave, remo lento, carrera 5K.`);
L.push(`--   variable (${VARIABLE.length}): movimientos válidos en cualquier dominio (burpees,`);
L.push('--                 wall balls, KB swings, air squats, box jumps, double');
L.push('--                 unders, comba, zancadas, thruster ligero, devil press).');
L.push(`--   medio    (${MEDIO.length}): resto de cíclicos y movimientos moderados.`);
L.push('-- ---------------------------------------------------------------------');
L.push(`UPDATE ${T} SET time_domain = 'sprint'`);
L.push(`WHERE exercise_id IN (${SPRINT.join(', ')});`);
L.push('');
L.push(`UPDATE ${T} SET time_domain = 'largo'`);
L.push(`WHERE exercise_id IN (${LARGO.join(', ')});`);
L.push('');
L.push(`UPDATE ${T} SET time_domain = 'variable'`);
L.push(`WHERE exercise_id IN (${VARIABLE.join(', ')});`);
L.push('');
L.push(`UPDATE ${T} SET time_domain = 'medio'`);
L.push(`WHERE exercise_id IN (${MEDIO.join(', ')});`);
L.push('');

L.push('-- ---------------------------------------------------------------------');
L.push('-- FIX 3a: pairing_tags (vocabulario: squat, hinge, push, pull, vertical,');
L.push('-- horizontal, core, grip, mono, legs, shoulders, explosivo). CSV en');
L.push('-- minúsculas. Agrupados por valor para compactar.');
L.push('-- ---------------------------------------------------------------------');
const byTag = new Map();
for (const [id, tag] of Object.entries(TAGS)) {
  if (!byTag.has(tag)) byTag.set(tag, []);
  byTag.get(tag).push(+id);
}
for (const [tag, ids] of [...byTag.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  ids.sort((a, b) => a - b);
  const names = ids.map(id => byId.get(id).nombre).join(' | ');
  L.push(`-- ${names}`);
  L.push(`UPDATE ${T} SET pairing_tags = '${esc(tag)}' WHERE exercise_id IN (${ids.join(', ')});`);
  L.push('');
}

L.push('-- ---------------------------------------------------------------------');
L.push(`-- FIX 3b: avoid_pairing_with para ${Object.keys(AVOID).length} movimientos con conflicto claro`);
L.push('-- (duplicación de patrón o fatiga local de agarre/hombro). El resto queda');
L.push('-- NULL (ya lo está en la tabla).');
L.push('-- ---------------------------------------------------------------------');
const byAvoid = new Map();
for (const [id, tag] of Object.entries(AVOID)) {
  if (!byAvoid.has(tag)) byAvoid.set(tag, []);
  byAvoid.get(tag).push(+id);
}
for (const [tag, ids] of [...byAvoid.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  ids.sort((a, b) => a - b);
  const names = ids.map(id => byId.get(id).nombre).join(' | ');
  L.push(`-- ${names}`);
  L.push(`UPDATE ${T} SET avoid_pairing_with = '${esc(tag)}' WHERE exercise_id IN (${ids.join(', ')});`);
  L.push('');
}

L.push('-- ---------------------------------------------------------------------');
L.push('-- FIX 4: is_benchmark = 0 en TODAS las filas. Son movimientos, no WODs');
L.push('-- benchmark; el criterio anterior era inconsistente (marcaba 21 filas sin criterio claro).');
L.push('-- ---------------------------------------------------------------------');
L.push(`UPDATE ${T} SET is_benchmark = 0;`);
L.push('');

L.push('-- ---------------------------------------------------------------------');
L.push('-- FIX 5: correcciones puntuales.');
L.push('-- ---------------------------------------------------------------------');
L.push('');
L.push("-- 111 Thrusters (competición, 84/61 kg): las notas decían 'Fran weight, Games");
L.push("-- standard', pero Fran es 43/30 kg (exercise_id 43).");
L.push(`UPDATE ${T} SET notas = 'Peso de competición/élite' WHERE exercise_id = 111;`);
L.push('');
L.push('-- 120 Volteo de neumático en equipo (Worm): no es un neumático, es el Worm.');
L.push(`UPDATE ${T} SET nombre = 'Volteo de Worm en equipo', equipamiento = 'Worm',`);
L.push(`  escalamiento = 'Volteo de neumático ligero o sandbag en equipo'`);
L.push('WHERE exercise_id = 120;');
L.push('');
L.push('-- 121 Wall Walk: equipamiento vacío en la tabla.');
L.push(`UPDATE ${T} SET equipamiento = 'Pared' WHERE exercise_id = 121;`);
L.push('');
L.push('-- 122 Empuje de trineo: equipamiento vacío. Dominio: estaba como');
L.push("-- 'Monostructural'; el trineo pesado es trabajo de fuerza/accesorio, no");
L.push("-- cíclico puro. Los valores de dominio existentes en la tabla son Gymnastic,");
L.push("-- Weightlifting, Monostructural y Accesorios → se usa 'Accesorios' (valor ya");
L.push('-- existente), coherente con farmer carry (69) y Worm (120).');
L.push(`UPDATE ${T} SET equipamiento = 'Trineo', dominio = 'Accesorios' WHERE exercise_id = 122;`);
L.push('');
L.push('-- 22, 62, 98: dominio incorrecto (eran Monostructural/Accesorios); son');
L.push('-- movimientos gimnásticos con peso corporal.');
L.push(`UPDATE ${T} SET dominio = 'Gymnastic' WHERE exercise_id IN (22, 62, 98);`);
L.push('');
L.push("-- 54 Push Jerk: 'Dip-drive-split' describe el Split Jerk, no el Push Jerk.");
L.push(`UPDATE ${T} SET notas = 'Dip-drive-press, pies en paralelo, lockout overhead' WHERE exercise_id = 54;`);
L.push('');
L.push("-- 117 Carrera (5K): 'Sub-20 min 5K, endurance élite' es incorrecto; sub-20");
L.push('-- en 5K es nivel avanzado amateur, no élite.');
L.push(`UPDATE ${T} SET notas = 'Sub-20 min 5K: nivel avanzado amateur' WHERE exercise_id = 117;`);
L.push('');
L.push("-- 7 Abdominales: equipamiento 'Ninguno' → el estándar CrossFit usa AbMat.");
L.push(`UPDATE ${T} SET equipamiento = 'AbMat (opcional)' WHERE exercise_id = 7;`);
L.push('');
L.push('-- 38 Pistol: NO se toca. Verificado en el JSON: id 78 (Pistol con peso) ya es');
L.push("-- 'Avanzado'; subir 38 a Avanzado rompería la escala 38(Intermedio) < 78(Avanzado).");
L.push('');
L.push('-- Fin del parche.');

const out = path.join(__dirname, '04_crossfit.sql');
fs.writeFileSync(out, L.join('\n') + '\n', 'utf8');
console.log('OK →', out);
console.log('strength=1:', STRENGTH.length, '| sprint:', SPRINT.length, 'medio:', MEDIO.length, 'largo:', LARGO.length, 'variable:', VARIABLE.length, '| avoid:', Object.keys(AVOID).length, '| tag-values:', byTag.size);
