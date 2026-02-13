import { planHybridMenuSelection } from "./nutritionHybridPlanner.js";
import {
  validateHybridSelection,
  validateHybridSolvedMenu
} from "./nutritionHybridValidator.js";
import { solveHybridMenu } from "./nutritionHybridSolver.js";

export class HybridMenuGenerationError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = "HybridMenuGenerationError";
    this.code = code;
    this.details = details;
  }
}

export async function generateHybridMenuForMeal({
  meal,
  dayInfo,
  availableFoods,
  varietyContext = null,
  conversionFactors = [],
  model
}) {
  const attemptConfigs = [
    { maxCandidateFoods: 36, plannerMode: "strict" },
    { maxCandidateFoods: 72, plannerMode: "repair" }
  ];
  const maxAttempts = attemptConfigs.length;
  let attempt = 1;
  let solverFeedback = null;
  let totalTokensUsed = 0;
  let lastError = null;

  while (attempt <= maxAttempts) {
    const attemptConfig = attemptConfigs[attempt - 1];
    const plannerResult = await planHybridMenuSelection({
      meal,
      dayInfo,
      availableFoods,
      varietyContext,
      model,
      attempt,
      solverFeedback,
      maxCandidateFoods: attemptConfig.maxCandidateFoods,
      plannerMode: attemptConfig.plannerMode
    });
    totalTokensUsed += Number(plannerResult?.metadata?.tokens_used || 0);

    if (plannerResult?.planner?.status === "infeasible") {
      lastError = new HybridMenuGenerationError(
        "planner_infeasible",
        "El planner IA marcó la comida como no viable",
        {
          attempt,
          infeasible_reason: plannerResult?.planner?.infeasible_reason || null
        }
      );
      solverFeedback = plannerResult?.planner?.infeasible_reason || "Planner indicó no viable";
      attempt += 1;
      continue;
    }

    const selectionValidation = validateHybridSelection({
      selectedFoods: plannerResult.selectedFoods,
      availableFoods,
      minItems: 3
    });

    if (!selectionValidation.valid) {
      lastError = new HybridMenuGenerationError(
        "invalid_planner_selection",
        "La selección del planner IA no pasó validación",
        {
          attempt,
          issues: selectionValidation.issues
        }
      );
      solverFeedback = `Selección inválida: ${selectionValidation.issues.join("; ")}`;
      attempt += 1;
      continue;
    }

    const solved = solveHybridMenu({
      meal,
      selectedFoods: selectionValidation.selectedFoods,
      conversionFactors
    });

    const solvedValidation = validateHybridSolvedMenu({
      menu: solved.menu,
      meal,
      maxAllowedErrorPercent: 35
    });

    if (!solvedValidation.valid) {
      lastError = new HybridMenuGenerationError(
        "invalid_solver_output",
        "El solver híbrido produjo un menú fuera de tolerancia",
        {
          attempt,
          issues: solvedValidation.issues,
          summary: solvedValidation.summary
        }
      );
      solverFeedback = `Solver fuera de tolerancia. max_error=${solvedValidation.summary?.max_error ?? "n/a"}; issues=${solvedValidation.issues.join("; ")}`;
      attempt += 1;
      continue;
    }

    return {
      menu: solved.menu,
      metadata: {
        mode: "hybrid_ai",
        model_used: plannerResult.metadata.model_used,
        tokens_used: totalTokensUsed || plannerResult.metadata.tokens_used,
        max_error: solved.metadata.max_error,
        planner_notes: plannerResult.planner.notes,
        fallback_used: false,
        attempts_used: attempt,
        planner_mode: attemptConfig.plannerMode,
        candidate_foods: plannerResult.metadata?.candidate_foods || null
      },
      planner: plannerResult.planner,
      availableFoods: selectionValidation.selectedFoods
    };
  }

  throw lastError || new HybridMenuGenerationError(
    "hybrid_unknown_error",
    "No se pudo generar menú híbrido tras reintentos",
    { maxAttempts }
  );
}
