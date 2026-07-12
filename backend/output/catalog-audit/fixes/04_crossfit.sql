-- =====================================================================
-- 04_crossfit.sql — Parche de auditoría para app."Ejercicios_CrossFit"
-- Generado el 2026-07-12 a partir de output/catalog-audit/ejercicios_crossfit.json
-- 120 filas verificadas (exercise_id 1-122, sin 99 ni 119).
-- Sin BEGIN/COMMIT: ejecutar dentro de la transacción que decida el operador.
-- =====================================================================

-- ---------------------------------------------------------------------
-- FIX 1: supports_strength_block = 1 para movimientos de fuerza/halterofilia
-- con barra aptos para bloque de fuerza (squats, pesos muertos, cleans,
-- snatches, presses/jerks, OHS, thrusters pesados). Todos verificados como
-- dominio Weightlifting en el JSON. 30 filas. El resto queda a 0
-- (ya lo está en la tabla). Excluidos a propósito: 43 (Thruster 43/30, peso
-- de metcon), 48 (SDHP 34/25, movimiento de acondicionamiento), 87 (Devil
-- Press con mancuernas) y 89 (zancadas OH, no es levantamiento de bloque).
-- ---------------------------------------------------------------------
UPDATE app."Ejercicios_CrossFit" SET supports_strength_block = 1
WHERE exercise_id IN (12, 14, 16, 44, 45, 46, 47, 52, 53, 54, 55, 56, 81, 82, 83, 84, 85, 86, 88, 90, 91, 92, 108, 109, 110, 111, 112, 113, 114, 115);

-- ---------------------------------------------------------------------
-- FIX 2: time_domain para las 120 filas.
--   sprint   (43): levantamientos pesados/olímpicos, gimnásticos de alta
--                 destreza en series cortas (muscle-ups, HSPU, rope climb,
--                 pino), implementos pesados (Worm, trineo).
--   largo    (3):  carrera suave, remo lento, carrera 5K.
--   variable (15): movimientos válidos en cualquier dominio (burpees,
--                 wall balls, KB swings, air squats, box jumps, double
--                 unders, comba, zancadas, thruster ligero, devil press).
--   medio    (59): resto de cíclicos y movimientos moderados.
-- ---------------------------------------------------------------------
UPDATE app."Ejercicios_CrossFit" SET time_domain = 'sprint'
WHERE exercise_id IN (44, 45, 46, 52, 53, 54, 55, 56, 71, 72, 73, 74, 75, 76, 77, 80, 81, 82, 83, 84, 85, 86, 88, 90, 91, 92, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 120, 122);

UPDATE app."Ejercicios_CrossFit" SET time_domain = 'largo'
WHERE exercise_id IN (17, 19, 117);

UPDATE app."Ejercicios_CrossFit" SET time_domain = 'variable'
WHERE exercise_id IN (3, 8, 11, 15, 20, 22, 34, 35, 42, 43, 49, 50, 60, 62, 87);

UPDATE app."Ejercicios_CrossFit" SET time_domain = 'medio'
WHERE exercise_id IN (1, 2, 4, 5, 6, 7, 9, 10, 12, 13, 14, 16, 18, 21, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 36, 37, 38, 39, 40, 41, 47, 48, 51, 57, 58, 59, 61, 63, 64, 65, 66, 67, 68, 69, 70, 78, 79, 89, 93, 94, 95, 96, 97, 98, 100, 116, 118, 121);

-- ---------------------------------------------------------------------
-- FIX 3a: pairing_tags (vocabulario: squat, hinge, push, pull, vertical,
-- horizontal, core, grip, mono, legs, shoulders, explosivo). CSV en
-- minúsculas. Agrupados por valor para compactar.
-- ---------------------------------------------------------------------
-- Plancha | Abdominales | Aguante en posición hueca | Aguante en posición Superman | Abdominales en V | Abdominales en GHD | Balanceos en posición hueca | L-Sit (anillas/paralelas)
UPDATE app."Ejercicios_CrossFit" SET pairing_tags = 'core' WHERE exercise_id IN (4, 7, 24, 25, 39, 65, 66, 79);

