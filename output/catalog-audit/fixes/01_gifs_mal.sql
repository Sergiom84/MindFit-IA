-- 01_gifs_mal.sql — corrige los 110 gifs con veredicto MAL (auditoria catalogo 2026-07-12)
-- Fuente de reemplazo: free-exercise-db (JPG estaticos, verificados HEAD 200) o NULL si no hay match exacto.
-- Ningun gif animado del bucket exercise-gifs coincide exactamente con estos ejercicios.

-- Shrimp squat avanzado | antes: kettlebell pistol squat [upper legs/kettlebell] | ahora: NULL — sin equivalente exacto de shrimp squat
UPDATE app.ejercicios SET gif_url=NULL, updated_at=now() WHERE id=43;

-- Pike push-up | antes: clap push up [chest/body weight] | ahora: NULL — sin pike push-up en free-exercise-db
UPDATE app.ejercicios SET gif_url=NULL, updated_at=now() WHERE id=1;

-- Remo invertido piernas estiradas | antes: archer pull up [back/body weight] | ahora: remo invertido en barra, cuerpo recto y piernas extendidas (Inverted_Row)
UPDATE app.ejercicios SET gif_url='https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Inverted_Row/0.jpg', updated_at=now() WHERE id=8;

-- Remo invertido pies elevados | antes: archer pull up [back/body weight] | ahora: remo invertido en barra (variante estandar, pies en suelo) (Inverted_Row)
UPDATE app.ejercicios SET gif_url='https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Inverted_Row/0.jpg', updated_at=now() WHERE id=10;

-- Hollow body | antes: weighted front plank [waist/weighted] | ahora: NULL — sin hollow body en free-exercise-db
UPDATE app.ejercicios SET gif_url=NULL, updated_at=now() WHERE id=17;

-- Sentadilla libre profunda | antes: smith chair squat [upper legs/smith machine] | ahora: sentadilla libre con peso corporal (Bodyweight_Squat)
UPDATE app.ejercicios SET gif_url='https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Bodyweight_Squat/0.jpg', updated_at=now() WHERE id=18;

-- Bulgarian split squat | antes: walking lunge [upper legs/body weight] | ahora: split squat bulgaro con pie trasero elevado (con mancuernas ligeras) (Split_Squat_with_Dumbbells)
UPDATE app.ejercicios SET gif_url='https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Split_Squat_with_Dumbbells/0.jpg', updated_at=now() WHERE id=19;

-- Superman hold suave | antes: superman push-up [chest/body weight] | ahora: superman isometrico tumbado boca abajo (Superman)
UPDATE app.ejercicios SET gif_url='https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Superman/0.jpg', updated_at=now() WHERE id=9;

-- Flexión contra pared | antes: clap push up [chest/body weight] | ahora: NULL — sin flexion contra pared en free-exercise-db
UPDATE app.ejercicios SET gif_url=NULL, updated_at=now() WHERE id=47;

-- Flexión en rodillas | antes: clap push up [chest/body weight] | ahora: NULL — sin flexion en rodillas en free-exercise-db
UPDATE app.ejercicios SET gif_url=NULL, updated_at=now() WHERE id=49;

-- Flexión escapular | antes: clap push up [chest/body weight] | ahora: NULL — sin flexion escapular en free-exercise-db
UPDATE app.ejercicios SET gif_url=NULL, updated_at=now() WHERE id=50;

-- Hollow body tuck | antes: weighted front plank [waist/weighted] | ahora: NULL — sin hollow body tuck en free-exercise-db
UPDATE app.ejercicios SET gif_url=NULL, updated_at=now() WHERE id=53;

-- Sentadilla aire | antes: smith chair squat [upper legs/smith machine] | ahora: sentadilla al aire con peso corporal (Bodyweight_Squat)
UPDATE app.ejercicios SET gif_url='https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Bodyweight_Squat/0.jpg', updated_at=now() WHERE id=57;

-- Step-up bajo | antes: box jump down with one leg stabilization [lower legs/body weight] | ahora: step-up a cajon con peso corporal (incluye elevacion de rodilla) (Step-up_with_Knee_Raise)
UPDATE app.ejercicios SET gif_url='https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Step-up_with_Knee_Raise/0.jpg', updated_at=now() WHERE id=59;

