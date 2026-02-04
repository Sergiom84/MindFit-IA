# Especificación unificada del sistema de nutrición (MindFit / MindFeed)

Versión: 0.1 (unificada)  
Estado: lista para implementación backend (determinista + auditable)  
Fuentes: documentos internos v2 (TMB/GCT, perfil metabólico, control de fase), puente Entrenamiento<->Nutrición, y gestión de saltos de dieta (docx).

## 1. Objetivo y alcance

Implementar un sistema nutricional completo, determinista y explicable que:

- Calcule TMB (tasa metabólica basal) y GCT (gasto calórico total).
- Defina objetivo calórico por fase (volumen, definición, normocalórica).
- Determine perfil metabólico (tolerancia a carbohidratos) mediante score cuantificado.
- Asigne macronutrientes con guardarraíles fisiológicos (mínimos de proteína y grasas).
- Controle la evolución con reglas tipo semáforo basadas en métricas corporales y rendimiento.
- Gestione “saltos de dieta” sin romper la carga calórica semanal objetivo.
- Se integre con el módulo de entrenamiento mediante un contrato de datos (inputs/outputs) y reglas de sinergia (carb cycling, deload, fatiga, lesión).

Fuera de alcance (por ahora):

- Generación de menús/recetas, lista de compra, micronutrientes, suplementos.
- Diagnóstico médico o tratamiento de patologías.
- Integración profunda con trackers (solo se contempla pasos/NEAT como ajuste opcional).

## 2. Principios del sistema (no negociables)

### 2.1 Determinismo

Mismas entradas deben producir las mismas salidas. No se permite “a ojo”.

### 2.2 Anti ruido (para evitar decisiones por agua, glucógeno, estreñimiento, alcohol, etc.)

- No se cambia fase ni calorías por una sola semana.
- Toda acción relevante requiere:
  - Confirmación 2 semanas consecutivas del mismo estado, o
  - Uso de medias móviles de 14 días (peso y cintura como mínimo).

### 2.3 Una sola fuente de verdad

El objetivo calórico y macros vigentes viven en Nutrición. Entrenamiento no reescribe la dieta.

### 2.4 Explicabilidad y auditoría

Cada ajuste debe registrar:

- Qué se cambió (kcal/macros/fase/distribución de HC).
- Cuánto cambió (delta).
- Por qué cambió (regla/umbral/flags, fecha, métricas usadas).

## 3. Glosario

- **TMB**: Tasa Metabólica Basal.
- **GCT**: Gasto Calórico Total (TDEE).
- **WHtR**: Waist to Height Ratio = cintura(cm) / altura(cm).
- **Fase**: volumen (superávit), definición (déficit), normocalórica (mantenimiento/recomp).
- **ICG**: Índice Cintura/Kilo (volumen).
- **IPG**: Índice de Pérdida de Grasa (definición).
- **IEC**: Índice de Estabilidad Corporal (normocalórica).
- **CLS**: Carga semanal de entrenamiento (baja/media/alta o score 0-100).
- **S**: score metabólico (carb tolerance), positivo tiende a intolerante, negativo tiende a tolerante.

## 4. Datos de entrada, validación y normalización

### 4.1 Inputs mínimos (para cálculo inicial)

- sexo: {hombre, mujer}
- edad: años
- altura_cm
- peso_kg
- nivel_entrenamiento: {principiante, intermedio, avanzado}
- actividad_base: {sedentario, ligeramente_activo, activo, muy_activo}
- entrenos_semana: entero (4 a 6 en tabla base)
  Opcionales:
- cintura_cm
- %graso (si existe)
- pasos_diarios (media semanal o media 14 días)

### 4.2 Validaciones (hard rules)

- unidades: kg, cm, años.
- rangos razonables:
  - edad: 14 a 80
  - altura: 120 a 220 cm
  - peso: 30 a 250 kg
    Si se sale de rango: bloquear cálculo y pedir corrección.

### 4.3 Detección de mediciones sospechosas (bloquea ajustes)

Se solicita repetir medición y se pospone ajuste si:

- cintura cambia > 2,5 cm en 7 días sin cambio de peso coherente.
- peso cambia > 2,0% en 7 días sin cambios coherentes en cintura y/o pliegue.
- pliegue abdominal cambia ±20% en 7 días.
- el usuario indica condiciones distintas (hora, post comida, post entreno, etc.).

### 4.4 Cálculos derivados

