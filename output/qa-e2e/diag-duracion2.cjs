// ¿total_duration_seconds de la sesión se rellena con la suma de tiempos de ejercicios?
require('../../backend/node_modules/dotenv').config({ path: '../../backend/.env' });
const { Pool } = require('../../backend/node_modules/pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 });
pool.on('error', () => {});
(async () => {
  const q = await pool.query(`
    SELECT COUNT(*) n,
      COUNT(*) FILTER (WHERE COALESCE(total_duration_seconds,0)>0) con_duracion,
      ROUND(AVG(COALESCE(total_duration_seconds,0))) media_duracion
    FROM app.methodology_exercise_sessions WHERE session_status='completed'`);
  console.log('Sesiones completadas:', JSON.stringify(q.rows[0]));
  const c = await pool.query(`
    SELECT mes.id, mes.total_duration_seconds AS dur_sesion,
           SUM(COALESCE(mep.time_spent_seconds,0)) AS suma_ejercicios,
           mes.warmup_time_seconds AS warmup
    FROM app.methodology_exercise_sessions mes
    JOIN app.methodology_exercise_progress mep ON mep.methodology_session_id = mes.id
    WHERE mes.session_status='completed' AND mep.status='completed'
    GROUP BY 1,2,4 HAVING SUM(COALESCE(mep.time_spent_seconds,0))>0
    ORDER BY mes.id DESC LIMIT 6`);
  console.log('=== dur_sesion vs suma_ejercicios (recientes con tiempo) ===');
  c.rows.forEach(r => console.log(JSON.stringify(r)));
  await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });
