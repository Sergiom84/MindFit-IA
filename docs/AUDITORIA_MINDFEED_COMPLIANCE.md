# Auditoria MindFeed v1 - Backend/BD

## Alcance

- Fuente normativa: `docs/MindFeed_Compliance_Spec_v1.md`.
- Backend revisado: `backend/routes/hipertrofiaV2.js`, `backend/routes/adaptationBlock.js`, `backend/services/hipertrofiaV2/*`, `backend/migrations/*`.
- BD revisada: Supabase proyecto `sbqcnlwpvjavmljzkmfy` (tablas y funciones `app.*`).

## Metodologia

- Revision estatica de backend y scripts de soporte.
- Lectura de funciones SQL clave: `app.apply_microcycle_progression`, `app.check_deload_trigger`, `app.activate_deload`, `app.deactivate_deload`, `app.detect_neural_overlap`, `app.apply_fatigue_adjustments`, `app.evaluate_fatigue_action`, `app.detect_automatic_fatigue_flags`, `app.activate_muscle_priority`, `app.deactivate_muscle_priority`, `app.check_priority_timeout`, `app.calculate_mean_rir_last_microcycle`.
- Queries de verificacion sobre configuracion D1-D5 y un plan real (`app.methodology_plans` id 177).
- Conteo de tablas de evidencia para adaptacion y fatiga.

## Limitaciones de datos

- Sin registros en `app.adaptation_blocks`, `app.adaptation_criteria_tracking`, `app.adaptation_technique_flags`, `app.fatigue_flags`.
- Se valida el cumplimiento en codigo/SQL; no hay evidencia de ejecucion real en esos bloques.

## Resumen ejecutivo

- Adaptacion inicial no se auto-asigna por edad/nivel/inactividad y sus duraciones/frecuencias no siguen el PDF.
- Deload solo se dispara por microciclos, no por fatiga, y la reduccion de volumen -50% no se aplica.
- Volumen semanal por musculo excede rangos del PDF en planes reales (ej. Triceps/Biceps).
- Solapamiento neural detecta severidad, pero el ajuste en sesion aplica -10% fijo (mismatch con PDF).
- Priorizacion no limita top set a 1/semana ni aplica reglas por RIR/flags.

## Hallazgos por requisito

### Adaptacion inicial (AI-ADAPT)

#### AI-ADAPT-01

- Estado: NO
- Evidencia: `backend/routes/adaptationBlock.js` requiere `blockType` en request; no hay regla por edad/nivel/meses inactivo ni tag IA. `app.adaptation_blocks` solo guarda `block_type`.

#### AI-ADAPT-02

- Estado: NO
- Evidencia: full body fijo a 3 semanas/5 dias (`backend/services/hipertrofiaV2/adaptation/fullBodyGenerator.js`). half body a 2 semanas/5 dias (`backend/services/hipertrofiaV2/adaptation/halfBodyGenerator.js`). `durationWeeks` puede ser variable en `backend/routes/adaptationBlock.js`.

#### AI-ADAPT-03

- Estado: PARCIAL
- Evidencia: full body genera 8 ejercicios y reps 12-15, pero fija 3 sets (no 2-3 vueltas). `backend/services/hipertrofiaV2/adaptation/fullBodyGenerator.js`.

#### AI-ADAPT-04

- Estado: PARCIAL
- Evidencia: intensidad 65-70% se guarda como string (no carga/porcentaje numerico). `backend/services/hipertrofiaV2/adaptation/fullBodyGenerator.js`.

#### AI-ADAPT-05

- Estado: OK
- Evidencia: RIR 3-4 definido en sesiones full body. `backend/services/hipertrofiaV2/adaptation/fullBodyGenerator.js`.

#### AI-ADAPT-06

- Estado: NO
- Evidencia: no hay descansos por edad; descanso fijo 45s. `backend/services/hipertrofiaV2/adaptation/fullBodyGenerator.js`.

#### AI-ADAPT-07

- Estado: NO
- Evidencia: patron A/B no reinicia por semana; semana 2 queda B/A/B/A/B. `backend/services/hipertrofiaV2/adaptation/halfBodyGenerator.js`.

