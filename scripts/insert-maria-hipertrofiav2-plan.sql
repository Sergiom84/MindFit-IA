-- =====================================================
-- SCRIPT: Generar Plan HipertrofiaV2 para María
-- Usuario: María (ciclo@ciclo.com) - user_id: 39
-- Fecha inicio: 2 de febrero 2026 (Día 17 del ciclo)
-- =====================================================

-- NOTA: Este plan se genera para testing del sistema de filtrado menstrual
-- El plan incluye ejercicios que serán filtrados durante el período (14-17 feb)

INSERT INTO app.methodology_plans (
  user_id,
  methodology_type,
  status,
  generation_mode,
  version_type,
  plan_start_date,
  started_at,
  is_current,
  current_week,
  current_day,
  total_days,
  plan_name,
  plan_description,
  origin,
  plan_data,
  created_at
) VALUES (
  39,                                    -- user_id
  'HipertrofiaV2_MindFeed',             -- methodology_type
  'active',                              -- status
  'specialist',                          -- generation_mode
  'full',                                -- version_type
  '2026-02-02',                          -- plan_start_date (mañana, día 17 del ciclo)
  NOW(),                                 -- started_at
  true,                                  -- is_current
  1,                                     -- current_week
  'D1',                                  -- current_day (empieza en D1 mañana)
  5,                                     -- total_days (D1-D5)
  'Plan HipertrofiaV2 - Tonificación Femenina',
  'Plan especializado para tonificación muscular con ciclo D1-D5. Incluye adaptación menstrual automática.',
  'calistenia_specialist',
  jsonb_build_object(
    'nivel', 'Intermedio',
    'objetivo', 'tonificar',
    'semanas', jsonb_build_array(
      -- SEMANA 1
      jsonb_build_object(
        'numero', 1,
        'sesiones', jsonb_build_array(
          -- D1: Pecho + Tríceps
          jsonb_build_object(
            'ciclo_dia', 1,
            'dia_nombre', 'D1',
            'grupos_musculares', jsonb_build_array('Pecho', 'Tríceps'),
            'intensity_percentage', 75,
            'ejercicios', jsonb_build_array(
              jsonb_build_object('exercise_id', 1, 'nombre', 'Press de pecho en máquina', 'categoria', 'Pecho', 'tipo_ejercicio', 'multiarticular', 'series', 4, 'reps_objetivo', '8-12', 'descanso_seg', 90, 'intensidad_porcentaje', 75, 'rir_target', 2, 'orden', 1),
              jsonb_build_object('exercise_id', 23, 'nombre', 'Press de banca con barra', 'categoria', 'Pecho', 'tipo_ejercicio', 'multiarticular', 'series', 4, 'reps_objetivo', '8-12', 'descanso_seg', 90, 'intensidad_porcentaje', 75, 'rir_target', 2, 'orden', 2),
              jsonb_build_object('exercise_id', 24, 'nombre', 'Press inclinado con mancuernas', 'categoria', 'Pecho', 'tipo_ejercicio', 'multiarticular', 'series', 3, 'reps_objetivo', '10-15', 'descanso_seg', 90, 'intensidad_porcentaje', 70, 'rir_target', 3, 'orden', 3),
              jsonb_build_object('exercise_id', 25, 'nombre', 'Aperturas con mancuernas en banco plano', 'categoria', 'Pecho', 'tipo_ejercicio', 'unilateral', 'series', 3, 'reps_objetivo', '12-15', 'descanso_seg', 60, 'intensidad_porcentaje', 65, 'rir_target', 3, 'orden', 4)
            )
          ),
          -- D2: Espalda + Bíceps
          jsonb_build_object(
            'ciclo_dia', 2,
            'dia_nombre', 'D2',
            'grupos_musculares', jsonb_build_array('Espalda', 'Bíceps'),
            'intensity_percentage', 75,
            'ejercicios', jsonb_build_array(
              jsonb_build_object('exercise_id', 4, 'nombre', 'Jalón al pecho en polea', 'categoria', 'Espalda', 'tipo_ejercicio', 'multiarticular', 'series', 4, 'reps_objetivo', '8-12', 'descanso_seg', 90, 'intensidad_porcentaje', 75, 'rir_target', 2, 'orden', 1),
              jsonb_build_object('exercise_id', 26, 'nombre', 'Remo con barra', 'categoria', 'Espalda', 'tipo_ejercicio', 'multiarticular', 'series', 4, 'reps_objetivo', '8-12', 'descanso_seg', 90, 'intensidad_porcentaje', 75, 'rir_target', 2, 'orden', 2),
              jsonb_build_object('exercise_id', 27, 'nombre', 'Remo con mancuernas', 'categoria', 'Espalda', 'tipo_ejercicio', 'unilateral', 'series', 3, 'reps_objetivo', '10-15', 'descanso_seg', 60, 'intensidad_porcentaje', 70, 'rir_target', 3, 'orden', 3),
              jsonb_build_object('exercise_id', 5, 'nombre', 'Pulldown en polea', 'categoria', 'Espalda', 'tipo_ejercicio', 'analitico', 'series', 3, 'reps_objetivo', '12-15', 'descanso_seg', 50, 'intensidad_porcentaje', 65, 'rir_target', 3, 'orden', 4)
            )
          ),
          -- D3: Piernas + Core
          jsonb_build_object(
            'ciclo_dia', 3,
            'dia_nombre', 'D3',
            'grupos_musculares', jsonb_build_array('Piernas', 'Core'),
            'intensity_percentage', 75,
            'ejercicios', jsonb_build_array(
              jsonb_build_object('exercise_id', 13, 'nombre', 'Sentadilla en prensa 45°', 'categoria', 'Piernas (cuádriceps)', 'tipo_ejercicio', 'multiarticular', 'series', 4, 'reps_objetivo', '8-12', 'descanso_seg', 90, 'intensidad_porcentaje', 75, 'rir_target', 2, 'orden', 1),
              jsonb_build_object('exercise_id', 106, 'nombre', 'Sentadilla olímpica con barra', 'categoria', 'Piernas (cuádriceps)', 'tipo_ejercicio', 'multiarticular', 'series', 4, 'reps_objetivo', '6-10', 'descanso_seg', 90, 'intensidad_porcentaje', 80, 'rir_target', 2, 'orden', 2),
              jsonb_build_object('exercise_id', 40, 'nombre', 'Peso muerto rumano (RDL) con barra', 'categoria', 'Isquios/Glúteo', 'tipo_ejercicio', 'multiarticular', 'series', 3, 'reps_objetivo', '8-12', 'descanso_seg', 90, 'intensidad_porcentaje', 75, 'rir_target', 2, 'orden', 3),
              jsonb_build_object('exercise_id', 67, 'nombre', 'Crunch con carga (disco en pecho)', 'categoria', 'Core', 'tipo_ejercicio', 'analitico', 'series', 3, 'reps_objetivo', '15-20', 'descanso_seg', 50, 'intensidad_porcentaje', 70, 'rir_target', 3, 'orden', 4),
              jsonb_build_object('exercise_id', 76, 'nombre', 'Ab Wheel posición avanzada', 'categoria', 'Core', 'tipo_ejercicio', 'analitico', 'series', 3, 'reps_objetivo', '10-15', 'descanso_seg', 50, 'intensidad_porcentaje', 75, 'rir_target', 2, 'orden', 5)
            )
          ),
          -- D4: Hombro + Brazos
          jsonb_build_object(
            'ciclo_dia', 4,
            'dia_nombre', 'D4',
            'grupos_musculares', jsonb_build_array('Hombro', 'Bíceps', 'Tríceps'),
            'intensity_percentage', 70,
            'ejercicios', jsonb_build_array(
              jsonb_build_object('exercise_id', 7, 'nombre', 'Press militar en máquina', 'categoria', 'Hombro', 'tipo_ejercicio', 'multiarticular', 'series', 4, 'reps_objetivo', '8-12', 'descanso_seg', 90, 'intensidad_porcentaje', 70, 'rir_target', 3, 'orden', 1),
              jsonb_build_object('exercise_id', 30, 'nombre', 'Press militar con mancuernas (sentado)', 'categoria', 'Hombro', 'tipo_ejercicio', 'multiarticular', 'series', 3, 'reps_objetivo', '10-15', 'descanso_seg', 90, 'intensidad_porcentaje', 65, 'rir_target', 3, 'orden', 2),
              jsonb_build_object('exercise_id', 8, 'nombre', 'Elevaciones laterales con mancuernas', 'categoria', 'Hombro', 'tipo_ejercicio', 'analitico', 'series', 3, 'reps_objetivo', '12-15', 'descanso_seg', 50, 'intensidad_porcentaje', 60, 'rir_target', 4, 'orden', 3),
              jsonb_build_object('exercise_id', 10, 'nombre', 'Curl de bíceps con barra', 'categoria', 'Bíceps', 'tipo_ejercicio', 'analitico', 'series', 3, 'reps_objetivo', '10-12', 'descanso_seg', 50, 'intensidad_porcentaje', 65, 'rir_target', 3, 'orden', 4)
            )
          ),
          -- D5: Full Body + Core
          jsonb_build_object(
            'ciclo_dia', 5,
            'dia_nombre', 'D5',
            'grupos_musculares', jsonb_build_array('Full Body', 'Core'),
            'intensity_percentage', 70,
            'ejercicios', jsonb_build_array(
              jsonb_build_object('exercise_id', 2, 'nombre', 'Press inclinado en máquina', 'categoria', 'Pecho', 'tipo_ejercicio', 'multiarticular', 'series', 3, 'reps_objetivo', '10-12', 'descanso_seg', 90, 'intensidad_porcentaje', 70, 'rir_target', 3, 'orden', 1),
              jsonb_build_object('exercise_id', 4, 'nombre', 'Jalón al pecho en polea', 'categoria', 'Espalda', 'tipo_ejercicio', 'multiarticular', 'series', 3, 'reps_objetivo', '10-12', 'descanso_seg', 90, 'intensidad_porcentaje', 70, 'rir_target', 3, 'orden', 2),
              jsonb_build_object('exercise_id', 37, 'nombre', 'Sentadilla frontal con barra (técnica)', 'categoria', 'Piernas (cuádriceps)', 'tipo_ejercicio', 'multiarticular', 'series', 3, 'reps_objetivo', '8-12', 'descanso_seg', 90, 'intensidad_porcentaje', 70, 'rir_target', 3, 'orden', 3),
              jsonb_build_object('exercise_id', 21, 'nombre', 'Pallof Press en polea', 'categoria', 'Core', 'tipo_ejercicio', 'analitico', 'series', 3, 'reps_objetivo', '12-15', 'descanso_seg', 50, 'intensidad_porcentaje', 65, 'rir_target', 3, 'orden', 4)
            )
          )
        )
      )
    ),
    'sexo', 'femenino',
    'isFemale', true,
    'totalExercises', 22
  ),
  NOW()
) RETURNING id, user_id, methodology_type, status, plan_start_date;

-- Verificar plan creado
SELECT
  id as plan_id,
  user_id,
  methodology_type,
  status,
  plan_start_date,
  is_current,
  current_week,
  current_day,
  jsonb_array_length(plan_data->'semanas') as total_semanas
FROM app.methodology_plans
WHERE user_id = 39 AND status = 'active'
ORDER BY created_at DESC
LIMIT 1;
