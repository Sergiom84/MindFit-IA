function normalized(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function asList(value) {
  if (Array.isArray(value)) return value.flatMap(asList);
  if (value === null || value === undefined || value === "") return [];
  return [String(value)];
}

function combinedProfileText(profile) {
  return normalized([
    ...asList(profile?.limitaciones_fisicas),
    ...asList(profile?.lesiones),
    ...asList(profile?.known_conditions),
    ...asList(profile?.safety_screening?.known_conditions),
    ...asList(profile?.safety_screening?.exertional_symptoms)
  ].join(" "));
}

function equipmentAvailable(required, available) {
  if (!required || required.length === 0) return true;
  const owned = new Set(asList(available).map(normalized));
  return required.every((item) => {
    const key = normalized(item);
    if (key === "none" || key.endsWith("_optional")) return true;
    if (key.includes("_or_")) return key.split("_or_").some((option) => owned.has(option));
    if (key.includes("_and_")) return key.split("_and_").every((option) => owned.has(option));
    return owned.has(key);
  });
}

function pauseDays(profile, now) {
  if (Number.isFinite(profile?.pause_days)) return Math.max(0, profile.pause_days);
  const raw = profile?.last_training_at ?? profile?.last_training_date;
  const date = raw ? new Date(raw) : null;
  if (!date || !Number.isFinite(date.getTime())) return 0;
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 86400000));
}

const RED_FLAG_TERMS = [
  "chest pain", "dolor toracico", "syncope", "sincope", "presyncope", "presincope",
  "dyspnoea at rest", "disnea en reposo", "new weakness", "debilidad nueva",
  "coordination loss", "perdida de coordinacion", "fluid leak", "perdida de liquido",
  "vaginal bleeding", "sangrado vaginal", "deformity", "deformidad", "no weight bearing",
  "incapacidad de apoyo"
];

const LOCATION_TO_KEYS = Object.freeze({
  shoulder: ["SHOULDER_WRIST", "WRIST_SHOULDER", "UPPER_LIMB"],
  hombro: ["SHOULDER_WRIST", "WRIST_SHOULDER", "UPPER_LIMB"],
  wrist: ["SHOULDER_WRIST", "WRIST_SHOULDER", "UPPER_LIMB"],
  muneca: ["SHOULDER_WRIST", "WRIST_SHOULDER", "UPPER_LIMB"],
  lumbar: ["LUMBAR", "LUMBAR_HAMSTRING"],
  back: ["LUMBAR", "LUMBAR_HAMSTRING"],
  rodilla: ["KNEE_HIP", "LOWER_LIMB"],
  knee: ["KNEE_HIP", "LOWER_LIMB"],
  hip: ["KNEE_HIP", "LOWER_LIMB"],
  cadera: ["KNEE_HIP", "LOWER_LIMB"],
  ankle: ["LOWER_LIMB"],
  tobillo: ["LOWER_LIMB"]
});

