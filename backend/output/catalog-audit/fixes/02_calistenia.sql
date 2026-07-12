-- Parche catálogo · disciplina calistenia (ids 1-65)
-- Tarea 1: descanso_seg coherente por tipo/nivel.
-- Tarea 2: progresion_desde/progresion_hacia normalizados a nombres reales del catálogo (o NULL).

-- ===== Empuje horizontal =====
UPDATE app.ejercicios SET descanso_seg=60, progresion_desde=NULL, progresion_hacia='Flexión inclinada', updated_at=now() WHERE id=47; -- Flexión contra pared
UPDATE app.ejercicios SET descanso_seg=60, progresion_desde='Flexión contra pared', progresion_hacia='Flexión en rodillas', updated_at=now() WHERE id=48; -- Flexión inclinada
UPDATE app.ejercicios SET descanso_seg=60, progresion_desde='Flexión inclinada', progresion_hacia='Flexión estándar', updated_at=now() WHERE id=49; -- Flexión en rodillas
UPDATE app.ejercicios SET descanso_seg=45, progresion_desde=NULL, progresion_hacia='Flexión estándar', updated_at=now() WHERE id=50; -- Flexión escapular
UPDATE app.ejercicios SET descanso_seg=90, progresion_desde='Flexión en rodillas', progresion_hacia='Flexión diamante', updated_at=now() WHERE id=2; -- Flexión estándar
UPDATE app.ejercicios SET descanso_seg=90, progresion_desde='Flexión estándar', progresion_hacia='Flexión archer', updated_at=now() WHERE id=3; -- Flexión diamante
UPDATE app.ejercicios SET descanso_seg=90, progresion_desde='Flexión estándar', progresion_hacia='Flexión archer', updated_at=now() WHERE id=4; -- Flexión declinada
UPDATE app.ejercicios SET descanso_seg=120, progresion_desde='Flexión declinada', progresion_hacia='Flexión a una mano', updated_at=now() WHERE id=5; -- Flexión archer
UPDATE app.ejercicios SET descanso_seg=150, progresion_desde='Flexión archer', progresion_hacia=NULL, updated_at=now() WHERE id=25; -- Flexión a una mano
UPDATE app.ejercicios SET descanso_seg=120, progresion_desde='Flexión estándar', progresion_hacia=NULL, updated_at=now() WHERE id=26; -- Flexión pliométrica

-- ===== Empuje adelantado / planche =====
UPDATE app.ejercicios SET descanso_seg=120, progresion_desde='Flexión declinada', progresion_hacia='Planche lean avanzada', updated_at=now() WHERE id=6; -- Pseudo planche push-up
UPDATE app.ejercicios SET descanso_seg=150, progresion_desde='Pseudo planche push-up', progresion_hacia='Tuck planche', updated_at=now() WHERE id=29; -- Planche lean avanzada
UPDATE app.ejercicios SET descanso_seg=150, progresion_desde='Planche lean avanzada', progresion_hacia=NULL, updated_at=now() WHERE id=30; -- Tuck planche

-- ===== Empuje vertical / handstand =====
UPDATE app.ejercicios SET descanso_seg=60, progresion_desde=NULL, progresion_hacia='Pike push-up', updated_at=now() WHERE id=64; -- Pike hold básico
UPDATE app.ejercicios SET descanso_seg=90, progresion_desde='Pike hold básico', progresion_hacia='Handstand push-up', updated_at=now() WHERE id=1; -- Pike push-up
UPDATE app.ejercicios SET descanso_seg=150, progresion_desde='Pike push-up', progresion_hacia=NULL, updated_at=now() WHERE id=27; -- Handstand push-up
UPDATE app.ejercicios SET descanso_seg=90, progresion_desde='Pike push-up', progresion_hacia='Handstand libre', updated_at=now() WHERE id=23; -- Handstand asistido a pared
UPDATE app.ejercicios SET descanso_seg=120, progresion_desde='Handstand asistido a pared', progresion_hacia=NULL, updated_at=now() WHERE id=28; -- Handstand libre
UPDATE app.ejercicios SET descanso_seg=90, progresion_desde=NULL, progresion_hacia='Handstand asistido a pared', updated_at=now() WHERE id=24; -- Crow pose

-- ===== Fondos =====
UPDATE app.ejercicios SET descanso_seg=60, progresion_desde=NULL, progresion_hacia='Fondos en paralelas', updated_at=now() WHERE id=65; -- Soporte en paralelas con pies apoyados
UPDATE app.ejercicios SET descanso_seg=120, progresion_desde='Soporte en paralelas con pies apoyados', progresion_hacia='Explosive dips / Dips en anillas', updated_at=now() WHERE id=7; -- Fondos en paralelas
UPDATE app.ejercicios SET descanso_seg=150, progresion_desde='Fondos en paralelas', progresion_hacia=NULL, updated_at=now() WHERE id=46; -- Explosive dips / Dips en anillas

