import assert from "node:assert/strict";
import test from "node:test";

import pg from "pg";

const { Client } = pg;
const TABLES = [
  "crossfit_v2_assessments",
  "crossfit_catalog_versions",
  "crossfit_movements",
  "crossfit_movement_variants",
  "crossfit_movement_edges",
  "crossfit_benchmark_workouts",
  "crossfit_movement_media",
  "crossfit_legacy_movement_map",
  "crossfit_v2_results",
  "crossfit_v2_autoreg_events",
  "crossfit_v2_autoreg_snapshots",
  "crossfit_v2_runtime_events",
];

function assertEphemeralDatabase(url) {
  const parsed = new URL(url);
  assert.ok(["127.0.0.1", "localhost", "::1"].includes(parsed.hostname));
  assert.equal(process.env.NODE_ENV, "test");
}

async function withRollback(run) {
  const databaseUrl = process.env.DATABASE_URL;
  assert.ok(databaseUrl, "DATABASE_URL es obligatoria para integración");
  assertEphemeralDatabase(databaseUrl);
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("BEGIN");
    await run(client);
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    await client.end();
  }
}

function movementParams(version, id) {
  return [
    version,
    id,
    `Movimiento ${id}`,
    "movement",
    "mixed",
    "squat",
    "squat",
    "beginner",
    "Preservar estímulo",
    "Instrucción sintética de QA",
    "a".repeat(64),
  ];
}

