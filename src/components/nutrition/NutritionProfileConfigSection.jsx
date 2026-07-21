// Seccion presentacional "Configuracion nutricional".
// Extraida de NutritionPlanGenerator.jsx (ARCH-002) sin cambios de comportamiento.
import {
  Activity,
  AlertCircle,
  Brain,
  CheckCircle2,
  Loader2,
  Settings,
  Target,
  Utensils
} from 'lucide-react';
import MetabolicQuestionnaire from './MetabolicQuestionnaire';
import NutritionEstimationCards from './NutritionEstimationCards';
import {
  ACTIVITY_HELP,
  ACTIVITY_OPTIONS,
  OBJECTIVE_OPTIONS,
  PREFERENCE_KEYS
} from './nutritionPlanConfig';
import { getMetabolicProfileMeta, normalizeActivityValue } from './nutritionPlanHelpers';

export default function NutritionProfileConfigSection({
  profileData,
  setProfileData,
  profileLoading,
  profileSaving,
  profileLoadError,
  profileSaveError,
  profileSuccess,
  nutritionOverridesProfile,
  setNutritionOverridesProfile,
  loadProfileFromUserData,
  showActivityHelp,
  setShowActivityHelp,
  requestMealCountSelection,
  handleMetabolicResult,
  handlePreferenceToggle,
  alergiaInput,
  setAlergiaInput,
  addAlergia,
  removeAlergia,
  handleSaveProfile,
  estimaciones
}) {
  const metabolicProfileMeta = getMetabolicProfileMeta(profileData.metabolic_type);

  return (
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

        {!nutritionOverridesProfile ? (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>Sincronizado con perfil general</span>
            <button
              type="button"
              onClick={() => {
                setNutritionOverridesProfile(true);
              }}
              className="ml-auto text-emerald-300/80 hover:text-emerald-200 underline"
            >
              Personalizar solo para nutricion
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 text-xs text-yellow-200">
            <Settings className="w-4 h-4 text-yellow-400" />
            <span>No sincronizado con perfil general</span>
            <button
              type="button"
              onClick={() => {
                setNutritionOverridesProfile(false);
                void loadProfileFromUserData();
              }}
              className="ml-auto text-yellow-300/80 hover:text-yellow-200 underline"
            >
              Volver a sincronizar con perfil general
            </button>
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
                  <div key={key} className="rounded-lg border border-white/10 bg-black/10 px-3 py-2 space-y-1">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                      <span className="font-semibold text-yellow-200">{info.label}</span>
                      <span className="text-gray-300">{info.short}</span>
                    </div>
                    <p className="text-gray-400">{info.detail}</p>
                  </div>
                ))}
                <p className="text-gray-400">
                  Elige por tu movimiento total del dia: trabajo, entrenos y pasos. Si dudas entre dos, empieza por la mas baja.
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
              {[1, 2, 3, 4, 5, 6].map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => requestMealCountSelection(count)}
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
            <p className="mt-2 text-xs text-gray-500">
              Puedes usar 1 o 2 comidas si te encaja mejor, pero te pediremos confirmación antes de aplicarlo o generar el plan.
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-yellow-400" />
              <h4 className="text-white font-semibold">Reparto de macros</h4>
            </div>
            <p className="text-sm text-gray-400">
              Cuestionario opcional para afinar como repartimos proteinas, carbos y grasas. No cambia tus calorias totales.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="bg-white/5 border border-white/10 rounded-lg p-4 md:col-span-2">
                <p className="text-xs uppercase tracking-wide text-gray-400 mb-2">Perfil aplicado</p>
                <p className="text-lg font-semibold text-white">{metabolicProfileMeta.label}</p>
                <p className="text-sm text-gray-400 mt-1">{metabolicProfileMeta.description}</p>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                <p className="text-xs uppercase tracking-wide text-gray-400 mb-2">Confianza</p>
                <p className="text-lg font-semibold text-white">{profileData.metabolic_confidence || 'Pendiente'}</p>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                <p className="text-xs uppercase tracking-wide text-gray-400 mb-2">Score / pendiente</p>
                <p className="text-lg font-semibold text-white">{profileData.metabolic_score ?? '—'}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {profileData.metabolic_pending_type
                    ? `${getMetabolicProfileMeta(profileData.metabolic_pending_type).label} (${profileData.metabolic_pending_count}/2)`
                    : 'Sin cambios pendientes'}
                </p>
              </div>
            </div>

            <MetabolicQuestionnaire
              onResult={handleMetabolicResult}
              objective={profileData.objetivo}
            />
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
            onClick={() => {
              handleSaveProfile();
            }}
            className="flex items-center gap-2 px-5 py-3 bg-yellow-400 text-gray-900 font-semibold rounded-lg hover:bg-yellow-500 transition-colors disabled:opacity-60"
            disabled={profileLoading || profileSaving}
          >
            {profileSaving && <Loader2 className="w-4 h-4 animate-spin" />}
            Guardar configuracion
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

        {estimaciones && <NutritionEstimationCards estimaciones={estimaciones} />}
      </section>
  );
}
