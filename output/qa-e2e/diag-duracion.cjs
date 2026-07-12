// Diagnóstico duración: ¿la query general de progress-data devuelve el tiempo real?
require('../../backend/node_modules/dotenv').config({ path: '../../backend/.env' });
const { Pool } = require('../../backend/node_modules/pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 });
pool.on('error', () => {});

(async () => {
  const p = await pool.query(`
    SELECT mes.methodology_plan_id AS pid, mes.user_id AS uid,
           SUM(COALESCE(mep.time_spent_seconds,0)) AS t, COUNT(*) AS n
    FROM app.methodology_exercise_sessions mes
    JOIN app.methodology_exercise_progress mep ON mep.methodology_session_id = mes.id
    WHERE mep.status = 'completed'
    GROUP BY 1,2 ORDER BY t DESC LIMIT 1`);
  const { pid, uid, t, n } = p.rows[0];
  console.log('Plan con más tiempo:', pid, 'user', uid, 'suma_tiempo_ejercicios', t, 'ejercicios', n);

  const g = await pool.query(`
    SELECT
      SUM(CASE WHEN mep.status = 'completed' THEN COALESCE(mep.time_spent_seconds, 0) ELSE 0 END) +
      SUM(CASE WHEN mes.session_status = 'completed' THEN COALESCE(mes.warmup_time_seconds, 0) ELSE 0 END) AS total_time_seconds,
      SUM(CASE WHEN mep.status = 'completed' THEN COALESCE(mep.time_spent_seconds, 0) ELSE 0 END) AS solo_ejercicios,
      COUNT(*) AS filas_join
    FROM app.methodology_exercise_sessions mes
    LEFT JOIN app.methodology_exercise_progress mep ON mep.methodology_session_id = mes.id
    WHERE mes.user_id = $1 AND mes.methodology_plan_id = $2`, [uid, pid]);
  console.log('progress-data total_time_seconds:', JSON.stringify(g.rows[0]));

  // ¿Qué session_status tienen las sesiones de ese plan?
  const s = await pool.query(`
    SELECT session_status, COUNT(*) n FROM app.methodology_exercise_sessions
    WHERE user_id=$1 AND methodology_plan_id=$2 GROUP BY 1`, [uid, pid]);
  console.log('session_status del plan:', JSON.stringify(s.rows));
  await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });
