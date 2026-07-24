export const CROSSFIT_PROGRAM_RULES = Object.freeze({
  beginner: Object.freeze({
    ruleset_version: "program-beginner/2.0.0",
    block_weeks: 8,
    frequencies: Object.freeze([2, 3]),
    recommended_frequency: 3,
    session_minutes: Object.freeze({ min: 45, max: 60 }),
    week_profiles: Object.freeze([
      ["baseline", 0.7, 5, 6, 2],
      ["accumulation", 0.8, 6, 6, 1],
      ["accumulation", 0.9, 6, 7, 1],
      ["deload", 0.625, 5, 6, 0],
      ["rebuild", 0.85, 6, 6, 1],
      ["progression", 0.95, 6, 7, 1],
      ["consolidation", 1, 6, 8, 0],
      ["reassessment", 0.6, 5, 6, 0]
    ]),
    quotas: Object.freeze({
      strength: [2, 2],
      weightlifting: [1, 2],
      gymnastics: [2, 2],
      monostructural: [2, 2],
      metcon: [2, 2],
      high_impact_max: 1,
      heavy_hinge_max: 1,
      dense_overhead_max: 1,
      high_grip_max: 1,
      d2_max: 1,
      high_skill_max: 0
    }),
    strength: Object.freeze({ sets: [3, 5], reps: [3, 8], rpe: [5, 7] }),
    metcon_minutes: Object.freeze([6, 15]),
    high_rpe_exposures_max: Object.freeze({ 2: 0.5, 3: 1 }),
    min_recovery_hours: 48,
    demanding_sequence_max: 1,
    default_day_offsets: Object.freeze({ 2: [0, 3], 3: [0, 2, 4] })
  }),
  intermediate: Object.freeze({
    ruleset_version: "program-intermediate/2.0.0",
    block_weeks: 10,
    frequencies: Object.freeze([3, 4]),
    recommended_frequency: 4,
    session_minutes: Object.freeze({ min: 55, max: 70 }),
    week_profiles: Object.freeze([
      ["baseline", 0.725, 6, 6, 0],
      ["accumulation", 0.85, 6, 7, 1],
      ["accumulation", 0.95, 6, 8, 1],
      ["accumulation", 1, 7, 8, 0],
      ["deload", 0.65, 5, 6, 0],
      ["intensification", 0.85, 6, 8, 1],
      ["intensification", 0.95, 7, 8, 1],
      ["intensification", 1, 7, 8, 0],
      ["realization", 0.85, 6, 8, 0],
      ["reassessment", 0.6, 5, 6, 0]
    ]),
    quotas: Object.freeze({
      strength: [2, 3],
      weightlifting: [2, 2],
      gymnastics: [2, 3],
      monostructural: [2, 2],
      metcon: [3, 3],
      high_impact_max: 2,
      heavy_hinge_max: 2,
      dense_overhead_max: 2,
      high_grip_max: 2,
      d2_max: 2,
      high_skill_max: 1
    }),
    strength: Object.freeze({ sets: [4, 6], reps: [2, 6], rpe: [6, 8] }),
    metcon_minutes: Object.freeze([8, 22]),
    high_rpe_exposures_max: Object.freeze({ 3: 2, 4: 2 }),
    min_recovery_hours: 36,
    demanding_sequence_max: 1,
    default_day_offsets: Object.freeze({ 3: [0, 2, 4], 4: [0, 1, 3, 5] })
  }),
  advanced: Object.freeze({
    ruleset_version: "program-advanced/2.0.0",
    block_weeks: 12,
    frequencies: Object.freeze([4, 5]),
    recommended_frequency: 5,
    session_minutes: Object.freeze({ min: 60, max: 90 }),
    week_profiles: Object.freeze([
      ["baseline", 0.7, 6, 7, 0],
      ["accumulation", 0.85, 6, 8, 1],
      ["accumulation", 0.95, 7, 8, 1],
      ["accumulation", 1, 7, 9, 0],
      ["deload", 0.65, 6, 7, 0],
      ["intensification", 0.85, 7, 8, 1],
      ["intensification", 0.95, 7, 9, 1],
      ["intensification", 1, 7, 9, 0],
      ["deload", 0.65, 6, 7, 0],
      ["realization", 0.85, 7, 9, 0],
      ["realization", 0.9, 7, 9, 0],
      ["reassessment", 0.575, 5, 7, 0]
    ]),
    quotas: Object.freeze({
      strength: [3, 3],
      weightlifting: [2, 3],
      gymnastics: [3, 3],
      monostructural: [2, 3],
      metcon: [3, 4],
      high_impact_max: 3,
      heavy_hinge_max: 2,
      dense_overhead_max: 2,
      high_grip_max: 2,
      d2_max: Object.freeze({ 4: 2, 5: 3 }),
      high_skill_max: 1
    }),
    strength: Object.freeze({ sets: [4, 8], reps: [1, 5], rpe: [6.5, 9] }),
    metcon_minutes: Object.freeze([6, 35]),
    high_rpe_exposures_max: Object.freeze({ 4: 2, 5: 3 }),
    min_recovery_hours: 36,
    demanding_sequence_max: 2,
    default_day_offsets: Object.freeze({ 4: [0, 1, 3, 5], 5: [0, 1, 2, 4, 5] })
  })
});

export function getCrossfitProgramRules(level) {
  return CROSSFIT_PROGRAM_RULES[level] ?? null;
}

export function getCrossfitD2Max(level, frequency) {
  const value = CROSSFIT_PROGRAM_RULES[level]?.quotas?.d2_max;
  return typeof value === "number" ? value : value?.[frequency] ?? null;
}
