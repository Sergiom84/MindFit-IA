/**
 * QA de humo del motor compartido de gimnasio (GymRoutineService).
 * Genera N planes por (metodología × usuario) y verifica de forma independiente:
 *  - CERO movimientos contraindicados por lesión (re-aplica el filtro sobre el plan).
 *  - frecuencia_semanal y duracion_total_semanas correctas por nivel.
 *  - nº de ejercicios por sesión esperado.
 *  - Casa: sólo material permitido para el equipmentLevel.
 *  - Heavy Duty: overrides (series 1-2, RIR 0, descanso 180).
 * No mergea nada; sólo lee/valida. Deja drafts que se limpian al final.
 */
import { pool } from '../db.js';
import { generateGymRoutine } from '../services/routineGeneration/methodologies/GymRoutineService.js';
import { getUserFullProfile } from '../services/routineGeneration/database/userRepository.js';
import { extractInjuryText, activeInjuryRules, isContraindicated } from '../services/routineGeneration/injuryContraindications.js';
import { materialsForEquipmentLevel } from '../services/singleDay/casaEquipment.js';

const RUNS = Number(process.env.QA_RUNS || 6);

// Usuarios de prueba
const USERS = {
  carlos: { id: 911, level: 'principiante' },   // sin lesión
  elena:  { id: 912, level: 'intermedio' },     // muñeca
  diego:  { id: 913, level: 'avanzado' }        // codo
};

// Tablas de expectativas (derivadas de GymRoutineService METHOD_CONFIGS/LEVELS)
const GYM_LEVELS = { principiante: [3, 8], intermedio: [4, 10], avanzado: [5, 12] };
const HD_LEVELS  = { principiante: [2, 8], intermedio: [3, 10], avanzado: [3, 12] };

// nº de ejercicios esperado por sesión (todas las plantillas suman 4, salvo HD=3)
const EX_PER_SESSION = { 'heavy-duty': 3, default: 4 };

// (metodología, disciplina para consultar equipamiento en app.ejercicios)
const METHODS = [
  { key: 'gimnasio',    disciplina: 'hipertrofia', levels: GYM_LEVELS },
  { key: 'casa',        disciplina: 'casa',        levels: GYM_LEVELS, equipmentLevel: 'minimo' },
  { key: 'heavy-duty',  disciplina: 'heavy_duty',  levels: HD_LEVELS },
  { key: 'powerlifting',disciplina: 'powerlifting',levels: GYM_LEVELS },
  { key: 'halterofilia',disciplina: 'halterofilia',levels: GYM_LEVELS }
];

const results = [];
let hardFail = false;

function collectExercises(plan) {
  const out = [];
  for (const sem of plan.semanas || []) {
    for (const ses of sem.sesiones || []) {
      for (const ex of ses.ejercicios || []) out.push({ ...ex, _semana: sem.numero });
    }
  }
  return out;
}

async function equipamientoFor(disciplina, exerciseIds) {
  if (exerciseIds.length === 0) return {};
  const { rows } = await pool.query(
    `SELECT source_exercise_id AS id, array_to_string(equipamiento, '||') AS eq
       FROM app.ejercicios WHERE disciplina = $1 AND source_exercise_id = ANY($2::text[])`,
    [disciplina, exerciseIds.map(String)]
  );
  const map = {};
  for (const r of rows) map[r.id] = (r.eq || '').split('||').filter(Boolean);
  return map;
}

