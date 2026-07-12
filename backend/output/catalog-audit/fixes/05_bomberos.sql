-- Parche 05: Ejercicios_Bomberos — textos de ejecucion/consejos/errores_evitar (43 filas)
-- + fixes menores (categoria Agilidad, descanso_seg 0, nota apnea)

-- 1 Natación 50m libre - Oficial
UPDATE app."Ejercicios_Bomberos" SET
ejecucion='Colócate en el borde de la piscina y realiza la salida desde fuera del agua según indique el tribunal. Entra hidrodinámico y aprovecha el deslizamiento inicial antes de empezar a nadar. Nada a crol con brazada larga y patada constante, respirando cada 2-3 brazadas. Mantén la trayectoria recta por el centro de la calle y termina tocando la pared con decisión.',
consejos='Entrena la salida y el deslizamiento: en 50 m pueden suponer 2-3 segundos. Respira cada 3 brazadas los primeros 25 m y cada 2 en el tramo final. No levantes la cabeza para mirar: usa la línea del fondo como referencia.',
errores_evitar='Tocar la corchera o cambiar de calle (descalifica). Salida en falso o antes de la señal. Levantar la cabeza al respirar, que hunde las caderas y frena. Llegar sin tocar claramente la pared.',
updated_at=now() WHERE exercise_id=1;

-- 2 Natación 100m libre - Oficial
UPDATE app."Ejercicios_Bomberos" SET
ejecucion='Salida desde fuera del agua o poyete según convocatoria. Nada los primeros 50 m a ritmo alto pero controlado, haz el viraje reglamentario tocando la pared y aprovecha el impulso. En el segundo largo mantén la técnica: brazada completa, rolido de hombros y patada continua. Administra el esfuerzo para poder apretar los últimos 25 m.',
consejos='El 100 se rompe en el tercer largo de 25: sal al 85-90% y no al 100%. Practica el viraje con voltereta o toque rápido hasta automatizarlo. Trabaja la respiración bilateral para no perder la línea recta.',
errores_evitar='Salir demasiado fuerte y morir en los últimos 25 m. Viraje sin tocar la pared o apoyándose en la corchera. Perder la técnica de brazada por fatiga: acortar la brazada consume más de lo que ahorra.',
updated_at=now() WHERE exercise_id=2;

-- 3 Buceo/Apnea 25m - Oficial (+ fix nota)
UPDATE app."Ejercicios_Bomberos" SET
ejecucion='Tras la señal, sumérgete y recorre 25 m completos por debajo de la superficie sin sacar ninguna parte del cuerpo. Impúlsate fuerte en la pared y aprovecha un deslizamiento largo en posición de flecha. Avanza con patada de braza subacuática u ondulación, con brazadas amplias y pausadas. Toca la pared final antes de emerger.',
consejos='Hiperventilar está prohibido y es peligroso: haz 2-3 respiraciones profundas y tranquilas antes de la salida. Menos brazadas y más deslizamiento: cada movimiento consume oxígeno. Mantente a 50-80 cm de profundidad, ni rozando la superficie ni pegado al fondo.',
errores_evitar='Sacar cualquier parte del cuerpo a la superficie antes de tocar la pared (invalida la prueba). Nadar demasiado rápido y quedarse sin aire a 5 m del final. Salir desorientado por no seguir la línea del fondo.',
notas='Completar la distancia; el baremo indica el tiempo máximo orientativo.',
updated_at=now() WHERE exercise_id=3;

-- 4 Técnica de crol - 400m
UPDATE app."Ejercicios_Bomberos" SET
ejecucion='Nada series de 100 m a ritmo cómodo centrándote en la técnica. Alarga la brazada: entrada de la mano delante del hombro, agarre del agua y empuje completo hasta el muslo. Respira de forma bilateral cada 3 brazadas y mantén el cuerpo alto y alineado en el agua. Descansa 20-30 segundos entre series.',
consejos='La técnica se entrena fresco: haz este trabajo al principio de la sesión. Incluye ejercicios de deslizamiento (punto muerto, brazada con un solo brazo). Cuenta las brazadas por largo e intenta reducirlas manteniendo el ritmo.',
errores_evitar='Nadar con prisa y técnica descuidada: refuerza defectos. Respirar siempre por el mismo lado, que desequilibra la brazada. Patada excesiva que dispara el pulso sin apenas propulsión.',
updated_at=now() WHERE exercise_id=4;

-- 5 Series 50m sprint
UPDATE app."Ejercicios_Bomberos" SET
ejecucion='Realiza 8-10 series de 50 m a intensidad de examen, con salida desde fuera del agua en cada repetición. Reproduce las condiciones de la prueba: salida explosiva, deslizamiento y nado a máxima velocidad manteniendo la técnica. Descansa lo suficiente entre series (1-2 minutos) para mantener la calidad.',
consejos='Cronometra todas las series y anótalas: el objetivo es acercar la peor serie a la mejor. Ensaya la salida exactamente como la pide tu convocatoria. Si el tiempo se degrada más de 2-3 segundos, alarga el descanso o corta la sesión.',
errores_evitar='Convertir el sprint en trabajo aeróbico por descansar poco. Descuidar la salida, que es parte de la marca. Terminar las series con técnica rota: velocidad sin forma no transfiere al examen.',
updated_at=now() WHERE exercise_id=5;

