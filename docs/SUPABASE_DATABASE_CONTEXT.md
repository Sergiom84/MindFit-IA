# Supabase Database Context (lhsnmjgdtjalfcsurxvg)

## Overview

- Project: Entrena_con_IA
- Region: eu-north-1
- Postgres: 17.4.1.074 (ga)
- Primary schemas: app (application), public (api)
- Object counts: app tables 74, app views 11, app functions 169; public tables 1, public functions 6; materialized views 0
- RLS enabled tables: app.Ejercicios_Heavy_Duty, app.Ejercicios_Hipertrofia, app.foods, app.hypertrophy_blocks, app.hypertrophy_progression, app.hypertrophy_set_logs, app.nutrition_guidelines, public.ejercicios_calistenia
- Note: Column names are listed verbatim from the schema (may include non-ASCII characters).

## Schemas

- app: application data
- public: api-visible objects
- auth: Supabase auth (managed)
- storage: Supabase storage (managed)
- realtime: Supabase realtime (managed)
- vault: Supabase vault (managed)
- graphql, graphql_public: pg_graphql
- extensions, backup, pgbouncer: managed/system
- information_schema, pg_catalog, pg_toast: Postgres system

### auth tables

- audit_log_entries
- flow_state
- identities
- instances
- mfa_amr_claims
- mfa_challenges
- mfa_factors
- oauth_authorizations
- oauth_client_states
- oauth_clients
- oauth_consents
- one_time_tokens
- refresh_tokens
- saml_providers
- saml_relay_states
- schema_migrations
- sessions
- sso_domains
- sso_providers
- users

### storage tables

- buckets
- buckets_analytics
- buckets_vectors
- migrations
- objects
- prefixes
- s3_multipart_uploads
- s3_multipart_uploads_parts
- vector_indexes

### realtime tables

- schema_migrations
- subscription

### vault tables

- secrets

## Extensions (installed)

- uuid-ossp 1.1 (extensions)
- pgcrypto 1.3 (extensions)
- pg_graphql 1.5.11 (graphql)
- pg_trgm 1.6 (app)
- pg_stat_statements 1.11 (extensions)
- supabase_vault 0.3.1 (vault)
- plpgsql 1.0 (pg_catalog)

## Table comments

- app.Ejercicios_Bomberos: Catálogo de ejercicios para preparación de oposiciones de Bombero
- app.Ejercicios_CrossFit: Tabla de ejercicios de CrossFit organizados por niveles (Scaled, RX, RX+, Elite) y dominios (Gymnastic, Weightlifting, Monostructural). Utilizada por el especialista de IA para generar WODs personalizados.
- app.Ejercicios_Funcional: Catálogo de ejercicios de entrenamiento funcional clasificados por nivel, categoría y patrón de movimiento
- app.Ejercicios_Guardia_Civil: Catálogo de ejercicios para preparación de oposiciones de Guardia Civil
- app.Ejercicios_Halterofilia: Catálogo de ejercicios de halterofilia clasificados por nivel, categoría y patrón olímpico
- app.Ejercicios_Policia_Local: Catálogo de ejercicios para preparación de oposiciones de Policía Local
- app.Ejercicios_Powerlifting: Catálogo de ejercicios de Powerlifting organizados por niveles
- app.adaptation_blocks: Bloques de adaptación inicial para principiantes antes del ciclo D1-D5
- app.adaptation_criteria_tracking: Tracking semanal de los 4 criterios de transición
- app.adaptation_technique_flags: Flags de técnica reportadas durante adaptación
- app.ai_adjustment_suggestions: Ajustes sugeridos por IA basados en re-evaluaciones
- app.foods: Catálogo maestro de alimentos con macros/100g
- app.hipertrofia_v2_session_config: Configuración de las 5 sesiones del ciclo MindFeed (D1-D5) para principiantes
- app.hipertrofia_v2_state: Estado del motor de ciclo MindFeed: tracking D1-D5, microciclos, deload, prioridad
- app.home_exercise_history: Historial específico de ejercicios de entrenamiento en casa - separado de metodologías
- app.hypertrophy_blocks: Bloques de entrenamiento de 4-12 semanas con configuración específica
- app.hypertrophy_progression: Seguimiento de progresión y ajustes automáticos por ejercicio
- app.hypertrophy_set_logs: Registro detallado de cada serie realizada con tracking RIR
- app.hypertrophy_weekly_templates: Plantillas de ejercicios para cada día (Full Body)
- app.level_reevaluations: Historial de re-evaluaciones de nivel propuestas al usuario
- app.methodology_session_feedback: Feedback de usuario sobre ejercicios/sesiones saltados/cancelados para mejorar futuras rutinas
- app.music_playlists: Almacena las playlists de música locales de los usuarios del sistema de audio
- app.nutrition_guidelines: Conocimiento y reglas nutricionales versionadas (extraído de PDFs)
- app.nutrition_meal_items: Items/ingredientes de cada comida
- app.nutrition_meals: Comidas distribuidas por día
- app.nutrition_plan_days: Días del plan con macros ajustados por carb cycling
- app.nutrition_plans_v2: Planes nutricionales normalizados - Sistema determinista v2
- app.nutrition_profiles: Perfiles nutricionales específicos - Sistema determinista
- app.re_evaluation_exercises: Progreso detallado por ejercicio durante la re-evaluación
- app.user_profiles: Perfiles extendidos de usuarios con información detallada para IA
- app.user_re_eval_config: Configuración personalizada de re-evaluaciones por usuario
- app.user_re_evaluations: Re-evaluaciones periódicas del progreso del usuario
- app.warmup_sets_tracking: Registro de series de calentamiento completadas por ejercicio

## Table inventory (columns)

### app schema

