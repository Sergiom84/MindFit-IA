import { useEffect, useMemo, useState } from "react";
import tokenManager from '../../utils/tokenManager';
import { getApiBaseUrl } from '../../config/api';
import {
  X,
  Utensils,
  Clock,
  Calendar,
  TrendingUp,
  Loader2,
  Info,
  ChevronDown,
  ChevronRight,
  MoreVertical
} from "lucide-react";

// ARCH-001: base URL canónica desde el adapter de config (VITE_API_URL o same-origin).
const API_URL = getApiBaseUrl();
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

const MODAL_TOKENS = {
  "--bg": "7 7 9",
  "--panel": "14 14 17",
  "--surface": "20 20 24",
  "--surface-2": "24 24 28",
  "--border": "255 255 255",
  "--text": "228 230 236",
  "--text-2": "170 175 188",
  "--muted": "122 128 142",
  "--brand": "235 194 66",
  "--brand-2": "247 214 112",
  "--p": "190 138 142",
  "--c": "209 174 102",
  "--g": "145 158 186"
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
  return tokenManager.getToken() || tokenManager.getToken();
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
      blockedReason: "Este alimento se mide tal como se consume."
    };
  }

  if (!grupoFactor) {
    return {
      gramosMostrados: cantidadDefault,
      estadoBase,
      estadoElegido,
      factorAplicado: null,
      blocked: true,
      blockedReason: "No hay regla de conversión para este alimento."
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
      blockedReason: "No hay conversión disponible para este estado."
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
  menuGenerationMode = "recipe_examples",
  menusEnabled = false,
  isGeneratingMenus = false,
  onGenerateDayMenus = null,
  onRefreshDay = null
}) {
  const [dayState, setDayState] = useState(day);
  const [conversionFactors, setConversionFactors] = useState([]);
  const [factorsLoading, setFactorsLoading] = useState(false);
  const [factorsError, setFactorsError] = useState(null);
  const [mealOpenByKey, setMealOpenByKey] = useState({});
  const [selectedEstadoByItem, setSelectedEstadoByItem] = useState({});
  const [itemMenuOpenByKey, setItemMenuOpenByKey] = useState({});
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
    setMealOpenByKey({});
    setItemMenuOpenByKey({});
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
  const proteinGrams = Math.round(parseNumeric(dayState?.macros?.protein_g) ?? 0);
  const carbsGrams = Math.round(parseNumeric(dayState?.macros?.carbs_g) ?? 0);
  const fatGrams = Math.round(parseNumeric(dayState?.macros?.fat_g) ?? 0);
  const proteinKcal = proteinGrams * 4;
  const carbsKcal = carbsGrams * 4;
  const fatKcal = fatGrams * 9;

  const proteinPercent = totalKcal > 0 ? Math.round((proteinKcal / totalKcal) * 100) : 0;
  const carbsPercent = totalKcal > 0 ? Math.round((carbsKcal / totalKcal) * 100) : 0;
  const fatPercent = totalKcal > 0 ? Math.round((fatKcal / totalKcal) * 100) : 0;
  const normalizedTotalPercent = Math.max(proteinPercent + carbsPercent + fatPercent, 1);
  const proteinBarPercent = (proteinPercent / normalizedTotalPercent) * 100;
  const carbsBarPercent = (carbsPercent / normalizedTotalPercent) * 100;
  const fatBarPercent = (fatPercent / normalizedTotalPercent) * 100;
  const menuGenerationModeLabel = MENU_GENERATION_MODE_LABELS[menuGenerationMode] || menuGenerationMode;
  const dayLabel = Number.isFinite(Number(dayState?.day_index)) ? Number(dayState.day_index) + 1 : "-";
  const subtitle = [
    planInfo?.plan_name || null,
    planInfo?.duration_days ? `${planInfo.duration_days} días` : null,
    planInfo?.training_type || null
  ].filter(Boolean).join(" · ");
  const carbCyclingSummary = planInfo?.carb_cycling_summary || null;

  useEffect(() => {
    if (!dayMeals.length) {
      setMealOpenByKey({});
      return;
    }

    const initialOpenState = {};
    dayMeals.forEach((meal, index) => {
      const mealKey = meal.id || meal.orden || `meal-${index}`;
      initialOpenState[mealKey] = index === 0;
    });
    setMealOpenByKey(initialOpenState);
  }, [dayState?.day_id, dayState?.day_index, dayMeals]);

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

  const dayTypeLabel = isTraining ? "Entrenamiento" : "Descanso";
  const carbCyclingLabel = isTraining ? "+10% carbos" : "-15% carbos";

  return (
    <div
      style={{ ...MODAL_TOKENS, backgroundColor: "rgb(var(--bg) / 0.72)" }}
      className="meal-detail-scroll fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto px-3 sm:px-4 pt-[calc(env(safe-area-inset-top)+5.75rem)] sm:pt-[calc(env(safe-area-inset-top)+6.25rem)] pb-[calc(env(safe-area-inset-bottom)+5.5rem)] sm:pb-[calc(env(safe-area-inset-bottom)+5.75rem)] backdrop-blur-md"
      onClick={() => setItemMenuOpenByKey({})}
    >
      <div
        className="meal-detail-scroll relative flex w-full max-w-[860px] max-h-[92vh] flex-col overflow-hidden rounded-[30px] border"
        style={{
          background:
            "linear-gradient(180deg, rgba(20,20,24,0.98) 0%, rgba(14,14,18,0.98) 52%, rgba(10,10,13,0.99) 100%)",
          borderColor: "rgb(var(--border) / 0.08)",
          boxShadow: "0 26px 74px rgba(0,0,0,0.58)"
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className="border-b px-5 py-5 sm:px-6 sm:py-6"
          style={{ borderColor: "rgb(var(--border) / 0.08)" }}
        >
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[22px] font-semibold tracking-tight text-[rgb(var(--text)/0.98)]">MindFit</span>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl border transition-all duration-200 hover:-translate-y-[1px]"
              style={{
                backgroundColor: "rgb(var(--border) / 0.06)",
                borderColor: "rgb(var(--border) / 0.10)",
                color: "rgb(var(--text-2) / 0.95)"
              }}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-[30px] leading-tight font-semibold font-urbanist tracking-tight text-[rgb(var(--text)/0.98)]">
                Día {dayLabel} · {dayTypeLabel}
              </h2>
              <p className="mt-1 text-sm text-[rgb(var(--text-2)/0.9)]">{subtitle}</p>
            </div>

            {menusEnabled && typeof onGenerateDayMenus === "function" && (
              <button
                type="button"
                onClick={onGenerateDayMenus}
                disabled={isGeneratingMenus || refreshingDay}
                className="flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium transition-all duration-200 bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 text-black border-transparent shadow-[0_12px_30px_-18px_rgba(250,204,21,0.75)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isGeneratingMenus ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <Calendar size={18} />}
                <span>{isGeneratingMenus ? "Generando..." : "Generar menú"}</span>
              </button>
            )}
          </div>
        </div>

        <div
          className="meal-detail-scroll flex-1 overflow-y-auto px-5 py-4 sm:px-6 sm:py-5"
          onScroll={() => setItemMenuOpenByKey({})}
        >
          <section
            className="rounded-[20px] border px-5 py-5"
            style={{
              backgroundColor: "rgb(var(--surface) / 0.9)",
              borderColor: "rgb(var(--border) / 0.08)",
              boxShadow: "0 10px 30px rgba(0,0,0,0.35)"
            }}
          >
            <div className="flex items-end justify-between gap-4">
              <div>
                <div className="text-[50px] leading-none font-semibold tracking-tight text-[rgb(var(--text)/0.98)]">
                  {Math.round(totalKcal)}
                </div>
                <div className="mt-1 text-sm text-[rgb(var(--text-2)/0.9)]">Calorías</div>
              </div>

              <div className="flex items-end gap-4 text-right">
                <div>
                  <div className="text-[22px] font-semibold" style={{ color: "rgb(var(--p) / 0.85)" }}>{proteinGrams}g</div>
                  <div className="text-[12px] text-[rgb(var(--text-2)/0.8)]">{proteinPercent}%</div>
                </div>
                <div>
                  <div className="text-[22px] font-semibold" style={{ color: "rgb(var(--c) / 0.9)" }}>{carbsGrams}g</div>
                  <div className="text-[12px] text-[rgb(var(--text-2)/0.8)]">{carbsPercent}%</div>
                </div>
                <div>
                  <div className="text-[22px] font-semibold" style={{ color: "rgb(var(--g) / 0.9)" }}>{fatGrams}g</div>
                  <div className="text-[12px] text-[rgb(var(--text-2)/0.8)]">{fatPercent}%</div>
                </div>
              </div>
            </div>

            <div className="relative mt-4 h-[6px] overflow-hidden rounded-full" style={{ backgroundColor: "rgb(var(--border) / 0.10)" }}>
              <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${proteinBarPercent}%`, backgroundColor: "rgb(var(--p) / 0.7)" }} />
              <div className="absolute inset-y-0 rounded-full" style={{ left: `${proteinBarPercent}%`, width: `${carbsBarPercent}%`, backgroundColor: "rgb(var(--c) / 0.75)" }} />
              <div className="absolute inset-y-0 rounded-full" style={{ left: `${proteinBarPercent + carbsBarPercent}%`, width: `${fatBarPercent}%`, backgroundColor: "rgb(var(--g) / 0.75)" }} />
            </div>

            <div
              className="mt-4 inline-flex min-h-9 items-center gap-2 rounded-xl border px-3 py-1.5"
              style={{ backgroundColor: "rgb(var(--border) / 0.04)", borderColor: "rgb(var(--border) / 0.08)" }}
            >
              <TrendingUp className="h-4 w-4 text-[rgb(var(--text-2)/0.9)]" />
              <span className="text-sm text-[rgb(var(--text-2)/0.95)]">
                {carbCyclingSummary?.label || "Carb cycling"} · {carbCyclingLabel}
              </span>
              <Info className="h-4 w-4 text-[rgb(var(--text-2)/0.75)]" />
            </div>

            {carbCyclingSummary && (
              <p className="mt-2 text-xs text-[rgb(var(--text-2)/0.82)]">
                {carbCyclingSummary.description}
              </p>
            )}
          </section>

          <div className="mt-4 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-[20px] font-semibold text-[rgb(var(--text)/0.98)]">
              <Utensils className="h-5 w-5" style={{ color: "rgb(var(--brand) / 0.9)" }} />
              Comidas del día ({dayMeals.length})
            </h3>
            <span className="text-[12px] text-[rgb(var(--text-2)/0.75)]">{menuGenerationModeLabel}</span>
          </div>

          {(factorsLoading || factorsError || refreshingDay) && (
            <div className="mt-1 text-[11px] text-[rgb(var(--muted)/0.95)]">
              {factorsLoading && "Cargando factores..."}
              {!factorsLoading && factorsError && "Factores no disponibles"}
              {refreshingDay && " · Actualizando día..."}
            </div>
          )}

          {dayMeals.length === 0 ? (
            <div
              className="mt-3 rounded-[18px] border px-4 py-8 text-center text-sm"
              style={{ backgroundColor: "rgb(var(--surface) / 0.85)", borderColor: "rgb(var(--border) / 0.08)", color: "rgb(var(--text-2) / 0.88)" }}
            >
              No hay comidas para este día.
            </div>
          ) : (
            <div className="mt-3 space-y-3 pb-2">
              {dayMeals.map((meal, mealIndex) => {
                const mealKey = meal.id || meal.orden || `meal-${mealIndex}`;
                const isMealOpen = Boolean(mealOpenByKey[mealKey]);
                const mealItems = Array.isArray(meal.items) ? meal.items : [];
                const generationMetadata = meal.generation_metadata || null;
                const recipeName = generationMetadata?.recipe_name || null;
                const templateName = generationMetadata?.template_name || null;
                const mealDescription = recipeName || templateName || meal.timing_note || "";
                const mealKcal = Math.round(parseNumeric(meal.kcal) ?? 0);
                const mealProtein = Math.round(parseNumeric(meal.macros?.protein_g) ?? 0);
                const mealCarbs = Math.round(parseNumeric(meal.macros?.carbs_g) ?? 0);
                const mealFat = Math.round(parseNumeric(meal.macros?.fat_g) ?? 0);

                return (
                  <div
                    key={mealKey}
                    className="overflow-visible rounded-[20px] border"
                    style={{ backgroundColor: "rgb(var(--surface) / 0.92)", borderColor: "rgb(var(--border) / 0.08)", boxShadow: "0 10px 30px rgba(0,0,0,0.35)" }}
                  >
                    <button
                      type="button"
                      onClick={() => setMealOpenByKey((previous) => ({ ...previous, [mealKey]: !isMealOpen }))}
                      className="flex w-full items-start justify-between gap-3 px-4 py-4 text-left"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-sm"
                            style={{ backgroundColor: "rgb(var(--brand) / 0.18)" }}
                          >
                            {MEAL_ICONS[meal.orden] || "🍴"}
                          </span>
                          <span className="truncate text-[18px] font-semibold text-[rgb(var(--text)/0.98)]">{meal.nombre}</span>
                        </div>
                        {mealDescription && (
                          <div className="mt-1 truncate text-[13px] text-[rgb(var(--text-2)/0.82)]">{mealDescription}</div>
                        )}
                        {meal.hora_sugerida && (
                          <div className="mt-1 flex items-center gap-1 text-[12px] text-[rgb(var(--muted)/0.92)]">
                            <Clock className="h-3 w-3" />
                            {meal.hora_sugerida}
                          </div>
                        )}
                      </div>
                      {isMealOpen ? (
                        <ChevronDown className="mt-0.5 h-5 w-5 text-[rgb(var(--text-2)/0.8)]" />
                      ) : (
                        <ChevronRight className="mt-0.5 h-5 w-5 text-[rgb(var(--text-2)/0.8)]" />
                      )}
                    </button>

                    <div className="border-t px-4 py-2.5" style={{ borderColor: "rgb(var(--border) / 0.06)" }}>
                      <div className="flex flex-wrap items-center gap-4 text-sm">
                        <div className="flex items-baseline gap-1">
                          <span className="text-[26px] font-semibold text-[rgb(var(--text)/0.98)]">{mealKcal}</span>
                          <span className="text-[11px] uppercase tracking-wide text-[rgb(var(--text-2)/0.7)]">kcal</span>
                        </div>
                        <span className="text-[18px] font-semibold" style={{ color: "rgb(var(--p) / 0.86)" }}>{mealProtein}g</span>
                        <span className="text-[18px] font-semibold" style={{ color: "rgb(var(--c) / 0.9)" }}>{mealCarbs}g</span>
                        <span className="text-[18px] font-semibold" style={{ color: "rgb(var(--g) / 0.9)" }}>{mealFat}g</span>
                      </div>
                    </div>

                    {isMealOpen && (
                      <div className="border-t" style={{ borderColor: "rgb(var(--border) / 0.06)" }}>
                        {mealItems.length === 0 ? (
                          <p className="px-4 py-4 text-sm italic text-[rgb(var(--text-2)/0.82)]">
                            Menú específico pendiente de generación.
                          </p>
                        ) : (
                          <div>
                            <div
                              className="px-4 py-2 text-[12px] font-semibold tracking-wide"
                              style={{ color: "rgb(var(--text-2) / 0.82)" }}
                            >
                              Alimentos ({mealItems.length})
                            </div>
                            <div className="divide-y" style={{ borderColor: "rgb(var(--border) / 0.06)" }}>
                            {mealItems.map((item, itemIndex) => {
                              const itemKey = item.id || `${mealKey}-${itemIndex}`;
                              const availableEstados = getAvailableEstadosForItem(item, targetStatesByGroupAndBase);
                              const rawSelected = selectedEstadoByItem[itemKey] || resolveItemInitialEstado(item);
                              const selectedEstado = availableEstados.includes(rawSelected) ? rawSelected : availableEstados[0];
                              const displayData = calculateDisplayedItemData({ item, selectedEstado, factorByKey });
                              const itemMacros = parseJsonObject(item.macros, {});
                              const itemKcal = Math.round(parseNumeric(itemMacros.kcal ?? item.kcal) ?? 0);
                              const itemProtein = Math.round(parseNumeric(itemMacros.protein_g) ?? 0);
                              const itemCarbs = Math.round(parseNumeric(itemMacros.carbs_g) ?? 0);
                              const itemFat = Math.round(parseNumeric(itemMacros.fat_g) ?? 0);
                              const isMenuOpen = Boolean(itemMenuOpenByKey[itemKey]);
                              const isSwapOpen = Boolean(swapOpenByItem[itemKey]);
                              const swapCandidates = swapCandidatesByItem[itemKey] || [];
                              const selectedReplacementFoodId = swapSelectedFoodIdByItem[itemKey] || "";
                              const isSwapLoading = Boolean(swapLoadingByItem[itemKey]);
                              const isSwapApplying = Boolean(swapApplyingByItem[itemKey]);
                              const swapError = swapErrorByItem[itemKey] || null;
                              const swapMessage = swapMessageByItem[itemKey] || null;

                              return (
                                <div key={itemKey} className="relative px-4 py-3">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <div className="truncate text-[15px] font-medium text-[rgb(var(--text)/0.97)]">
                                        {item.food_nombre || item.descripcion}
                                      </div>
                                      <div className="mt-0.5 text-[12px] text-[rgb(var(--muted)/0.95)]">
                                        {formatGrams(displayData.gramosMostrados)}
                                      </div>
                                    </div>

                                    <div className="flex items-start gap-2">
                                      <div className="text-right">
                                        <div className="text-[13px] text-[rgb(var(--text-2)/0.92)]">{itemKcal} calorías</div>
                                        <div className="text-[11px] text-[rgb(var(--muted)/0.95)]">
                                          P{itemProtein} · C{itemCarbs} · G{itemFat}
                                        </div>
                                      </div>

                                      <div className="relative">
                                        <button
                                          type="button"
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            setItemMenuOpenByKey((previous) => ({
                                              [itemKey]: !previous[itemKey]
                                            }));
                                          }}
                                          className="inline-flex h-11 w-11 items-center justify-center rounded-xl border transition-colors"
                                          style={{
                                            backgroundColor: "rgb(var(--border) / 0.04)",
                                            borderColor: "rgb(var(--border) / 0.10)",
                                            color: "rgb(var(--text-2) / 0.9)"
                                          }}
                                        >
                                          <MoreVertical className="h-4 w-4" />
                                        </button>

                                        {isMenuOpen && (
                                          <div
                                            className="absolute right-0 top-12 z-30 min-w-[210px] rounded-xl border p-1.5"
                                            style={{
                                              backgroundColor: "rgb(var(--surface-2) / 0.97)",
                                              borderColor: "rgb(var(--border) / 0.08)",
                                              boxShadow: "0 10px 30px rgba(0,0,0,0.35)"
                                            }}
                                            onClick={(event) => event.stopPropagation()}
                                          >
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setItemMenuOpenByKey({});
                                                setSwapOpenByItem((previous) => ({ ...previous, [itemKey]: true }));
                                                setSwapErrorByItem((previous) => ({ ...previous, [itemKey]: null }));
                                                setSwapMessageByItem((previous) => ({ ...previous, [itemKey]: null }));
                                                if (!swapCandidatesByItem[itemKey]?.length) {
                                                  loadSwapCandidates({ itemKey, item });
                                                }
                                              }}
                                              className="flex min-h-[44px] w-full items-center rounded-lg px-3 text-left text-sm transition-colors hover:bg-white/5 text-[rgb(var(--text)/0.95)]"
                                            >
                                              Reemplazar alimento
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  {isSwapOpen && (
                                    <div className="mt-3 space-y-2.5 rounded-xl border p-3" style={{ borderColor: "rgb(var(--border) / 0.08)", backgroundColor: "rgb(var(--bg) / 0.35)" }}>
                                      <div className="flex flex-wrap items-center justify-between gap-2">
                                        <span className="text-[12px] text-[rgb(var(--text-2)/0.88)]">Reemplazo de alimento</span>
                                        <button
                                          type="button"
                                          onClick={() => setSwapOpenByItem((previous) => ({ ...previous, [itemKey]: false }))}
                                          className="text-[12px] text-[rgb(var(--muted)/0.95)] hover:text-[rgb(var(--text-2)/0.95)]"
                                        >
                                          Cerrar
                                        </button>
                                      </div>

                                      {availableEstados.length > 1 && (
                                        <div className="flex flex-wrap items-center gap-2">
                                          <span className="text-[12px] text-[rgb(var(--text-2)/0.82)]">Estado:</span>
                                          <select
                                            value={selectedEstado}
                                            onChange={(event) => {
                                              setSelectedEstadoByItem((previous) => ({
                                                ...previous,
                                                [itemKey]: normalizeEstado(event.target.value)
                                              }));
                                            }}
                                            className="min-h-[36px] rounded-lg border px-2.5 py-1.5 text-xs outline-none"
                                            style={{
                                              backgroundColor: "rgb(var(--border) / 0.05)",
                                              borderColor: "rgb(var(--border) / 0.12)",
                                              color: "rgb(var(--text) / 0.95)"
                                            }}
                                          >
                                            {availableEstados.map((estado) => (
                                              <option key={estado} value={estado}>
                                                {estado}
                                              </option>
                                            ))}
                                          </select>
                                          {displayData.factorAplicado != null && selectedEstado !== displayData.estadoBase && (
                                            <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-200">
                                              Factor x{Number(displayData.factorAplicado).toFixed(3)}
                                            </span>
                                          )}
                                        </div>
                                      )}

                                      {displayData.blocked && selectedEstado !== displayData.estadoBase && (
                                        <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-2.5 py-1.5 text-[11px] text-red-200">
                                          {displayData.blockedReason}
                                        </div>
                                      )}

                                      {!meal.id || !item.id ? (
                                        <div className="text-sm text-red-300">
                                          Este item aún no se puede sustituir porque no está persistido.
                                        </div>
                                      ) : (
                                        <>
                                          <div className="flex flex-col gap-2 sm:flex-row">
                                            <select
                                              value={selectedReplacementFoodId}
                                              onChange={(event) => {
                                                setSwapSelectedFoodIdByItem((previous) => ({
                                                  ...previous,
                                                  [itemKey]: event.target.value
                                                }));
                                              }}
                                              className="min-h-[44px] flex-1 rounded-xl border px-3 py-2 text-sm outline-none"
                                              style={{
                                                backgroundColor: "rgb(var(--border) / 0.05)",
                                                borderColor: "rgb(var(--border) / 0.12)",
                                                color: "rgb(var(--text) / 0.95)"
                                              }}
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
                                              className="min-h-[44px] rounded-xl border px-4 py-2 text-sm font-medium transition-all disabled:opacity-60"
                                              style={{
                                                backgroundColor: "rgb(var(--border) / 0.08)",
                                                borderColor: "rgb(var(--border) / 0.16)",
                                                color: "rgb(var(--text) / 0.95)"
                                              }}
                                            >
                                              {isSwapApplying ? "Aplicando..." : "Aplicar"}
                                            </button>
                                          </div>

                                          <div className="flex justify-end">
                                            <button
                                              type="button"
                                              onClick={() => loadSwapCandidates({ itemKey, item })}
                                              disabled={isSwapLoading}
                                              className="min-h-[36px] rounded-lg border px-3 text-xs transition-all disabled:opacity-60"
                                              style={{
                                                backgroundColor: "rgb(var(--border) / 0.04)",
                                                borderColor: "rgb(var(--border) / 0.10)",
                                                color: "rgb(var(--text-2) / 0.92)"
                                              }}
                                            >
                                              {isSwapLoading ? "Actualizando opciones..." : "Actualizar opciones"}
                                            </button>
                                          </div>
                                        </>
                                      )}

                                      {swapMessage && (
                                        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
                                          {swapMessage}
                                        </div>
                                      )}
                                      {swapError && (
                                        <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                                          {swapError}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div
          className="border-t px-5 py-4 sm:px-6 sm:py-5"
          style={{ borderColor: "rgb(var(--border) / 0.06)", backgroundColor: "rgb(var(--panel) / 0.85)", backdropFilter: "blur(10px)" }}
        >
          <button
            type="button"
            onClick={onClose}
            className="mx-auto flex min-h-[54px] w-full max-w-[460px] items-center justify-center gap-2 rounded-2xl px-4 py-3 border text-[17px] font-semibold transition-all duration-200 bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 text-black border-transparent shadow-[0_12px_30px_-18px_rgba(250,204,21,0.75)] hover:brightness-105 active:translate-y-[1px]"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
