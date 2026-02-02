-- =====================================================
-- SCRIPT: Simular Diferentes Días del Ciclo Menstrual
-- Para testing del sistema de filtrado de ejercicios
-- =====================================================

-- USO:
-- 1. Ejecutar uno de los bloques según el día que quieras simular
-- 2. Recargar la sesión en la app para ver los cambios
-- 3. Verificar filtrado de ejercicios en la UI

-- =====================================================
-- ESCENARIO 1: Día 1 del Período (Dolor Máximo)
-- =====================================================

-- Simular "hoy" como día 1 del período
DO $$
BEGIN
  -- Actualizar fecha del último período para que HOY sea día 1
  UPDATE app.user_menstrual_config
  SET last_period_start = CURRENT_DATE
  WHERE user_id = 39;

  -- Registrar log del día con dolor alto
  INSERT INTO app.menstrual_daily_log (
    user_id, log_date, is_period_day, pain_level, energy_level, sleep_quality, mood, bloating, notes, created_at
  ) VALUES (
    39, CURRENT_DATE, true, 5, 1, 2, 1, 5, 'Simulación: Día 1 - Dolor máximo', NOW()
  )
  ON CONFLICT (user_id, log_date) DO UPDATE SET
    is_period_day = true,
    pain_level = 5,
    energy_level = 1,
    sleep_quality = 2,
    mood = 1,
    bloating = 5,
    notes = 'Simulación: Día 1 - Dolor máximo';

  RAISE NOTICE '✅ Simulación aplicada: HOY = Día 1 del período (dolor máximo)';
  RAISE NOTICE '   Cargar sesión D3 → Debería reemplazar 3 ejercicios';
END $$;

-- =====================================================
-- ESCENARIO 2: Día 3 del Período (Dolor Moderado)
-- =====================================================

-- Simular "hoy" como día 3 del período
DO $$
BEGIN
  -- Actualizar fecha del último período para que HOY sea día 3
  UPDATE app.user_menstrual_config
  SET last_period_start = CURRENT_DATE - INTERVAL '2 days'
  WHERE user_id = 39;

  -- Registrar log del día con dolor moderado
  INSERT INTO app.menstrual_daily_log (
    user_id, log_date, is_period_day, pain_level, energy_level, sleep_quality, mood, bloating, notes, created_at
  ) VALUES (
    39, CURRENT_DATE, true, 4, 3, 4, 3, 4, 'Simulación: Día 3 - Mejorando', NOW()
  )
  ON CONFLICT (user_id, log_date) DO UPDATE SET
    is_period_day = true,
    pain_level = 4,
    energy_level = 3,
    sleep_quality = 4,
    mood = 3,
    bloating = 4,
    notes = 'Simulación: Día 3 - Mejorando';

  RAISE NOTICE '✅ Simulación aplicada: HOY = Día 3 del período (dolor moderado)';
  RAISE NOTICE '   Cargar sesión D3 → Debería reemplazar 2-3 ejercicios';
END $$;

-- =====================================================
-- ESCENARIO 3: Fase Folicular (Día 10 - Estado Óptimo)
-- =====================================================

-- Simular "hoy" como día 10 del ciclo (fase folicular)
DO $$
BEGIN
  -- Actualizar fecha del último período para que HOY sea día 10
  UPDATE app.user_menstrual_config
  SET last_period_start = CURRENT_DATE - INTERVAL '9 days'
  WHERE user_id = 39;

  -- Registrar log del día con estado óptimo
  INSERT INTO app.menstrual_daily_log (
    user_id, log_date, is_period_day, pain_level, energy_level, sleep_quality, mood, bloating, notes, created_at
  ) VALUES (
    39, CURRENT_DATE, false, 1, 5, 5, 5, 1, 'Simulación: Día 10 - Fase folicular óptima', NOW()
  )
  ON CONFLICT (user_id, log_date) DO UPDATE SET
    is_period_day = false,
    pain_level = 1,
    energy_level = 5,
    sleep_quality = 5,
    mood = 5,
    bloating = 1,
    notes = 'Simulación: Día 10 - Fase folicular óptima';

  RAISE NOTICE '✅ Simulación aplicada: HOY = Día 10 (fase folicular)';
  RAISE NOTICE '   Cargar sesión D3 → NO debería filtrar ejercicios';
END $$;

-- =====================================================
-- ESCENARIO 4: SPM (Día 26 - Premenstrual)
-- =====================================================

