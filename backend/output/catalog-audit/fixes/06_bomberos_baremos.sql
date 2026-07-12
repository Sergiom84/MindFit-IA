-- Parche 06: Ejercicios_Bomberos — separar semántica del campo baremo.
-- Regla: baremo_hombres/baremo_mujeres SOLO contienen marcas reales de examen
-- (tipo_prueba = 'Oficial'). En Preparatoria/Técnica la prescripción de
-- entrenamiento se consolida en series_reps_objetivo y el baremo pasa a NULL.
-- Verificado: ningún código de backend/frontend consume estas columnas
-- (el frontend usa baremos hardcodeados en BomberosPruebas.js).

-- Filas donde el baremo aportaba información no redundante → se fusiona en series_reps_objetivo
UPDATE app."Ejercicios_Bomberos" SET series_reps_objetivo='3-5 x 60-90 seg', updated_at=now() WHERE exercise_id=6;   -- Apnea estática
UPDATE app."Ejercicios_Bomberos" SET series_reps_objetivo='3-5 x 5-10 reps (H) / 3-8 reps (M)', updated_at=now() WHERE exercise_id=10; -- Dominadas prono
UPDATE app."Ejercicios_Bomberos" SET series_reps_objetivo='3-5 ascensos de 3 m', updated_at=now() WHERE exercise_id=12;  -- Trepa parcial
UPDATE app."Ejercicios_Bomberos" SET series_reps_objetivo='3-4 x 20-40 seg (H) / 15-30 seg (M)', updated_at=now() WHERE exercise_id=13; -- Isométrico cuerda
UPDATE app."Ejercicios_Bomberos" SET series_reps_objetivo='3-4 x 8-12 reps', updated_at=now() WHERE exercise_id=15;  -- Dominadas asistidas
UPDATE app."Ejercicios_Bomberos" SET series_reps_objetivo='3-5 x 5-8 negativas lentas', updated_at=now() WHERE exercise_id=16; -- Negativas
UPDATE app."Ejercicios_Bomberos" SET series_reps_objetivo='4-6 x 5-8 reps', updated_at=now() WHERE exercise_id=17;   -- Dominadas explosivas
UPDATE app."Ejercicios_Bomberos" SET series_reps_objetivo='3-5 series al fallo', updated_at=now() WHERE exercise_id=18; -- Series máximas dominadas
UPDATE app."Ejercicios_Bomberos" SET series_reps_objetivo='30 min variado, 1-2 sesiones/semana', updated_at=now() WHERE exercise_id=28; -- Fartlek
UPDATE app."Ejercicios_Bomberos" SET series_reps_objetivo='4-5 x 5-8 reps', updated_at=now() WHERE exercise_id=31;   -- Press banca fuerza
UPDATE app."Ejercicios_Bomberos" SET series_reps_objetivo='3-4 x 15-20 reps (peso oficial)', updated_at=now() WHERE exercise_id=32; -- Press banca resistencia
UPDATE app."Ejercicios_Bomberos" SET series_reps_objetivo='3-5 x 10-15 reps', updated_at=now() WHERE exercise_id=34; -- Flexiones estándar
UPDATE app."Ejercicios_Bomberos" SET series_reps_objetivo='4-5 x 8-12 reps', updated_at=now() WHERE exercise_id=35;  -- Flexiones explosivas
UPDATE app."Ejercicios_Bomberos" SET series_reps_objetivo='3-4 series al fallo', updated_at=now() WHERE exercise_id=36; -- Series máximas flexiones
UPDATE app."Ejercicios_Bomberos" SET series_reps_objetivo='3-4 x 10-15 lanzamientos técnicos', updated_at=now() WHERE exercise_id=39; -- Técnica lanzamiento
UPDATE app."Ejercicios_Bomberos" SET series_reps_objetivo='4-5 x 5-8 lanzamientos máximos', updated_at=now() WHERE exercise_id=40;  -- Lanzamientos potencia
UPDATE app."Ejercicios_Bomberos" SET series_reps_objetivo='3-4 x 60-120 seg (H) / 45-90 seg (M)', updated_at=now() WHERE exercise_id=41; -- Plancha
UPDATE app."Ejercicios_Bomberos" SET series_reps_objetivo='3-4 x 15-20 reps (H) / 12-18 reps (M)', updated_at=now() WHERE exercise_id=42; -- Burpees
UPDATE app."Ejercicios_Bomberos" SET series_reps_objetivo='3-4 x 20-30 reps', updated_at=now() WHERE exercise_id=43; -- Sentadillas

-- Anular baremos en todas las filas no oficiales (la prescripción ya vive en series_reps_objetivo)
UPDATE app."Ejercicios_Bomberos"
SET baremo_hombres=NULL, baremo_mujeres=NULL, updated_at=now()
WHERE tipo_prueba <> 'Oficial';

-- Verificación (debe devolver 0):
-- select count(*) from app."Ejercicios_Bomberos" where tipo_prueba <> 'Oficial' and (baremo_hombres is not null or baremo_mujeres is not null);
-- select count(*) from app."Ejercicios_Bomberos" where tipo_prueba = 'Oficial' and baremo_hombres is null and baremo_mujeres is null;
