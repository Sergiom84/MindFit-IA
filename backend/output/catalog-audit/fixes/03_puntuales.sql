-- =============================================================================
-- 03_puntuales.sql — Fixes puntuales del catálogo app.ejercicios
-- Generado: 2026-07-12 a partir de output/catalog-audit/ejercicios.json
-- Todos los ids/nombres verificados contra el JSON antes de escribir cada UPDATE.
-- Sin BEGIN/COMMIT (aplicar dentro de la transacción que decida el operador).
-- =============================================================================

-- =========================================================================
-- HEAVY DUTY — duplicados de nombre entre niveles (renombrar, no borrar)
-- =========================================================================

-- 313 (Intermedio) vs 322 (Avanzado) comparten nombre "Dips en paralelas".
-- El como_hacerlo de 322 NO menciona lastre, así que solo se renombra
-- (su progresion_hacia "Fondos lastrados (progresión)" ya describe la línea de carga).
UPDATE app.ejercicios
SET nombre = 'Dips en paralelas lastrados'
WHERE id = 322 AND disciplina = 'heavy_duty' AND nombre = 'Dips en paralelas';

-- 318 (Intermedio) vs 325 (Avanzado) comparten nombre "Elevación de talones de pie".
UPDATE app.ejercicios
SET nombre = 'Elevación de talones de pie (carga pesada)'
WHERE id = 325 AND disciplina = 'heavy_duty' AND nombre = 'Elevación de talones de pie';

-- 287 (Principiante) vs 302 (Intermedio) comparten nombre "Pec-deck".
UPDATE app.ejercicios
SET nombre = 'Pec-deck (carga progresiva)'
WHERE id = 302 AND disciplina = 'heavy_duty' AND nombre = 'Pec-deck';

-- 295 (Principiante) vs 315 (Intermedio) comparten nombre "Prensa 45°".
UPDATE app.ejercicios
SET nombre = 'Prensa 45° (carga pesada)'
WHERE id = 315 AND disciplina = 'heavy_duty' AND nombre = 'Prensa 45°';

-- 296 (Principiante) vs 314 (Intermedio) comparten nombre "Extensión de cuádriceps".
UPDATE app.ejercicios
SET nombre = 'Extensión de cuádriceps (carga pesada)'
WHERE id = 314 AND disciplina = 'heavy_duty' AND nombre = 'Extensión de cuádriceps';

-- NOTA (sin UPDATE): 305 "Jalón al pecho supino", 311 "Jalón supino" y
-- 321 "Jalón supino en polea" ya tienen nombres distintos entre sí en el JSON,
-- por lo que NO se renombran (la instrucción era renombrar solo si chocaban).

-- 317 Curl femoral sentado: series_reps_objetivo es "1x8-12/lado" (unilateral),
-- el nombre no lo reflejaba.
UPDATE app.ejercicios
SET nombre = 'Curl femoral sentado unilateral'
WHERE id = 317 AND disciplina = 'heavy_duty' AND nombre = 'Curl femoral sentado';

-- =========================================================================
-- HIPERTROFIA
-- =========================================================================

-- Bloque de fuerza sin etiquetar. El id 339 (referencia) lleva la etiqueta en el
-- campo `patron`: "Empuje horizontal (fuerza-hiper)" (su patron_movimiento es
-- 'empuje_horizontal', NO 'fuerza-hiper'). Se replica la misma convención:
-- añadir el sufijo " (fuerza-hiper)" a `patron`, sin pisar patron_movimiento
-- (345 y 379 ya tienen patron_movimiento propio que se conserva).
UPDATE app.ejercicios
SET patron = 'Sentadilla (fuerza-hiper)'
WHERE id = 345 AND disciplina = 'hipertrofia' AND patron = 'Sentadilla';

UPDATE app.ejercicios
SET patron = 'Sentadilla profunda completa (fuerza-hiper)'
WHERE id = 368 AND disciplina = 'hipertrofia' AND patron = 'Sentadilla profunda completa';