- Ejercicios_Bomberos: exercise_id integer, nombre character varying, nivel character varying, categoria character varying, tipo_prueba character varying, baremo_hombres character varying, baremo_mujeres character varying, series_reps_objetivo character varying, intensidad character varying, descanso_seg integer, equipamiento character varying, notas text, created_at timestamp with time zone, updated_at timestamp with time zone, ejecucion text, consejos text, errores_evitar text
- Ejercicios_Calistenia: slug text, nombre text, nivel text, categoria text, patron text, equipamiento text, series_reps_objetivo text, criterio_de_progreso text, progresion_desde text, progresion_hacia text, notas text, created_at timestamp with time zone, updated_at timestamp with time zone, tiempo text, exercise_id integer, Cómo_hacerlo text, Consejos text, Errores_comunes text
- Ejercicios_Casa: exercise_id integer, nombre character varying, slug text, nivel character varying, categoria character varying, patron character varying, equipamiento ARRAY, series_reps_objetivo character varying, descanso_seg integer, tempo character varying, criterio_de_progreso text, progresion_desde character varying, progresion_hacia character varying, notas text, gif_url text, created_at timestamp without time zone, updated_at timestamp without time zone, Cómo_hacerlo text, Consejos text, Errores_comunes text
- Ejercicios_CrossFit: exercise_id integer, nombre character varying, nivel character varying, dominio character varying, categoria character varying, equipamiento character varying, tipo_wod character varying, intensidad character varying, duracion_seg integer, descanso_seg integer, escalamiento text, notas text, created_at timestamp with time zone, updated_at timestamp with time zone, Cómo_hacerlo text, Consejos text, Errores_comunes text, alias text, featured integer, supports_strength_block integer, counts_as_movement integer, wod_types text, time_domain text, pairing_tags text, avoid_pairing_with text, is_benchmark integer, rx_carga_sugerida text, synonyms text
- Ejercicios_Funcional: exercise_id integer, nombre character varying, slug text, nivel character varying, categoria character varying, patron character varying, equipamiento ARRAY, series_reps_objetivo character varying, descanso_seg integer, tempo character varying, criterio_de_progreso text, progresion_desde character varying, progresion_hacia character varying, notas text, gif_url text, created_at timestamp without time zone, updated_at timestamp without time zone, Cómo_hacerlo text, Consejos text, Errores_comunes text
- Ejercicios_Guardia_Civil: exercise_id integer, nombre character varying, nivel character varying, categoria character varying, tipo_prueba character varying, baremo_hombres character varying, baremo_mujeres character varying, series_reps_objetivo character varying, intensidad character varying, descanso_seg integer, equipamiento character varying, notas text, created_at timestamp with time zone, updated_at timestamp with time zone, ejecucion text, consejos text, errores_evitar text
- Ejercicios_Halterofilia: exercise_id integer, nombre character varying, slug text, nivel character varying, categoria character varying, patron character varying, equipamiento ARRAY, series_reps_objetivo character varying, descanso_seg integer, tempo character varying, criterio_de_progreso text, progresion_desde character varying, progresion_hacia character varying, notas text, gif_url text, created_at timestamp without time zone, updated_at timestamp without time zone, Cómo_hacerlo text, Consejos text, Errores_comunes text
- Ejercicios_Heavy_Duty: slug text, nombre text, nivel text, categoria text, patron text, equipamiento text, series_reps_objetivo text, criterio_de_progreso text, progresion_desde text, progresion_hacia text, notas text, created_at text, updated_at text, tiempo text, exercise_id integer, descanso_seg integer, Cómo_hacerlo text, Consejos text, Errores_comunes text
- Ejercicios_Hipertrofia: exercise_id bigint, id text, nombre character varying, slug text, nivel text, categoria text, patron text, equipamiento text, series_reps_objetivo text, descanso_seg bigint, notas text, progresion_hacia text, progresion_desde text, criterio_de_progreso text, Cómo_hacerlo text, Consejos text, Errores_comunes text, created_at text, uploated_at text, tiempo text, Tipo base text, Ejecución text, tipo_ejercicio character varying, patron_movimiento character varying, orden_recomendado integer
- Ejercicios_Policia_Local: exercise_id integer, nombre character varying, nivel character varying, categoria character varying, tipo_prueba character varying, baremo_hombres character varying, baremo_mujeres character varying, series_reps_objetivo character varying, intensidad character varying, descanso_seg integer, equipamiento character varying, notas text, created_at timestamp with time zone, updated_at timestamp with time zone, ejecucion text, consejos text, errores_evitar text
- Ejercicios_Powerlifting: exercise_id integer, nombre character varying, nivel character varying, categoria character varying, patron character varying, equipamiento character varying, series_reps_objetivo character varying, intensidad character varying, descanso_seg integer, notas text, created_at timestamp with time zone, updated_at timestamp with time zone, slug text, ejecucion text, consejos text, errores_evitar text
- adaptation_blocks: id integer, user_id integer, methodology_plan_id integer, block_type character varying, duration_weeks integer, start_date date, status character varying, completed_at timestamp without time zone, transitioned_to_hypertrophy boolean, created_at timestamp without time zone, updated_at timestamp without time zone
- adaptation_criteria_tracking: id integer, adaptation_block_id integer, week_number integer, sessions_planned integer, sessions_completed integer, adherence_percentage numeric, adherence_met boolean, mean_rir numeric, rir_met boolean, technique_flags_count integer, technique_met boolean, initial_average_weight numeric, current_average_weight numeric, weight_progress_percentage numeric, progress_met boolean, week_start_date date, week_end_date date, evaluated_at timestamp without time zone
- adaptation_technique_flags: id integer, adaptation_block_id integer, user_id integer, session_id integer, exercise_id integer, flag_type character varying, severity character varying, description text, resolved boolean, resolved_at timestamp without time zone, resolution_notes text, flagged_at timestamp without time zone, created_at timestamp without time zone
- ai_adjustment_suggestions: id integer, re_evaluation_id integer, progress_assessment character varying, intensity_change character varying, volume_change character varying, rest_modifications character varying, suggested_progressions jsonb, ai_reasoning text, motivational_feedback text, warnings ARRAY, applied boolean, applied_at timestamp without time zone, applied_by integer, created_at timestamp without time zone
- auth_logs: id integer, event_type character varying, user_id integer, session_id integer, metadata jsonb, created_at timestamp with time zone
- body_composition_history: id integer, user_id integer, measurement_date timestamp with time zone, peso numeric, grasa_corporal numeric, masa_muscular numeric, agua_corporal numeric, metabolismo_basal integer, imc numeric, cintura numeric, cuello numeric, cadera numeric, calculation_method character varying, notes text
- daily_nutrition_log: id integer, user_id integer, log_date date, daily_log jsonb, calories numeric, protein numeric, carbs numeric, fat numeric, created_at timestamp with time zone, updated_at timestamp with time zone
- equipment_items: id integer, name character varying, category character varying, equipment_type character varying, description text, muscle_groups ARRAY, difficulty_level character varying, price_range character varying, is_essential boolean, created_at timestamp with time zone, updated_at timestamp with time zone, name_es character varying, category_es character varying, equipment_type_es character varying
- equipment_translations: id integer, equipment_type_en character varying, equipment_type_es character varying, category_en character varying, category_es character varying, created_at timestamp with time zone
- exercise_ai_info: id integer, exercise_name character varying, exercise_name_normalized character varying, ejecucion text, consejos text, errores_evitar text, first_requested_by integer, request_count integer, ai_model_used character varying, tokens_used integer, generation_cost numeric, is_verified boolean, last_updated timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone
- exercise_history: id integer, user_id integer, exercise_name character varying, exercise_key character varying, exercise_type character varying, training_type character varying, used_at timestamp with time zone, session_id integer, plan_id integer, methodology_type character varying, repetitions integer, sets integer, duration_seconds integer, notes text, difficulty_rating integer, completion_status character varying, created_at timestamp with time zone, updated_at timestamp with time zone
- exercise_session_tracking: id integer, methodology_session_id integer, user_id integer, exercise_name character varying, exercise_order integer, exercise_data jsonb, status character varying, planned_sets integer, planned_reps character varying, planned_duration_seconds integer, planned_rest_seconds integer, actual_sets integer, actual_reps character varying, actual_duration_seconds integer, actual_rest_seconds integer, difficulty_rating integer, effort_rating integer, personal_feedback text, was_difficult boolean, started_at timestamp without time zone, completed_at timestamp without time zone, created_at timestamp without time zone, updated_at timestamp without time zone
- fatigue_flags: id integer, user_id integer, methodology_plan_id integer, session_id integer, flag_date timestamp without time zone, flag_type character varying, sleep_quality integer, energy_level integer, doms_level integer, joint_pain_level integer, focus_level integer, motivation_level integer, performance_drop_pct numeric, underperformed_sets integer, mean_rir_session numeric, notes text, auto_detected boolean, created_at timestamp without time zone
- foods: id uuid, nombre text, categoria text, macros_100g jsonb, tags jsonb, equivalencias jsonb, is_verified boolean, source text, created_at timestamp with time zone, updated_at timestamp with time zone
- hipertrofia_v2_session_config: id integer, cycle_day integer, session_name character varying, muscle_groups jsonb, intensity_percentage integer, is_heavy_day boolean, session_order integer, multiarticular_count integer, unilateral_count integer, analitico_count integer, default_sets integer, default_reps_range character varying, default_rir_target character varying, description text, coach_tip text, created_at timestamp without time zone
- hipertrofia_v2_state: user_id integer, methodology_plan_id integer, cycle_day integer, microcycles_completed integer, current_week_number integer, last_session_at timestamp without time zone, last_session_day_name character varying, priority_muscle character varying, priority_microcycles_elapsed integer, priority_duration_microcycles integer, weekly_topset_used boolean, fatigue_flags_leves integer, fatigue_flags_criticos integer, fatigue_window_start date, deload_active boolean, deload_reason character varying, deload_started_at timestamp without time zone, created_at timestamp without time zone, updated_at timestamp without time zone, last_session_patterns jsonb, neural_overlap_detected character varying, priority_started_at timestamp without time zone, priority_microcycles_completed integer, priority_top_sets_this_week integer, priority_last_week_reset timestamp without time zone
- historico_ejercicios: id integer, user_id integer, nombre_ejercicio text, tipo_ejercicio text, repeticiones integer, tiempo integer, series integer, comentarios text, feedback text, fecha_ejercicio timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone
- home_combination_exercise_history: id integer, user_id integer, combination_id integer, combination_code character varying, exercise_name character varying, exercise_key character varying, times_used integer, last_used_at timestamp with time zone, user_rating character varying, difficulty_feedback character varying, notes text, created_at timestamp with time zone, updated_at timestamp with time zone
- home_exercise_history: id integer, user_id integer, exercise_name character varying, exercise_key character varying, reps text, series integer, duration_seconds integer, plan_id integer, session_id integer, notes text, created_at timestamp with time zone
- home_exercise_progress: id integer, home_training_session_id integer, exercise_name character varying, exercise_order integer, series_completed integer, total_series integer, duration_seconds integer, started_at timestamp with time zone, completed_at timestamp with time zone, status character varying, exercise_data jsonb
- home_exercise_rejections: id integer, user_id integer, exercise_name character varying, exercise_key character varying, equipment_type character varying, training_type character varying, rejection_reason text, rejection_category character varying, rejected_at timestamp without time zone, expires_at timestamp without time zone, is_active boolean, created_at timestamp with time zone, updated_at timestamp with time zone
- home_training_combinations: id integer, combination_code character varying, equipment_type character varying, training_type character varying, difficulty_level character varying, description text, exercises jsonb, duration_minutes integer, calories_estimate integer, is_active boolean, created_at timestamp with time zone, updated_at timestamp with time zone
- home_training_plans: id integer, user_id integer, plan_data jsonb, equipment_type character varying, training_type character varying, created_at timestamp with time zone, updated_at timestamp with time zone
- home_training_sessions: id integer, user_id integer, home_training_plan_id integer, started_at timestamp with time zone, completed_at timestamp with time zone, total_duration_seconds integer, exercises_completed integer, total_exercises integer, progress_percentage numeric, status character varying, session_data jsonb, updated_at timestamp without time zone, created_at timestamp without time zone, abandoned_at timestamp without time zone, abandon_reason character varying
- hypertrophy_blocks: id integer, user_id integer, methodology_plan_id integer, block_name character varying, start_date date, end_date date, total_weeks integer, current_week integer, split_type character varying, sessions_per_week integer, user_level character varying, template_a_exercises jsonb, template_b_exercises jsonb, template_c_exercises jsonb, is_active boolean, created_at timestamp without time zone
- hypertrophy_progression: user_id integer, exercise_id bigint, exercise_name character varying, current_pr numeric, target_weight_80 numeric, last_adjustment character varying, adjustment_date timestamp without time zone, total_volume_accumulated numeric, last_rir_average numeric, sessions_count integer, updated_at timestamp without time zone, target_weight_next_cycle numeric, last_microcycle_completed integer, progression_locked boolean
- hypertrophy_set_logs: id integer, user_id integer, methodology_plan_id integer, session_id integer, exercise_id bigint, exercise_name character varying, set_number integer, weight_used numeric, reps_completed integer, rir_reported integer, estimated_1rm numeric, rpe_calculated integer, volume_load numeric, is_effective boolean, created_at timestamp without time zone, is_warmup boolean
- hypertrophy_weekly_templates: id integer, template_name character varying, day_of_week character varying, exercise_order integer, exercise_id bigint, exercise_name character varying, muscle_group character varying, sets_base integer, reps_range character varying, rir_target character varying, created_at timestamp without time zone
- level_reevaluations: id integer, user_id integer, previous_level character varying, previous_confidence numeric, new_level character varying, new_confidence numeric, reason character varying, microcycles_completed integer, sessions_completed integer, avg_rir_last_month numeric, adherence_percentage numeric, progression_rate numeric, fatigue_flags_count integer, accepted boolean, accepted_at timestamp without time zone, created_at timestamp without time zone
- manual_methodology_exercise_feedback: id integer, methodology_session_id integer, user_id integer, exercise_name character varying, exercise_order integer, sentiment character varying, comment text, difficulty_rating integer, effort_rating integer, personal_notes text, created_at timestamp without time zone, updated_at timestamp without time zone
- methodology_exercise_feedback: id integer, methodology_session_id integer, user_id integer, exercise_name character varying, exercise_order integer, sentiment character varying, comment text, created_at timestamp without time zone, updated_at timestamp without time zone
- methodology_exercise_history_complete: id integer, user_id integer, methodology_plan_id integer, methodology_session_id integer, exercise_name character varying, exercise_order integer, methodology_type character varying, series_total character varying, series_completed integer, repeticiones character varying, intensidad character varying, tiempo_dedicado_segundos integer, week_number integer, day_name character varying, session_date date, completed_at timestamp without time zone, created_at timestamp without time zone, warmup_time_seconds integer
- methodology_exercise_progress: id integer, user_id integer, methodology_session_id integer, exercise_name character varying, exercise_order integer, exercise_level character varying, total_sets character varying, sets_completed integer, total_reps character varying, reps_completed character varying, planned_duration_seconds character varying, actual_duration_seconds character varying, rest_seconds integer, status character varying, difficulty_rating integer, effort_rating integer, exercise_notes text, additional_info text, was_difficult boolean, personal_feedback text, started_at timestamp without time zone, completed_at timestamp without time zone, created_at timestamp without time zone, updated_at timestamp without time zone, series_total character varying, repeticiones character varying, descanso_seg integer, intensidad character varying, tempo character varying, notas text, series_completed integer, time_spent_seconds integer, modal_opened_at timestamp without time zone, modal_closed_at timestamp without time zone, exercise_id bigint
- methodology_exercise_sessions: id integer, user_id integer, methodology_plan_id integer, methodology_type character varying, methodology_level character varying, session_name character varying, week_number integer, day_name character varying, session_date date, total_exercises integer, exercises_completed integer, exercises_skipped integer, exercises_cancelled integer, exercises_in_progress integer, session_status character varying, started_at timestamp without time zone, completed_at timestamp without time zone, total_duration_seconds integer, difficulty_rating integer, effort_rating integer, progress_notes text, evolution_point character varying, target_point character varying, created_at timestamp without time zone, updated_at timestamp without time zone, day_of_month integer, month_name character varying, month_number integer, year_number integer, actual_session_duration_seconds integer, modal_time_total_seconds integer, warmup_time_seconds integer, current_exercise_index integer, exercises_data jsonb, session_metadata jsonb, is_current_session boolean, cancelled_at timestamp without time zone, session_type character varying, session_template_id integer, day_id integer, completion_rate numeric, session_started_at timestamp without time zone
- methodology_plan_days: plan_id integer, day_id integer, date_local date, day_name text, week_number integer, is_rest boolean, planned_exercises_count integer, metadata jsonb, created_at timestamp with time zone
- methodology_plans: id integer, nombre_ejercicio text, nivel text, repeticiones integer, series integer, duracion integer, categoria text, patron text, equipamiento text, criterio_progreso text, progresion_desde text, progresion_hacia text, notas text, activo boolean, created_at timestamp with time zone, updated_at timestamp with time zone, user_id integer, methodology_type character varying, plan_data jsonb, generation_mode character varying, status character varying, confirmed_at timestamp with time zone, version_type character varying, custom_weeks integer, selection_mode character varying, plan_start_date date, started_at timestamp with time zone, completed_at timestamp with time zone, cancelled_at timestamp with time zone, current_week integer, current_day character varying, current_exercise_index integer, plan_progress jsonb, last_session_date date, plan_start_datetime timestamp with time zone, plan_timezone text, total_days integer, plan_name text, plan_description text, origin text, is_current boolean
- methodology_session_feedback: id bigint, user_id integer, methodology_plan_id integer, methodology_session_id integer, exercise_order integer, exercise_name text, feedback_type text, reason_code text, reason_text text, created_at timestamp without time zone, difficulty_rating integer, would_retry boolean, alternative_suggested text
- music_playlists: id integer, user_id integer, name character varying, tracks jsonb, created_at timestamp with time zone, updated_at timestamp with time zone
- nutrition_guidelines: id uuid, slug text, version text, titulo text, contenido jsonb, source text, created_at timestamp with time zone
- nutrition_meal_items: id uuid, meal_id uuid, alimento_id uuid, descripcion text, cantidad_g numeric, kcal integer, macros jsonb, tags jsonb, orden integer, created_at timestamp with time zone
- nutrition_meals: id uuid, plan_day_id uuid, orden integer, nombre text, hora_sugerida time without time zone, kcal integer, macros jsonb, timing_note text, notas text, created_at timestamp with time zone
- nutrition_plan_days: id uuid, plan_id uuid, day_index integer, tipo_dia text, kcal integer, macros jsonb, notas text, created_at timestamp with time zone
- nutrition_plans: id integer, user_id integer, plan_data jsonb, duration_days integer, target_calories integer, target_protein numeric, target_carbs numeric, target_fat numeric, meals_per_day integer, methodology_focus character varying, dietary_style character varying, is_active boolean, generation_mode character varying, created_at timestamp with time zone, updated_at timestamp with time zone
- nutrition_plans_v2: id uuid, user_id integer, plan_name text, tipo text, bmr integer, tdee integer, kcal_objetivo integer, macros_objetivo jsonb, meta text, duracion_dias integer, training_type text, comidas_por_dia integer, fuente text, version_reglas text, created_at timestamp with time zone, updated_at timestamp with time zone
- nutrition_profiles: user_id integer, sexo text, edad integer, altura_cm integer, peso_kg numeric, objetivo text, actividad text, comidas_dia integer, preferencias jsonb, alergias jsonb, updated_at timestamp with time zone, created_at timestamp with time zone
- plan_start_config: methodology_plan_id integer, start_day_of_week integer, is_consecutive_days boolean, intensity_adjusted boolean, is_extended_weeks boolean, first_week_pattern text, regular_pattern text, total_weeks integer, expected_sessions integer, day_mappings jsonb, warnings jsonb, created_at timestamp with time zone, updated_at timestamp with time zone, user_id integer, start_date date, original_pattern text, distribution_option text, include_saturdays boolean
- progreso_usuario: id integer, user_id integer, fecha date, peso numeric, nivel_fuerza text, objetivos_completados integer, tiempo_total_entrenamiento integer, ejercicios_dominados ARRAY, notas text, created_at timestamp with time zone, updated_at timestamp with time zone
- re_evaluation_exercises: id integer, re_evaluation_id integer, exercise_name character varying, exercise_id character varying, series_achieved integer, reps_achieved character varying, weight_kg numeric, difficulty_rating character varying, notes text, created_at timestamp without time zone
- user_custom_equipment: id integer, user_id integer, equipment_name character varying, equipment_type character varying, description text, is_available boolean, created_at timestamp with time zone, updated_at timestamp with time zone
- user_equipment: id integer, user_id integer, equipment_type character varying, has_equipment boolean, created_at timestamp with time zone, updated_at timestamp with time zone
- user_exercise_feedback: id integer, user_id integer, session_id integer, exercise_order integer, exercise_name text, exercise_key text, sentiment text, comment text, created_at timestamp with time zone, methodology_type character varying, feedback_type character varying, ai_weight numeric, avoidance_duration_days integer, expires_at timestamp without time zone, plan_id integer, updated_at timestamp without time zone
- user_exercise_feedback_backup: id integer, user_id integer, session_id integer, exercise_order integer, exercise_name text, exercise_key text, sentiment text, comment text, created_at timestamp with time zone
- user_home_training_stats: id integer, user_id integer, total_sessions integer, total_exercises_completed integer, total_time_minutes integer, current_streak integer, max_streak integer, last_workout_date date, average_session_time integer, favorite_training_type character varying, total_calories_burned integer, created_at timestamp with time zone, updated_at timestamp with time zone, last_training_date date
- user_layouts: id integer, user_id integer, layout_id character varying, layout_data jsonb, created_at timestamp without time zone, updated_at timestamp without time zone
- user_profiles: id integer, user_id integer, objetivo_principal character varying, metodologia_preferida character varying, limitaciones_fisicas text, created_at timestamp without time zone, updated_at timestamp without time zone, music_config jsonb, dias_preferidos_entrenamiento jsonb, ejercicios_por_dia_preferido integer, usar_preferencias_ia boolean, semanas_entrenamiento integer
- user_re_eval_config: user_id integer, frequency_weeks integer, auto_apply_suggestions boolean, notification_enabled boolean, reminder_days_before integer, updated_at timestamp without time zone, created_at timestamp without time zone
- user_re_evaluations: id integer, user_id integer, methodology_plan_id integer, week_number integer, sentiment character varying, overall_comment text, created_at timestamp without time zone
- user_sessions: id integer, user_id integer, session_id uuid, jwt_token text, jwt_expires_at timestamp with time zone, is_active boolean, login_time timestamp with time zone, logout_time timestamp with time zone, logout_type character varying, last_activity timestamp with time zone, ip_address inet, user_agent text, device_info text, created_at timestamp with time zone, updated_at timestamp with time zone, jwt_token_hash character varying, session_metadata jsonb, session_duration interval
- user_training_preferences: id integer, user_id integer, preferred_methodologies ARRAY, focus_areas ARRAY, physical_limitations ARRAY, equipment_preferences ARRAY, preferred_session_duration integer, progression_style character varying, feedback_sensitivity numeric, created_at timestamp without time zone, updated_at timestamp without time zone
- user_training_state: id integer, user_id integer, active_methodology_plan_id integer, active_session_id integer, current_view character varying, is_training boolean, current_exercise_index integer, session_started_at timestamp without time zone, session_paused_at timestamp without time zone, active_modals jsonb, training_metadata jsonb, created_at timestamp without time zone, updated_at timestamp without time zone
- users: id integer, email character varying, password_hash character varying, nombre character varying, created_at timestamp without time zone, updated_at timestamp without time zone, edad integer, sexo character varying, peso numeric, altura numeric, nivel_actividad character varying, años_entrenando integer, grasa_corporal numeric, masa_muscular numeric, agua_corporal numeric, metabolismo_basal integer, cintura numeric, cuello numeric, cadera numeric, pecho numeric, brazo numeric, muslo numeric, metodologia character varying, enfoque character varying, horario_preferido character varying, objetivo_principal character varying, meta_peso numeric, meta_grasa numeric, historial_medico_docs jsonb, alergias ARRAY, medicamentos ARRAY, suplementacion ARRAY, alimentos_evitar ARRAY, apellido character varying, nivel_entrenamiento character varying, anos_entrenando integer, frecuencia_semanal integer, metodologia_preferida character varying, brazos numeric, muslos numeric, antebrazos numeric, historial_medico text, limitaciones_fisicas ARRAY, meta_grasa_corporal numeric, enfoque_entrenamiento character varying, comidas_por_dia integer, alimentos_excluidos ARRAY, last_login timestamp with time zone, is_active boolean, email_verified boolean, lesiones ARRAY, fecha_inicio_objetivo date, fecha_meta_objetivo date, notas_progreso text
- warmup_sets_tracking: id integer, user_id integer, methodology_plan_id integer, session_id integer, exercise_id integer, exercise_name character varying, warmup_config jsonb, sets_completed integer, sets_planned integer, completion_time timestamp without time zone, user_level character varying, target_weight numeric, created_at timestamp without time zone
- workout_schedule: id integer, methodology_plan_id integer, user_id integer, week_number integer, session_order integer, week_session_order integer, scheduled_date date, day_name character varying, day_abbrev character varying, session_title character varying, exercises jsonb, status character varying, completed_at timestamp without time zone, created_at timestamp without time zone, updated_at timestamp without time zone, day_id integer

