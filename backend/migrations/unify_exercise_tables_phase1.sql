-- =============================================================================
-- Unificación de tablas de ejercicios — FASE 1 (no destructiva)
-- =============================================================================
-- Objetivo: sustituir las 7 tablas Ejercicios_* de "entreno estándar" (familia A)
-- por una sola tabla app.ejercicios con columna `disciplina` + `extra` jsonb.
--
-- IMPORTANTE: esta fase NO borra las tablas originales. Crea app.ejercicios,
-- copia los datos y normaliza tipos inconsistentes (equipamiento -> text[],
-- fechas-texto -> timestamptz, columnas con tilde -> snake_case ascii).
-- El DROP de las tablas viejas se hará en una migración posterior (fase final)
-- una vez verificado el código.
--
-- Familias NO incluidas en esta fase:
--   * CrossFit  (modelo WOD distinto)
--   * Oposiciones: Bomberos / Guardia_Civil / Policia_Local (baremos, otro dominio)
--
-- Aplicada en producción (Supabase lhsnmjgdtjalfcsurxvg) el 2026-06-27.
-- Resultado verificado: 515 filas (calistenia 65, casa 100, funcional 54,
--   halterofilia 65, heavy_duty 44, hipertrofia 110, powerlifting 77).
-- =============================================================================

create table if not exists app.ejercicios (
  id                   bigserial primary key,
  disciplina           text not null,
  source_exercise_id   text,
  slug                 text,
  nombre               text not null,
  nivel                text,
  categoria            text,
  patron               text,
  equipamiento         text[],
  series_reps_objetivo text,
  descanso_seg         integer,
  tempo                text,
  criterio_de_progreso text,
  progresion_desde     text,
  progresion_hacia     text,
  notas                text,
  como_hacerlo         text,
  consejos             text,
  errores_comunes      text,
  gif_url              text,
  extra                jsonb not null default '{}'::jsonb,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists ejercicios_disciplina_idx  on app.ejercicios (disciplina);
create index if not exists ejercicios_disc_nivel_idx  on app.ejercicios (disciplina, nivel);
create index if not exists ejercicios_categoria_idx   on app.ejercicios (categoria);
create unique index if not exists ejercicios_disc_source_uq on app.ejercicios (disciplina, source_exercise_id);
create index if not exists ejercicios_disc_slug_idx   on app.ejercicios (disciplina, slug);

-- 1) CALISTENIA (equip text, fechas reales, sin descanso/tempo/gif)
insert into app.ejercicios (disciplina, source_exercise_id, slug, nombre, nivel, categoria, patron, equipamiento, series_reps_objetivo, descanso_seg, tempo, criterio_de_progreso, progresion_desde, progresion_hacia, notas, como_hacerlo, consejos, errores_comunes, gif_url, extra, created_at, updated_at)
select 'calistenia', exercise_id::text, slug, nombre, nivel, categoria, patron,
  (select array_agg(btrim(e)) from regexp_split_to_table(coalesce(equipamiento,''), ',') e where btrim(e) <> ''),
  series_reps_objetivo, null, null, criterio_de_progreso, progresion_desde, progresion_hacia, notas,
  "Cómo_hacerlo", "Consejos", "Errores_comunes", null,
  jsonb_strip_nulls(jsonb_build_object('tiempo', nullif(tiempo,''))),
  coalesce(created_at, now()), coalesce(updated_at, now())
from app."Ejercicios_Calistenia"
on conflict (disciplina, source_exercise_id) do nothing;

-- 2) CASA (equip array, fechas timestamp, con descanso/tempo/gif)
insert into app.ejercicios (disciplina, source_exercise_id, slug, nombre, nivel, categoria, patron, equipamiento, series_reps_objetivo, descanso_seg, tempo, criterio_de_progreso, progresion_desde, progresion_hacia, notas, como_hacerlo, consejos, errores_comunes, gif_url, extra, created_at, updated_at)
select 'casa', exercise_id::text, slug, nombre, nivel, categoria, patron,
  equipamiento,
  series_reps_objetivo, descanso_seg, tempo, criterio_de_progreso, progresion_desde, progresion_hacia, notas,
  "Cómo_hacerlo", "Consejos", "Errores_comunes", gif_url,
  '{}'::jsonb,
  coalesce(created_at::timestamptz, now()), coalesce(updated_at::timestamptz, now())
from app."Ejercicios_Casa"
on conflict (disciplina, source_exercise_id) do nothing;

-- 3) FUNCIONAL (igual que Casa)
insert into app.ejercicios (disciplina, source_exercise_id, slug, nombre, nivel, categoria, patron, equipamiento, series_reps_objetivo, descanso_seg, tempo, criterio_de_progreso, progresion_desde, progresion_hacia, notas, como_hacerlo, consejos, errores_comunes, gif_url, extra, created_at, updated_at)
select 'funcional', exercise_id::text, slug, nombre, nivel, categoria, patron,
  equipamiento,
  series_reps_objetivo, descanso_seg, tempo, criterio_de_progreso, progresion_desde, progresion_hacia, notas,
  "Cómo_hacerlo", "Consejos", "Errores_comunes", gif_url,
  '{}'::jsonb,
  coalesce(created_at::timestamptz, now()), coalesce(updated_at::timestamptz, now())