UPDATE app.ejercicios
SET patron = 'Empuje vertical máximo (fuerza-hiper)'
WHERE id = 371 AND disciplina = 'hipertrofia' AND patron = 'Empuje vertical máximo';

UPDATE app.ejercicios
SET patron = 'Tracción vertical (fuerza-hiper)'
WHERE id = 379 AND disciplina = 'hipertrofia' AND patron = 'Tracción vertical';

UPDATE app.ejercicios
SET patron = 'Empuje vertical con máxima carga (fuerza-hiper)'
WHERE id = 393 AND disciplina = 'hipertrofia' AND patron = 'Empuje vertical con máxima carga';

-- Prensas 349/385/361/386: niveles reales en el JSON:
--   349 "Leg Press en máquina" = Principiante
--   385 "Sentadilla en prensa 45°" = Principiante
--   361 "Prensa inclinada 45°" = Intermedio
--   386 "Prensa 45° (carga moderada/alta)" = Intermedio
-- Se renombran para alinear la familia por nivel. 385 comparte nivel y movimiento
-- guiado con 349, así que se renombra como variante de énfasis (pies altos - glúteo)
-- para diferenciarla dentro del mismo nivel.
UPDATE app.ejercicios
SET nombre = 'Prensa de piernas en máquina (principiante)'
WHERE id = 349 AND disciplina = 'hipertrofia' AND nombre = 'Leg Press en máquina';

UPDATE app.ejercicios
SET nombre = 'Prensa inclinada 45° (intermedio)'
WHERE id = 361 AND disciplina = 'hipertrofia' AND nombre = 'Prensa inclinada 45°';

UPDATE app.ejercicios
SET nombre = 'Prensa 45° (pies altos - énfasis glúteo)'
WHERE id = 385 AND disciplina = 'hipertrofia' AND nombre = 'Sentadilla en prensa 45°';

UPDATE app.ejercicios
SET nombre = 'Prensa 45° (intermedio - carga moderada/alta)'
WHERE id = 386 AND disciplina = 'hipertrofia' AND nombre = 'Prensa 45° (carga moderada/alta)';

-- 337 Shrugs con barra olímpica: es trabajo de trapecio, no de hombro.
UPDATE app.ejercicios
SET categoria = 'Trapecio'
WHERE id = 337 AND disciplina = 'hipertrofia' AND nombre = 'Shrugs (encorvamientos) con barra olímpica';

-- 372 Snatch Grip High Pull: dominante de trapecio, no de hombro.
UPDATE app.ejercicios
SET categoria = 'Trapecio'
WHERE id = 372 AND disciplina = 'hipertrofia' AND nombre = 'Snatch Grip High Pull';

-- 425 "Face Pull pesado con pausa": el rango real es 12-20 reps (3-5x12-20),
-- "pesado" contradice la dosis. Se elimina "pesado" del nombre.
UPDATE app.ejercicios
SET nombre = 'Face Pull con pausa'
WHERE id = 425 AND disciplina = 'hipertrofia' AND nombre = 'Face Pull pesado con pausa';

-- 429 Dragon Flag (progresión): estaba como Intermedio; es un ejercicio avanzado.
UPDATE app.ejercicios
SET nivel = 'Avanzado'
WHERE id = 429 AND disciplina = 'hipertrofia' AND nombre = 'Dragon Flag (progresión)';

-- =========================================================================
-- CASA — seguridad y niveles
-- =========================================================================

-- 120 "Box Jumps con Silla Robusta": saltar a una silla es inseguro en casa.
-- Se convierte a step-up explosivo en escalón firme (nombre, textos y equipamiento).
UPDATE app.ejercicios
SET nombre = 'Step-up explosivo en escalón',
    como_hacerlo = 'Coloca un pie completo sobre un escalón firme y empuja con fuerza para subir de forma explosiva, extendiendo la cadera arriba. Baja con control y alterna la pierna. No saltes con ambos pies: es un impulso potente de una pierna.',
    notas = 'Usa un escalón firme y antideslizante (primer peldaño de una escalera o step estable). Sube explosivo, baja controlado. Evita sillas u objetos que puedan volcar.',
    consejos = 'Apoya el pie completo en el escalón y mantén el tronco erguido; aumenta la velocidad de subida antes que la altura.',
    equipamiento = ARRAY['Escalón firme']