### public schema

- ejercicios_calistenia: id integer, slug_ejercicio text, nombre text, nivel text, categoria text, patron text, equipamiento text, series_reps_objetivo text, criterio_de_progreso text, progresion_desde text, progresion_hacia text, notas text

## Primary keys

- app.Ejercicios_Bomberos: exercise_id
- app.Ejercicios_Calistenia: exercise_id
- app.Ejercicios_Casa: exercise_id
- app.Ejercicios_CrossFit: exercise_id
- app.Ejercicios_Funcional: exercise_id
- app.Ejercicios_Guardia_Civil: exercise_id
- app.Ejercicios_Halterofilia: exercise_id
- app.Ejercicios_Heavy_Duty: exercise_id
- app.Ejercicios_Policia_Local: exercise_id
- app.Ejercicios_Powerlifting: exercise_id
- app.adaptation_blocks: id
- app.adaptation_criteria_tracking: id
- app.adaptation_technique_flags: id
- app.ai_adjustment_suggestions: id
- app.auth_logs: id
- app.body_composition_history: id
- app.daily_nutrition_log: id
- app.equipment_items: id
- app.equipment_translations: id
- app.exercise_ai_info: id
- app.exercise_history: id
- app.exercise_session_tracking: id
- app.fatigue_flags: id
- app.foods: id
- app.hipertrofia_v2_session_config: id
- app.hipertrofia_v2_state: user_id
- app.historico_ejercicios: id
- app.home_combination_exercise_history: id
- app.home_exercise_history: id
- app.home_exercise_progress: id
- app.home_exercise_rejections: id
- app.home_training_combinations: id
- app.home_training_plans: id
- app.home_training_sessions: id
- app.hypertrophy_blocks: id
- app.hypertrophy_progression: user_id, exercise_id
- app.hypertrophy_set_logs: id
- app.hypertrophy_weekly_templates: id
- app.level_reevaluations: id
- app.manual_methodology_exercise_feedback: id
- app.methodology_exercise_feedback: id
- app.methodology_exercise_history_complete: id
- app.methodology_exercise_progress: id
- app.methodology_exercise_sessions: id
- app.methodology_plan_days: plan_id, day_id
- app.methodology_plans: id
- app.methodology_session_feedback: id
- app.music_playlists: id
- app.nutrition_guidelines: id
- app.nutrition_meal_items: id
- app.nutrition_meals: id
- app.nutrition_plan_days: id
- app.nutrition_plans: id
- app.nutrition_plans_v2: id
- app.nutrition_profiles: user_id
- app.plan_start_config: methodology_plan_id
- app.progreso_usuario: id
- app.re_evaluation_exercises: id
- app.user_custom_equipment: id
- app.user_equipment: id
- app.user_exercise_feedback: id
- app.user_home_training_stats: id
- app.user_layouts: id
- app.user_profiles: id
- app.user_re_eval_config: user_id
- app.user_re_evaluations: id
- app.user_sessions: id
- app.user_training_preferences: id
- app.user_training_state: id
- app.users: id
- app.warmup_sets_tracking: id
- app.workout_schedule: id
- public.ejercicios_calistenia: id

## Unique constraints

- app.Ejercicios_Calistenia: Ejercicios_Calistenia_exercise_id_key (slug)
- app.Ejercicios_Casa: Ejercicios_Casa_nombre_key (nombre)
- app.Ejercicios_Casa: Ejercicios_Casa_slug_key (slug)
- app.Ejercicios_Funcional: Ejercicios_Funcional_nombre_key (nombre)
- app.Ejercicios_Funcional: Ejercicios_Funcional_slug_key (slug)
- app.Ejercicios_Halterofilia: Ejercicios_Halterofilia_nombre_key (nombre)
- app.Ejercicios_Halterofilia: Ejercicios_Halterofilia_slug_key (slug)
- app.adaptation_blocks: unique_active_adaptation (user_id, status)
- app.adaptation_criteria_tracking: unique_week_per_block (adaptation_block_id, week_number)
- app.daily_nutrition_log: unique_user_date_nutrition (user_id, log_date)
- app.equipment_items: equipment_items_name_key (name)
- app.equipment_translations: equipment_translations_equipment_type_en_key (equipment_type_en)
- app.exercise_ai_info: exercise_ai_info_exercise_name_key (exercise_name)
- app.home_combination_exercise_history: home_combination_exercise_his_user_id_combination_id_exerci_key (user_id, combination_id, exercise_name)
- app.home_exercise_rejections: unique_rejection (user_id, exercise_key, equipment_type, training_type, is_active)
- app.home_training_combinations: home_training_combinations_combination_code_key (combination_code)
- app.manual_methodology_exercise_feedback: manual_methodology_exercise_f_methodology_session_id_exerci_key (methodology_session_id, exercise_order)
- app.methodology_exercise_feedback: methodology_exercise_feedback_methodology_session_id_exerci_key (methodology_session_id, exercise_order)
- app.methodology_exercise_history_complete: methodology_exercise_history\_\_methodology_session_id_exerci_key (methodology_session_id, exercise_order)
- app.music_playlists: uq_music_playlists_user_name (user_id, name)
- app.nutrition_guidelines: nutrition_guidelines_slug_key (slug)
- app.progreso_usuario: progreso_usuario_user_id_fecha_key (user_id, fecha)
- app.user_custom_equipment: user_custom_equipment_user_id_equipment_name_key (user_id, equipment_name)
- app.user_equipment: user_equipment_user_id_equipment_type_key (user_id, equipment_type)
- app.user_exercise_feedback: user_exercise_feedback_user_session_exercise_unique (user_id, session_id, exercise_order)
- app.user_home_training_stats: user_home_training_stats_user_id_key (user_id)
- app.user_layouts: user_layouts_user_id_layout_id_key (user_id, layout_id)
- app.user_profiles: user_profiles_user_id_key (user_id)
- app.user_re_evaluations: unique_plan_week (methodology_plan_id, week_number)
- app.user_sessions: user_sessions_session_id_key (session_id)
- app.user_sessions: user_sessions_session_id_unique (session_id)
- app.user_training_preferences: user_training_preferences_user_id_key (user_id)
- app.user_training_state: user_training_state_user_id_key (user_id)
- app.users: users_email_key (email)

## Foreign keys

- app.adaptation_blocks.methodology_plan_id -> app.methodology_plans.id (adaptation_blocks_methodology_plan_id_fkey)
- app.adaptation_blocks.user_id -> app.users.id (adaptation_blocks_user_id_fkey)
- app.adaptation_criteria_tracking.adaptation_block_id -> app.adaptation_blocks.id (adaptation_criteria_tracking_adaptation_block_id_fkey)
- app.adaptation_technique_flags.adaptation_block_id -> app.adaptation_blocks.id (adaptation_technique_flags_adaptation_block_id_fkey)
- app.adaptation_technique_flags.user_id -> app.users.id (adaptation_technique_flags_user_id_fkey)
- app.ai_adjustment_suggestions.applied_by -> app.users.id (ai_adjustment_suggestions_applied_by_fkey)
- app.ai_adjustment_suggestions.re_evaluation_id -> app.user_re_evaluations.id (ai_adjustment_suggestions_re_evaluation_id_fkey)
- app.auth_logs.user_id -> app.users.id (auth_logs_user_id_fkey)
- app.body_composition_history.user_id -> app.users.id (fk_user_id)
- app.exercise_session_tracking.methodology_session_id -> app.methodology_exercise_sessions.id (exercise_session_tracking_methodology_session_id_fkey)
- app.exercise_session_tracking.user_id -> app.users.id (exercise_session_tracking_user_id_fkey)
- app.fatigue_flags.methodology_plan_id -> app.methodology_plans.id (fatigue_flags_methodology_plan_id_fkey)
- app.fatigue_flags.session_id -> app.methodology_exercise_sessions.id (fatigue_flags_session_id_fkey)
- app.fatigue_flags.user_id -> app.users.id (fatigue_flags_user_id_fkey)
- app.hipertrofia_v2_state.methodology_plan_id -> app.methodology_plans.id (hipertrofia_v2_state_methodology_plan_id_fkey)
- app.hipertrofia_v2_state.user_id -> app.users.id (hipertrofia_v2_state_user_id_fkey)
- app.home_exercise_history.plan_id -> app.home_training_plans.id (home_exercise_history_plan_id_fkey)
- app.home_exercise_history.session_id -> app.home_training_sessions.id (home_exercise_history_session_id_fkey)
- app.home_exercise_history.user_id -> app.users.id (home_exercise_history_user_id_fkey)
- app.home_exercise_progress.home_training_session_id -> app.home_training_sessions.id (home_exercise_progress_home_training_session_id_fkey)
- app.home_training_plans.user_id -> app.users.id (home_training_plans_user_id_fkey)
- app.home_training_sessions.home_training_plan_id -> app.home_training_plans.id (home_training_sessions_home_training_plan_id_fkey)
- app.home_training_sessions.user_id -> app.users.id (home_training_sessions_user_id_fkey)
- app.level_reevaluations.user_id -> app.users.id (level_reevaluations_user_id_fkey)
- app.methodology_exercise_history_complete.methodology_session_id -> app.methodology_exercise_sessions.id (methodology_exercise_history_comple_methodology_session_id_fkey)
- app.methodology_exercise_history_complete.methodology_plan_id -> app.methodology_plans.id (methodology_exercise_history_complete_methodology_plan_id_fkey)
- app.methodology_exercise_history_complete.user_id -> app.users.id (methodology_exercise_history_complete_user_id_fkey)
- app.methodology_plan_days.plan_id -> app.methodology_plans.id (methodology_plan_days_plan_id_fkey)
- app.methodology_session_feedback.methodology_plan_id -> app.methodology_plans.id (methodology_session_feedback_methodology_plan_id_fkey)
- app.methodology_session_feedback.methodology_session_id -> app.methodology_exercise_sessions.id (methodology_session_feedback_methodology_session_id_fkey)
- app.methodology_session_feedback.user_id -> app.users.id (methodology_session_feedback_user_id_fkey)
- app.music_playlists.user_id -> app.users.id (fk_music_playlists_user_id)
- app.nutrition_meal_items.meal_id -> app.nutrition_meals.id (nutrition_meal_items_meal_id_fkey)
- app.nutrition_meals.plan_day_id -> app.nutrition_plan_days.id (nutrition_meals_plan_day_id_fkey)
- app.nutrition_plan_days.plan_id -> app.nutrition_plans_v2.id (nutrition_plan_days_plan_id_fkey)
- app.nutrition_profiles.user_id -> app.users.id (nutrition_profiles_user_id_fkey)
- app.plan_start_config.methodology_plan_id -> app.methodology_plans.id (plan_start_config_methodology_plan_id_fkey)
- app.plan_start_config.user_id -> app.users.id (plan_start_config_user_id_fkey)
- app.re_evaluation_exercises.re_evaluation_id -> app.user_re_evaluations.id (re_evaluation_exercises_re_evaluation_id_fkey)
- app.user_exercise_feedback.session_id -> app.home_training_sessions.id (fk_feedback_session)
- app.user_layouts.user_id -> app.users.id (user_layouts_user_id_fkey)
- app.user_profiles.user_id -> app.users.id (user_profiles_user_id_fkey)
- app.user_re_eval_config.user_id -> app.users.id (user_re_eval_config_user_id_fkey)
- app.user_re_evaluations.methodology_plan_id -> app.methodology_plans.id (user_re_evaluations_methodology_plan_id_fkey)
- app.user_re_evaluations.user_id -> app.users.id (user_re_evaluations_user_id_fkey)
- app.user_training_preferences.user_id -> app.users.id (user_training_preferences_user_id_fkey)
- app.user_training_state.active_methodology_plan_id -> app.methodology_plans.id (user_training_state_active_methodology_plan_id_fkey)
- app.user_training_state.active_session_id -> app.methodology_exercise_sessions.id (user_training_state_active_session_id_fkey)
- app.user_training_state.user_id -> app.users.id (user_training_state_user_id_fkey)
- app.warmup_sets_tracking.methodology_plan_id -> app.methodology_plans.id (warmup_sets_tracking_methodology_plan_id_fkey)
- app.warmup_sets_tracking.user_id -> app.users.id (warmup_sets_tracking_user_id_fkey)
- app.workout_schedule.methodology_plan_id -> app.methodology_plans.id (workout_schedule_methodology_plan_id_fkey)

## Check constraints