-- ===== Tracción horizontal =====
UPDATE app.ejercicios SET descanso_seg=60, progresion_desde=NULL, progresion_hacia='Remo invertido piernas estiradas', updated_at=now() WHERE id=61; -- Remo invertido rodillas flexionadas
UPDATE app.ejercicios SET descanso_seg=90, progresion_desde='Remo invertido rodillas flexionadas', progresion_hacia='Remo invertido pies elevados', updated_at=now() WHERE id=8; -- Remo invertido piernas estiradas
UPDATE app.ejercicios SET descanso_seg=90, progresion_desde='Remo invertido piernas estiradas', progresion_hacia=NULL, updated_at=now() WHERE id=10; -- Remo invertido pies elevados

-- ===== Tracción vertical =====
UPDATE app.ejercicios SET descanso_seg=60, progresion_desde=NULL, progresion_hacia='Scap pull', updated_at=now() WHERE id=62; -- Dead hang
UPDATE app.ejercicios SET descanso_seg=60, progresion_desde='Dead hang', progresion_hacia='Dominadas negativas controladas', updated_at=now() WHERE id=63; -- Scap pull
UPDATE app.ejercicios SET descanso_seg=90, progresion_desde='Scap pull', progresion_hacia='Dominada pronación', updated_at=now() WHERE id=13; -- Dominadas negativas controladas
UPDATE app.ejercicios SET descanso_seg=120, progresion_desde='Dominadas negativas controladas', progresion_hacia='Archer pull-up / Typewriter', updated_at=now() WHERE id=11; -- Dominada pronación
UPDATE app.ejercicios SET descanso_seg=120, progresion_desde='Dominadas negativas controladas', progresion_hacia='Archer pull-up / Typewriter', updated_at=now() WHERE id=12; -- Chin-up
UPDATE app.ejercicios SET descanso_seg=150, progresion_desde='Dominada pronación', progresion_hacia='Muscle-up en barra', updated_at=now() WHERE id=31; -- Dominada explosiva
UPDATE app.ejercicios SET descanso_seg=150, progresion_desde='Dominada pronación', progresion_hacia='One-arm chin-up', updated_at=now() WHERE id=32; -- Archer pull-up / Typewriter
UPDATE app.ejercicios SET descanso_seg=180, progresion_desde='Archer pull-up / Typewriter', progresion_hacia=NULL, updated_at=now() WHERE id=33; -- One-arm chin-up
UPDATE app.ejercicios SET descanso_seg=180, progresion_desde='Dominada explosiva', progresion_hacia='Muscle-up en anillas', updated_at=now() WHERE id=34; -- Muscle-up en barra
UPDATE app.ejercicios SET descanso_seg=180, progresion_desde='Muscle-up en barra', progresion_hacia=NULL, updated_at=now() WHERE id=35; -- Muscle-up en anillas

-- ===== Estáticos avanzados =====
UPDATE app.ejercicios SET descanso_seg=150, progresion_desde='Toes-to-bar', progresion_hacia=NULL, updated_at=now() WHERE id=36; -- Front lever – advanced tuck/straddle
UPDATE app.ejercicios SET descanso_seg=150, progresion_desde=NULL, progresion_hacia=NULL, updated_at=now() WHERE id=37; -- Back lever – advanced tuck/straddle
UPDATE app.ejercicios SET descanso_seg=150, progresion_desde=NULL, progresion_hacia=NULL, updated_at=now() WHERE id=38; -- Human flag

-- ===== Core =====
UPDATE app.ejercicios SET descanso_seg=45, progresion_desde=NULL, progresion_hacia='Hollow body tuck', updated_at=now() WHERE id=54; -- Dead bug
UPDATE app.ejercicios SET descanso_seg=60, progresion_desde='Dead bug', progresion_hacia='Hollow body', updated_at=now() WHERE id=53; -- Hollow body tuck
UPDATE app.ejercicios SET descanso_seg=60, progresion_desde='Hollow body tuck', progresion_hacia='Dragon flag 3-8 reps', updated_at=now() WHERE id=17; -- Hollow body
UPDATE app.ejercicios SET descanso_seg=120, progresion_desde='Hollow body', progresion_hacia=NULL, updated_at=now() WHERE id=39; -- Dragon flag 3-8 reps
UPDATE app.ejercicios SET descanso_seg=60, progresion_desde=NULL, progresion_hacia=NULL, updated_at=now() WHERE id=51; -- Plancha frontal
UPDATE app.ejercicios SET descanso_seg=60, progresion_desde=NULL, progresion_hacia=NULL, updated_at=now() WHERE id=52; -- Plancha lateral
UPDATE app.ejercicios SET descanso_seg=45, progresion_desde=NULL, progresion_hacia=NULL, updated_at=now() WHERE id=9; -- Superman hold suave
UPDATE app.ejercicios SET descanso_seg=60, progresion_desde='Dead hang', progresion_hacia='Hanging leg raises', updated_at=now() WHERE id=14; -- Hanging knee raises
UPDATE app.ejercicios SET descanso_seg=90, progresion_desde='Hanging knee raises', progresion_hacia='Toes-to-bar', updated_at=now() WHERE id=15; -- Hanging leg raises
UPDATE app.ejercicios SET descanso_seg=120, progresion_desde='Hanging leg raises', progresion_hacia='Front lever – advanced tuck/straddle', updated_at=now() WHERE id=45; -- Toes-to-bar
UPDATE app.ejercicios SET descanso_seg=90, progresion_desde='Soporte en paralelas con pies apoyados', progresion_hacia='L-sit', updated_at=now() WHERE id=16; -- L-sit tuck en paralelas
UPDATE app.ejercicios SET descanso_seg=120, progresion_desde='L-sit tuck en paralelas', progresion_hacia='V-sit', updated_at=now() WHERE id=40; -- L-sit
UPDATE app.ejercicios SET descanso_seg=150, progresion_desde='L-sit', progresion_hacia=NULL, updated_at=now() WHERE id=41; -- V-sit