WHERE id = 120 AND disciplina = 'casa' AND nombre = 'Box Jumps con Silla Robusta';

-- 118 Muscle-up Adaptado con Toalla: opción conservadora — se mantiene el
-- ejercicio pero se antepone una advertencia de seguridad en notas.
UPDATE app.ejercicios
SET notas = 'PRECAUCIÓN: requiere toallas resistentes y barra estable; progresión avanzada, no apta como primer muscle-up. ' || notas
WHERE id = 118 AND disciplina = 'casa' AND nombre = 'Muscle-up Adaptado con Toalla';

-- 113 Dragon Flag: la silla robusta no es un anclaje seguro para este ejercicio;
-- se deja solo el banco. (equipamiento actual: {Banco,"Silla robusta"})
UPDATE app.ejercicios
SET equipamiento = ARRAY['Banco']
WHERE id = 113 AND disciplina = 'casa' AND nombre = 'Dragon Flag';

-- 163 Shoulder Dislocates con Toalla: es movilidad básica, no Avanzado.
UPDATE app.ejercicios
SET nivel = 'Principiante'
WHERE id = 163 AND disciplina = 'casa' AND nombre = 'Shoulder Dislocates con Toalla';

-- 162 Deep Squat Hold (Malasana): estaba en Avanzado; es Intermedio.
UPDATE app.ejercicios
SET nivel = 'Intermedio'
WHERE id = 162 AND disciplina = 'casa' AND nombre = 'Deep Squat Hold (Malasana)';

-- 144 Battle Rope Jumps (sin cuerda): como_hacerlo menciona "ondas de brazos (toallas)"
-- pero equipamiento decía solo {Peso corporal}. Se añade Toalla para coherencia.
UPDATE app.ejercicios
SET equipamiento = ARRAY['Peso corporal', 'Toalla']
WHERE id = 144 AND disciplina = 'casa' AND nombre = 'Battle Rope Jumps (sin cuerda)';

-- =========================================================================
-- FUNCIONAL
-- =========================================================================

-- 210 V-sit hold: "3 x 20-40 seg" es dosis irreal para un V-sit; se ajusta.
UPDATE app.ejercicios
SET series_reps_objetivo = '3-5 x 5-15 s'
WHERE id = 210 AND disciplina = 'funcional' AND nombre = 'V-sit hold';

-- 185 Turkish get-up con kettlebell: 'Cuerpo completo' no existe como categoria
-- en ninguna disciplina del catálogo. Su patron ya es 'Movimiento complejo'.
-- De las categorias existentes en funcional (Empuje, Tracción, Piernas,
-- Pliométrico, Core, Carga, Movilidad), la más razonable para un get-up
-- con carga es 'Carga' (trabajo global con implemento, no un empuje puro).
UPDATE app.ejercicios
SET categoria = 'Carga'
WHERE id = 185 AND disciplina = 'funcional' AND nombre = 'Turkish get-up con kettlebell';

-- 194 L-sit hold en paralelas se mantiene Intermedio (sin cambio). Para unificar,
-- el L-sit de calistenia (id 40, actualmente Avanzado) pasa a Intermedio.
UPDATE app.ejercicios
SET nivel = 'Intermedio'
WHERE id = 40 AND disciplina = 'calistenia' AND nombre = 'L-sit';

-- 170 Dead hang (cuelgue pasivo): 90 s de descanso es excesivo para un cuelgue
-- de 15-30 s de principiante; se reduce a 45 s.
UPDATE app.ejercicios
SET descanso_seg = 45
WHERE id = 170 AND disciplina = 'funcional' AND nombre = 'Dead hang (cuelgue pasivo)';

