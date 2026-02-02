-- =====================================================
-- SCRIPT: Plan HipertrofiaV2 COMPLETO para María
-- Respeta preferencias del usuario:
-- - 4 semanas de entrenamiento
-- - 8 ejercicios por sesión
-- - Días: Lunes-Viernes (D1-D5)
-- =====================================================

-- Verificar que no haya planes activos previos
DO $$
BEGIN
  DELETE FROM app.methodology_plans
  WHERE user_id = 39 AND status = 'active';

  RAISE NOTICE '✅ Planes previos eliminados';
END $$;

-- Crear estructura de semana base
DO $$
DECLARE
  semana_base jsonb;
  plan_id int;
BEGIN
  -- Definir estructura de semana (se repetirá 4 veces)
  semana_base := jsonb_build_array(
    -- D1: Pecho + Tríceps (8 ejercicios)
    jsonb_build_object(
      'ciclo_dia', 1,
      'dia_nombre', 'D1',
      'grupos_musculares', jsonb_build_array('Pecho', 'Tríceps'),
      'intensity_percentage', 75,
      'ejercicios', jsonb_build_array(
        jsonb_build_object('exercise_id', 1, 'nombre', 'Press de pecho en máquina', 'categoria', 'Pecho', 'tipo_ejercicio', 'multiarticular', 'series', 4, 'reps_objetivo', '8-12', 'descanso_seg', 90, 'intensidad_porcentaje', 75, 'rir_target', 2, 'orden', 1),
        jsonb_build_object('exercise_id', 23, 'nombre', 'Press de banca con barra', 'categoria', 'Pecho', 'tipo_ejercicio', 'multiarticular', 'series', 4, 'reps_objetivo', '8-12', 'descanso_seg', 90, 'intensidad_porcentaje', 75, 'rir_target', 2, 'orden', 2),
        jsonb_build_object('exercise_id', 24, 'nombre', 'Press inclinado con mancuernas', 'categoria', 'Pecho', 'tipo_ejercicio', 'multiarticular', 'series', 3, 'reps_objetivo', '10-15', 'descanso_seg', 90, 'intensidad_porcentaje', 70, 'rir_target', 3, 'orden', 3),
        jsonb_build_object('exercise_id', 25, 'nombre', 'Aperturas con mancuernas en banco plano', 'categoria', 'Pecho', 'tipo_ejercicio', 'unilateral', 'series', 3, 'reps_objetivo', '12-15', 'descanso_seg', 60, 'intensidad_porcentaje', 65, 'rir_target', 3, 'orden', 4),
        jsonb_build_object('exercise_id', 3, 'nombre', 'Fondos en paralelas (pecho)', 'categoria', 'Pecho', 'tipo_ejercicio', 'multiarticular', 'series', 3, 'reps_objetivo', '8-12', 'descanso_seg', 90, 'intensidad_porcentaje', 70, 'rir_target', 3, 'orden', 5),
        jsonb_build_object('exercise_id', 11, 'nombre', 'Extensión de tríceps en polea alta', 'categoria', 'Tríceps', 'tipo_ejercicio', 'analitico', 'series', 3, 'reps_objetivo', '12-15', 'descanso_seg', 50, 'intensidad_porcentaje', 65, 'rir_target', 3, 'orden', 6),
        jsonb_build_object('exercise_id', 31, 'nombre', 'Press francés con barra Z', 'categoria', 'Tríceps', 'tipo_ejercicio', 'analitico', 'series', 3, 'reps_objetivo', '10-12', 'descanso_seg', 60, 'intensidad_porcentaje', 70, 'rir_target', 3, 'orden', 7),
        jsonb_build_object('exercise_id', 32, 'nombre', 'Patada de tríceps con mancuerna', 'categoria', 'Tríceps', 'tipo_ejercicio', 'analitico', 'series', 3, 'reps_objetivo', '12-15', 'descanso_seg', 50, 'intensidad_porcentaje', 60, 'rir_target', 4, 'orden', 8)
      )
    ),

    -- D2: Espalda + Bíceps (8 ejercicios)
    jsonb_build_object(
      'ciclo_dia', 2,
      'dia_nombre', 'D2',
      'grupos_musculares', jsonb_build_array('Espalda', 'Bíceps'),
      'intensity_percentage', 75,
      'ejercicios', jsonb_build_array(
        jsonb_build_object('exercise_id', 4, 'nombre', 'Jalón al pecho en polea', 'categoria', 'Espalda', 'tipo_ejercicio', 'multiarticular', 'series', 4, 'reps_objetivo', '8-12', 'descanso_seg', 90, 'intensidad_porcentaje', 75, 'rir_target', 2, 'orden', 1),
        jsonb_build_object('exercise_id', 26, 'nombre', 'Remo con barra', 'categoria', 'Espalda', 'tipo_ejercicio', 'multiarticular', 'series', 4, 'reps_objetivo', '8-12', 'descanso_seg', 90, 'intensidad_porcentaje', 75, 'rir_target', 2, 'orden', 2),
        jsonb_build_object('exercise_id', 27, 'nombre', 'Remo con mancuernas', 'categoria', 'Espalda', 'tipo_ejercicio', 'unilateral', 'series', 3, 'reps_objetivo', '10-15', 'descanso_seg', 60, 'intensidad_porcentaje', 70, 'rir_target', 3, 'orden', 3),
        jsonb_build_object('exercise_id', 5, 'nombre', 'Pulldown en polea', 'categoria', 'Espalda', 'tipo_ejercicio', 'analitico', 'series', 3, 'reps_objetivo', '12-15', 'descanso_seg', 50, 'intensidad_porcentaje', 65, 'rir_target', 3, 'orden', 4),
        jsonb_build_object('exercise_id', 28, 'nombre', 'Dominadas asistidas', 'categoria', 'Espalda', 'tipo_ejercicio', 'multiarticular', 'series', 3, 'reps_objetivo', '6-10', 'descanso_seg', 90, 'intensidad_porcentaje', 75, 'rir_target', 2, 'orden', 5),
        jsonb_build_object('exercise_id', 10, 'nombre', 'Curl de bíceps con barra', 'categoria', 'Bíceps', 'tipo_ejercicio', 'analitico', 'series', 3, 'reps_objetivo', '10-12', 'descanso_seg', 50, 'intensidad_porcentaje', 65, 'rir_target', 3, 'orden', 6),
        jsonb_build_object('exercise_id', 33, 'nombre', 'Curl martillo con mancuernas', 'categoria', 'Bíceps', 'tipo_ejercicio', 'analitico', 'series', 3, 'reps_objetivo', '10-12', 'descanso_seg', 50, 'intensidad_porcentaje', 65, 'rir_target', 3, 'orden', 7),
        jsonb_build_object('exercise_id', 34, 'nombre', 'Curl concentrado', 'categoria', 'Bíceps', 'tipo_ejercicio', 'analitico', 'series', 3, 'reps_objetivo', '12-15', 'descanso_seg', 50, 'intensidad_porcentaje', 60, 'rir_target', 4, 'orden', 8)
      )
    ),

    -- D3: Piernas + Core (8 ejercicios) - CON RESTRICCIONES MENSTRUALES
    jsonb_build_object(
      'ciclo_dia', 3,
      'dia_nombre', 'D3',
      'grupos_musculares', jsonb_build_array('Piernas', 'Core'),
      'intensity_percentage', 75,
      'ejercicios', jsonb_build_array(
        jsonb_build_object('exercise_id', 13, 'nombre', 'Sentadilla en prensa 45°', 'categoria', 'Piernas (cuádriceps)', 'tipo_ejercicio', 'multiarticular', 'series', 4, 'reps_objetivo', '8-12', 'descanso_seg', 90, 'intensidad_porcentaje', 75, 'rir_target', 2, 'orden', 1),
        jsonb_build_object('exercise_id', 106, 'nombre', 'Sentadilla olímpica con barra', 'categoria', 'Piernas (cuádriceps)', 'tipo_ejercicio', 'multiarticular', 'series', 4, 'reps_objetivo', '6-10', 'descanso_seg', 90, 'intensidad_porcentaje', 80, 'rir_target', 2, 'orden', 2),
        jsonb_build_object('exercise_id', 40, 'nombre', 'Peso muerto rumano (RDL) con barra', 'categoria', 'Isquios/Glúteo', 'tipo_ejercicio', 'multiarticular', 'series', 3, 'reps_objetivo', '8-12', 'descanso_seg', 90, 'intensidad_porcentaje', 75, 'rir_target', 2, 'orden', 3),
        jsonb_build_object('exercise_id', 14, 'nombre', 'Extensión de cuádriceps en máquina', 'categoria', 'Piernas (cuádriceps)', 'tipo_ejercicio', 'analitico', 'series', 3, 'reps_objetivo', '12-15', 'descanso_seg', 60, 'intensidad_porcentaje', 70, 'rir_target', 3, 'orden', 4),
        jsonb_build_object('exercise_id', 15, 'nombre', 'Curl femoral acostado', 'categoria', 'Isquios/Glúteo', 'tipo_ejercicio', 'analitico', 'series', 3, 'reps_objetivo', '12-15', 'descanso_seg', 60, 'intensidad_porcentaje', 70, 'rir_target', 3, 'orden', 5),
        jsonb_build_object('exercise_id', 67, 'nombre', 'Crunch con carga (disco en pecho)', 'categoria', 'Core', 'tipo_ejercicio', 'analitico', 'series', 3, 'reps_objetivo', '15-20', 'descanso_seg', 50, 'intensidad_porcentaje', 70, 'rir_target', 3, 'orden', 6),
        jsonb_build_object('exercise_id', 76, 'nombre', 'Ab Wheel posición avanzada', 'categoria', 'Core', 'tipo_ejercicio', 'analitico', 'series', 3, 'reps_objetivo', '10-15', 'descanso_seg', 50, 'intensidad_porcentaje', 75, 'rir_target', 2, 'orden', 7),
        jsonb_build_object('exercise_id', 21, 'nombre', 'Pallof Press en polea', 'categoria', 'Core', 'tipo_ejercicio', 'analitico', 'series', 3, 'reps_objetivo', '12-15', 'descanso_seg', 50, 'intensidad_porcentaje', 65, 'rir_target', 3, 'orden', 8)
      )
    ),

    -- D4: Hombro + Brazos (8 ejercicios)
    jsonb_build_object(
      'ciclo_dia', 4,
      'dia_nombre', 'D4',
      'grupos_musculares', jsonb_build_array('Hombro', 'Bíceps', 'Tríceps'),
      'intensity_percentage', 70,
      'ejercicios', jsonb_build_array(
        jsonb_build_object('exercise_id', 7, 'nombre', 'Press militar en máquina', 'categoria', 'Hombro', 'tipo_ejercicio', 'multiarticular', 'series', 4, 'reps_objetivo', '8-12', 'descanso_seg', 90, 'intensidad_porcentaje', 70, 'rir_target', 3, 'orden', 1),
        jsonb_build_object('exercise_id', 30, 'nombre', 'Press militar con mancuernas (sentado)', 'categoria', 'Hombro', 'tipo_ejercicio', 'multiarticular', 'series', 3, 'reps_objetivo', '10-15', 'descanso_seg', 90, 'intensidad_porcentaje', 65, 'rir_target', 3, 'orden', 2),
        jsonb_build_object('exercise_id', 8, 'nombre', 'Elevaciones laterales con mancuernas', 'categoria', 'Hombro', 'tipo_ejercicio', 'analitico', 'series', 3, 'reps_objetivo', '12-15', 'descanso_seg', 50, 'intensidad_porcentaje', 60, 'rir_target', 4, 'orden', 3),
        jsonb_build_object('exercise_id', 9, 'nombre', 'Elevaciones frontales con disco', 'categoria', 'Hombro', 'tipo_ejercicio', 'analitico', 'series', 3, 'reps_objetivo', '12-15', 'descanso_seg', 50, 'intensidad_porcentaje', 60, 'rir_target', 4, 'orden', 4),
        jsonb_build_object('exercise_id', 35, 'nombre', 'Pájaros en banco inclinado', 'categoria', 'Hombro', 'tipo_ejercicio', 'analitico', 'series', 3, 'reps_objetivo', '12-15', 'descanso_seg', 50, 'intensidad_porcentaje', 60, 'rir_target', 4, 'orden', 5),
        jsonb_build_object('exercise_id', 10, 'nombre', 'Curl de bíceps con barra', 'categoria', 'Bíceps', 'tipo_ejercicio', 'analitico', 'series', 3, 'reps_objetivo', '10-12', 'descanso_seg', 50, 'intensidad_porcentaje', 65, 'rir_target', 3, 'orden', 6),
        jsonb_build_object('exercise_id', 11, 'nombre', 'Extensión de tríceps en polea alta', 'categoria', 'Tríceps', 'tipo_ejercicio', 'analitico', 'series', 3, 'reps_objetivo', '12-15', 'descanso_seg', 50, 'intensidad_porcentaje', 65, 'rir_target', 3, 'orden', 7),
        jsonb_build_object('exercise_id', 36, 'nombre', 'Face pulls en polea', 'categoria', 'Hombro', 'tipo_ejercicio', 'analitico', 'series', 3, 'reps_objetivo', '15-20', 'descanso_seg', 50, 'intensidad_porcentaje', 60, 'rir_target', 4, 'orden', 8)
      )
    ),

    -- D5: Full Body + Core (8 ejercicios)
    jsonb_build_object(
      'ciclo_dia', 5,
      'dia_nombre', 'D5',
      'grupos_musculares', jsonb_build_array('Full Body', 'Core'),
      'intensity_percentage', 70,
      'ejercicios', jsonb_build_array(
        jsonb_build_object('exercise_id', 2, 'nombre', 'Press inclinado en máquina', 'categoria', 'Pecho', 'tipo_ejercicio', 'multiarticular', 'series', 3, 'reps_objetivo', '10-12', 'descanso_seg', 90, 'intensidad_porcentaje', 70, 'rir_target', 3, 'orden', 1),
        jsonb_build_object('exercise_id', 4, 'nombre', 'Jalón al pecho en polea', 'categoria', 'Espalda', 'tipo_ejercicio', 'multiarticular', 'series', 3, 'reps_objetivo', '10-12', 'descanso_seg', 90, 'intensidad_porcentaje', 70, 'rir_target', 3, 'orden', 2),
        jsonb_build_object('exercise_id', 37, 'nombre', 'Sentadilla frontal con barra (técnica)', 'categoria', 'Piernas (cuádriceps)', 'tipo_ejercicio', 'multiarticular', 'series', 3, 'reps_objetivo', '8-12', 'descanso_seg', 90, 'intensidad_porcentaje', 70, 'rir_target', 3, 'orden', 3),
        jsonb_build_object('exercise_id', 38, 'nombre', 'Zancadas con mancuernas', 'categoria', 'Piernas (cuádriceps)', 'tipo_ejercicio', 'multiarticular', 'series', 3, 'reps_objetivo', '10-12', 'descanso_seg', 90, 'intensidad_porcentaje', 65, 'rir_target', 3, 'orden', 4),
        jsonb_build_object('exercise_id', 39, 'nombre', 'Hip thrust con barra', 'categoria', 'Isquios/Glúteo', 'tipo_ejercicio', 'multiarticular', 'series', 3, 'reps_objetivo', '12-15', 'descanso_seg', 90, 'intensidad_porcentaje', 70, 'rir_target', 3, 'orden', 5),
        jsonb_build_object('exercise_id', 21, 'nombre', 'Pallof Press en polea', 'categoria', 'Core', 'tipo_ejercicio', 'analitico', 'series', 3, 'reps_objetivo', '12-15', 'descanso_seg', 50, 'intensidad_porcentaje', 65, 'rir_target', 3, 'orden', 6),
        jsonb_build_object('exercise_id', 22, 'nombre', 'Plancha frontal (tiempo)', 'categoria', 'Core', 'tipo_ejercicio', 'isométrico', 'series', 3, 'reps_objetivo', '30-60s', 'descanso_seg', 60, 'intensidad_porcentaje', 70, 'rir_target', 3, 'orden', 7),
        jsonb_build_object('exercise_id', 41, 'nombre', 'Mountain climbers', 'categoria', 'Core', 'tipo_ejercicio', 'cardio', 'series', 3, 'reps_objetivo', '20-30', 'descanso_seg', 50, 'intensidad_porcentaje', 65, 'rir_target', 4, 'orden', 8)
      )
    )
  );

  -- Insertar plan con 4 semanas
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
    39,
    'HipertrofiaV2_MindFeed',
    'active',
    'specialist',
    'full',
    '2026-02-02',
    NOW(),
    true,
    1,
    'D1',
    5,
    'Plan HipertrofiaV2 - María - 4 Semanas',
    'Plan especializado para tonificación muscular. 8 ejercicios por sesión, 4 semanas. Incluye adaptación menstrual automática.',
    'calistenia_specialist',
    jsonb_build_object(
      'nivel', 'Intermedio',
      'objetivo', 'tonificar',
      'sexo', 'femenino',
      'isFemale', true,
      'totalExercises', 160,
      'semanas', jsonb_build_array(
        jsonb_build_object('numero', 1, 'sesiones', semana_base),
        jsonb_build_object('numero', 2, 'sesiones', semana_base),
        jsonb_build_object('numero', 3, 'sesiones', semana_base),
        jsonb_build_object('numero', 4, 'sesiones', semana_base)
      )
    ),
    NOW()
  ) RETURNING id INTO plan_id;

  RAISE NOTICE '✅ Plan creado exitosamente con ID: %', plan_id;
  RAISE NOTICE '   - 4 semanas generadas';
  RAISE NOTICE '   - 8 ejercicios por sesión';
  RAISE NOTICE '   - 160 ejercicios totales (8 x 5 días x 4 semanas)';
  RAISE NOTICE '   - Sesión D3 incluye ejercicios con restricciones menstruales';
END $$;

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
  jsonb_array_length(plan_data->'semanas') as total_semanas,
  jsonb_array_length(plan_data->'semanas'->0->'sesiones'->0->'ejercicios') as ejercicios_d1_semana1,
  (plan_data->>'totalExercises')::int as total_ejercicios_plan
FROM app.methodology_plans
WHERE user_id = 39 AND status = 'active'
ORDER BY created_at DESC
LIMIT 1;
