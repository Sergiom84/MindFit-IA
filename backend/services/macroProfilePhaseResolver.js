export const MACRO_RULESET_VERSION = "mindfeed_macro_phase_v2";

export const LEGACY_PROFILE_MACRO_RANGES = {
  tolerante: {
    protein_min: 0.20,
    protein_max: 0.25,
    carbs_min: 0.50,
    carbs_max: 0.60,
    fat_min: 0.15,
    fat_max: 0.25,
    protein_mid: 0.225,
    carbs_mid: 0.55,
    fat_mid: 0.20
  },
  mixto: {
    protein_min: 0.25,
    protein_max: 0.30,
    carbs_min: 0.35,
    carbs_max: 0.40,
    fat_min: 0.30,
    fat_max: 0.35,
    protein_mid: 0.275,
    carbs_mid: 0.375,
    fat_mid: 0.325
  },
  intolerante: {
    protein_min: 0.30,
    protein_max: 0.35,
    carbs_min: 0.20,
    carbs_max: 0.30,
    fat_min: 0.35,
    fat_max: 0.45,
    protein_mid: 0.325,
    carbs_mid: 0.25,
    fat_mid: 0.40
  }
};

export const PROFILE_PHASE_MACRO_TEMPLATES = {
  tolerante: {
    cut: { protein_pct: 28, carbs_pct: 47, fat_pct: 25 },
    mant: { protein_pct: 25, carbs_pct: 55, fat_pct: 20 },
    bulk: { protein_pct: 23, carbs_pct: 57, fat_pct: 20 }
  },
  mixto: {
    cut: { protein_pct: 28, carbs_pct: 32, fat_pct: 40 },
    mant: { protein_pct: 25, carbs_pct: 40, fat_pct: 35 },
    bulk: { protein_pct: 23, carbs_pct: 47, fat_pct: 30 }
  },
  intolerante: {
    cut: { protein_pct: 30, carbs_pct: 22, fat_pct: 48 },
    mant: { protein_pct: 27, carbs_pct: 28, fat_pct: 45 },
    bulk: { protein_pct: 25, carbs_pct: 35, fat_pct: 40 }
  }
};

export const PROTEIN_GUARDRAILS_GKG = {
  cut: { min: 2.0, max: 2.4 },
  mant: { min: 1.6, max: 2.2 },
  bulk: { min: 1.6, max: 2.0 }
};

export const FAT_GUARDRAILS = {
  min_per_kg: 0.6,
  min_percentage: 0.20
};

const PROFILE_ALIAS_MAP = {
  tolerante: "tolerante",
  carb_tolerant: "tolerante",
  alta_tolerancia_carbohidratos: "tolerante",
  mixto: "mixto",
  equilibrado: "mixto",
  balanceado: "mixto",
  mixed: "mixto",
  intolerante: "intolerante",
  carb_intolerant: "intolerante",
  baja_tolerancia_carbohidratos: "intolerante"
};

const PHASE_ALIAS_MAP = {
  cut: "cut",
  definicion: "cut",
  deficit: "cut",
  deficit_calorico: "cut",
  perder_peso: "cut",
  tonificar: "cut",
  mant: "mant",
  maint: "mant",
  maintenance: "mant",
  mantenimiento: "mant",
  mantener: "mant",
  normo: "mant",
  normocalorica: "mant",
  normocalorico: "mant",
  salud_general: "mant",
  mejorar_resistencia: "mant",
  mejorar_flexibilidad: "mant",
  bulk: "bulk",
  volumen: "bulk",
  superavit: "bulk",
  ganar_peso: "bulk",
  ganar_masa_muscular: "bulk"
};

function normalizeKey(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function safeNumber(value, fallback = 0) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
}

function calculateMacroPercentagesFromGrams(macros = {}) {
  const proteinKcal = safeNumber(macros.protein_g) * 4;
  const carbsKcal = safeNumber(macros.carbs_g) * 4;
  const fatKcal = safeNumber(macros.fat_g) * 9;
  const totalKcal = proteinKcal + carbsKcal + fatKcal;

  if (totalKcal <= 0) {
    return {
      protein_pct: 0,
      carbs_pct: 0,
      fat_pct: 0
    };
  }

  const exact = [
    { key: "protein_pct", value: (proteinKcal / totalKcal) * 100 },
    { key: "carbs_pct", value: (carbsKcal / totalKcal) * 100 },
    { key: "fat_pct", value: (fatKcal / totalKcal) * 100 }
  ];

  const rounded = exact.map((entry) => ({
    key: entry.key,
    value: Math.floor(entry.value),
    remainder: entry.value - Math.floor(entry.value)
  }));

  let remaining = 100 - rounded.reduce((sum, entry) => sum + entry.value, 0);
  rounded.sort((a, b) => b.remainder - a.remainder);

  for (let index = 0; index < rounded.length && remaining > 0; index += 1) {
    rounded[index].value += 1;
    remaining -= 1;
  }

  return rounded.reduce((accumulator, entry) => {
    accumulator[entry.key] = entry.value;
    return accumulator;
  }, {});
}

