/**
 * 🪝 useWorkout - Hook Facade para Compatibilidad
 *
 * PROPÓSITO: Proporcionar una interfaz de transición para componentes existentes
 * DEPRECADO: Este hook es temporal durante la migración
 *
 * Los componentes deberían usar directamente:
 * import { useWorkout } from '../contexts/WorkoutContext';
 *
 * Pero durante la transición pueden usar este archivo para compatibilidad.
 */

export { useWorkout } from '../contexts/WorkoutContext';