-- Remo invertido rodillas flexionadas | antes: archer pull up [back/body weight] | ahora: remo invertido en barra (Inverted_Row)
UPDATE app.ejercicios SET gif_url='https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Inverted_Row/0.jpg', updated_at=now() WHERE id=61;

-- Dead hang | antes: archer pull up [back/body weight] | ahora: NULL — sin dead hang bilateral en free-exercise-db (solo One_Handed_Hang)
UPDATE app.ejercicios SET gif_url=NULL, updated_at=now() WHERE id=62;

-- Scap pull | antes: archer pull up [back/body weight] | ahora: scap pull colgado de barra, retraccion escapular sin flexion de brazos (Scapular_Pull-Up)
UPDATE app.ejercicios SET gif_url='https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Scapular_Pull-Up/0.jpg', updated_at=now() WHERE id=63;

-- Soporte en paralelas con pies apoyados | antes: ring dips [upper arms/body weight] | ahora: NULL — sin soporte estatico en paralelas en free-exercise-db
UPDATE app.ejercicios SET gif_url=NULL, updated_at=now() WHERE id=65;

-- Remo Renegade con Mancuernas | antes: Standing Dumbbell Upright Row | ahora: NULL — renegade row en fedb es con kettlebells, no mancuernas
UPDATE app.ejercicios SET gif_url=NULL, updated_at=now() WHERE id=112;

-- Sentadillas Búlgaras con Silla | antes: Barbell Side Split Squat | ahora: split squat bulgaro con pie trasero elevado en banco (Split_Squat_with_Dumbbells)
UPDATE app.ejercicios SET gif_url='https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Split_Squat_with_Dumbbells/0.jpg', updated_at=now() WHERE id=86;

-- Remo Invertido con Toalla/Mesa | antes: archer pull up [back/body weight] | ahora: remo invertido colgado de correas/suspension (Inverted_Row_with_Straps)
UPDATE app.ejercicios SET gif_url='https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Inverted_Row_with_Straps/0.jpg', updated_at=now() WHERE id=88;

-- Press de Hombros con Banda | antes: dumbbell push press [shoulders/dumbbell] | ahora: press de hombros con bandas elasticas (Shoulder_Press_-_With_Bands)
UPDATE app.ejercicios SET gif_url='https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Shoulder_Press_-_With_Bands/0.jpg', updated_at=now() WHERE id=90;

-- Superman Hold | antes: superman push-up [chest/body weight] | ahora: superman isometrico tumbado boca abajo (Superman)
UPDATE app.ejercicios SET gif_url='https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Superman/0.jpg', updated_at=now() WHERE id=72;

-- Sentadilla + Elevación de Brazos | antes: smith chair squat [upper legs/smith machine] | ahora: sentadilla con peso corporal (sin la elevacion de brazos) (Bodyweight_Squat)
UPDATE app.ejercicios SET gif_url='https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Bodyweight_Squat/0.jpg', updated_at=now() WHERE id=79;

-- Broad jumps (saltos de longitud) | antes: box jump down with one leg stabilization [lower legs/body weight] | ahora: salto de longitud sin carrera (broad jump) (Standing_Long_Jump)
UPDATE app.ejercicios SET gif_url='https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Standing_Long_Jump/0.jpg', updated_at=now() WHERE id=208;

-- Waiter carry (carga de camarero) | antes: farmers walk [upper legs/dumbbell] | ahora: NULL — sin waiter carry overhead en free-exercise-db
UPDATE app.ejercicios SET gif_url=NULL, updated_at=now() WHERE id=213;

-- Yoke carry (yugo) | antes: farmers walk [upper legs/dumbbell] | ahora: yoke walk con estructura a la espalda (Yoke_Walk)
UPDATE app.ejercicios SET gif_url='https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Yoke_Walk/0.jpg', updated_at=now() WHERE id=214;

-- Sandbag shoulder (saco a hombro) | antes: power clean [upper legs/barbell] | ahora: NULL — sin sandbag a hombro en free-exercise-db
UPDATE app.ejercicios SET gif_url=NULL, updated_at=now() WHERE id=215;