- WHtR = cintura_cm / altura_cm (si hay cintura).
- “Alta grasa” si:
  - %graso disponible: usar umbral de seguridad del sistema (ver regla Tinsley).
  - si no hay %graso: alta grasa si WHtR >= 0,55.

## 5. Motor de cálculo calórico

### 5.1 Selección automática de ecuación de TMB

Definiciones de nivel de entrenamiento:

- principiante: 0 a 6 meses de entreno estructurado o vida sedentaria.
- intermedio: 6 a 24 meses consistente.
- avanzado: más de 24 meses consistente y progreso real.

Reglas de decisión (en orden):

1. Si nivel_entrenamiento = principiante o sedentario: usar Harris & Benedict.
2. Si edad >= 50 o altura extrema:
   - hombre: altura_cm >= 190 o <= 160
   - mujer: altura_cm >= 175 o <= 150
     entonces usar Mifflin & St Jeor.
3. Si nivel_entrenamiento = intermedio y edad <= 40: usar Twan Ten Haaf.
4. Si hombre, avanzado, peso_kg >= 80 y NO alta grasa:
   - %graso <= 18% o WHtR < 0,52
     entonces usar Tinsley.
5. Fallback: Mifflin & St Jeor.

Regla de seguridad:

- Nunca usar Tinsley si hay sobrepeso/alta grasa por %graso o WHtR, aunque el usuario se declare avanzado.

### 5.2 Fórmulas de TMB

Todas las fórmulas deben implementarse con unidad consistente.

**Tinsley (solo hombres avanzados sin alta grasa):**

- TMB = 24,8 \* peso_kg + 10

**Twan Ten Haaf:**

- Hombres: (11,936 _ kg) + (587,728 _ altura_m) - (8,129 \* edad) + 191,027 + 29,279
- Mujeres: (11,936 _ kg) + (587,728 _ altura_m) - (8,129 \* edad) + 29,279
  Nota: altura_m = altura_cm / 100.

**Mifflin & St Jeor:**

- Hombres: (10 _ kg) + (6,25 _ altura_cm) - (5 \* edad) + 5
- Mujeres: (10 _ kg) + (6,25 _ altura_cm) - (5 \* edad) - 161

**Harris & Benedict:**

- Hombres: 66,4730 + (13,7516 _ kg) + (5,0033 _ altura_cm) - (6,7550 \* edad)
- Mujeres: 655,0955 + (9,5634 _ kg) + (1,8449 _ altura_cm) - (4,6756 \* edad)

### 5.3 Factor de actividad (base)

GCT = TMB \* factor_actividad

Tabla base (actividad_base x entrenos_semana):

- Sedentario (oficina):
  - 4 entrenos: 1,3
  - 5 entrenos: 1,4
  - 6 entrenos: 1,5
- Ligeramente activo (de pie, caminar):
  - 4 entrenos: 1,5
  - 5 entrenos: 1,6
  - 6 entrenos: 1,7
- Activo (escaleras, caminar rápido):
  - 4 entrenos: 1,7
  - 5 entrenos: 1,8
  - 6 entrenos: 1,9
- Muy activo (carga/descarga, construcción):
  - 4 entrenos: 1,9
  - 5 entrenos: 2,0
  - 6 entrenos: 2,1

### 5.4 Ajuste por pasos (NEAT) opcional

Si el usuario conecta pasos, ajustar ligeramente el factor:

- < 5.000 pasos/día: factor -= 0,05 (mínimo 1,2)
- 5.000 a 7.500: sin cambios
- 7.500 a 10.000: factor += 0,05
- > 10.000: factor += 0,10 (máximo 2,2)

## 6. Objetivo calórico por fase

Una vez calculado GCT, se define objetivo calórico según fase:

- Definición (déficit): objetivo_kcal = GCT \* (0,80 a 0,90)
  - más cerca de 0,90 si %graso bajo o usuario avanzado.
- Normocalórica: objetivo_kcal = GCT
- Volumen (superávit): objetivo_kcal = GCT \* (1,05 a 1,12)
  - más cerca de 1,05 si usuario avanzado.

Guardarraíles de ajuste:

- Evitar cambios grandes: ajustes típicos 150 a 250 kcal/día por iteración.
- Si se ajusta caloría, mantener proteína estable y mover hidratos/grasas según perfil.

## 7. Perfil metabólico y distribución de macronutrientes

### 7.1 Cuestionario cuantificado y score S