-- 6 Apnea estática
UPDATE app."Ejercicios_Bomberos" SET
ejecucion='En un medio seguro y siempre acompañado, realiza 3-5 apneas estáticas de 60-90 segundos. Respira de forma tranquila y profunda 2-3 minutos, haz una última inspiración amplia sin forzar y retén el aire relajando todo el cuerpo. Al terminar, recupera con respiraciones profundas y descansa 2-3 minutos entre series.',
consejos='La relajación es el 80% de la apnea: cualquier tensión muscular gasta oxígeno. Progresa el tiempo poco a poco (5-10 segundos por semana). En agua, jamás entrenes apnea sin supervisión directa.',
errores_evitar='Hiperventilar antes de la apnea: retrasa la señal de alarma y puede causar un desmayo súbito. Entrenar solo en el agua (riesgo real de ahogamiento). Buscar el máximo cada día en vez de acumular volumen cómodo.',
updated_at=now() WHERE exercise_id=6;

-- 7 Buceo dinámico 50m
UPDATE app."Ejercicios_Bomberos" SET
ejecucion='Realiza 2-4 recorridos de 50 m subacuáticos (o el doble de la distancia de examen) a ritmo pausado. Impúlsate en cada pared, desliza largo en posición hidrodinámica y avanza con patadas y brazadas amplias y eficientes. Emerge con calma, recupera por completo (3-4 minutos) antes de la siguiente serie.',
consejos='Entrenar por encima de la distancia del examen (50 vs 25 m) da un gran margen psicológico el día de la prueba. Prioriza la eficiencia sobre la velocidad: el buceo dinámico se gana deslizando. Hazlo siempre con socorrista o compañero vigilando.',
errores_evitar='Ritmo demasiado rápido que dispara el consumo de oxígeno. Nadar somero haciendo olas o rozando la superficie. Encadenar series sin recuperación completa, acumulando deuda de oxígeno.',
updated_at=now() WHERE exercise_id=7;

-- 8 Trepa de cuerda 6m - Oficial (H)
UPDATE app."Ejercicios_Bomberos" SET
ejecucion='Parte sentado o de pie según convocatoria, agarra la cuerda con ambas manos y sube 6 m usando exclusivamente los brazos, sin ayuda de las piernas. Alterna los agarres con tirones potentes, manteniendo el cuerpo lo más vertical posible y las piernas ligeramente flexionadas al frente o en L. Toca la marca o campana superior y desciende controlando el deslizamiento mano sobre mano.',
consejos='Sube con tirones largos: menos agarres significa menos tiempo en la cuerda. Trabaja el agarre con isométricos y dominadas lastradas; la presa suele fallar antes que el dorsal. Aprende a descender frenando con las manos alternas, nunca deslizando (quemaduras).',
errores_evitar='Impulsarse con las piernas o pies (invalida la prueba en la modalidad solo brazos). No tocar claramente la marca superior. Descender en caída libre agarrando la cuerda: causa quemaduras y descontrol.',
updated_at=now() WHERE exercise_id=8;

-- 9 Trepa de cuerda 5.5m - Oficial (M)
UPDATE app."Ejercicios_Bomberos" SET
ejecucion='Parte sentada o de pie según convocatoria y sube 5,5 m de cuerda usando solo los brazos. Realiza tirones alternos potentes con el cuerpo vertical y el core firme para evitar el balanceo. Toca la marca superior y baja de forma controlada alternando las manos.',
consejos='El balanceo es el gran ladrón de fuerza: aprieta el abdomen y sube en línea. Entrena con dominadas, remo y trepa parcial con piernas hasta poder encadenar la subida completa. Usa magnesio si la convocatoria lo permite.',
errores_evitar='Ayudarse con piernas o pies (invalida la prueba). Pausas largas a mitad de cuerda: el agarre se agota en isométrico. Descenso descontrolado con riesgo de quemaduras.',
updated_at=now() WHERE exercise_id=9;

-- 10 Dominadas agarre prono
UPDATE app."Ejercicios_Bomberos" SET
ejecucion='Cuélgate de la barra con agarre prono algo más ancho que los hombros y los brazos completamente extendidos. Tira hasta superar la barra con la barbilla, sin balanceo ni impulso de piernas. Baja controlando hasta la extensión completa y encadena las repeticiones a ritmo constante. Realiza 3-5 series dejando 1-2 repeticiones en reserva.',
consejos='El rango completo de las series de entrenamiento es lo que hace válidas las repeticiones del examen. Añade lastre cuando superes 10-12 repeticiones limpias. Aprieta la escápula antes de tirar: activa el dorsal y protege el hombro.',
errores_evitar='Repeticiones a medio rango que luego el tribunal no cuenta. Balanceo o kipping. Bajar en caída libre, desperdiciando la fase que más fuerza construye.',
updated_at=now() WHERE exercise_id=10;

