-- =============================================================================
-- Unificación de ejercicios — FASE 1b: promover columnas estructuradas
-- =============================================================================
-- Los servicios (menstrualExerciseFilter, exerciseSelector, swapEngine) filtran
-- en cláusulas WHERE por estos campos de hipertrofia, así que se promueven de
-- `extra` jsonb a columnas reales (nullable, solo pobladas para disciplina='hipertrofia').
--
-- Aplicada en producción (Supabase lhsnmjgdtjalfcsurxvg) el 2026-06-28.
-- =============================================================================

alter table app.ejercicios
  add column if not exists tipo_ejercicio                text,
  add column if not exists patron_movimiento             text,
  add column if not exists orden_recomendado             integer,
  add column if not exists menstrual_restriction         text,
  add column if not exists menstrual_restriction_reason  text,
  add column if not exists alternative_exercise_id       text,
  add column if not exists menstrual_notes               text;

create index if not exists ejercicios_menstrual_restriction_idx
  on app.ejercicios (disciplina, menstrual_restriction);

-- Backfill desde extra y limpieza del jsonb (para no duplicar)
update app.ejercicios set
  tipo_ejercicio               = extra->>'tipo_ejercicio',
  patron_movimiento            = extra->>'patron_movimiento',
  orden_recomendado            = nullif(extra->>'orden_recomendado','')::int,
  menstrual_restriction        = extra->>'menstrual_restriction',
  menstrual_restriction_reason = extra->>'menstrual_restriction_reason',
  alternative_exercise_id      = extra->>'alternative_exercise_id',
  menstrual_notes              = extra->>'menstrual_notes',
  extra = extra - 'tipo_ejercicio' - 'patron_movimiento' - 'orden_recomendado'
                - 'menstrual_restriction' - 'menstrual_restriction_reason'
                - 'alternative_exercise_id' - 'menstrual_notes'
where disciplina = 'hipertrofia';
