-- Parche 07: baremos REALES de Bomberos, alineados con la ficha BomberosPruebas.js.
-- Fuente de los umbrales 'apto': Comunidad de Madrid (natación 50m ~51s, trepa,
-- press banca 40kg/60s, velocidad, 2000m) + Ayto. de Madrid + estándares de
-- consorcios para pruebas que Madrid no incluye (dominadas, balón, apnea).
-- Orientativos: cada convocatoria fija sus marcas. Solo filas Oficial.

UPDATE app."Ejercicios_Bomberos" SET baremo_hombres='< 51 seg', baremo_mujeres='< 53 seg', updated_at=now() WHERE exercise_id=1;   -- Natación 50m
UPDATE app."Ejercicios_Bomberos" SET baremo_hombres='< 1:45 min', baremo_mujeres='< 1:55 min', updated_at=now() WHERE exercise_id=2; -- Natación 100m
UPDATE app."Ejercicios_Bomberos" SET baremo_hombres='Completar (< 30 seg)', baremo_mujeres='Completar (< 35 seg)', updated_at=now() WHERE exercise_id=3; -- Buceo/Apnea 25m
UPDATE app."Ejercicios_Bomberos" SET baremo_hombres='< 12 seg', updated_at=now() WHERE exercise_id=8;   -- Trepa 6m (H)
UPDATE app."Ejercicios_Bomberos" SET baremo_mujeres='< 15 seg', updated_at=now() WHERE exercise_id=9;   -- Trepa 5.5m (M)
UPDATE app."Ejercicios_Bomberos" SET baremo_hombres='> 12 reps', baremo_mujeres='> 8 reps', updated_at=now() WHERE exercise_id=14; -- Dominadas 30s
UPDATE app."Ejercicios_Bomberos" SET baremo_hombres='< 14 seg', baremo_mujeres='< 16 seg', updated_at=now() WHERE exercise_id=19; -- Carrera 100m
UPDATE app."Ejercicios_Bomberos" SET baremo_hombres='< 30 seg', baremo_mujeres='< 34 seg', updated_at=now() WHERE exercise_id=20; -- Carrera 200m
UPDATE app."Ejercicios_Bomberos" SET baremo_hombres='< 12:30 min', baremo_mujeres='< 14:30 min', updated_at=now() WHERE exercise_id=24; -- Carrera 2800m
UPDATE app."Ejercicios_Bomberos" SET baremo_hombres='< 13:00 min', baremo_mujeres='< 15:30 min', updated_at=now() WHERE exercise_id=25; -- Carrera 3000m
UPDATE app."Ejercicios_Bomberos" SET baremo_hombres='> 19 reps (40 kg, 60 seg)', updated_at=now() WHERE exercise_id=29; -- Press banca 40kg (H)
UPDATE app."Ejercicios_Bomberos" SET baremo_mujeres='> 15 reps (30 kg, 60 seg)', updated_at=now() WHERE exercise_id=30; -- Press banca 30kg (M)
UPDATE app."Ejercicios_Bomberos" SET baremo_hombres='> 17 reps', baremo_mujeres='> 15 reps', updated_at=now() WHERE exercise_id=33; -- Flexiones máximas
UPDATE app."Ejercicios_Bomberos" SET baremo_hombres='> 7 m', updated_at=now() WHERE exercise_id=37;  -- Lanzamiento 5kg (H)
UPDATE app."Ejercicios_Bomberos" SET baremo_mujeres='> 7 m', updated_at=now() WHERE exercise_id=38;  -- Lanzamiento 3kg (M)

-- Verificación:
-- select nombre, baremo_hombres, baremo_mujeres from app."Ejercicios_Bomberos" where tipo_prueba='Oficial' order by exercise_id;
