-- C-01 (auditoría HipertrofiaV2/Nutrición): la alergia a soja no bloqueaba
-- derivados de soja porque el catálogo etiquetaba de forma incompleta.
-- "Natto" y "Miso (pasta)" son soja fermentada pero no llevaban el tag `soja`,
-- así que un menú para un usuario alérgico podía incluirlos.
--
-- Esta migración es idempotente: solo añade el tag `soja` si aún no está.
-- El refuerzo por NOMBRE en el motor (foodTriggersAllergen / expandAllergenTerms)
-- es la defensa en profundidad; esto corrige el dato en origen.

UPDATE app.foods
SET tags = (
      SELECT jsonb_agg(DISTINCT elem)
      FROM jsonb_array_elements_text(
        CASE
          WHEN jsonb_typeof(tags) = 'array' THEN tags
          ELSE '[]'::jsonb
        END || '["soja"]'::jsonb
      ) AS elem
    ),
    updated_at = NOW()
WHERE (
        translate(LOWER(nombre), 'áàäâéèëêíìïîóòöôúùüûñ', 'aaaaeeeeiiiioooouuuun') LIKE '%natto%'
     OR translate(LOWER(nombre), 'áàäâéèëêíìïîóòöôúùüûñ', 'aaaaeeeeiiiioooouuuun') LIKE '%miso%'
      )
  AND NOT (COALESCE(tags::text, '') ILIKE '%soja%');
