-- Deload por ESTANCAMIENTO (meseta), compartido por TODAS las metodologías.
--
-- Complementa la autorregulación existente (que ya hace deload por exceso: 3
-- sesiones duras). Esto cubre el caso contrario: el usuario lleva demasiadas
-- sesiones SIN PROGRESAR (decisión 'hold' repetida = "X sesiones sin subir
-- kilos/variante/reps") → se fuerza una semana de descarga para romper la meseta.
--
-- Mecanismo aislado y aditivo: un contador por (usuario, metodología). Las
-- funciones *_register_session_result no se tocan; los routes llaman a
-- apply_stall_deload con la decisión base y esta la ajusta si procede.
--   - decisión 'progress' o 'deload'  → contador a 0 (hubo avance o ya se descargó)
--   - decisión 'hold'                 → contador +1
--   - contador >= umbral (def. 4) con 'hold' → 'deload' de meseta (resetea)

CREATE TABLE IF NOT EXISTS app.autoreg_stall (
  user_id integer NOT NULL,
  methodology text NOT NULL,
  stall_streak integer NOT NULL DEFAULT 0,
  last_decision varchar(20),
  updated_at timestamp without time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, methodology)
);

CREATE OR REPLACE FUNCTION app.apply_stall_deload(
  p_user_id integer,
  p_methodology text,
  p_decision text,
  p_threshold integer DEFAULT 4
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_stall integer;
  v_decision text := p_decision;
  v_plateau boolean := false;
BEGIN
  INSERT INTO app.autoreg_stall (user_id, methodology)
  VALUES (p_user_id, p_methodology)
  ON CONFLICT (user_id, methodology) DO NOTHING;

  SELECT stall_streak INTO v_stall
  FROM app.autoreg_stall
  WHERE user_id = p_user_id AND methodology = p_methodology;

  IF p_decision IN ('progress', 'deload') THEN
    v_stall := 0;
  ELSE
    v_stall := COALESCE(v_stall, 0) + 1;
  END IF;

  -- Meseta: demasiadas sesiones sin progresar → romper con un deload.
  IF v_stall >= GREATEST(p_threshold, 2) AND v_decision = 'hold' THEN
    v_decision := 'deload';
    v_plateau := true;
    v_stall := 0;
  END IF;

  UPDATE app.autoreg_stall
    SET stall_streak = v_stall,
        last_decision = v_decision,
        updated_at = now()
  WHERE user_id = p_user_id AND methodology = p_methodology;

  RETURN jsonb_build_object(
    'decision', v_decision,
    'stall_streak', v_stall,
    'plateau_deload', v_plateau
  );
END;
$$;
