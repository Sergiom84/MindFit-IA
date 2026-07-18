import { DEFAULT_PROFILE, METABOLIC_PROFILE_META } from './nutritionPlanConfig';

// Helpers puros del generador de plan nutricional (fechas, schedules, mapeos de perfil).
// Extraído de NutritionPlanGenerator.jsx (ARCH-002) sin cambios de comportamiento.

export const normalizeActivityValue = (value) => {
  if (!value) return null;
  const normalized = String(value).trim().toLowerCase();
  const mapping = {
    sedentario: 'sedentario',
    ligero: 'ligero',
    ligeramente_activo: 'ligero',
    moderado: 'moderado',
    activo: 'alto',
    alto: 'alto',
    muy_activo: 'muy_alto',
    muy_alto: 'muy_alto'
  };
  return mapping[normalized] || null;
};

export const formatLocalDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const parseLocalDate = (value) => {
  if (!value) return null;
  const [year, month, day] = String(value).split('-').map((part) => Number(part));
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

export const getMondayOfWeek = (dateValue) => {
  const date = new Date(dateValue);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(date);
  monday.setDate(date.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
};

export const buildDailyScheduleFromDates = (dateStrings, totalDays) => {
  if (!Array.isArray(dateStrings) || dateStrings.length === 0) {
    return { schedule: null, startDate: null };
  }
  const normalizedDates = dateStrings.filter(Boolean).sort();
  if (normalizedDates.length === 0) {
    return { schedule: null, startDate: null };
  }
  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0);
  const dateSet = new Set(normalizedDates);
  const days = Array.from({ length: totalDays }, (_, index) => {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);
    const dateKey = formatLocalDate(date);
    return dateSet.has(dateKey);
  });
  return { schedule: days, startDate };
};

export const buildWeeklyPreviewFromDates = (dateStrings) => {
  if (!Array.isArray(dateStrings) || dateStrings.length === 0) {
    return { schedule: null, weekStart: null };
  }
  const normalizedDates = dateStrings.filter(Boolean).sort();
  if (normalizedDates.length === 0) {
    return { schedule: null, weekStart: null };
  }
  const earliestDate = parseLocalDate(normalizedDates[0]);
  const lastDate = parseLocalDate(normalizedDates[normalizedDates.length - 1]);
  if (!earliestDate) {
    return { schedule: null, weekStart: null };
  }
  let weekStart = getMondayOfWeek(earliestDate);
  const candidate = new Date(weekStart);
  candidate.setDate(candidate.getDate() + 7);
  if (lastDate && candidate <= lastDate) {
    weekStart = candidate;
  }
  const dateSet = new Set(normalizedDates);
  const schedule = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);
    const dateKey = formatLocalDate(date);
    return dateSet.has(dateKey);
  });
  return { schedule, weekStart };
};

export const mapMethodologyToTrainingType = (value) => {
  if (!value) return null;
  const normalized = String(value).toLowerCase();
  if (normalized.includes('hipertrofia')) return 'hipertrofia';
  if (normalized.includes('fuerza') || normalized.includes('power') || normalized.includes('heavy')) return 'fuerza';
  if (normalized.includes('resistencia') || normalized.includes('cardio') || normalized.includes('oposicion')) {
    return 'resistencia';
  }
  return 'general';
};

export const areBooleanArraysEqual = (a, b) => {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (Boolean(a[i]) !== Boolean(b[i])) return false;
  }
  return true;
};

export const getMetabolicProfileMeta = (value) => METABOLIC_PROFILE_META[value] || METABOLIC_PROFILE_META.mixto;

export const buildProfileStateFromApi = (data, fallbackProfile = DEFAULT_PROFILE) => ({
  ...DEFAULT_PROFILE,
  ...fallbackProfile,
  objetivo: data?.objetivo || fallbackProfile.objetivo || DEFAULT_PROFILE.objetivo,
  actividad: data?.actividad || fallbackProfile.actividad || DEFAULT_PROFILE.actividad,
  comidas_dia: data?.comidas_dia || fallbackProfile.comidas_dia || DEFAULT_PROFILE.comidas_dia,
  metabolic_type: data?.metabolic_type || fallbackProfile.metabolic_type || DEFAULT_PROFILE.metabolic_type,
  metabolic_score: data?.metabolic_score ?? fallbackProfile.metabolic_score ?? DEFAULT_PROFILE.metabolic_score,
  metabolic_confidence: data?.metabolic_confidence ?? fallbackProfile.metabolic_confidence ?? DEFAULT_PROFILE.metabolic_confidence,
  metabolic_pending_type: data?.metabolic_pending_type ?? fallbackProfile.metabolic_pending_type ?? DEFAULT_PROFILE.metabolic_pending_type,
  metabolic_pending_count: data?.metabolic_pending_count ?? fallbackProfile.metabolic_pending_count ?? DEFAULT_PROFILE.metabolic_pending_count,
  preferencias: {
    ...DEFAULT_PROFILE.preferencias,
    ...(fallbackProfile.preferencias || {}),
    ...(data?.preferencias || {})
  },
  alergias: Array.isArray(data?.alergias)
    ? data.alergias
    : (Array.isArray(fallbackProfile.alergias) ? fallbackProfile.alergias : [])
});

export const buildProfileStateFromUser = (profileData, userObjective, userActivity, userMeals) => ({
  ...DEFAULT_PROFILE,
  objetivo: userObjective || DEFAULT_PROFILE.objetivo,
  actividad: userActivity || DEFAULT_PROFILE.actividad,
  comidas_dia: userMeals || DEFAULT_PROFILE.comidas_dia,
  metabolic_type: profileData?.metabolic_type || DEFAULT_PROFILE.metabolic_type,
  metabolic_score: profileData?.metabolic_score ?? DEFAULT_PROFILE.metabolic_score,
  metabolic_confidence: profileData?.metabolic_confidence ?? DEFAULT_PROFILE.metabolic_confidence,
  metabolic_pending_type: profileData?.metabolic_pending_type ?? DEFAULT_PROFILE.metabolic_pending_type,
  metabolic_pending_count: profileData?.metabolic_pending_count ?? DEFAULT_PROFILE.metabolic_pending_count,
  preferencias: profileData?.preferencias || DEFAULT_PROFILE.preferencias,
  alergias: Array.isArray(profileData?.alergias) ? profileData.alergias : []
});
