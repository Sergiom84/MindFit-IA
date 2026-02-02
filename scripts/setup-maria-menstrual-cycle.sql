-- =====================================================
-- SCRIPT: Configuración del Ciclo Menstrual de María
-- Usuario: María (ciclo@ciclo.com) - user_id: 39
-- Fecha: 2026-02-01
-- =====================================================

-- =====================================================
-- PASO 1: Configurar ciclo menstrual de María
-- =====================================================

INSERT INTO app.user_menstrual_config (
  user_id,
  cycle_length,
  period_length,
  tracking_enabled,
  uses_hormonal_contraceptives,
  last_period_start,
  created_at,
  updated_at
) VALUES (
  39,                    -- user_id de María
  28,                    -- Ciclo de 28 días (regular)
  4,                     -- Período de 4 días
  true,                  -- Tracking activado
  false,                 -- NO usa anticonceptivos hormonales
  '2026-01-17',          -- Último período: 17 de enero de 2026
  NOW(),
  NOW()
);

-- =====================================================
-- PASO 2: Registrar log del 17 de enero (Día 1 - "Hoy me ha bajado")
-- =====================================================

INSERT INTO app.menstrual_daily_log (
  user_id,
  log_date,
  is_period_day,
  pain_level,
  energy_level,
  sleep_quality,
  mood,
  symptoms,
  notes,
  created_at,
  updated_at
) VALUES (
  39,
  '2026-01-17',          -- Día 1 del período
  true,                  -- Es día de período
  6,                     -- Dolor moderado-alto (1-10)
  2,                     -- Energía baja
  3,                     -- Sueño regular
  'irritable',           -- Estado de ánimo
  ARRAY['cramps', 'fatigue'], -- Síntomas: cólicos, fatiga
  'Primer día del período - malestar general',
  NOW(),
  NOW()
);

-- =====================================================
-- PASO 3: Registrar días 2-4 del período (18-20 enero)
-- =====================================================

-- Día 2 (18 enero) - Dolor alto, energía muy baja
INSERT INTO app.menstrual_daily_log (
  user_id, log_date, is_period_day, pain_level, energy_level, sleep_quality, mood, symptoms, notes, created_at, updated_at
) VALUES (
  39, '2026-01-18', true, 7, 2, 3, 'tired', ARRAY['cramps', 'fatigue', 'headache'],
  'Día 2 - dolor más intenso', NOW(), NOW()
);

-- Día 3 (19 enero) - Dolor moderado, energía mejorando
INSERT INTO app.menstrual_daily_log (
  user_id, log_date, is_period_day, pain_level, energy_level, sleep_quality, mood, symptoms, notes, created_at, updated_at
) VALUES (
  39, '2026-01-19', true, 5, 3, 4, 'calm', ARRAY['cramps', 'bloating'],
  'Día 3 - síntomas mejorando', NOW(), NOW()
);

-- Día 4 (20 enero) - Último día, dolor leve
INSERT INTO app.menstrual_daily_log (
  user_id, log_date, is_period_day, pain_level, energy_level, sleep_quality, mood, symptoms, notes, created_at, updated_at
) VALUES (
  39, '2026-01-20', true, 3, 4, 5, 'happy', ARRAY['bloating'],
  'Día 4 - último día del período', NOW(), NOW()
);

-- =====================================================
-- PASO 4: Registrar días post-período (fase folicular)
-- =====================================================

-- Día 5 (21 enero) - Fase folicular temprana
INSERT INTO app.menstrual_daily_log (
  user_id, log_date, is_period_day, pain_level, energy_level, sleep_quality, mood, symptoms, notes, created_at, updated_at
) VALUES (
  39, '2026-01-21', false, 1, 5, 5, 'energetic', ARRAY[]::text[],
  'Fase folicular - energía alta', NOW(), NOW()
);

-- Día 6 (22 enero)
INSERT INTO app.menstrual_daily_log (
  user_id, log_date, is_period_day, pain_level, energy_level, sleep_quality, mood, symptoms, notes, created_at, updated_at
) VALUES (
  39, '2026-01-22', false, 0, 5, 5, 'energetic', ARRAY[]::text[],
  'Fase folicular - excelente estado', NOW(), NOW()
);

-- Días 7-14 (23-30 enero) - Fase folicular y ovulación
INSERT INTO app.menstrual_daily_log (
  user_id, log_date, is_period_day, pain_level, energy_level, sleep_quality, mood, symptoms, notes, created_at, updated_at
)
SELECT
  39,
  DATE '2026-01-17' + (day_num || ' days')::interval,
  false,
  CASE
    WHEN day_num BETWEEN 12 AND 15 THEN 1  -- Ovulación: dolor leve ocasional
    ELSE 0
  END,
  5,  -- Energía alta en fase folicular
  5,  -- Sueño excelente
  CASE
    WHEN day_num BETWEEN 12 AND 15 THEN 'happy'
    ELSE 'energetic'
  END,
  CASE
    WHEN day_num BETWEEN 12 AND 15 THEN ARRAY['mild_cramping']
    ELSE ARRAY[]::text[]
  END,
  CASE
    WHEN day_num BETWEEN 12 AND 15 THEN 'Fase de ovulación - ligero malestar'
    ELSE 'Fase folicular óptima'
  END,
  NOW(),
  NOW()
