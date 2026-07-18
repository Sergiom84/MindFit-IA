import apiClient from "../lib/apiClient";
import { createSharedOptionalReadCache } from "../utils/sharedOptionalReadCache";

const sharedNutritionReads = createSharedOptionalReadCache(
  (path) => apiClient.get(path, { cache: false, retries: 0 }),
  () => apiClient.getAuthToken()
);

export const getNutritionProfile = (options) =>
  sharedNutritionReads.read("/nutrition-v2/profile", options);

export const getActiveNutritionPlan = (options) =>
  sharedNutritionReads.read("/nutrition-v2/active-plan", options);

export const invalidateNutritionProfile = () =>
  sharedNutritionReads.invalidate("/nutrition-v2/profile");

export const invalidateActiveNutritionPlan = () =>
  sharedNutritionReads.invalidate("/nutrition-v2/active-plan");