- app.Ejercicios_Calistenia: Ejercicios_Calistenia_nivel_check => CHECK (nivel = ANY (ARRAY['Principiante'::text, 'Intermedio'::text, 'Avanzado'::text]))
- app.Ejercicios_Casa: Ejercicios_Casa_categoria_check => CHECK (categoria::text = ANY (ARRAY['Funcional'::character varying, 'HIIT'::character varying, 'Fuerza'::character varying, 'Cardio'::character varying, 'Movilidad'::character varying]::text[]))
- app.Ejercicios_Casa: Ejercicios_Casa_nivel_check => CHECK (nivel::text = ANY (ARRAY['Principiante'::character varying, 'Intermedio'::character varying, 'Avanzado'::character varying]::text[]))
- app.Ejercicios_CrossFit: Ejercicios_CrossFit_dominio_check => CHECK (dominio::text = ANY (ARRAY['Gymnastic'::character varying, 'Weightlifting'::character varying, 'Monostructural'::character varying, 'Accesorios'::character varying]::text[]))
- app.Ejercicios_CrossFit: Ejercicios_CrossFit_nivel_check => CHECK (nivel::text = ANY (ARRAY['Principiante'::character varying, 'Intermedio'::character varying, 'Avanzado'::character varying, 'Elite'::character varying]::text[]))
- app.Ejercicios_Hipertrofia: Ejercicios_Hipertrofia_tipo_ejercicio_check => CHECK (tipo_ejercicio::text = ANY (ARRAY['multiarticular'::character varying, 'unilateral'::character varying, 'analitico'::character varying]::text[]))
- app.adaptation_blocks: adaptation_blocks_block_type_check => CHECK (block_type::text = ANY (ARRAY['full_body'::character varying, 'half_body'::character varying]::text[]))
- app.adaptation_blocks: adaptation_blocks_duration_weeks_check => CHECK (duration_weeks >= 1 AND duration_weeks <= 4)
- app.adaptation_blocks: adaptation_blocks_status_check => CHECK (status::text = ANY (ARRAY['active'::character varying, 'completed'::character varying, 'abandoned'::character varying]::text[]))
- app.adaptation_criteria_tracking: adaptation_criteria_tracking_week_number_check => CHECK (week_number > 0)
- app.adaptation_technique_flags: adaptation_technique_flags_flag_type_check => CHECK (flag_type::text = ANY (ARRAY['incorrect_rom'::character varying, 'poor_posture'::character varying, 'excessive_momentum'::character varying, 'unstable_movement'::character varying, 'compensation_pattern'::character varying, 'pain_reported'::character varying]::text[]))
- app.adaptation_technique_flags: adaptation_technique_flags_severity_check => CHECK (severity::text = ANY (ARRAY['minor'::character varying, 'moderate'::character varying, 'serious'::character varying]::text[]))
- app.body_composition_history: body_composition_history_user_id_idx => CHECK (user_id IS NOT NULL)
- app.exercise_history: exercise_history_difficulty_rating_check => CHECK (difficulty_rating >= 1 AND difficulty_rating <= 5)
- app.exercise_session_tracking: exercise_session_tracking_difficulty_rating_check => CHECK (difficulty_rating >= 1 AND difficulty_rating <= 5)
- app.exercise_session_tracking: exercise_session_tracking_effort_rating_check => CHECK (effort_rating >= 1 AND effort_rating <= 5)
- app.fatigue_flags: fatigue_flags_doms_level_check => CHECK (doms_level >= 0 AND doms_level <= 10)
- app.fatigue_flags: fatigue_flags_energy_level_check => CHECK (energy_level >= 1 AND energy_level <= 10)
- app.fatigue_flags: fatigue_flags_flag_type_check => CHECK (flag_type::text = ANY (ARRAY['light'::character varying, 'critical'::character varying, 'cognitive'::character varying]::text[]))
- app.fatigue_flags: fatigue_flags_focus_level_check => CHECK (focus_level >= 1 AND focus_level <= 10)
- app.fatigue_flags: fatigue_flags_joint_pain_level_check => CHECK (joint_pain_level >= 0 AND joint_pain_level <= 10)
- app.fatigue_flags: fatigue_flags_motivation_level_check => CHECK (motivation_level >= 1 AND motivation_level <= 10)
- app.fatigue_flags: fatigue_flags_sleep_quality_check => CHECK (sleep_quality >= 1 AND sleep_quality <= 10)
- app.foods: foods_categoria_check => CHECK (categoria = ANY (ARRAY['proteina'::text, 'carbohidrato'::text, 'vegetal'::text, 'fruta'::text, 'lacteo'::text, 'grasa'::text, 'condimento'::text, 'otro'::text]))
- app.hipertrofia_v2_session_config: hipertrofia_v2_session_config_cycle_day_check => CHECK (cycle_day >= 1 AND cycle_day <= 5)
- app.hipertrofia_v2_state: hipertrofia_v2_state_cycle_day_check => CHECK (cycle_day >= 1 AND cycle_day <= 5)
- app.hipertrofia_v2_state: hipertrofia_v2_state_neural_overlap_detected_check => CHECK (neural_overlap_detected::text = ANY (ARRAY['none'::character varying, 'partial'::character varying, 'high'::character varying]::text[]))
- app.historico_ejercicios: historico_ejercicios_tipo_ejercicio_check => CHECK (tipo_ejercicio = ANY (ARRAY['calistenia'::text, 'hipertrofia'::text, 'hometraining'::text]))
- app.home_exercise_progress: chk_ex_progress_status => CHECK (status::text = ANY (ARRAY['pending'::character varying::text, 'in_progress'::character varying::text, 'completed'::character varying::text, 'skipped'::character varying::text, 'cancelled'::character varying::text]))
- app.home_training_sessions: check_abandon_reason => CHECK (abandon_reason::text = ANY (ARRAY['beforeunload'::character varying, 'visibility_hidden'::character varying, 'logout'::character varying, 'manual_close'::character varying, 'timeout'::character varying]::text[]))
- app.methodology_exercise_sessions: check_session_status => CHECK (session_status::text = ANY (ARRAY['scheduled'::character varying, 'pending'::character varying, 'in_progress'::character varying, 'completed'::character varying, 'partial'::character varying, 'cancelled'::character varying, 'skipped'::character varying, 'missed'::character varying]::text[]))
- app.methodology_plans: methodology_plans_new_categoria_check => CHECK (categoria = ANY (ARRAY['traccion'::text, 'empuje'::text, 'piernas'::text, 'core'::text, 'equilibrado'::text, 'soporte'::text]))
- app.methodology_plans: methodology_plans_new_nivel_check => CHECK (nivel = ANY (ARRAY['basico'::text, 'intermedio'::text, 'avanzado'::text]))
- app.methodology_session_feedback: methodology_session_feedback_difficulty_rating_check => CHECK (difficulty_rating >= 1 AND difficulty_rating <= 5)
- app.methodology_session_feedback: methodology_session_feedback_feedback_type_check => CHECK (feedback_type = ANY (ARRAY['skipped'::text, 'cancelled'::text]))
- app.methodology_session_feedback: methodology_session_feedback_reason_code_check => CHECK (reason_code = ANY (ARRAY['dificil'::text, 'no_se_ejecutar'::text, 'lesion'::text, 'equipamiento'::text, 'cansancio'::text, 'tiempo'::text, 'motivacion'::text, 'auto_missed'::text, 'otros'::text]))
- app.music_playlists: chk_playlist_name_length => CHECK (length(TRIM(BOTH FROM name)) > 0 AND length(name::text) <= 255)
- app.music_playlists: chk_tracks_is_array => CHECK (jsonb_typeof(tracks) = 'array'::text)
- app.nutrition_plan_days: nutrition_plan_days_tipo_dia_check => CHECK (tipo_dia = ANY (ARRAY['entreno'::text, 'descanso'::text]))
- app.nutrition_plans_v2: nutrition_plans_v2_comidas_por_dia_check => CHECK (comidas_por_dia >= 3 AND comidas_por_dia <= 6)
- app.nutrition_plans_v2: nutrition_plans_v2_duracion_dias_check => CHECK (duracion_dias >= 3 AND duracion_dias <= 31)
- app.nutrition_plans_v2: nutrition_plans_v2_fuente_check => CHECK (fuente = ANY (ARRAY['determinista'::text, 'ia'::text, 'hibrido'::text]))
- app.nutrition_plans_v2: nutrition_plans_v2_meta_check => CHECK (meta = ANY (ARRAY['cut'::text, 'mant'::text, 'bulk'::text]))
- app.nutrition_plans_v2: nutrition_plans_v2_tipo_check => CHECK (tipo = ANY (ARRAY['borrador'::text, 'activo'::text, 'archivado'::text]))
- app.nutrition_profiles: nutrition_profiles_actividad_check => CHECK (actividad = ANY (ARRAY['sedentario'::text, 'ligero'::text, 'moderado'::text, 'alto'::text, 'muy_alto'::text]))
- app.nutrition_profiles: nutrition_profiles_altura_cm_check => CHECK (altura_cm >= 120 AND altura_cm <= 230)
- app.nutrition_profiles: nutrition_profiles_comidas_dia_check => CHECK (comidas_dia >= 3 AND comidas_dia <= 6)
- app.nutrition_profiles: nutrition_profiles_edad_check => CHECK (edad >= 13 AND edad <= 90)
- app.nutrition_profiles: nutrition_profiles_objetivo_check => CHECK (objetivo = ANY (ARRAY['cut'::text, 'mant'::text, 'bulk'::text]))
- app.nutrition_profiles: nutrition_profiles_peso_kg_check => CHECK (peso_kg >= 30::numeric AND peso_kg <= 250::numeric)
- app.nutrition_profiles: nutrition_profiles_sexo_check => CHECK (sexo = ANY (ARRAY['hombre'::text, 'mujer'::text]))
- app.user_exercise_feedback: user_exercise_feedback_sentiment_unified => CHECK (sentiment IS NULL OR (sentiment = ANY (ARRAY['like'::text, 'dislike'::text, 'hard'::text])))
- app.user_profiles: user_profiles_ejercicios_por_dia_preferido_check => CHECK (ejercicios_por_dia_preferido >= 4 AND ejercicios_por_dia_preferido <= 15)
- app.user_profiles: user_profiles_semanas_entrenamiento_check => CHECK (semanas_entrenamiento >= 1 AND semanas_entrenamiento <= 8)
- app.user_re_eval_config: user_re_eval_config_frequency_weeks_check => CHECK (frequency_weeks >= 1 AND frequency_weeks <= 12)
- app.users: chk_anos_entrenando_nonneg => CHECK (anos_entrenando >= 0)
- app.users: chk_frecuencia_semanal_range => CHECK (frecuencia_semanal >= 0 AND frecuencia_semanal <= 7)
- app.users: users_anos_entrenando_chk => CHECK (anos_entrenando >= 0)
- app.users: users_enfoque_check => CHECK (enfoque::text = ANY (ARRAY['fuerza'::character varying::text, 'hipertrofia'::character varying::text, 'resistencia'::character varying::text, 'perdida_peso'::character varying::text, 'general'::character varying::text]))
- app.users: users_horario_preferido_check => CHECK (horario_preferido::text = ANY (ARRAY['mañana'::character varying::text, 'media_mañana'::character varying::text, 'tarde'::character varying::text, 'noche'::character varying::text]))
- app.users: users_metodologia_check => CHECK (metodologia::text = ANY (ARRAY['tradicional'::character varying::text, 'funcional'::character varying::text, 'crossfit'::character varying::text, 'calistenia'::character varying::text, 'powerlifting'::character varying::text, 'bodybuilding'::character varying::text]))
- app.users: users_nivel_actividad_check => CHECK (nivel_actividad::text = ANY (ARRAY['sedentario'::character varying::text, 'ligero'::character varying::text, 'moderado'::character varying::text, 'activo'::character varying::text, 'muy_activo'::character varying::text]))
- app.users: users_objetivo_principal_check => CHECK (objetivo_principal::text = ANY (ARRAY['ganar_peso'::character varying::text, 'rehabilitacion'::character varying::text, 'perder_peso'::character varying::text, 'tonificar'::character varying::text, 'ganar_masa_muscular'::character varying::text, 'mejorar_resistencia'::character varying::text, 'mejorar_flexibilidad'::character varying::text, 'salud_general'::character varying::text, 'mantenimiento'::character varying::text]))
- app.users: users_sexo_check => CHECK (sexo::text = ANY (ARRAY['masculino'::character varying::text, 'femenino'::character varying::text]))

## Index summary (count per table)

- app.Ejercicios_Bomberos: 4
- app.Ejercicios_Calistenia: 3
- app.Ejercicios_Casa: 8
- app.Ejercicios_CrossFit: 6
- app.Ejercicios_Funcional: 7
- app.Ejercicios_Guardia_Civil: 4
- app.Ejercicios_Halterofilia: 7
- app.Ejercicios_Heavy_Duty: 2
- app.Ejercicios_Hipertrofia: 2
- app.Ejercicios_Policia_Local: 4
- app.Ejercicios_Powerlifting: 5
- app.adaptation_blocks: 4
- app.adaptation_criteria_tracking: 4
- app.adaptation_technique_flags: 4
- app.ai_adjustment_suggestions: 4
- app.auth_logs: 1
- app.body_composition_history: 4
- app.daily_nutrition_log: 3
- app.equipment_items: 6
- app.equipment_translations: 2
- app.exercise_ai_info: 7
- app.exercise_history: 5
- app.exercise_session_tracking: 4
- app.fatigue_flags: 4
- app.foods: 4
- app.hipertrofia_v2_session_config: 3
- app.hipertrofia_v2_state: 3
- app.historico_ejercicios: 1
- app.home_combination_exercise_history: 6
- app.home_exercise_history: 7
- app.home_exercise_progress: 5
- app.home_exercise_rejections: 7
- app.home_training_combinations: 3
- app.home_training_plans: 4
- app.home_training_sessions: 5
- app.hypertrophy_blocks: 2
- app.hypertrophy_progression: 2
- app.hypertrophy_set_logs: 4
- app.hypertrophy_weekly_templates: 2
- app.level_reevaluations: 3
- app.manual_methodology_exercise_feedback: 2
- app.methodology_exercise_feedback: 6
- app.methodology_exercise_history_complete: 7
- app.methodology_exercise_progress: 4
- app.methodology_exercise_sessions: 11
- app.methodology_plan_days: 4
- app.methodology_plans: 4
- app.methodology_session_feedback: 4
- app.music_playlists: 6
- app.nutrition_guidelines: 2
- app.nutrition_meal_items: 3
- app.nutrition_meals: 3
- app.nutrition_plan_days: 2
- app.nutrition_plans: 2
- app.nutrition_plans_v2: 4
- app.nutrition_profiles: 2
- app.plan_start_config: 3
- app.progreso_usuario: 2
- app.re_evaluation_exercises: 3
- app.user_custom_equipment: 5
- app.user_equipment: 3
- app.user_exercise_feedback: 12
- app.user_home_training_stats: 3
- app.user_layouts: 3
- app.user_profiles: 6
- app.user_re_eval_config: 2
- app.user_re_evaluations: 6
- app.user_sessions: 6
- app.user_training_preferences: 2
- app.user_training_state: 5
- app.users: 9
- app.warmup_sets_tracking: 3
- app.workout_schedule: 7
- public.ejercicios_calistenia: 1