export function evaluateCrossfitSafety({ profile = {}, movement = null, checkIn = {}, now = new Date() } = {}) {
  const findings = [];
  const add = (ruleId, decision, reasonCode, action, details = {}) => {
    findings.push({ rule_id: ruleId, decision, reason_code: reasonCode, action, details });
  };

  const profileText = combinedProfileText(profile);
  const redFlagText = normalized([
    ...asList(checkIn.red_flags),
    ...asList(profile?.safety_screening?.red_flags),
    ...asList(profile?.safety_screening?.exertional_symptoms)
  ].join(" "));
  if (RED_FLAG_TERMS.some((term) => redFlagText.includes(normalized(term)))) {
    add("SAFE-RED-FLAG", "block", "SAFETY_RED_FLAG", "stop_session_and_refer");
  }

  const painScore = Number(checkIn?.pain?.score ?? checkIn.pain_score ?? 0);
  const painDelta = Number(checkIn?.pain?.delta ?? checkIn.pain_delta ?? 0);
  const painQuality = normalized(checkIn?.pain?.quality ?? checkIn.pain_quality);
  if (painScore >= 5 || painDelta >= 2 && painScore >= 3 || /sharp|punzante|rising|creciente/.test(painQuality)) {
    add("SAFE-PAIN-5", "block", "SAFETY_PAIN_BLOCK", "stop_session_and_refer", { pain_score: painScore });
  } else if (painScore >= 3 || painDelta >= 2) {
    add("SAFE-PAIN-34", "modify", "SAFETY_PAIN_MODIFY", "stop_pattern_and_substitute", { pain_score: painScore });
  } else if (painScore >= 1) {
    add("SAFE-PAIN-12", "allow", "SAFETY_DISCOMFORT_MONITOR", "monitor_or_reduce_speed_range_load", { pain_score: painScore });
  }

  if (checkIn.technique === 0 || checkIn.technique_score === 0) {
    add("SAFE-TECH-0", "modify", "SAFETY_TECHNIQUE_STOP", "stop_movement_and_regress");
  }
  if (Number(checkIn.warmup_rpe) >= 9) {
    add("SAFE-WARM-RPE", "recovery", "AUTOREG_RECOVERY", "stop_and_screen_or_convert_recovery");
  }

  const pregnancy = profile?.pregnancy_status ?? profile?.safety_screening?.pregnancy_status;
  const postpartum = profile?.postpartum_status ?? profile?.safety_screening?.postpartum_status;
  const clinicalContract = profile?.safety_screening?.clinical_contract_version;
  if ((pregnancy && pregnancy !== "not_pregnant") || (postpartum && postpartum !== "not_postpartum")) {
    if (!clinicalContract) add("SAFE-PREG", "block", "SAFETY_CLEARANCE_REQUIRED", "block_high_intensity_pending_contract");
  }

  const cardiovascular = /hypertension|hipertension|cardiovascular|cardiac|cardiaca|heart disease/.test(profileText);
  const symptomatic = /chest|torac|syncope|sincope|dysp|disnea|palpitation|palpitacion|dizz|mareo/.test(profileText);
  if (cardiovascular && (symptomatic || profile?.safety_screening?.clearance_status !== "cleared")) {
    add("SAFE-HTN", "block", "SAFETY_CLEARANCE_REQUIRED", "block_vigorous_and_refer");
  }

  const age = Number(profile.edad ?? profile.age);
  if (Number.isFinite(age) && age < 18) {
    add("SAFE-MINOR", "modify", "SAFETY_CLEARANCE_REQUIRED", "beginner_technical_supervised_only");
  }

  const inactiveDays = pauseDays(profile, now);
  if (inactiveDays >= 14) {
    const reduction = inactiveDays >= 56 ? 0.5 : inactiveDays >= 28 ? 0.35 : 0.2;
    add("SAFE-RETURN", "modify", "RETURN_PROTOCOL_REQUIRED", "reduce_volume_and_skill", {
      pause_days: inactiveDays,
      volume_reduction: reduction
    });
  }

  if (/obesity|obesidad/.test(profileText) || profile.obesity_declared === true) {
    add("SAFE-OBESITY", "modify", "SAFETY_PAIN_MODIFY", "lower_impact_range_and_monitor");
  }

  let movementAllowed = true;
  if (movement) {
    const requiredEquipment = asList(movement.equipment);
    const availableEquipment = profile.available_equipment ?? profile.equipment_available ?? [];
    if (!equipmentAvailable(requiredEquipment, availableEquipment)) {
      movementAllowed = false;
      add("SAFE-EQUIP", "modify", "EQUIPMENT_UNAVAILABLE", "substitute_same_stimulus", {
        canonical_movement_id: movement.canonical_id
      });
    }

    const painLocations = asList(checkIn?.pain?.locations ?? checkIn.pain_locations).map(normalized);
    const affectedKeys = new Set(painLocations.flatMap((location) => LOCATION_TO_KEYS[location] ?? []));
    const movementKeys = new Set(asList(movement.contraindication_keys));
    if ([...affectedKeys].some((key) => movementKeys.has(key))) {
      movementAllowed = false;
      add("SAFE-MOVEMENT-CONTRA", "modify", "SAFETY_CONTRAINDICATED", "reject_movement_and_substitute", {
        canonical_movement_id: movement.canonical_id,
        affected_keys: [...affectedKeys]
      });
    }
  }

  const priority = { allow: 0, modify: 1, recovery: 2, block: 3 };
  const decision = findings.reduce((current, finding) =>
    priority[finding.decision] > priority[current] ? finding.decision : current, "allow");
  const blocked = decision === "block";
  return {
    safety_version: "crossfit-safety/2.0.0",
    decision,
    blocked,
    movement_allowed: !blocked && movementAllowed,
    substitution_required: !blocked && !movementAllowed,
    safe_substitution_candidates: !blocked && movementAllowed === false
      ? asList(movement?.substitutions)
      : [],
    reason_codes: [...new Set(findings.map((finding) => finding.reason_code))],
    matched_rule_ids: findings.map((finding) => finding.rule_id),
    findings,
    disclaimer: "screening_only_not_diagnosis_or_treatment"
  };
}