FROM generate_series(6, 13) AS day_num;

-- Días 15-21 (31 enero - 6 febrero) - Fase lútea temprana
INSERT INTO app.menstrual_daily_log (
  user_id, log_date, is_period_day, pain_level, energy_level, sleep_quality, mood, symptoms, notes, created_at, updated_at
)
SELECT
  39,
  DATE '2026-01-17' + (day_num || ' days')::interval,
  false,
  1,  -- Dolor mínimo
  4,  -- Energía buena
  4,  -- Sueño bueno
  'calm',
  ARRAY[]::text[],
  'Fase lútea - estado normal',
  NOW(),
  NOW()
FROM generate_series(14, 20) AS day_num;

-- Días 22-27 (7-12 febrero) - Fase lútea tardía (SPM)
INSERT INTO app.menstrual_daily_log (
  user_id, log_date, is_period_day, pain_level, energy_level, sleep_quality, mood, symptoms, notes, created_at, updated_at
)
SELECT
  39,
  DATE '2026-01-17' + (day_num || ' days')::interval,
  false,
  CASE
    WHEN day_num >= 25 THEN 4  -- SPM: dolor moderado
    WHEN day_num >= 23 THEN 3
    ELSE 2
  END,
  CASE
    WHEN day_num >= 25 THEN 2  -- SPM: energía baja
    WHEN day_num >= 23 THEN 3
    ELSE 4
  END,
  CASE
    WHEN day_num >= 25 THEN 3  -- SPM: sueño afectado
    WHEN day_num >= 23 THEN 4
    ELSE 4
  END,
  CASE
    WHEN day_num >= 25 THEN 'irritable'
    WHEN day_num >= 23 THEN 'tired'
    ELSE 'calm'
  END,
  CASE
    WHEN day_num >= 25 THEN ARRAY['cramps', 'bloating', 'breast_tenderness', 'headache']
    WHEN day_num >= 23 THEN ARRAY['bloating', 'breast_tenderness']
    ELSE ARRAY['bloating']
  END,
  CASE
    WHEN day_num >= 25 THEN 'SPM intenso - próximo período cercano'
    WHEN day_num >= 23 THEN 'SPM moderado'
    ELSE 'Fase lútea tardía'
  END,
  NOW(),
  NOW()
FROM generate_series(21, 27) AS day_num;

-- =====================================================
-- PASO 5: Registrar día actual (1 febrero = día 16 del ciclo)
-- =====================================================

INSERT INTO app.menstrual_daily_log (
  user_id, log_date, is_period_day, pain_level, energy_level, sleep_quality, mood, symptoms, notes, created_at, updated_at
) VALUES (
  39, '2026-02-01', false, 1, 4, 4, 'calm', ARRAY[]::text[],
  'Día 16 - Fase lútea temprana, estado normal', NOW(), NOW()
)
ON CONFLICT (user_id, log_date)
DO UPDATE SET
  pain_level = EXCLUDED.pain_level,
  energy_level = EXCLUDED.energy_level,
  sleep_quality = EXCLUDED.sleep_quality,
  mood = EXCLUDED.mood,
  symptoms = EXCLUDED.symptoms,
  notes = EXCLUDED.notes,
  updated_at = NOW();

-- =====================================================
-- VERIFICACIÓN: Ver configuración y logs creados
-- =====================================================

DO $$
DECLARE
  config_count INTEGER;
  logs_count INTEGER;
  period_days_count INTEGER;
  last_period DATE;
  today_cycle_day INTEGER;
BEGIN
  -- Contar configuración
  SELECT COUNT(*) INTO config_count
  FROM app.user_menstrual_config
  WHERE user_id = 39;

  -- Contar logs
  SELECT COUNT(*) INTO logs_count
  FROM app.menstrual_daily_log
  WHERE user_id = 39;

  -- Contar días de período
  SELECT COUNT(*) INTO period_days_count
  FROM app.menstrual_daily_log
  WHERE user_id = 39 AND is_period_day = true;

  -- Obtener último período y calcular día del ciclo actual
  SELECT last_period_start INTO last_period
  FROM app.user_menstrual_config
  WHERE user_id = 39;

  today_cycle_day := (DATE '2026-02-01' - last_period) + 1;

  -- Mostrar resumen
  RAISE NOTICE '✅ Configuración del ciclo menstrual de María completada:';
  RAISE NOTICE '   - Configuraciones creadas: %', config_count;
  RAISE NOTICE '   - Logs diarios creados: %', logs_count;
  RAISE NOTICE '   - Días de período registrados: %', period_days_count;
  RAISE NOTICE '   - Último período: %', last_period;
  RAISE NOTICE '   - Día del ciclo ACTUAL (1 feb 2026): Día %', today_cycle_day;
  RAISE NOTICE '   - Próximo período esperado: % (día 29 del ciclo)', last_period + INTERVAL '28 days';

  IF config_count = 0 THEN
    RAISE WARNING '⚠️ No se creó configuración del ciclo';
  END IF;

  IF logs_count < 15 THEN
    RAISE WARNING '⚠️ Se crearon menos logs de los esperados';
  END IF;
END $$;

-- =====================================================
-- FIN DEL SCRIPT
-- =====================================================
