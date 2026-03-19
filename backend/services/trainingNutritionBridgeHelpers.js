import { calculateMacros } from "./nutritionCalculator.js";

export function calculateBridgeOverrideMacros(overrideKcal, profile = {}, objectivePhase = null) {
  return calculateMacros(
    overrideKcal,
    profile.peso_kg,
    profile.training_type || "hipertrofia",
    objectivePhase || profile.objetivo || "mant",
    profile.metabolic_type,
    profile.metabolic_confidence,
    profile.level || profile.nivel_entrenamiento || "intermedio"
  );
}