-- Devil press con mancuernas | antes: burpee [cardio/body weight] | ahora: NULL — sin devil press en free-exercise-db
UPDATE app.ejercicios SET gif_url=NULL, updated_at=now() WHERE id=217;

-- Man makers | antes: burpee [cardio/body weight] | ahora: NULL — sin man makers en free-exercise-db
UPDATE app.ejercicios SET gif_url=NULL, updated_at=now() WHERE id=218;

-- Press landmine unilateral | antes: One Arm Floor Press | ahora: NULL — sin press landmine unilateral en free-exercise-db
UPDATE app.ejercicios SET gif_url=NULL, updated_at=now() WHERE id=184;

-- Remo invertido a una mano | antes: archer pull up [back/body weight] | ahora: NULL — sin remo invertido a una mano en free-exercise-db
UPDATE app.ejercicios SET gif_url=NULL, updated_at=now() WHERE id=187;

-- Sentadilla búlgara | antes: Barbell Side Split Squat | ahora: split squat bulgaro con pie trasero elevado (Split_Squat_with_Dumbbells)
UPDATE app.ejercicios SET gif_url='https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Split_Squat_with_Dumbbells/0.jpg', updated_at=now() WHERE id=189;

-- Peso muerto a una pierna con kettlebell | antes: barbell romanian deadlift [upper legs/barbell] | ahora: peso muerto a una pierna con kettlebell (Kettlebell_One-Legged_Deadlift)
UPDATE app.ejercicios SET gif_url='https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Kettlebell_One-Legged_Deadlift/0.jpg', updated_at=now() WHERE id=190;

-- Flexiones en pared | antes: clap push up [chest/body weight] | ahora: NULL — sin flexion en pared en free-exercise-db
UPDATE app.ejercicios SET gif_url=NULL, updated_at=now() WHERE id=166;

-- Flexiones en rodillas | antes: clap push up [chest/body weight] | ahora: NULL — sin flexion en rodillas en free-exercise-db
UPDATE app.ejercicios SET gif_url=NULL, updated_at=now() WHERE id=167;

-- Press overhead con mancuerna ligera | antes: dumbbell press on exercise ball [chest/dumbbell] | ahora: press overhead de pie con mancuernas (Standing_Dumbbell_Press)
UPDATE app.ejercicios SET gif_url='https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Standing_Dumbbell_Press/0.jpg', updated_at=now() WHERE id=168;

-- Remo TRX asistido | antes: archer pull up [back/body weight] | ahora: remo en suspension con correas (equivalente TRX) (Inverted_Row_with_Straps)
UPDATE app.ejercicios SET gif_url='https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Inverted_Row_with_Straps/0.jpg', updated_at=now() WHERE id=169;

-- Dead hang (cuelgue pasivo) | antes: archer pull up [back/body weight] | ahora: NULL — sin dead hang bilateral en free-exercise-db
UPDATE app.ejercicios SET gif_url=NULL, updated_at=now() WHERE id=170;

-- Remo invertido con pies en suelo | antes: archer pull up [back/body weight] | ahora: remo invertido en barra con pies en suelo (Inverted_Row)
UPDATE app.ejercicios SET gif_url='https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Inverted_Row/0.jpg', updated_at=now() WHERE id=171;

-- Step-ups a cajón bajo | antes: box jump down with one leg stabilization [lower legs/body weight] | ahora: step-up a cajon con peso corporal (Step-up_with_Knee_Raise)
UPDATE app.ejercicios SET gif_url='https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Step-up_with_Knee_Raise/0.jpg', updated_at=now() WHERE id=174;

-- Snatch completo desde suelo | antes: kettlebell double snatch [shoulders/kettlebell] | ahora: snatch completo con barra desde suelo (Snatch)
UPDATE app.ejercicios SET gif_url='https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Snatch/0.jpg', updated_at=now() WHERE id=261;

-- Snatch desde bloques (knee) | antes: kettlebell double snatch [shoulders/kettlebell] | ahora: snatch con barra desde bloques (Snatch_from_Blocks)
UPDATE app.ejercicios SET gif_url='https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Snatch_from_Blocks/0.jpg', updated_at=now() WHERE id=262;