Regla: puntos positivos desplazan hacia intolerante; negativos hacia tolerante.

Ítems y puntos:

- Somnolencia o bajada de energía tras comidas altas en carbohidratos: +2
- Energía estable tras comidas con carbohidratos (sin somnolencia): -2
- Despertarse por la noche con hambre tras cena con carbohidratos simples: +1
- Dormir mejor si consume fruta o carbohidratos antes de dormir: -1
- Preferencia marcada por alimentos grasos y salados frente a dulces: +1
- Preferencia marcada por alimentos dulces frente a salados: -1
- Acumulación de grasa abdominal con facilidad (patrón central): +2
- Puede estar varias horas sin comer sin síntomas negativos: -1
- Cansancio matutino frecuente / sensación de sueño prolongado: +1
- Responde bien a hidratos (no acumula grasa con facilidad en fases previas): -1

Cálculo:

- S = suma de puntos de los ítems respondidos.

Umbrales:

- S >= +4: Intolerante a los carbohidratos
- S <= -4: Tolerante a los carbohidratos
- -3 <= S <= +3: Mixto (equilibrado)

### 7.2 Nivel de confianza (calidad de respuesta)

- Alta: >= 8 ítems respondidos y <= 2 respuestas “no sé”
- Media: 6 a 7 ítems respondidos o 3 a 4 “no sé”
- Baja: <= 5 ítems respondidos o >= 5 “no sé”

Regla de seguridad:

- Confianza baja: asignar Mixto por defecto y bloquear cambios a perfiles extremos hasta mejorar datos.

### 7.3 Distribución porcentual por perfil

Aplicar sobre el objetivo calórico diario.

Tolerante a carbohidratos:

- Proteínas: 20% a 25%
- Carbohidratos: 50% a 60%
- Grasas: 15% a 25%

Intolerante a carbohidratos:

- Proteínas: 30% a 35%
- Carbohidratos: 20% a 30%
- Grasas: 35% a 45%

Mixto:

- Proteínas: 25% a 30%
- Carbohidratos: 35% a 40%
- Grasas: 30% a 35%

### 7.4 Guardarraíles mínimos y normalización

Mínimos recomendados:

- Proteína:
  - Definición: >= 2,0 g/kg
  - Normocalórica: >= 1,6 g/kg
  - Volumen: >= 1,6 g/kg (>= 1,8 g/kg si avanzado)
- Grasas: >= 0,6 g/kg o >= 20% del total calórico (usar el mayor)
- Carbohidratos: el resto tras fijar proteína y grasas

Algoritmo de normalización:

1. Aplicar porcentajes del perfil sobre objetivo_kcal -> kcal_P, kcal_HC, kcal_G.
2. Convertir a gramos:
   - P_g = kcal_P / 4
   - HC_g = kcal_HC / 4
   - G_g = kcal_G / 9
3. Verificar mínimos:
   - si P_g < P_min: fijar P_g = P_min y recalcular kcal restantes.
   - si G_g < G_min: fijar G_g = G_min y recalcular kcal restantes.
4. Asignar kcal restantes al macro restante, respetando preferencia del perfil si es posible.
5. Persistir macros finales (gramos y porcentajes reales post normalización).

## 8. Sistema de control por fase (semaforo)

### 8.1 Medición y frecuencia

- Medir 1 vez por semana, mismo día, misma hora, mismo estado fisiológico.
  Variables:
- peso_kg
- cintura_cm
- perímetros: bíceps, pecho, gemelo (cm)
- pliegue abdominal (mm, mismo punto)
- rendimiento: {sube, mantiene, baja}

### 8.2 Regla anti ruido y validación (aplica a todas las fases)

- Para decisiones que cambian kcal o fase:
  - confirmación 2 semanas o medias móviles 14 días.
- Si datos sospechosos (sección 4.3): repetir medición antes de actuar.

### 8.3 Indicadores por fase

#### 8.3.1 Volumen: ICG (Índice Cintura/Kilo)

Definición:

- ICG = delta_cintura_cm / delta_peso_kg
  Recomendación de implementación:
- usar deltas sobre medias móviles 14 días para evitar ruido (p. ej., media semana actual vs media de hace 14 días).
  Acciones por estado:
- ROJO: ICG >= 1,5
  - Ganancia de grasa excesiva.
  - Acción: pasar a normocalórica o definición 2 a 4 semanas.
- AMARILLO: 1,0 a 1,4
  - Volumen descontrolado.
  - Acción: reducir superávit 150 a 250 kcal/día.