-- Simular "hoy" como día 26 del ciclo (SPM)
DO $$
BEGIN
  -- Actualizar fecha del último período para que HOY sea día 26
  UPDATE app.user_menstrual_config
  SET last_period_start = CURRENT_DATE - INTERVAL '25 days'
  WHERE user_id = 39;

  -- Registrar log del día con síntomas de SPM
  INSERT INTO app.menstrual_daily_log (
    user_id, log_date, is_period_day, pain_level, energy_level, sleep_quality, mood, bloating, notes, created_at
  ) VALUES (
    39, CURRENT_DATE, false, 4, 2, 3, 2, 5, 'Simulación: Día 26 - SPM intenso', NOW()
  )
  ON CONFLICT (user_id, log_date) DO UPDATE SET
    is_period_day = false,
    pain_level = 4,
    energy_level = 2,
    sleep_quality = 3,
    mood = 2,
    bloating = 5,
    notes = 'Simulación: Día 26 - SPM intenso';

  RAISE NOTICE '✅ Simulación aplicada: HOY = Día 26 (SPM)';
  RAISE NOTICE '   Cargar sesión D3 → Debería reemplazar ejercicios (dolor alto)';
END $$;

-- =====================================================
-- ESCENARIO 5: RESET - Volver a Configuración Original
-- =====================================================

-- Restaurar configuración original (17 enero como último período)
DO $$
BEGIN
  -- Restaurar fecha original del período
  UPDATE app.user_menstrual_config
  SET last_period_start = '2026-01-17'
  WHERE user_id = 39;

  -- Limpiar log de hoy si existe
  DELETE FROM app.menstrual_daily_log
  WHERE user_id = 39 AND log_date = CURRENT_DATE;

  RAISE NOTICE '✅ Reset aplicado: Volviendo a configuración original';
  RAISE NOTICE '   Último período: 17 de enero de 2026';
  RAISE NOTICE '   HOY = Día % del ciclo', (CURRENT_DATE - DATE '2026-01-17') + 1;
END $$;

-- =====================================================
-- QUERY DE VERIFICACIÓN
-- =====================================================

-- Ejecutar después de cada simulación para verificar
SELECT
  'VERIFICACIÓN' as seccion,
  last_period_start as ultimo_periodo,
  (CURRENT_DATE - last_period_start) + 1 as dia_ciclo_hoy,
  CASE
    WHEN (CURRENT_DATE - last_period_start) + 1 <= 4 THEN 'menstrual'
    WHEN (CURRENT_DATE - last_period_start) + 1 <= 14 THEN 'follicular'
    WHEN (CURRENT_DATE - last_period_start) + 1 <= 17 THEN 'ovulation'
    WHEN (CURRENT_DATE - last_period_start) + 1 >= 25 THEN 'late_luteal (SPM)'
    ELSE 'luteal'
  END as fase_actual
FROM app.user_menstrual_config
WHERE user_id = 39;

-- Ver log de hoy
SELECT
  log_date,
  is_period_day,
  pain_level,
  energy_level,
  mood,
  notes
FROM app.menstrual_daily_log
WHERE user_id = 39 AND log_date = CURRENT_DATE;

-- =====================================================
-- EJEMPLOS DE USO
-- =====================================================

/*

EJEMPLO 1: Probar filtrado en día de menstruación

1. Ejecutar Escenario 1 (Día 1 del período)
2. Abrir app con María
3. Ir a Rutinas → Sesión D3
4. Verificar:
   ✓ Banner: "Malestar alto. Reducimos impacto y volumen."
   ✓ "3 ejercicio(s) reemplazado(s)"
   ✓ Badge verde "✓ Adaptado" en ejercicios
5. Ejecutar Escenario 5 (Reset) cuando termines

EJEMPLO 2: Probar sin filtrado en fase óptima

1. Ejecutar Escenario 3 (Día 10 - Fase folicular)
2. Abrir app con María
3. Ir a Rutinas → Sesión D3
4. Verificar:
   ✓ NO hay banner de ajuste menstrual
   ✓ Ejercicios originales sin modificaciones
   ✓ Sin badges de adaptación
5. Ejecutar Escenario 5 (Reset) cuando termines

EJEMPLO 3: Probar SPM (premenstrual)

1. Ejecutar Escenario 4 (Día 26 - SPM)
2. Abrir app con María
3. Ir a Rutinas → Sesión D3
4. Verificar:
   ✓ Banner de ajuste por dolor alto
   ✓ Ejercicios reemplazados
5. Ejecutar Escenario 5 (Reset) cuando termines

*/