-- Snatch Complejo: 1+1+1 | antes: kettlebell double snatch [shoulders/kettlebell] | ahora: snatch completo con barra (representa el complejo) (Snatch)
UPDATE app.ejercicios SET gif_url='https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Snatch/0.jpg', updated_at=now() WHERE id=264;

-- Snatch High Pull + Snatch (Complejo) | antes: kettlebell double snatch [shoulders/kettlebell] | ahora: snatch con barra (representa el complejo high pull + snatch) (Snatch)
UPDATE app.ejercicios SET gif_url='https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Snatch/0.jpg', updated_at=now() WHERE id=267;

-- Clean completo desde suelo | antes: kettlebell one arm clean and jerk [shoulders/kettlebell] | ahora: clean completo con barra desde suelo (Clean)
UPDATE app.ejercicios SET gif_url='https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Clean/0.jpg', updated_at=now() WHERE id=268;

-- Clean complejo: Power + Full + Jerk | antes: kettlebell one arm clean and jerk [shoulders/kettlebell] | ahora: clean and jerk con barra (representa el complejo) (Clean_and_Jerk)
UPDATE app.ejercicios SET gif_url='https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Clean_and_Jerk/0.jpg', updated_at=now() WHERE id=273;

-- Jerk desde bloques (detrás del cuello) | antes: dumbbell push press [shoulders/dumbbell] | ahora: NULL — sin jerk tras nuca desde bloques en free-exercise-db
UPDATE app.ejercicios SET gif_url=NULL, updated_at=now() WHERE id=274;

-- Tall Jerk | antes: dumbbell push press [shoulders/dumbbell] | ahora: NULL — sin tall jerk en free-exercise-db
UPDATE app.ejercicios SET gif_url=NULL, updated_at=now() WHERE id=275;

-- Clean + 3 Front Squats | antes: kettlebell one arm clean and jerk [shoulders/kettlebell] | ahora: clean con barra (parte inicial del complejo clean + front squats) (Clean)
UPDATE app.ejercicios SET gif_url='https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Clean/0.jpg', updated_at=now() WHERE id=276;

-- Snatch Grip Overhead Lunges pesado | antes: walking lunge [upper legs/body weight] | ahora: NULL — sin overhead lunge con agarre snatch en free-exercise-db
UPDATE app.ejercicios SET gif_url=NULL, updated_at=now() WHERE id=281;

-- Sotts Press moderado | antes: dumbbell push press [shoulders/dumbbell] | ahora: NULL — sin Sotts press en free-exercise-db
UPDATE app.ejercicios SET gif_url=NULL, updated_at=now() WHERE id=282;

-- Power Snatch desde suelo | antes: kettlebell double snatch [shoulders/kettlebell] | ahora: power snatch con barra desde suelo (Power_Snatch)
UPDATE app.ejercicios SET gif_url='https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Power_Snatch/0.jpg', updated_at=now() WHERE id=239;

-- Hang Snatch (mid-thigh) | antes: kettlebell double snatch [shoulders/kettlebell] | ahora: hang snatch con barra desde posicion colgada (Hang_Snatch)
UPDATE app.ejercicios SET gif_url='https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Hang_Snatch/0.jpg', updated_at=now() WHERE id=240;

-- Muscle Snatch con barra cargada | antes: kettlebell double snatch [shoulders/kettlebell] | ahora: muscle snatch con barra (Muscle_Snatch)
UPDATE app.ejercicios SET gif_url='https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Muscle_Snatch/0.jpg', updated_at=now() WHERE id=244;

-- Push Jerk | antes: dumbbell push press [shoulders/dumbbell] | ahora: power/push jerk con barra sin split (Power_Jerk)
UPDATE app.ejercicios SET gif_url='https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Power_Jerk/0.jpg', updated_at=now() WHERE id=249;

-- Strict Press intermedio | antes: dumbbell push press [shoulders/dumbbell] | ahora: press estricto de pie con barra (Standing_Military_Press)
UPDATE app.ejercicios SET gif_url='https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Standing_Military_Press/0.jpg', updated_at=now() WHERE id=255;