## Views

### app.adaptation_progress_summary

```
SELECT b.id AS adaptation_block_id,
    b.user_id,
    b.block_type,
    b.duration_weeks,
    b.start_date,
    b.status,
    count(t.week_number) AS weeks_tracked,
    max(t.week_number) AS latest_week,
    ( SELECT adaptation_criteria_tracking.sessions_completed::numeric / NULLIF(adaptation_criteria_tracking.sessions_planned, 0)::numeric * 100::numeric
           FROM app.adaptation_criteria_tracking
          WHERE adaptation_criteria_tracking.adaptation_block_id = b.id
          ORDER BY adaptation_criteria_tracking.week_number DESC
         LIMIT 1) AS latest_adherence_pct,
    ( SELECT adaptation_criteria_tracking.mean_rir
           FROM app.adaptation_criteria_tracking
          WHERE adaptation_criteria_tracking.adaptation_block_id = b.id
          ORDER BY adaptation_criteria_tracking.week_number DESC
         LIMIT 1) AS latest_mean_rir,
        CASE
            WHEN (( SELECT adaptation_criteria_tracking.sessions_completed::numeric / NULLIF(adaptation_criteria_tracking.sessions_planned, 0)::numeric
               FROM app.adaptation_criteria_tracking
              WHERE adaptation_criteria_tracking.adaptation_block_id = b.id
              ORDER BY adaptation_criteria_tracking.week_number DESC
             LIMIT 1)) >= 0.8 THEN true
            ELSE false
        END AS latest_adherence_met,
        CASE
            WHEN (( SELECT adaptation_criteria_tracking.mean_rir
               FROM app.adaptation_criteria_tracking
              WHERE adaptation_criteria_tracking.adaptation_block_id = b.id
              ORDER BY adaptation_criteria_tracking.week_number DESC
             LIMIT 1)) <= 4.0 THEN true
            ELSE false
        END AS latest_rir_met,
        CASE
            WHEN b.status::text = 'active'::text AND (( SELECT count(*) AS count
               FROM app.adaptation_criteria_tracking
              WHERE adaptation_criteria_tracking.adaptation_block_id = b.id)) >= b.duration_weeks THEN true
            ELSE false
        END AS ready_for_transition
   FROM app.adaptation_blocks b
     LEFT JOIN app.adaptation_criteria_tracking t ON b.id = t.adaptation_block_id
  GROUP BY b.id;
```

### app.hipertrofia_v2_user_status

Comment: Vista consolidada del estado MindFeed del usuario: ciclo actual, progresión, deload

```
SELECT s.user_id,
    s.methodology_plan_id,
    s.cycle_day,
    s.microcycles_completed,
    s.last_session_at,
    s.last_session_day_name,
    s.deload_active,
    s.deload_reason,
    concat('D', s.cycle_day) AS next_session,
    sc.session_name AS next_session_name,
    sc.muscle_groups AS next_muscle_groups,
    sc.intensity_percentage AS next_intensity_pct,
    ( SELECT avg(hypertrophy_set_logs.rir_reported) AS avg
           FROM app.hypertrophy_set_logs
          WHERE hypertrophy_set_logs.user_id = s.user_id AND hypertrophy_set_logs.created_at > (now() - '14 days'::interval)) AS recent_mean_rir,
    (app.check_deload_trigger(s.user_id) ->> 'should_trigger'::text)::boolean AS deload_should_trigger,
    s.updated_at
   FROM app.hipertrofia_v2_state s
     LEFT JOIN app.hipertrofia_v2_session_config sc ON sc.cycle_day = s.cycle_day;
```

### app.hypertrophy_user_progress

Comment: Vista de análisis de progreso por ejercicio y usuario

```
SELECT user_id,
    exercise_id,
    exercise_name,
    count(DISTINCT session_id) AS total_sessions,
    max(estimated_1rm) AS best_estimated_pr,
    avg(rir_reported) AS avg_rir,
    sum(volume_load) AS total_volume,
    round(avg(
        CASE
            WHEN is_effective THEN 1.0
            ELSE 0.0
        END) * 100::numeric, 2) AS effective_sets_percentage,
    max(created_at) AS last_session_date
   FROM app.hypertrophy_set_logs sl
  GROUP BY user_id, exercise_id, exercise_name;
```

### app.pending_reevaluations

Comment: Re-evaluaciones de nivel pendientes de respuesta del usuario

```
SELECT id,
    user_id,
    previous_level,
    new_level,
    reason,
    new_confidence,
    adherence_percentage,
    avg_rir_last_month,
    created_at,
    EXTRACT(day FROM now() - created_at::timestamp with time zone) AS days_pending
   FROM app.level_reevaluations r
  WHERE accepted IS NULL
  ORDER BY created_at DESC;
```

### app.user_fatigue_summary

```
SELECT u.id AS user_id,
    u.email,
    count(*) FILTER (WHERE ff.flag_date >= (now() - '7 days'::interval)) AS flags_last_7_days,
    count(*) FILTER (WHERE ff.flag_type::text = 'light'::text AND ff.flag_date >= (now() - '7 days'::interval)) AS light_flags_7d,
    count(*) FILTER (WHERE ff.flag_type::text = 'critical'::text AND ff.flag_date >= (now() - '7 days'::interval)) AS critical_flags_7d,
    max(ff.flag_date) AS last_flag_date,
    ( SELECT fatigue_flags.flag_type
           FROM app.fatigue_flags
          WHERE fatigue_flags.user_id = u.id
          ORDER BY fatigue_flags.flag_date DESC
         LIMIT 1) AS last_flag_type,
    ( SELECT avg(hv.rir_reported)::numeric(3,1) AS avg
           FROM app.hypertrophy_set_logs hv
             JOIN app.methodology_exercise_sessions mes ON hv.session_id = mes.id
          WHERE mes.user_id = u.id AND mes.session_date >= (now() - '14 days'::interval)) AS mean_rir_14d
   FROM app.users u
     LEFT JOIN app.fatigue_flags ff ON u.id = ff.user_id
  GROUP BY u.id, u.email;
```

### app.v_exercise_progress_expanded

```
SELECT id,
    user_id,
    methodology_session_id,
    exercise_name,
    exercise_order,
    exercise_level,
    total_sets,
    sets_completed,
    total_reps,
    reps_completed,
    planned_duration_seconds,
    actual_duration_seconds,
    rest_seconds,
    status,
    difficulty_rating,
    effort_rating,
    exercise_notes,
    additional_info,
    was_difficult,
    personal_feedback,
    started_at,
    completed_at,
    created_at,
    updated_at,
    series_total,
    repeticiones,
    descanso_seg,
    intensidad,
    tempo,
    notas,
    series_completed,
    app.range_to_min_value(series_total) AS series_min,
    app.range_to_max_value(series_total) AS series_max,
    app.range_to_min_value(repeticiones) AS reps_min,
    app.range_to_max_value(repeticiones) AS reps_max,
    app.range_to_min_value(planned_duration_seconds::character varying) AS duration_min,
    app.range_to_max_value(planned_duration_seconds::character varying) AS duration_max
   FROM app.methodology_exercise_progress;
```

### app.v_home_hist_propuesto

```
SELECT user_id,
    exercise_name,
    exercise_key,
    created_at
   FROM app.home_combination_exercise_history
  WHERE exercise_name IS NOT NULL AND exercise_key IS NOT NULL;
```

### app.v_home_hist_real

```
SELECT user_id,
    exercise_name,
    exercise_key,
    created_at
   FROM app.home_exercise_history
  WHERE exercise_name IS NOT NULL AND exercise_key IS NOT NULL;
```

### app.v_re_evaluation_history

Comment: Vista consolidada del historial de re-evaluaciones con métricas agregadas

```
SELECT re.id,
    re.user_id,
    re.methodology_plan_id,
    mp.methodology_type,
    re.week_number,
    re.sentiment,
    re.overall_comment,
    re.created_at AS evaluation_date,
    count(ree.id) AS exercises_evaluated,
    avg(
        CASE ree.difficulty_rating
            WHEN 'facil'::text THEN 1
            WHEN 'adecuado'::text THEN 2
            WHEN 'dificil'::text THEN 3
            ELSE NULL::integer
        END) AS avg_difficulty,
    ai.progress_assessment,
    ai.intensity_change,
    ai.motivational_feedback,
    ai.applied AS adjustments_applied
   FROM app.user_re_evaluations re
     LEFT JOIN app.methodology_plans mp ON re.methodology_plan_id = mp.id
     LEFT JOIN app.re_evaluation_exercises ree ON re.id = ree.re_evaluation_id
     LEFT JOIN app.ai_adjustment_suggestions ai ON re.id = ai.re_evaluation_id
  GROUP BY re.id, mp.methodology_type, ai.id;
```

### app.v_training_time_stats

```
SELECT s.id AS session_id,
    s.user_id,
    s.methodology_type,
    s.session_name,
    s.week_number,
    s.day_name,
    s.session_date,
    s.modal_time_total_seconds,
    s.actual_session_duration_seconds,
    app.seconds_to_time_format(s.modal_time_total_seconds) AS modal_time_formatted,
    app.seconds_to_time_format(s.actual_session_duration_seconds) AS session_duration_formatted,
    count(p.id) AS total_exercises,
    count(
        CASE
            WHEN p.status::text = 'completed'::text THEN 1
            ELSE NULL::integer
        END) AS completed_exercises,
    avg(p.time_spent_seconds) AS avg_time_per_exercise,
    app.seconds_to_time_format(avg(p.time_spent_seconds)::integer) AS avg_time_formatted
   FROM app.methodology_exercise_sessions s
     LEFT JOIN app.methodology_exercise_progress p ON p.methodology_session_id = s.id
  GROUP BY s.id, s.user_id, s.methodology_type, s.session_name, s.week_number, s.day_name, s.session_date, s.modal_time_total_seconds, s.actual_session_duration_seconds;
```

### app.warmup_adherence_stats

Comment: Estadísticas de adherencia al protocolo de calentamiento por usuario

```
SELECT u.id AS user_id,
    count(DISTINCT wst.session_id) AS sessions_with_warmup,
    count(DISTINCT hsl.session_id) AS total_sessions,
        CASE
            WHEN count(DISTINCT hsl.session_id) > 0 THEN round(count(DISTINCT wst.session_id)::numeric / count(DISTINCT hsl.session_id)::numeric * 100::numeric, 2)
            ELSE 0::numeric
        END AS warmup_adherence_percentage,
    count(DISTINCT
        CASE
            WHEN wst.completion_time >= (now() - '30 days'::interval) THEN wst.session_id
            ELSE NULL::integer
        END) AS recent_warmups_30d,
    max(wst.completion_time) AS last_warmup_date
   FROM app.users u
     LEFT JOIN app.warmup_sets_tracking wst ON wst.user_id = u.id
     LEFT JOIN app.hypertrophy_set_logs hsl ON hsl.user_id = u.id
  GROUP BY u.id;
```

## Triggers

