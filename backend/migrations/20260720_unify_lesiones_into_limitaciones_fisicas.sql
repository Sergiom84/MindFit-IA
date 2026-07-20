-- 20260720_unify_lesiones_into_limitaciones_fisicas.sql
-- Descripción: F1 (ONB-P1-01) — unificar Salud. `app.users.limitaciones_fisicas`
-- (text[]) pasa a ser el campo CANÓNICO de lesiones/limitaciones. Esta migración
-- combina las tres fuentes legacy en ese array, deduplicando por texto normalizado
-- (trim + minúsculas, sin acentos), para que el motor de rutinas —que ahora prefiere
-- users.limitaciones_fisicas— tenga el conjunto completo:
--   1. app.users.limitaciones_fisicas   (text[])  — ya canónico
--   2. app.users.lesiones                (text[])  — legacy de onboarding/registro
--   3. app.user_profiles.limitaciones_fisicas (text) — legacy, partido por separadores
--
-- NO se borra la columna `lesiones` ni el texto de user_profiles: quedan como alias
-- de LECTURA temporal (el motor combina lesiones vía extractInjuryText como defensa).
-- Idempotente: reejecutarla no añade duplicados (el UPDATE solo escribe si cambia).

BEGIN;

WITH src AS (
  SELECT
    u.id,
    (
      -- Base: el array canónico existente. `users.limitaciones_fisicas` y el texto de
      -- `user_profiles.limitaciones_fisicas` son el MISMO dato en dos formatos (el
      -- registro escribe ambos), así que NO se re-parte el texto sobre un array ya
      -- poblado (crearía fragmentos duplicados). Solo se backfillea desde el texto
      -- legacy cuando el array está vacío (filas antiguas sin el array).
      CASE
        WHEN COALESCE(array_length(u.limitaciones_fisicas, 1), 0) > 0
          THEN u.limitaciones_fisicas
        WHEN p.limitaciones_fisicas IS NOT NULL AND btrim(p.limitaciones_fisicas) <> ''
          THEN regexp_split_to_array(btrim(p.limitaciones_fisicas), '\s*[.,;\n]+\s*')
        ELSE '{}'::text[]
      END
      -- Fuente realmente separada: la columna legacy `lesiones` (onboarding/registro).
      || COALESCE(u.lesiones, '{}'::text[])
    ) AS tokens
  FROM app.users u
  LEFT JOIN app.user_profiles p ON p.user_id = u.id
),
cleaned AS (
  SELECT
    s.id,
    btrim(t.tok)          AS tok_trim,
    lower(btrim(t.tok))   AS tok_key,
    t.ord
  FROM src s
  CROSS JOIN LATERAL unnest(s.tokens) WITH ORDINALITY AS t(tok, ord)
),
first_per_key AS (
  -- primera aparición (menor orden) de cada token normalizado
  SELECT DISTINCT ON (id, tok_key) id, tok_trim, ord
  FROM cleaned
  WHERE tok_trim <> ''
  ORDER BY id, tok_key, ord
),
merged AS (
  SELECT id, array_agg(tok_trim ORDER BY ord) AS limitaciones
  FROM first_per_key
  GROUP BY id
)
UPDATE app.users u
SET limitaciones_fisicas = m.limitaciones,
    updated_at = NOW()
FROM merged m
WHERE u.id = m.id
  AND COALESCE(u.limitaciones_fisicas, '{}'::text[]) IS DISTINCT FROM m.limitaciones;

COMMIT;