async function runOne(method, userKey) {
  const user = USERS[userKey];
  const profile = await getUserFullProfile(user.id);
  const injuryText = extractInjuryText(profile);
  const rules = activeInjuryRules(injuryText);

  const [expFreq, expWeeks] = method.levels[user.level];
  const expEx = EX_PER_SESSION[method.key] || EX_PER_SESSION.default;

  const req = { methodology: method.key, selectedLevel: user.level };
  if (method.equipmentLevel) req.equipmentLevel = method.equipmentLevel;

  const runFindings = [];
  for (let i = 0; i < RUNS; i++) {
    const res = await generateGymRoutine(user.id, req);
    const plan = res.plan || res.data?.plan || res;
    const exercises = collectExercises(plan);

    // 1) CERO contraindicados
    const contra = exercises.filter((ex) => isContraindicated(ex, rules)).map((e) => e.nombre);

    // 2) frecuencia / duración
    const freqOk = Number(plan.frecuencia_semanal) === expFreq;
    const weeksOk = Number(plan.duracion_total_semanas) === expWeeks;

    // 3) sesiones por semana + ejercicios por sesión (mirando la semana 1)
    const sem1 = (plan.semanas || [])[0];
    const sesN = sem1?.sesiones?.length || 0;
    const exCounts = (sem1?.sesiones || []).map((s) => s.ejercicios?.length || 0);
    const exOk = exCounts.every((c) => c === expEx);
    const sesOk = sesN === expFreq;

    // 4) Casa: material permitido
    let equipBad = [];
    if (method.equipmentLevel) {
      const allowed = new Set(materialsForEquipmentLevel(method.equipmentLevel));
      const ids = [...new Set(exercises.map((e) => e.exercise_id).filter(Boolean))];
      const eqMap = await equipamientoFor(method.disciplina, ids);
      for (const ex of exercises) {
        const mats = eqMap[ex.exercise_id] || [];
        const bad = mats.filter((m) => !allowed.has(m));
        if (bad.length) equipBad.push(`${ex.nombre} [${bad.join(',')}]`);
      }
      equipBad = [...new Set(equipBad)];
    }

    // 5) Heavy Duty overrides
    let hdBad = [];
    if (method.key === 'heavy-duty') {
      for (const ex of exercises) {
        if (String(ex.series) !== '1-2') hdBad.push(`series=${ex.series}`);
        if (ex.rir_target !== 0) hdBad.push(`rir=${ex.rir_target}`);
        if (Number(ex.descanso_seg) !== 180) hdBad.push(`descanso=${ex.descanso_seg}`);
      }
      hdBad = [...new Set(hdBad)];
    }

    const ok = contra.length === 0 && freqOk && weeksOk && exOk && sesOk && equipBad.length === 0 && hdBad.length === 0;
    if (!ok) hardFail = true;
    runFindings.push({ i, contra, freqOk, weeksOk, sesOk, exCounts, equipBad, hdBad, restr: plan.restricciones_lesion?.zonas || [] });
  }

  const anyContra = runFindings.some((r) => r.contra.length);
  const anyStruct = runFindings.some((r) => !r.freqOk || !r.weeksOk || !r.sesOk || r.exCounts.some((c) => c !== expEx));
  const anyEquip = runFindings.some((r) => r.equipBad.length);
  const anyHd = runFindings.some((r) => r.hdBad.length);
  const status = (anyContra || anyStruct || anyEquip || anyHd) ? '❌' : '✅';
  const line = `${status} ${method.key.padEnd(13)} ${userKey.padEnd(7)} lvl=${user.level.padEnd(12)} freq=${expFreq}(${runFindings[0].sesOk?'ok':'BAD'}) weeks=${expWeeks}(${runFindings[0].weeksOk?'ok':'BAD'}) ex/ses=${expEx} runs=${RUNS} contra=${anyContra?'FAIL':'0'}${anyEquip?' EQUIP_FAIL':''}${anyHd?' HD_FAIL':''}${anyStruct?' STRUCT_FAIL':''}`;
  results.push(line);
  console.log(line);
  if (anyContra) console.log('    contraindicados:', JSON.stringify(runFindings.filter(r=>r.contra.length).map(r=>r.contra)));
  if (anyEquip) console.log('    equip bad:', JSON.stringify(runFindings.filter(r=>r.equipBad.length).map(r=>r.equipBad)));
  if (anyHd) console.log('    hd bad:', JSON.stringify(runFindings.filter(r=>r.hdBad.length).map(r=>r.hdBad)));
  if (anyStruct) console.log('    struct:', JSON.stringify(runFindings.map(r=>({f:r.freqOk,w:r.weeksOk,s:r.sesOk,ex:r.exCounts}))));
}

console.log(`\n=== QA MOTOR GYM · ${RUNS} generaciones por celda ===\n`);
for (const method of METHODS) {
  // Cada metodología con los 3 usuarios (sin lesión + muñeca + codo)
  for (const userKey of ['carlos', 'elena', 'diego']) {
    await runOne(method, userKey);
  }
}

// Limpieza de drafts generados por este QA
const cleanup = await pool.query(
  `UPDATE app.methodology_plans SET status='cancelled'
     WHERE user_id = ANY($1::int[]) AND status='draft'`,
  [[911, 912, 913]]
).catch((e) => ({ rowCount: `err:${e.message}` }));

console.log(`\n=== RESUMEN ===`);
results.forEach((l) => console.log(l));
console.log(`\nDrafts limpiados: ${cleanup.rowCount}`);
console.log(hardFail ? '\n❌ HAY FALLOS' : '\n✅ TODO OK');
await pool.end();
process.exit(hardFail ? 1 : 0);
