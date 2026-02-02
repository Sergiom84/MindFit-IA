-- =====================================================
-- MIGRACIÓN: Sistema de restricciones de ejercicios por ciclo menstrual
-- Fecha: 2026-02-01
-- Objetivo: Añadir columnas para gestionar ejercicios desaconsejados durante menstruación
-- =====================================================

-- =====================================================
-- PASO 1: Añadir columnas a la tabla de ejercicios
-- =====================================================

-- PASO 1A: Añadir PRIMARY KEY a exercise_id (necesario para la FK)
ALTER TABLE app."Ejercicios_Hipertrofia"
ADD CONSTRAINT pk_ejercicios_hipertrofia PRIMARY KEY (exercise_id);

-- PASO 1B: Añadir columnas de restricción menstrual
ALTER TABLE app."Ejercicios_Hipertrofia"
ADD COLUMN IF NOT EXISTS menstrual_restriction VARCHAR(20) DEFAULT 'none'
  CHECK (menstrual_restriction IN ('none', 'avoid', 'modify_intensity')),
ADD COLUMN IF NOT EXISTS menstrual_restriction_reason TEXT,
ADD COLUMN IF NOT EXISTS alternative_exercise_id BIGINT
  REFERENCES app."Ejercicios_Hipertrofia"(exercise_id),
ADD COLUMN IF NOT EXISTS menstrual_notes TEXT;

-- Añadir índice para mejorar performance en queries de filtrado
CREATE INDEX IF NOT EXISTS idx_menstrual_restriction
ON app."Ejercicios_Hipertrofia"(menstrual_restriction)
WHERE menstrual_restriction != 'none';

-- =====================================================
-- PASO 2: ETIQUETAR EJERCICIOS A EVITAR COMPLETAMENTE
-- (12 ejercicios de alto impacto abdominal y pliométricos)
-- =====================================================

-- CORE: Ejercicios abdominales con carga pesada
UPDATE app."Ejercicios_Hipertrofia"
SET
  menstrual_restriction = 'avoid',
  menstrual_restriction_reason = 'Alto impacto abdominal con carga adicional - aumenta presión pélvica e intraabdominal',
  menstrual_notes = 'Evitar durante menstruación (día 1-5) y SPM (últimos 3 días del ciclo). Alto riesgo de dolor pélvico.'
WHERE exercise_id IN (
  67,  -- Crunch con carga (disco en pecho)
  77,  -- Crunches en banco declinado con disco
  100  -- Plank pesado (con disco en espalda)
);

-- CORE: Ejercicios avanzados de tracción abdominal
UPDATE app."Ejercicios_Hipertrofia"
SET
  menstrual_restriction = 'avoid',
  menstrual_restriction_reason = 'Ejercicio de alta tensión abdominal - genera presión intensa en zona pélvica',
  menstrual_notes = 'Evitar durante menstruación y SPM. Sustituir por ejercicios isométricos de baja tensión.'
WHERE exercise_id IN (
  76,  -- Ab Wheel posición avanzada
  68,  -- Rueda abdominal (Ab Wheel) controlada
  87,  -- Dragon Flag (progresión)
  88   -- Dragon Flag completo
);

-- CORE: Ejercicios avanzados de core suspendido
UPDATE app."Ejercicios_Hipertrofia"
SET
  menstrual_restriction = 'avoid',
  menstrual_restriction_reason = 'Ejercicio avanzado con alta activación core y presión abdominal sostenida',
  menstrual_notes = 'Evitar durante menstruación y SPM. Riesgo de fatiga excesiva del suelo pélvico.'
WHERE exercise_id = 98; -- L-Sit ponderado

-- PECHO: Press pesado con pausa (máxima tensión)
UPDATE app."Ejercicios_Hipertrofia"
SET
  menstrual_restriction = 'avoid',
  menstrual_restriction_reason = 'Ejercicio de máxima carga con pausa - requiere esfuerzo máximo y maniobra de Valsalva',
  menstrual_notes = 'Evitar durante menstruación. Usar alternativas con cargas moderadas (60-70% 1RM).'
WHERE exercise_id IN (
  46,  -- Press de banca con pausa
  47,  -- Press inclinado con barra (pesado)
  103  -- Press militar con barra (pesado con pausa)
);

-- HOMBRO: Ejercicios pliométricos/explosivos
UPDATE app."Ejercicios_Hipertrofia"
SET
  menstrual_restriction = 'avoid',
  menstrual_restriction_reason = 'Movimiento explosivo de alta potencia - impacto articular y esfuerzo sistémico elevado',
  menstrual_notes = 'Evitar durante menstruación y dolor alto (pain_level >= 4). Sustituir por ejercicios controlados.'
WHERE exercise_id = 109; -- Snatch Grip High Pull

-- =====================================================
-- PASO 3: ETIQUETAR EJERCICIOS A MODIFICAR INTENSIDAD
-- (6 ejercicios pesados - reducir al 60-70% de carga habitual)
-- =====================================================