-- 11 Trepa con piernas
UPDATE app."Ejercicios_Bomberos" SET
ejecucion='Sube la cuerda usando el bloqueo de piernas: agarra la cuerda alto, lleva las rodillas al pecho, atrapa la cuerda entre los pies (llave española o J-hook) y estira las piernas mientras subes las manos. Repite la secuencia con ritmo hasta completar los 6 m y baja controlando con la misma llave. Realiza 3-5 ascensos.',
consejos='Domina la llave de pies en el suelo antes de subir: es la base de toda la técnica. La pierna empuja y el brazo acompaña: no subas a fuerza de bíceps. Esta fase construye la confianza y el agarre para la trepa solo brazos.',
errores_evitar='Llave de pies floja que resbala a mitad de subida. Subir con los brazos y usar las piernas solo de adorno. Mirar hacia abajo al descender.',
updated_at=now() WHERE exercise_id=11;

-- 12 Trepa sin piernas parcial (3m)
UPDATE app."Ejercicios_Bomberos" SET
ejecucion='Sube 3 m de cuerda usando solo los brazos, con las piernas en L o ligeramente flexionadas al frente. Realiza tirones alternos completos y baja de forma controlada mano sobre mano. Completa 3-5 ascensos con descanso amplio entre ellos, aumentando la altura progresivamente cada semana.',
consejos='Es el puente perfecto entre dominadas y trepa completa: prioriza la calidad del tirón sobre la altura. Mantén el core apretado para no pendular. Cuando encadenes 3-5 subidas de 3 m, prueba 4-5 m antes que la cuerda completa.',
errores_evitar='Pasar a la cuerda completa sin dominar la parcial (fallo a media altura, con riesgo). Ayudarse con las piernas sin darse cuenta. Descansar colgado con brazos flexionados, que agota el agarre.',
updated_at=now() WHERE exercise_id=12;

-- 13 Isométrico en cuerda
UPDATE app."Ejercicios_Bomberos" SET
ejecucion='Sube a la cuerda y mantén la posición con los brazos flexionados (una mano sobre otra) durante 20-40 segundos, sin ayudarte de las piernas. Mantén el hombro activo y el abdomen firme para evitar el balanceo. Baja controlado y descansa 2-3 minutos entre las 3-4 series.',
consejos='Simula el momento más duro de la prueba: la mitad de la subida. Varía la altura del agarre y el ángulo del codo (90° es el más transferible). Combínalo en la misma sesión con trepa parcial.',
errores_evitar='Colgarse con los brazos totalmente estirados (trabaja poco el patrón de trepa). Aguantar hasta el fallo absoluto y bajar sin control. Contener la respiración durante todo el isométrico.',
updated_at=now() WHERE exercise_id=13;

-- 14 Dominadas máximas 30 seg - Oficial
UPDATE app."Ejercicios_Bomberos" SET
ejecucion='A la señal, realiza el máximo número de dominadas en 30 segundos. Cada repetición debe superar la barra con la barbilla y bajar hasta la extensión que marque el tribunal, sin balanceo. Busca un ritmo alto pero constante desde el primer segundo, con respiración rítmica.',
consejos='Estrategia: sal a ritmo vivo los primeros 15 segundos y aguanta el ritmo en los segundos finales; las pausas largas ya no se recuperan en 30 segundos. Entrena series al fallo y series con tiempo (EMOM de 30 segundos). Calienta el agarre y el dorsal a fondo antes de la prueba.',
errores_evitar='Repeticiones nulas por no superar la barbilla o no extender los codos: gastan tiempo y no cuentan. Kipping o balanceo si la convocatoria lo prohíbe. Salir tan rápido que a los 15 segundos ya no salga ninguna repetición válida.',
updated_at=now() WHERE exercise_id=14;
-- 15 Dominadas asistidas banda
UPDATE app."Ejercicios_Bomberos" SET
ejecucion='Coloca una banda elástica en la barra y apoya en ella un pie o rodilla. Cuélgate con agarre prono, brazos extendidos, y tira hasta superar la barra con la barbilla. Baja controlando la extensión completa. Realiza 3-4 series de 8-12 repeticiones con técnica impecable.',
consejos='Elige la banda que te permita 8-12 repeticiones limpias, ni una ayuda mayor. Cada 1-2 semanas pasa a una banda más fina hasta eliminarla. Combina con negativas para acelerar la progresión.',
errores_evitar='Depender de la misma banda durante meses sin progresar. Rebotar en la parte baja aprovechando el impulso de la goma. Rango incompleto arriba: la barbilla debe superar la barra también con asistencia.',
updated_at=now() WHERE exercise_id=15;

-- 16 Negativas de dominada
UPDATE app."Ejercicios_Bomberos" SET
ejecucion='Sube a la posición final de la dominada con un salto o apoyo (barbilla sobre la barra) y desciende lo más lento posible, controlando 5 segundos hasta la extensión completa de codos. Suelta, vuelve a subir con ayuda y repite 5-8 veces por serie, 3-5 series.',
consejos='La fase excéntrica construye la fuerza que luego permite la dominada completa: sé paciente y cuenta los 5 segundos reales. Controla especialmente el último tercio, donde más se acelera. Descansa 2 minutos entre series.',
errores_evitar='Dejarse caer los últimos grados con los codos casi extendidos (zona de riesgo articular). Hacer negativas rápidas por fatiga: mejor cortar la serie. Encoger los hombros hacia las orejas durante el descenso.',
updated_at=now() WHERE exercise_id=16;