- app.Ejercicios_Calistenia.trg_upd_ejercicios_calistenia: CREATE TRIGGER trg_upd_ejercicios_calistenia BEFORE UPDATE ON app."Ejercicios_Calistenia" FOR EACH ROW EXECUTE FUNCTION app.tg_set_updated_at_ejercicios_calistenia()
- app.Ejercicios_Casa.trigger_update_ejercicios_casa_timestamp: CREATE TRIGGER trigger_update_ejercicios_casa_timestamp BEFORE UPDATE ON app."Ejercicios_Casa" FOR EACH ROW EXECUTE FUNCTION update_ejercicios_casa_timestamp()
- app.Ejercicios_CrossFit.trigger_update_crossfit_timestamp: CREATE TRIGGER trigger_update_crossfit_timestamp BEFORE UPDATE ON app."Ejercicios_CrossFit" FOR EACH ROW EXECUTE FUNCTION app.update_crossfit_updated_at()
- app.Ejercicios_Halterofilia.trigger_update_ejercicios_halterofilia_timestamp: CREATE TRIGGER trigger_update_ejercicios_halterofilia_timestamp BEFORE UPDATE ON app."Ejercicios_Halterofilia" FOR EACH ROW EXECUTE FUNCTION update_ejercicios_halterofilia_updated_at()
- app.exercise_ai_info.tr_update_exercise_ai_info: CREATE TRIGGER tr_update_exercise_ai_info BEFORE INSERT OR UPDATE ON app.exercise_ai_info FOR EACH ROW EXECUTE FUNCTION app.update_exercise_ai_info()
- app.exercise_session_tracking.update_exercise_session_tracking_updated_at: CREATE TRIGGER update_exercise_session_tracking_updated_at BEFORE UPDATE ON app.exercise_session_tracking FOR EACH ROW EXECUTE FUNCTION app.update_updated_at_column()
- app.foods.trg_foods_touch: CREATE TRIGGER trg_foods_touch BEFORE UPDATE ON app.foods FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()
- app.hipertrofia_v2_state.trigger_check_reevaluation: CREATE TRIGGER trigger_check_reevaluation AFTER UPDATE OF microcycles_completed ON app.hipertrofia_v2_state FOR EACH ROW EXECUTE FUNCTION app.check_reevaluation_trigger()
- app.hipertrofia_v2_state.trigger_update_hipertrofia_v2_state_timestamp: CREATE TRIGGER trigger_update_hipertrofia_v2_state_timestamp BEFORE UPDATE ON app.hipertrofia_v2_state FOR EACH ROW EXECUTE FUNCTION app.update_hipertrofia_v2_state_timestamp()
- app.home_exercise_progress.trigger_12_combinations_history_on_exercise_complete: CREATE TRIGGER trigger_12_combinations_history_on_exercise_complete AFTER UPDATE ON app.home_exercise_progress FOR EACH ROW EXECUTE FUNCTION app.trigger_update_12_combinations_history()
- app.home_exercise_rejections.tr_update_home_exercise_rejections_timestamp: CREATE TRIGGER tr_update_home_exercise_rejections_timestamp BEFORE UPDATE ON app.home_exercise_rejections FOR EACH ROW EXECUTE FUNCTION app.update_rejection_timestamp()
- app.hypertrophy_set_logs.trg_update_progression: CREATE TRIGGER trg_update_progression AFTER INSERT ON app.hypertrophy_set_logs FOR EACH ROW WHEN (new.is_warmup = false AND new.is_effective = true) EXECUTE FUNCTION app.update_hypertrophy_progression()
- app.hypertrophy_set_logs.trigger_calculate_set_metrics: CREATE TRIGGER trigger_calculate_set_metrics BEFORE INSERT ON app.hypertrophy_set_logs FOR EACH ROW EXECUTE FUNCTION app.auto_calculate_set_metrics()
- app.manual_methodology_exercise_feedback.trigger_update_manual_feedback_timestamp: CREATE TRIGGER trigger_update_manual_feedback_timestamp BEFORE UPDATE ON app.manual_methodology_exercise_feedback FOR EACH ROW EXECUTE FUNCTION app.update_feedback_timestamp()
- app.methodology_exercise_feedback.trigger_update_feedback_timestamp: CREATE TRIGGER trigger_update_feedback_timestamp BEFORE UPDATE ON app.methodology_exercise_feedback FOR EACH ROW EXECUTE FUNCTION app.update_feedback_timestamp()
- app.methodology_exercise_progress.trigger_update_session_time: CREATE TRIGGER trigger_update_session_time AFTER UPDATE ON app.methodology_exercise_progress FOR EACH ROW WHEN (old.time_spent_seconds IS DISTINCT FROM new.time_spent_seconds) EXECUTE FUNCTION app.update_session_time_on_exercise_change()
- app.methodology_exercise_sessions.trigger_update_session_dates: CREATE TRIGGER trigger_update_session_dates BEFORE INSERT OR UPDATE ON app.methodology_exercise_sessions FOR EACH ROW EXECUTE FUNCTION app.update_session_date_fields()
- app.methodology_exercise_sessions.update_methodology_exercise_sessions_updated_at: CREATE TRIGGER update_methodology_exercise_sessions_updated_at BEFORE UPDATE ON app.methodology_exercise_sessions FOR EACH ROW EXECUTE FUNCTION app.update_updated_at_column()
- app.methodology_plans.update_methodology_plans_updated_at: CREATE TRIGGER update_methodology_plans_updated_at BEFORE UPDATE ON app.methodology_plans FOR EACH ROW EXECUTE FUNCTION app.update_updated_at_column()
- app.music_playlists.trg_music_playlists_updated_at: CREATE TRIGGER trg_music_playlists_updated_at BEFORE UPDATE ON app.music_playlists FOR EACH ROW EXECUTE FUNCTION app.update_music_playlists_updated_at()
- app.nutrition_plans_v2.trg_nutrition_plans_v2_touch: CREATE TRIGGER trg_nutrition_plans_v2_touch BEFORE UPDATE ON app.nutrition_plans_v2 FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()
- app.nutrition_profiles.trg_nutrition_profiles_touch: CREATE TRIGGER trg_nutrition_profiles_touch BEFORE UPDATE ON app.nutrition_profiles FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()
- app.user_profiles.trigger_user_profiles_updated_at: CREATE TRIGGER trigger_user_profiles_updated_at BEFORE UPDATE ON app.user_profiles FOR EACH ROW EXECUTE FUNCTION app.update_user_profiles_updated_at()
- app.user_re_eval_config.trg_update_re_eval_config_timestamp: CREATE TRIGGER trg_update_re_eval_config_timestamp BEFORE UPDATE ON app.user_re_eval_config FOR EACH ROW EXECUTE FUNCTION app.update_re_eval_config_timestamp()
- app.user_training_state.update_user_training_state_updated_at: CREATE TRIGGER update_user_training_state_updated_at BEFORE UPDATE ON app.user_training_state FOR EACH ROW EXECUTE FUNCTION app.update_updated_at_column()
- app.users.set_timestamp_users: CREATE TRIGGER set_timestamp_users BEFORE UPDATE ON app.users FOR EACH ROW EXECUTE FUNCTION app.set_timestamp()
- app.users.trg_save_body_composition: CREATE TRIGGER trg_save_body_composition AFTER UPDATE ON app.users FOR EACH ROW EXECUTE FUNCTION app.save_body_composition()
- app.users.trigger_save_body_composition: CREATE TRIGGER trigger_save_body_composition AFTER UPDATE ON app.users FOR EACH ROW WHEN (new.grasa_corporal IS DISTINCT FROM old.grasa_corporal OR new.masa_muscular IS DISTINCT FROM old.masa_muscular OR new.agua_corporal IS DISTINCT FROM old.agua_corporal OR new.metabolismo_basal IS DISTINCT FROM old.metabolismo_basal OR new.peso IS DISTINCT FROM old.peso) EXECUTE FUNCTION app.save_body_composition()

## RLS policies

- app.foods: sel_foods_authenticated (PERMISSIVE, roles {public}, cmd SELECT, qual auth.uid() IS NOT NULL)
- app.hypertrophy_blocks: hypertrophy_blocks_user_policy (PERMISSIVE, roles {public}, cmd ALL, qual user_id = (current_setting('app.current_user_id')::text)::integer)
- app.hypertrophy_progression: hypertrophy_progression_user_policy (PERMISSIVE, roles {public}, cmd ALL, qual user_id = (current_setting('app.current_user_id')::text)::integer)
- app.hypertrophy_set_logs: hypertrophy_set_logs_user_policy (PERMISSIVE, roles {public}, cmd ALL, qual user_id = (current_setting('app.current_user_id')::text)::integer)
- public.ejercicios_calistenia: import_temp_all (PERMISSIVE, roles {public}, cmd INSERT, with_check true)

## Enums

- app.session_status_enum: {pending, in_progress, completed, partial, cancelled, skipped, paused}

## Functions and RPC

Notes:

- RPC endpoints in Supabase map to PostgREST-exposed functions in the api schemas (app, public).
- prokind: f = function, p = procedure.
- volatility: i = immutable, s = stable, v = volatile.

### public functions (definitions)

#### public.calculate_expires_at() -> trigger

```
CREATE OR REPLACE FUNCTION public.calculate_expires_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.expires_at = NEW.created_at + (NEW.expires_in_days || ' days')::INTERVAL;
    RETURN NEW;
END;
$function$
```

#### public.generate_slug(text_input text) -> text

```
CREATE OR REPLACE FUNCTION public.generate_slug(text_input text)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN LOWER(REGEXP_REPLACE(
    TRANSLATE(text_input,
      'ÁÉÍÓÚáéíóúÑñ ',
      'AEIOUaeiouNn-'
    ),
    '[^a-zA-Z0-9-]+', '-', 'g'
  ));
END;
$function$
```

#### public.get_home_training_history(p_user_id integer, p_limit integer) -> TABLE(...)

```
CREATE OR REPLACE FUNCTION public.get_home_training_history(p_user_id integer, p_limit integer DEFAULT 50)
 RETURNS TABLE(exercise_name text, exercise_key text, last_used_at timestamp with time zone, times_used integer)
 LANGUAGE plpgsql
AS $function$
      BEGIN
        RETURN QUERY
        WITH combined_home AS (
          SELECT
            h.exercise_name::TEXT,
            h.exercise_key::TEXT,
            h.created_at,
            2 as priority_weight
          FROM app.v_home_hist_real h
          WHERE h.user_id = p_user_id
          UNION ALL
          SELECT
            p.exercise_name::TEXT,
            p.exercise_key::TEXT,
            p.created_at,
            1 as priority_weight
          FROM app.v_home_hist_propuesto p
          WHERE p.user_id = p_user_id
        ),
        aggregated AS (
          SELECT
            c.exercise_name,
            c.exercise_key,
            MAX(c.created_at) as last_used_at,
            COUNT(*) as times_used,
            MAX(c.priority_weight) as max_priority
          FROM combined_home c
          GROUP BY c.exercise_name, c.exercise_key
        )
        SELECT
          a.exercise_name,
          a.exercise_key,
          a.last_used_at,
          a.times_used::INTEGER
        FROM aggregated a
        ORDER BY a.max_priority DESC, a.last_used_at DESC, a.times_used DESC
        LIMIT p_limit;
      END;
      $function$
```

#### public.update_ejercicios_casa_timestamp() -> trigger

```
CREATE OR REPLACE FUNCTION public.update_ejercicios_casa_timestamp()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$function$
```

#### public.update_ejercicios_halterofilia_updated_at() -> trigger

```
CREATE OR REPLACE FUNCTION public.update_ejercicios_halterofilia_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$function$
```

#### public.update_updated_at_column() -> trigger

```
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
```

### app function inventory