#### AI-ADAPT-08

- Estado: PARCIAL
- Evidencia: intensidad 75-80% y RIR 2-3 OK, reps 10-12 para todo (no 12-15 en analiticos). `backend/services/hipertrofiaV2/adaptation/halfBodyGenerator.js`.

#### AI-ADAPT-09

- Estado: NO
- Evidencia: descansos fijos 60s y sin descanso entre vueltas. `backend/services/hipertrofiaV2/adaptation/halfBodyGenerator.js`.

#### AI-ADAPT-10

- Estado: NO
- Evidencia: no existe JSON/config de descansos por edad en BD ni backend.

#### AI-ADAPT-11

- Estado: NO
- Evidencia: no hay contador/flag para repetir solo una vez por adherence<0.6 o mean_RIR>4. `app.adaptation_blocks`.

#### AI-ADAPT-12

- Estado: NO
- Evidencia: `app.transition_to_hypertrophy` no registra baseline, bloque destino ni motivo.

### Fatiga y solapamiento (AI-FAT, AI-OVL)

#### AI-FAT-01

- Estado: OK
- Evidencia: inputs subjetivos en `app.fatigue_flags` (sleep, energy, doms, joint_pain, focus, motivation).

#### AI-FAT-02

- Estado: NO
- Evidencia: caida de rendimiento no calculada; TODO en `app.detect_automatic_fatigue_flags`.

#### AI-FAT-03

- Estado: PARCIAL
- Evidencia: flags light/critical/cognitive en `backend/services/hipertrofiaV2/additionalControllers.js`, pero auto-deteccion solo por RIR (sin cognitive ni performance drop). `app.detect_automatic_fatigue_flags`.

#### AI-FAT-04

- Estado: OK
- Evidencia: 1 light bloquea progresion (no +2.5). `app.evaluate_fatigue_action`, `app.advance_cycle_day`.

#### AI-FAT-05

- Estado: NO
- Evidencia: no aplica -5% ni cap 70% dias 4-5; usa -6% global en `app.evaluate_fatigue_action`.

#### AI-FAT-06

- Estado: PARCIAL
- Evidencia: deload recomendado (-30/-50) pero no se activa automaticamente ni se reduce volumen. `app.evaluate_fatigue_action`, `app.activate_deload`.

#### AI-FAT-07 / AI-FAT-08 / AI-FAT-09 / AI-FAT-10

- Estado: NO
- Evidencia: no hay logica de prioridad vs fatiga (top set removal, desactivar prioridad, ajustes NP, bloqueo prioridad+deload).

#### AI-OVL-01

- Estado: OK
- Evidencia: `app.detect_neural_overlap` devuelve none/partial/high y guarda `neural_overlap_detected`.

#### AI-OVL-02

- Estado: PARCIAL
- Evidencia: SQL ajusta -2.5/-5, pero endpoint aplica -10% fijo. `app.detect_neural_overlap`, `backend/services/hipertrofiaV2/sqlControllers.js`.

### Transicion adaptacion -> hipertrofia (AI-TR)

#### AI-TR-01 / AI-TR-02

- Estado: OK
- Evidencia: `app.adaptation_criteria_tracking` guarda tecnicas y progreso de carga.

#### AI-TR-03

- Estado: NO
- Evidencia: no hay repeticion con -10% y cap +2% cuando falla transicion. `app.transition_to_hypertrophy`.

### Hipertrofia principiante (AI-HYP)

#### AI-HYP-01

- Estado: OK
- Evidencia: semana 0 a 70% con `WEEK_0_CONFIG`. `backend/services/hipertrofiaV2/constants.js`, `backend/services/hipertrofiaV2/planGenerationService.js`.

#### AI-HYP-02

- Estado: OK
- Evidencia: D1-D3 80%, D4-D5 73% en `app.hipertrofia_v2_session_config`.

#### AI-HYP-03

- Estado: OK (RIR y reps)
- Evidencia: reps 8-12 y RIR 2-3 en `app.hipertrofia_v2_session_config`.
- Nota: descansos en BD son 75s para todos los tipos, no 90/60/45-60. `app."Ejercicios_Hipertrofia"`.

