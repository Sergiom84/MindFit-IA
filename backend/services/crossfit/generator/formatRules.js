const COMMON = Object.freeze({
  beginner: Object.freeze({
    amrap: [6, 12, 15, 2, 4], emom: [8, 15, 15, 1, 3], e2mom: [10, 24, 24, 1, 3],
    e3mom: [10, 24, 24, 1, 3], for_time: [6, 10, 12, 2, 4], rft: [6, 12, 15, 2, 4],
    chipper: [12, 18, 20, 3, 5], intervals: [10, 24, 24, 1, 3],
    strength_only: [15, 30, 0, 1, 3], skill_only: [15, 30, 0, 1, 3]
  }),
  intermediate: Object.freeze({
    amrap: [8, 20, 24, 2, 5], emom: [10, 24, 24, 1, 4], e2mom: [10, 30, 30, 1, 4],
    e3mom: [10, 30, 30, 1, 4], for_time: [7, 15, 18, 2, 5], rft: [8, 18, 22, 2, 5],
    chipper: [15, 24, 28, 4, 7], intervals: [12, 30, 30, 1, 4],
    strength_only: [20, 40, 0, 1, 3], skill_only: [20, 40, 0, 1, 3]
  }),
  advanced: Object.freeze({
    amrap: [6, 30, 35, 2, 6], emom: [8, 30, 30, 1, 5], e2mom: [10, 36, 36, 1, 5],
    e3mom: [10, 36, 36, 1, 5], for_time: [5, 20, 25, 2, 6], rft: [6, 25, 30, 2, 6],
    chipper: [18, 30, 35, 5, 9], intervals: [10, 36, 36, 1, 5],
    strength_only: [20, 45, 0, 1, 4], skill_only: [20, 45, 0, 1, 4]
  })
});

const SCORE_TYPES = Object.freeze({
  amrap: "rounds_reps",
  emom: "reps",
  e2mom: "reps",
  e3mom: "reps",
  for_time: "time",
  rft: "time",
  chipper: "time",
  intervals: "reps",
  strength_only: "load",
  skill_only: "quality"
});

export const CROSSFIT_WOD_FORMATS = Object.freeze(Object.keys(SCORE_TYPES));

export function getCrossfitWodFormatRule(level, format) {
  const tuple = COMMON[level]?.[format];
  if (!tuple) return null;
  return {
    target_min: tuple[0],
    target_max: tuple[1],
    cap_max: tuple[2],
    movements_min: tuple[3],
    movements_max: tuple[4],
    score_type: SCORE_TYPES[format]
  };
}

export function timeDomainForMinutes(minutes) {
  if (minutes <= 10) return "short";
  if (minutes <= 18) return "medium";
  if (minutes <= 30) return "long";
  return "extended";
}
