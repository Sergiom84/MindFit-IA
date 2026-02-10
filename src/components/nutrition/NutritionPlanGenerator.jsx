import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Dumbbell,
  Info,
  Loader2,
  Settings,
  Target,
  TrendingUp,
  Utensils
} from 'lucide-react';
import { useUserContext } from '@/contexts/UserContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3010';

const TRAINING_TYPES = [
  { value: 'hipertrofia', label: 'Hipertrofia', desc: 'Ganar masa muscular', Icon: Target },
  { value: 'fuerza', label: 'Fuerza', desc: 'Aumentar fuerza maxima', Icon: Dumbbell },
  { value: 'resistencia', label: 'Resistencia', desc: 'Mejorar capacidad aerobica', Icon: Activity },
  { value: 'general', label: 'General', desc: 'Entrenamiento variado', Icon: Settings }
];

const DIAS_SEMANA = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'];
const DIAS_SEMANA_DATE = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
const DURATION_PRESETS = [7, 14, 21, 28];
const MAX_PLAN_DAYS = 28;
const MIN_PLAN_DAYS = 3;

const OBJECTIVE_OPTIONS = [
  { value: 'cut', label: 'Definicion', desc: 'Perder grasa' },
  { value: 'mant', label: 'Mantenimiento', desc: 'Mantener peso' },
  { value: 'bulk', label: 'Volumen', desc: 'Ganar musculo' }
];

const ACTIVITY_OPTIONS = [
  { value: 'sedentario', label: 'Sedentario' },
  { value: 'ligero', label: 'Ligero (1-3 dias)' },
  { value: 'moderado', label: 'Moderado (3-5 dias)' },
  { value: 'alto', label: 'Activo (5-6 dias)' },
  { value: 'muy_alto', label: 'Muy activo (6+ dias)' }
];

const OBJECTIVE_LABELS = {
  cut: 'Definicion',
  mant: 'Mantenimiento',
  bulk: 'Volumen',
  perder_peso: 'Perder peso',
  mantenimiento: 'Mantenimiento',
  mantener: 'Mantenimiento',
  ganar_musculo: 'Ganar musculo',
  ganar_peso: 'Ganar peso',
  tonificar: 'Tonificar',
  mantener_forma: 'Mantener forma',
  mejorar_resistencia: 'Mejorar resistencia',
  fuerza: 'Fuerza',
  resistencia: 'Resistencia',
  rehabilitacion: 'Rehabilitacion',
  flexibilidad: 'Flexibilidad'
};

const ACTIVITY_HELP = {
  sedentario: {
    label: 'Sedentario',
    short: '0-1 entrenos/semana · <5.000 pasos/dia',
    detail: 'Trabajo mayormente sentado, baja actividad diaria.'
  },
  ligero: {
    label: 'Ligero (1-3 dias)',
    short: '1-3 entrenos/semana · 5.000-7.500 pasos/dia',
    detail: 'Actividad ligera y movimiento diario moderado.'
  },
  moderado: {
    label: 'Moderado (3-5 dias)',
    short: '3-5 entrenos/semana · 7.500-10.000 pasos/dia',
    detail: 'Entrenas con regularidad y te mueves casi a diario.'
  },
  alto: {
    label: 'Activo (5-6 dias)',
    short: '5-6 entrenos/semana · 10.000-12.000 pasos/dia',
    detail: 'Entrenas casi a diario y tienes un ritmo activo.'
  },
  muy_alto: {
    label: 'Muy activo (6+ dias)',
    short: '6+ entrenos/semana · >12.000 pasos/dia',
    detail: 'Alta demanda fisica diaria y entrenos frecuentes.'
  }
};

const PREFERENCE_KEYS = [
  { key: 'vegetariano', label: 'Vegetariano' },
  { key: 'vegano', label: 'Vegano' },
  { key: 'sin_gluten', label: 'Sin gluten' },
  { key: 'sin_lactosa', label: 'Sin lactosa' }
];

const GOAL_TO_USER = {
  cut: 'perder_peso',
  mant: 'mantenimiento',
  bulk: 'ganar_musculo'
};

const GOAL_FROM_USER = {
  perder_peso: 'cut',
  mantenimiento: 'mant',
  mantener: 'mant',
  ganar_musculo: 'bulk',
  ganar_peso: 'bulk',
  tonificar: 'mant',
  mantener_forma: 'mant',
  mejorar_resistencia: 'mant',
  fuerza: 'mant',
  resistencia: 'mant',
  rehabilitacion: 'mant',
  flexibilidad: 'mant'
};

const ACTIVITY_TO_USER = {
  sedentario: 'sedentario',
  ligero: 'ligero',
  moderado: 'moderado',
  alto: 'activo',
  muy_alto: 'muy_activo'
};

const ACTIVITY_FROM_USER = {
  sedentario: 'sedentario',
  ligero: 'ligero',
  ligeramente_activo: 'ligero',
  moderado: 'moderado',
  activo: 'alto',
  muy_activo: 'muy_alto',
  alto: 'alto',
  muy_alto: 'muy_alto'
};

