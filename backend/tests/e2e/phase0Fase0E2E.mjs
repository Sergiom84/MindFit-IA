/**
 * ============================================================================
 * E2E OBLIGATORIO · Nutrición Fase 0 (AUDITORIA_CORRECTIVA_FASE_0, §6)
 * ============================================================================
 *
 * Prueba el CIRCUITO REAL entrenamiento↔nutrición contra un backend HTTP vivo y
 * una BD Postgres LOCAL AISLADA (nunca producción). Cubre §6 completo:
 *   - Usuario A: registro/perfil → metodología no-Hipertrofia → confirmar plan →
 *     calendario (day_id consistente, sin duplicados) → nutrición legacy vs shadow
 *     (respuesta visible idéntica) → periodization_context + load_contract_status →
 *     start (copia de planned_session_load por day_id) → complete con duración
 *     conocida → outbox pausado (1 evento pending) → doble POST idempotente →
 *     worker reanudado (1 decisión) → segunda pasada sin duplicar → carb timing seguro.
 *   - Usuario B: aislamiento (no lee plan/perfil/calendario/sesión/eventos de A).
 *   - Casos negativos: nivel inventado (strict) rechazado; degradación lenient con
 *     reason code; falsos positivos de oposiciones → null; fallback histórico por
 *     (plan_id+fecha) unívoco; fallo de emisión del outbox no bloquea el cierre
 *     (SAVEPOINT); fallo temporal del worker → backoff + recuperación;
 *     Hipertrofia V2 completa sin emitir evento (methodology_id no registrado).
 *
 * RE-EJECUTABLE: limpia los datos hijos de los usuarios QA (conservando las filas
 * de usuario para no romper el canario por id) y vuelve a construir todo.
 *
 * ---------------------------------------------------------------------------
 * REQUISITOS DE ENTORNO (arrancar el backend ANTES, contra la BD local):
 *
 *   DATABASE_URL="postgres://postgres:e2e_local_pw@localhost:55433/entrenaconia_e2e" \
 *   PORT=3011 NODE_ENV=development \
 *   NUTRITION_LOAD_PERIODIZATION_MODE=legacy \
 *   NUTRITION_PERIODIZATION_QA_USERS=<ID_DE_USUARIO_A> \  # canario → shadow
 *   BRIDGE_OUTBOX_EMIT_ENABLED=true \                     # emisión ON
 *   BRIDGE_OUTBOX_WORKER_ENABLED=false \                  # worker pausado (lo mueve el spec)
 *   CARB_TIMING_PERSONALIZED_ENABLED=false \
 *   node backend/server.js
 *
 * El id del usuario A se imprime al ejecutar; debe coincidir con
 * NUTRITION_PERIODIZATION_QA_USERS para que A resuelva a `shadow` y C a `legacy`.
 *
 * EJECUCIÓN:
 *   E2E_DATABASE_URL="postgres://postgres:e2e_local_pw@localhost:55433/entrenaconia_e2e" \
 *   QA_BASE="http://localhost:3011" \
 *   node backend/tests/e2e/phase0Fase0E2E.mjs
 * ---------------------------------------------------------------------------
 */

import crypto from 'node:crypto';
import pg from 'pg';
import { processOutboxBatch } from '../../jobs/processBridgeEventOutbox.js';
import { validateTrainingLoad } from '../../services/trainingLoad/trainingLoadContract.js';
import {
  normalizeMethodologyId,
  methodologyEmitsTrainingLoad,
  getMethodologyDescriptor
} from '../../services/routineGeneration/methodologies/methodologyRegistry.js';
import {
  resolveMethodologyLevel,
  normalizeMethodologyLevel
} from '../../services/bridgeEventOutboxService.js';
import {
  SCHEDULE_WITH_LOAD_FALLBACK_QUERY,
  countDateFallbacks
} from '../../services/trainingLoad/sessionLoadBuilder.js';

// ── Config ─────────────────────────────────────────────────────────────────
const BASE = process.env.QA_BASE || 'http://localhost:3011';
const DB_URL = process.env.E2E_DATABASE_URL
  || 'postgres://postgres:e2e_local_pw@localhost:55433/entrenaconia_e2e';
const PASSWORD = 'QaTest1234!';

// ── Guardia anti-producción (nunca tocar prod) ──────────────────────────────
{
  const u = new URL(DB_URL);
  const local = ['localhost', '127.0.0.1', '::1'].includes(u.hostname);
  const looksProd = /supabase\.(co|com)$/.test(u.hostname) || u.hostname.includes('pooler.supabase');
  if (!local || looksProd) {
    console.error(`[ABORTADO] E2E_DATABASE_URL no es local (${u.hostname}). Este E2E solo corre contra la BD local aislada.`);
    process.exit(2);
  }
  if (!/localhost|127\.0\.0\.1/.test(BASE)) {
    console.error(`[ABORTADO] QA_BASE no es local (${BASE}).`);
    process.exit(2);
  }
}

const pool = new pg.Pool({ connectionString: DB_URL, ssl: false, max: 4 });
pool.on('error', () => {});