async function insertMovement(client, version, id) {
  await client.query(
    `INSERT INTO app.crossfit_movements
       (catalog_version, canonical_id, name, entity_type, domain, category,
        pattern, min_level, scaling_rule, instruction_text, content_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    movementParams(version, id),
  );
}

async function seedResultOwner(
  client,
  suffix,
  userId,
  planId,
  sessionId,
  dayId,
) {
  await client.query(
    `INSERT INTO app.users (id, email, password_hash, nombre, apellido)
     VALUES ($1, $2, 'qa-only', 'CrossFit', 'QA')`,
    [userId, `crossfit-db-${suffix}@example.invalid`],
  );
  await client.query(
    `INSERT INTO app.methodology_plans
       (id, user_id, nivel, methodology_type, generation_mode, status, plan_data)
     VALUES ($1, $2, 'basico', 'crossfit', 'manual', 'active', '{}'::jsonb)`,
    [planId, userId],
  );
  await client.query(
    `INSERT INTO app.methodology_plan_days
       (plan_id, day_id, date_local, day_name, week_number, is_rest)
     VALUES ($1, $2, CURRENT_DATE, 'lunes', 1, FALSE)`,
    [planId, dayId],
  );
  await client.query(
    `INSERT INTO app.methodology_exercise_sessions
       (id, user_id, methodology_plan_id, methodology_type, methodology_level,
        session_name, week_number, day_name, day_id, session_status)
     VALUES ($1, $2, $3, 'crossfit', 'Principiante', 'WOD QA', 1, 'lunes', $4, 'completed')`,
    [sessionId, userId, planId, dayId],
  );

  const resultId = `cfr_${suffix.repeat(24).slice(0, 24)}`;
  const eventId = `cfe_${suffix.repeat(24).slice(0, 24)}`;
  const snapshotId = `cfa_${suffix.repeat(24).slice(0, 24)}`;
  const resultPayload = {
    result_id: resultId,
    schema_version: "crossfit-result/v2",
    idempotency_key: `idem-${suffix}`,
  };
  await client.query(
    `INSERT INTO app.crossfit_v2_results
       (result_id, user_id, methodology_plan_id, session_id, day_id,
        schema_version, ruleset_version, catalog_version, request_id,
        idempotency_key, status, completion, payload, actual_training_load, recorded_at)
     VALUES ($1, $2, $3, $4, $5, 'crossfit-result/v2', 'qa-ruleset',
       'qa-catalog', $6, $7, 'completed', 1, $8::jsonb, '{}'::jsonb, NOW())`,
    [
      resultId,
      userId,
      planId,
      sessionId,
      dayId,
      `req-${suffix}`,
      `idem-${suffix}`,
      JSON.stringify(resultPayload),
    ],
  );

  const eventPayload = {
    source_event_id: resultId,
    schema_version: "crossfit-autoreg/v2",
    state: "hold",
  };
  await client.query(
    `INSERT INTO app.crossfit_v2_autoreg_events
       (event_id, source_event_id, user_id, methodology_plan_id, schema_version,
        ruleset_version, catalog_version, previous_state, state, reason_codes,
        payload, processed_at)
     VALUES ($1, $2, $3, $4, 'crossfit-autoreg/v2', 'qa-ruleset', 'qa-catalog',
       'baseline', 'hold', ARRAY['AUTOREG_HOLD'], $5::jsonb, NOW())`,
    [eventId, resultId, userId, planId, JSON.stringify(eventPayload)],
  );

  const snapshotPayload = {
    snapshot_id: snapshotId,
    source_event_id: resultId,
    schema_version: "crossfit-autoreg/v2",
    state: "hold",
  };
  await client.query(
    `INSERT INTO app.crossfit_v2_autoreg_snapshots
       (user_id, methodology_plan_id, snapshot_id, source_event_id,
        schema_version, ruleset_version, catalog_version, state, payload, processed_at)
     VALUES ($1, $2, $3, $4, 'crossfit-autoreg/v2', 'qa-ruleset',
       'qa-catalog', 'hold', $5::jsonb, NOW())`,
    [userId, planId, snapshotId, resultId, JSON.stringify(snapshotPayload)],
  );
  return resultId;
}

test("migraciones CrossFit crean objetos, RLS y políticas esperadas", async () => {
  await withRollback(async (client) => {
    const tables = await client.query(
      `SELECT tablename, rowsecurity
       FROM pg_tables
       WHERE schemaname = 'app' AND tablename = ANY($1::text[])
       ORDER BY tablename`,
      [TABLES],
    );
    assert.equal(tables.rowCount, TABLES.length);
    assert.ok(tables.rows.every((row) => row.rowsecurity));

    const policies = await client.query(
      `SELECT tablename, policyname
       FROM pg_policies
       WHERE schemaname = 'app' AND tablename = ANY($1::text[])`,
      [TABLES],
    );
    assert.ok(
      policies.rows.some(
        (row) => row.policyname === "crossfit_movements_active_read",
      ),
    );
    assert.ok(
      policies.rows.some(
        (row) => row.policyname === "crossfit_v2_results_owner_read",
      ),
    );
    assert.ok(
      policies.rows.some(
        (row) => row.policyname === "crossfit_v2_assessments_owner_read",
      ),
    );
    assert.ok(
      policies.rows.some(
        (row) => row.policyname === "crossfit_v2_runtime_events_owner_read",
      ),
    );
  });
});

test("evaluaciones aíslan usuarios y no admiten update ni delete", async () => {
  await withRollback(async (client) => {
    await client.query(
      `INSERT INTO app.users (id, email, password_hash, nombre, apellido) VALUES
       (995001, 'crossfit-assessment-a@example.invalid', 'qa-only', 'A', 'QA'),
       (995002, 'crossfit-assessment-b@example.invalid', 'qa-only', 'B', 'QA')`,
    );
    for (const [suffix, userId] of [["a", 995001], ["b", 995002]]) {
      await client.query(
        `INSERT INTO app.crossfit_v2_assessments
           (assessment_id, user_id, schema_version, level_model_version, source,
            verification_status, request_id, idempotency_key, assessment_payload,
            content_hash, classification_payload, safety_payload, observed_at)
         VALUES ($1, $2, 'crossfit-assessment/v2', 'level-model/2.0.0',
           'self_report', 'self_report', $3, $4, '{}'::jsonb, $5, '{}'::jsonb, '{}'::jsonb, NOW())`,
        [`cfx_${suffix.repeat(24)}`, userId, `req-${suffix}`, `idem-${suffix}`, suffix.repeat(64)],
      );
    }

    await client.query("SET LOCAL ROLE authenticated");
    await client.query("SELECT set_config('app.current_user_id', '995001', true)");
    const visible = await client.query("SELECT user_id FROM app.crossfit_v2_assessments");
    assert.deepEqual(visible.rows.map((row) => row.user_id), [995001]);
    await client.query("RESET ROLE");

    for (const [name, sql] of [
      ["update", "UPDATE app.crossfit_v2_assessments SET request_id = 'mutated' WHERE user_id = 995001"],
      ["delete", "DELETE FROM app.crossfit_v2_assessments WHERE user_id = 995001"],
    ]) {
      await client.query(`SAVEPOINT assessment_${name}`);
      await assert.rejects(client.query(sql), (error) => error.code === "55000");
      await client.query(`ROLLBACK TO SAVEPOINT assessment_${name}`);
    }
  });
});

test("catálogo activo oculta drafts y bloquea insert, update y delete", async () => {
  await withRollback(async (client) => {
    await client.query(
      `INSERT INTO app.crossfit_catalog_versions
         (catalog_version, ruleset_version, status, content_hash, source)
       VALUES
         ('qa-active', 'qa-ruleset', 'draft', $1, 'integration-test'),
         ('qa-draft', 'qa-ruleset', 'draft', $2, 'integration-test')`,
      ["b".repeat(64), "c".repeat(64)],
    );
    await insertMovement(client, "qa-active", "air_squat_qa");
    await insertMovement(client, "qa-draft", "ring_row_qa");
    await client.query(
      "UPDATE app.crossfit_catalog_versions SET status = 'active', activated_at = NOW() WHERE catalog_version = 'qa-active'",
    );

    await client.query("SET LOCAL ROLE authenticated");
    const visible = await client.query(
      "SELECT canonical_id FROM app.crossfit_movements ORDER BY canonical_id",
    );
    assert.deepEqual(
      visible.rows.map((row) => row.canonical_id),
      ["air_squat_qa"],
    );
    await client.query("RESET ROLE");

    for (const [name, sql, params] of [
      [
        "insert",
        `INSERT INTO app.crossfit_movements
        (catalog_version, canonical_id, name, entity_type, domain, category, pattern,
         min_level, scaling_rule, instruction_text, content_hash)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        movementParams("qa-active", "late_insert_qa"),
      ],
      [
        "update",
        "UPDATE app.crossfit_movements SET name = 'Mutado' WHERE catalog_version = 'qa-active'",
        [],
      ],
      [
        "delete",
        "DELETE FROM app.crossfit_movements WHERE catalog_version = 'qa-active'",
        [],
      ],
    ]) {
      await client.query(`SAVEPOINT immutable_${name}`);
      await assert.rejects(
        client.query(sql, params),
        (error) => error.code === "55000",
      );
      await client.query(`ROLLBACK TO SAVEPOINT immutable_${name}`);
    }
  });
});

