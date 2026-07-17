// Constantes de rol para nutrición V2 (ARCH-002).
// Tabla de roles de reemplazo (fallbacks) compartida por el generador determinista y
// por la compatibilidad de swaps. Se extrae a un módulo propio para evitar la
// dependencia circular entre el engine y macroMath.

export const SLOT_ROLE_FALLBACKS = {
  PROTEINA_ANIMAL: ['PROTEINA_ANIMAL_MAGRA', 'PROTEINA_ANIMAL_GRASA', 'PROTEINA_VEGETAL'],
  PROTEINA_ANIMAL_MAGRA: ['PROTEINA_ANIMAL', 'PROTEINA_VEGETAL'],
  PROTEINA_VEGETAL: ['LEGUMBRE', 'SUPLEMENTO_PROTEINA'],
  CARBO_BASE: ['CARBO_COCIDO', 'CARBO_PAN', 'CARBO_AVENA'],
  GRASA_BASE: ['GRASA_ACEITE', 'GRASA_FRUTOS_SECOS', 'GRASA_CREMAS', 'GRASA_SEMILLAS'],
  LACTEO_PROTEICO_MAGRO: ['LACTEO_BASE', 'PROTEINA_VEGETAL', 'SUPLEMENTO_PROTEINA'],
  HUEVO: ['PROTEINA_ANIMAL_MAGRA', 'PROTEINA_VEGETAL'],
  LEGUMBRE: ['PROTEINA_VEGETAL', 'CARBO_BASE'],
  SUPLEMENTO_PROTEINA: ['PROTEINA_VEGETAL']
};