- VERDE: 0,8 a 0,9
  - Volumen correcto.
  - Acción: mantener estrategia.
- VERDE+ (óptimo): 0,5 a 0,7
  - Muy eficiente.
  - Acción: mantener (o subir carga de entreno).

Complementos (pueden forzar recomendación de fin de volumen):

- pliegue abdominal > 20 mm (avanzados) o > 25 mm (intermedios).
- media de perímetros musculares crece < 0,3 cm/semana con ICG amarillo o rojo.
- “ganancia de grasa igual o superior a muscular” (si existe estimación en app).

#### 8.3.2 Definición: IPG (Índice de Pérdida de Grasa)

Definición:

- IPG = abs(delta_cintura_cm) / abs(delta_peso_kg) para periodo de evaluación
  Acciones por estado:
- ROJO: IPG < 0,6
  - Riesgo de pérdida muscular.
  - Acción: subir kcal +150 a +250 o diet break (7 a 14 días).
- AMARILLO: 0,6 a 0,8
  - Déficit agresivo.
  - Acción: mantener 7 a 14 días y observar.
- VERDE: 0,8 a 1,2
  - Definición eficiente.
  - Acción: mantener.
- VERDE+ (óptimo): 1,2 a 1,5
  - Muy buena pérdida de grasa.
  - Acción: mantener o microajuste.

Complementos:

- Ritmo de pérdida semanal (referencia usando media 14 días):
  - Principiante o %graso alto: 0,5% a 1,25%/sem
  - Intermedio: 0,5% a 1,0%/sem
  - Avanzado o %graso bajo: 0,25% a 0,75%/sem
- Descenso de perímetros musculares >= 0,5 cm/semana: alerta.
- Rendimiento baja 2 semanas consecutivas: sugerir diet break o normocalórica 2 a 4 semanas.
- Pliegue abdominal estable 14 días: reajustar macros o déficit.

#### 8.3.3 Normocalórica: IEC (Índice de Estabilidad Corporal)

Definición operativa:

- Evaluar variación conjunta en 14 días (medias móviles) de peso y cintura.
  Estados:
- ROJO: +1 kg y +1 cm en 14 días
  - Superávit no deseado.
  - Acción: reducir 150 kcal/día.
- AMARILLO: ±0,5 kg en 14 días
  - Oscilación normal.
  - Acción: mantener.
- VERDE: ±0,3 kg y cintura baja en 14 días
  - Recomp positiva.
  - Acción: mantener.
- VERDE+ (óptimo): peso estable y perímetros musculares suben
  - Acción: mantener o micro superávit.

Complementos:

- subida de grasa sin mejora muscular: micro déficit.
- bajada de peso no intencionada: micro superávit.
- rendimiento baja: ajustar hidratos (especialmente en días D2 si hay carb cycling).

### 8.4 Motor de decisiones de calorías (reglas de ajuste globales)

Este bloque unifica la calibración calórica con el control por fase. Se ejecuta cada 14 días y aplica anti ruido.

Regla general:

- Usar media de peso de 7 días y exigir 2 semanas consecutivas antes de cambios importantes.

Ajustes por fase (si adherencia alta):

- Normocalórica:
  - si el peso medio cambia > 0,5% en 14 días: ajustar +/- 150 kcal/día.
- Definición:
  - si pérdida < 0,3%/semana durante 2 semanas: bajar 150 a 250 kcal/día.
  - si pérdida > 1%/semana o cae rendimiento 2 semanas: subir 150 a 250 kcal/día o diet break.
- Volumen:
  - si ganancia < 0,15%/semana durante 2 semanas: subir 150 kcal/día.
  - si ganancia > 0,35%/semana y cintura sube rápido: bajar 150 a 250 kcal/día.

Nota de consistencia:

- ICG/IPG/IEC tienen prioridad para “interpretación cualitativa” y cambio de fase.
- Las reglas de %/semana sirven como guardarraíl adicional cuando faltan medidas (p. ej., no hay pliegues) o para validar coherencia.

## 9. Gestión de saltos de dieta (todas las fases)

### 9.1 Objetivo

Registrar un salto de dieta y mantener coherencia semanal sin castigar la adherencia. La corrección se aplica sobre carga semanal manteniendo proteína estable.

Regla clave:

- Si NO se supera la carga calórica semanal objetivo, el sistema puede dejar el salto como incidencia registrada sin compensación.