test("resultados RLS aíslan usuarios y el ledger es append-only", async () => {
  await withRollback(async (client) => {
    const resultA = await seedResultOwner(
      client,
      "a",
      991001,
      992001,
      993001,
      994001,
    );
    await seedResultOwner(client, "b", 991002, 992002, 993002, 994002);

    await client.query("SET LOCAL ROLE authenticated");
    await client.query(
      "SELECT set_config('app.current_user_id', '991001', true)",
    );
    const own = await client.query(
      "SELECT user_id FROM app.crossfit_v2_results ORDER BY user_id",
    );
    assert.deepEqual(
      own.rows.map((row) => row.user_id),
      [991001],
    );
    const other = await client.query(
      "SELECT count(*)::int AS total FROM app.crossfit_v2_results WHERE user_id = 991002",
    );
    assert.equal(other.rows[0].total, 0);
    await client.query("RESET ROLE");

    await client.query("SAVEPOINT append_only");
    await assert.rejects(
      client.query(
        "UPDATE app.crossfit_v2_results SET status = 'partial' WHERE result_id = $1",
        [resultA],
      ),
      (error) => error.code === "55000",
    );
    await client.query("ROLLBACK TO SAVEPOINT append_only");
  });
});

test("eventos runtime aíslan usuarios, ordenan el stream y son append-only", async () => {
  await withRollback(async (client) => {
    const owners = [
      { suffix: "c", userId: 991003, planId: 992003, sessionId: 993003, dayId: 994003 },
      { suffix: "d", userId: 991004, planId: 992004, sessionId: 993004, dayId: 994004 },
    ];
    for (const owner of owners) {
      await seedResultOwner(
        client,
        owner.suffix,
        owner.userId,
        owner.planId,
        owner.sessionId,
        owner.dayId,
      );
      const eventId = `cfu_${owner.suffix.repeat(24)}`;
      const payload = {
        event_id: eventId,
        schema_version: "crossfit-runtime-event/v2",
        event_type: "timer_started",
      };
      await client.query(
        `INSERT INTO app.crossfit_v2_runtime_events
           (event_id, user_id, methodology_plan_id, session_id, day_id,
            schema_version, ruleset_version, catalog_version, stream_id,
            client_sequence, event_type, request_id, idempotency_key,
            content_hash, payload, occurred_at)
         VALUES ($1,$2,$3,$4,$5,'crossfit-runtime-event/v2','crossfit-rules/2.0.0',
           'crossfit-catalog/2.0.0',$6,0,'timer_started',$7,$8,$9,$10::jsonb,NOW())`,
        [
          eventId,
          owner.userId,
          owner.planId,
          owner.sessionId,
          owner.dayId,
          `runtime_${owner.suffix.repeat(8)}`,
          `req-runtime-${owner.suffix}`,
          `idem-runtime-${owner.suffix}`,
          owner.suffix.repeat(64),
          JSON.stringify(payload),
        ],
      );
    }

    await client.query("SET LOCAL ROLE authenticated");
    await client.query("SELECT set_config('app.current_user_id', '991003', true)");
    const visible = await client.query(
      "SELECT user_id FROM app.crossfit_v2_runtime_events ORDER BY user_id",
    );
    assert.deepEqual(visible.rows.map((row) => row.user_id), [991003]);
    await client.query("RESET ROLE");

    for (const [name, sql] of [
      ["update", "UPDATE app.crossfit_v2_runtime_events SET request_id = 'mutated' WHERE user_id = 991003"],
      ["delete", "DELETE FROM app.crossfit_v2_runtime_events WHERE user_id = 991003"],
    ]) {
      await client.query(`SAVEPOINT runtime_${name}`);
      await assert.rejects(client.query(sql), (error) => error.code === "55000");
      await client.query(`ROLLBACK TO SAVEPOINT runtime_${name}`);
    }

    await client.query("SAVEPOINT runtime_sequence");
    await assert.rejects(
      client.query(
        `INSERT INTO app.crossfit_v2_runtime_events
           (event_id, user_id, methodology_plan_id, session_id, day_id,
            schema_version, ruleset_version, catalog_version, stream_id,
            client_sequence, event_type, request_id, idempotency_key,
            content_hash, payload, occurred_at)
         SELECT 'cfu_${"e".repeat(24)}', user_id, methodology_plan_id, session_id, day_id,
           schema_version, ruleset_version, catalog_version, stream_id,
           client_sequence, 'timer_paused', 'req-runtime-duplicate',
           'idem-runtime-duplicate', '${"e".repeat(64)}',
           jsonb_build_object('event_id', 'cfu_${"e".repeat(24)}',
             'schema_version', schema_version, 'event_type', 'timer_paused'), NOW()
         FROM app.crossfit_v2_runtime_events WHERE user_id = 991003`,
      ),
      (error) => error.code === "23505",
    );
    await client.query("ROLLBACK TO SAVEPOINT runtime_sequence");
  });
});