-- Bulgarian Split Squat con barra | antes: walking lunge [upper legs/body weight] | ahora: sentadilla bulgara con barra y pie trasero en banco (One_Leg_Barbell_Squat)
UPDATE app.ejercicios SET gif_url='https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/One_Leg_Barbell_Squat/0.jpg', updated_at=now() WHERE id=256;

-- Overhead Walking Lunges con barra | antes: walking lunge [upper legs/body weight] | ahora: NULL — sin overhead walking lunge con barra en free-exercise-db
UPDATE app.ejercicios SET gif_url=NULL, updated_at=now() WHERE id=257;

-- Sotts Press con carga ligera | antes: dumbbell push press [shoulders/dumbbell] | ahora: NULL — sin Sotts press en free-exercise-db
UPDATE app.ejercicios SET gif_url=NULL, updated_at=now() WHERE id=259;

-- Muscle Snatch con PVC | antes: kettlebell double snatch [shoulders/kettlebell] | ahora: muscle snatch con barra (demo del patron para PVC) (Muscle_Snatch)
UPDATE app.ejercicios SET gif_url='https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Muscle_Snatch/0.jpg', updated_at=now() WHERE id=223;

-- Strict Press con barra | antes: dumbbell push press [shoulders/dumbbell] | ahora: press estricto de pie con barra (Standing_Military_Press)
UPDATE app.ejercicios SET gif_url='https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Standing_Military_Press/0.jpg', updated_at=now() WHERE id=229;

-- Sotts Press preparación | antes: dumbbell push press [shoulders/dumbbell] | ahora: NULL — sin Sotts press en free-exercise-db
UPDATE app.ejercicios SET gif_url=NULL, updated_at=now() WHERE id=230;

-- Overhead Walking Lunges ligero | antes: walking lunge [upper legs/body weight] | ahora: NULL — sin overhead walking lunge en free-exercise-db
UPDATE app.ejercicios SET gif_url=NULL, updated_at=now() WHERE id=236;

-- Hang Power Snatch (above knee) | antes: kettlebell double snatch [shoulders/kettlebell] | ahora: hang snatch con barra desde encima de rodilla (Hang_Snatch)
UPDATE app.ejercicios SET gif_url='https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Hang_Snatch/0.jpg', updated_at=now() WHERE id=284;

-- Press militar con mancuernas | antes: Machine Shoulder Military Press | ahora: press de hombros con mancuernas (Dumbbell_Shoulder_Press)
UPDATE app.ejercicios SET gif_url='https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Dumbbell_Shoulder_Press/0.jpg', updated_at=now() WHERE id=308;

-- Press militar con barra (pesado con pausa) | antes: Machine Shoulder Military Press | ahora: press militar con barra libre (Standing_Military_Press)
UPDATE app.ejercicios SET gif_url='https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Standing_Military_Press/0.jpg', updated_at=now() WHERE id=371;

-- Press militar con barra (de pie) | antes: Machine Shoulder Military Press | ahora: press militar con barra libre de pie (Standing_Military_Press)
UPDATE app.ejercicios SET gif_url='https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Standing_Military_Press/0.jpg', updated_at=now() WHERE id=378;

-- Sentadilla búlgara con mancuernas (pesada) | antes: Barbell Side Split Squat | ahora: sentadilla bulgara con mancuernas y pie trasero elevado (Split_Squat_with_Dumbbells)
UPDATE app.ejercicios SET gif_url='https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Split_Squat_with_Dumbbells/0.jpg', updated_at=now() WHERE id=390;

-- Extensión de tríceps en barras paralelas | antes: Standing Overhead Barbell Triceps Extension | ahora: fondos en paralelas version triceps (torso vertical, codos pegados) (Dips_-_Triceps_Version)
UPDATE app.ejercicios SET gif_url='https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Dips_-_Triceps_Version/0.jpg', updated_at=now() WHERE id=394;