- activate_deload(p_user_id integer, p_methodology_plan_id integer, p_reason character varying) -> jsonb | lang=plpgsql | kind=f | security_definer=false | volatility=v | comment=Activa deload: reduce cargas -30% y marca estado. Volumen -50% se aplica en generación de sesión
- activate_muscle_priority(p_user_id integer, p_muscle_group character varying) -> jsonb | lang=plpgsql | kind=f | security_definer=false | volatility=v
- activate_plan_atomic(p_user_id integer, p_methodology_plan_id integer, p_routine_plan_id integer) -> boolean | lang=plpgsql | kind=f | security_definer=false | volatility=v
- add_methodology_feedback(p_user_id integer, p_methodology_plan_id integer, p_exercise_name character varying, p_sentiment character varying, p_comment text) -> boolean | lang=plpgsql | kind=f | security_definer=false | volatility=v | comment=Upsert de feedback (sentiment opcional) por sesión+orden de ejercicio en metodologías.
- advance_cycle_day(p_user_id integer, p_session_day_name character varying, p_session_patterns jsonb) -> jsonb | lang=plpgsql | kind=f | security_definer=false | volatility=v
- advance_cycle_day(p_user_id integer, p_session_day_name character varying) -> jsonb | lang=plpgsql | kind=f | security_definer=false | volatility=v | comment=Avanza el día del ciclo SOLO cuando usuario completa sesión. Si completa D5 → D1 e incrementa microciclos
- apply_fatigue_adjustments(p_user_id integer, p_methodology_plan_id integer) -> jsonb | lang=plpgsql | kind=f | security_definer=false | volatility=v
- apply_microcycle_progression(p_user_id integer, p_methodology_plan_id integer) -> jsonb | lang=plpgsql | kind=f | security_definer=false | volatility=v | comment=Aplica progresión +2.5% a todos los ejercicios si mean_RIR >= 3 al completar microciclo
- auto_calculate_set_metrics() -> trigger | lang=plpgsql | kind=f | security_definer=false | volatility=v | comment=Trigger que calcula automáticamente métricas al insertar una serie
- auto_register_session_activity() -> trigger | lang=plpgsql | kind=f | security_definer=false | volatility=v
- calculate_calistenia_progression_readiness(p_user_id integer, p_exercise_name text) -> jsonb | lang=plpgsql | kind=f | security_definer=false | volatility=v
- calculate_current_streak(p_user_id integer, p_routine_plan_id integer) -> integer | lang=plpgsql | kind=f | security_definer=false | volatility=v | comment=Calcula la racha actual de días consecutivos con actividad
- calculate_daily_macros(p_user_id integer, p_date date) -> TABLE(total_calories numeric, total_protein numeric, total_carbs numeric, total_fat numeric, total_fiber numeric) | lang=plpgsql | kind=f | security_definer=false | volatility=v
- calculate_estimated_1rm(weight numeric, reps integer, rir integer) -> numeric | lang=plpgsql | kind=f | security_definer=false | volatility=i | comment=Calcula el 1RM estimado usando fórmula de Epley modificada
- calculate_mean_rir_last_microcycle(p_user_id integer, p_methodology_plan_id integer) -> numeric | lang=plpgsql | kind=f | security_definer=false | volatility=v | comment=Calcula el RIR promedio del usuario en el último microciclo (últimas 5 sesiones)
- calculate_session_total_time(p_session_id integer) -> integer | lang=plpgsql | kind=f | security_definer=false | volatility=v
- calculate_target_weight_80(pr numeric) -> numeric | lang=plpgsql | kind=f | security_definer=false | volatility=i | comment=Calcula el peso de trabajo al 80% del PR, redondeado a 2.5kg
- can_repeat_exercise(p_exercise_name character varying, p_user_id integer, p_methodology_type character varying) -> boolean | lang=plpgsql | kind=f | security_definer=false | volatility=v
- can_use_exercise(p_user_id integer, p_exercise_name character varying, p_methodology_type character varying) -> boolean | lang=plpgsql | kind=f | security_definer=false | volatility=v | comment=Verifica si un ejercicio puede ser usado basado en las políticas de repetición
- check_and_apply_inactivity_calibration(p_user_id integer) -> jsonb | lang=plpgsql | kind=f | security_definer=false | volatility=v
- check_deload_trigger(p_user_id integer) -> jsonb | lang=plpgsql | kind=f | security_definer=false | volatility=v | comment=Verifica si debe activarse deload (FASE 1: solo por 6 microciclos completados)
- check_priority_timeout(p_user_id integer) -> jsonb | lang=plpgsql | kind=f | security_definer=false | volatility=v
- check_reevaluation_trigger() -> trigger | lang=plpgsql | kind=f | security_definer=false | volatility=v | comment=Trigger que verifica automáticamente necesidad de re-evaluación cada 3 microciclos
- clean_expired_feedback() -> integer | lang=plpgsql | kind=f | security_definer=false | volatility=v
- cleanup_expired_rejections() -> integer | lang=plpgsql | kind=f | security_definer=false | volatility=v
- cleanup_expired_training_sessions() -> integer | lang=plpgsql | kind=f | security_definer=false | volatility=v
- cleanup_old_abandoned_sessions() -> integer | lang=plpgsql | kind=f | security_definer=false | volatility=v | comment=Limpia sesiones abandonadas hace más de 24 horas, cambiándolas a status=abandoned
- cleanup_old_sessions() -> integer | lang=plpgsql | kind=f | security_definer=false | volatility=v | comment=Limpieza de sesiones antiguas (>90 días) para optimizar storage
- confirm_routine_plan(p_user_id integer, p_methodology_plan_id integer, p_routine_plan_id integer) -> boolean | lang=plpgsql | kind=f | security_definer=false | volatility=v | comment=Confirma un plan de rutina cambiando su estado de draft a active cuando el usuario presiona "Comenzar entrenamiento"
- consolidate_manual_methodology_exercise_history() -> trigger | lang=plpgsql | kind=f | security_definer=false | volatility=v
- consolidate_methodology_exercise_history() -> trigger | lang=plpgsql | kind=f | security_definer=false | volatility=v | comment=Inserta en histórico al completar ejercicio, con fecha de sesión segura.
- count_recent_flags(p_user_id integer, p_days_window integer) -> jsonb | lang=plpgsql | kind=f | security_definer=false | volatility=v
- create_routine_sessions(p_user_id integer, p_routine_plan_id integer, p_plan_data jsonb) -> integer | lang=plpgsql | kind=f | security_definer=false | volatility=v | comment=Crea todas las sesiones y ejercicios para un plan de rutina
- deactivate_deload(p_user_id integer) -> jsonb | lang=plpgsql | kind=f | security_definer=false | volatility=v | comment=Desactiva deload tras completarlo. Restaura cargas con +2% de recarga y reinicia microciclos
- deactivate_muscle_priority(p_user_id integer, p_reason character varying) -> jsonb | lang=plpgsql | kind=f | security_definer=false | volatility=v
- detect_automatic_fatigue_flags(p_user_id integer, p_session_id integer) -> jsonb | lang=plpgsql | kind=f | security_definer=false | volatility=v
- detect_neural_overlap(p_user_id integer, p_current_session_patterns jsonb) -> jsonb | lang=plpgsql | kind=f | security_definer=false | volatility=v
- determine_adjustment(avg_rir numeric) -> character varying | lang=plpgsql | kind=f | security_definer=false | volatility=i | comment=Determina si debe subir, bajar o mantener peso según RIR promedio
- evaluate_adaptation_completion(p_user_id integer) -> jsonb | lang=plpgsql | kind=f | security_definer=false | volatility=v | comment=Evalúa si el usuario cumple los 4 criterios para transicionar a D1-D5
- evaluate_adaptation_completion(p_user_id uuid) -> TABLE(evaluate_adaptation_completion jsonb) | lang=plpgsql | kind=f | security_definer=false | volatility=v
- evaluate_fatigue_action(p_user_id integer) -> jsonb | lang=plpgsql | kind=f | security_definer=false | volatility=v
- evaluate_level_change(p_user_id integer) -> jsonb | lang=plpgsql | kind=f | security_definer=false | volatility=v | comment=Evalúa si el usuario necesita cambio de nivel basado en métricas de rendimiento
- generate_exercise_id(exercise_name text) -> uuid | lang=plpgsql | kind=f | security_definer=false | volatility=i
- get_avoided_exercises_for_ai(p_user_id integer, p_methodology_type character varying, p_days_back integer) -> text[] | lang=plpgsql | kind=f | security_definer=false | volatility=v
- get_combination_usage_stats(p_user_id integer) -> TABLE(combination text, total_exercises_used integer, most_used_exercise text, max_usage_count integer, last_training_date timestamp with time zone) | lang=plpgsql | kind=f | security_definer=false | volatility=s | comment=Estadísticas de uso por combinación para un usuario
- get_enhanced_routine_plan_stats(p_user_id integer, p_routine_plan_id integer) -> TABLE(completed_sessions integer, total_sessions_created integer, completed_exercises integer, total_exercises_attempted integer, total_training_time_minutes integer, total_feedback_given integer, loved_exercises integer, hard_exercises integer, neutral_exercises integer, last_session_date timestamp without time zone, current_streak_days integer, methodology_type character varying, generation_mode character varying, plan_created_at timestamp without time zone, frequency_per_week integer, total_weeks integer, overall_progress_percentage numeric) | lang=plpgsql | kind=f | security_definer=false | volatility=v | comment=Obtiene estadísticas completas de un plan de rutina específico
- get_exercises_by_combination(p_user_id integer, p_equipment_type character varying, p_training_type character varying, p_limit integer) -> TABLE(exercise_name text, exercise_key text, times_used integer, last_used_at timestamp with time zone) | lang=plpgsql | kind=f | security_definer=false | volatility=s | comment=Obtiene ejercicios usados para una combinación específica ordenados por frecuencia
- get_exercises_for_combination(p_user_id integer, p_equipment_type character varying, p_training_type character varying, p_limit integer) -> TABLE(exercise_name text, exercise_key text, times_used integer, last_used_at timestamp with time zone, user_rating text, combination_code text) | lang=plpgsql | kind=f | security_definer=false | volatility=s | comment=Obtiene ejercicios ESPECÍFICOS para una combinación (p. ej., minimo+funcional)
- get_feedback_stats(p_user_id integer, p_days_back integer) -> TABLE(sentiment character varying, count bigint, percentage numeric) | lang=plpgsql | kind=f | security_definer=false | volatility=v
- get_hipertrofia_categories() -> TABLE(categoria text, total_ejercicios bigint) | lang=plpgsql | kind=f | security_definer=false | volatility=v
- get_hipertrofia_exercise_progression(p_exercise_id text) -> TABLE(previous_exercise text, current_exercise text, next_exercise text) | lang=plpgsql | kind=f | security_definer=false | volatility=v
- get_hipertrofia_exercises_by_category_and_level(p_categoria text, p_nivel text) -> TABLE(exercise_id text, nombre text, patron text, equipamiento text, series_reps_objetivo text, criterio_de_progreso text, notas text) | lang=plpgsql | kind=f | security_definer=false | volatility=v
- get_hipertrofia_exercises_by_level(p_nivel text) -> TABLE(exercise_id text, nombre text, categoria text, patron text, equipamiento text, series_reps_objetivo text, notas text) | lang=plpgsql | kind=f | security_definer=false | volatility=v
- get_home_context(p_user_id integer) -> TABLE(last_home_plan_id integer, equipment_type character varying, training_type character varying, last_home_plan_created_at timestamp with time zone, last_session_id integer, exercises_completed integer, total_exercises integer) | lang=plpgsql | kind=f | security_definer=false | volatility=v | comment=Returns last home plan info and last session progress for a user.
- get_home_training_history(p_user_id integer, p_limit integer) -> TABLE(exercise_name text, exercise_key text, last_used_at timestamp with time zone, times_used integer) | lang=plpgsql | kind=f | security_definer=false | volatility=s | comment=Obtiene historial combinado SOLO de entrenamiento en casa
- get_last_re_evaluation(p_methodology_plan_id integer) -> TABLE(re_evaluation_id integer, week_number integer, created_at timestamp without time zone, weeks_since_last integer) | lang=plpgsql | kind=f | security_definer=false | volatility=v | comment=Obtiene la última re-evaluación de un plan con cálculo de tiempo transcurrido
- get_methodology_context(p_user_id integer, p_methodology_type character varying) -> TABLE(last_plan_id integer, total_weeks integer, frequency_per_week integer, last_plan_created_at timestamp with time zone, recent_exercises integer) | lang=plpgsql | kind=f | security_definer=false | volatility=v | comment=Returns last routine plan info and recent exercise count for a user in a specific methodology.
- get_methodology_exercise_history(p_user_id integer, p_limit integer) -> TABLE(exercise_name character varying, methodology_type character varying, times_used bigint, last_used_at timestamp without time zone, avg_sentiment numeric, last_sentiment character varying) | lang=plpgsql | kind=f | security_definer=false | volatility=s | comment=Agregado de uso por ejercicio/metodología en últimos 60 días.
- get_methodology_stats_quick(p_user_id integer, p_methodology_plan_id integer) -> TABLE(total_sessions integer, completed_sessions integer, total_exercises integer, completed_exercises integer, love_exercises integer, hard_exercises integer, avg_session_duration numeric) | lang=plpgsql | kind=f | security_definer=false | volatility=s | comment=Resumen de sesiones/ejercicios y feedback (sin sobreconteo) + duración media por plan.
- get_or_create_routine_plan(p_methodology_plan_id integer, p_user_id integer) -> integer | lang=plpgsql | kind=f | security_definer=false | volatility=v
- get_playlist_track_count(playlist_id integer) -> integer | lang=plpgsql | kind=f | security_definer=false | volatility=v
- get_recent_exercises(p_user_id integer, p_methodology_type character varying, p_days_back integer) -> TABLE(exercise_name character varying, usage_count bigint, last_used timestamp without time zone) | lang=plpgsql | kind=f | security_definer=false | volatility=v | comment=Obtiene ejercicios recientes de un usuario para una metodología específica
- get_recent_manual_exercises(p_user_id integer, p_methodology_type character varying, p_days_back integer) -> TABLE(exercise_name character varying, usage_count bigint, last_used date, avg_sentiment numeric, avg_series numeric, total_completions bigint) | lang=plpgsql | kind=f | security_definer=false | volatility=v | comment=Obtiene ejercicios recientes del usuario para evitar repeticiones en generaciones manuales de IA.
- get_rejected_exercises_for_combination(p_user_id integer, p_equipment_type character varying, p_training_type character varying) -> TABLE(exercise_name character varying, exercise_key character varying, rejection_reason text, rejection_category character varying, rejected_at timestamp without time zone, expires_at timestamp without time zone, days_until_expires integer) | lang=plpgsql | kind=f | security_definer=false | volatility=v
- get_routine_history(p_user_id integer, p_limit integer) -> TABLE(exercise_name text, exercise_key text, last_used_at timestamp with time zone, times_used integer) | lang=plpgsql | kind=f | security_definer=false | volatility=s | comment=Obtiene historial combinado SOLO de rutinas y metodologías
- get_routine_progress(p_user_id integer, p_routine_plan_id integer) -> TABLE(total_sessions integer, completed_sessions integer, in_progress_sessions integer, total_exercises integer, completed_exercises integer, current_week integer, current_day character varying, overall_percentage numeric) | lang=plpgsql | kind=f | security_definer=false | volatility=v | comment=Calcula el progreso general de una rutina específica
- get_user_active_plan(p_user_id integer) -> TABLE(plan_id integer, plan_data jsonb, methodology_type character varying, status character varying, current_week integer, current_day character varying, started_at timestamp with time zone, has_active_session boolean, active_session_id integer) | lang=plpgsql | kind=f | security_definer=false | volatility=v
- get_user_ai_context(p_user_id integer, p_methodology_type character varying) -> jsonb | lang=plpgsql | kind=f | security_definer=false | volatility=v
- get_user_combination_stats(p_user_id integer) -> TABLE(combination_code text, display_name text, total_exercises_used integer, most_used_exercise text, favorite_exercises text[], difficult_exercises text[], last_training_date timestamp with time zone, total_sessions integer) | lang=plpgsql | kind=f | security_definer=false | volatility=s | comment=Estadísticas por combinación del usuario (sesiones, favoritos, etc.)
- get_user_methodology_recommendations(p_user_id integer) -> TABLE(user_id integer, nivel_calculado text, anos_experiencia integer, version_recomendada text, semanas_recomendadas integer, razon_recomendacion text) | lang=plpgsql | kind=f | security_definer=false | volatility=v
- get_user_personalized_equipment(p_user_id integer) -> TABLE(equipment_name text, equipment_key text, category text, attributes jsonb) | lang=plpgsql | kind=f | security_definer=false | volatility=s
- get_user_session_stats(p_user_id integer) -> TABLE(active_sessions integer, total_sessions integer, avg_session_duration interval, last_login timestamp with time zone, total_logins_last_30_days integer, unique_ips_last_30_days integer, longest_session interval, shortest_session interval) | lang=plpgsql | kind=f | security_definer=false | volatility=v | comment=Estadísticas detalladas de sesión para un usuario específico
- get_user_streak(p_user_id integer) -> integer | lang=plpgsql | kind=f | security_definer=false | volatility=v
- get_weekly_nutrition_stats(p_user_id integer) -> TABLE(days_logged integer, avg_calories numeric, avg_protein numeric, avg_carbs numeric, avg_fat numeric, consistency_percentage integer) | lang=plpgsql | kind=f | security_definer=false | volatility=v
- gin_extract_query_trgm(text, internal, smallint, internal, internal, internal, internal) -> internal | lang=c | kind=f | security_definer=false | volatility=i
- gin_extract_value_trgm(text, internal) -> internal | lang=c | kind=f | security_definer=false | volatility=i
- gin_trgm_consistent(internal, smallint, text, integer, internal, internal, internal, internal) -> boolean | lang=c | kind=f | security_definer=false | volatility=i
- gin_trgm_triconsistent(internal, smallint, text, integer, internal, internal, internal) -> "char" | lang=c | kind=f | security_definer=false | volatility=i
- gtrgm_compress(internal) -> internal | lang=c | kind=f | security_definer=false | volatility=i
- gtrgm_consistent(internal, text, smallint, oid, internal) -> boolean | lang=c | kind=f | security_definer=false | volatility=i
- gtrgm_decompress(internal) -> internal | lang=c | kind=f | security_definer=false | volatility=i
- gtrgm_distance(internal, text, smallint, oid, internal) -> double precision | lang=c | kind=f | security_definer=false | volatility=i
- gtrgm_in(cstring) -> app.gtrgm | lang=c | kind=f | security_definer=false | volatility=i
- gtrgm_options(internal) -> void | lang=c | kind=f | security_definer=false | volatility=i
- gtrgm_out(app.gtrgm) -> cstring | lang=c | kind=f | security_definer=false | volatility=i
- gtrgm_penalty(internal, internal, internal) -> internal | lang=c | kind=f | security_definer=false | volatility=i
- gtrgm_picksplit(internal, internal) -> internal | lang=c | kind=f | security_definer=false | volatility=i
- gtrgm_same(app.gtrgm, app.gtrgm, internal) -> internal | lang=c | kind=f | security_definer=false | volatility=i
- gtrgm_union(internal, internal) -> app.gtrgm | lang=c | kind=f | security_definer=false | volatility=i
- increment_exercise_request_count(exercise_name_param text) -> void | lang=plpgsql | kind=f | security_definer=false | volatility=v
- increment_exercise_request_count(exercise_id integer) -> integer | lang=plpgsql | kind=f | security_definer=false | volatility=v
- increment_template_usage(p_equipment_type character varying, p_training_type character varying) -> void | lang=plpgsql | kind=f | security_definer=false | volatility=v
- is_exercise_rejected(p_user_id integer, p_exercise_key character varying, p_equipment_type character varying, p_training_type character varying) -> boolean | lang=plpgsql | kind=f | security_definer=false | volatility=v
- is_exercise_rejected_simple(p_user integer, p_key text) -> boolean | lang=sql | kind=f | security_definer=false | volatility=s
- needs_warmup_reminder(p_user_id integer, p_exercise_id integer, p_session_id integer) -> jsonb | lang=plpgsql | kind=f | security_definer=false | volatility=v | comment=Determina si mostrar recordatorio de calentamiento al usuario
- normalize_exercise_name(input_name text) -> text | lang=plpgsql | kind=f | security_definer=false | volatility=i
- range_to_max_value(range_text character varying) -> integer | lang=plpgsql | kind=f | security_definer=false | volatility=v
- range_to_min_value(range_text character varying) -> integer | lang=plpgsql | kind=f | security_definer=false | volatility=v
- register_combination_exercise_usage(p_user_id integer, p_equipment_type character varying, p_training_type character varying, p_exercise_name character varying, p_session_id integer, p_plan_id integer) -> void | lang=plpgsql | kind=f | security_definer=false | volatility=v | comment=Registra el uso de un ejercicio en una combinación específica
- register_daily_activity(p_user_id integer, p_routine_plan_id integer, p_activity_type character varying, p_session_id integer) -> boolean | lang=plpgsql | kind=f | security_definer=false | volatility=v | comment=Registra que el usuario ha tenido actividad en un día específico
- register_exercise_for_combination(p_user_id integer, p_equipment_type character varying, p_training_type character varying, p_exercise_name character varying, p_session_id integer, p_plan_id integer, p_user_rating character varying) -> boolean | lang=plpgsql | kind=f | security_definer=false | volatility=v | comment=Registra/actualiza uso de ejercicio en una combinación específica (por exercise_key)
- register_manual_plan_exercises(p_user_id integer, p_methodology_type character varying, p_plan_data jsonb, p_methodology_plan_id integer) -> boolean | lang=plpgsql | kind=f | security_definer=false | volatility=v | comment=Registra todos los ejercicios de un plan manual en el historial para referencia futura de la IA.
- register_plan_exercises(p_user_id integer, p_methodology_type character varying, p_plan_data jsonb, p_plan_id integer) -> void | lang=plpgsql | kind=f | security_definer=false | volatility=v | comment=Registra todos los ejercicios de un plan generado en el historial
- register_reevaluation(p_user_id integer, p_evaluation jsonb) -> jsonb | lang=plpgsql | kind=f | security_definer=false | volatility=v | comment=Registra una re-evaluación de nivel pendiente de aceptación
- report_problematic_sessions() -> TABLE(session_id integer, user_id integer, status character varying, started_at timestamp without time zone, abandoned_at timestamp without time zone, abandon_reason character varying, hours_since_start numeric, hours_since_abandon numeric) | lang=plpgsql | kind=f | security_definer=false | volatility=v | comment=Reporta sesiones problemáticas que necesitan revisión
- routine_sessions_recalc_totals(p_session_id integer) -> void | lang=plpgsql | kind=f | security_definer=false | volatility=v
- save_body_composition() -> trigger | lang=plpgsql | kind=f | security_definer=false | volatility=v
- save_home_training_rejection_compatible(p_user_id integer, p_exercise_name character varying, p_reason character varying, p_comment text, p_duration_days integer) -> boolean | lang=plpgsql | kind=f | security_definer=false | volatility=v
- save_hypertrophy_set(p_user_id integer, p_methodology_plan_id integer, p_session_id integer, p_exercise_id integer, p_exercise_name character varying, p_set_number integer, p_weight_used numeric, p_reps_completed integer, p_rir_reported integer, p_is_warmup boolean) -> jsonb | lang=plpgsql | kind=f | security_definer=false | volatility=v | comment=Guarda una serie de hipertrofia distinguiendo entre calentamiento y efectivas
- save_user_feedback(p_user_id integer, p_exercise_name character varying, p_methodology_type character varying, p_feedback_type character varying, p_comment text, p_plan_id integer, p_ai_weight numeric) -> integer | lang=plpgsql | kind=f | security_definer=false | volatility=v
- search_playlists_by_name(p_user_id integer, search_term text) -> TABLE(id integer, name character varying, track_count integer, created_at timestamp with time zone, updated_at timestamp with time zone) | lang=plpgsql | kind=f | security_definer=false | volatility=v
- seconds_to_time_format(seconds integer) -> text | lang=plpgsql | kind=f | security_definer=false | volatility=v
- session_maintenance() -> text | lang=plpgsql | kind=f | security_definer=false | volatility=v | comment=Mantenimiento automático de sesiones expiradas e inactivas
- set_limit(real) -> real | lang=c | kind=f | security_definer=false | volatility=v
- set_timestamp() -> trigger | lang=plpgsql | kind=f | security_definer=false | volatility=v
- set_updated_at() -> trigger | lang=plpgsql | kind=f | security_definer=false | volatility=v
- should_trigger_re_evaluation(p_user_id integer, p_methodology_plan_id integer, p_current_week integer) -> boolean | lang=plpgsql | kind=f | security_definer=false | volatility=v | comment=Determina si debe mostrarse el modal de re-evaluación al usuario
- show_limit() -> real | lang=c | kind=f | security_definer=false | volatility=s
- show_trgm(text) -> text[] | lang=c | kind=f | security_definer=false | volatility=i
- similarity(text, text) -> real | lang=c | kind=f | security_definer=false | volatility=i
- similarity_dist(text, text) -> real | lang=c | kind=f | security_definer=false | volatility=i
- similarity_op(text, text) -> boolean | lang=c | kind=f | security_definer=false | volatility=s
- strict_word_similarity(text, text) -> real | lang=c | kind=f | security_definer=false | volatility=i
- strict_word_similarity_commutator_op(text, text) -> boolean | lang=c | kind=f | security_definer=false | volatility=s
- strict_word_similarity_dist_commutator_op(text, text) -> real | lang=c | kind=f | security_definer=false | volatility=i
- strict_word_similarity_dist_op(text, text) -> real | lang=c | kind=f | security_definer=false | volatility=i
- strict_word_similarity_op(text, text) -> boolean | lang=c | kind=f | security_definer=false | volatility=s
- sync_methodology_exercise_progress(p_methodology_session_id integer, p_exercise_name character varying, p_status character varying, p_series_completed integer, p_series_total integer) -> boolean | lang=plpgsql | kind=f | security_definer=false | volatility=v
- sync_routine_to_methodology_progress(p_user_id integer, p_methodology_plan_id integer, p_exercise_name character varying, p_series_completed integer, p_status character varying, p_time_spent_seconds integer) -> boolean | lang=plpgsql | kind=f | security_definer=false | volatility=v | comment=Sincroniza progreso de rutinas al sistema de metodologías; valida estado y respeta constraints.
- tg_set_updated_at() -> trigger | lang=plpgsql | kind=f | security_definer=false | volatility=v
- tg_set_updated_at_calistenia() -> trigger | lang=plpgsql | kind=f | security_definer=false | volatility=v
- tg_set_updated_at_ejercicios_calistenia() -> trigger | lang=plpgsql | kind=f | security_definer=false | volatility=v
- tg_set_updated_at_exercise_ai() -> trigger | lang=plpgsql | kind=f | security_definer=false | volatility=v
- tg_set_updated_at_hipertrofia() -> trigger | lang=plpgsql | kind=f | security_definer=false | volatility=v
- touch_updated_at() -> trigger | lang=plpgsql | kind=f | security_definer=false | volatility=v
- transition_to_hypertrophy(p_user_id integer, p_adaptation_block_id integer) -> jsonb | lang=plpgsql | kind=f | security_definer=false | volatility=v | comment=Completa el bloque de adaptación y habilita transición a D1-D5
- transition_to_hypertrophy(p_user_id uuid, p_block_id uuid) -> TABLE(transition_to_hypertrophy jsonb) | lang=plpgsql | kind=f | security_definer=false | volatility=v
- trg_progress_update_session_counters() -> trigger | lang=plpgsql | kind=f | security_definer=false | volatility=v
- trg_routine_sessions_exercises_data_changed() -> trigger | lang=plpgsql | kind=f | security_definer=false | volatility=v
- trigger_update_12_combinations_history() -> trigger | lang=plpgsql | kind=f | security_definer=false | volatility=v
- trigger_update_combination_history() -> trigger | lang=plpgsql | kind=f | security_definer=false | volatility=v
- update_crossfit_updated_at() -> trigger | lang=plpgsql | kind=f | security_definer=false | volatility=v
- update_daily_nutrition_log_updated_at() -> trigger | lang=plpgsql | kind=f | security_definer=false | volatility=v
- update_exercise_ai_info() -> trigger | lang=plpgsql | kind=f | security_definer=false | volatility=v
- update_exercise_name_row() -> trigger | lang=plpgsql | kind=f | security_definer=false | volatility=v
- update_exercise_progression(p_user_id integer, p_exercise_id bigint, p_exercise_name character varying) -> void | lang=plpgsql | kind=f | security_definer=false | volatility=v | comment=Actualiza la progresión de un ejercicio basado en datos históricos
- update_feedback_timestamp() -> trigger | lang=plpgsql | kind=f | security_definer=false | volatility=v
- update_hipertrofia_v2_state_timestamp() -> trigger | lang=plpgsql | kind=f | security_definer=false | volatility=v
- update_hypertrophy_progression() -> trigger | lang=plpgsql | kind=f | security_definer=false | volatility=v
- update_manual_methodology_session_counters() -> trigger | lang=plpgsql | kind=f | security_definer=false | volatility=v
- update_methodology_session_progress() -> trigger | lang=plpgsql | kind=f | security_definer=false | volatility=v | comment=Sincroniza ejercicios completados en la sesión tras marcar un ejercicio como completed.
- update_music_playlists_updated_at() -> trigger | lang=plpgsql | kind=f | security_definer=false | volatility=v
- update_nutrition_plans_updated_at() -> trigger | lang=plpgsql | kind=f | security_definer=false | volatility=v
- update_policy_timestamp() -> trigger | lang=plpgsql | kind=f | security_definer=false | volatility=v
- update_re_eval_config_timestamp() -> trigger | lang=plpgsql | kind=f | security_definer=false | volatility=v
- update_rejection_timestamp() -> trigger | lang=plpgsql | kind=f | security_definer=false | volatility=v
- update_routine_exercise_progress(p_routine_session_id integer, p_exercise_order integer, p_series_completed integer, p_status character varying, p_time_spent integer) -> boolean | lang=plpgsql | kind=f | security_definer=false | volatility=v | comment=Actualiza el progreso de un ejercicio específico
- update_routine_timestamp() -> trigger | lang=plpgsql | kind=f | security_definer=false | volatility=v
- update_session_date_fields() -> trigger | lang=plpgsql | kind=f | security_definer=false | volatility=v
- update_session_stats(p_session_id integer) -> void | lang=plpgsql | kind=f | security_definer=false | volatility=v
- update_session_time_on_exercise_change() -> trigger | lang=plpgsql | kind=f | security_definer=false | volatility=v
- update_updated_at_column() -> trigger | lang=plpgsql | kind=f | security_definer=false | volatility=v
- update_updated_at_session() -> trigger | lang=plpgsql | kind=f | security_definer=false | volatility=v
- update_user_profiles_updated_at() -> trigger | lang=plpgsql | kind=f | security_definer=false | volatility=v
- word_similarity(text, text) -> real | lang=c | kind=f | security_definer=false | volatility=i
- word_similarity_commutator_op(text, text) -> boolean | lang=c | kind=f | security_definer=false | volatility=s
- word_similarity_dist_commutator_op(text, text) -> real | lang=c | kind=f | security_definer=false | volatility=i
- word_similarity_dist_op(text, text) -> real | lang=c | kind=f | security_definer=false | volatility=i
- word_similarity_op(text, text) -> boolean | lang=c | kind=f | security_definer=false | volatility=s

