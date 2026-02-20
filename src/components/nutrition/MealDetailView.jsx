import { useEffect, useMemo, useState } from "react";
import { X, Utensils, Clock, Dumbbell, Moon, TrendingUp, Sparkles, Loader2 } from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3010";
const ESTADOS_PESADO = ["crudo", "cocido", "escurrido", "seco", "tal_cual"];
const MENU_GENERATION_MODE_LABELS = {
  hybrid_ai: "IA híbrida",
  recipe_examples: "Recetas",
  deterministic: "Determinista",
  ai: "IA clásico"
};

const MEAL_ICONS = {
  1: "🌅",
  2: "🥪",
  3: "🍽️",
  4: "🍎",
  5: "🌙",
  6: "🥛"
};

function parseJsonObject(value, fallback = {}) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      return fallback;
    }
  }

  return fallback;
}

function parseNumeric(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace(",", "."));
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function normalizeEstado(value) {
  if (!value) return "tal_cual";
  const normalized = String(value).trim().toLowerCase().replace(/[\s-]+/g, "_");
  const aliases = { talcual: "tal_cual" };
  const resolved = aliases[normalized] || normalized;
  return ESTADOS_PESADO.includes(resolved) ? resolved : "tal_cual";
}

function normalizeGroupFactor(value) {
  if (!value) return null;
  return String(value).trim().toLowerCase();
}

function formatGrams(value) {
  const grams = parseNumeric(value) ?? 0;
  return `${new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1
  }).format(grams)} g`;
}

function getAuthToken() {
  return localStorage.getItem("token") || localStorage.getItem("authToken");
}

