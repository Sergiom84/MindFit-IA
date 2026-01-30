# Plan de implementación para alinear HypertrofiaV2 con MindFeed_Compliance_Spec_v1

Objetivo: llevar el sistema a **cumplimiento estricto** con `docs/MindFeed_Compliance_Spec_v1.md`, corrigiendo las incongruencias documentadas en `docs/AUDITORIA_MINDFEED_COMPLIANCE.md`.

Este documento NO implementa nada: define qué tocar, en qué orden y cómo validarlo.

## 0) Alcance, principios y fuentes de verdad

Fuentes:

- Spec normativa: `docs/MindFeed_Compliance_Spec_v1.md`.
- Auditoría actual: `docs/AUDITORIA_MINDFEED_COMPLIANCE.md`.
- Backend HypertrofiaV2: `backend/services/hipertrofiaV2/*`, `backend/routes/hipertrofiaV2.js`.
- SQL/migraciones: `backend/migrations/*`.

Principios operativos:

- La spec manda sobre el comportamiento.
- Mantener el flujo de metodologías intacto (no tocar convergencia en `WorkoutContext.generatePlan()`).
- Preferir reglas explícitas y trazables (eventos/flags/estado persistente) frente a heurísticas implícitas.

## 1) Mapa de brechas (spec → auditoría → causa probable)

Brechas clave a cerrar:

1. Prioridad muscular (AI-PRIO-03/04/05/06/07) no respeta top set semanal, reglas por RIR/flags, ni NP.
2. Deload (AI-HYP-04) es parcial: no activa por fatiga crítica y no aplica -50% volumen.
3. Solapamiento neural está desalineado: el backend aplica -10% fijo en lugar de mapear severidad (-2.5/-5) cuando existe.
4. Descansos por tipo no están alineados (multi/uni/analítico).
5. Volumen semanal por músculo (AI-HYP-06) está fuera de rango en planes reales.
6. Transición automática a intermedio tras semana 12 (AI-HYP-09) no existe.
7. Transición adaptación → hipertrofia cuando falla criterios (AI-TR-03) no implementa repetir con -10% y cap +2%.

Estas brechas tocan tanto **backend** como **SQL/BD**, así que el plan está dividido por capas y riesgo.

## 2) Estrategia por fases (A → Z)

La secuencia prioriza: (1) seguridad fisiológica, (2) reglas de progresión, (3) volumen, (4) automatismos de ciclo.

### Fase A — Contratos de configuración (BD como fuente de reglas)

Objetivo: mover reglas “normativas” a configuración consultable, para evitar hardcodes inconsistentes.

Cambios propuestos:

- Añadir configuración explícita para:
  - Descansos por tipo: multi=90, uni=60, analítico=45-60.
  - Intensidades base por día (ya existe en `app.hipertrofia_v2_session_config`, pero hay que formalizar rangos 70-75 para D4-D5).
  - Reglas de prioridad (top set semanal, límites, NP, reactivación).
  - Reglas de deload (triggers y acciones).
  - Mapeo de solapamiento neural por severidad.

Implementación sugerida (SQL):

- Crear tabla de configuración versionada, por ejemplo:
  - `app.mindfeed_rulesets` (id, version, scope, rules jsonb, active).
  - `app.mindfeed_ruleset_events` (auditoría de cambios de reglas).

Alternativa mínima (si no queremos una tabla nueva aún):

- Columnas nuevas y/o tablas específicas:
  - `app.hipertrofia_v2_rules` (reglas de intensidad/deload/prioridad).
  - `app.hipertrofia_v2_rest_rules` (descansos por tipo y nivel).

Validación de fase:

- Poder leer un único “ruleset efectivo” desde SQL para principiante.
- Añadir endpoint interno de diagnóstico que devuelva el ruleset activo (solo backend).

### Fase B — Deload correcto y seguro (AI-HYP-04)

Objetivo: que el deload cumpla exactamente la spec:

- Trigger: semana 6 o fatiga crítica.
- Acción: -30% carga y -50% volumen.

Causas actuales:

- `app.check_deload_trigger` existe, pero no cubre fatiga crítica como la spec.
- `app.activate_deload` tiene TODO para volumen -50%.

Cambios propuestos:

1. SQL: endurecer y centralizar deload.

- Actualizar `app.check_deload_trigger(user_id)` para:
  - Disparar por semana/microciclo >= 6.
  - Disparar por fatiga crítica (según flags y/o heurísticas ya existentes).
