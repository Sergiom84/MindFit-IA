import { useEffect, useMemo, useState } from "react";
import { X, Utensils, Clock, Dumbbell, Moon, TrendingUp, Sparkles, Loader2 } from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3010";
const ESTADOS_PESADO = ["crudo", "cocido", "escurrido", "seco", "tal_cual"];

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

export default function MealDetailView({
  day,
  planInfo,
  onClose,
  menusEnabled = false,
  isGeneratingMenus = false,
  onGenerateDayMenus = null
}) {
  const [conversionFactors, setConversionFactors] = useState([]);
  const [factorsLoading, setFactorsLoading] = useState(false);
  const [factorsError, setFactorsError] = useState(null);
  const [selectedEstadoByItem, setSelectedEstadoByItem] = useState({});

  const dayMeals = useMemo(() => day?.meals || [], [day?.meals]);
  const isTraining = day?.tipo_dia === "entreno";
  const totalKcal = parseNumeric(day?.kcal) ?? 0;
  const proteinKcal = (parseNumeric(day?.macros?.protein_g) ?? 0) * 4;
  const carbsKcal = (parseNumeric(day?.macros?.carbs_g) ?? 0) * 4;
  const fatKcal = (parseNumeric(day?.macros?.fat_g) ?? 0) * 9;

  const proteinPercent = totalKcal > 0 ? ((proteinKcal / totalKcal) * 100).toFixed(0) : "0";
  const carbsPercent = totalKcal > 0 ? ((carbsKcal / totalKcal) * 100).toFixed(0) : "0";
  const fatPercent = totalKcal > 0 ? ((fatKcal / totalKcal) * 100).toFixed(0) : "0";

  useEffect(() => {
    const initialStateMap = {};
    dayMeals.forEach((meal) => {
      (meal.items || []).forEach((item, index) => {
        const itemKey = item.id || `${meal.id || meal.orden}-${index}`;
        initialStateMap[itemKey] = resolveItemInitialEstado(item);
      });
    });
    setSelectedEstadoByItem(initialStateMap);
  }, [day?.day_id, day?.day_index, dayMeals]);

  useEffect(() => {
    let isMounted = true;

    const loadFactors = async () => {
      setFactorsLoading(true);
      setFactorsError(null);
      try {
        const token = localStorage.getItem("token") || localStorage.getItem("authToken");
        const response = await fetch(`${API_URL}/api/nutrition-v2/food-conversion-factors`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });

        if (!response.ok) {
          throw new Error("No se pudieron cargar los factores de conversion");
        }

        const payload = await response.json();
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

  if (!day) return null;

  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-neutral-900/80 border border-white/10 ring-1 ring-white/5 backdrop-blur-lg rounded-2xl max-w-5xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-neutral-900/80 border-b border-white/10 p-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold font-urbanist text-white mb-1">
              Día {day.day_index + 1} - {isTraining ? "Entrenamiento" : "Descanso"}
            </h2>
            <p className="text-gray-400 text-sm">
              {planInfo.plan_name} • {planInfo.training_type}
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors"
          >
            <X className="w-6 h-6 text-white" />
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
              <div className="text-3xl font-bold text-emerald-300">{day.kcal}</div>
              <div className="text-gray-500 text-xs">kcal</div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-lg p-4 text-center border-l-2 border-l-red-400/40">
              <div className="text-gray-400 text-sm mb-1">Proteína</div>
              <div className="text-3xl font-bold text-red-300">{day.macros.protein_g}</div>
              <div className="text-gray-500 text-xs">g ({proteinPercent}%)</div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-lg p-4 text-center border-l-2 border-l-yellow-400/40">
              <div className="text-gray-400 text-sm mb-1">Carbohidratos</div>
              <div className="text-3xl font-bold text-yellow-300">{day.macros.carbs_g}</div>
              <div className="text-gray-500 text-xs">g ({carbsPercent}%)</div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-lg p-4 text-center border-l-2 border-l-sky-400/40">
              <div className="text-gray-400 text-sm mb-1">Grasas</div>
              <div className="text-3xl font-bold text-sky-300">{day.macros.fat_g}</div>
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
              Comidas del Día ({day.meals?.length || 0})
            </h3>

            {menusEnabled && (
              <button
                type="button"
                onClick={onGenerateDayMenus}
                disabled={!onGenerateDayMenus || isGeneratingMenus}
                className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-white/10 bg-white/5 text-sm text-white hover:bg-white/10 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isGeneratingMenus ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4 text-yellow-300" />
                )}
                {isGeneratingMenus ? "Generando menus..." : "Generar menus IA del dia"}
              </button>
            )}
          </div>

          <div className="text-xs text-gray-400 mb-4">
            {factorsLoading && "Cargando factores de conversion..."}
            {!factorsLoading && !factorsError && `${conversionFactors.length} factores de conversion disponibles`}
            {!factorsLoading && factorsError && `No se pudieron cargar factores: ${factorsError}`}
            <span className="ml-2 text-gray-500">• Items guardados: {totalMealItems}</span>
          </div>

          {!day.meals || day.meals.length === 0 ? (
            <div className="text-center p-8 bg-white/5 border border-white/10 rounded-lg">
              <p className="text-gray-400">No hay comidas para este día.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {day.meals.map((meal) => {
                const mealItems = Array.isArray(meal.items) ? meal.items : [];
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

                            return (
                              <div key={itemKey} className="bg-black/20 border border-white/10 rounded-lg p-3">
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                  <div>
                                    <div className="text-sm text-gray-100 font-medium">
                                      {item.food_nombre || item.descripcion}
                                    </div>
                                    <div className="text-[11px] text-gray-400">
                                      Base: {displayData.estadoBase} · Grupo: {item.food_grupo_factor || "N/A"}
                                    </div>
                                  </div>

                                  <div className="text-left sm:text-right">
                                    <div className="text-emerald-300 font-semibold text-sm">
                                      {formatGrams(displayData.gramosMostrados)} ({displayData.estadoElegido})
                                    </div>
                                    <div className="text-[11px] text-gray-500">
                                      Macros: P {itemMacros.protein_g ?? 0} · C {itemMacros.carbs_g ?? 0} · G {itemMacros.fat_g ?? 0}
                                    </div>
                                  </div>
                                </div>

                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                  <label htmlFor={`estado-${itemKey}`} className="text-xs text-gray-400">
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
                                    disabled={availableEstados.length <= 1}
                                    className="text-xs rounded-md bg-white/5 border border-white/10 text-gray-200 px-2 py-1 disabled:opacity-60"
                                  >
                                    {availableEstados.map((estado) => (
                                      <option key={estado} value={estado}>
                                        {estado}
                                      </option>
                                    ))}
                                  </select>

                                  {availableEstados.length <= 1 && (
                                    <span className="text-[11px] px-2 py-1 rounded bg-red-500/10 border border-red-500/40 text-red-300">
                                      Sin conversion
                                    </span>
                                  )}

                                  {displayData.factorAplicado != null && (
                                    <span className="text-[11px] px-2 py-1 rounded bg-emerald-500/10 border border-emerald-500/40 text-emerald-300">
                                      Factor x{Number(displayData.factorAplicado).toFixed(3)}
                                    </span>
                                  )}

                                  {displayData.blocked && displayData.estadoElegido !== displayData.estadoBase && (
                                    <span className="text-[11px] px-2 py-1 rounded bg-red-500/10 border border-red-500/40 text-red-300">
                                      {displayData.blockedReason}
                                    </span>
                                  )}
                                </div>
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

        <div className="sticky bottom-0 bg-neutral-900/80 border-t border-white/10 p-6">
          <button
            onClick={onClose}
            className="w-full bg-yellow-400 text-gray-900 py-3 rounded-lg font-bold hover:bg-yellow-500 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