-- Sentadilla Sissy con mancuernas | antes: Dumbbell Squat | ahora: sissy squat con lastre (disco al pecho) (Weighted_Sissy_Squat)
UPDATE app.ejercicios SET gif_url='https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Weighted_Sissy_Squat/0.jpg', updated_at=now() WHERE id=329;

-- Sentadilla búlgara con mancuernas | antes: Barbell Side Split Squat | ahora: sentadilla bulgara con mancuernas y pie trasero elevado (Split_Squat_with_Dumbbells)
UPDATE app.ejercicios SET gif_url='https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Split_Squat_with_Dumbbells/0.jpg', updated_at=now() WHERE id=357;

-- Belt Squats | antes: Barbell Full Squat | ahora: NULL — sin belt squat en free-exercise-db
UPDATE app.ejercicios SET gif_url=NULL, updated_at=now() WHERE id=481;

-- Bulgarian Split Squat | antes: Barbell Side Split Squat | ahora: sentadilla bulgara con mancuernas y pie trasero elevado (Split_Squat_with_Dumbbells)
UPDATE app.ejercicios SET gif_url='https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Split_Squat_with_Dumbbells/0.jpg', updated_at=now() WHERE id=453;

-- Barbell Row | antes: Upright Barbell Row | ahora: remo inclinado con barra (Bent_Over_Barbell_Row)
UPDATE app.ejercicios SET gif_url='https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Bent_Over_Barbell_Row/0.jpg', updated_at=now() WHERE id=513;

-- Remo en anillas | antes: archer pull up [back/body weight] | ahora: remo en suspension con correas (equivalente a anillas) (Inverted_Row_with_Straps)
UPDATE app."Ejercicios_CrossFit" SET gif_url='https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Inverted_Row_with_Straps/0.jpg', updated_at=now() WHERE exercise_id=1;

-- Sentadillas al aire | antes: smith chair squat [upper legs/smith machine] | ahora: air squat con peso corporal (Bodyweight_Squat)
UPDATE app."Ejercicios_CrossFit" SET gif_url='https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Bodyweight_Squat/0.jpg', updated_at=now() WHERE exercise_id=3;

-- Saltos de tijera | antes: Freehand Jump Squat | ahora: NULL — sin jumping jacks en free-exercise-db
UPDATE app."Ejercicios_CrossFit" SET gif_url=NULL, updated_at=now() WHERE exercise_id=5;

-- Subidas a cajón | antes: box jump down with one leg stabilization [lower legs/body weight] | ahora: subida a cajon con peso corporal (Step-up_with_Knee_Raise)
UPDATE app."Ejercicios_CrossFit" SET gif_url='https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Step-up_with_Knee_Raise/0.jpg', updated_at=now() WHERE exercise_id=6;

-- Lanzamientos a pared (ligero) | antes: kettlebell thruster [shoulders/kettlebell] | ahora: NULL — sin wall ball en free-exercise-db
UPDATE app."Ejercicios_CrossFit" SET gif_url=NULL, updated_at=now() WHERE exercise_id=15;

-- Assault Bike (ritmo moderado) | antes: air bike [waist/body weight] | ahora: NULL — sin assault/fan bike en free-exercise-db
UPDATE app."Ejercicios_CrossFit" SET gif_url=NULL, updated_at=now() WHERE exercise_id=18;

-- Subidas a cajón (cardio) | antes: box jump down with one leg stabilization [lower legs/body weight] | ahora: subida a cajon con peso corporal (Step-up_with_Knee_Raise)
UPDATE app."Ejercicios_CrossFit" SET gif_url='https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Step-up_with_Knee_Raise/0.jpg', updated_at=now() WHERE exercise_id=23;

-- Aguante en posición hueca | antes: weighted front plank [waist/weighted] | ahora: NULL — sin hollow hold en free-exercise-db
UPDATE app."Ejercicios_CrossFit" SET gif_url=NULL, updated_at=now() WHERE exercise_id=24;

-- Aguante en posición Superman | antes: superman push-up [chest/body weight] | ahora: superman isometrico tumbado boca abajo (Superman)
UPDATE app."Ejercicios_CrossFit" SET gif_url='https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Superman/0.jpg', updated_at=now() WHERE exercise_id=25;