-- PIERNAS: Sentadillas pesadas
UPDATE app."Ejercicios_Hipertrofia"
SET
  menstrual_restriction = 'modify_intensity',
  menstrual_restriction_reason = 'Ejercicio de piernas con carga alta - puede generar presión pélvica',
  menstrual_notes = 'Reducir carga al 60-70% durante menstruación. Evitar trabajar al fallo o 1RM.'
WHERE exercise_id IN (
  106, -- Sentadilla olímpica con barra
  59,  -- Sentadilla trasera alta (High Bar)
  60   -- Hack Squat en máquina (pesado)
);

-- PIERNAS: Peso muerto rumano (tracción posterior)
UPDATE app."Ejercicios_Hipertrofia"
SET
  menstrual_restriction = 'modify_intensity',
  menstrual_restriction_reason = 'Ejercicio de cadena posterior con carga alta - requiere estabilización core intensa',
  menstrual_notes = 'Reducir carga al 60-70% durante menstruación. Mantener técnica impecable.'
WHERE exercise_id IN (
  40,  -- Peso muerto rumano (RDL) con barra
  61   -- Peso muerto rumano con mancuernas (pesado)
);

-- PECHO: Press de banca estándar (permitir con reducción)
UPDATE app."Ejercicios_Hipertrofia"
SET
  menstrual_restriction = 'modify_intensity',
  menstrual_restriction_reason = 'Ejercicio compuesto pesado - ajustar carga para evitar sobreesfuerzo',
  menstrual_notes = 'Reducir carga al 60-70% durante menstruación. Evitar series al fallo.'
WHERE exercise_id = 23; -- Press de banca con barra

-- =====================================================
-- PASO 4: MAPEAR EJERCICIOS ALTERNATIVOS SEGUROS
-- (7 mapeos clave de alta a baja intensidad)
-- =====================================================

-- Ab Wheel avanzada → Pallof Press con banda (antirotación sin carga)
UPDATE app."Ejercicios_Hipertrofia"
SET alternative_exercise_id = 73 -- Pallof Press con banda elástica
WHERE exercise_id = 76; -- Ab Wheel posición avanzada

-- Crunch con carga → Dead Bug ponderado (menor presión abdominal)
UPDATE app."Ejercicios_Hipertrofia"
SET alternative_exercise_id = 85 -- Dead Bug ponderado
WHERE exercise_id = 67; -- Crunch con carga (disco en pecho)

-- Dragon Flag completo → Pallof Press en polea (core estabilización)
UPDATE app."Ejercicios_Hipertrofia"
SET alternative_exercise_id = 21 -- Pallof Press en polea
WHERE exercise_id = 88; -- Dragon Flag completo

-- Plank pesado → Crunch en máquina (controlado y guiado)
UPDATE app."Ejercicios_Hipertrofia"
SET alternative_exercise_id = 20 -- Crunch en máquina
WHERE exercise_id = 100; -- Plank pesado (con disco en espalda)

-- Sentadilla olímpica → Sentadilla Goblet (menor carga, mejor control)
UPDATE app."Ejercicios_Hipertrofia"
SET alternative_exercise_id = 74 -- Sentadilla Goblet (control técnico)
WHERE exercise_id = 106; -- Sentadilla olímpica con barra

-- Sentadilla trasera alta → Sentadilla en prensa 45° (soporte lumbar)
UPDATE app."Ejercicios_Hipertrofia"
SET alternative_exercise_id = 13 -- Sentadilla en prensa 45°
WHERE exercise_id = 59; -- Sentadilla trasera alta (High Bar)

-- Press de banca con pausa → Press de pecho en máquina (seguro y controlado)
UPDATE app."Ejercicios_Hipertrofia"
SET alternative_exercise_id = 1 -- Press de pecho en máquina
WHERE exercise_id = 46; -- Press de banca con pausa

-- =====================================================
-- PASO 5: VERIFICACIÓN POST-MIGRACIÓN
-- =====================================================

-- Consulta de verificación: Ver ejercicios etiquetados
DO $$
DECLARE
  total_avoid INTEGER;
  total_modify INTEGER;
  total_alternatives INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_avoid
  FROM app."Ejercicios_Hipertrofia"
  WHERE menstrual_restriction = 'avoid';

  SELECT COUNT(*) INTO total_modify
  FROM app."Ejercicios_Hipertrofia"
  WHERE menstrual_restriction = 'modify_intensity';

  SELECT COUNT(*) INTO total_alternatives
  FROM app."Ejercicios_Hipertrofia"
  WHERE alternative_exercise_id IS NOT NULL;

  RAISE NOTICE '✅ Migración completada exitosamente:';
  RAISE NOTICE '   - Ejercicios a EVITAR: %', total_avoid;
  RAISE NOTICE '   - Ejercicios a MODIFICAR: %', total_modify;
  RAISE NOTICE '   - Alternativas definidas: %', total_alternatives;

  IF total_avoid < 10 THEN
    RAISE WARNING '⚠️ Se esperaban al menos 10 ejercicios marcados como EVITAR';
  END IF;

  IF total_alternatives < 5 THEN
    RAISE WARNING '⚠️ Se esperaban al menos 5 alternativas definidas';
  END IF;
END $$;

-- =====================================================
-- FIN DE MIGRACIÓN
-- =====================================================
