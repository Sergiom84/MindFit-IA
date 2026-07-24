function objectOrNull(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

export function isCrossfitV2PlanData(planData) {
  return planData?.schema_version === 'crossfit-plan/v2'
    && planData?.crossfit_v2?.schema_version === 'crossfit-plan/v2';
}

export function buildHydratedSessionMetadata(planDayMetadata) {
  const metadata = objectOrNull(planDayMetadata) ?? {};
  const persisted = objectOrNull(metadata.session_metadata) ?? {};
  return metadata.session_load && typeof metadata.session_load === 'object'
    ? { ...persisted, planned_session_load: metadata.session_load }
    : persisted;
}

/**
 * Hidrata una sesión desde el día canónico del plan. El enlace principal siempre
 * es plan_id + day_id; el fallback por semana/día solo cubre deuda histórica.
 */
export async function hydrateSessionPlanMetadata(client, {
  session,
  planId,
  weekNumber,
  dayName,
  methodologyType = null,
  methodologyLevel = null,
  required = false
} = {}) {
  if (!client?.query || !session?.id || !planId) {
    throw new TypeError('hydrateSessionPlanMetadata requiere client, session y planId');
  }

  const byCanonicalDay = session.day_id != null;
  const query = byCanonicalDay
    ? await client.query(
      `SELECT metadata
         FROM app.methodology_plan_days
        WHERE plan_id = $1 AND day_id = $2 AND is_rest = FALSE
        LIMIT 1`,
      [planId, session.day_id]
    )
    : await client.query(
      `SELECT metadata
         FROM app.methodology_plan_days
        WHERE plan_id = $1 AND week_number = $2 AND day_name = $3 AND is_rest = FALSE
        LIMIT 1`,
      [planId, weekNumber, dayName]
    );

  const metadata = buildHydratedSessionMetadata(query.rows?.[0]?.metadata);
  const requiredContractPresent = metadata.crossfit_v2_session?.schema_version === 'crossfit-session/v2'
    && metadata.planned_session_load?.contract_version === 'training-load/v1';
  if (Object.keys(metadata).length === 0 || (required && !requiredContractPresent)) {
    if (required) {
      const error = new Error('La sesión CrossFit v2 no tiene metadata canónica materializada');
      error.code = 'CROSSFIT_SESSION_METADATA_REQUIRED';
      error.reasonCode = 'TRACE_MISSING';
      error.status = 409;
      throw error;
    }
    return { applied: false, source: byCanonicalDay ? 'day_id' : 'legacy_week_day', metadata: {} };
  }

  await client.query(
    `UPDATE app.methodology_exercise_sessions
        SET session_metadata = COALESCE(session_metadata, '{}'::jsonb) || $2::jsonb,
            methodology_type = COALESCE(NULLIF($3::text, ''), methodology_type),
            methodology_level = COALESCE(NULLIF($4::text, ''), methodology_level),
            updated_at = NOW()
      WHERE id = $1`,
    [session.id, JSON.stringify(metadata), methodologyType, methodologyLevel]
  );
  return {
    applied: true,
    source: byCanonicalDay ? 'day_id' : 'legacy_week_day',
    metadata
  };
}