## Roles

- anon: superuser=false, createrole=false, createdb=false, canlogin=false, replication=false, bypassrls=false
- authenticated: superuser=false, createrole=false, createdb=false, canlogin=false, replication=false, bypassrls=false
- authenticator: superuser=false, createrole=false, createdb=false, canlogin=true, replication=false, bypassrls=false
- dashboard_user: superuser=false, createrole=true, createdb=true, canlogin=false, replication=true, bypassrls=false
- pg_checkpoint: superuser=false, createrole=false, createdb=false, canlogin=false, replication=false, bypassrls=false
- pg_create_subscription: superuser=false, createrole=false, createdb=false, canlogin=false, replication=false, bypassrls=false
- pg_database_owner: superuser=false, createrole=false, createdb=false, canlogin=false, replication=false, bypassrls=false
- pg_execute_server_program: superuser=false, createrole=false, createdb=false, canlogin=false, replication=false, bypassrls=false
- pg_maintain: superuser=false, createrole=false, createdb=false, canlogin=false, replication=false, bypassrls=false
- pg_monitor: superuser=false, createrole=false, createdb=false, canlogin=false, replication=false, bypassrls=false
- pg_read_all_data: superuser=false, createrole=false, createdb=false, canlogin=false, replication=false, bypassrls=false
- pg_read_all_settings: superuser=false, createrole=false, createdb=false, canlogin=false, replication=false, bypassrls=false
- pg_read_all_stats: superuser=false, createrole=false, createdb=false, canlogin=false, replication=false, bypassrls=false
- pg_read_server_files: superuser=false, createrole=false, createdb=false, canlogin=false, replication=false, bypassrls=false
- pg_signal_backend: superuser=false, createrole=false, createdb=false, canlogin=false, replication=false, bypassrls=false
- pg_stat_scan_tables: superuser=false, createrole=false, createdb=false, canlogin=false, replication=false, bypassrls=false
- pg_use_reserved_connections: superuser=false, createrole=false, createdb=false, canlogin=false, replication=false, bypassrls=false
- pg_write_all_data: superuser=false, createrole=false, createdb=false, canlogin=false, replication=false, bypassrls=false
- pg_write_server_files: superuser=false, createrole=false, createdb=false, canlogin=false, replication=false, bypassrls=false
- pgbouncer: superuser=false, createrole=false, createdb=false, canlogin=true, replication=false, bypassrls=false
- postgres: superuser=false, createrole=true, createdb=true, canlogin=true, replication=true, bypassrls=true
- service_role: superuser=false, createrole=false, createdb=false, canlogin=false, replication=false, bypassrls=true
- supabase_admin: superuser=true, createrole=true, createdb=true, canlogin=true, replication=true, bypassrls=true
- supabase_auth_admin: superuser=false, createrole=true, createdb=false, canlogin=true, replication=false, bypassrls=false
- supabase_etl_admin: superuser=false, createrole=false, createdb=false, canlogin=true, replication=true, bypassrls=false
- supabase_read_only_user: superuser=false, createrole=false, createdb=false, canlogin=true, replication=false, bypassrls=true
- supabase_realtime_admin: superuser=false, createrole=false, createdb=false, canlogin=false, replication=false, bypassrls=false
- supabase_replication_admin: superuser=false, createrole=false, createdb=false, canlogin=true, replication=true, bypassrls=false
- supabase_storage_admin: superuser=false, createrole=true, createdb=false, canlogin=true, replication=false, bypassrls=false
