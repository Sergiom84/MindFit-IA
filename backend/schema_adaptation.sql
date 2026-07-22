-- ==============================================================================
-- ESQUEMA DE ADAPTACIÓN - HIPERTROFIA V2
-- Ejecutar este script en el Editor SQL de Supabase
-- ==============================================================================

-- 1. Tabla de Bloques de Adaptación
CREATE TABLE IF NOT EXISTS app.adaptation_blocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    methodology_plan_id UUID REFERENCES app.methodology_plans(id),
    block_type TEXT NOT NULL CHECK (block_type IN ('full_body', 'half_body')),
    duration_weeks INTEGER NOT NULL,
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'failed', 'repeated')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabla de Seguimiento de Criterios (Semanal)
CREATE TABLE IF NOT EXISTS app.adaptation_criteria_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    adaptation_block_id UUID NOT NULL REFERENCES app.adaptation_blocks(id),
    week_number INTEGER NOT NULL,
    
    -- Adherencia
    sessions_planned INTEGER NOT NULL DEFAULT 0,
    sessions_completed INTEGER NOT NULL DEFAULT 0,
    
    -- RIR (Esfuerzo)
    mean_rir NUMERIC(4, 2),
    
    -- Técnica
    technique_flags_count INTEGER DEFAULT 0,
    
    -- Progreso de Cargas
    initial_average_weight NUMERIC(6, 2),
    current_average_weight NUMERIC(6, 2),
    
    -- Fechas
    week_start_date DATE,
    week_end_date DATE,
    evaluated_at TIMESTAMPTZ,
    
    UNIQUE(adaptation_block_id, week_number)
);

-- 3. Tabla de Flags de Técnica
CREATE TABLE IF NOT EXISTS app.adaptation_technique_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    adaptation_block_id UUID NOT NULL REFERENCES app.adaptation_blocks(id),
    session_id UUID, -- Referencia a la sesión si existe
    exercise_id UUID,
    flag_type TEXT NOT NULL, -- 'rom', 'speed', 'stability', 'pain'
    severity TEXT CHECK (severity IN ('low', 'medium', 'high')),
    description TEXT,
    flagged_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Vista de Progreso (Resumen)
DROP VIEW IF EXISTS app.adaptation_progress_summary CASCADE;

CREATE OR REPLACE VIEW app.adaptation_progress_summary AS
SELECT
    b.id AS adaptation_block_id,
    b.user_id,
    b.block_type,
    b.duration_weeks,
    b.start_date,
    b.status,
    
    -- Métricas agregadas
    COUNT(t.week_number) AS weeks_tracked,
    
    -- Última semana evaluada
    MAX(t.week_number) AS latest_week,
    
    -- Criterios de la última semana
    (SELECT (sessions_completed::numeric / NULLIF(sessions_planned, 0)) * 100 
     FROM app.adaptation_criteria_tracking WHERE adaptation_block_id = b.id ORDER BY week_number DESC LIMIT 1) AS latest_adherence_pct,
     
    (SELECT mean_rir 
     FROM app.adaptation_criteria_tracking WHERE adaptation_block_id = b.id ORDER BY week_number DESC LIMIT 1) AS latest_mean_rir,
     
    -- Booleanos de cumplimiento (Hardcoded thresholds for view)
    CASE WHEN (SELECT (sessions_completed::numeric / NULLIF(sessions_planned, 0)) 
               FROM app.adaptation_criteria_tracking WHERE adaptation_block_id = b.id ORDER BY week_number DESC LIMIT 1) >= 0.8 THEN true ELSE false END AS latest_adherence_met,
               
    CASE WHEN (SELECT mean_rir 
               FROM app.adaptation_criteria_tracking WHERE adaptation_block_id = b.id ORDER BY week_number DESC LIMIT 1) <= 4.0 THEN true ELSE false END AS latest_rir_met,

    -- Ready for transition flag (simplificado)
    CASE WHEN b.status = 'active' AND (SELECT COUNT(*) FROM app.adaptation_criteria_tracking WHERE adaptation_block_id = b.id) >= b.duration_weeks THEN true ELSE false END AS ready_for_transition
               
FROM app.adaptation_blocks b
LEFT JOIN app.adaptation_criteria_tracking t ON b.id = t.adaptation_block_id
GROUP BY b.id;

-- 5. Función de Transición
CREATE OR REPLACE FUNCTION app.transition_to_hypertrophy(p_user_id UUID, p_block_id UUID)
RETURNS TABLE (transition_to_hypertrophy JSONB) AS $$
DECLARE
    v_block app.adaptation_blocks%ROWTYPE;
BEGIN
    -- Obtener bloque
    SELECT * INTO v_block FROM app.adaptation_blocks WHERE id = p_block_id AND user_id = p_user_id;
    
    IF NOT FOUND THEN
        transition_to_hypertrophy := jsonb_build_object('success', false, 'error', 'Bloque no encontrado');
        RETURN NEXT;
        RETURN;
    END IF;
    
    -- Marcar como completado
    UPDATE app.adaptation_blocks SET status = 'completed', updated_at = NOW() WHERE id = p_block_id;
    
    transition_to_hypertrophy := jsonb_build_object(
        'success', true,
        'message', 'Transición exitosa',
        'evaluation', jsonb_build_object('status', 'completed')
    );
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- 6. Función de Evaluación de Completitud
CREATE OR REPLACE FUNCTION app.evaluate_adaptation_completion(p_user_id UUID)
RETURNS TABLE (evaluate_adaptation_completion JSONB) AS $$
DECLARE
    v_block_id UUID;
    v_ready BOOLEAN;
BEGIN
    SELECT id, ready_for_transition INTO v_block_id, v_ready 
    FROM app.adaptation_progress_summary 
    WHERE user_id = p_user_id AND status = 'active';
    
    evaluate_adaptation_completion := jsonb_build_object(
        'hasActiveBlock', v_block_id IS NOT NULL,
        'readyForTransition', COALESCE(v_ready, false)
    );
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;