function inferTemplatePercentages(macros = {}, kcalTarget = null) {
  if (
    Number.isFinite(safeNumber(macros.protein_pct, Number.NaN)) &&
    Number.isFinite(safeNumber(macros.carbs_pct, Number.NaN)) &&
    Number.isFinite(safeNumber(macros.fat_pct, Number.NaN))
  ) {
    return {
      protein_pct: Math.round(Number(macros.protein_pct)),
      carbs_pct: Math.round(Number(macros.carbs_pct)),
      fat_pct: Math.round(Number(macros.fat_pct))
    };
  }

  const totalKcal = kcalTarget && Number.isFinite(Number(kcalTarget))
    ? Number(kcalTarget)
    : safeNumber(macros.protein_g) * 4 + safeNumber(macros.carbs_g) * 4 + safeNumber(macros.fat_g) * 9;

  if (totalKcal <= 0) {
    return PROFILE_PHASE_MACRO_TEMPLATES.mixto.mant;
  }

  return calculateMacroPercentagesFromGrams(macros);
}

export function normalizeMetabolicProfile(profile, fallback = "mixto") {
  const normalized = normalizeKey(profile);
  return PROFILE_ALIAS_MAP[normalized] || fallback;
}

export function normalizeNutritionPhase(phase, fallback = "mant") {
  const normalized = normalizeKey(phase);
  return PHASE_ALIAS_MAP[normalized] || fallback;
}

export function getMacroTemplateByProfileAndPhase(profile, phase) {
  const normalizedProfile = normalizeMetabolicProfile(profile);
  const normalizedPhase = normalizeNutritionPhase(phase);
  return clone(PROFILE_PHASE_MACRO_TEMPLATES[normalizedProfile]?.[normalizedPhase] || PROFILE_PHASE_MACRO_TEMPLATES.mixto.mant);
}

export function calculateMacroTargetsFromTemplate(kcalTarget, templatePct) {
  const safeKcal = Math.max(0, Math.round(safeNumber(kcalTarget)));
  const template = templatePct || PROFILE_PHASE_MACRO_TEMPLATES.mixto.mant;

  const protein_g = Math.round((safeKcal * (template.protein_pct / 100)) / 4);
  const carbs_g = Math.round((safeKcal * (template.carbs_pct / 100)) / 4);
  const fat_g = Math.round((safeKcal * (template.fat_pct / 100)) / 9);

  return {
    protein_g,
    carbs_g,
    fat_g,
    kcal_calculated: protein_g * 4 + carbs_g * 4 + fat_g * 9
  };
}

