-- Progresión acumulada por usuario+plan derivada de la autorregulación (RIR/RPE).
-- La decisión 'progress'/'deload' de *_register_session_result deja de ser solo
-- informativa: aquí se acumula el offset que la siguiente sesión del plan aplica
-- a las prescripciones (más reps / más peso, o descarga puntual).
CREATE TABLE IF NOT EXISTS app.plan_progression_offsets (
  user_id integer NOT NULL,
  methodology_plan_id integer NOT NULL,
  -- Reps extra acumuladas sobre la prescripción base del plan (metodologías de peso corporal)
  rep_offset integer NOT NULL DEFAULT 0,
  -- % de peso acumulado sobre la última carga registrada (metodologías con carga)
  weight_pct numeric(6,2) NOT NULL DEFAULT 0,
  -- La próxima sesión debe ser de descarga (se consume al aplicarse)
  deload_pending boolean NOT NULL DEFAULT false,
  -- Nº de decisiones 'progress' acumuladas (telemetría/depuración)
  progress_count integer NOT NULL DEFAULT 0,
  deload_count integer NOT NULL DEFAULT 0,
  last_decision varchar(20),
  updated_at timestamp NOT NULL DEFAULT now(),
  created_at timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, methodology_plan_id)
);

ALTER TABLE app.plan_progression_offsets ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'app' AND tablename = 'plan_progression_offsets'
  ) THEN
    CREATE POLICY plan_progression_offsets_user_policy ON app.plan_progression_offsets
      USING (user_id = (current_setting('app.current_user_id'::text))::integer);
  END IF;
END $$;