-- 17 Dominadas explosivas
UPDATE app."Ejercicios_Bomberos" SET
ejecucion='Desde el cuelgue con brazos extendidos, tira de forma explosiva intentando llevar el pecho a la barra o superar la barbilla con velocidad máxima. Baja controlado y encadena 5-8 repeticiones potentes por serie, 4-6 series con descanso amplio (2-3 minutos).',
consejos='La intención de velocidad es lo que importa: cada repetición debe ser lo más rápida posible. Corta la serie cuando pierdas velocidad, no cuando llegues al fallo. Transfiere directamente al ritmo alto de la prueba de 30 segundos.',
errores_evitar='Convertirlas en kipping con latigazo de piernas. Hacerlas fatigado al final de la sesión (la potencia se entrena fresco). Perder el control en la bajada tras el tirón explosivo.',
updated_at=now() WHERE exercise_id=17;

-- 18 Series máximas de dominadas
UPDATE app."Ejercicios_Bomberos" SET
ejecucion='Realiza 3-5 series de dominadas al fallo técnico (la última repetición completa que puedas hacer con buena forma), con descansos amplios de 3-4 minutos. Mantén el mismo estándar del examen: barbilla sobre la barra y extensión completa abajo.',
consejos='Anota el total de repeticiones de la sesión y busca superarlo cada semana. El descanso largo es clave: el objetivo es volumen de calidad, no congestión. Una vez por semana es suficiente; combina con trabajo asistido y explosivo.',
errores_evitar='Fallo absoluto con repeticiones a medio rango que ensucian el patrón. Descansos cortos que hunden las series siguientes. Entrenar al fallo la semana del examen.',
updated_at=now() WHERE exercise_id=18;

-- 19 Carrera 100m - Oficial
UPDATE app."Ejercicios_Bomberos" SET
ejecucion='Salida de pie tras la línea: a la señal, acelera de forma progresiva los primeros 20-30 m con el tronco inclinado y zancadas potentes. Alcanza la máxima velocidad hacia el metro 40-60 y mantenla con el tronco erguido, brazos activos a 90 grados y zancada amplia. No frenes antes de la meta: cruza la línea a tope.',
consejos='La aceleración inicial decide la prueba: entrena salidas de 20-30 m específicas. Corre relajado de cara y hombros; la tensión acorta la zancada. Calienta con progresivos y algún sprint corto antes de la prueba.',
errores_evitar='Salida en falso (puede descalificar). Erguirse de golpe en los primeros metros perdiendo la aceleración. Mirar a los lados o frenar en los últimos 5 m.',
updated_at=now() WHERE exercise_id=19;

-- 20 Carrera 200m - Oficial
UPDATE app."Ejercicios_Bomberos" SET
ejecucion='Salida de pie y aceleración fuerte los primeros 30-40 m. Si hay curva, corre pegado al interior de la calle inclinando ligeramente el cuerpo hacia dentro. Mantén una velocidad alta y controlada por la contrarrecta y aprieta los últimos 50 m manteniendo la técnica pese a la fatiga.',
consejos='El 200 no es un sprint al 100% desde el primer metro: sal al 90-95% y decide en la recta final. Entrena series de 120-150 m a ritmo de examen. Trabaja la técnica de curva específicamente si tu pista la incluye.',
errores_evitar='Salir al máximo absoluto y bloquearte muscularmente a los 120 m. Abrirte en la curva recorriendo metros de más. Perder la forma (talones al glúteo, brazos cruzados) en los metros finales.',
updated_at=now() WHERE exercise_id=20;

-- 21 Sprints 60m
UPDATE app."Ejercicios_Bomberos" SET
ejecucion='Tras un calentamiento completo, realiza 6-8 sprints de 60 m a intensidad máxima con salida de pie. Concéntrate en la fase de aceleración (primeros 30 m) y en mantener la velocidad punta sin tensarte. Recupera andando de vuelta y descansando 2-3 minutos entre series.',
consejos='Calidad sobre cantidad: si el tiempo empeora claramente, termina la sesión. Alterna sesiones con énfasis en salida (primeros 20 m) y en velocidad lanzada. Superficie y calzado adecuados para evitar lesiones de isquios.',
errores_evitar='Sprints sin calentamiento específico (riesgo alto de rotura de isquios). Descansos cortos que convierten la velocidad en resistencia. Correr apretando la mandíbula y los puños: la velocidad sale de la relajación.',
updated_at=now() WHERE exercise_id=21;