// ── Utilidades ──────────────────────────────────────────────────────────────
const results = [];
let curSection = '';
function section(name) { curSection = name; console.log(`\n════ ${name} ════`); }
function record(id, ok, detail) {
  const status = ok === 'PARTIAL' ? 'PARTIAL' : (ok ? 'PASS' : 'FAIL');
  results.push({ section: curSection, id, status, detail });
  const mark = status === 'PASS' ? '✅' : status === 'PARTIAL' ? '🟡' : '❌';
  console.log(`  ${mark} [${id}] ${detail}`);
}
function anon(v, prefix = 'x') {
  if (v === null || v === undefined) return String(v);
  return `${prefix}#${crypto.createHash('sha1').update(String(v)).digest('hex').slice(0, 8)}`;
}
async function sql(q, params = []) { return (await pool.query(q, params)).rows; }
async function api(method, path, token, body) {
  const r = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000)
  });
  let j = null;
  try { j = await r.json(); } catch { /* sin cuerpo JSON */ }
  return { status: r.status, j };
}
// Comparación estable independiente del orden de claves (jsonb NO preserva orden de claves).
function stableStringify(v) {
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}';
  }
  return JSON.stringify(v);
}
const deepEqual = (a, b) => stableStringify(a) === stableStringify(b);

// Marca todos los ejercicios de la sesión como completados y cierra con outcome 'auto'
// (para que el estado terminal sea 'completed', no 'skipped').
async function completeSessionFully(token, sessionId) {
  await pool.query(
    `UPDATE app.methodology_exercise_progress
        SET status='completed',
            series_completed=CASE WHEN series_completed > 0 THEN series_completed ELSE 3 END,
            completed_at=NOW()
      WHERE methodology_session_id=$1`, [sessionId]);
  return api('POST', `/api/training-session/complete/methodology/${sessionId}`, token, { outcome: 'auto' });
}

// Inicia una sesión de metodología para (week, day) y devuelve su id.
async function startSession(token, planId, week, day) {
  const st = await api('POST', '/api/training-session/start/methodology', token, {
    methodology_plan_id: planId, week_number: week, day_name: day
  });
  return { sessionId: st.j?.session_id, status: st.status, body: st.j };
}

// Perfiles de registro (idempotente: login si ya existe).
const USERS = {
  A: { email: 'qa.f0.a@e2e.local', apellido: 'Alpha', nivel: 'intermedio', freq: 3, edad: 30, sexo: 'masculino', peso: 78, altura: 178, anos: 3, objetivo: 'ganar_musculo' },
  C: { email: 'qa.f0.c@e2e.local', apellido: 'Charlie', nivel: 'intermedio', freq: 3, edad: 30, sexo: 'masculino', peso: 78, altura: 178, anos: 3, objetivo: 'ganar_musculo' },
  B: { email: 'qa.f0.b@e2e.local', apellido: 'Bravo', nivel: 'avanzado', freq: 5, edad: 42, sexo: 'femenino', peso: 62, altura: 165, anos: 8, objetivo: 'perder_peso' },
  H: { email: 'qa.f0.h@e2e.local', apellido: 'Hotel', nivel: 'principiante', freq: 3, edad: 25, sexo: 'masculino', peso: 80, altura: 180, anos: 1, objetivo: 'ganar_musculo' }
};

async function loginOrRegister(u) {
  const login = await api('POST', '/api/auth/login', null, { email: u.email, password: PASSWORD });
  if (login.j?.token) return { token: login.j.token, id: login.j.user?.id };
  const reg = await api('POST', '/api/auth/register', null, {
    nombre: 'QA', apellido: u.apellido, email: u.email, password: PASSWORD, acceptTerms: true,
    nivelEntrenamiento: u.nivel, frecuenciaSemanal: u.freq, edad: u.edad, sexo: u.sexo,
    peso: u.peso, altura: u.altura, anosEntrenando: u.anos, nivelActividad: 'moderado',
    limitacionesFisicas: '', objetivoPrincipal: u.objetivo, enfoqueEntrenamiento: 'mixto'
  });
  if (!reg.j?.token) throw new Error(`No se pudo crear/loguear ${u.email}: ${reg.status} ${JSON.stringify(reg.j)}`);
  return { token: reg.j.token, id: reg.j.user?.id };
}

// Borra datos hijos del usuario (conserva la fila app.users → id estable para el canario).
async function cleanUserData(userId) {
  const stmts = [
    `DELETE FROM app.bridge_event_outbox WHERE user_id=$1`,
    `DELETE FROM app.bridge_decision_logs WHERE user_id=$1`,
    `DELETE FROM app.nutrition_meal_items mi USING app.nutrition_meals m, app.nutrition_plan_days d, app.nutrition_plans_v2 p
       WHERE mi.meal_id=m.id AND m.plan_day_id=d.id AND d.plan_id=p.id AND p.user_id=$1`,
    `DELETE FROM app.nutrition_meals m USING app.nutrition_plan_days d, app.nutrition_plans_v2 p
       WHERE m.plan_day_id=d.id AND d.plan_id=p.id AND p.user_id=$1`,
    `DELETE FROM app.nutrition_plan_days d USING app.nutrition_plans_v2 p WHERE d.plan_id=p.id AND p.user_id=$1`,
    `DELETE FROM app.nutrition_plans_v2 WHERE user_id=$1`,
    `DELETE FROM app.methodology_exercise_progress WHERE user_id=$1`,
    `DELETE FROM app.methodology_exercise_history_complete WHERE user_id=$1`,
    `DELETE FROM app.methodology_session_feedback WHERE user_id=$1`,
    `DELETE FROM app.methodology_exercise_sessions WHERE user_id=$1`,
    `DELETE FROM app.workout_schedule WHERE user_id=$1`,
    `DELETE FROM app.methodology_plan_days d USING app.methodology_plans p WHERE d.plan_id=p.id AND p.user_id=$1`,
    `DELETE FROM app.plan_start_config c USING app.methodology_plans p WHERE c.methodology_plan_id=p.id AND p.user_id=$1`,
    `DELETE FROM app.methodology_plans WHERE user_id=$1`
  ];
  for (const s of stmts) { try { await pool.query(s, [userId]); } catch (e) { /* tabla ausente en baseline: ignorar */ } }
}