-- Pies a barra | Rodillas a codos | Pies a barra (estrictos)
UPDATE app."Ejercicios_CrossFit" SET pairing_tags = 'core,grip' WHERE exercise_id IN (36, 41, 98);

-- Colgado muerto
UPDATE app."Ejercicios_CrossFit" SET pairing_tags = 'grip' WHERE exercise_id IN (28);

-- Marcha del granjero (pesado)
UPDATE app."Ejercicios_CrossFit" SET pairing_tags = 'grip,core' WHERE exercise_id IN (69);

-- Puente de glúteos | Buenos días con banda | Extensiones de cadera (GHD)
UPDATE app."Ejercicios_CrossFit" SET pairing_tags = 'hinge' WHERE exercise_id IN (26, 29, 67);

-- Balanceo con kettlebell (ruso) | Balanceo con kettlebell (americano, 24/16 kg) | Volteo de neumático en equipo (Worm)
UPDATE app."Ejercicios_CrossFit" SET pairing_tags = 'hinge,explosivo' WHERE exercise_id IN (11, 50, 120);

-- Peso muerto rumano
UPDATE app."Ejercicios_CrossFit" SET pairing_tags = 'hinge,grip' WHERE exercise_id IN (12);

-- Peso muerto (102/70 kg) | Peso muerto sumo + jalón alto (34/25 kg) | Peso muerto (pesado, 143/102 kg) | Peso muerto (esfuerzo máximo, 180+/136+ kg)
UPDATE app."Ejercicios_CrossFit" SET pairing_tags = 'hinge,pull' WHERE exercise_id IN (46, 48, 90, 112);

-- Power Clean | Power Snatch desde colgado | Snatch con mancuerna | Snatch completo (61/43 kg) | Snatch (competición, 84/61 kg) | Power Snatch (toque y sigue, 61/43 kg)
UPDATE app."Ejercicios_CrossFit" SET pairing_tags = 'hinge,pull,explosivo' WHERE exercise_id IN (44, 45, 51, 81, 108, 115);

-- Clean & Jerk | Clean & Jerk (pesado, 84/61 kg) | Devil Press (pesado, mancuernas 22,5/15 kg) | Clean & Jerk (competición, 111/84 kg)
UPDATE app."Ejercicios_CrossFit" SET pairing_tags = 'hinge,push,explosivo' WHERE exercise_id IN (52, 86, 87, 109);

-- Clean en sentadilla desde colgado | Snatch en sentadilla (pesado) | Clean en sentadilla (pesado, 84/61 kg) | Snatch en sentadilla desde colgado
UPDATE app."Ejercicios_CrossFit" SET pairing_tags = 'hinge,squat,explosivo' WHERE exercise_id IN (56, 82, 83, 91);

-- Cluster (61/43 kg) | Complejo: Clean en sentadilla + Sentadilla frontal + Jerk
UPDATE app."Ejercicios_CrossFit" SET pairing_tags = 'hinge,squat,push' WHERE exercise_id IN (88, 114);

-- Subidas a cajón
UPDATE app."Ejercicios_CrossFit" SET pairing_tags = 'legs' WHERE exercise_id IN (6);

-- Saltos a cajón (24"/20")
UPDATE app."Ejercicios_CrossFit" SET pairing_tags = 'legs,explosivo' WHERE exercise_id IN (34);

-- Empuje de trineo (Sled Push)
UPDATE app."Ejercicios_CrossFit" SET pairing_tags = 'legs,push' WHERE exercise_id IN (122);

-- Zancadas caminando con peso sobre cabeza (pesado)
UPDATE app."Ejercicios_CrossFit" SET pairing_tags = 'legs,shoulders' WHERE exercise_id IN (89);

-- Zancadas caminando
UPDATE app."Ejercicios_CrossFit" SET pairing_tags = 'legs,squat' WHERE exercise_id IN (22);