-- 22 Técnica de salida
UPDATE app."Ejercicios_Bomberos" SET
ejecucion='Coloca el pie fuerte adelantado tras la línea, tronco inclinado y peso en la pierna delantera. A la señal, empuja con fuerza y da los primeros 8-10 pasos cortos y potentes aumentando la amplitud de forma progresiva, con el tronco elevándose gradualmente. Realiza 10-15 salidas de 20 m con recuperación completa.',
consejos='Los primeros 20 m deciden la prueba de 100 m: automatiza la secuencia hasta no pensarla. Grábate en vídeo para corregir el ángulo del tronco. Practica con la voz de mando real de tu convocatoria.',
errores_evitar='Erguirse en los 2-3 primeros pasos. Primer paso demasiado largo, que frena en vez de acelerar. Adelantar el peso tanto que la salida sea un tropiezo.',
updated_at=now() WHERE exercise_id=22;

-- 23 Series HIIT 400m
UPDATE app."Ejercicios_Bomberos" SET
ejecucion='Corre 4-6 repeticiones de 400 m a ritmo fuerte y constante (85-90% del esfuerzo), con recuperación de 2-3 minutos andando o al trote suave. Mantén la misma marca en todas las series: la regularidad es el objetivo. Termina con vuelta a la calma de 10 minutos.',
consejos='Calcula el ritmo objetivo a partir de tu marca de 2800-3000 m y corre las series ligeramente más rápido. Cronometra todas las repeticiones: la última no debería ser más de 2-3 segundos peor que la primera. Una sesión semanal es suficiente junto al resto del plan.',
errores_evitar='Primera serie demasiado rápida que arruina las siguientes. Recuperaciones parado en vez de en movimiento. Hacer HIIT días consecutivos sin recuperación.',
updated_at=now() WHERE exercise_id=23;

-- 24 Carrera 2800m - Oficial
UPDATE app."Ejercicios_Bomberos" SET
ejecucion='Prueba continua de 2800 m (7 vueltas a pista de 400 m). Sal a tu ritmo objetivo desde el primer metro, sin dejarte arrastrar por el grupo. Mantén zancada económica, respiración rítmica y parciales controlados cada vuelta. Si llegas con reservas, aprieta la última vuelta de forma progresiva.',
consejos='Calcula el parcial por vuelta según tu marca objetivo (para 12:00 son 1:43 por vuelta) y ensáyalo hasta clavarlo. Corre la semana previa un test de 2000 m a ritmo de examen para ajustar. Sitúate delante en la salida para evitar frenazos, pero no esprintes los primeros 200 m.',
errores_evitar='Salir 10-15 segundos por encima del ritmo en la primera vuelta: se paga doble al final. Cambios de ritmo constantes para adelantar por fuera. No conocer tus parciales y correr a sensaciones el día del examen.',
updated_at=now() WHERE exercise_id=24;

-- 25 Carrera 3000m - Oficial
UPDATE app."Ejercicios_Bomberos" SET
ejecucion='Prueba continua de 3000 m (7,5 vueltas de pista). Establece el ritmo objetivo desde el inicio y controla los parciales cada 400 m. Corre relajado en el pelotón evitando codazos y frenazos, y administra las fuerzas para mantener o subir el ritmo en los últimos 600 m.',
consejos='Entrena series de 1000 m a ritmo de examen y rodajes suaves de base aeróbica durante semanas antes. Aprende a correr a ritmo constante con y sin gente alrededor. El último 400 se decide con la cabeza: llévalo ensayado.',
errores_evitar='Ritmo irregular vuelta a vuelta, que es el error que más tiempo cuesta. Salir en la última fila y gastar energía adelantando. Guardar tanto para el final que sobren fuerzas al cruzar la meta.',
updated_at=now() WHERE exercise_id=25;

-- 26 Carrera continua 5km
UPDATE app."Ejercicios_Bomberos" SET
ejecucion='Corre 5 km a ritmo cómodo y conversacional (poder hablar sin ahogarte), 2-3 veces por semana. Mantén una cadencia ágil con pasos cortos y una postura erguida y relajada. Es la base aeróbica sobre la que se construyen las series y el ritmo de examen.',
consejos='La base aeróbica se construye despacio: no conviertas los rodajes en tests. Alterna superficies (pista, tierra, asfalto) para reducir impactos. Añade progresiones suaves de 80-100 m al final para trabajar la técnica.',
errores_evitar='Correr los rodajes demasiado rápido y llegar cansado a las sesiones de calidad. Aumentar el kilometraje semanal más de un 10%. Ignorar molestias repetidas en tibia o rodilla (antesala de lesión).',
updated_at=now() WHERE exercise_id=26;

-- 27 Intervalos 1000m
UPDATE app."Ejercicios_Bomberos" SET
ejecucion='Corre 5-6 repeticiones de 1000 m al 90% del esfuerzo, a ritmo igual o ligeramente superior al de tu prueba oficial, con 2-3 minutos de recuperación al trote. Mantén parciales estables en todas las repeticiones y termina la sesión con la sensación de poder hacer una más.',
consejos='Es la sesión más específica para el 2800-3000: hazla una vez por semana las 6-8 semanas previas. Usa la primera repetición como calibre y ajusta. Controla el paso cada 200 m para no despistarte del ritmo.',
errores_evitar='Convertir cada repetición en una carrera al máximo. Recuperación parada o demasiado larga que rompe el estímulo. Cambiar de superficie o distancia cada semana, imposibilitando comparar.',
updated_at=now() WHERE exercise_id=27;

