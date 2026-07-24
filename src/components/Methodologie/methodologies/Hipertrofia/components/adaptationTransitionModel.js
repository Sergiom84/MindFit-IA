export function normalizeAdaptationEvaluation(payload = {}) {
  const criteria = payload.criteria ?? payload.evaluation ?? {};
  const technique = criteria.technique ?? {};

  return {
    isReady: Boolean(
      payload.ready_for_transition
      ?? payload.readyForTransition
      ?? payload.is_ready
      ?? payload.all_criteria_met
    ),
    details: {
      adherence: criteria.adherence ?? {},
      rir: criteria.rir ?? {},
      technique: {
        ...technique,
        flags: technique.flags ?? technique.flags_count
      },
      progress: criteria.progress ?? {}
    }
  };
}