-- Colgado muerto | antes: archer pull up [back/body weight] | ahora: NULL — sin dead hang bilateral en free-exercise-db
UPDATE app."Ejercicios_CrossFit" SET gif_url=NULL, updated_at=now() WHERE exercise_id=28;

-- Pies a barra | antes: flexion leg sit up (bent knee) [waist/body weight] | ahora: pike colgado de barra llevando pies hacia la barra (Hanging_Pike)
UPDATE app."Ejercicios_CrossFit" SET gif_url='https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Hanging_Pike/0.jpg', updated_at=now() WHERE exercise_id=36;

-- Rodillas a codos | antes: flexion leg sit up (bent knee) [waist/body weight] | ahora: elevacion de piernas/rodillas colgado de barra (Hanging_Leg_Raise)
UPDATE app."Ejercicios_CrossFit" SET gif_url='https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Hanging_Leg_Raise/0.jpg', updated_at=now() WHERE exercise_id=41;

-- Power Snatch desde colgado | antes: kettlebell double snatch [shoulders/kettlebell] | ahora: snatch con barra desde posicion colgada (Hang_Snatch)
UPDATE app."Ejercicios_CrossFit" SET gif_url='https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Hang_Snatch/0.jpg', updated_at=now() WHERE exercise_id=45;

-- Lanzamientos a pared (9/6 kg) | antes: kettlebell thruster [shoulders/kettlebell] | ahora: NULL — sin wall ball en free-exercise-db
UPDATE app."Ejercicios_CrossFit" SET gif_url=NULL, updated_at=now() WHERE exercise_id=49;

-- Clean & Jerk | antes: kettlebell one arm clean and jerk [shoulders/kettlebell] | ahora: clean and jerk con barra (Clean_and_Jerk)
UPDATE app."Ejercicios_CrossFit" SET gif_url='https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Clean_and_Jerk/0.jpg', updated_at=now() WHERE exercise_id=52;

-- Push Jerk | antes: dumbbell push press [shoulders/dumbbell] | ahora: power/push jerk con barra sin split (Power_Jerk)
UPDATE app."Ejercicios_CrossFit" SET gif_url='https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Power_Jerk/0.jpg', updated_at=now() WHERE exercise_id=54;

-- Assault Bike (20/15 cal) | antes: air bike [waist/body weight] | ahora: NULL — sin assault/fan bike en free-exercise-db
UPDATE app."Ejercicios_CrossFit" SET gif_url=NULL, updated_at=now() WHERE exercise_id=58;