-- 28 Fartlek 30 minutos
UPDATE app."Ejercicios_Bomberos" SET
ejecucion='Corre 30 minutos alternando tramos rápidos y lentos de forma libre o estructurada (por ejemplo, 1 minuto fuerte y 2 suaves). Los cambios deben ser francos: el tramo fuerte cerca del ritmo de examen y el suave al trote de recuperación. 1-2 sesiones semanales.',
consejos='El fartlek enseña a cambiar de ritmo, útil para adelantamientos y para el último 400 de la prueba. Empieza con más recuperación que esfuerzo e invierte la proporción con las semanas. Hazlo en terreno variado para sumar fuerza de piernas.',
errores_evitar='Correr todo el fartlek a ritmo medio uniforme sin cambios reales. Esprintar los tramos fuertes hasta el agotamiento en los primeros 10 minutos. Saltarse el calentamiento previo de 10 minutos.',
updated_at=now() WHERE exercise_id=28;

-- 29 Press Banca 40kg - Oficial (H) (+ fix descanso)
UPDATE app."Ejercicios_Bomberos" SET
ejecucion='Tumbado en el banco con los pies firmes en el suelo, agarra la barra de 40 kg algo más ancho que los hombros. A la señal, realiza el máximo número de repeticiones en el tiempo marcado: baja la barra hasta tocar el pecho y sube hasta la extensión completa de codos en cada repetición. Mantén glúteos y hombros en contacto con el banco todo el tiempo.',
consejos='Encuentra tu ritmo sostenible: repeticiones fluidas y continuas rinden más que ráfagas con pausas. Aprovecha el toque de pecho reglamentario sin rebotar. Entrena con el peso exacto del examen las semanas previas para automatizar el ritmo.',
errores_evitar='Repeticiones nulas por no tocar el pecho o no extender los codos. Rebotar la barra en el pecho (suele invalidar la repetición). Levantar los glúteos del banco al fatigarte.',
descanso_seg=300,
updated_at=now() WHERE exercise_id=29;

-- 30 Press Banca 30kg - Oficial (M) (+ fix descanso)
UPDATE app."Ejercicios_Bomberos" SET
ejecucion='Tumbada en el banco con los pies firmes en el suelo, agarra la barra de 30 kg algo más ancho que los hombros. A la señal, realiza el máximo número de repeticiones: la barra debe tocar el pecho abajo y los codos extenderse por completo arriba en cada repetición. Mantén glúteos y hombros pegados al banco.',
consejos='Ritmo constante desde el primer segundo: las pausas largas no se recuperan en 30 segundos. Entrena tanto fuerza máxima (series de 5-8) como resistencia con el peso oficial. Ensaya el estándar exacto de tu tribunal (toque de pecho, extensión).',
errores_evitar='Repeticiones a medio rango que no cuentan. Arquear en exceso la zona lumbar despegando los glúteos. Agarre demasiado estrecho que sobrecarga los tríceps antes de tiempo.',
descanso_seg=300,
updated_at=now() WHERE exercise_id=30;
-- 31 Press banca fuerza
UPDATE app."Ejercicios_Bomberos" SET
ejecucion='Realiza 4-5 series de 5-8 repeticiones con un peso exigente pero técnico. Baja la barra controlada hasta el pecho, con los codos a unos 45 grados del torso, y empuja con fuerza hasta la extensión completa. Mantén escápulas retraídas, pies firmes y glúteos en el banco. Descansa 2-3 minutos entre series.',
consejos='Cuanta más fuerza máxima tengas, más ligeros se sentirán los 40/30 kg del examen. Progresa el peso solo cuando completes todas las series con buena forma. Usa un compañero o los topes de seguridad en las series pesadas.',
errores_evitar='Rebotar la barra en el pecho para levantar más peso. Codos completamente abiertos a 90 grados, que castigan el hombro. Sacrificar el rango de movimiento por cargar más discos.',
updated_at=now() WHERE exercise_id=31;

-- 32 Press banca resistencia
UPDATE app."Ejercicios_Bomberos" SET
ejecucion='Con el peso oficial del examen (40 kg hombres / 30 kg mujeres), realiza 3-4 series de 15-20 repeticiones fluidas y completas: toque de pecho abajo y extensión total arriba. Busca un ritmo constante y económico, respirando en cada repetición. Descansa 2 minutos entre series.',
consejos='Es el entrenamiento más específico para la prueba: clava el estándar del tribunal en cada repetición. Cronometra series de 30 segundos de vez en cuando para medir tu marca real. Trabaja el ritmo respiratorio: exhalar al empujar.',
errores_evitar='Acortar el rango cuando llega la fatiga (en el examen serían nulas). Ritmo en ráfagas con paradas largas. Entrenar siempre al fallo: deja 2-3 repeticiones en reserva casi siempre.',
updated_at=now() WHERE exercise_id=32;

