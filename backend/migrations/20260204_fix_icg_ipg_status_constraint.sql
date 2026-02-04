-- ============================================================================
-- FIX: permitir estados en español (rojo/amarillo/verde/verde_plus)
-- ============================================================================

ALTER TABLE app.icg_ipg_state_history
  DROP CONSTRAINT IF EXISTS icg_ipg_state_history_status_check;

ALTER TABLE app.icg_ipg_state_history
  ADD CONSTRAINT icg_ipg_state_history_status_check
  CHECK ((status)::text = ANY ((ARRAY[
    'red'::character varying,
    'yellow'::character varying,
    'green'::character varying,
    'green_plus'::character varying,
    'neutral'::character varying,
    'unstable'::character varying,
    'rojo'::character varying,
    'amarillo'::character varying,
    'verde'::character varying,
    'verde_plus'::character varying
  ])::text[]));

-- ============================================================================
-- FIN DEL SCRIPT
-- ============================================================================