from app."Ejercicios_Funcional"
on conflict (disciplina, source_exercise_id) do nothing;

-- 4) HALTEROFILIA (igual que Casa)
insert into app.ejercicios (disciplina, source_exercise_id, slug, nombre, nivel, categoria, patron, equipamiento, series_reps_objetivo, descanso_seg, tempo, criterio_de_progreso, progresion_desde, progresion_hacia, notas, como_hacerlo, consejos, errores_comunes, gif_url, extra, created_at, updated_at)
select 'halterofilia', exercise_id::text, slug, nombre, nivel, categoria, patron,
  equipamiento,
  series_reps_objetivo, descanso_seg, tempo, criterio_de_progreso, progresion_desde, progresion_hacia, notas,
  "Cómo_hacerlo", "Consejos", "Errores_comunes", gif_url,
  '{}'::jsonb,
  coalesce(created_at::timestamptz, now()), coalesce(updated_at::timestamptz, now())
from app."Ejercicios_Halterofilia"
on conflict (disciplina, source_exercise_id) do nothing;

-- 5) HEAVY_DUTY (equip text, fechas como texto vacio -> now(), con descanso, tiempo)
insert into app.ejercicios (disciplina, source_exercise_id, slug, nombre, nivel, categoria, patron, equipamiento, series_reps_objetivo, descanso_seg, tempo, criterio_de_progreso, progresion_desde, progresion_hacia, notas, como_hacerlo, consejos, errores_comunes, gif_url, extra, created_at, updated_at)
select 'heavy_duty', exercise_id::text, slug, nombre, nivel, categoria, patron,
  (select array_agg(btrim(e)) from regexp_split_to_table(coalesce(equipamiento,''), ',') e where btrim(e) <> ''),
  series_reps_objetivo, descanso_seg, null, criterio_de_progreso, progresion_desde, progresion_hacia, notas,
  "Cómo_hacerlo", "Consejos", "Errores_comunes", null,
  jsonb_strip_nulls(jsonb_build_object('tiempo', nullif(tiempo,''))),
  case when created_at ~ '^\d{4}-\d{2}-\d{2}' then created_at::timestamptz else now() end,
  case when updated_at ~ '^\d{4}-\d{2}-\d{2}' then updated_at::timestamptz else now() end
from app."Ejercicios_Heavy_Duty"
on conflict (disciplina, source_exercise_id) do nothing;

-- 6) HIPERTROFIA (equip text, fechas texto/null -> now(), descanso bigint, muchos extras)
insert into app.ejercicios (disciplina, source_exercise_id, slug, nombre, nivel, categoria, patron, equipamiento, series_reps_objetivo, descanso_seg, tempo, criterio_de_progreso, progresion_desde, progresion_hacia, notas, como_hacerlo, consejos, errores_comunes, gif_url, extra, created_at, updated_at)
select 'hipertrofia', exercise_id::text, slug, nombre, nivel, categoria, patron,
  (select array_agg(btrim(e)) from regexp_split_to_table(coalesce(equipamiento,''), ',') e where btrim(e) <> ''),
  series_reps_objetivo, descanso_seg::integer, null, criterio_de_progreso, progresion_desde, progresion_hacia, notas,
  "Cómo_hacerlo", "Consejos", "Errores_comunes", null,
  jsonb_strip_nulls(jsonb_build_object(
    'id_slug', id, 'tiempo', nullif(tiempo,''), 'tipo_base', "Tipo base", 'ejecucion', "Ejecución",
    'tipo_ejercicio', tipo_ejercicio, 'patron_movimiento', patron_movimiento,
    'orden_recomendado', orden_recomendado, 'menstrual_restriction', menstrual_restriction,
    'menstrual_restriction_reason', menstrual_restriction_reason,
    'alternative_exercise_id', alternative_exercise_id, 'menstrual_notes', menstrual_notes)),
  case when created_at ~ '^\d{4}-\d{2}-\d{2}' then created_at::timestamptz else now() end,
  case when uploated_at ~ '^\d{4}-\d{2}-\d{2}' then uploated_at::timestamptz else now() end
from app."Ejercicios_Hipertrofia"
on conflict (disciplina, source_exercise_id) do nothing;

-- 7) POWERLIFTING (equip varchar, columnas en minuscula ejecucion/consejos/errores_evitar, intensidad)
insert into app.ejercicios (disciplina, source_exercise_id, slug, nombre, nivel, categoria, patron, equipamiento, series_reps_objetivo, descanso_seg, tempo, criterio_de_progreso, progresion_desde, progresion_hacia, notas, como_hacerlo, consejos, errores_comunes, gif_url, extra, created_at, updated_at)
select 'powerlifting', exercise_id::text, slug, nombre, nivel, categoria, patron,
  (select array_agg(btrim(e)) from regexp_split_to_table(coalesce(equipamiento,''), ',') e where btrim(e) <> ''),
  series_reps_objetivo, descanso_seg, null, null, null, null, notas,
  ejecucion, consejos, errores_evitar, null,
  jsonb_strip_nulls(jsonb_build_object('intensidad', intensidad)),
  coalesce(created_at, now()), coalesce(updated_at, now())
from app."Ejercicios_Powerlifting"
on conflict (disciplina, source_exercise_id) do nothing;
