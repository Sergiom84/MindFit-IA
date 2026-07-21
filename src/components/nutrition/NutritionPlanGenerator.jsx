import { useEffect, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { useUserContext } from '@/contexts/UserContext';
import tokenManager from '../../utils/tokenManager';
import { getApiBaseUrl } from '../../config/api';
import {
  getNutritionProfile,
  invalidateActiveNutritionPlan,
  invalidateNutritionProfile
} from '../../services/nutritionV2ReadService';
import {
  ACTIVITY_FROM_USER,
  ACTIVITY_TO_USER,
  DEFAULT_PROFILE,
  DIAS_SEMANA,
  GOAL_FROM_USER,
  GOAL_TO_USER,
  LOW_MEAL_COUNTS
} from './nutritionPlanConfig';
import {
  areBooleanArraysEqual,
  buildProfileStateFromApi,
  buildProfileStateFromUser
} from './nutritionPlanHelpers';
import useTrainingPlanInfo from './useTrainingPlanInfo';
import GeneratedPlanSummary from './GeneratedPlanSummary';
import NutritionProfileConfigSection from './NutritionProfileConfigSection';
import DeterministicPlanSection from './DeterministicPlanSection';

// ARCH-001 residual: sin base URL hardcodeada; usa getApiBaseUrl() (respeta VITE_API_URL/origen).
const API_URL = getApiBaseUrl();

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
  const [freshUserData, setFreshUserData] = useState(null);
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
  const [showActivityHelp, setShowActivityHelp] = useState(false);
  const [nutritionOverridesProfile, setNutritionOverridesProfile] = useState(false);
  const [confirmedLowMealCount, setConfirmedLowMealCount] = useState(null);
  const [mealCountWarning, setMealCountWarning] = useState({
    open: false,
    nextValue: null,
    source: null
  });
  const trainingPlanInfo = useTrainingPlanInfo();

  const effectiveUserData = freshUserData || userData;

  const userObjective = effectiveUserData?.objetivo_principal
    ? GOAL_FROM_USER[effectiveUserData.objetivo_principal] || null
    : null;
  const userActivity = effectiveUserData?.nivel_actividad
    ? ACTIVITY_FROM_USER[effectiveUserData.nivel_actividad] || null
    : null;
  const rawUserMeals = effectiveUserData?.comidas_por_dia ?? effectiveUserData?.comidas_diarias;
  const userMeals = rawUserMeals
    ? Number(rawUserMeals)
    : null;

  useEffect(() => {
    let isMounted = true;

    const refreshUserSnapshot = async () => {
      try {
        const latestProfile = await refreshProfile?.();
        if (isMounted && latestProfile) {
          setFreshUserData(latestProfile);
        }
      } catch (error) {
        console.warn('No se pudo refrescar el perfil antes de cargar nutricion:', error);
      }
    };

    void refreshUserSnapshot();

    return () => {
      isMounted = false;
    };
  }, [refreshProfile]);

  const loadProfileFromUserData = async () => {
    const nextProfile = buildProfileStateFromUser(
      profileData,
      userObjective,
      userActivity,
      userMeals,
      effectiveUserData
    );
    setProfileData(nextProfile);
    setConfirmedLowMealCount(null);
    await handleSaveProfile(nextProfile, false);
  };

  const applyMealCountSelection = (count, { confirmed = false } = {}) => {
    setProfileData((prev) => ({ ...prev, comidas_dia: count }));
    if (LOW_MEAL_COUNTS.has(Number(count)) && confirmed) {
      setConfirmedLowMealCount(Number(count));
      return;
    }
    if (!LOW_MEAL_COUNTS.has(Number(count))) {
      setConfirmedLowMealCount(null);
    }
  };

  const requestMealCountSelection = (count) => {
    if (!LOW_MEAL_COUNTS.has(Number(count))) {
      applyMealCountSelection(count);
      return;
    }

    if (Number(profileData.comidas_dia) === Number(count) && confirmedLowMealCount === Number(count)) {
      applyMealCountSelection(count, { confirmed: true });
      return;
    }

    setMealCountWarning({
      open: true,
      nextValue: Number(count),
      source: 'selection'
    });
  };

  const closeMealCountWarning = () => {
    setMealCountWarning({
      open: false,
      nextValue: null,
      source: null
    });
  };

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
    let isMounted = true;

    const loadProfile = async () => {
      try {
        setProfileLoading(true);
        setProfileLoadError(null);

        if (!tokenManager.getToken()) {
          throw new Error('No se encontro un token de autenticacion');
        }

        const result = await getNutritionProfile();
        if (!isMounted) return;

        if (result.status === 404) {
          setProfileData(buildProfileStateFromUser(DEFAULT_PROFILE, userObjective, userActivity, userMeals));
          return;
        }

        if (!result.ok) {
          throw new Error('No se pudo cargar el perfil nutricional');
        }

        const data = result.data;
        const isOverridden = Boolean(data.nutrition_overrides_profile);
        setNutritionOverridesProfile(isOverridden);

        // Si no tiene override, auto-sincronizar objetivo/actividad/comidas desde perfil general
        const syncedObjetivo = (!isOverridden && userObjective) ? userObjective : (data.objetivo || DEFAULT_PROFILE.objetivo);
        const syncedActividad = (!isOverridden && userActivity) ? userActivity : (data.actividad || DEFAULT_PROFILE.actividad);
        const syncedComidas = (!isOverridden && userMeals) ? userMeals : (data.comidas_dia || DEFAULT_PROFILE.comidas_dia);

        setProfileData(
          buildProfileStateFromApi(
            {
              ...data,
              objetivo: syncedObjetivo,
              actividad: syncedActividad,
              comidas_dia: syncedComidas
            },
            buildProfileStateFromUser(DEFAULT_PROFILE, userObjective, userActivity, userMeals)
          )
        );
      } catch (error) {
        if (isMounted) {
          setProfileLoadError(error.message);
          setProfileData(buildProfileStateFromUser(DEFAULT_PROFILE, userObjective, userActivity, userMeals));
        }
      } finally {
        if (isMounted) setProfileLoading(false);
      }
    };

    loadProfile();

    return () => {
      isMounted = false;
    };
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

  const isEventLikePayload = (value) => {
    if (!value || typeof value !== "object") return false;
    return typeof value.preventDefault === "function" || Object.prototype.hasOwnProperty.call(value, "nativeEvent");
  };

  const handleSaveProfile = async (overrideData, overrideSyncState = null) => {
    setProfileSaving(true);
    setProfileSaveError(null);
    setProfileSuccess(null);
    const safeOverride = isEventLikePayload(overrideData) ? null : overrideData;
    const dataToSave = safeOverride || profileData;
    const resolvedOverride = typeof overrideSyncState === "boolean"
      ? overrideSyncState
      : nutritionOverridesProfile;
    let wasSaved = false;

    try {
      const token = tokenManager.getToken() || tokenManager.getToken();
      if (!token) {
        throw new Error('No se encontro un token de autenticacion');
      }

      const response = await fetch(`${API_URL}/api/nutrition-v2/profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ ...dataToSave, nutrition_overrides_profile: resolvedOverride })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'No se pudo guardar el perfil nutricional');
      }

      const data = await response.json();
      invalidateNutritionProfile();
      setProfileData((prev) => buildProfileStateFromApi(data.profile || data, prev));
      setNutritionOverridesProfile(
        Boolean((data.profile || data)?.nutrition_overrides_profile ?? resolvedOverride)
      );
      setEstimaciones(data.estimaciones || null);
      setProfileSuccess('Perfil nutricional guardado correctamente');
      wasSaved = true;

      const syncUpdates = {};
      const mappedGoal = GOAL_TO_USER[dataToSave.objetivo];
      const mappedActivity = ACTIVITY_TO_USER[dataToSave.actividad];
      const mappedMeals = Number(dataToSave.comidas_dia);

      if (mappedGoal && mappedGoal !== effectiveUserData?.objetivo_principal) {
        syncUpdates.objetivo_principal = mappedGoal;
      }
      if (mappedActivity && mappedActivity !== effectiveUserData?.nivel_actividad) {
        syncUpdates.nivel_actividad = mappedActivity;
      }
      if (
        mappedMeals &&
        !Number.isNaN(mappedMeals) &&
        mappedMeals > 0 &&
        mappedMeals !== Number(effectiveUserData?.comidas_por_dia ?? effectiveUserData?.comidas_diarias)
      ) {
        syncUpdates.comidas_por_dia = mappedMeals;
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

  const continueGeneratePlan = async () => {
    setPlanLoading(true);
    setPlanError(null);
    setPlanSuccess(false);

    try {
      const token = tokenManager.getToken() || tokenManager.getToken();
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
        body: JSON.stringify({ ...profileData, nutrition_overrides_profile: nutritionOverridesProfile })
      });

      if (!profileUpsert.ok) {
        const errorData = await profileUpsert.json().catch(() => ({}));
        throw new Error(errorData.error || 'Debes guardar primero tu configuracion nutricional');
      }

      const profilePayload = await profileUpsert.json().catch(() => null);
      invalidateNutritionProfile();
      if (profilePayload?.estimaciones) {
        setEstimaciones(profilePayload.estimaciones);
      }
      if (profilePayload?.profile) {
        setProfileData((prev) => buildProfileStateFromApi(profilePayload.profile, prev));
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
      invalidateActiveNutritionPlan();
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

  const handleGeneratePlan = async () => {
    const selectedMeals = Number(profileData.comidas_dia);
    if (
      LOW_MEAL_COUNTS.has(selectedMeals) &&
      confirmedLowMealCount !== selectedMeals
    ) {
      setMealCountWarning({
        open: true,
        nextValue: selectedMeals,
        source: 'generate'
      });
      return;
    }

    await continueGeneratePlan();
  };

  const handleMealCountWarningConfirm = async () => {
    const nextValue = Number(mealCountWarning.nextValue);
    if (!LOW_MEAL_COUNTS.has(nextValue)) {
      closeMealCountWarning();
      return;
    }

    setConfirmedLowMealCount(nextValue);

    if (mealCountWarning.source === 'selection') {
      applyMealCountSelection(nextValue, { confirmed: true });
      closeMealCountWarning();
      return;
    }

    closeMealCountWarning();
    await continueGeneratePlan();
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

  const handleMetabolicResult = (result) => {
    const metabolicState = { ...result };
    delete metabolicState.macros;
    setProfileData((prev) => ({
      ...prev,
      ...metabolicState
    }));
    setProfileSaveError(null);
    setProfileSuccess('Reparto de macros actualizado. Afecta solo a la distribucion, no a las calorias totales.');
  };

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

      <NutritionProfileConfigSection
        profileData={profileData}
        setProfileData={setProfileData}
        profileLoading={profileLoading}
        profileSaving={profileSaving}
        profileLoadError={profileLoadError}
        profileSaveError={profileSaveError}
        profileSuccess={profileSuccess}
        nutritionOverridesProfile={nutritionOverridesProfile}
        setNutritionOverridesProfile={setNutritionOverridesProfile}
        loadProfileFromUserData={loadProfileFromUserData}
        showActivityHelp={showActivityHelp}
        setShowActivityHelp={setShowActivityHelp}
        requestMealCountSelection={requestMealCountSelection}
        handleMetabolicResult={handleMetabolicResult}
        handlePreferenceToggle={handlePreferenceToggle}
        alergiaInput={alergiaInput}
        setAlergiaInput={setAlergiaInput}
        addAlergia={addAlergia}
        removeAlergia={removeAlergia}
        handleSaveProfile={handleSaveProfile}
        estimaciones={estimaciones}
      />

      <DeterministicPlanSection
        planError={planError}
        planSuccess={planSuccess}
        planLoading={planLoading}
        trainingPlanInfo={trainingPlanInfo}
        config={config}
        setConfig={setConfig}
        isTrainingLinked={isTrainingLinked}
        isDailySchedule={isDailySchedule}
        previewSchedule={previewSchedule}
        trainingDaysCount={trainingDaysCount}
        restDaysCount={restDaysCount}
        trainingScheduleTitle={trainingScheduleTitle}
        scheduleHelperText={scheduleHelperText}
        setPreset={setPreset}
        toggleTrainingDay={toggleTrainingDay}
        handleGeneratePlan={handleGeneratePlan}
        mealCountWarning={mealCountWarning}
        closeMealCountWarning={closeMealCountWarning}
        handleMealCountWarningConfirm={handleMealCountWarningConfirm}
      />

        <GeneratedPlanSummary plan={generatedPlan} />
    </div>
  );
}