export function applyMacroGuardrails(
  rawMacros,
  {
    kcalTarget,
    pesoKg,
    phase,
    templatePct,
    level = "intermedio"
  } = {}
) {
  const safeKcalTarget = Math.max(0, Math.round(safeNumber(kcalTarget)));
  const safeWeightKg = Math.max(0, safeNumber(pesoKg));
  const appliedPhase = normalizeNutritionPhase(phase);
  const template = templatePct || PROFILE_PHASE_MACRO_TEMPLATES.mixto[appliedPhase];
  const proteinRange = PROTEIN_GUARDRAILS_GKG[appliedPhase] || PROTEIN_GUARDRAILS_GKG.mant;
  const minProtein_g = Math.ceil(safeWeightKg * proteinRange.min);
  const maxProtein_g = Math.floor(safeWeightKg * proteinRange.max);
  const fatMin_g = Math.ceil(Math.max(
    safeWeightKg * FAT_GUARDRAILS.min_per_kg,
    (safeKcalTarget * FAT_GUARDRAILS.min_percentage) / 9
  ));

  let protein_g = Math.round(safeNumber(rawMacros?.protein_g));
  const adjustments = [];

  if (protein_g < minProtein_g) {
    adjustments.push({
      macro: "protein",
      original: protein_g,
      adjusted: minProtein_g,
      reason: `Minimo ${proteinRange.min} g/kg para ${appliedPhase}`
    });
    protein_g = minProtein_g;
  }

  if (protein_g > maxProtein_g) {
    adjustments.push({
      macro: "protein",
      original: protein_g,
      adjusted: maxProtein_g,
      reason: `Maximo ${proteinRange.max} g/kg para ${appliedPhase}`
    });
    protein_g = maxProtein_g;
  }

  let remainingKcalAfterProtein = Math.max(0, safeKcalTarget - protein_g * 4);
  const fatMinKcal = fatMin_g * 9;

  if (remainingKcalAfterProtein < fatMinKcal && protein_g > minProtein_g) {
    const proteinMaxForFatMin = Math.max(
      minProtein_g,
      Math.floor((safeKcalTarget - fatMinKcal) / 4)
    );

    if (proteinMaxForFatMin < protein_g) {
      adjustments.push({
        macro: "protein",
        original: protein_g,
        adjusted: proteinMaxForFatMin,
        reason: "Rebalanceo para sostener el minimo de grasa"
      });
      protein_g = proteinMaxForFatMin;
      remainingKcalAfterProtein = Math.max(0, safeKcalTarget - protein_g * 4);
    }
  }

  const nonProteinPct = Math.max(1, template.carbs_pct + template.fat_pct);
  const fatShare = template.fat_pct / nonProteinPct;
  let desiredFatKcal = Math.round(remainingKcalAfterProtein * fatShare);
  let fatKcal = Math.max(fatMinKcal, desiredFatKcal);

  if (fatKcal > remainingKcalAfterProtein) {
    fatKcal = remainingKcalAfterProtein;
  }

  let fat_g = fatKcal >= fatMinKcal
    ? Math.max(fatMin_g, Math.round(fatKcal / 9))
    : Math.max(0, Math.round(fatKcal / 9));

  if (fat_g < fatMin_g && remainingKcalAfterProtein >= fatMinKcal) {
    adjustments.push({
      macro: "fat",
      original: fat_g,
      adjusted: fatMin_g,
      reason: `Minimo ${FAT_GUARDRAILS.min_per_kg} g/kg o ${Math.round(FAT_GUARDRAILS.min_percentage * 100)}% kcal`
    });
    fat_g = fatMin_g;
  } else if (fat_g > 0 && fat_g !== Math.round(safeNumber(rawMacros?.fat_g)) && fat_g >= fatMin_g) {
    const originalFat = Math.round(safeNumber(rawMacros?.fat_g));
    if (originalFat < fat_g) {
      adjustments.push({
        macro: "fat",
        original: originalFat,
        adjusted: fat_g,
        reason: `Minimo ${FAT_GUARDRAILS.min_per_kg} g/kg o ${Math.round(FAT_GUARDRAILS.min_percentage * 100)}% kcal`
      });
    }
  }

  let carbs_g = Math.max(0, Math.round((safeKcalTarget - protein_g * 4 - fat_g * 9) / 4));
  let kcalCalculated = protein_g * 4 + carbs_g * 4 + fat_g * 9;
  const kcalDelta = safeKcalTarget - kcalCalculated;

  if (Math.abs(kcalDelta) >= 4) {
    const carbAdjustment = Math.trunc(kcalDelta / 4);
    if (carbs_g + carbAdjustment >= 0) {
      carbs_g += carbAdjustment;
      kcalCalculated = protein_g * 4 + carbs_g * 4 + fat_g * 9;
    }
  }

  const adjustedMacros = {
    protein_g,
    carbs_g,
    fat_g
  };

  return {
    adjusted_grams: adjustedMacros,
    final_pct: calculateMacroPercentagesFromGrams(adjustedMacros),
    kcal_calculated: kcalCalculated,
    guardrails_applied: adjustments.length > 0,
    adjustments,
    protein_range_g: {
      min: minProtein_g,
      max: maxProtein_g
    },
    fat_min_g: fatMin_g,
    level
  };
}