#### AI-HYP-04

- Estado: PARCIAL
- Evidencia: deload por microciclos>=6 (`app.check_deload_trigger`) pero no por fatiga; volumen -50% no aplicado (TODO en `app.activate_deload`).

#### AI-HYP-05

- Estado: OK
- Evidencia: volumen fijo por plan (semanas replican plantilla). `backend/services/hipertrofiaV2/planGenerationService.js`.

#### AI-HYP-06

- Estado: NO
- Evidencia: plan 177 supera rangos en varios musculos (ver "Evidencia BD").

#### AI-HYP-07

- Estado: OK
- Evidencia: rotacion por sesiones completadas en `app.advance_cycle_day`.

#### AI-HYP-08

- Estado: OK
- Evidencia: ejercicios fijos dentro del plan generado. `backend/services/hipertrofiaV2/planGenerationService.js`.

#### AI-HYP-09

- Estado: NO
- Evidencia: no hay transicion automatica a intermedio tras semana 12; solo re-evaluacion opcional. `backend/migrations/add_reevaluation_system.sql`.

### Prioridad (AI-PRIO)

#### AI-PRIO-01

- Estado: OK
- Evidencia: `app.activate_muscle_priority` impide mas de un musculo.

#### AI-PRIO-02

- Estado: PARCIAL
- Evidencia: `app.hipertrofia_v2_state` guarda `priority_started_at` pero no hay log/evento con motivo.

#### AI-PRIO-03

- Estado: NO
- Evidencia: top set 82.5% se aplica a todos los ejercicios del musculo prioritario sin limite semanal. `backend/services/hipertrofiaV2/sessionService.js`.

#### AI-PRIO-04

- Estado: NO
- Evidencia: no existe +3.5/-2.5 segun RIR/flags; `app.apply_microcycle_progression` solo +2.5.

#### AI-PRIO-05

- Estado: NO
- Evidencia: no hay tracking de correcciones tecnicas por musculo/sesion.

#### AI-PRIO-06 / AI-PRIO-07

- Estado: NO
- Evidencia: no se ajustan intensidades NP ni reactivacion por mean_RIR. `backend/services/hipertrofiaV2/sessionService.js`.

### Estructura (AI-STR)

#### AI-STR-01

- Estado: OK
- Evidencia: orden Multi->Uni->Analitico en `backend/services/hipertrofiaV2/sessionService.js`.

#### AI-STR-02

- Estado: PARCIAL
- Evidencia: orden de tipos se respeta, pero no hay alternancia quad/femoral explicita.

## Evidencia en BD (muestras)

### Configuracion D1-D5 (app.hipertrofia_v2_session_config)

- D1-D3: intensidad 80, RIR 2-3, reps 8-12.
- D4-D5: intensidad 73, RIR 2-3, reps 8-12.
- Conteos por sesion: 2 multi + 2 uni + 2 analiticos en todos los dias.

### Plan real (app.methodology_plans id 177)

- Semana 1, ejercicios por dia: D1=8, D2=6, D3=5, D4=8, D5=14.
- Sets totales por categoria (semana 1):
  - Triceps 30, Biceps 24, Pecho 18, Espalda 12, Piernas (cuadriceps) 9, Hombro 9, Core 6, Hombro (medios) 6, Gluteo 3, Gemelos 3, Hombro (posterior) 3.

### Descansos

- `app."Ejercicios_Hipertrofia"`: descanso_seg fijo 75s en multi/unilateral/analitico.

## Recomendaciones (sin implementar)

- Implementar auto-asignacion de adaptacion por edad/nivel/inactividad y tags IA persistentes.
- Ajustar descansos por edad en adaptacion y por tipo en hipertrofia (multi/uni/analitico).
- Aplicar deload completo (-30% carga y -50% volumen) y activarlo por fatiga critica.
- Alinear solapamiento neural (-2.5/-5) y reglas de prioridad (top set semanal, NP 75-77.5/70, reglas por RIR/flags).
- Recalibrar volumen semanal por musculo para quedar en rangos del PDF.