- Reescribir `app.activate_deload(...)` para:
  - Aplicar -30% a `intensidad_porcentaje`.
  - Aplicar -50% al volumen efectivo (sets/series) sin romper estructura ni orden.

2. Backend: que siempre obedezca al SQL.

- Revisar controladores en `backend/services/hipertrofiaV2/sqlControllers.js`.
- Evitar aplicar “medias soluciones” en JS cuando el SQL ya decidió.

Validación de fase:

- Test sobre un plan real: comprobar que en deload bajan cargas y se reduce volumen a la mitad.
- Confirmar que NO se activa prioridad durante deload.

### Fase C — Prioridad muscular estricta (AI-PRIO-02/03/04/05/06/07)

Objetivo: cumplir la spec al detalle sin inflar volumen.

Problemas actuales visibles:

- `sessionService.js` aplica 82.5% a todos los ejercicios del músculo prioritario.
- NP no se congela ni se baja correctamente.
- Progresión sigue siendo +2.5% plano.
- No hay tracking de correcciones técnicas por músculo/sesión.

Cambios propuestos (divididos):

1. Estado y auditoría (SQL primero):

- Añadir registro explícito de eventos de prioridad:
  - Tabla sugerida: `app.muscle_priority_events`.
  - Campos: user_id, muscle, action, reason, started_at, ended_at, metadata jsonb.
- Extender `app.hipertrofia_v2_state` si hace falta:
  - `priority_top_sets_this_week` ya aparece en lecturas del backend.
  - Añadir: `priority_week_index`, `priority_last_top_set_at`, `priority_rules_version`.

2. Reglas de top set semanal (SQL + backend):

- Implementar función SQL como autoridad, por ejemplo:
  - `app.get_priority_intensity_adjustments(user_id, cycle_day, exercises jsonb)`.
- Reglas a codificar:
  - Máximo 1 top set por semana.
  - Solo primeras 4 semanas de prioridad (con gates claros).
  - 82.5% inicialmente; hasta 85% si condiciones.
  - Si no se cumplen condiciones, no hay top set.

3. Reglas NP y congelación de progresión:

- Mientras prioridad activa:
  - D1-D3: NP a 75–77.5.
  - D4-D5: NP a 70.
  - Progresión NP = 0.
- Reactivación NP:
  - Requiere 2 semanas consecutivas con mean_RIR_NP >= 4.

Esto sugiere:

- Ajustar la progresión en SQL (probablemente `app.apply_microcycle_progression`).
- Evitar aplicar ajustes de prioridad “a ojo” en `sessionService.js`.

4. Correcciones técnicas (AI-PRIO-05):

- Crear tabla de correcciones técnicas por músculo/sesión, por ejemplo:
  - `app.technique_corrections` con user_id, session_id, muscle, count, source, created_at.
- Usar esta tabla como bloqueo de progresión de P cuando count >= 2 en una sesión.

Validación de fase:

- Casos controlados:
  - Prioridad activa, sin flags, mean_RIR_P>=3 → 1 top set/semana (no más).
  - NP congelado y con intensidades correctas.
  - Técnica mala (2 correcciones) → sin incremento la siguiente semana.

### Fase D — Solapamiento neural coherente con la spec

Objetivo: eliminar inconsistencias entre severidad y ajuste aplicado.

Problema actual:

- El backend aplica -10% fijo cuando hay solapamiento (`sqlControllers.js`).

Cambios propuestos:

- Definir un contrato SQL claro:
  - `app.detect_neural_overlap(user_id, patterns jsonb)` debe devolver:
    - severidad: none | partial | high
    - adjustment_pct: -2.5 | -5 | 0
    - freeze_progression: boolean
- En backend:
  - Usar el `adjustment_pct` que devuelve SQL.
  - Eliminar el hardcode del -10%.

Validación de fase:

- Forzar escenarios con partial/high y verificar que se aplica -2.5/-5 y, si corresponde, freeze_progression.

### Fase E — Descansos por tipo (AI-HYP-03: parte descansos)

Objetivo: cumplir exactamente los descansos:

- Multi 90s, Uni 60s, Analítico 45–60s.

Problema actual:

- BD tiene descanso uniforme (75s) y el selector hereda eso.

Cambios propuestos:

