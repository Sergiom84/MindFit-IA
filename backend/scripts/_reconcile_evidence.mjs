// PR 2 / DB-001 — Recolector de EVIDENCIA (READ ONLY) para reconciliar el ledger.
// No modifica nada: abre una transacción READ ONLY y hace ROLLBACK al final.
// Compara los objetos que declaran las 15 migraciones desincronizadas contra la BD real.
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

// Constraints esperadas por migración (extraídas de los ficheros .sql).
const EXPECTED = {
  fk_plan_session_not_valid: [
    'fk_adaptation_technique_flags_session_id','fk_calistenia_autoreg_state_methodology_plan_id',
    'fk_carb_timing_logs_session_id','fk_casa_autoreg_state_methodology_plan_id',
    'fk_crossfit_autoreg_state_methodology_plan_id','fk_exercise_history_session_id',
    'fk_funcional_autoreg_state_methodology_plan_id','fk_halterofilia_autoreg_state_methodology_plan_id',
    'fk_heavy_duty_autoreg_state_methodology_plan_id','fk_hypertrophy_blocks_methodology_plan_id',
    'fk_mindfeed_priority_events_methodology_plan_id','fk_mindfeed_transition_events_methodology_plan_id',
    'fk_oposiciones_autoreg_state_methodology_plan_id','fk_plan_progression_offsets_methodology_plan_id',
    'fk_powerlifting_autoreg_state_methodology_plan_id','fk_technique_corrections_methodology_plan_id',
    'fk_technique_corrections_session_id','fk_warmup_sets_tracking_session_id',
  ],
  fk_user_id_not_valid: [
    'fk_autoreg_stall_user_id','fk_calistenia_autoreg_state_user_id','fk_casa_autoreg_state_user_id',
    'fk_crossfit_autoreg_state_user_id','fk_daily_nutrition_log_user_id','fk_exercise_history_user_id',
    'fk_funcional_autoreg_state_user_id','fk_halterofilia_autoreg_state_user_id','fk_heavy_duty_autoreg_state_user_id',
    'fk_historico_ejercicios_user_id','fk_home_combination_exercise_history_user_id','fk_home_exercise_rejections_user_id',
    'fk_hypertrophy_blocks_user_id','fk_hypertrophy_progression_user_id','fk_hypertrophy_set_logs_user_id',
    'fk_manual_methodology_exercise_feedback_user_id','fk_methodology_exercise_feedback_user_id','fk_methodology_plans_user_id',
    'fk_mindfeed_priority_events_user_id','fk_mindfeed_transition_events_user_id','fk_nutrition_plans_user_id',
    'fk_nutrition_plans_v2_user_id','fk_oposiciones_autoreg_state_user_id','fk_plan_progression_offsets_user_id',
    'fk_powerlifting_autoreg_state_user_id','fk_progreso_usuario_user_id','fk_technique_corrections_user_id',
    'fk_user_custom_equipment_user_id','fk_user_equipment_user_id','fk_user_exercise_feedback_user_id',
    'fk_user_home_training_stats_user_id','fk_user_sessions_user_id','fk_workout_schedule_user_id',
  ],
  fk_exercise_id: [
    'fk_exercise_tags_exercise_id','fk_hypertrophy_progression_exercise_id','fk_hypertrophy_set_logs_exercise_id',
    'fk_hypertrophy_weekly_templates_exercise_id','fk_methodology_exercise_progress_exercise_id',
  ],
  fk_exercise_id_empty_tables: [
    'fk_adaptation_technique_flags_exercise_id','fk_warmup_sets_tracking_exercise_id',
  ],
  fk_ambiguous_ids: [
    'fk_manual_meth_ex_feedback_session','fk_meth_ex_feedback_session','fk_menu_gen_logs_meal',
    'fk_menu_gen_logs_day','fk_exercise_history_plan','fk_user_exercise_feedback_plan',
  ],
};

const DROPPED_USER_COLS = ['brazo','alimentos_evitar','años_entrenando','fecha_inicio_objetivo','enfoque','metodologia','meta_grasa'];

