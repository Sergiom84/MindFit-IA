// E2E de PROGRESIÓN RIR en flujo de PLAN multi-semana.
// Registra usuario nuevo → genera plan → completa sesiones logueando RIR por
// serie (save-set) → verifica que la app EXIGE más (reps/peso) tras sesiones
// fáciles y hace DELOAD tras sesiones duras.
// Uso: node 15-e2e-progresion-rir.cjs <methodology> <level> [maxSessions]
const BASE = 'http://localhost:3010';
const [METHODOLOGY, LEVEL, MAXS] = process.argv.slice(2);
if (!METHODOLOGY || !LEVEL) { console.error('Uso: methodology level [maxSessions]'); process.exit(1); }
const MAX_SESSIONS = Number(MAXS) || 8;

const REP_BASED = ['calistenia', 'casa', 'funcional'].some(k => METHODOLOGY.toLowerCase().includes(k));

async function api(method, path, token, body) {
  const r = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  let j = {};
  try { j = await r.json(); } catch {}
  return { status: r.status, j };
}

function parseReps(reps) {
  const m = String(reps || '').match(/^(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

(async () => {
  const suffix = Math.floor(Math.random() * 100000);
  const email = `qa.rir.${METHODOLOGY.toLowerCase()}.${LEVEL.toLowerCase()}.${suffix}@entrenaconia-test.com`;
  const reg = await api('POST', '/api/auth/register', null, {
    nombre: 'QA', apellido: 'Rir', email, password: 'QaTest2026!',
    edad: 30, sexo: 'masculino', peso: 75, altura: 178,
    nivelEntrenamiento: LEVEL.toLowerCase(), anosEntrenando: 2, frecuenciaSemanal: 3,
    nivelActividad: 'moderado', metodologiaPreferida: METHODOLOGY.toLowerCase()
  });
  const token = reg.j.token || (await api('POST', '/api/auth/login', null, { email, password: 'QaTest2026!' })).j.token;
  const userId = reg.j.user?.id || reg.j.userId;
  if (!token) { console.error('REGISTER/LOGIN FAIL', reg.status, JSON.stringify(reg.j).slice(0, 200)); process.exit(1); }
  console.log(`USER OK ${email} (id=${userId})`);

  const gen = await api('POST', '/api/methodology/generate', token, {
    mode: 'manual', methodology: METHODOLOGY, selectedLevel: LEVEL,
    goals: '', selectedMuscleGroups: [], source: 'manual_selection', version: '5.0'
  });
  const planId = gen.j.methodology_plan_id || gen.j.planId;
  if (!planId) { console.error('GEN FAIL', gen.status, JSON.stringify(gen.j).slice(0, 300)); process.exit(1); }
  const conf = await api('POST', '/api/routines/confirm-plan', token, { methodology_plan_id: planId });
  console.log(`PLAN ${planId} confirmado (${conf.status})`);

  const cal = await api('GET', `/api/routines/calendar-schedule/${planId}`, token);
  const DAY_FULL = { Lun: 'Lunes', Mar: 'Martes', Mie: 'Miercoles', 'Mié': 'Miercoles', Jue: 'Jueves', Vie: 'Viernes', Sab: 'Sabado', 'Sáb': 'Sabado', Dom: 'Domingo' };
  const sessions = (cal.j.plan?.semanas || []).flatMap(w => (w.sesiones || []).map(s => ({
    date: String(s.fecha).slice(0, 10), week: w.semana || w.numero, day: DAY_FULL[s.dia] || s.dia
  }))).filter(s => s.date).slice(0, MAX_SESSIONS);
  console.log(`SESIONES a ejercitar: ${sessions.length}`);
  if (sessions.length < 6) { console.error('Plan con pocas sesiones para el test'); process.exit(1); }

  // Guion de esfuerzo: 2 fáciles (→ progress) + 1 fácil (verifica exigencia) +
  // 3 duras (→ deload) + 1 normal (verifica descarga consumida) ...
  // fácil: RIR 3, todo completado. dura: RIR 0.
  const script = ['easy', 'easy', 'easy', 'hard', 'hard', 'hard', 'normal', 'normal'];

  const findings = [];
  const baseline = {}; // nombre → reps base de la primera sesión

  const IS_HEAVY = METHODOLOGY.toLowerCase().includes('heavy');
  const IS_CROSSFIT = METHODOLOGY.toLowerCase().includes('crossfit');

  for (let i = 0; i < sessions.length; i++) {
    const s = sessions[i];
    const effort = script[i] || 'normal';
    // Semántica por metodología:
    // - RIR-based (cali/casa/funcional): easy = RIR 3, hard = RIR 0.
    // - CrossFit (RPE=10-RIR): easy necesita RPE<=6 → RIR 4; hard RPE>=9 → RIR 0.
    // - Heavy Duty (fallo): easy/progress = RIR 0 con todo completado (fallo+objetivo);
    //   hard = NO completar el objetivo (se salta el último ejercicio).
    let rir = effort === 'easy' ? 3 : effort === 'hard' ? 0 : 1;
    if (IS_CROSSFIT) rir = effort === 'easy' ? 4 : effort === 'hard' ? 0 : 2;
    if (IS_HEAVY) rir = effort === 'hard' ? 2 : 0;
    const skipLast = IS_HEAVY && effort === 'hard';

    const start = await api('POST', '/api/routines/sessions/start', token, {
      methodology_plan_id: planId, session_date: s.date, week_number: s.week, day_name: s.day
    });
    const sid = start.j.session_id;
    if (!sid) { console.log(`  [${i}] ${s.date} start FAIL ${start.status} ${String(start.j.error).slice(0, 100)}`); continue; }
    const progMeta = start.j.progression;

    const prog = await api('GET', `/api/routines/sessions/${sid}/progress`, token);
    const exercises = prog.j.exercises || [];

    // Muestra del estado de prescripciones. baseline = reps la PRIMERA vez que
    // se ve cada ejercicio SIN ajuste aplicado (para comparar mismo ejercicio).
    const sample = exercises[0] || {};
    const sampleReps = sample.repeticiones ?? sample.reps_target;
    if (!progMeta?.applied) {
      for (const ex of exercises) {
        if (baseline[ex.exercise_name] == null) baseline[ex.exercise_name] = parseReps(ex.repeticiones ?? ex.reps_target);
      }
    }
    const repComparisons = progMeta?.mode === 'progress'
      ? exercises
          .filter(ex => baseline[ex.exercise_name] != null)
          .map(ex => ({ name: ex.exercise_name, base: baseline[ex.exercise_name], now: parseReps(ex.repeticiones ?? ex.reps_target) }))
      : [];

    console.log(`  [${i}] ${s.date} (${effort}, rir=${rir}) sid=${sid} ` +
      `prog=${progMeta ? `${progMeta.mode} rep+${progMeta.rep_offset} w+${progMeta.weight_pct}%` : '—'} ` +
      `| ej0 "${sample.exercise_name}" reps=${sampleReps} series=${sample.series_total}` +
      (sample.notas && /Progresión|descarga|Descarga/i.test(sample.notas) ? ` | nota="${String(sample.notas).slice(-90)}"` : ''));

    // Loguear series con RIR (save-set) y completar cada ejercicio
    let lastAutoreg = null;
    for (let e = 0; e < exercises.length; e++) {
      const ex = exercises[e];
      const isLast = e === exercises.length - 1;
      if (skipLast && isLast) {
        // Heavy Duty "hard": no alcanzar el objetivo → skip
        await api('PUT', `/api/routines/sessions/${sid}/exercise/${ex.exercise_order}`, token, {
          series_completed: 0, status: 'skipped', time_spent_seconds: 0
        });
        // La sesión no queda 'completed' → forzar cierre con finish
        const fin = await api('POST', `/api/routines/sessions/${sid}/finish`, token);
        if (fin.j.autoreg) lastAutoreg = fin.j.autoreg;
        continue;
      }
      const sets = Number(ex.series_total) || 3;
      const reps = parseReps(ex.repeticiones ?? ex.reps_target) || 10;
      for (let sn = 1; sn <= sets; sn++) {
        await api('POST', '/api/hipertrofiav2/save-set', token, {
          userId, methodologyPlanId: planId, sessionId: sid,
          exercise_id: ex.exercise_id || null, exercise_name: ex.exercise_name,
          set_number: sn, weight: REP_BASED ? 0 : 60, reps, rir
        });
      }
      const put = await api('PUT', `/api/routines/sessions/${sid}/exercise/${ex.exercise_order}`, token, {
        series_completed: sets, status: 'completed', time_spent_seconds: 90
      });
      if (put.j.autoreg) lastAutoreg = put.j.autoreg;
    }

    // Modal de esfuerzo (matiz subjetivo; debe ser idempotente sobre el registro)
    const eff = await api('POST', `/api/routines/sessions/${sid}/effort`, token, { feeling: effort === 'hard' ? 'dificil' : effort === 'easy' ? 'facil' : 'normal' });

    const decision = lastAutoreg?.decision || eff.j.decision;
    console.log(`       → decision=${decision} (source=${lastAutoreg?.source || 'effort'}) avgRir=${lastAutoreg?.avg_rir ?? eff.j.avg_rir} effortRegistered=${eff.j.registered} already=${!!eff.j.alreadyRegistered}`);
    findings.push({ i, effort, decision, progMeta, sampleReps, notas: sample.notas || '', repComparisons });
  }

  // --- Verificaciones ---
  console.log('\n=== VERIFICACIÓN ===');
  let pass = 0, fail = 0;
  const check = (name, cond) => { console.log(`${cond ? '✅' : '❌'} ${name}`); cond ? pass++ : fail++; };

  const decisions = findings.map(f => f.decision);
  // heavy_duty progresa a la primera sesión al fallo; el resto tras 2 fáciles
  check('Tras sesiones fáciles llega decisión progress', decisions.slice(0, 3).includes('progress'));
  const firstProgressDecision = decisions.indexOf('progress');
  const firstProgressApplied = findings.findIndex(f => f.progMeta?.mode === 'progress');
  check('La progresión se APLICA a una sesión posterior (start devuelve meta progress)',
    firstProgressApplied > firstProgressDecision && firstProgressApplied > 0);
  if (REP_BASED && firstProgressApplied > 0) {
    // Comparar MISMO ejercicio: reps ajustadas vs la primera vez que se vio sin
    // ajuste. Los de tiempo ("20 seg") no se bumpean (solo nota), así que basta
    // con que ALGÚN ejercicio comparable haya subido.
    const cmps = findings.flatMap(f => f.repComparisons || []).filter(c => c.base != null && c.now != null);
    const up = cmps.find(c => c.now > c.base);
    check(`Las reps del MISMO ejercicio suben sobre su base (${up ? `${up.name}: ${up.base} → ${up.now}` : `sin subida entre ${cmps.length} pares`})`, !!up);
  } else if (firstProgressApplied > 0) {
    check('Nota de peso objetivo presente en prescripción', /Progresión/.test(findings[firstProgressApplied].notas));
  }
  const deloadIdx = decisions.indexOf('deload');
  check('Tras racha de sesiones duras llega deload', deloadIdx > 2);
  const deloadApplied = findings.findIndex(f => f.progMeta?.mode === 'deload');
  check('La descarga se APLICA en la sesión siguiente', deloadApplied > deloadIdx);
  if (deloadApplied >= 0 && deloadApplied + 1 < findings.length) {
    check('La descarga se consume (siguiente sesión ya no es deload)', findings[deloadApplied + 1].progMeta?.mode !== 'deload');
  }

  console.log(`\nRESULTADO: ${pass} pass / ${fail} fail — plan ${planId} (${METHODOLOGY} ${LEVEL})`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