-- 184 Press landmine unilateral: el campo equipamiento es text[], se añade la
-- alternativa con mancuerna sin quitar el material principal.
UPDATE app.ejercicios
SET equipamiento = ARRAY['Barra', 'Landmine', 'Mancuerna (alternativa)']
WHERE id = 184 AND disciplina = 'funcional' AND nombre = 'Press landmine unilateral';

-- =========================================================================
-- CALISTENIA (solo categorías/nombres; NO se tocan descanso_seg ni progresiones)
-- =========================================================================

-- 37 Back lever: es un estático de tracción, estaba en Empuje.
UPDATE app.ejercicios
SET categoria = 'Tracción'
WHERE id = 37 AND disciplina = 'calistenia' AND nombre = 'Back lever – advanced tuck/straddle';

-- 32 nombre doble "Archer pull-up / Typewriter": se deja el primero.
UPDATE app.ejercicios
SET nombre = 'Archer pull-up'
WHERE id = 32 AND disciplina = 'calistenia' AND nombre = 'Archer pull-up / Typewriter';

-- 46 nombre doble "Explosive dips / Dips en anillas": el como_hacerlo describe
-- fondos explosivos ("empuja explosivo hasta despegar", en anillas O paralelas),
-- es decir, el contenido corresponde a Explosive dips, no a dips en anillas.
UPDATE app.ejercicios
SET nombre = 'Explosive dips'
WHERE id = 46 AND disciplina = 'calistenia' AND nombre = 'Explosive dips / Dips en anillas';

-- =========================================================================
-- POWERLIFTING
-- =========================================================================

-- 475 Competition Deadlift: los straps no están permitidos en competición de
-- powerlifting; se eliminan del equipamiento. (actual: {Barra,Discos,Straps})
UPDATE app.ejercicios
SET equipamiento = ARRAY['Barra', 'Discos']
WHERE id = 475 AND disciplina = 'powerlifting' AND nombre = 'Competition Deadlift (conv/sumo)';

-- Progresiones básicas por nivel (cadenas obvias; nombres exactos del JSON,
-- todos con progresion_desde/hacia en NULL antes de este parche).

-- Cadena sentadilla: Back Squat (barra alta) [P] -> Back Squat (barra baja) [I]
-- -> Competition Squat (max) [A] -> Max Effort Squat (comp) [E]
UPDATE app.ejercicios
SET progresion_hacia = 'Back Squat (barra baja)'
WHERE id = 496 AND disciplina = 'powerlifting' AND nombre = 'Back Squat (barra alta)';

UPDATE app.ejercicios
SET progresion_desde = 'Back Squat (barra alta)', progresion_hacia = 'Competition Squat (max)'
WHERE id = 439 AND disciplina = 'powerlifting' AND nombre = 'Back Squat (barra baja)';

UPDATE app.ejercicios
SET progresion_desde = 'Back Squat (barra baja)', progresion_hacia = 'Max Effort Squat (comp)'
WHERE id = 461 AND disciplina = 'powerlifting' AND nombre = 'Competition Squat (max)';

UPDATE app.ejercicios
SET progresion_desde = 'Competition Squat (max)'
WHERE id = 487 AND disciplina = 'powerlifting' AND nombre = 'Max Effort Squat (comp)';

-- Cadena sentadilla frontal: Front Squat (introducción) [P] -> Front Squat [I]
UPDATE app.ejercicios
SET progresion_hacia = 'Front Squat'
WHERE id = 499 AND disciplina = 'powerlifting' AND nombre = 'Front Squat (introducción)';

UPDATE app.ejercicios
SET progresion_desde = 'Front Squat (introducción)'
WHERE id = 443 AND disciplina = 'powerlifting' AND nombre = 'Front Squat';