-- Subidas a cajón (rápidas, 24/20") | antes: box jump down with one leg stabilization [lower legs/body weight] | ahora: subida a cajon con peso corporal (Step-up_with_Knee_Raise)
UPDATE app."Ejercicios_CrossFit" SET gif_url='https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Step-up_with_Knee_Raise/0.jpg', updated_at=now() WHERE exercise_id=63;

-- Balanceos en posición hueca | antes: weighted front plank [waist/weighted] | ahora: NULL — sin hollow rocks en free-exercise-db
UPDATE app."Ejercicios_CrossFit" SET gif_url=NULL, updated_at=now() WHERE exercise_id=66;

-- Snatch completo (61/43 kg) | antes: kettlebell double snatch [shoulders/kettlebell] | ahora: snatch completo con barra (Snatch)
UPDATE app."Ejercicios_CrossFit" SET gif_url='https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Snatch/0.jpg', updated_at=now() WHERE exercise_id=81;

-- Snatch en sentadilla (pesado) | antes: kettlebell double snatch [shoulders/kettlebell] | ahora: squat snatch completo con barra (Snatch)
UPDATE app."Ejercicios_CrossFit" SET gif_url='https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Snatch/0.jpg', updated_at=now() WHERE exercise_id=82;

-- Clean & Jerk (pesado, 84/61 kg) | antes: kettlebell one arm clean and jerk [shoulders/kettlebell] | ahora: clean and jerk con barra (Clean_and_Jerk)
UPDATE app."Ejercicios_CrossFit" SET gif_url='https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Clean_and_Jerk/0.jpg', updated_at=now() WHERE exercise_id=86;

-- Devil Press (pesado, mancuernas 22,5/15 kg) | antes: dumbbell press on exercise ball [chest/dumbbell] | ahora: NULL — sin devil press en free-exercise-db
UPDATE app."Ejercicios_CrossFit" SET gif_url=NULL, updated_at=now() WHERE exercise_id=87;

-- Zancadas caminando con peso sobre cabeza (pesado) | antes: walking lunge [upper legs/body weight] | ahora: NULL — sin overhead walking lunge en free-exercise-db
UPDATE app."Ejercicios_CrossFit" SET gif_url=NULL, updated_at=now() WHERE exercise_id=89;

-- Snatch en sentadilla desde colgado | antes: kettlebell double snatch [shoulders/kettlebell] | ahora: hang squat snatch con barra (Hang_Snatch)
UPDATE app."Ejercicios_CrossFit" SET gif_url='https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Hang_Snatch/0.jpg', updated_at=now() WHERE exercise_id=91;

-- Split Jerk (pesado) | antes: dumbbell push press [shoulders/dumbbell] | ahora: split jerk con barra (Split_Jerk)
UPDATE app."Ejercicios_CrossFit" SET gif_url='https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Split_Jerk/0.jpg', updated_at=now() WHERE exercise_id=92;

-- Assault Bike (50/35 cal) | antes: air bike [waist/body weight] | ahora: NULL — sin assault/fan bike en free-exercise-db
UPDATE app."Ejercicios_CrossFit" SET gif_url=NULL, updated_at=now() WHERE exercise_id=94;

-- Pies a barra (estrictos) | antes: flexion leg sit up (bent knee) [waist/body weight] | ahora: pike colgado de barra llevando pies hacia la barra (Hanging_Pike)
UPDATE app."Ejercicios_CrossFit" SET gif_url='https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Hanging_Pike/0.jpg', updated_at=now() WHERE exercise_id=98;

-- Escalada de clavijas (Pegboard) | antes: rope climb [back/rope] | ahora: NULL — sin pegboard en free-exercise-db
UPDATE app."Ejercicios_CrossFit" SET gif_url=NULL, updated_at=now() WHERE exercise_id=104;

-- Snatch (competición, 84/61 kg) | antes: kettlebell double snatch [shoulders/kettlebell] | ahora: snatch completo con barra (Snatch)
UPDATE app."Ejercicios_CrossFit" SET gif_url='https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Snatch/0.jpg', updated_at=now() WHERE exercise_id=108;

-- Clean & Jerk (competición, 111/84 kg) | antes: kettlebell one arm clean and jerk [shoulders/kettlebell] | ahora: clean and jerk con barra (Clean_and_Jerk)
UPDATE app."Ejercicios_CrossFit" SET gif_url='https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Clean_and_Jerk/0.jpg', updated_at=now() WHERE exercise_id=109;

-- Balance de Snatch (pesado) | antes: kettlebell double snatch [shoulders/kettlebell] | ahora: snatch balance con barra (Snatch_Balance)
UPDATE app."Ejercicios_CrossFit" SET gif_url='https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Snatch_Balance/0.jpg', updated_at=now() WHERE exercise_id=113;

-- Complejo: Clean en sentadilla + Sentadilla frontal + Jerk | antes: kettlebell one arm clean and jerk [shoulders/kettlebell] | ahora: clean and jerk con barra (representa el complejo) (Clean_and_Jerk)
UPDATE app."Ejercicios_CrossFit" SET gif_url='https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Clean_and_Jerk/0.jpg', updated_at=now() WHERE exercise_id=114;

-- Power Snatch (toque y sigue, 61/43 kg) | antes: kettlebell double snatch [shoulders/kettlebell] | ahora: power snatch con barra (Power_Snatch)
UPDATE app."Ejercicios_CrossFit" SET gif_url='https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Power_Snatch/0.jpg', updated_at=now() WHERE exercise_id=115;

-- Assault Bike (100 cal) | antes: air bike [waist/body weight] | ahora: NULL — sin assault/fan bike en free-exercise-db
UPDATE app."Ejercicios_CrossFit" SET gif_url=NULL, updated_at=now() WHERE exercise_id=118;