### 9.2 Campos a registrar

- fecha
- franja: {desayuno, comida, cena, extra}
- descripción
- calorías estimadas (kcal)
- macros estimados: proteína_g, carbohidratos_g, grasas_g
- confianza: {baja, media, alta}

### 9.3 Lógica de compensación semanal

Variables:

- objetivo_semana = kcal_objetivo_diario \* 7
- acumulado_semana = suma kcal (incluye saltos y registro normal si existe)
- desviación = acumulado_semana - objetivo_semana

Reglas:

1. Si desviación <= 0:
   - No compensar. Marcar salto como incidencia.
2. Si desviación > 0:
   - repartir corrección (kcal) entre los días restantes de la semana.
   - mantener proteína >= objetivo (y si fase definición, preferir >= 2 g/kg).
   - compensar sobre carbohidratos o grasas según fase.

Anti ruido por confianza:

- Si confianza = baja: aplicar corrección conservadora (p. ej., 50% de la corrección) y reevaluar al cierre semanal.

### 9.4 Notas por fase (opcional)

- Volumen: priorizar que la corrección recaiga primero sobre carbohidratos y luego grasas.
- Definición: mantener proteína y grasas mínimas; corrección suele recaer sobre carbohidratos.
- Normocalórica: corrección neutra o sin compensación si no se supera carga semanal.

### 9.5 Ejemplo

Objetivo: 3.000 kcal/día (21.000 kcal/semana). Sábado: salto +800 kcal.

- Si restan 2 días: corrección sugerida -400 kcal/día.
- Si confianza baja: aplicar -200 kcal/día y reevaluar al cierre semanal.

## 10. Puente Entrenamiento <-> Nutrición (contrato de datos)

### 10.1 Jerarquía de decisiones

- Nutrición decide: kcal y macros.
- Entrenamiento decide: volumen, intensidad, selección de ejercicios.
  Si hay conflicto, se registra y prevalece Nutrición en calorías/macros y Entrenamiento en volumen/intensidad.

### 10.2 Flujo A: Entrenamiento -> Nutrición (inputs)

Inputs mínimos:

- metodología_activa: {heavy_duty, hipertrofia, powerlifting, oposiciones, ...}
- calendario_semanal: días de entreno, descanso, orden de sesiones
- CLS: {baja, media, alta} o score 0-100
- rendimiento: {sube, mantiene, baja}
- flags:
  - deload: bool
  - fatiga_alta: bool
  - lesión: bool + zona

Inputs opcionales:

- volumen_objetivo: series efectivas por grupo o minutos
- intensidad_media: %1RM, RPE o RIR
- minutos_sesión
- pasos (NEAT)

Frecuencia:

- resumen semanal: 1 vez por semana
- eventos: en tiempo real (deload, lesión, fatiga alta)
- rendimiento: al cerrar cada sesión y consolidado semanal

### 10.3 Flujo B: Nutrición -> Entrenamiento (outputs)

Outputs mínimos:

- kcal_objetivo: diario y semanal + fase
- macros_objetivo: gramos y porcentajes finales post guardarraíles
- distribución semanal: días altos/bajos de carbohidratos si aplica (carb cycling)
- flags nutrición: déficit agresivo, riesgo pérdida muscular, diet break recomendado

Outputs opcionales:

- timing simple: % de carbohidratos alrededor del entreno (pre/post) en días duros
- score de adherencia (saltos, proteína, etc.)

### 10.4 Reglas de sinergia automatizables

#### 10.4.1 Carb cycling por carga del día (mantener kcal semanales)

Clasificar tipo de día:

- D0: descanso
- D1: entreno normal
- D2: entreno duro (según CLS alto y/o sesión demandante)

Reglas:

- proteína constante
- grasas respetan mínimo (>= 0,6 g/kg o >= 20% kcal)
- carbohidratos son el macro flexible

Delta recomendado:

- D2: +10% a +20% carbohidratos vs base
- D0: -10% a -20% carbohidratos (compensado)
  En déficit:
- limitar delta a +/-10% y priorizar recuperar rendimiento antes que apretar más.

#### 10.4.2 Deload y semanas de descarga

- si deload = true:
  - Nutrición no reacciona por una sola semana salvo superávit alto.
  - en superávit: reducir superávit a la mitad esa semana (p. ej., +10% a +5%).
  - en déficit: mantener kcal objetivo, permitir diet break si fatiga alta o rendimiento cae 2 semanas.
  - en normocalórica: mantener kcal, solo redistribuir carbohidratos según calendario real.