async function createNutritionProfile(u, token) {
  return api('POST', '/api/nutrition-v2/profile', token, {
    sexo: u.sexo, edad: u.edad, altura_cm: u.altura, peso_kg: u.peso,
    objetivo: u.objetivo === 'perder_peso' ? 'perder_peso' : 'ganar_musculo',
    actividad: 'moderado', comidas_dia: 4, training_days: u.freq
  });
}

async function buildTrainingPlan(token, methodology, level) {
  const gen = await api('POST', '/api/methodology/generate', token, {
    mode: 'manual', methodology, selectedLevel: level, nivel: level,
    goals: '', selectedMuscleGroups: [], source: 'manual_selection', version: '5.0'
  });
  const planId = gen.j?.methodology_plan_id || gen.j?.planId || gen.j?.plan?.methodology_plan_id;
  if (!planId) throw new Error(`generate(${methodology}) sin planId: ${gen.status} ${JSON.stringify(gen.j).slice(0, 200)}`);
  const conf = await api('POST', '/api/routines/confirm-plan', token, { methodology_plan_id: planId });
  return { planId, confirmStatus: conf.status, genStatus: gen.status };
}

// ════════════════════════════════════════════════════════════════════════════
async function main() {
  console.log(`E2E Fase 0 · BASE=${BASE} · DB=${new URL(DB_URL).host}`);

  // ── SETUP ─────────────────────────────────────────────────────────────────
  section('SETUP · usuarios y limpieza');
  const acct = {};
  for (const k of Object.keys(USERS)) acct[k] = await loginOrRegister(USERS[k]);
  for (const k of Object.keys(USERS)) await cleanUserData(acct[k].id);
  console.log(`  usuarios: A=${acct.A.id} (canario→shadow) C=${acct.C.id} B=${acct.B.id} H=${acct.H.id}`);
  console.log(`  ⚠️ NUTRITION_PERIODIZATION_QA_USERS del backend DEBE incluir ${acct.A.id} para el escenario shadow.`);
  await createNutritionProfile(USERS.A, acct.A.token);
  await createNutritionProfile(USERS.C, acct.C.token);
  await createNutritionProfile(USERS.B, acct.B.token);

  // ── §6 A.3-A.6 · Metodología + calendario ──────────────────────────────────
  section('USUARIO A · metodología, calendario, day_id');
  const planA = await buildTrainingPlan(acct.A.token, 'calistenia', 'intermedio');
  record('A-plan', planA.confirmStatus === 200, `generate=${planA.genStatus} confirm=${planA.confirmStatus} plan=${anon(planA.planId, 'plan')}`);

  const cal = await api('GET', `/api/routines/calendar-schedule/${planA.planId}`, acct.A.token);
  const semanas = cal.j?.plan?.semanas || [];
  const sessionsCal = semanas.flatMap(w => (w.sesiones || []).map(s => ({
    week: w.semana || w.numero, dia: s.dia, fecha: String(s.fecha).slice(0, 10)
  }))).filter(s => s.fecha && s.fecha !== 'undefined');
  record('A-cal', sessionsCal.length > 0, `${sessionsCal.length} sesiones en calendario (semanas=${semanas.length})`);

  // day_id no nulo + coincidencia con methodology_plan_days + sin duplicados
  const wsRows = await sql(
    `SELECT id, day_id, scheduled_date FROM app.workout_schedule WHERE methodology_plan_id=$1 AND user_id=$2`,
    [planA.planId, acct.A.id]);
  const wsNullDayId = wsRows.filter(r => r.day_id === null).length;
  record('A-dayid-nonnull', wsRows.length > 0 && wsNullDayId === 0,
    `workout_schedule filas=${wsRows.length}, con day_id=NULL=${wsNullDayId} (COR-F0-04: todo calendario nuevo tiene day_id)`);

  const mismatch = await sql(
    `SELECT ws.day_id FROM app.workout_schedule ws
       WHERE ws.methodology_plan_id=$1 AND ws.user_id=$2 AND ws.day_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM app.methodology_plan_days mpd
                          WHERE mpd.plan_id=ws.methodology_plan_id AND mpd.day_id=ws.day_id)`,
    [planA.planId, acct.A.id]);
  record('A-dayid-match', mismatch.length === 0,
    `workout_schedule.day_id sin correspondencia en methodology_plan_days = ${mismatch.length} (esperado 0)`);

  const dups = await sql(
    `SELECT scheduled_date, count(*) c FROM app.workout_schedule
       WHERE methodology_plan_id=$1 AND user_id=$2 GROUP BY scheduled_date HAVING count(*)>1`,
    [planA.planId, acct.A.id]);
  record('A-nodups', dups.length === 0, `fechas duplicadas en workout_schedule = ${dups.length} (esperado 0)`);

  // ── §6 A.7-A.9 · Nutrición legacy (C) vs shadow (A) ─────────────────────────
  section('USUARIO A/C · nutrición shadow vs legacy + periodization_context');
  // C = baseline legacy (misma metodología+perfil).
  const planC = await buildTrainingPlan(acct.C.token, 'calistenia', 'intermedio');
  record('C-plan', planC.confirmStatus === 200, `baseline legacy plan=${anon(planC.planId, 'plan')} confirm=${planC.confirmStatus}`);

  const genNutA = await api('POST', '/api/nutrition-v2/generate-plan', acct.A.token, { duracion_dias: 7, training_type: 'general' });
  const genNutC = await api('POST', '/api/nutrition-v2/generate-plan', acct.C.token, { duracion_dias: 7, training_type: 'general' });
  record('AC-nut-gen', genNutA.status === 200 && genNutC.status === 200,
    `generate-plan A=${genNutA.status} C=${genNutC.status} (planA=${anon(genNutA.j?.plan_id, 'nplan')})`);

  const apA = await api('GET', '/api/nutrition-v2/active-plan', acct.A.token);
  const apC = await api('GET', '/api/nutrition-v2/active-plan', acct.C.token);
  const visible = (ap) => (ap.j?.plan?.days || ap.j?.days || (ap.j?.plan?.dias) || []).map(d => ({
    day_index: d.day_index, tipo_dia: d.tipo_dia, kcal: d.kcal, macros: d.macros
  }));
  const visA = visible(apA), visC = visible(apC);
  const visibleEqual = visA.length > 0 && deepEqual(visA, visC);
  record('AC-visible-equal', visibleEqual,
    `respuesta VISIBLE shadow(A) == legacy(C): ${visibleEqual} (A dias=${visA.length}, C dias=${visC.length})`);

  // periodization_context: A (shadow) persiste con load_contract_status; C (legacy) NULL.
  const pcA = await sql(
    `SELECT periodization_context FROM app.nutrition_plan_days d
       JOIN app.nutrition_plans_v2 p ON d.plan_id=p.id
      WHERE p.user_id=$1 AND p.tipo='activo' ORDER BY d.day_index`, [acct.A.id]);
  const pcC = await sql(
    `SELECT periodization_context FROM app.nutrition_plan_days d
       JOIN app.nutrition_plans_v2 p ON d.plan_id=p.id
      WHERE p.user_id=$1 AND p.tipo='activo' ORDER BY d.day_index`, [acct.C.id]);
  const aAllHaveCtx = pcA.length > 0 && pcA.every(r => r.periodization_context);
  const cAllNull = pcC.length > 0 && pcC.every(r => r.periodization_context === null);
  record('A-perctx-persist', aAllHaveCtx, `shadow(A): ${pcA.filter(r => r.periodization_context).length}/${pcA.length} días con periodization_context`);
  record('C-perctx-null', cAllNull, `legacy(C): días con periodization_context = ${pcC.filter(r => r.periodization_context).length} (esperado 0)`);

  const VALID_STATUSES = new Set(['valid', 'degraded', 'boolean_fallback', 'no_load']);
  const ctxSample = pcA.find(r => r.periodization_context)?.periodization_context || null;
  const statusOk = ctxSample && VALID_STATUSES.has(ctxSample.load_contract_status);
  const explained = ctxSample && ctxSample.mode === 'shadow' && Array.isArray(ctxSample.reason_codes) && ctxSample.ruleset;
  record('A-contract-status', !!statusOk,
    `load_contract_status='${ctxSample?.load_contract_status}' ∈ {valid,degraded,boolean_fallback,no_load}=${!!statusOk}`);
  record('A-ctx-explained', !!explained,
    `contexto explicado: mode='${ctxSample?.mode}', source='${ctxSample?.source}', authoritative=${ctxSample?.authoritative}, reason_codes=${JSON.stringify(ctxSample?.reason_codes)}`);
  record('A-shadow-not-authoritative', ctxSample ? ctxSample.authoritative === false : false,
    `shadow NO autoritativo (authoritative=${ctxSample?.authoritative}); calistenia emits_load=${methodologyEmitsTrainingLoad('calistenia')}`);

  // Días de entrenamiento del plan (orden por fecha). El [0] es la sesión de
  // calibración MindFeed (precreada, methodology_type NULL); se reserva para un
  // chequeo informativo. Las sesiones reales del circuito usan [1..4].
  const trainDays = await sql(
    `SELECT day_id, week_number, day_name, date_local FROM app.methodology_plan_days
       WHERE plan_id=$1 AND is_rest=false ORDER BY date_local ASC`, [planA.planId]);
  const dayMain = trainDays[1], daySavepoint = trainDays[2], dayWorker = trainDays[3], dayLevel = trainDays[4];

  // Observación (calibración MindFeed): el primer día precrea una sesión sin
  // methodology_type → su cierre NO emite evento (methodology_id null). Se documenta.
  const calibRow = await sql(
    `SELECT id, methodology_type FROM app.methodology_exercise_sessions
       WHERE user_id=$1 AND methodology_plan_id=$2 AND day_id=$3 LIMIT 1`, [acct.A.id, planA.planId, trainDays[0]?.day_id]);
  if (calibRow.length) {
    record('A-calib-note', 'PARTIAL',
      `sesión de calibración día1 con methodology_type='${calibRow[0].methodology_type ?? 'NULL'}' → su cierre no emitiría evento (observación, no bloqueante)`);
  }

  // ── §6 A.10 · Copia exacta de planned_session_load por day_id ────────────────
  section('USUARIO A · start: copia de planned_session_load por day_id');
  const INJECTED_LOAD = {
    contract_version: 'training-load/v1', methodology_id: 'calistenia', methodology_level: 'intermedio',
    session_type: 'strength', status: 'planned', day_type: 'D1', load_tier: 'moderate',
    duration: { planned_min: 45 }, provenance: { source: 'e2e_injected', confidence: 'high' }
  };
  let mainSessionId = null;
  if (dayMain) {
    // Inyectar carga planificada en la metadata del día canónico, luego iniciar.
    await pool.query(
      `UPDATE app.methodology_plan_days SET metadata = COALESCE(metadata,'{}'::jsonb) || jsonb_build_object('session_load',$3::jsonb)
         WHERE plan_id=$1 AND day_id=$2`, [planA.planId, dayMain.day_id, JSON.stringify(INJECTED_LOAD)]);
    const st = await startSession(acct.A.token, planA.planId, dayMain.week_number, dayMain.day_name);
    mainSessionId = st.sessionId;
    if (mainSessionId) {
      const smeta = (await sql(`SELECT session_metadata, day_id, methodology_type FROM app.methodology_exercise_sessions WHERE id=$1`, [mainSessionId]))[0];
      const copied = smeta?.session_metadata?.planned_session_load || null;
      const plannedCopyOk = copied && deepEqual(copied, INJECTED_LOAD);
      record('A-planned-copy', !!plannedCopyOk,
        `planned_session_load copiado exacto (indep. orden de claves)=${!!plannedCopyOk}; session.day_id=${smeta?.day_id ?? 'NULL'} (canónico=${dayMain.day_id}), type='${smeta?.methodology_type}'`);
    } else {
      record('A-planned-copy', false, `start no devolvió session_id: ${st.status} ${JSON.stringify(st.body).slice(0, 160)}`);
    }
  } else {
    record('A-planned-copy', false, 'no hay día de entrenamiento [1] disponible');
  }

  // ── §6 A.11-A.13 · Completar con duración conocida + outbox pausado ──────────
  section('USUARIO A · complete duración 91min + outbox pausado + idempotencia');
  if (mainSessionId) {
    // started_at = hace 91 min → el UPDATE de cierre recalcula NOW()-started_at.
    await pool.query(`UPDATE app.methodology_exercise_sessions SET started_at = NOW() - INTERVAL '91 minutes' WHERE id=$1`, [mainSessionId]);
    const comp1 = await completeSessionFully(acct.A.token, mainSessionId);
    const sesRow = (await sql(`SELECT session_status, total_duration_seconds FROM app.methodology_exercise_sessions WHERE id=$1`, [mainSessionId]))[0];
    const durMin = Math.round((sesRow?.total_duration_seconds || 0) / 60);
    record('A-complete', comp1.status === 200 && /complet/i.test(sesRow?.session_status || ''),
      `complete=${comp1.status}, session_status='${sesRow?.session_status}', total_duration≈${durMin}min`);
    record('A-duration', durMin >= 89 && durMin <= 93, `duración real calculada = ${durMin}min (esperado ≈91, no el 0 inicial)`);

    // Outbox pausado: exactamente 1 evento pending para A, payload correcto.
    const evs = await sql(`SELECT id, status, event_key, payload FROM app.bridge_event_outbox WHERE user_id=$1`, [acct.A.id]);
    const pending = evs.filter(e => e.status === 'pending');
    record('A-one-pending', evs.length === 1 && pending.length === 1,
      `eventos outbox de A = ${evs.length} (pending=${pending.length}); esperado 1 pending con worker pausado`);
    const pl = evs[0]?.payload || {};
    const durEvt = pl?.actual_session_load?.duration?.actual_min;
    record('A-evt-payload',
      pl.methodology_id === 'calistenia' && pl.methodology_level === 'intermedio' && durEvt >= 89 && durEvt <= 93,
      `payload: methodology_id='${pl.methodology_id}', level='${pl.methodology_level}', actual_min=${durEvt}, event_key=${anon(evs[0]?.event_key, 'evk')}`);

    // Doble POST de cierre → sigue 1 evento (event_key UNIQUE, ON CONFLICT DO NOTHING).
    const comp2 = await completeSessionFully(acct.A.token, mainSessionId);
    const evs2 = await sql(`SELECT id FROM app.bridge_event_outbox WHERE user_id=$1`, [acct.A.id]);
    record('A-double-post-idem', comp2.status === 200 && evs2.length === 1,
      `2º POST cierre=${comp2.status}; eventos outbox de A = ${evs2.length} (esperado sigue 1)`);

    // ── A.14-A.15 · Worker reanudado → 1 decisión; 2ª pasada no duplica ─────────
    section('USUARIO A · worker reanudado (1 decisión) + 2ª pasada sin duplicar');
    const pass1 = await processOutboxBatch({ poolRef: pool, workerId: 'e2e-worker-1' });
    const evAfter = (await sql(`SELECT status FROM app.bridge_event_outbox WHERE user_id=$1`, [acct.A.id]))[0];
    const dec1 = await sql(`SELECT id, source_event_id, decision_type FROM app.bridge_decision_logs WHERE user_id=$1`, [acct.A.id]);
    record('A-worker-drain', evAfter?.status === 'completed' && dec1.length === 1,
      `pasada1=${JSON.stringify(pass1)}; evento→'${evAfter?.status}', decisiones=${dec1.length} (source_event_id=${anon(dec1[0]?.source_event_id, 'evk')})`);
    const pass2 = await processOutboxBatch({ poolRef: pool, workerId: 'e2e-worker-2' });
    const dec2 = await sql(`SELECT count(*)::int c FROM app.bridge_decision_logs WHERE user_id=$1`, [acct.A.id]);
    record('A-worker-no-dup', dec2[0].c === 1 && pass2.completed === 0,
      `pasada2=${JSON.stringify(pass2)}; decisiones totales=${dec2[0].c} (esperado sigue 1)`);
  } else {
    record('A-complete', false, 'sin sesión principal; se omite el bloque de cierre/outbox/worker');
  }

  // ── §6 A.16 · Carb timing seguro (flag off) ────────────────────────────────
  section('USUARIO A · carb timing seguro (sin gramos/countdown)');
  const carb = await api('POST', '/api/carb-timing/pre-workout', acct.A.token, { methodology: 'calistenia' });
  const carbStr = JSON.stringify(carb.j || {});
  const carbSafe = carb.status === 200 && carb.j?.personalized === false
    && !/ventana anab|come ahora|countdown|cuenta atr/i.test(carbStr);
  record('A-carb-safe', carbSafe,
    `pre-workout=${carb.status}, personalized=${carb.j?.personalized}, mode='${carb.j?.mode}', sin countdown/gramos=${carbSafe}`);

  // ── §6 B · Aislamiento entre usuarios ───────────────────────────────────────
  section('USUARIO B · aislamiento (no lee datos de A)');
  const bReadCal = await api('GET', `/api/routines/calendar-schedule/${planA.planId}`, acct.B.token);
  const bCalLeak = bReadCal.status === 200 && ((bReadCal.j?.plan?.semanas || []).some(w => (w.sesiones || []).length > 0));
  record('B-cal-isolation', !bCalLeak, `B lee calendario de A: status=${bReadCal.status}, fuga=${bCalLeak} (esperado 403/404 o vacío)`);

  const bConfirmA = await api('POST', '/api/routines/confirm-plan', acct.B.token, { methodology_plan_id: planA.planId });
  record('B-plan-isolation', bConfirmA.status === 404 || bConfirmA.status === 403,
    `B confirma plan de A: status=${bConfirmA.status} (esperado 404/403)`);

  if (mainSessionId) {
    const bComplete = await api('POST', `/api/training-session/complete/methodology/${mainSessionId}`, acct.B.token, {});
    record('B-session-isolation', bComplete.status === 404 || bComplete.status === 403,
      `B completa sesión de A: status=${bComplete.status} (esperado 404/403)`);
  }
  // Eventos/decisiones: active-plan y admin son por-token; B no puede referenciar los de A.
  const bActive = await api('GET', '/api/nutrition-v2/active-plan', acct.B.token);
  const bSeesOwnOnly = bActive.status === 200 ? (bActive.j?.plan?.user_id === undefined || bActive.j?.plan?.user_id === acct.B.id) : true;
  record('B-nut-isolation', bSeesOwnOnly, `active-plan de B no expone datos de A (status=${bActive.status})`);

  // ── §6 Casos negativos ──────────────────────────────────────────────────────
  section('CASOS NEGATIVOS · contrato/nivel/aliases');
  const strictBad = validateTrainingLoad({ ...INJECTED_LOAD, methodology_id: 'powerlifting', methodology_level: 'inventado', day_type: 'D1', load_tier: 'moderate' }, { mode: 'strict' });
  record('N-strict-invalid', strictBad.valid === false, `powerlifting/inventado (strict) → valid=${strictBad.valid} (esperado false)`);

  const eliteOk = validateTrainingLoad({ ...INJECTED_LOAD, methodology_id: 'crossfit', methodology_level: 'elite' }, { mode: 'strict' });
  record('N-elite-ok', eliteOk.valid === true, `crossfit/elite (strict) → valid=${eliteOk.valid} (declarado en registro=${getMethodologyDescriptor('crossfit')?.levels.includes('elite')})`);

  const eliteBadPL = validateTrainingLoad({ ...INJECTED_LOAD, methodology_id: 'powerlifting', methodology_level: 'elite' }, { mode: 'strict' });
  record('N-elite-scoped', eliteBadPL.valid === false, `powerlifting/elite (strict) → valid=${eliteBadPL.valid} (elite no soportado en powerlifting)`);

  const lenientDeg = validateTrainingLoad({ ...INJECTED_LOAD, methodology_id: 'powerlifting', methodology_level: 'inventado' }, { mode: 'lenient' });
  record('N-lenient-degrade', lenientDeg.valid === true && lenientDeg.degraded === true && lenientDeg.load?.day_type === 'D1' && (lenientDeg.errors || []).length > 0,
    `lenient → valid=${lenientDeg.valid}, degraded=${lenientDeg.degraded}, day_type='${lenientDeg.load?.day_type}', reason_codes=${(lenientDeg.errors || []).length}`);

  const falsePos = ['entrenamiento local', 'programa nacional', 'guardia activa'];
  const fpNull = falsePos.every(v => normalizeMethodologyId(v) === null);
  record('N-alias-falsepos', fpNull, `falsos positivos → null: ${falsePos.map(v => `'${v}'→${normalizeMethodologyId(v)}`).join(', ')}`);
  const opps = { 'Policía Local': 'policia-local', 'Policía Nacional': 'policia-nacional', 'Guardia Civil': 'guardia-civil', 'Bomberos': 'bomberos' };
  const oppsOk = Object.entries(opps).every(([k, v]) => normalizeMethodologyId(k) === v);
  record('N-opps-normalize', oppsOk, `oposiciones oficiales normalizan: ${Object.keys(opps).map(k => `'${k}'→${normalizeMethodologyId(k)}`).join(', ')}`);

  // Normalización de niveles históricos
  const lvlBasico = normalizeMethodologyLevel('Básico');
  const lvlInter = resolveMethodologyLevel({ sessionLevel: 'Intermedio' });
  const lvlInvent = normalizeMethodologyLevel('inventado');
  record('N-level-normalize', lvlBasico === 'principiante' && lvlInter === 'intermedio' && lvlInvent === null,
    `'Básico'→${lvlBasico}, 'Intermedio'→${lvlInter}, 'inventado'→${lvlInvent}`);

  // ── Fallback histórico por (plan_id + fecha) unívoco ────────────────────────
  section('CASO NEGATIVO · fallback histórico por (plan_id+fecha)');
  if (dayMain) {
    // La metadata ya tiene session_load inyectada en dayMain. NULL el day_id del ws de esa fecha.
    await pool.query(`UPDATE app.workout_schedule SET day_id=NULL WHERE methodology_plan_id=$1 AND scheduled_date=$2`, [planA.planId, dayMain.date_local]);
    const enriched = await sql(SCHEDULE_WITH_LOAD_FALLBACK_QUERY, [planA.planId, acct.A.id, dayMain.date_local, dayMain.date_local]);
    const row = enriched.find(r => String(r.scheduled_date).slice(0, 10) === String(dayMain.date_local).slice(0, 10));
    const fallbacks = countDateFallbacks(enriched);
    const recovered = row && row.session_load && row.session_load.methodology_id === 'calistenia';
    record('N-hist-fallback', !!recovered && fallbacks >= 1,
      `día sin day_id recupera carga por (plan_id+fecha): recovered=${!!recovered}, fallbackByDateCount=${fallbacks}`);
    // Restaurar day_id
    await pool.query(`UPDATE app.workout_schedule ws SET day_id=$3 WHERE methodology_plan_id=$1 AND scheduled_date=$2`, [planA.planId, dayMain.date_local, dayMain.day_id]);
  } else {
    record('N-hist-fallback', 'PARTIAL', 'sin día de entrenamiento para probar el fallback');
  }

  // ── Fallo de emisión del outbox NO bloquea el cierre (SAVEPOINT) ─────────────
  section('CASO NEGATIVO · fallo de emisión no bloquea el cierre (SAVEPOINT)');
  {
    // Trigger temporal que hace fallar TODO INSERT en el outbox.
    await pool.query(`CREATE OR REPLACE FUNCTION app.e2e_fail_outbox() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'e2e_forced_outbox_failure'; END; $$ LANGUAGE plpgsql;`);
    await pool.query(`DROP TRIGGER IF EXISTS e2e_fail_outbox_trg ON app.bridge_event_outbox;`);
    await pool.query(`CREATE TRIGGER e2e_fail_outbox_trg BEFORE INSERT ON app.bridge_event_outbox FOR EACH ROW EXECUTE FUNCTION app.e2e_fail_outbox();`);
    if (daySavepoint) {
      const st = await startSession(acct.A.token, planA.planId, daySavepoint.week_number, daySavepoint.day_name);
      const sid2 = st.sessionId;
      const evBefore = (await sql(`SELECT count(*)::int c FROM app.bridge_event_outbox WHERE user_id=$1`, [acct.A.id]))[0].c;
      const comp = await completeSessionFully(acct.A.token, sid2);
      const ses = (await sql(`SELECT session_status FROM app.methodology_exercise_sessions WHERE id=$1`, [sid2]))[0];
      const evAfter = (await sql(`SELECT count(*)::int c FROM app.bridge_event_outbox WHERE user_id=$1`, [acct.A.id]))[0].c;
      const blockOk = comp.status === 200 && /complet/i.test(ses?.session_status || '') && evAfter === evBefore;
      record('N-outbox-fail-nonblock', blockOk,
        `emisión falla (trigger); cierre=${comp.status}, session_status='${ses?.session_status}', eventos ${evBefore}→${evAfter} (sin nuevo evento, sesión completa)`);
    } else {
      record('N-outbox-fail-nonblock', 'PARTIAL', 'sin día de entrenamiento [2] disponible');
    }
    await pool.query(`DROP TRIGGER IF EXISTS e2e_fail_outbox_trg ON app.bridge_event_outbox;`);
    await pool.query(`DROP FUNCTION IF EXISTS app.e2e_fail_outbox();`);
  }

  // ── Fallo temporal del worker → backoff + recuperación ──────────────────────
  section('CASO NEGATIVO · worker fallo temporal → backoff + recuperación');
  {
    if (dayWorker) {
      const st = await startSession(acct.A.token, planA.planId, dayWorker.week_number, dayWorker.day_name);
      await completeSessionFully(acct.A.token, st.sessionId);
      const key = (await sql(`SELECT event_key FROM app.bridge_event_outbox WHERE user_id=$1 AND status='pending' ORDER BY created_at DESC LIMIT 1`, [acct.A.id]))[0]?.event_key;
      const decBefore = (await sql(`SELECT count(*)::int c FROM app.bridge_decision_logs WHERE user_id=$1`, [acct.A.id]))[0].c;
      // Pasada con deps que lanzan → el evento debe quedar 'failed' con available_at futuro y sin decisión nueva.
      const failPass = await processOutboxBatch({ poolRef: pool, workerId: 'e2e-fail', deps: { logBridgeDecision: async () => { throw new Error('e2e_worker_transient'); } } });
      const evFailed = (await sql(`SELECT status, attempts, available_at, available_at > NOW() AS future FROM app.bridge_event_outbox WHERE event_key=$1`, [key]))[0];
      const decMid = (await sql(`SELECT count(*)::int c FROM app.bridge_decision_logs WHERE user_id=$1`, [acct.A.id]))[0].c;
      const backoffOk = evFailed?.status === 'failed' && evFailed?.future === true && decMid === decBefore;
      record('N-worker-backoff', backoffOk,
        `pasada fallida=${JSON.stringify(failPass)}; evento='${evFailed?.status}', available_at futuro=${evFailed?.future}, sin decisión nueva=${decMid === decBefore}`);
      // Simular que el backoff expiró y reprocesar OK.
      await pool.query(`UPDATE app.bridge_event_outbox SET available_at=NOW() WHERE event_key=$1`, [key]);
      const okPass = await processOutboxBatch({ poolRef: pool, workerId: 'e2e-recover' });
      const evOk = (await sql(`SELECT status FROM app.bridge_event_outbox WHERE event_key=$1`, [key]))[0];
      const decAfter = (await sql(`SELECT count(*)::int c FROM app.bridge_decision_logs WHERE user_id=$1`, [acct.A.id]))[0].c;
      record('N-worker-recover', evOk?.status === 'completed' && decAfter === decBefore + 1,
        `recuperación=${JSON.stringify(okPass)}; evento='${evOk?.status}', decisiones ${decBefore}→${decAfter} (+1 esperado)`);
    } else {
      record('N-worker-backoff', 'PARTIAL', 'sin día de entrenamiento [3] disponible');
    }
  }

  // ── Nivel histórico 'Básico' a nivel de EVENTO ──────────────────────────────
  section('CASO · nivel histórico Básico→principiante en el evento de cierre');
  {
    if (dayLevel) {
      const st = await startSession(acct.A.token, planA.planId, dayLevel.week_number, dayLevel.day_name);
      const sid4 = st.sessionId;
      // Sin planned load (este día no tiene metadata inyectada) y con methodology_level histórico 'Básico'.
      await pool.query(`UPDATE app.methodology_exercise_sessions SET methodology_level='Básico' WHERE id=$1`, [sid4]);
      await completeSessionFully(acct.A.token, sid4);
      const ev = (await sql(`SELECT payload FROM app.bridge_event_outbox WHERE user_id=$1 AND (payload->>'session_id')=$2 LIMIT 1`, [acct.A.id, String(sid4)]))[0];
      const lvl = ev?.payload?.methodology_level;
      record('A-level-basico', lvl === 'principiante', `sesión nivel 'Básico' → evento methodology_level='${lvl}' (esperado principiante)`);
    } else {
      record('A-level-basico', 'PARTIAL', 'sin día de entrenamiento [4] disponible');
    }
  }

  // ── §6 Hipertrofia V2 · completa sin emitir evento methodology_id=null ───────
  // El generador MindFeed de HV2 depende de una tabla de configuración D1-D5 que la
  // BD local no siembra; por eso se sintetiza directamente una sesión con
  // methodology_type='hipertrofiav2' y se cierra por la MISMA ruta de cierre, que es
  // exactamente lo que exige §6: verificar la GUARDA de emisión (no emitir null).
  section('CASO NEGATIVO · Hipertrofia V2 completa sin evento methodology_id=null');
  {
    record('H-registry-null', normalizeMethodologyId('hipertrofiav2') === null && normalizeMethodologyId('hipertrofia') === null,
      `normalizeMethodologyId: hipertrofiav2→${normalizeMethodologyId('hipertrofiav2')}, hipertrofia→${normalizeMethodologyId('hipertrofia')} (no registradas)`);
    // Sintetizar un plan + sesión HV2 mínimos para el usuario H.
    const planH = (await sql(
      `INSERT INTO app.methodology_plans (user_id, methodology_type, status, plan_data, created_at, updated_at)
       VALUES ($1,'hipertrofiav2','active','{}'::jsonb, NOW(), NOW()) RETURNING id`, [acct.H.id]))[0].id;
    const sidH = (await sql(
      `INSERT INTO app.methodology_exercise_sessions
         (user_id, methodology_plan_id, methodology_type, methodology_level, session_name, week_number, day_name,
          total_exercises, session_status, session_date, started_at, created_at, updated_at)
       VALUES ($1,$2,'hipertrofiav2','intermedio','HV2 E2E',1,'Lun',1,'in_progress',CURRENT_DATE, NOW()-INTERVAL '40 minutes', NOW(), NOW())
       RETURNING id`, [acct.H.id, planH]))[0].id;
    await pool.query(
      `INSERT INTO app.methodology_exercise_progress
         (methodology_session_id, user_id, exercise_order, exercise_name, series_total, repeticiones, series_completed, status)
       VALUES ($1,$2,0,'Press banca','4','8',4,'completed')`, [sidH, acct.H.id]);
    const comp = await api('POST', `/api/training-session/complete/methodology/${sidH}`, acct.H.token, { outcome: 'auto' });
    const ses = (await sql(`SELECT session_status, methodology_type FROM app.methodology_exercise_sessions WHERE id=$1`, [sidH]))[0];
    const evH = (await sql(`SELECT count(*)::int c FROM app.bridge_event_outbox WHERE user_id=$1`, [acct.H.id]))[0].c;
    record('H-no-event', comp.status === 200 && /complet/i.test(ses?.session_status || '') && evH === 0,
      `type='${ses?.methodology_type}', complete=${comp.status}, session='${ses?.session_status}', eventos outbox=${evH} (esperado 0: methodology_id no registrado → no se emite)`);
  }

  // ── Resumen ────────────────────────────────────────────────────────────────
  section('RESUMEN');
  const pass = results.filter(r => r.status === 'PASS').length;
  const fail = results.filter(r => r.status === 'FAIL').length;
  const partial = results.filter(r => r.status === 'PARTIAL').length;
  console.log(`\n  TOTAL: ${results.length}  PASS=${pass}  FAIL=${fail}  PARTIAL=${partial}`);
  if (fail) {
    console.log('  FALLOS:');
    for (const r of results.filter(r => r.status === 'FAIL')) console.log(`    ❌ [${r.id}] ${r.detail}`);
  }
  await pool.end();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error('\n[E2E ERROR FATAL]', e);
  try { await pool.end(); } catch { /* noop */ }
  process.exit(3);
});