-- Cadena press banca: Bench Press plano [P] -> Competition Bench Press [I]
-- -> Competition Bench (arco) [A] -> Max Effort Bench (comp) [E]
UPDATE app.ejercicios
SET progresion_hacia = 'Competition Bench Press'
WHERE id = 500 AND disciplina = 'powerlifting' AND nombre = 'Bench Press plano';

UPDATE app.ejercicios
SET progresion_desde = 'Bench Press plano', progresion_hacia = 'Competition Bench (arco)'
WHERE id = 444 AND disciplina = 'powerlifting' AND nombre = 'Competition Bench Press';

UPDATE app.ejercicios
SET progresion_desde = 'Competition Bench Press', progresion_hacia = 'Max Effort Bench (comp)'
WHERE id = 468 AND disciplina = 'powerlifting' AND nombre = 'Competition Bench (arco)';

UPDATE app.ejercicios
SET progresion_desde = 'Competition Bench (arco)'
WHERE id = 490 AND disciplina = 'powerlifting' AND nombre = 'Max Effort Bench (comp)';

-- Cadena peso muerto: Conventional Deadlift [P] y Sumo Deadlift (introducción) [P]
-- -> Sumo Deadlift [I] -> Competition Deadlift (conv/sumo) [A] -> Max Effort Deadlift (comp) [E]
UPDATE app.ejercicios
SET progresion_hacia = 'Competition Deadlift (conv/sumo)'
WHERE id = 504 AND disciplina = 'powerlifting' AND nombre = 'Conventional Deadlift';

UPDATE app.ejercicios
SET progresion_hacia = 'Sumo Deadlift'
WHERE id = 507 AND disciplina = 'powerlifting' AND nombre = 'Sumo Deadlift (introducción)';

UPDATE app.ejercicios
SET progresion_desde = 'Sumo Deadlift (introducción)', progresion_hacia = 'Competition Deadlift (conv/sumo)'
WHERE id = 449 AND disciplina = 'powerlifting' AND nombre = 'Sumo Deadlift';

UPDATE app.ejercicios
SET progresion_desde = 'Conventional Deadlift', progresion_hacia = 'Max Effort Deadlift (comp)'
WHERE id = 475 AND disciplina = 'powerlifting' AND nombre = 'Competition Deadlift (conv/sumo)';

UPDATE app.ejercicios
SET progresion_desde = 'Competition Deadlift (conv/sumo)'
WHERE id = 493 AND disciplina = 'powerlifting' AND nombre = 'Max Effort Deadlift (comp)';

-- Cadenas de variantes con pausa/déficit (mismo patrón, nivel superior):
UPDATE app.ejercicios
SET progresion_hacia = 'Pause Squat (3 segundos)'
WHERE id = 440 AND disciplina = 'powerlifting' AND nombre = 'Pause Squat (2 segundos)';

UPDATE app.ejercicios
SET progresion_desde = 'Pause Squat (2 segundos)'
WHERE id = 463 AND disciplina = 'powerlifting' AND nombre = 'Pause Squat (3 segundos)';

UPDATE app.ejercicios
SET progresion_hacia = 'Deficit Deadlift (4")'
WHERE id = 451 AND disciplina = 'powerlifting' AND nombre = 'Deficit Deadlift (2-3")';

UPDATE app.ejercicios
SET progresion_desde = 'Deficit Deadlift (2-3")'
WHERE id = 476 AND disciplina = 'powerlifting' AND nombre = 'Deficit Deadlift (4")';

-- =============================================================================
-- Fin del parche 03_puntuales.sql (53 UPDATEs)
-- =============================================================================

-- Normalizar convención: '-' en progresiones pasa a NULL (heavy_duty 31, hipertrofia 19)
UPDATE app.ejercicios SET progresion_desde=NULL, updated_at=now() WHERE progresion_desde='-';
UPDATE app.ejercicios SET progresion_hacia=NULL, updated_at=now() WHERE progresion_hacia='-';