-- 33 Flexiones máximas - Oficial (+ fix descanso)
UPDATE app."Ejercicios_Bomberos" SET
ejecucion='En posición de plancha con manos a la anchura de los hombros y el cuerpo alineado de cabeza a talones, realiza el máximo número de flexiones válidas. Baja hasta que el pecho quede a unos 6 cm del suelo (o toque el testigo del tribunal) y sube hasta la extensión completa de codos. Mantén el core firme durante toda la prueba.',
consejos='Ritmo constante y económico: mejor una cadencia sostenida que ráfagas. Respira en cada repetición (bajar-inhalar, subir-exhalar). Entrena series al fallo y series con estándar estricto de profundidad.',
errores_evitar='Quebrar la cadera (arriba o abajo): el tribunal anula la repetición. Medias flexiones sin llegar a la profundidad exigida. Abrir los codos en cruz, que agota el hombro antes de tiempo.',
descanso_seg=300,
updated_at=now() WHERE exercise_id=33;

-- 34 Flexiones estándar
UPDATE app."Ejercicios_Bomberos" SET
ejecucion='Realiza 3-5 series de 10-15 flexiones técnicas: cuerpo recto de cabeza a talones, manos bajo los hombros, codos a unos 45 grados. Baja controlado hasta rozar el suelo con el pecho y empuja hasta la extensión completa. Descansa 60-90 segundos entre series.',
consejos='La técnica perfecta en el entrenamiento es lo que hace válidas las repeticiones del examen. Aprieta glúteos y abdomen en cada repetición para mantener la línea. Cuando superes 15-20 repeticiones limpias, añade lastre o pasa a variantes más duras.',
errores_evitar='Cadera caída o en pico. Rango parcial por prisa. Manos demasiado adelantadas, que restan fuerza y cargan el hombro.',
updated_at=now() WHERE exercise_id=34;

-- 35 Flexiones explosivas
UPDATE app."Ejercicios_Bomberos" SET
ejecucion='Desde la posición de flexión, baja controlado y empuja con la máxima velocidad posible, despegando las manos del suelo si puedes. Amortigua la caída y encadena 8-12 repeticiones potentes. Realiza 4-5 series con 2 minutos de descanso.',
consejos='La potencia mejora tu ritmo en la prueba de máximas: cada repetición debe ser explosiva de verdad. Hazlas al principio de la sesión, con los músculos frescos. Si aún no despegas las manos, empuja a máxima velocidad sin despegue.',
errores_evitar='Perder la alineación corporal al despegar. Caer con los codos bloqueados (riesgo articular). Hacerlas con fatiga acumulada, cuando ya no hay velocidad real.',
updated_at=now() WHERE exercise_id=35;

-- 36 Series máximas flexiones
UPDATE app."Ejercicios_Bomberos" SET
ejecucion='Realiza 3-4 series de flexiones al fallo técnico manteniendo el estándar del examen (pecho a 6 cm del suelo, extensión completa). Descansa 3 minutos entre series para que cada una sea de calidad. Registra el total y busca superarlo semana a semana.',
consejos='El objetivo es superar con margen el mínimo de tu convocatoria: si pide 17, entrena hasta hacer 25-30. Una sesión semanal al fallo es suficiente; el resto, series submáximas. Simula la prueba completa (con tiempo y estándar) cada 2-3 semanas.',
errores_evitar='Contar repeticiones que el tribunal anularía. Hacer fallo absoluto en cada sesión (estanca el progreso). Descansos cortos que convierten la fuerza-resistencia en fatiga sin más.',
updated_at=now() WHERE exercise_id=36;

-- 37 Lanzamiento balón medicinal 5kg (H) - Oficial
UPDATE app."Ejercicios_Bomberos" SET
ejecucion='De pie tras la línea con los pies a la anchura de los hombros (fijos en el suelo), sujeta el balón de 5 kg con ambas manos por detrás de la cabeza. Arquea ligeramente el tronco hacia atrás y lanza hacia delante con extensión potente de todo el cuerpo, soltando el balón en un ángulo de unos 45 grados. Los pies no pueden despegarse ni pisar la línea; suele haber 2 intentos.',
consejos='La distancia sale de la cadena completa (piernas-core-brazos), no solo de los brazos: entrena la secuencia. Busca el ángulo de salida de 40-45 grados; lanzar demasiado plano o alto resta metros. Usa el primer intento seguro y arriesga en el segundo.',
errores_evitar='Despegar los talones o saltar al lanzar (intento nulo). Pisar la línea al soltar o después. Lanzar solo con brazos sin transferir el peso corporal.',
updated_at=now() WHERE exercise_id=37;