const normalizeActivityValue = (value) => {
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

const formatLocalDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseLocalDate = (value) => {
  if (!value) return null;
  const [year, month, day] = String(value).split('-').map((part) => Number(part));
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const getMondayOfWeek = (dateValue) => {
  const date = new Date(dateValue);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(date);
  monday.setDate(date.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
};

const buildDailyScheduleFromDates = (dateStrings, totalDays) => {
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

const buildWeeklyPreviewFromDates = (dateStrings) => {
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

const mapMethodologyToTrainingType = (value) => {
  if (!value) return null;
  const normalized = String(value).toLowerCase();
  if (normalized.includes('hipertrofia')) return 'hipertrofia';
  if (normalized.includes('fuerza') || normalized.includes('power') || normalized.includes('heavy')) return 'fuerza';
  if (normalized.includes('resistencia') || normalized.includes('cardio') || normalized.includes('oposicion')) {
    return 'resistencia';
  }
  return 'general';
};

const areBooleanArraysEqual = (a, b) => {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (Boolean(a[i]) !== Boolean(b[i])) return false;
  }
  return true;
};

const formatObjectiveLabel = (value) => OBJECTIVE_LABELS[value] || value || 'N/D';
const formatActivityLabel = (value) => {
  const normalized = normalizeActivityValue(value);
  return ACTIVITY_HELP[normalized]?.label || value || 'N/D';
};

const DEFAULT_PROFILE = {
  objetivo: 'mant',
  actividad: 'moderado',
  comidas_dia: 4,
  preferencias: {
    vegetariano: false,
    vegano: false,
    sin_gluten: false,
    sin_lactosa: false
  },
  alergias: []
};

/**
 * Generador de plan nutricional determinista con configuracion integrada
 */
export default function NutritionPlanGenerator({ onPlanGenerated }) {
  const {
    userData,
    updateUserProfile,
    refreshProfile
  } = useUserContext();

  const [profileLoading, setProfileLoading] = useState(true);
  const [profileLoadError, setProfileLoadError] = useState(null);
  const [profileSaveError, setProfileSaveError] = useState(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(null);
  const [profileData, setProfileData] = useState(DEFAULT_PROFILE);
  const [estimaciones, setEstimaciones] = useState(null);
  const [alergiaInput, setAlergiaInput] = useState('');

  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState(null);
  const [planSuccess, setPlanSuccess] = useState(false);
  const [generatedPlan, setGeneratedPlan] = useState(null);
  const [config, setConfig] = useState({
    duracion_dias: 7,
    training_type: 'hipertrofia',
    training_schedule: [true, false, true, false, true, false, false]
  });
  const [dismissedMismatch, setDismissedMismatch] = useState(false);
  const [showActivityHelp, setShowActivityHelp] = useState(false);
  const [trainingPlanInfo, setTrainingPlanInfo] = useState({
    loading: true,
    hasPlan: false,
    endDate: null,
    remainingDays: null,
    cappedDays: null,
    capApplied: false,
    minApplied: false,
    error: null,
    trainingSchedule: null,
    scheduleWeekStart: null,
    trainingType: null,
    previewSchedule: null
  });

  const userObjective = userData?.objetivo_principal
    ? GOAL_FROM_USER[userData.objetivo_principal] || null
    : null;
  const userActivity = userData?.nivel_actividad
    ? ACTIVITY_FROM_USER[userData.nivel_actividad] || null
    : null;
  const userMeals = userData?.comidas_diarias
    ? Number(userData.comidas_diarias)
    : null;

  const profileDiscrepancies = useMemo(() => {
    if (!userData || profileLoading) return [];
    const items = [];
    if (userObjective && profileData.objetivo && userObjective !== profileData.objetivo) {
      items.push({
        field: 'objetivo',
        label: 'Objetivo principal',
        general: formatObjectiveLabel(userObjective),
        nutrition: formatObjectiveLabel(profileData.objetivo)
      });
    }
    if (userActivity && profileData.actividad && userActivity !== profileData.actividad) {
      items.push({
        field: 'actividad',
        label: 'Nivel de actividad',
        general: formatActivityLabel(userActivity),
        nutrition: formatActivityLabel(profileData.actividad)
      });
    }
    if (
      userMeals &&
      profileData.comidas_dia &&
      Number(userMeals) !== Number(profileData.comidas_dia)
    ) {
      items.push({
        field: 'comidas',
        label: 'Comidas por dia',
        general: `${Number(userMeals)}`,
        nutrition: `${Number(profileData.comidas_dia)}`
      });
    }
    return items;
  }, [userData, userObjective, userActivity, userMeals, profileData, profileLoading]);

  const buildProfileFromUser = () => ({
    ...DEFAULT_PROFILE,
    objetivo: userObjective || DEFAULT_PROFILE.objetivo,
    actividad: userActivity || DEFAULT_PROFILE.actividad,
    comidas_dia: userMeals || DEFAULT_PROFILE.comidas_dia,
    preferencias: profileData.preferencias || DEFAULT_PROFILE.preferencias,
    alergias: Array.isArray(profileData.alergias) ? profileData.alergias : []
  });

  const loadProfileFromUserData = async () => {
    const nextProfile = buildProfileFromUser();
    setProfileData(nextProfile);
    const saved = await handleSaveProfile(nextProfile);
    if (saved) {
      setDismissedMismatch(true);
    }
  };

  useEffect(() => {
    if (profileDiscrepancies.length === 0 && dismissedMismatch) {
      setDismissedMismatch(false);
    }
  }, [profileDiscrepancies.length, dismissedMismatch]);

  useEffect(() => {
    let isMounted = true;
    const MS_PER_DAY = 1000 * 60 * 60 * 24;

    const fetchTrainingPlanInfo = async () => {
      try {
        const token = localStorage.getItem('token') || localStorage.getItem('authToken');
        if (!token) {
          if (isMounted) {
            setTrainingPlanInfo({
              loading: false,
              hasPlan: false,
              endDate: null,
              remainingDays: null,
              cappedDays: null,
              capApplied: false,
              minApplied: false,
              error: null,
              trainingSchedule: null,
              scheduleWeekStart: null,
              trainingType: null,
              previewSchedule: null
            });
          }
          return;
        }

        const activeResponse = await fetch(`${API_URL}/api/routines/active-plan`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (!activeResponse.ok) {
          if (isMounted) {
            setTrainingPlanInfo({
              loading: false,
              hasPlan: false,
              endDate: null,
              remainingDays: null,
              cappedDays: null,
              capApplied: false,
              minApplied: false,
              error: null,
              trainingSchedule: null,
              scheduleWeekStart: null,
              trainingType: null,
              previewSchedule: null
            });
          }
          return;
        }

        const activeData = await activeResponse.json();
        if (!activeData?.hasActivePlan) {
          if (isMounted) {
            setTrainingPlanInfo({
              loading: false,
              hasPlan: false,
              endDate: null,
              remainingDays: null,
              cappedDays: null,
              capApplied: false,
              minApplied: false,
              error: null,
              trainingSchedule: null,
              scheduleWeekStart: null,
              trainingType: null,
              previewSchedule: null
            });
          }
          return;
        }

        const rawMethodologyType =
          activeData?.planType ||
          activeData?.methodology_type ||
          activeData?.methodologyType ||
          activeData?.routinePlan?.methodology_type ||
          activeData?.routinePlan?.methodologyType;
        const mappedTrainingType = mapMethodologyToTrainingType(rawMethodologyType);

        const planId = activeData.planId || activeData.methodology_plan_id;
        if (!planId) {
          if (isMounted) {
            setTrainingPlanInfo({
              loading: false,
              hasPlan: true,
              endDate: null,
              remainingDays: null,
              cappedDays: null,
              capApplied: false,
              minApplied: false,
              error: 'No se pudo identificar el plan activo.',
              trainingSchedule: null,
              scheduleWeekStart: null,
              trainingType: mappedTrainingType,
              previewSchedule: null
            });
          }
          return;
        }

        const calendarResponse = await fetch(`${API_URL}/api/routines/calendar-schedule/${planId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (!calendarResponse.ok) {
          if (isMounted) {
            setTrainingPlanInfo({
              loading: false,
              hasPlan: true,
              endDate: null,
              remainingDays: null,
              cappedDays: null,
              capApplied: false,
              minApplied: false,
              error: 'No se pudo leer el calendario del plan.',
              trainingSchedule: null,
              scheduleWeekStart: null,
              trainingType: mappedTrainingType,
              previewSchedule: null
            });
          }
          return;
        }

        const calendarData = await calendarResponse.json();
        const weeks = calendarData?.plan?.semanas || [];
        const dates = [];
        weeks.forEach((week) => {
          (week.sesiones || []).forEach((session) => {
            if (session?.fecha) {
              const dateValue = String(session.fecha).split('T')[0];
              if (dateValue) {
                dates.push(dateValue);
              }
            }
          });
        });

        if (dates.length === 0) {
          if (isMounted) {
            setTrainingPlanInfo({
              loading: false,
              hasPlan: true,
              endDate: null,
              remainingDays: null,
              cappedDays: null,
              capApplied: false,
              minApplied: false,
              error: 'No hay fechas programadas en el plan.',
              trainingSchedule: null,
              scheduleWeekStart: null,
              trainingType: mappedTrainingType,
              previewSchedule: null
            });
          }
          return;
        }

        dates.sort();
        const lastDateRaw = dates[dates.length - 1];
        const endDate = parseLocalDate(lastDateRaw);
        if (!endDate || Number.isNaN(endDate.getTime())) {
          if (isMounted) {
            setTrainingPlanInfo({
              loading: false,
              hasPlan: true,
              endDate: null,
              remainingDays: null,
              cappedDays: null,
              capApplied: false,
              minApplied: false,
              error: 'No se pudo interpretar la fecha del calendario.',
              trainingSchedule: null,
              scheduleWeekStart: null,
              trainingType: mappedTrainingType,
              previewSchedule: null
            });
          }
          return;
        }
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const diffDays = Math.floor((endDate.getTime() - today.getTime()) / MS_PER_DAY);
        const remainingDays = diffDays + 1;

        if (!Number.isFinite(remainingDays) || remainingDays <= 0) {
          if (isMounted) {
            setTrainingPlanInfo({
              loading: false,
              hasPlan: true,
              endDate,
              remainingDays,
              cappedDays: null,
              capApplied: false,
              minApplied: false,
              error: 'El plan activo ya finalizo o no tiene fechas futuras.',
              trainingSchedule: null,
              scheduleWeekStart: null,
              trainingType: mappedTrainingType,
              previewSchedule: null
            });
          }
          return;
        }

        const cappedDays = Math.max(MIN_PLAN_DAYS, Math.min(MAX_PLAN_DAYS, remainingDays));
        const { schedule, startDate } = buildDailyScheduleFromDates(dates, cappedDays);
        const { schedule: previewSchedule, weekStart } = buildWeeklyPreviewFromDates(dates);

        if (isMounted) {
          setTrainingPlanInfo({
            loading: false,
            hasPlan: true,
            endDate: Number.isFinite(endDate.getTime()) ? endDate : null,
            remainingDays,
            cappedDays,
            capApplied: remainingDays > MAX_PLAN_DAYS,
            minApplied: remainingDays < MIN_PLAN_DAYS,
            error: null,
            trainingSchedule: schedule,
            scheduleWeekStart: weekStart || startDate,
            trainingType: mappedTrainingType,
            previewSchedule
          });
        }
      } catch (error) {
        if (isMounted) {
          setTrainingPlanInfo({
            loading: false,
            hasPlan: false,
            endDate: null,
            remainingDays: null,
            cappedDays: null,
            capApplied: false,
            minApplied: false,
            error: error.message,
            trainingSchedule: null,
            scheduleWeekStart: null,
            trainingType: null,
            previewSchedule: null
          });
        }
      }
    };

    fetchTrainingPlanInfo();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const shouldAutoSync =
      !trainingPlanInfo.loading &&
      trainingPlanInfo.hasPlan &&
      !trainingPlanInfo.error &&
      Number.isFinite(trainingPlanInfo.cappedDays) &&
      Array.isArray(trainingPlanInfo.trainingSchedule);

    if (!shouldAutoSync) return;

    setConfig((prev) => {
      const next = {
        ...prev,
        duracion_dias: trainingPlanInfo.cappedDays,
        training_type: trainingPlanInfo.trainingType || prev.training_type,
        training_schedule: trainingPlanInfo.trainingSchedule
      };

      if (
        prev.duracion_dias === next.duracion_dias &&
        prev.training_type === next.training_type &&
        areBooleanArraysEqual(prev.training_schedule, next.training_schedule)
      ) {
        return prev;
      }

      return next;
    });
  }, [
    trainingPlanInfo.loading,
    trainingPlanInfo.hasPlan,
    trainingPlanInfo.error,
    trainingPlanInfo.cappedDays,
    trainingPlanInfo.trainingType,
    trainingPlanInfo.trainingSchedule
  ]);

  useEffect(() => {
    const controller = new AbortController();
    const token = localStorage.getItem('token') || localStorage.getItem('authToken');

    const loadProfile = async () => {
      try {
        setProfileLoading(true);
        setProfileLoadError(null);

        if (!token) {
          throw new Error('No se encontro un token de autenticacion');
        }

        const response = await fetch(`${API_URL}/api/nutrition-v2/profile`, {
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${token}`
          }
        });

        if (response.status === 404) {
          setProfileData(buildProfileFromUser());
          return;
        }

        if (!response.ok) {
          throw new Error('No se pudo cargar el perfil nutricional');
        }

        const data = await response.json();
        setProfileData({
          objetivo: data.objetivo || DEFAULT_PROFILE.objetivo,
          actividad: data.actividad || DEFAULT_PROFILE.actividad,
          comidas_dia: data.comidas_dia || DEFAULT_PROFILE.comidas_dia,
          preferencias: {
            ...DEFAULT_PROFILE.preferencias,
            ...(data.preferencias || {})
          },
          alergias: Array.isArray(data.alergias) ? data.alergias : []
        });
      } catch (error) {
        if (error.name !== 'AbortError') {
          setProfileLoadError(error.message);
          setProfileData(buildProfileFromUser());
        }
      } finally {
        setProfileLoading(false);
      }
    };

    loadProfile();

    return () => controller.abort();
  }, [userObjective, userActivity, userMeals]);

  useEffect(() => {
    if (!profileSuccess) return;
    const timeout = setTimeout(() => setProfileSuccess(null), 4000);
    return () => clearTimeout(timeout);
  }, [profileSuccess]);

  const toggleTrainingDay = (index) => {
    const next = [...config.training_schedule];
    next[index] = !next[index];
    setConfig((prev) => ({ ...prev, training_schedule: next }));
  };

  const setPreset = (preset) => {
    const schedules = {
      '3dias': [true, false, true, false, true, false, false],
      '4dias': [true, true, false, true, true, false, false],
      '5dias': [true, true, true, false, true, true, false],
      '6dias': [true, true, true, true, true, true, false]
    };

    if (schedules[preset]) {
      setConfig((prev) => ({ ...prev, training_schedule: schedules[preset] }));
    }
  };

  const handlePreferenceToggle = (key) => {
    setProfileData((prev) => ({
      ...prev,
      preferencias: {
        ...prev.preferencias,
        [key]: !prev.preferencias[key]
      }
    }));
  };

  const addAlergia = () => {
    const trimmed = alergiaInput.trim();
    if (!trimmed) return;

    setProfileData((prev) => ({
      ...prev,
      alergias: prev.alergias.includes(trimmed)
        ? prev.alergias
        : [...prev.alergias, trimmed]
    }));
    setAlergiaInput('');
  };

  const removeAlergia = (item) => {
    setProfileData((prev) => ({
      ...prev,
      alergias: prev.alergias.filter((alergia) => alergia !== item)
    }));
  };

  const handleSaveProfile = async (overrideData) => {
    setProfileSaving(true);
    setProfileSaveError(null);
    setProfileSuccess(null);
    const dataToSave = overrideData || profileData;
    let wasSaved = false;

    try {
      const token = localStorage.getItem('token') || localStorage.getItem('authToken');
      if (!token) {
        throw new Error('No se encontro un token de autenticacion');
      }

      const response = await fetch(`${API_URL}/api/nutrition-v2/profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(dataToSave)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'No se pudo guardar el perfil nutricional');
      }

      const data = await response.json();
      setEstimaciones(data.estimaciones || null);
      setProfileSuccess('Perfil nutricional guardado correctamente');
      wasSaved = true;

      const syncUpdates = {};
      const mappedGoal = GOAL_TO_USER[dataToSave.objetivo];
      const mappedActivity = ACTIVITY_TO_USER[dataToSave.actividad];
      const mappedMeals = Number(dataToSave.comidas_dia);

      if (mappedGoal && mappedGoal !== userData?.objetivo_principal) {
        syncUpdates.objetivo_principal = mappedGoal;
      }
      if (mappedActivity && mappedActivity !== userData?.nivel_actividad) {
        syncUpdates.nivel_actividad = mappedActivity;
      }
      if (
        mappedMeals &&
        !Number.isNaN(mappedMeals) &&
        mappedMeals > 0 &&
        mappedMeals !== Number(userData?.comidas_diarias)
      ) {
        syncUpdates.comidas_diarias = mappedMeals;
      }

      if (Object.keys(syncUpdates).length > 0) {
        const result = await updateUserProfile(syncUpdates);
        if (!result?.success) {
          throw new Error(result?.error || 'No se pudo sincronizar el perfil del usuario');
        }
        await refreshProfile?.();
      }
    } catch (error) {
      setProfileSaveError(error.message);
    } finally {
      setProfileSaving(false);
    }
    return wasSaved;
  };

  const handleGeneratePlan = async () => {
    setPlanLoading(true);
    setPlanError(null);
    setPlanSuccess(false);

    try {
      const token = localStorage.getItem('token') || localStorage.getItem('authToken');
      if (!token) {
        throw new Error('No se encontro un token de autenticacion');
      }

      const isTrainingLinked = trainingPlanInfo.hasPlan && !trainingPlanInfo.loading;
      const payloadConfig = isTrainingLinked
        ? {
            ...config,
            duracion_dias: trainingPlanInfo.cappedDays || config.duracion_dias,
            training_type: trainingPlanInfo.trainingType || config.training_type,
            training_schedule: Array.isArray(trainingPlanInfo.trainingSchedule)
              ? trainingPlanInfo.trainingSchedule
              : config.training_schedule
          }
        : config;

      // Asegurar que exista un perfil antes de generar (upsert)
      const profileUpsert = await fetch(`${API_URL}/api/nutrition-v2/profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(profileData)
      });

      if (!profileUpsert.ok) {
        const errorData = await profileUpsert.json().catch(() => ({}));
        throw new Error(errorData.error || 'Debes guardar primero tu configuracion nutricional');
      }

      const profilePayload = await profileUpsert.json().catch(() => null);
      if (profilePayload?.estimaciones) {
        setEstimaciones(profilePayload.estimaciones);
      }

      const response = await fetch(`${API_URL}/api/nutrition-v2/generate-plan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payloadConfig)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Error al generar el plan');
      }

      const data = await response.json();
      setGeneratedPlan(data.plan);
      setPlanSuccess(true);

      if (onPlanGenerated) {
        onPlanGenerated(data);
      }
    } catch (error) {
      setPlanError(error.message);
    } finally {
      setPlanLoading(false);
    }
  };

  const isDailySchedule = config.training_schedule.length > DIAS_SEMANA.length;
  const isTrainingLinked = trainingPlanInfo.hasPlan && !trainingPlanInfo.loading;
  const previewSchedule = isDailySchedule && Array.isArray(trainingPlanInfo.previewSchedule)
    ? trainingPlanInfo.previewSchedule
    : config.training_schedule;
  const trainingDaysCount = previewSchedule.filter(Boolean).length;
  const restDaysCount = previewSchedule.length - trainingDaysCount;
  const trainingScheduleTitle = isDailySchedule
    ? 'Dias de entrenamiento (semana habitual)'
    : 'Dias de entrenamiento (primera semana)';
  const scheduleHelperText = isTrainingLinked
    ? 'Sincronizado con tu plan de entrenamiento.'
    : isDailySchedule
      ? 'Vista basada en una semana completa del plan.'
      : 'Usa un preset o ajusta manualmente los dias';

  return (
    <div className="w-full max-w-5xl mx-auto p-0 sm:p-6 space-y-6">
      <div className="bg-neutral-900/70 border border-white/10 ring-1 ring-white/5 rounded-2xl p-4 sm:p-6 shadow-[0_25px_60px_-50px_rgba(0,0,0,0.8)] backdrop-blur-lg">
        <header className="flex items-center gap-3">
          <TrendingUp className="w-8 h-8 text-yellow-400" />
          <div>
            <h2 className="text-2xl font-bold text-white">Generar Plan Nutricional</h2>
            <p className="text-gray-400 text-sm">Calculo determinista personalizado</p>
          </div>
        </header>
      </div>

      <section className="bg-neutral-900/70 border border-white/10 ring-1 ring-white/5 rounded-xl p-6 space-y-6">
          <header className="flex items-center gap-3">
            <Settings className="w-6 h-6 text-yellow-400" />
            <div>
              <h3 className="text-xl font-semibold text-white">Configuracion nutricional</h3>
              <p className="text-sm text-gray-400">
                Ajusta objetivo, nivel de actividad, comidas por dia y preferencias alimentarias.
              </p>
            </div>
          </header>

          {profileDiscrepancies.length > 0 && !dismissedMismatch && (
            <div className="p-4 bg-yellow-500/10 border border-yellow-500/40 rounded-lg space-y-3">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-yellow-400 mt-1" />
                <div className="text-sm text-yellow-100">
                  <p className="font-semibold text-yellow-200">Datos distintos entre perfiles</p>
                  <p className="text-yellow-100/80">
                    El plan usa el perfil de nutricion. Si quieres alinear todo, sincroniza con tu perfil general.
                  </p>
                </div>
              </div>

              <div className="text-xs text-yellow-100/90">
                <p className="font-semibold text-yellow-200 mb-2">Diferencias detectadas</p>
                <div className="space-y-3">
                  {profileDiscrepancies.map((item) => (
                    <div key={item.field} className="rounded-lg border border-white/10 bg-white/5 p-3">
                      <div className="text-[13px] font-semibold text-yellow-200 mb-2">{item.label}</div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div className="rounded-md border border-sky-300/40 bg-sky-400/10 px-2.5 py-1.5">
                          <div className="text-[10px] uppercase tracking-wide text-sky-200/80">Perfil general</div>
                          <div className="text-[12px] font-semibold text-sky-100">{item.general}</div>
                        </div>
                        <div className="rounded-md border border-yellow-300/40 bg-yellow-400/10 px-2.5 py-1.5">
                          <div className="text-[10px] uppercase tracking-wide text-yellow-200/80">Nutricion</div>
                          <div className="text-[12px] font-semibold text-yellow-100">{item.nutrition}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    loadProfileFromUserData();
                  }}
                  className="px-4 py-2 bg-yellow-400 text-gray-900 rounded-lg font-semibold hover:bg-yellow-500 transition-colors disabled:opacity-60"
                  disabled={profileLoading || profileSaving}
                >
                  Sincronizar con perfil general
                </button>
                <button
                  type="button"
                  onClick={() => setDismissedMismatch(true)}
                  className="px-4 py-2 bg-white/5 border border-white/10 text-gray-200/80 rounded-lg font-semibold hover:bg-white/10 transition-colors disabled:opacity-60"
                  disabled={profileLoading || profileSaving}
                >
                  Cancelar aviso
                </button>
              </div>

              <p className="text-xs text-yellow-100/80">
                Esto guardara esos valores en tu perfil de nutricion.
              </p>
            </div>
          )}

          {profileLoadError && (
            <div className="p-3 bg-red-500/10 border border-red-500/40 rounded-lg flex items-start gap-2 text-sm text-red-300">
              <AlertCircle className="w-4 h-4 mt-0.5" />
              <span>{profileLoadError}</span>
            </div>
          )}

          <div className="space-y-6">
            <div>
              <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
                <Target className="w-4 h-4 text-yellow-400" />
                Objetivo principal
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {OBJECTIVE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setProfileData((prev) => ({ ...prev, objetivo: option.value }))}
                    className={`p-4 rounded-lg border transition-all text-left ${
                      profileData.objetivo === option.value
                        ? 'border-yellow-400 bg-yellow-500/10 text-white'
                        : 'border-white/10 bg-white/5 text-gray-300/80 hover:border-white/20'
                    }`}
                    disabled={profileLoading || profileSaving}
                  >
                    <div className="text-sm font-semibold">{option.label}</div>
                    <div className="text-xs text-gray-400 mt-1">{option.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
                <Activity className="w-4 h-4 text-yellow-400" />
                Nivel de actividad
              </h4>
              <select
                value={profileData.actividad}
                onChange={(event) =>
                  setProfileData((prev) => ({ ...prev, actividad: event.target.value }))
                }
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-gray-100 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                disabled={profileLoading || profileSaving}
              >
                {ACTIVITY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-400">
                <span>
                  {ACTIVITY_HELP[normalizeActivityValue(profileData.actividad)]?.short || 'Selecciona tu nivel de actividad'}
                </span>
                <button
                  type="button"
                  onClick={() => setShowActivityHelp((prev) => !prev)}
                  className="text-yellow-300/90 hover:text-yellow-200 transition-colors"
                >
                  {showActivityHelp ? 'Ocultar guia' : '¿Como elegir?'}
                </button>
              </div>
              {showActivityHelp && (
                <div className="mt-3 rounded-lg border border-white/10 bg-white/5 p-3 text-xs text-gray-300 space-y-2">
                  {Object.entries(ACTIVITY_HELP).map(([key, info]) => (
                    <div key={key} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                      <span className="font-semibold text-yellow-200">{info.label}</span>
                      <span className="text-gray-300">{info.short}</span>
                    </div>
                  ))}
                  <p className="text-gray-400">
                    Ajusta tu seleccion si tus pasos o entrenos cambian semana a semana.
                  </p>
                </div>
              )}
            </div>

            <div>
              <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
                <Utensils className="w-4 h-4 text-yellow-400" />
                Comidas por dia
              </h4>
              <div className="flex flex-wrap gap-2">
                {[3, 4, 5, 6].map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => setProfileData((prev) => ({ ...prev, comidas_dia: count }))}
                    className={`px-4 py-3 rounded-lg font-semibold transition-all ${
                      profileData.comidas_dia === count
                        ? 'bg-yellow-400 text-gray-900'
                        : 'bg-white/5 text-gray-200/80 hover:bg-white/10'
                    }`}
                    disabled={profileLoading || profileSaving}
                  >
                    {count}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h4 className="text-white font-semibold mb-3">Preferencias alimentarias</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {PREFERENCE_KEYS.map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handlePreferenceToggle(key)}
                    className={`p-3 rounded-lg text-sm font-medium transition-all ${
                      profileData.preferencias[key]
                        ? 'bg-yellow-400 text-gray-900'
                        : 'bg-white/5 text-gray-200/80 hover:bg-white/10'
                    }`}
                    disabled={profileLoading || profileSaving}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h4 className="text-white font-semibold mb-3">Alergias o restricciones</h4>
              <div className="flex flex-wrap gap-2">
                <input
                  type="text"
                  value={alergiaInput}
                  onChange={(event) => setAlergiaInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      addAlergia();
                    }
                  }}
                  placeholder="Ej: frutos secos, mariscos..."
                  className="flex-1 min-w-[200px] bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                  disabled={profileLoading || profileSaving}
                />
                <button
                  type="button"
                  onClick={addAlergia}
                  className="px-4 py-2 bg-yellow-400 text-gray-900 rounded-lg font-semibold hover:bg-yellow-500 transition-colors disabled:opacity-60"
                  disabled={profileLoading || profileSaving}
                >
                  Anadir
                </button>
              </div>
              {profileData.alergias.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {profileData.alergias.map((item) => (
                    <span
                      key={item}
                      className="inline-flex items-center gap-2 bg-red-500/15 border border-red-500/30 text-red-300 px-3 py-1 rounded-full text-xs"
                    >
                      {item}
                      <button
                        type="button"
                        onClick={() => removeAlergia(item)}
                        className="hover:text-red-200"
                        disabled={profileSaving}
                      >
                        &#10005;
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleSaveProfile}
              className="flex items-center gap-2 px-5 py-3 bg-yellow-400 text-gray-900 font-semibold rounded-lg hover:bg-yellow-500 transition-colors disabled:opacity-60"
              disabled={profileLoading || profileSaving}
            >
              {profileSaving && <Loader2 className="w-4 h-4 animate-spin" />}
              Guardar configuracion
            </button>
            <button
              type="button"
              onClick={loadProfileFromUserData}
              className="flex items-center gap-2 px-5 py-3 bg-white/5 border border-white/10 text-gray-200/80 font-semibold rounded-lg hover:bg-white/10 transition-colors disabled:opacity-60"
              disabled={profileLoading || profileSaving}
            >
              Usar datos del perfil general
            </button>
            {profileSaving && (
              <span className="text-sm text-gray-400 flex items-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin" />
                Guardando...
              </span>
            )}
          </div>

          {profileSaveError && (
            <div className="p-3 bg-red-500/10 border border-red-500/40 rounded-lg flex items-start gap-2 text-sm text-red-300">
              <AlertCircle className="w-4 h-4 mt-0.5" />
              <span>{profileSaveError}</span>
            </div>
          )}

          {profileSuccess && (
            <div className="p-3 bg-green-500/10 border border-green-500/40 rounded-lg flex items-start gap-2 text-sm text-green-300">
              <CheckCircle2 className="w-4 h-4 mt-0.5" />
              <span>{profileSuccess}</span>
            </div>
          )}

          {estimaciones && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white/5 border border-white/10 rounded-lg p-4 text-center">
                <div className="text-gray-400 text-xs mb-1">TMB</div>
                <div className="text-2xl font-bold text-yellow-400">{estimaciones.bmr}</div>
                <div className="text-gray-500 text-xs">Metabolismo basal</div>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-lg p-4 text-center">
                <div className="text-gray-400 text-xs mb-1">TDEE</div>
                <div className="text-2xl font-bold text-yellow-400">{estimaciones.tdee}</div>
                <div className="text-gray-500 text-xs">Gasto total diario</div>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-lg p-4 text-center">
                <div className="text-gray-400 text-xs mb-1">Calorias objetivo</div>
                <div className="text-2xl font-bold text-green-400">{estimaciones.kcal_objetivo}</div>
                <div className="text-gray-500 text-xs">Por dia</div>
              </div>
            </div>
          )}
        </section>

        <section className="space-y-6">
          <div className="bg-neutral-900/70 border border-white/10 ring-1 ring-white/5 rounded-xl p-6 space-y-6">
            <header className="flex items-center gap-3">
              <TrendingUp className="w-6 h-6 text-yellow-400" />
              <div>
                <h3 className="text-xl font-semibold text-white">Calculo determinista del plan</h3>
                <p className="text-sm text-gray-400">
                  Define duracion, tipo de entrenamiento y distribucion de dias activos y de descanso.
                </p>
              </div>
            </header>

            {planError && (
              <div className="p-3 bg-red-500/10 border border-red-500/40 rounded-lg flex items-start gap-2 text-sm text-red-300">
                <AlertCircle className="w-4 h-4 mt-0.5" />
                <span>{planError}</span>
              </div>
            )}

            {planSuccess && (
              <div className="p-3 bg-green-500/10 border border-green-500/40 rounded-lg flex items-start gap-2 text-sm text-green-300">
                <CheckCircle2 className="w-4 h-4 mt-0.5" />
                <span>Plan generado correctamente. Revisa el calendario para ver el detalle dia por dia.</span>
              </div>
            )}

            <div className="space-y-5">
              <div>
                <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-yellow-400" />
                  Duracion del plan
                </h4>
                {trainingPlanInfo.loading && (
                  <p className="text-xs text-gray-400 mb-2">Buscando plan activo...</p>
                )}
                {trainingPlanInfo.error && (
                  <p className="text-xs text-amber-300 mb-2">{trainingPlanInfo.error}</p>
                )}
                {trainingPlanInfo.hasPlan && trainingPlanInfo.endDate && (
                  <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-gray-300">
                    <span className="px-2 py-1 rounded-full bg-white/10 border border-white/10">
                      Plan hasta {trainingPlanInfo.endDate.toLocaleDateString('es-ES')}
                    </span>
                    <span className="px-2 py-1 rounded-full bg-white/10 border border-white/10">
                      Revision automatica cada 14 dias
                    </span>
                  </div>
                )}
                {trainingPlanInfo.hasPlan && (
                  <div className="mb-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200">
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-300" />
                      <div className="space-y-1">
                        <p className="font-semibold text-emerald-100">Nutricion enlazada a tu plan de entrenamiento</p>
                        <p className="text-emerald-100/80">
                          La duracion, el tipo de entrenamiento y el calendario se sincronizan automaticamente.
                        </p>
                      </div>
                    </div>
                    {(trainingPlanInfo.capApplied || trainingPlanInfo.minApplied) && (
                      <p className="text-xs text-amber-200/90 mt-2">
                        {trainingPlanInfo.capApplied && 'Duracion ajustada a 28 dias (limite del plan nutricional).'}
                        {trainingPlanInfo.minApplied && 'Duracion ajustada al minimo de 3 dias.'}
                      </p>
                    )}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {DURATION_PRESETS.map((days) => (
                    <button
                      key={days}
                      type="button"
                      onClick={() => setConfig((prev) => ({ ...prev, duracion_dias: days }))}
                      className={`px-4 py-3 rounded-lg font-semibold transition-all ${
                        config.duracion_dias === days
                          ? 'bg-yellow-400 text-gray-900'
                          : 'bg-white/5 text-gray-200/80 hover:bg-white/10'
                      }`}
                      disabled={planLoading || isTrainingLinked}
                    >
                      {days} dias
                    </button>
                  ))}
                </div>
                {!isTrainingLinked && (
                  <p className="text-xs text-gray-500 mt-2">
                    Recomendamos planes de 7-14 dias para ajustarlos con frecuencia.
                  </p>
                )}
                {isTrainingLinked && (
                  <p className="text-xs text-gray-500 mt-2">
                    Duracion sincronizada con tu plan de entrenamiento actual.
                  </p>
                )}
                {!trainingPlanInfo.hasPlan && !trainingPlanInfo.loading && (
                  <p className="text-xs text-gray-500 mt-1">
                    Si inicias un plan de entrenamiento, podras rehacer la dieta para ajustar la duracion.
                  </p>
                )}
              </div>

              <div>
                <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
                  <Dumbbell className="w-4 h-4 text-yellow-400" />
                  Tipo de entrenamiento
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {TRAINING_TYPES.map(({ value, label, desc, Icon }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setConfig((prev) => ({ ...prev, training_type: value }))}
                      className={`p-4 rounded-lg border transition-all text-left ${
                        config.training_type === value
                          ? 'border-yellow-400 bg-yellow-500/10 text-white'
                          : 'border-white/10 bg-white/5 text-gray-300/80 hover:border-white/20'
                      }`}
                      disabled={planLoading || isTrainingLinked}
                    >
                      <Icon className="w-5 h-5 mb-2 text-yellow-400" />
                      <div className="text-sm font-semibold">{label}</div>
                      <div className="text-xs text-gray-400 mt-1">{desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <h4 className="text-white font-semibold">{trainingScheduleTitle}</h4>
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <Info className="w-4 h-4" />
                    <span>{scheduleHelperText}</span>
                  </div>
                </div>

                {!isTrainingLinked && (
                  <div className="flex items-center gap-2 mb-4 flex-wrap">
                    <span className="text-sm text-gray-400">Presets rapidos:</span>
                    {['3dias', '4dias', '5dias', '6dias'].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setPreset(preset)}
                        className="px-2.5 py-1 bg-white/5 text-gray-200/80 rounded text-xs hover:bg-white/10 transition-colors disabled:opacity-60"
                        disabled={planLoading}
                      >
                        {preset.replace('dias', ' dias')}
                      </button>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-4 sm:grid-cols-7 gap-1 sm:gap-2">
                  {DIAS_SEMANA.map((dia, index) => (
                    <button
                      key={dia}
                      type="button"
                      onClick={() => {
                        if (!isDailySchedule && !isTrainingLinked) {
                          toggleTrainingDay(index);
                        }
                      }}
                      className={`aspect-square rounded-md sm:rounded-lg font-semibold text-[10px] sm:text-sm transition-all ${
                        previewSchedule[index]
                          ? 'bg-green-500 text-white'
                          : 'bg-white/5 text-gray-400 hover:bg-white/10'
                      }`}
                      disabled={planLoading || isDailySchedule || isTrainingLinked}
                    >
                      <div>{dia}</div>
                      <div className="text-[9px] sm:text-[10px] mt-0.5 sm:mt-1">
                        {previewSchedule[index] ? 'Entreno' : 'Descanso'}
                      </div>
                    </button>
                  ))}
                </div>

                <div className="mt-3 flex gap-4 text-sm flex-wrap">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-green-500 rounded-full" />
                    <span className="text-gray-300">{trainingDaysCount} dias de entreno</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-white/20 rounded-full" />
                    <span className="text-gray-300">{restDaysCount} dias de descanso</span>
                  </div>
                </div>

                <div className="mt-3 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg text-sm text-blue-200">
                  <strong>Carb cycling:</strong> dias de entreno reciben +10% carbohidratos y dias de descanso -15%.
                </div>
              </div>
            </div>
          </div>

          <div className="bg-neutral-900/70 border border-white/10 ring-1 ring-white/5 rounded-xl p-4 space-y-3">
            <h4 className="text-white font-semibold mb-2 flex items-center gap-2">
              Resumen de configuracion
            </h4>
            <ul className="text-sm text-gray-300 space-y-1">
              <li>
                <strong className="text-yellow-300">Duracion:</strong> {config.duracion_dias} dias
              </li>
              <li>
                <strong className="text-yellow-300">Tipo:</strong>{' '}
                {TRAINING_TYPES.find((t) => t.value === config.training_type)?.label}
              </li>
              <li>
                <strong className="text-yellow-300">Frecuencia:</strong>{' '}
                {trainingDaysCount} entrenos/semana{isDailySchedule ? ' (semana habitual)' : ''}
              </li>
              <li>
                <strong className="text-yellow-300">Carb cycling:</strong> activado
              </li>
            </ul>
          </div>

          <div className="bg-neutral-900/70 border border-white/10 ring-1 ring-white/5 rounded-xl p-4">
            <button
              type="button"
              onClick={handleGeneratePlan}
              className="w-full bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 text-black py-4 rounded-xl font-semibold text-lg hover:from-yellow-200 hover:via-yellow-300 hover:to-amber-400 shadow-[0_12px_30px_-18px_rgba(250,204,21,0.8)] transition-all disabled:opacity-70 flex items-center justify-center gap-2"
              disabled={planLoading}
            >
              {planLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Generando plan determinista...
                </>
              ) : (
                <>
                  <TrendingUp className="w-5 h-5" />
                  Generar plan nutricional
                </>
              )}
            </button>
          </div>
        </section>

        {generatedPlan && (
          <section className="bg-gradient-to-br from-green-500/10 to-blue-500/10 border border-green-500/40 rounded-xl p-6 space-y-4">
            <h4 className="text-green-400 font-bold text-lg flex items-center gap-2">
              <CheckCircle2 className="w-6 h-6" />
              Plan generado exitosamente
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white/5 border border-white/10 rounded-lg p-4 text-center">
                <div className="text-gray-400 text-xs mb-1">TMB</div>
                <div className="text-2xl font-bold text-yellow-400">{generatedPlan.bmr} kcal</div>
                <div className="text-gray-500 text-xs">Metabolismo basal</div>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-lg p-4 text-center">
                <div className="text-gray-400 text-xs mb-1">TDEE</div>
                <div className="text-2xl font-bold text-yellow-400">{generatedPlan.tdee} kcal</div>
                <div className="text-gray-500 text-xs">Gasto total diario</div>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-lg p-4 text-center">
                <div className="text-gray-400 text-xs mb-1">Calorias objetivo</div>
                <div className="text-2xl font-bold text-green-400">{generatedPlan.kcal_objetivo} kcal</div>
                <div className="text-gray-500 text-xs">Por dia</div>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-lg p-4 text-center">
                <div className="text-gray-400 text-xs mb-1">Comidas</div>
                <div className="text-2xl font-bold text-blue-400">{generatedPlan.comidas_por_dia}</div>
                <div className="text-gray-500 text-xs">Por dia</div>
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-lg p-4">
              <div className="text-gray-400 text-sm mb-2">Macronutrientes objetivo (promedio):</div>
              <div className="flex flex-wrap gap-4 text-white text-sm">
                <div>
                  <span className="text-red-400 font-bold">
                    {generatedPlan.macros_objetivo.protein_g} g
                  </span>
                  <span className="text-gray-400 ml-1">proteina</span>
                </div>
                <div>
                  <span className="text-yellow-300 font-bold">
                    {generatedPlan.macros_objetivo.carbs_g} g
                  </span>
                  <span className="text-gray-400 ml-1">carbohidratos</span>
                </div>
                <div>
                  <span className="text-blue-300 font-bold">
                    {generatedPlan.macros_objetivo.fat_g} g
                  </span>
                  <span className="text-gray-400 ml-1">grasas</span>
                </div>
              </div>
            </div>

            <p className="text-sm text-gray-400 text-center">
              Ve a la pestaña Calendario para revisar el plan completo dia por dia y generar los menus.
            </p>
          </section>
        )}
    </div>
  );
}
