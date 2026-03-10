export const toNumericOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const clampPct = (value) => {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return Math.round(value);
};

export const calculateGoalProgressPct = ({
  startWeight,
  currentWeight,
  targetWeight
}) => {
  const start = toNumericOrNull(startWeight);
  const current = toNumericOrNull(currentWeight);
  const target = toNumericOrNull(targetWeight);

  if (start === null || current === null || target === null) return 0;
  if (start === target) return 100;

  const totalDelta = target - start;
  if (totalDelta === 0) return 100;

  const achievedDelta = current - start;
  const pct = (achievedDelta / totalDelta) * 100;
  return clampPct(pct);
};

export const shouldResetBaselineForMetaChange = ({
  currentWeight,
  previousMetaWeight,
  nextMetaWeight
}) => {
  const current = toNumericOrNull(currentWeight);
  const previous = toNumericOrNull(previousMetaWeight);
  const next = toNumericOrNull(nextMetaWeight);

  if (current === null || previous === null || next === null) return false;
  if (previous === next) return false;

  const prevDirection = Math.sign(previous - current);
  const nextDirection = Math.sign(next - current);

  if (prevDirection === 0 || nextDirection === 0) return false;
  return prevDirection !== nextDirection;
};

