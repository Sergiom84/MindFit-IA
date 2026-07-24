export const CROSSFIT_FEATURE_FLAGS = Object.freeze({
  generation: "CROSSFIT_V2_GENERATION",
  results: "CROSSFIT_V2_RESULTS",
  emitsTrainingLoad: "CROSSFIT_EMITS_TRAINING_LOAD",
  nutritionLoad: "CROSSFIT_NUTRITION_LOAD"
});

function enabled(value) {
  return value === true || String(value ?? "").trim().toLowerCase() === "true";
}

export function getCrossfitFeatureFlags(env = process.env) {
  return Object.freeze({
    generation: enabled(env?.[CROSSFIT_FEATURE_FLAGS.generation]),
    results: enabled(env?.[CROSSFIT_FEATURE_FLAGS.results]),
    emitsTrainingLoad: enabled(env?.[CROSSFIT_FEATURE_FLAGS.emitsTrainingLoad]),
    nutritionLoad: enabled(env?.[CROSSFIT_FEATURE_FLAGS.nutritionLoad])
  });
}

export function isCrossfitFeatureEnabled(feature, env = process.env) {
  if (!Object.hasOwn(CROSSFIT_FEATURE_FLAGS, feature)) return false;
  return getCrossfitFeatureFlags(env)[feature];
}