- SQL/migración de datos:
  - Normalizar `descanso_seg` en `app."Ejercicios_Hipertrofia"` por tipo.
- Backend:
  - `exerciseSelector.js` debe:
    - Preferir regla normativa por tipo/nivel cuando exista.
    - Solo caer a `descanso_seg` del ejercicio si es coherente con ruleset.

Validación de fase:

- Muestreo de sesiones: multi=90, uni=60, analítico dentro de 45-60.

### Fase F — Volumen semanal dentro de rangos (AI-HYP-06)

Objetivo: que el volumen por músculo quede dentro de los rangos de la spec.

Esta es la fase más “estructural”.

Problema actual:

- Un plan real tiene muchísimo brazo (tríceps/bíceps) y desbalance fuerte.

Causa probable:

- Plantillas y/o reglas de asignación por día están sobrerrepresentando brazos.
- Posible interacción con extras/complementarios.

Cambios propuestos:

1. Medición formal (antes de cambiar):

- Implementar un “auditor de volumen” en backend que calcule:
  - sets/semana por músculo y comparación contra rangos.
- Guardar snapshots para comparar antes/después.

2. Corrección de plantillas y asignación:

- Revisar y ajustar:
  - Configuración D1–D5 (qué músculos aparecen y cuántos ejercicios por categoría).
  - Selector/estrategia de ejercicios por sesión.
  - Cualquier generador de “extras”.

3. Reglas de cupos por músculo:

- Introducir cupos máximos por microciclo para brazos en principiante.
- Garantizar que el cupo mínimo de espalda/pierna/pecho se cumpla.

Validación de fase:

- Para planes nuevos: todos los músculos dentro de rango o muy cerca, y nunca con extremos como 30 series/semana en tríceps para principiante.

### Fase G — Transiciones automáticas correctas (AI-TR-03 y AI-HYP-09)

Objetivo: cerrar el ciclo completo:

- Si falla transición desde adaptación: repetir con -10% y cap +2%.
- Tras semana 12 del bloque principiante: transición automática a intermedio (con evento).

Cambios propuestos:

1. Adaptación → hipertrofia (AI-TR-03):

- Ajustar `app.transition_to_hypertrophy` para:
  - Si no cumple criterios: generar/repetir bloque con:
    - -10% inicial
    - cap de progresión +2%/semana
  - Registrar evento de “repeat_with_penalty”.

2. Principiante → intermedio (AI-HYP-09):

- Definir trigger claro:
  - Semana >=12 (o duración real del bloque) y criterios mínimos.
- Implementar función SQL de transición + evento:
  - `app.transition_beginner_to_intermediate(user_id, plan_id)`.

Validación de fase:

- Caso adaptación fallida: comprobar que el siguiente bloque nace con -10% y cap +2%.
- Caso semana 12: se dispara transición y queda trazabilidad.

## 3) Orden de ejecución recomendado (minimizando riesgo)

Orden sugerido:

1. Fase A (contratos/ruleset).
2. Fase B (deload).
3. Fase C (prioridad).
4. Fase D (solapamiento).
5. Fase E (descansos).
6. Fase F (volumen).
7. Fase G (transiciones).

Motivo:

- Deload/prioridad/solapamiento son lo más sensible a nivel de carga.
- Volumen y transiciones se benefician de tener reglas ya formalizadas.

## 4) Plan de validación por fases

Para cada fase, validaremos 3 niveles:

1. Validación lógica (unidad/SQL):

- Consultas directas para verificar estados y reglas.

2. Validación de plan generado (integración):

- Generar plan/sesión y auditar:
  - intensidades
  - descansos
  - volumen por músculo
  - deload/prioridad/overlap aplicados.

3. Validación con auditoría reproducible:

- Dejar un script/endpoint de auditoría que devuelva:
  - cumplimiento por regla AI-\*
  - evidencia (plan_id, week, session_id).

## 5) Criterios de “cumplimiento estricto” (Definition of Done)

Se considera alineado con la spec cuando:

- Todas las reglas AI-HYP, AI-PRIO, AI-TR y solapamiento relevantes están en estado OK.
- No hay hardcodes en backend que contradigan reglas SQL.
- Podemos explicar cada ajuste con una regla trazable (evento/estado/config).
- Un plan principiante típico no viola rangos de volumen por músculo.

---

Si te parece bien, implementamos siguiendo este documento y actualizamos la auditoría al cierre de cada fase (con evidencia nueva).
