import { materializeCrossfitSchedule } from './crossfit/integration/scheduleMaterializer.js';

const ADAPTERS = new Map([
  ['crossfit-plan/v2', materializeCrossfitSchedule]
]);

export function getMethodologyScheduleAdapter(planData) {
  const version = planData?.schema_version;
  const materialize = ADAPTERS.get(version) ?? null;
  if (!materialize) return null;
  if (version === 'crossfit-plan/v2' && planData?.crossfit_v2?.schema_version !== version) return null;
  return { version, materialize };
}