export function resolveMacroTargets({
  kcalTarget,
  pesoKg,
  metabolicProfile,
  metabolicConfidence = "media",
  phase,
  level = "intermedio"
} = {}) {
  const requestedProfile = normalizeMetabolicProfile(metabolicProfile);
  const requestedPhase = normalizeNutritionPhase(phase);
  const appliedProfile = metabolicConfidence === "baja"
    ? "mixto"
    : requestedProfile;
  const appliedPhase = requestedPhase;
  const templatePct = getMacroTemplateByProfileAndPhase(appliedProfile, appliedPhase);
  const rawGrams = calculateMacroTargetsFromTemplate(kcalTarget, templatePct);
  const guardrailResult = applyMacroGuardrails(rawGrams, {
    kcalTarget,
    pesoKg,
    phase: appliedPhase,
    templatePct,
    level
  });

  return {
    protein_g: guardrailResult.adjusted_grams.protein_g,
    carbs_g: guardrailResult.adjusted_grams.carbs_g,
    fat_g: guardrailResult.adjusted_grams.fat_g,
    protein_pct: guardrailResult.final_pct.protein_pct,
    carbs_pct: guardrailResult.final_pct.carbs_pct,
    fat_pct: guardrailResult.final_pct.fat_pct,
    kcal_calculated: guardrailResult.kcal_calculated,
    requested_profile: requestedProfile,
    applied_profile: appliedProfile,
    requested_phase: requestedPhase,
    applied_phase: appliedPhase,
    metabolic_confidence: metabolicConfidence || "media",
    level,
    template_pct: templatePct,
    raw_grams: {
      protein_g: rawGrams.protein_g,
      carbs_g: rawGrams.carbs_g,
      fat_g: rawGrams.fat_g
    },
    adjusted_grams: guardrailResult.adjusted_grams,
    final_pct: guardrailResult.final_pct,
    guardrails_applied: guardrailResult.guardrails_applied,
    adjustments: guardrailResult.adjustments,
    protein_range_g: guardrailResult.protein_range_g,
    fat_min_g: guardrailResult.fat_min_g,
    ruleset: MACRO_RULESET_VERSION
  };
}

export function extractMacroCalculationAudit(resolvedTargets = {}) {
  return {
    requested_profile: resolvedTargets.requested_profile || "mixto",
    applied_profile: resolvedTargets.applied_profile || "mixto",
    requested_phase: resolvedTargets.requested_phase || "mant",
    applied_phase: resolvedTargets.applied_phase || "mant",
    metabolic_confidence: resolvedTargets.metabolic_confidence || "media",
    template_pct: clone(resolvedTargets.template_pct || PROFILE_PHASE_MACRO_TEMPLATES.mixto.mant),
    raw_grams: clone(resolvedTargets.raw_grams || {}),
    adjusted_grams: clone(resolvedTargets.adjusted_grams || {
      protein_g: resolvedTargets.protein_g || 0,
      carbs_g: resolvedTargets.carbs_g || 0,
      fat_g: resolvedTargets.fat_g || 0
    }),
    final_pct: clone(resolvedTargets.final_pct || {
      protein_pct: resolvedTargets.protein_pct || 0,
      carbs_pct: resolvedTargets.carbs_pct || 0,
      fat_pct: resolvedTargets.fat_pct || 0
    }),
    protein_range_g: clone(resolvedTargets.protein_range_g || {}),
    fat_min_g: resolvedTargets.fat_min_g ?? null,
    guardrails_applied: Boolean(resolvedTargets.guardrails_applied),
    adjustments: clone(resolvedTargets.adjustments || []),
    ruleset: resolvedTargets.ruleset || MACRO_RULESET_VERSION
  };
}

export function getMacroDistributionCatalog() {
  const legacyRanges = {};

  for (const [profile, distribution] of Object.entries(LEGACY_PROFILE_MACRO_RANGES)) {
    legacyRanges[profile] = {
      protein: {
        min: Math.round(distribution.protein_min * 100),
        max: Math.round(distribution.protein_max * 100),
        mid: Math.round(distribution.protein_mid * 100)
      },
      carbs: {
        min: Math.round(distribution.carbs_min * 100),
        max: Math.round(distribution.carbs_max * 100),
        mid: Math.round(distribution.carbs_mid * 100)
      },
      fat: {
        min: Math.round(distribution.fat_min * 100),
        max: Math.round(distribution.fat_max * 100),
        mid: Math.round(distribution.fat_mid * 100)
      }
    };
  }

  return {
    ruleset: MACRO_RULESET_VERSION,
    distributions: clone(PROFILE_PHASE_MACRO_TEMPLATES),
    phase_table: clone(PROFILE_PHASE_MACRO_TEMPLATES),
    legacy_ranges: legacyRanges
  };
}

export function resolveMacrosFromExistingTargets(macros, { kcalTarget, pesoKg, phase, level = "intermedio" } = {}) {
  const templatePct = inferTemplatePercentages(macros, kcalTarget);
  const guardrailResult = applyMacroGuardrails(macros, {
    kcalTarget,
    pesoKg,
    phase,
    templatePct,
    level
  });

  return {
    protein_g: guardrailResult.adjusted_grams.protein_g,
    carbs_g: guardrailResult.adjusted_grams.carbs_g,
    fat_g: guardrailResult.adjusted_grams.fat_g,
    protein_pct: guardrailResult.final_pct.protein_pct,
    carbs_pct: guardrailResult.final_pct.carbs_pct,
    fat_pct: guardrailResult.final_pct.fat_pct,
    kcal_calculated: guardrailResult.kcal_calculated,
    adjustments: guardrailResult.adjustments,
    guardrails_applied: guardrailResult.guardrails_applied
  };
}
