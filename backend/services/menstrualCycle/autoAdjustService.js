const normalizeText = (value = '') => {
  if (value === null || value === undefined) return '';
  return value
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
};

export const resolvePattern = (raw = '') => {
  const text = normalizeText(raw);
  if (!text) return null;

  if (text.includes('empuje')) return 'push';
  if (text.includes('traccion')) return 'pull';
  if (text.includes('cuadriceps') || text.includes('sentadilla') || text.includes('prensa') || text.includes('extension de rodilla')) return 'squat';
  if (text.includes('cadena_posterior') || text.includes('bisagra') || text.includes('extension de cadera') || text.includes('flexion de rodilla')) return 'hinge';
  if (text.includes('core') || text.includes('anti') || text.includes('tronco')) return 'core';
  if (text.includes('carry') || text.includes('carries') || text.includes('agarre')) return 'carry';

  return null;
};

const parseExercises = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
      if (parsed?.ejercicios && Array.isArray(parsed.ejercicios)) return parsed.ejercicios;
      return [];
    } catch (error) {
      return [];
    }
  }
  if (value?.ejercicios && Array.isArray(value.ejercicios)) return value.ejercicios;
  return [];
};

const buildSessionEntry = ({ date, painNextDay, sessionQuality }) => ({
  date,
  pain_next_day_0_10: Number.isFinite(painNextDay) ? painNextDay : null,
  session_quality_0_10: Number.isFinite(sessionQuality) ? sessionQuality : null
});

const mergeSessionEntries = (entries = []) => {
  const map = new Map();
  entries.forEach((entry) => {
    if (!entry?.date) return;
    map.set(entry.date, entry);
  });

  const merged = Array.from(map.values()).sort((a, b) => {
    if (a.date < b.date) return -1;
    if (a.date > b.date) return 1;
    return 0;
  });

  return merged.slice(-3);
};

export const getSessionPatternsForDate = async (client, userId, sessionDate) => {
  let result;
  try {
    result = await client.query(
      `SELECT exercises_data AS exercises
       FROM app.methodology_exercise_sessions
       WHERE user_id = $1
         AND session_date = $2
         AND session_status IN ('completed', 'partial')`,
      [userId, sessionDate]
    );
  } catch (error) {
    if (error?.message?.includes('exercises_data')) {
      result = await client.query(
        `SELECT exercises
         FROM app.methodology_exercise_sessions
         WHERE user_id = $1
           AND session_date = $2
           AND session_status IN ('completed', 'partial')`,
        [userId, sessionDate]
      );
    } else {
      throw error;
    }
  }

  if (result.rows.length === 0) return [];

  const patterns = new Set();

  for (const row of result.rows) {
    const exercises = parseExercises(row.exercises);
    exercises.forEach((exercise) => {
      const raw = exercise?.patron_movimiento || exercise?.patron || exercise?.pattern || '';
      const normalized = resolvePattern(raw);
      if (normalized) patterns.add(normalized);
    });
  }

  return Array.from(patterns);
};

export const updatePatternMetrics = async (client, userId, pattern, entry) => {
  const existingResult = await client.query(
    `SELECT last_sessions
     FROM app.menstrual_pattern_metrics
     WHERE user_id = $1 AND pattern = $2`,
    [userId, pattern]
  );

  const existingSessions = existingResult.rows[0]?.last_sessions || [];
  const normalizedExisting = Array.isArray(existingSessions) ? existingSessions : [];
  const merged = mergeSessionEntries([...normalizedExisting, entry]);

  await client.query(
    `INSERT INTO app.menstrual_pattern_metrics (user_id, pattern, last_sessions, updated_at)
     VALUES ($1, $2, $3::jsonb, NOW())
     ON CONFLICT (user_id, pattern)
     DO UPDATE SET last_sessions = EXCLUDED.last_sessions, updated_at = NOW()`,
    [userId, pattern, JSON.stringify(merged)]
  );

  return merged;
};

export const computePatternSignals = (sessions = []) => {
  const painHits = sessions.filter((entry) => Number(entry?.pain_next_day_0_10) >= 7).length;
  const qualityHits = sessions.filter((entry) => Number(entry?.session_quality_0_10) <= 4).length;

  return {
    painHits,
    qualityHits,
    painTrigger: painHits >= 2,
    qualityTrigger: qualityHits >= 2
  };
};