-- Saltos de tijera | Assault Bike (ritmo moderado) | Carrera (ritmo suave) | Comba (saltos simples) | Subidas a cajón (cardio) | Assault Bike (20/15 cal) | Carrera (400m-800m) | Doble salto a la comba | Subidas a cajón (rápidas, 24/20") | Carreras de ida y vuelta (25 pies) | Assault Bike (50/35 cal) | Carrera (1 milla) | Triple salto a la comba | Carrera (5K) | Assault Bike (100 cal)
UPDATE app."Ejercicios_CrossFit" SET pairing_tags = 'mono,legs' WHERE exercise_id IN (5, 18, 19, 20, 23, 58, 59, 60, 63, 64, 94, 95, 96, 117, 118);

-- Remo (ritmo lento) | Ski Erg (moderado) | Remo (ritmo moderado, 500m) | Ski Erg (500m) | Remo (ritmo rápido, 1000m) | Ski Erg (1000m) | Remo (ritmo élite, 2000m)
UPDATE app."Ejercicios_CrossFit" SET pairing_tags = 'mono,pull' WHERE exercise_id IN (17, 21, 57, 61, 93, 97, 116);

-- Dominadas escapulares | Escalada de cuerda (15 pies) | Escalada de cuerda sin piernas | Escalada de clavijas (Pegboard)
UPDATE app."Ejercicios_CrossFit" SET pairing_tags = 'pull,grip' WHERE exercise_id IN (30, 75, 102, 104);

-- Remo en anillas | Remo con mancuerna
UPDATE app."Ejercicios_CrossFit" SET pairing_tags = 'pull,horizontal' WHERE exercise_id IN (1, 13);

-- Muscle-Up en barra a L-Sit
UPDATE app."Ejercicios_CrossFit" SET pairing_tags = 'pull,push,core' WHERE exercise_id IN (107);

-- Muscle-Ups en barra | Muscle-Ups en anillas | Muscle-Ups estrictos | Burpee + Muscle-Up en barra | Muscle-Ups en barra (estrictos)
UPDATE app."Ejercicios_CrossFit" SET pairing_tags = 'pull,push,grip' WHERE exercise_id IN (71, 72, 77, 80, 105);

-- Dominadas estrictas | Dominadas pecho a barra
UPDATE app."Ejercicios_CrossFit" SET pairing_tags = 'pull,vertical,grip' WHERE exercise_id IN (31, 32);

-- Fondos (anillas/paralelas) | Fondos en anillas (con peso)
UPDATE app."Ejercicios_CrossFit" SET pairing_tags = 'push' WHERE exercise_id IN (37, 100);

-- Flexiones
UPDATE app."Ejercicios_CrossFit" SET pairing_tags = 'push,horizontal' WHERE exercise_id IN (2);

-- Flexiones con despegue de manos
UPDATE app."Ejercicios_CrossFit" SET pairing_tags = 'push,horizontal,explosivo' WHERE exercise_id IN (33);

-- Burpees (escalado) | Burpees (RX)
UPDATE app."Ejercicios_CrossFit" SET pairing_tags = 'push,legs' WHERE exercise_id IN (8, 35);

-- Burpee salto sobre cajón | Burpee + salto largo
UPDATE app."Ejercicios_CrossFit" SET pairing_tags = 'push,legs,explosivo' WHERE exercise_id IN (42, 62);

-- Aguante en soporte de anillas
UPDATE app."Ejercicios_CrossFit" SET pairing_tags = 'push,shoulders' WHERE exercise_id IN (68);

-- Caminar en pino | Caminar en pino (50 pies sin pausa) | Wall Walk (subida a la pared)
UPDATE app."Ejercicios_CrossFit" SET pairing_tags = 'push,shoulders,core' WHERE exercise_id IN (74, 106, 121);

-- Flexiones en pino (HSPU) | HSPU en déficit (4") | HSPU sin pared | HSPU en anillas
UPDATE app."Ejercicios_CrossFit" SET pairing_tags = 'push,vertical' WHERE exercise_id IN (73, 76, 101, 103);

-- Press de empuje (ligero) | Push Jerk | Split Jerk (pesado)
UPDATE app."Ejercicios_CrossFit" SET pairing_tags = 'push,vertical,explosivo' WHERE exercise_id IN (16, 54, 92);

-- Press con mancuernas | Aguante en pino (pared)
UPDATE app."Ejercicios_CrossFit" SET pairing_tags = 'push,vertical,shoulders' WHERE exercise_id IN (10, 40);

-- Apertura de hombros con banda
UPDATE app."Ejercicios_CrossFit" SET pairing_tags = 'shoulders' WHERE exercise_id IN (27);

-- Turkish Get-Up
UPDATE app."Ejercicios_CrossFit" SET pairing_tags = 'shoulders,core' WHERE exercise_id IN (70);

-- Sentadillas al aire | Sentadilla goblet | Sentadillas frontales (ligero) | Sentadilla a una pierna (Pistol) | Sentadillas frontales (61/43 kg) | Sentadillas traseras (84/61 kg) | Sentadilla a una pierna con peso (Pistol)
UPDATE app."Ejercicios_CrossFit" SET pairing_tags = 'squat,legs' WHERE exercise_id IN (3, 9, 14, 38, 53, 55, 78);

-- Lanzamientos a pared (ligero) | Thrusters (43/30 kg) | Lanzamientos a pared (9/6 kg) | Thrusters (pesado, 61/43 kg) | Thrusters (competición, 84/61 kg)
UPDATE app."Ejercicios_CrossFit" SET pairing_tags = 'squat,push' WHERE exercise_id IN (15, 43, 49, 84, 111);

-- Sentadilla sobre cabeza | Sentadilla sobre cabeza (pesado) | Sentadilla sobre cabeza (pesado, 84/61 kg)
UPDATE app."Ejercicios_CrossFit" SET pairing_tags = 'squat,shoulders' WHERE exercise_id IN (47, 85, 110);

-- Balance de Snatch (pesado)
UPDATE app."Ejercicios_CrossFit" SET pairing_tags = 'squat,shoulders,explosivo' WHERE exercise_id IN (113);

-- ---------------------------------------------------------------------
-- FIX 3b: avoid_pairing_with para 31 movimientos con conflicto claro
-- (duplicación de patrón o fatiga local de agarre/hombro). El resto queda
-- NULL (ya lo está en la tabla).
-- ---------------------------------------------------------------------
-- Marcha del granjero (pesado) | Muscle-Ups en barra | Muscle-Ups en anillas | Escalada de cuerda (15 pies) | Muscle-Ups estrictos | Burpee + Muscle-Up en barra | Escalada de cuerda sin piernas | Escalada de clavijas (Pegboard) | Muscle-Ups en barra (estrictos) | Muscle-Up en barra a L-Sit
UPDATE app."Ejercicios_CrossFit" SET avoid_pairing_with = 'grip' WHERE exercise_id IN (69, 71, 72, 75, 77, 80, 102, 104, 105, 107);

-- Pies a barra | Pies a barra (estrictos)
UPDATE app."Ejercicios_CrossFit" SET avoid_pairing_with = 'grip,core' WHERE exercise_id IN (36, 98);

-- Balanceo con kettlebell (americano, 24/16 kg)
UPDATE app."Ejercicios_CrossFit" SET avoid_pairing_with = 'hinge' WHERE exercise_id IN (50);

-- Peso muerto (102/70 kg) | Peso muerto sumo + jalón alto (34/25 kg) | Peso muerto (pesado, 143/102 kg) | Peso muerto (esfuerzo máximo, 180+/136+ kg)
UPDATE app."Ejercicios_CrossFit" SET avoid_pairing_with = 'hinge,pull' WHERE exercise_id IN (46, 48, 90, 112);

-- Push Jerk | Flexiones en pino (HSPU) | HSPU en déficit (4") | Split Jerk (pesado) | HSPU sin pared | HSPU en anillas
UPDATE app."Ejercicios_CrossFit" SET avoid_pairing_with = 'push,vertical' WHERE exercise_id IN (54, 73, 76, 92, 101, 103);

-- Lanzamientos a pared (ligero) | Thrusters (43/30 kg) | Lanzamientos a pared (9/6 kg) | Thrusters (pesado, 61/43 kg) | Cluster (61/43 kg) | Thrusters (competición, 84/61 kg)
UPDATE app."Ejercicios_CrossFit" SET avoid_pairing_with = 'squat,push' WHERE exercise_id IN (15, 43, 49, 84, 88, 111);

-- Sentadilla sobre cabeza (pesado) | Sentadilla sobre cabeza (pesado, 84/61 kg)
UPDATE app."Ejercicios_CrossFit" SET avoid_pairing_with = 'squat,shoulders' WHERE exercise_id IN (85, 110);

-- ---------------------------------------------------------------------
-- FIX 4: is_benchmark = 0 en TODAS las filas. Son movimientos, no WODs
-- benchmark; el criterio anterior era inconsistente (marcaba 21 filas sin criterio claro).
-- ---------------------------------------------------------------------
UPDATE app."Ejercicios_CrossFit" SET is_benchmark = 0;

-- ---------------------------------------------------------------------
-- FIX 5: correcciones puntuales.
-- ---------------------------------------------------------------------

-- 111 Thrusters (competición, 84/61 kg): las notas decían 'Fran weight, Games
-- standard', pero Fran es 43/30 kg (exercise_id 43).
UPDATE app."Ejercicios_CrossFit" SET notas = 'Peso de competición/élite' WHERE exercise_id = 111;

-- 120 Volteo de neumático en equipo (Worm): no es un neumático, es el Worm.
UPDATE app."Ejercicios_CrossFit" SET nombre = 'Volteo de Worm en equipo', equipamiento = 'Worm',
  escalamiento = 'Volteo de neumático ligero o sandbag en equipo'
WHERE exercise_id = 120;

-- 121 Wall Walk: equipamiento vacío en la tabla.
UPDATE app."Ejercicios_CrossFit" SET equipamiento = 'Pared' WHERE exercise_id = 121;

-- 122 Empuje de trineo: equipamiento vacío. Dominio: estaba como
-- 'Monostructural'; el trineo pesado es trabajo de fuerza/accesorio, no
-- cíclico puro. Los valores de dominio existentes en la tabla son Gymnastic,
-- Weightlifting, Monostructural y Accesorios → se usa 'Accesorios' (valor ya
-- existente), coherente con farmer carry (69) y Worm (120).
UPDATE app."Ejercicios_CrossFit" SET equipamiento = 'Trineo', dominio = 'Accesorios' WHERE exercise_id = 122;

-- 22, 62, 98: dominio incorrecto (eran Monostructural/Accesorios); son
-- movimientos gimnásticos con peso corporal.
UPDATE app."Ejercicios_CrossFit" SET dominio = 'Gymnastic' WHERE exercise_id IN (22, 62, 98);

-- 54 Push Jerk: 'Dip-drive-split' describe el Split Jerk, no el Push Jerk.
UPDATE app."Ejercicios_CrossFit" SET notas = 'Dip-drive-press, pies en paralelo, lockout overhead' WHERE exercise_id = 54;

-- 117 Carrera (5K): 'Sub-20 min 5K, endurance élite' es incorrecto; sub-20
-- en 5K es nivel avanzado amateur, no élite.
UPDATE app."Ejercicios_CrossFit" SET notas = 'Sub-20 min 5K: nivel avanzado amateur' WHERE exercise_id = 117;

-- 7 Abdominales: equipamiento 'Ninguno' → el estándar CrossFit usa AbMat.
UPDATE app."Ejercicios_CrossFit" SET equipamiento = 'AbMat (opcional)' WHERE exercise_id = 7;

-- 38 Pistol: NO se toca. Verificado en el JSON: id 78 (Pistol con peso) ya es
-- 'Avanzado'; subir 38 a Avanzado rompería la escala 38(Intermedio) < 78(Avanzado).

-- Fin del parche.