-- ===== Piernas: sentadilla =====
UPDATE app.ejercicios SET descanso_seg=60, progresion_desde=NULL, progresion_hacia='Sentadilla aire', updated_at=now() WHERE id=56; -- Sentadilla a caja/banco
UPDATE app.ejercicios SET descanso_seg=60, progresion_desde='Sentadilla a caja/banco', progresion_hacia='Sentadilla libre profunda', updated_at=now() WHERE id=57; -- Sentadilla aire
UPDATE app.ejercicios SET descanso_seg=90, progresion_desde='Sentadilla aire', progresion_hacia='Pistol squat a caja', updated_at=now() WHERE id=18; -- Sentadilla libre profunda
UPDATE app.ejercicios SET descanso_seg=120, progresion_desde='Sentadilla libre profunda', progresion_hacia='Pistol squat completo', updated_at=now() WHERE id=20; -- Pistol squat a caja
UPDATE app.ejercicios SET descanso_seg=120, progresion_desde='Pistol squat a caja', progresion_hacia=NULL, updated_at=now() WHERE id=42; -- Pistol squat completo

-- ===== Piernas: unilateral / zancada =====
UPDATE app.ejercicios SET descanso_seg=60, progresion_desde=NULL, progresion_hacia='Bulgarian split squat', updated_at=now() WHERE id=58; -- Zancada asistida
UPDATE app.ejercicios SET descanso_seg=60, progresion_desde=NULL, progresion_hacia='Bulgarian split squat', updated_at=now() WHERE id=59; -- Step-up bajo
UPDATE app.ejercicios SET descanso_seg=90, progresion_desde='Zancada asistida', progresion_hacia='Shrimp squat avanzado', updated_at=now() WHERE id=19; -- Bulgarian split squat
UPDATE app.ejercicios SET descanso_seg=120, progresion_desde='Bulgarian split squat', progresion_hacia=NULL, updated_at=now() WHERE id=43; -- Shrimp squat avanzado

-- ===== Piernas: cadena posterior y gemelos =====
UPDATE app.ejercicios SET descanso_seg=60, progresion_desde=NULL, progresion_hacia='Nordic curl excéntrico', updated_at=now() WHERE id=55; -- Puente de glúteo
UPDATE app.ejercicios SET descanso_seg=120, progresion_desde='Puente de glúteo', progresion_hacia='Nordic curl concéntrico', updated_at=now() WHERE id=21; -- Nordic curl excéntrico
UPDATE app.ejercicios SET descanso_seg=150, progresion_desde='Nordic curl excéntrico', progresion_hacia=NULL, updated_at=now() WHERE id=44; -- Nordic curl concéntrico
UPDATE app.ejercicios SET descanso_seg=60, progresion_desde=NULL, progresion_hacia='Elevación de gemelos a 1 pierna', updated_at=now() WHERE id=60; -- Elevación de gemelos bilateral
UPDATE app.ejercicios SET descanso_seg=60, progresion_desde='Elevación de gemelos bilateral', progresion_hacia=NULL, updated_at=now() WHERE id=22; -- Elevación de gemelos a 1 pierna

-- ===== Verificación (debe devolver 0) =====
-- SELECT count(*) AS refs_rotas
-- FROM (
--   SELECT id, progresion_desde AS ref FROM app.ejercicios WHERE disciplina='calistenia' AND progresion_desde IS NOT NULL
--   UNION ALL
--   SELECT id, progresion_hacia FROM app.ejercicios WHERE disciplina='calistenia' AND progresion_hacia IS NOT NULL
-- ) r
-- WHERE NOT EXISTS (
--   SELECT 1 FROM app.ejercicios e WHERE e.disciplina='calistenia' AND e.nombre = r.ref
-- );

-- Ajuste post-renombrado (03_puntuales renombra 32 y 46)
UPDATE app.ejercicios SET progresion_hacia='Explosive dips', updated_at=now() WHERE id=7 AND disciplina='calistenia';
UPDATE app.ejercicios SET progresion_hacia='Archer pull-up', updated_at=now() WHERE id IN (11,12) AND disciplina='calistenia';
UPDATE app.ejercicios SET progresion_desde='Archer pull-up', progresion_hacia=NULL, updated_at=now() WHERE id=33 AND disciplina='calistenia';