export const upsertDeloadState = async (client, userId, { startDate, reason }) => {
  const start = new Date(startDate);
  const end = new Date(startDate);
  end.setDate(start.getDate() + 6);

  const existing = await client.query(
    `SELECT start_date, end_date
     FROM app.menstrual_deload_state
     WHERE user_id = $1`,
    [userId]
  );

  if (existing.rows.length > 0) {
    const existingEnd = new Date(existing.rows[0].end_date);
    const finalEnd = existingEnd > end ? existingEnd : end;

    await client.query(
      `UPDATE app.menstrual_deload_state
       SET start_date = $2,
           end_date = $3,
           reason = $4,
           updated_at = NOW()
       WHERE user_id = $1`,
      [userId, startDate, finalEnd.toISOString().split('T')[0], reason]
    );

    return { start_date: startDate, end_date: finalEnd.toISOString().split('T')[0] };
  }

  await client.query(
    `INSERT INTO app.menstrual_deload_state (user_id, start_date, end_date, reason)
     VALUES ($1, $2, $3, $4)`,
    [userId, startDate, end.toISOString().split('T')[0], reason]
  );

  return { start_date: startDate, end_date: end.toISOString().split('T')[0] };
};

export const getActiveDeloadState = async (client, userId, referenceDate) => {
  const ref = referenceDate || new Date().toISOString().split('T')[0];
  const result = await client.query(
    `SELECT start_date, end_date, reason
     FROM app.menstrual_deload_state
     WHERE user_id = $1
       AND $2 BETWEEN start_date AND end_date`,
    [userId, ref]
  );

  return result.rows[0] || null;
};

export const applyAutoAdjustFromLog = async (client, {
  userId,
  logDate,
  painNextDay,
  sessionQuality
}) => {
  if (!logDate) return null;

  const log = new Date(logDate);
  if (Number.isNaN(log.getTime())) return null;

  const sessionDate = new Date(log);
  sessionDate.setDate(sessionDate.getDate() - 1);
  const sessionDateStr = sessionDate.toISOString().split('T')[0];

  const patterns = await getSessionPatternsForDate(client, userId, sessionDateStr);
  if (!patterns.length) return null;

  let painTriggered = false;
  let qualityTriggered = false;

  for (const pattern of patterns) {
    const entry = buildSessionEntry({
      date: sessionDateStr,
      painNextDay,
      sessionQuality
    });

    const merged = await updatePatternMetrics(client, userId, pattern, entry);
    const signals = computePatternSignals(merged);
    painTriggered = painTriggered || signals.painTrigger;
    qualityTriggered = qualityTriggered || signals.qualityTrigger;
  }

  if (painTriggered && qualityTriggered) {
    await upsertDeloadState(client, userId, {
      startDate: logDate,
      reason: 'autoajuste_pain_quality'
    });
  }

  return { painTriggered, qualityTriggered, sessionDate: sessionDateStr, patterns };
};

export const getPatternAutoAdjustments = async (client, userId, patterns = []) => {
  if (!patterns.length) {
    return {
      volumeMultiplier: 1,
      intensityMultiplier: 1,
      restExtraSeconds: 0,
      painTriggered: false,
      qualityTriggered: false
    };
  }

  let painTriggered = false;
  let qualityTriggered = false;

  for (const pattern of patterns) {
    const result = await client.query(
      `SELECT last_sessions
       FROM app.menstrual_pattern_metrics
       WHERE user_id = $1 AND pattern = $2`,
      [userId, pattern]
    );

    const sessions = result.rows[0]?.last_sessions || [];
    const signals = computePatternSignals(Array.isArray(sessions) ? sessions : []);
    painTriggered = painTriggered || signals.painTrigger;
    qualityTriggered = qualityTriggered || signals.qualityTrigger;
  }

  const volumeMultiplier = painTriggered ? 0.95 : 1;
  const intensityMultiplier = qualityTriggered ? 0.975 : 1;
  const restExtraSeconds = qualityTriggered ? 15 : 0;

  return {
    volumeMultiplier,
    intensityMultiplier,
    restExtraSeconds,
    painTriggered,
    qualityTriggered
  };
};