async function main() {
  const client = await pool.connect();
  const out = {};
  try {
    await client.query('BEGIN');
    await client.query('SET TRANSACTION READ ONLY');

    // 1) Constraints por migración: existencia + convalidated
    const allNames = Object.values(EXPECTED).flat();
    const { rows: cons } = await client.query(
      `SELECT conname, convalidated FROM pg_constraint
       WHERE connamespace = 'app'::regnamespace AND conname = ANY($1)`, [allNames]);
    const conMap = new Map(cons.map((r) => [r.conname, r.convalidated]));
    out.constraints = {};
    for (const [mig, names] of Object.entries(EXPECTED)) {
      out.constraints[mig] = names.map((n) => ({
        name: n, exists: conMap.has(n), validated: conMap.get(n) ?? null,
      }));
      out.constraints[`${mig}__summary`] = `${names.filter((n) => conMap.has(n)).length}/${names.length} existen; ${names.filter((n) => conMap.get(n) === true).length} validadas`;
    }

    // 2) Columnas de users que DEBEN haber desaparecido (drop dead + live pairs)
    const { rows: cols } = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema='app' AND table_name='users' AND column_name = ANY($1)`, [DROPPED_USER_COLS]);
    const stillPresent = cols.map((r) => r.column_name);
    out.users_dropped_cols = { expected_absent: DROPPED_USER_COLS, still_present: stillPresent, all_dropped: stillPresent.length === 0 };

    // 3) Índice único workout_schedule
    const { rows: idx } = await client.query(
      `SELECT indexname FROM pg_indexes WHERE schemaname='app' AND indexname='uq_workout_schedule_plan_user_date'`);
    out.uq_workout_schedule = { exists: idx.length > 0 };

    // 4) BOLA fix: funciones existen y filtran por user_id
    const { rows: fns } = await client.query(
      `SELECT p.proname, pg_get_functiondef(p.oid) AS def FROM pg_proc p
       WHERE p.pronamespace='app'::regnamespace AND p.proname IN ('activate_deload','detect_automatic_fatigue_flags')`);
    out.bola_functions = fns.map((r) => ({
      name: r.proname,
      filters_user_id: /user_id\s*=\s*p_user_id/i.test(r.def),
    }));

    // 5) SEC-006: ninguna función app con EXECUTE para PUBLIC
    const { rows: pub } = await client.query(
      `SELECT p.proname FROM pg_proc p
       WHERE p.pronamespace='app'::regnamespace
         AND has_function_privilege('public', p.oid, 'EXECUTE')`);
    out.sec006_public_execute = { public_executable_count: pub.length, sample: pub.slice(0, 10).map((r) => r.proname) };

    // 6) COMMENT en app.schema_migrations
    const { rows: cmt } = await client.query(
      `SELECT obj_description('app.schema_migrations'::regclass) AS comment`);
    out.ledger_comment = { has_comment: !!cmt[0]?.comment, comment: cmt[0]?.comment };

    // 7) Rulesets intermedio/avanzado
    const { rows: rs } = await client.query(
      `SELECT scope, is_active FROM app.mindfeed_rulesets
       WHERE scope IN ('hipertrofia_v2_intermedio','hipertrofia_v2_avanzado')`);
    out.rulesets = rs;

    // 8) Soja: natto/miso etiquetados con soja
    const { rows: soja } = await client.query(
      `SELECT COUNT(*) FILTER (WHERE NOT (COALESCE(tags::text,'') ILIKE '%soja%')) AS sin_tag,
              COUNT(*) AS total
       FROM app.foods
       WHERE translate(LOWER(nombre),'áàäâéèëêíìïîóòöôúùüûñ','aaaaeeeeiiiioooouuuun') LIKE '%natto%'
          OR translate(LOWER(nombre),'áàäâéèëêíìïîóòöôúùüûñ','aaaaeeeeiiiioooouuuun') LIKE '%miso%'`);
    out.soja_tags = soja[0];

    // 9) Reconcile datos: no quedan pares dup con canónica NULL (columnas ya no existen → N/A)
    await client.query('ROLLBACK');
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* noop */ }
    out.error = e.message;
  } finally {
    client.release();
    await pool.end();
  }
  console.log(JSON.stringify(out, null, 2));
}

main();
