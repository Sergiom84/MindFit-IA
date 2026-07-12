-- Crea app."Ejercicios_Policia_Nacional" con el MISMO esquema que las demás
-- tablas de oposición (Ejercicios_Bomberos / Ejercicios_Guardia_Civil).
-- Idempotente: no falla si ya existe.

CREATE TABLE IF NOT EXISTS app."Ejercicios_Policia_Nacional" (
  exercise_id          SERIAL PRIMARY KEY,
  nombre               VARCHAR NOT NULL,
  nivel                VARCHAR NOT NULL,
  categoria            VARCHAR NOT NULL,
  tipo_prueba          VARCHAR,
  baremo_hombres       VARCHAR,
  baremo_mujeres       VARCHAR,
  series_reps_objetivo VARCHAR,
  intensidad           VARCHAR,
  descanso_seg         INTEGER,
  equipamiento         VARCHAR,
  notas                TEXT,
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now(),
  ejecucion            TEXT,
  consejos             TEXT,
  errores_evitar       TEXT,
  gif_url              TEXT
);