async function fetchJsonWithAuth(url, options = {}) {
  const token = getAuthToken();
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`
    }
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const codePrefix = payload?.code ? `${payload.code}: ` : "";
    throw new Error(`${codePrefix}${payload?.error || payload?.message || "Error en la solicitud"}`);
  }

  return payload;
}

function buildFactorKey(groupFactor, estadoBase, estadoObjetivo) {
  return `${groupFactor}|${estadoBase}|${estadoObjetivo}`;
}

function resolveItemInitialEstado(item) {
  return normalizeEstado(item.estado_pesado_mostrado || item.estado_pesado_base);
}

function getAvailableEstadosForItem(item, targetStatesByGroupAndBase) {
  const estadoBase = normalizeEstado(item.estado_pesado_base);
  const estadoMostrado = resolveItemInitialEstado(item);
  const grupoFactor = normalizeGroupFactor(item.food_grupo_factor);

  const states = new Set([estadoBase, estadoMostrado]);
  if (!grupoFactor || estadoBase === "tal_cual") {
    return ESTADOS_PESADO.filter((estado) => states.has(estado));
  }

  const targets = targetStatesByGroupAndBase.get(`${grupoFactor}|${estadoBase}`);
  if (targets) {
    targets.forEach((estado) => states.add(estado));
  }

  return ESTADOS_PESADO.filter((estado) => states.has(estado));
}

function calculateDisplayedItemData({ item, selectedEstado, factorByKey }) {
  const estadoBase = normalizeEstado(item.estado_pesado_base);
  const estadoElegido = normalizeEstado(selectedEstado || estadoBase);
  const grupoFactor = normalizeGroupFactor(item.food_grupo_factor);

  const cantidadBaseRaw = parseNumeric(item.cantidad_g_base);
  const cantidadDefaultRaw = parseNumeric(item.cantidad_g_mostrada ?? item.cantidad_g);
  const cantidadBase = cantidadBaseRaw != null ? cantidadBaseRaw : (cantidadDefaultRaw ?? 0);
  const cantidadDefault = cantidadDefaultRaw != null ? cantidadDefaultRaw : cantidadBase;

  if (estadoElegido === estadoBase) {
    return {
      gramosMostrados: cantidadBase,
      estadoBase,
      estadoElegido,
      factorAplicado: null,
      blocked: false,
      blockedReason: null
    };
  }

  if (estadoBase === "tal_cual") {
    return {
      gramosMostrados: cantidadDefault,
      estadoBase,
      estadoElegido,
      factorAplicado: null,
      blocked: true,
      blockedReason: "Sin conversion (tal_cual)"
    };
  }

  if (!grupoFactor) {
    return {
      gramosMostrados: cantidadDefault,
      estadoBase,
      estadoElegido,
      factorAplicado: null,
      blocked: true,
      blockedReason: "Sin conversion (sin grupo_factor)"
    };
  }

  const factor = factorByKey.get(buildFactorKey(grupoFactor, estadoBase, estadoElegido));
  if (!factor) {
    return {
      gramosMostrados: cantidadDefault,
      estadoBase,
      estadoElegido,
      factorAplicado: null,
      blocked: true,
      blockedReason: "Sin conversion"
    };
  }

  return {
    gramosMostrados: cantidadBase * factor,
    estadoBase,
    estadoElegido,
    factorAplicado: factor,
    blocked: false,
    blockedReason: null
  };
}

function toUserFriendlySwapError(message) {
  const raw = String(message || "").trim();
  const normalized = raw.toLowerCase();

  if (normalized.includes("swap_not_feasible")) {
    return "No hemos podido ajustar esta comida de forma coherente con ese cambio. Prueba otro alimento.";
  }
  if (normalized.includes("tal_cual_no_convertible")) {
    return "Este alimento se mide tal como se consume. Se debe usar ese formato de cantidad.";
  }
  if (normalized.includes("missing_group_factor")) {
    return "No hay regla de conversión para este alimento. Prueba con otro reemplazo.";
  }
  if (normalized.includes("missing_conversion_factor")) {
    return "No existe una conversión para ese estado en este alimento.";
  }
  if (normalized.includes("conversión bloqueada")) {
    return "No se puede aplicar ese estado de pesado para este alimento.";
  }

  return raw;
}

export default function MealDetailView({
  day,
  planInfo,
  onClose,
  menusEnabled = false,
  menuGenerationMode = "recipe_examples",
  isGeneratingMenus = false,
  onGenerateDayMenus = null,
  onRefreshDay = null
}) {
  const [dayState, setDayState] = useState(day);
  const [conversionFactors, setConversionFactors] = useState([]);
  const [factorsLoading, setFactorsLoading] = useState(false);
  const [factorsError, setFactorsError] = useState(null);
  const [selectedEstadoByItem, setSelectedEstadoByItem] = useState({});
  const [swapOpenByItem, setSwapOpenByItem] = useState({});
  const [swapCandidatesByItem, setSwapCandidatesByItem] = useState({});
  const [swapSelectedFoodIdByItem, setSwapSelectedFoodIdByItem] = useState({});
  const [swapLoadingByItem, setSwapLoadingByItem] = useState({});
  const [swapApplyingByItem, setSwapApplyingByItem] = useState({});
  const [swapMessageByItem, setSwapMessageByItem] = useState({});
  const [swapErrorByItem, setSwapErrorByItem] = useState({});
  const [refreshingDay, setRefreshingDay] = useState(false);

  useEffect(() => {
    setDayState(day);
    setSwapOpenByItem({});
    setSwapCandidatesByItem({});
    setSwapSelectedFoodIdByItem({});
    setSwapLoadingByItem({});
    setSwapApplyingByItem({});
    setSwapMessageByItem({});
    setSwapErrorByItem({});
  }, [day]);

  const dayMeals = useMemo(() => dayState?.meals || [], [dayState?.meals]);
  const isTraining = dayState?.tipo_dia === "entreno";
  const totalKcal = parseNumeric(dayState?.kcal) ?? 0;
  const proteinKcal = (parseNumeric(dayState?.macros?.protein_g) ?? 0) * 4;
  const carbsKcal = (parseNumeric(dayState?.macros?.carbs_g) ?? 0) * 4;
  const fatKcal = (parseNumeric(dayState?.macros?.fat_g) ?? 0) * 9;

  const proteinPercent = totalKcal > 0 ? ((proteinKcal / totalKcal) * 100).toFixed(0) : "0";
  const carbsPercent = totalKcal > 0 ? ((carbsKcal / totalKcal) * 100).toFixed(0) : "0";
  const fatPercent = totalKcal > 0 ? ((fatKcal / totalKcal) * 100).toFixed(0) : "0";
  const menuGenerationModeLabel = MENU_GENERATION_MODE_LABELS[menuGenerationMode] || menuGenerationMode;

  useEffect(() => {
    const initialStateMap = {};
    dayMeals.forEach((meal) => {
      (meal.items || []).forEach((item, index) => {
        const itemKey = item.id || `${meal.id || meal.orden}-${index}`;
        initialStateMap[itemKey] = resolveItemInitialEstado(item);
      });
    });
    setSelectedEstadoByItem(initialStateMap);
  }, [dayState?.day_id, dayState?.day_index, dayMeals]);

  useEffect(() => {
    let isMounted = true;

    const loadFactors = async () => {
      setFactorsLoading(true);
      setFactorsError(null);
      try {
        const payload = await fetchJsonWithAuth(`${API_URL}/api/nutrition-v2/food-conversion-factors`);
        if (isMounted) {
          setConversionFactors(Array.isArray(payload.factors) ? payload.factors : []);
        }
      } catch (error) {
        if (isMounted) {
          setFactorsError(error.message);
        }
      } finally {
        if (isMounted) {
          setFactorsLoading(false);
        }
      }
    };

    loadFactors();
    return () => {
      isMounted = false;
    };
  }, []);

  const { factorByKey, targetStatesByGroupAndBase } = useMemo(() => {
    const factorMap = new Map();
    const targetMap = new Map();

    conversionFactors.forEach((factor) => {
      const groupFactor = normalizeGroupFactor(factor.grupo_factor);
      const estadoBase = normalizeEstado(factor.estado_base);
      const estadoObjetivo = normalizeEstado(factor.estado_objetivo);
      const factorValue = parseNumeric(factor.factor_base_objetivo);

      if (!groupFactor || factorValue == null) {
        return;
      }

      factorMap.set(buildFactorKey(groupFactor, estadoBase, estadoObjetivo), factorValue);

      const baseKey = `${groupFactor}|${estadoBase}`;
      if (!targetMap.has(baseKey)) {
        targetMap.set(baseKey, new Set());
      }
      targetMap.get(baseKey).add(estadoObjetivo);
    });

    return {
      factorByKey: factorMap,
      targetStatesByGroupAndBase: targetMap
    };
  }, [conversionFactors]);

  const totalMealItems = useMemo(() => {
    return dayMeals.reduce((count, meal) => count + ((meal.items || []).length), 0);
  }, [dayMeals]);

  const loadActivePlanDay = async (dayId) => {
    const payload = await fetchJsonWithAuth(`${API_URL}/api/nutrition-v2/active-plan`);
    const days = Array.isArray(payload?.days) ? payload.days : [];
    return days.find((entry) => String(entry.day_id) === String(dayId)) || null;
  };

  const loadSwapCandidates = async ({ itemKey, item }) => {
    if (!item?.id) {
      setSwapErrorByItem((previous) => ({
        ...previous,
        [itemKey]: "El item no está persistido todavía. Genera y guarda el menú primero."
      }));
      return;
    }

    setSwapLoadingByItem((previous) => ({ ...previous, [itemKey]: true }));
    setSwapErrorByItem((previous) => ({ ...previous, [itemKey]: null }));
    setSwapMessageByItem((previous) => ({ ...previous, [itemKey]: null }));

    try {
      const params = new URLSearchParams({
        page_size: "200",
        compatible_with_item_id: String(item.id)
      });

      const payload = await fetchJsonWithAuth(`${API_URL}/api/nutrition-v2/foods?${params.toString()}`);
      const candidates = Array.isArray(payload?.foods) ? payload.foods : [];
      const currentFoodId = String(item.food_id || "").trim();
      const filtered = candidates.filter((food) => String(food.id || "") !== currentFoodId);

      setSwapCandidatesByItem((previous) => ({ ...previous, [itemKey]: filtered }));
      setSwapSelectedFoodIdByItem((previous) => ({
        ...previous,
        [itemKey]: filtered[0]?.id || ""
      }));
      setSwapMessageByItem((previous) => ({
        ...previous,
        [itemKey]: filtered.length > 0 ? `${filtered.length} opción(es) compatibles` : "Sin opciones compatibles"
      }));
    } catch (error) {
      setSwapErrorByItem((previous) => ({ ...previous, [itemKey]: toUserFriendlySwapError(error.message) }));
    } finally {
      setSwapLoadingByItem((previous) => ({ ...previous, [itemKey]: false }));
    }
  };

  const applyFoodSwap = async ({ itemKey, meal, item, selectedEstado }) => {
    if (!meal?.id || !item?.id) {
      setSwapErrorByItem((previous) => ({
        ...previous,
        [itemKey]: "El item no está persistido todavía. Genera y guarda el menú primero."
      }));
      return;
    }

    const replacementFoodId = String(swapSelectedFoodIdByItem[itemKey] || "").trim();
    if (!replacementFoodId) {
      setSwapErrorByItem((previous) => ({ ...previous, [itemKey]: "Selecciona un alimento para sustituir" }));
      return;
    }

    setSwapApplyingByItem((previous) => ({ ...previous, [itemKey]: true }));
    setSwapErrorByItem((previous) => ({ ...previous, [itemKey]: null }));
    setSwapMessageByItem((previous) => ({ ...previous, [itemKey]: null }));

    try {
      const payload = await fetchJsonWithAuth(
        `${API_URL}/api/nutrition-v2/meals/${meal.id}/items/${item.id}/swap-food`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            replacement_food_id: replacementFoodId,
            estado_pesado_mostrado: selectedEstado
          })
        }
      );

      setRefreshingDay(true);
      let refreshedDay = null;
      if (typeof onRefreshDay === "function") {
        refreshedDay = await onRefreshDay(dayState?.day_id);
      }
      if (!refreshedDay && dayState?.day_id) {
        refreshedDay = await loadActivePlanDay(dayState.day_id);
      }
      if (refreshedDay) {
        setDayState(refreshedDay);
      }

      const warnings = Array.isArray(payload?.swap_warnings) ? payload.swap_warnings : [];
      const targetAdjustmentMessage = payload?.updated_item?.state_adjustment?.message || null;
      const warningMessage = targetAdjustmentMessage || warnings[0]?.message || null;
      const successMessage = warningMessage
        ? `Sustitución aplicada. ${warningMessage}`
        : "Sustitución aplicada y comida recalculada";

      setSwapMessageByItem((previous) => ({ ...previous, [itemKey]: successMessage }));
      setSwapOpenByItem((previous) => ({ ...previous, [itemKey]: false }));
      setSwapCandidatesByItem((previous) => ({ ...previous, [itemKey]: [] }));
      setSwapSelectedFoodIdByItem((previous) => ({ ...previous, [itemKey]: "" }));
    } catch (error) {
      setSwapErrorByItem((previous) => ({ ...previous, [itemKey]: toUserFriendlySwapError(error.message) }));
    } finally {
      setRefreshingDay(false);
      setSwapApplyingByItem((previous) => ({ ...previous, [itemKey]: false }));
    }
  };

  if (!dayState) return null;

  return (
    <div className="meal-detail-scroll fixed inset-0 bg-black/95 z-[80] flex items-start justify-center px-3 sm:px-4 pt-[calc(env(safe-area-inset-top)+5.75rem)] sm:pt-[calc(env(safe-area-inset-top)+6.25rem)] pb-[calc(env(safe-area-inset-bottom)+5.5rem)] sm:pb-[calc(env(safe-area-inset-bottom)+5.75rem)] overflow-y-auto">
      <div className="meal-detail-scroll bg-gradient-to-b from-[#1b2130]/95 via-[#141b2a]/95 to-[#0d121d]/95 border border-white/10 ring-1 ring-white/5 shadow-[0_45px_120px_-60px_rgba(0,0,0,0.95)] backdrop-blur-xl rounded-2xl max-w-5xl w-full max-h-[calc(100vh-12rem)] sm:max-h-[calc(100vh-12rem)] overflow-y-auto">
        <div className="sticky top-0 z-20 bg-gradient-to-r from-[#1b202c]/95 to-[#141925]/95 backdrop-blur-xl border-b border-white/10 p-5 sm:p-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold font-urbanist text-white tracking-tight mb-1">
              Día {dayState.day_index + 1} - {isTraining ? "Entrenamiento" : "Descanso"}
            </h2>
            <p className="text-gray-300/80 text-sm">
              {planInfo.plan_name} • {planInfo.training_type}
            </p>
          </div>

          <button
            onClick={onClose}
            className="group inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/80 hover:text-white hover:border-yellow-300/45 hover:bg-yellow-400/10 transition-all duration-200 shadow-[0_16px_30px_-22px_rgba(0,0,0,0.9)]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 border-b border-white/10">
          <div className="flex items-center gap-3 mb-4">
            {isTraining ? (
              <>
                <Dumbbell className="w-6 h-6 text-green-400" />
                <span className="text-green-400 font-semibold">Día de Entrenamiento</span>
              </>
            ) : (
              <>
                <Moon className="w-6 h-6 text-blue-400" />
                <span className="text-blue-400 font-semibold">Día de Descanso</span>
              </>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="bg-white/5 border border-white/10 rounded-lg p-4 text-center border-l-2 border-l-emerald-400/40">
              <div className="text-gray-400 text-sm mb-1">Calorías</div>
              <div className="text-3xl font-bold text-emerald-300">{dayState.kcal}</div>
              <div className="text-gray-500 text-xs">kcal</div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-lg p-4 text-center border-l-2 border-l-red-400/40">
              <div className="text-gray-400 text-sm mb-1">Proteína</div>
              <div className="text-3xl font-bold text-red-300">{dayState.macros.protein_g}</div>
              <div className="text-gray-500 text-xs">g ({proteinPercent}%)</div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-lg p-4 text-center border-l-2 border-l-yellow-400/40">
              <div className="text-gray-400 text-sm mb-1">Carbohidratos</div>
              <div className="text-3xl font-bold text-yellow-300">{dayState.macros.carbs_g}</div>
              <div className="text-gray-500 text-xs">g ({carbsPercent}%)</div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-lg p-4 text-center border-l-2 border-l-sky-400/40">
              <div className="text-gray-400 text-sm mb-1">Grasas</div>
              <div className="text-3xl font-bold text-sky-300">{dayState.macros.fat_g}</div>
              <div className="text-gray-500 text-xs">g ({fatPercent}%)</div>
            </div>
          </div>

          <div className="relative h-8 bg-white/10 rounded-full overflow-hidden">
            <div
              className="absolute h-full bg-red-500 flex items-center justify-center text-white text-xs font-semibold"
              style={{ width: `${proteinPercent}%` }}
            >
              {proteinPercent > 15 && `P ${proteinPercent}%`}
            </div>
            <div
              className="absolute h-full bg-yellow-500 flex items-center justify-center text-white text-xs font-semibold"
              style={{
                left: `${proteinPercent}%`,
                width: `${carbsPercent}%`
              }}
            >
              {carbsPercent > 15 && `C ${carbsPercent}%`}
            </div>
            <div
              className="absolute h-full bg-blue-500 flex items-center justify-center text-white text-xs font-semibold"
              style={{
                left: `${Number(proteinPercent) + Number(carbsPercent)}%`,
                width: `${fatPercent}%`
              }}
            >
              {fatPercent > 15 && `G ${fatPercent}%`}
            </div>
          </div>

          {isTraining ? (
            <div className="mt-4 p-3 bg-green-500/10 border border-green-500 rounded-lg">
              <p className="text-green-400 text-sm">
                <TrendingUp className="w-4 h-4 inline mr-1" />
                <strong>Carb Cycling:</strong> +10% carbohidratos por día de entreno.
              </p>
            </div>
          ) : (
            <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500 rounded-lg">
              <p className="text-blue-400 text-sm">
                <TrendingUp className="w-4 h-4 inline mr-1" />
                <strong>Carb Cycling:</strong> -15% carbohidratos en día de descanso.
              </p>
            </div>
          )}
        </div>

        <div className="p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-3">
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <Utensils className="w-5 h-5 text-yellow-400" />
              Comidas del Día ({dayState.meals?.length || 0})
            </h3>

            {menusEnabled && (
              <button
                type="button"
                onClick={onGenerateDayMenus}
                disabled={!onGenerateDayMenus || isGeneratingMenus}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-yellow-300/35 bg-gradient-to-r from-yellow-400/15 to-amber-400/10 text-sm font-medium text-yellow-100 hover:from-yellow-400/20 hover:to-amber-400/15 hover:border-yellow-300/55 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200"
              >
                {isGeneratingMenus ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4 text-yellow-300" />
                )}
                {isGeneratingMenus ? "Generando menus..." : `Generar menús (${menuGenerationModeLabel})`}
              </button>
            )}
          </div>

          <div className="text-xs text-gray-400 mb-4">
            {factorsLoading && "Cargando factores de conversion..."}
            {!factorsLoading && !factorsError && `${conversionFactors.length} factores de conversion disponibles`}
            {!factorsLoading && factorsError && `No se pudieron cargar factores: ${factorsError}`}
            <span className="ml-2 text-gray-500">• Items guardados: {totalMealItems}</span>
            {refreshingDay && <span className="ml-2 text-emerald-300">• Actualizando día...</span>}
          </div>

          {!dayState.meals || dayState.meals.length === 0 ? (
            <div className="text-center p-8 bg-white/5 border border-white/10 rounded-lg">
              <p className="text-gray-400">No hay comidas para este día.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {dayState.meals.map((meal) => {
                const mealItems = Array.isArray(meal.items) ? meal.items : [];
                const generationMetadata = meal.generation_metadata || null;
                const recipeName = generationMetadata?.recipe_name || null;
                const templateName = generationMetadata?.template_name || null;
                return (
                  <div
                    key={meal.id || meal.orden}
                    className="bg-white/5 border border-white/10 rounded-xl p-5 hover:border-white/20 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <span className="text-3xl">{MEAL_ICONS[meal.orden] || "🍴"}</span>
                        <div>
                          <h4 className="text-lg font-semibold text-white">{meal.nombre}</h4>
                          {recipeName && (
                            <div className="text-xs text-emerald-300">
                              Receta: {recipeName}
                            </div>
                          )}
                          {!recipeName && templateName && (
                            <div className="text-xs text-sky-300">
                              Plantilla: {templateName}
                            </div>
                          )}
                          {meal.hora_sugerida && (
                            <div className="flex items-center gap-1 text-gray-400 text-sm">
                              <Clock className="w-3 h-3" />
                              {meal.hora_sugerida}
                            </div>
                          )}
                        </div>
                      </div>

                      {meal.timing_note && (
                        <span className="px-3 py-1 bg-yellow-400/20 text-yellow-400 rounded-full text-xs font-medium">
                          {meal.timing_note}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-4 gap-3">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-green-400">{meal.kcal}</div>
                        <div className="text-gray-500 text-xs">kcal</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xl font-bold text-red-400">{meal.macros.protein_g}g</div>
                        <div className="text-gray-500 text-xs">proteína</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xl font-bold text-yellow-400">{meal.macros.carbs_g}g</div>
                        <div className="text-gray-500 text-xs">carbos</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xl font-bold text-blue-400">{meal.macros.fat_g}g</div>
                        <div className="text-gray-500 text-xs">grasas</div>
                      </div>
                    </div>

                    <div className="mt-4 pt-4 border-t border-white/10">
                      {mealItems.length === 0 ? (
                        <p className="text-gray-500 text-sm italic">
                          Menu específico pendiente de generación.
                        </p>
                      ) : (
                        <div className="space-y-3">
                          <div className="text-sm text-gray-300 font-semibold">
                            Alimentos ({mealItems.length})
                          </div>

                          {mealItems.map((item, itemIndex) => {
                            const itemKey = item.id || `${meal.id || meal.orden}-${itemIndex}`;
                            const availableEstados = getAvailableEstadosForItem(item, targetStatesByGroupAndBase);
                            const rawSelected = selectedEstadoByItem[itemKey] || resolveItemInitialEstado(item);
                            const selectedEstado = availableEstados.includes(rawSelected)
                              ? rawSelected
                              : availableEstados[0];

                            const displayData = calculateDisplayedItemData({
                              item,
                              selectedEstado,
                              factorByKey
                            });
                            const itemMacros = parseJsonObject(item.macros, {});
                            const swapOpen = Boolean(swapOpenByItem[itemKey]);
                            const swapCandidates = swapCandidatesByItem[itemKey] || [];
                            const selectedReplacementFoodId = swapSelectedFoodIdByItem[itemKey] || "";
                            const isSwapLoading = Boolean(swapLoadingByItem[itemKey]);
                            const isSwapApplying = Boolean(swapApplyingByItem[itemKey]);
                            const swapError = swapErrorByItem[itemKey] || null;
                            const swapMessage = swapMessageByItem[itemKey] || null;

                            return (
                              <div key={itemKey} className="bg-black/20 border border-white/10 rounded-lg p-3">
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                  <div>
                                    <div className="text-sm text-gray-100 font-medium">
                                      {item.food_nombre || item.descripcion}
                                    </div>
                                  </div>

                                  <div className="text-left sm:text-right">
                                    <div className="text-emerald-300 font-semibold text-sm">
                                      {formatGrams(displayData.gramosMostrados)}
                                    </div>
                                    <div className="text-[11px] text-gray-500">
                                      Macros: P {itemMacros.protein_g ?? 0} · C {itemMacros.carbs_g ?? 0} · G {itemMacros.fat_g ?? 0}
                                    </div>
                                  </div>
                                </div>

                                <div className="mt-2 flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2">
                                  {availableEstados.length > 1 && (
                                    <>
                                      <label htmlFor={`estado-${itemKey}`} className="text-sm text-gray-400">
                                        Estado:
                                      </label>
                                      <select
                                        id={`estado-${itemKey}`}
                                        value={selectedEstado}
                                        onChange={(event) => {
                                          setSelectedEstadoByItem((previous) => ({
                                            ...previous,
                                            [itemKey]: normalizeEstado(event.target.value)
                                          }));
                                        }}
                                        className="w-full sm:w-auto min-h-[44px] text-sm rounded-md bg-white/5 border border-white/10 text-gray-200 px-3 py-2"
                                      >
                                        {availableEstados.map((estado) => (
                                          <option key={estado} value={estado}>
                                            {estado}
                                          </option>
                                        ))}
                                      </select>
                                    </>
                                  )}

                                  {displayData.factorAplicado != null && selectedEstado !== displayData.estadoBase && (
                                    <span className="text-xs px-2 py-1 rounded bg-emerald-500/10 border border-emerald-500/40 text-emerald-300">
                                      Factor x{Number(displayData.factorAplicado).toFixed(3)}
                                    </span>
                                  )}

                                  {displayData.blocked && displayData.estadoElegido !== displayData.estadoBase && (
                                    <span className="text-xs px-2 py-1 rounded bg-red-500/10 border border-red-500/40 text-red-300">
                                      {displayData.blockedReason}
                                    </span>
                                  )}

                                  <button
                                    type="button"
                                    onClick={() => {
                                      const nextOpen = !swapOpen;
                                      setSwapOpenByItem((previous) => ({ ...previous, [itemKey]: nextOpen }));
                                      setSwapErrorByItem((previous) => ({ ...previous, [itemKey]: null }));
                                      setSwapMessageByItem((previous) => ({ ...previous, [itemKey]: null }));
                                      if (nextOpen && !swapCandidatesByItem[itemKey]?.length) {
                                        loadSwapCandidates({ itemKey, item });
                                      }
                                    }}
                                    className="w-full sm:w-auto sm:ml-auto min-h-[44px] text-sm px-3 py-2 rounded bg-yellow-500/10 border border-yellow-500/40 text-yellow-300 hover:bg-yellow-500/20"
                                  >
                                    {swapOpen ? "Cerrar sustitución" : "Sustituir alimento"}
                                  </button>
                                </div>

                                {swapOpen && (
                                  <div className="mt-3 border-t border-white/10 pt-3 space-y-2">
                                    {!meal.id || !item.id ? (
                                      <div className="text-sm text-red-300">
                                        Este item aún no se puede sustituir porque no está persistido.
                                      </div>
                                    ) : (
                                      <>
                                        <div className="flex flex-col sm:flex-row gap-2">
                                          <select
                                            value={selectedReplacementFoodId}
                                            onChange={(event) => {
                                              setSwapSelectedFoodIdByItem((previous) => ({
                                                ...previous,
                                                [itemKey]: event.target.value
                                              }));
                                            }}
                                            className="flex-1 min-h-[44px] rounded-md bg-white/5 border border-white/10 text-gray-200 px-3 py-2 text-sm"
                                          >
                                            <option value="">{isSwapLoading ? "Cargando opciones..." : "Selecciona alimento"}</option>
                                            {swapCandidates.map((food) => {
                                              const macros100 = parseJsonObject(food.macros_100g, {});
                                              return (
                                                <option key={food.id} value={food.id}>
                                                  {food.nombre} · P{macros100.protein_g ?? 0}/C{macros100.carbs_g ?? 0}/G{macros100.fat_g ?? 0}
                                                </option>
                                              );
                                            })}
                                          </select>

                                          <button
                                            type="button"
                                            onClick={() => applyFoodSwap({
                                              itemKey,
                                              meal,
                                              item,
                                              selectedEstado
                                            })}
                                            disabled={isSwapApplying || !selectedReplacementFoodId}
                                            className="w-full sm:w-auto min-h-[44px] px-4 py-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 text-sm text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-60"
                                          >
                                            {isSwapApplying ? "Aplicando..." : "Aplicar sustitución"}
                                          </button>
                                        </div>

                                        <div className="flex justify-stretch sm:justify-end">
                                          <button
                                            type="button"
                                            onClick={() => loadSwapCandidates({ itemKey, item })}
                                            disabled={isSwapLoading}
                                            className="w-full sm:w-auto min-h-[40px] text-sm px-3 py-2 rounded border border-white/15 bg-white/5 text-gray-200 hover:bg-white/10 disabled:opacity-60"
                                          >
                                            {isSwapLoading ? "Actualizando opciones..." : "Actualizar opciones"}
                                          </button>
                                        </div>
                                      </>
                                    )}

                                    {swapMessage && (
                                      <div className="text-sm text-emerald-300">{swapMessage}</div>
                                    )}
                                    {swapError && (
                                      <div className="text-sm text-red-300">{swapError}</div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-gradient-to-r from-[#1a1f2a]/95 to-[#141925]/95 backdrop-blur-xl border-t border-white/8 p-5 sm:p-6">
          <button
            onClick={onClose}
            className="w-full py-3 rounded-xl border border-transparent text-black font-semibold bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 shadow-[0_12px_30px_-18px_rgba(250,204,21,0.75)] hover:brightness-105 transition-all duration-200"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
