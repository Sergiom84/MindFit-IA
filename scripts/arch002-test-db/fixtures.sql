-- Datos sintéticos exclusivos del arnés ARCH-002. Ningún ID corresponde a producción.
INSERT INTO app.users (
  id,
  email,
  password_hash,
  nombre,
  apellido,
  nivel_entrenamiento,
  anos_entrenando,
  frecuencia_semanal,
  objetivo_principal,
  is_active,
  email_verified
)
VALUES (
  900001,
  'arch002-qa@example.invalid',
  '$2b$10$arch002.only.not.a.real.password.hash',
  'ARCH002',
  'QA',
  'intermedio',
  3,
  4,
  'ganar_masa_muscular',
  true,
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO app.methodology_plans (
  id,
  user_id,
  methodology_type,
  generation_mode,
  status,
  is_current,
  plan_start_date,
  current_week,
  plan_data
)
VALUES (
  900001,
  900001,
  'calistenia',
  'manual',
  'active',
  true,
  CURRENT_DATE,
  1,
  '{"name":"ARCH-002 QA","weeks":[{"week":1,"days":[{"day":1,"name":"Día QA","exercises":[{"name":"Sentadilla QA","sets":3,"reps":8}]}]}]}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO app.methodology_exercise_sessions (
  id,
  user_id,
  methodology_plan_id,
  methodology_type,
  methodology_level,
  session_name,
  week_number,
  day_name,
  session_date,
  total_exercises,
  session_status,
  current_exercise_index,
  exercises_data,
  is_current_session
)
VALUES (
  900001,
  900001,
  900001,
  'calistenia',
  'intermedio',
  'Sesión ARCH-002 QA',
  1,
  'lunes',
  CURRENT_DATE,
  1,
  'pending',
  0,
  '[{"name":"Sentadilla QA","sets":3,"reps":8}]'::jsonb,
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO app.methodology_exercise_progress (
  id,
  user_id,
  methodology_session_id,
  exercise_name,
  exercise_order,
  total_sets,
  total_reps,
  status
)
VALUES (
  900001,
  900001,
  900001,
  'Sentadilla QA',
  1,
  '3',
  '8',
  'pending'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO app.workout_schedule (
  id,
  methodology_plan_id,
  user_id,
  week_number,
  session_order,
  week_session_order,
  scheduled_date,
  day_name,
  day_abbrev,
  session_title,
  exercises,
  status
)
VALUES (
  900001,
  900001,
  900001,
  1,
  1,
  1,
  CURRENT_DATE,
  'lunes',
  'lun',
  'Sesión ARCH-002 QA',
  '[{"name":"Sentadilla QA","sets":3,"reps":8}]'::jsonb,
  'scheduled'
)
ON CONFLICT (id) DO NOTHING;

SELECT setval('app.users_id_seq', GREATEST((SELECT MAX(id) FROM app.users), 1), true);
SELECT setval('app.methodology_plans_new_id_seq', GREATEST((SELECT MAX(id) FROM app.methodology_plans), 1), true);
SELECT setval('app.methodology_exercise_sessions_id_seq', GREATEST((SELECT MAX(id) FROM app.methodology_exercise_sessions), 1), true);
SELECT setval('app.methodology_exercise_progress_id_seq', GREATEST((SELECT MAX(id) FROM app.methodology_exercise_progress), 1), true);
SELECT setval('app.workout_schedule_id_seq', GREATEST((SELECT MAX(id) FROM app.workout_schedule), 1), true);