#### 10.4.3 Matriz de decisión (fatiga y rendimiento) con confirmación

Condiciones confirmadas (2 semanas o media 14 días):

- Definición + rendimiento baja 2 semanas + fatiga alta:
  - Nutrición: subir 150 a 250 kcal/día o diet break 7 a 14 días (proteína fija).
  - Entrenamiento: deload 1 semana o -20% a -30% volumen.
- Volumen + cintura sube rápido (ICG amarillo/rojo):
  - Nutrición: bajar 150 a 250 kcal/día o reducir % superávit (priorizar bajar carbohidratos).
  - Entrenamiento: revisar estímulo y evitar volumen basura.
- Normocalórica + rendimiento cae 2 semanas:
  - Nutrición: revisar carbohidratos en D2; si persiste, +150 kcal/día.
  - Entrenamiento: reducir fatiga y revisar progresión/RIR.

#### 10.4.4 Lesión y reducción de actividad

- lesión = true:
  - Entrenamiento adapta ejercicios y puede reducir sesiones.
  - Nutrición:
    - no recalcular GCT el mismo día
    - esperar 7 días y confirmar 14 días antes de cambiar factor de actividad
    - si sesiones bajan >= 2/semana durante 14 días: recalcular factor (o aplicar -0,05 a -0,10) y mantener proteína alta

### 10.5 Cadencia de recalculo (unificada)

- Diario: pasos (si existen), sueño (si existe), saltos de dieta (si existen)
- Por sesión: Entrenamiento actualiza rendimiento/fatiga; Nutrición solo redistribuye (carb cycling)
- Semanal (cada 7 días): resumen CLS, sesiones, adherencia
- Quincenal (cada 14 días): recalibración calórica y reevaluación perfil metabólico

## 11. Registro y persistencia (recomendado)

### 11.1 Snapshot semanal

- fecha
- fase activa
- kcal objetivo (día/semana)
- perfil metabólico (S + confianza + categoría)
- macros finales (g y % post normalización)
- ICG/IPG/IEC (según fase)
- CLS, rendimiento, flags (deload, fatiga, lesión)
- adherencia (saltos, proteína, etc.)

### 11.2 Log de cambios (auditoría)

Por cada cambio:

- timestamp
- tipo: {kcal_adjust, macro_adjust, phase_change, carb_cycle_adjust, activity_factor_adjust}
- delta
- regla_id (por ejemplo NUTR-DEF-001)
- razón (texto corto + métricas/umbrales)
- métricas usadas (payload)

## 12. Reglas ID sugeridas (para trazabilidad)

- NUTR-TMB-001: validación rangos
- NUTR-TMB-010: selección de ecuación
- NUTR-ACT-010: factor actividad base
- NUTR-ACT-020: ajuste por pasos
- NUTR-PHASE-010: objetivo calórico por fase
- NUTR-META-010: score metabólico y confianza
- NUTR-MACRO-010: guardarraíles y normalización
- NUTR-CTRL-VOL-010: ICG semáforo
- NUTR-CTRL-DEF-010: IPG semáforo
- NUTR-CTRL-NORM-010: IEC semáforo
- NUTR-CAL-RECAL-010: recalibración 14 días
- NUTR-JUMP-010: salto de dieta y compensación semanal
- NUTR-BRIDGE-010: carb cycling
- NUTR-BRIDGE-020: deload
- NUTR-BRIDGE-030: matriz fatiga/rendimiento
- NUTR-BRIDGE-040: lesión y ajuste actividad

## 13. Tests mínimos (checklist para backend)

- Selección de ecuación (cada regla y su fallback).
- Bloqueo Tinsley por alta grasa (WHtR >= 0,55).
- Factor de actividad base por combinatoria (actividad_base x entrenos_semana).
- Ajuste NEAT con clamps (min 1,2 max 2,2).
- Objetivo calórico por fase (rangos).
- Clasificación perfil metabólico (S, umbrales, confianza).
- Normalización de macros: proteína mínima, grasa mínima, carbs resto.
- Semáforo de fase: ICG/IPG/IEC y acciones recomendadas.
- Recalibración 14 días y límites de ajuste (150 a 250).
- Salto de dieta: no compensar si no supera semanal; compensar si supera; confianza baja reduce corrección.
- Integración con entrenamiento: carb cycling conserva kcal semanales y respeta mínimos.
