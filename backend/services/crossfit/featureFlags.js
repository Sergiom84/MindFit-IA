export const CROSSFIT_FEATURE_FLAGS = Object.freeze({
  generation: "CROSSFIT_V2_GENERATION",
  results: "CROSSFIT_V2_RESULTS",
  emitsTrainingLoad: "CROSSFIT_EMITS_TRAINING_LOAD",
  nutritionLoad: "CROSSFIT_NUTRITION_LOAD"
});

export const CROSSFIT_ROLLOUT_QA_USERS = "CROSSFIT_V2_QA_USERS";

function enabled(value) {
  return value === true || String(value ?? "").trim().toLowerCase() === "true";
}

function normalizedUserId(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized || null;
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

export function getCrossfitRolloutQaUsers(env = process.env) {
  return Object.freeze(
    [...new Set(
      String(env?.[CROSSFIT_ROLLOUT_QA_USERS] ?? "")
        .split(",")
        .map(normalizedUserId)
        .filter(Boolean)
    )]
  );
}

export function isCrossfitRolloutUser(userId, env = process.env) {
  const normalized = normalizedUserId(userId);
  if (!normalized) return false;
  const qaUsers = getCrossfitRolloutQaUsers(env);
  if (qaUsers.includes("*")) return env?.NODE_ENV === "test";
  return qaUsers.includes(normalized);
}

export function getCrossfitFeatureFlagsForUser(userId, env = process.env) {
  const flags = getCrossfitFeatureFlags(env);
  const eligible = isCrossfitRolloutUser(userId, env);
  return Object.freeze({
    generation: flags.generation && eligible,
    results: flags.results && eligible,
    emitsTrainingLoad: flags.emitsTrainingLoad && eligible,
    nutritionLoad: flags.nutritionLoad && eligible
  });
}
