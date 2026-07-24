export const CROSSFIT_NUTRITION_SAFETY_CONTEXT_SQL = `
SELECT
  u.historial_medico,
  u.limitaciones_fisicas,
  u.lesiones,
  u.medicamentos,
  (
    SELECT nws.flags
    FROM app.nutrition_weekly_snapshots nws
    WHERE nws.user_id = u.id
    ORDER BY nws.snapshot_date DESC
    LIMIT 1
  ) AS nutrition_flags
FROM app.users u
WHERE u.id = $1`;

function normalizedText(value) {
  const values = Array.isArray(value) ? value : [value];
  return values
    .flatMap((item) => Array.isArray(item) ? item : [item])
    .filter((item) => item !== null && item !== undefined)
    .map((item) => String(item))
    .join(" ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function nutritionFlagNames(value) {
  const flags = Array.isArray(value) ? value : [];
  return flags.map((flag) => normalizedText(flag?.flag ?? flag?.name ?? flag));
}

export function deriveCrossfitNutritionSafetyContext(row = {}) {
  const health = normalizedText([
    row.historial_medico,
    row.limitaciones_fisicas,
    row.lesiones,
    row.medicamentos
  ]);
  const flags = nutritionFlagNames(row.nutrition_flags);
  const has = (pattern) => pattern.test(health);
  const hasFlag = (pattern) => flags.some((flag) => pattern.test(flag));
  const cardiovascular = has(/cardiovascular|cardiac|cardiaco|cardiaca|hipertens|heart disease/)
    && !has(/sin (enfermedad )?cardiovascular|no cardiac|no hipertens/);
  const symptomatic = has(/dolor torac|chest pain|sincope|presincope|disnea|palpit|mareo/);
  const energyWarning = hasFlag(/energy.warning|energia.baja|low.energy/);
  const accumulatedFatigue = hasFlag(/fatigue.accumulated|fatiga.alta/);
  return {
    pregnant: has(/embaraz|pregnan/) && !has(/no embaraz|not pregnant/),
    postpartum: has(/pospart|postpart/) && !has(/no pospart|not postpartum/),
    suspected_low_energy_availability: has(/baja disponibilidad energetica|low energy availability|\bred[- ]?s\b/)
      || (energyWarning && accumulatedFatigue),
    eating_disorder_risk: has(/trastorno aliment|eating disorder|anorex|bulimi/),
    amenorrhea_reported: has(/amenorrea|amenorrhea/),
    stress_injury: has(/fractura por estres|stress fracture/),
    persistent_cold_hunger_fatigue: has(/hambre extrema|extreme hunger|frio persistente|persistent cold/)
      || accumulatedFatigue,
    renal_disease: has(/renal|rinon|nefro|kidney/),
    cardiovascular_disease: cardiovascular,
    uncontrolled_hypertension: has(/hipertension no control|uncontrolled hypertension/),
    symptomatic_cardiovascular: cardiovascular && symptomatic,
    electrolyte_affecting_medication: has(/diuretic|diuretico/),
    source: "canonical_profile_and_latest_nutrition_flags",
    clinical_contract_available: false
  };
}

export async function loadCrossfitNutritionSafetyContext(db, userId) {
  const result = await db.query(CROSSFIT_NUTRITION_SAFETY_CONTEXT_SQL, [userId]);
  return deriveCrossfitNutritionSafetyContext(result.rows[0] ?? {});
}
