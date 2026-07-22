export const CROSSFIT_VERSIONS = Object.freeze({
  plan: "crossfit-plan/v2",
  session: "crossfit-session/v2",
  wod: "crossfit-wod/v2",
  result: "crossfit-result/v2",
  autoreg: "crossfit-autoreg/v2",
  runtimeEvent: "crossfit-runtime-event/v2",
  substitution: "crossfit-substitution/v2",
  nutrition: "crossfit-nutrition/2.0.0",
  ruleset: "crossfit-rules/2.0.0",
  catalog: "crossfit-catalog/2.0.0",
  levelModel: "level-model/2.0.0",
  trainingLoad: "training-load/v1"
});

export const CROSSFIT_LEVELS = Object.freeze([
  "beginner",
  "intermediate",
  "advanced"
]);

export const CROSSFIT_LEGACY_LEVEL_ALIASES = Object.freeze({
  basico: "beginner",
  basic: "beginner",
  principiante: "beginner",
  beginner: "beginner",
  intermedio: "intermediate",
  intermediate: "intermediate",
  avanzado: "advanced",
  advanced: "advanced"
});

export function normalizeCrossfitLevel(value) {
  const key = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
  return CROSSFIT_LEGACY_LEVEL_ALIASES[key] ?? null;
}