-- 38 Lanzamiento balón medicinal 3kg (M) - Oficial
UPDATE app."Ejercicios_Bomberos" SET
ejecucion='De pie tras la línea con los pies fijos a la anchura de los hombros, sujeta el balón de 3 kg con ambas manos por detrás de la cabeza. Carga el tronco ligeramente atrás y lanza con una extensión explosiva de piernas, core y brazos, soltando a unos 45 grados. Los pies deben permanecer en el suelo; suele haber 2 intentos.',
consejos='Trabaja la potencia de core y hombros con lanzamientos variados en el entrenamiento. El ángulo de salida importa tanto como la fuerza: practica hasta encontrar tu punto óptimo. Asegura el primer intento y busca el récord en el segundo.',
errores_evitar='Saltar o levantar los talones en el lanzamiento (nulo). Soltar el balón demasiado tarde y lanzarlo plano. Flexionar solo los brazos sin usar las piernas.',
updated_at=now() WHERE exercise_id=38;

-- 39 Técnica de lanzamiento
UPDATE app."Ejercicios_Bomberos" SET
ejecucion='Realiza 3-4 series de 10-15 lanzamientos técnicos con un balón ligero o el oficial, centrándote en la secuencia: carga atrás, extensión de piernas, transferencia del peso al frente y latigazo final de brazos. Marca una línea en el suelo y respeta la norma de pies fijos en todos los lanzamientos.',
consejos='Graba los lanzamientos de perfil para revisar el ángulo de salida. Ensaya siempre con la norma del examen (pies fijos) para no automatizar un gesto ilegal. La técnica bien hecha vale más metros que un mes de fuerza.',
errores_evitar='Practicar con saltito final que luego será nulo en el examen. Lanzar siempre a máxima intensidad sin pulir el gesto. Ángulo de salida plano por soltar tarde.',
updated_at=now() WHERE exercise_id=39;

-- 40 Lanzamientos potencia
UPDATE app."Ejercicios_Bomberos" SET
ejecucion='Con el balón del peso oficial, realiza 4-5 series de 5-8 lanzamientos a máxima distancia, en condiciones de examen (pies fijos tras la línea). Recupera por completo entre lanzamientos (30-60 segundos) y entre series (2-3 minutos) para que cada intento sea de máxima calidad.',
consejos='Pocas repeticiones y máximas: la potencia no se entrena con fatiga. Mide las distancias y lleva registro para ver la progresión. Combina en la semana con trabajo de fuerza general (empujes, sentadillas, core).',
errores_evitar='Hacer 20-30 lanzamientos seguidos con técnica degradada. No respetar la norma de pies en el entrenamiento. Lanzar sin calentar hombros y zona lumbar.',
updated_at=now() WHERE exercise_id=40;

-- 41 Plancha abdominal (+ fix categoria)
UPDATE app."Ejercicios_Bomberos" SET
ejecucion='Apóyate sobre antebrazos y puntas de los pies con el cuerpo formando una línea recta de cabeza a talones. Aprieta abdomen y glúteos y mantén la posición 60-120 segundos (45-90 en progresión), respirando de forma continua. Realiza 3-4 series con 60-90 segundos de descanso.',
consejos='Un core fuerte mejora todas las pruebas: carrera, dominadas, press y lanzamiento. Antes que aguantar más tiempo con mala postura, aguanta menos con postura perfecta. Progresa con variantes (apoyo inestable, plancha con toques de hombro).',
errores_evitar='Cadera caída que transfiere la carga a la zona lumbar. Cadera en pico que convierte el ejercicio en descanso. Contener la respiración.',
categoria='Acondicionamiento',
updated_at=now() WHERE exercise_id=41;

-- 42 Burpees (+ fix categoria)
UPDATE app."Ejercicios_Bomberos" SET
ejecucion='Desde de pie, agáchate y apoya las manos, lanza los pies atrás a posición de plancha, haz una flexión (si tu variante la incluye), recoge los pies y salta extendiendo todo el cuerpo con palmada sobre la cabeza. Encadena 15-20 repeticiones (12-18 en progresión) a ritmo constante, 3-4 series.',
consejos='Es el mejor simulador del esfuerzo mixto del examen (fuerza + cardio): entrénalo con ritmo objetivo, no a lo loco. Marca un ritmo sostenible desde la primera repetición. Aterriza los saltos con las rodillas ligeramente flexionadas.',
errores_evitar='Arquear la lumbar al lanzar los pies atrás. Saltos sin extensión completa de cadera. Empezar demasiado rápido y desplomarse a mitad de la serie.',
categoria='Acondicionamiento',
updated_at=now() WHERE exercise_id=42;

-- 43 Sentadillas peso corporal
UPDATE app."Ejercicios_Bomberos" SET
ejecucion='De pie con los pies a la anchura de los hombros, baja flexionando rodillas y cadera hasta que los muslos queden al menos paralelos al suelo, con el pecho erguido y los talones apoyados. Sube extendiendo por completo la cadera. Realiza 3-4 series de 20-30 repeticiones fluidas.',
consejos='Es la base de fuerza de piernas para la carrera y el resto de pruebas: hazlas con rango completo. Cuando superes 30 repeticiones fáciles, progresa a zancadas, sentadilla búlgara o con lastre. Mantén las rodillas alineadas con las puntas de los pies.',
errores_evitar='Levantar los talones o dejar caer el pecho. Rango parcial (cuartos de sentadilla). Rodillas colapsando hacia dentro en las últimas repeticiones.',
updated_at=now() WHERE exercise_id=43;
