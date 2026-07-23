/**
 * 🎨 Utilidades CSS para Tailwind - Entrana con IA
 *
 * Funciones esenciales para manejo de clases CSS dinámicas
 * con resolución automática de conflictos de Tailwind.
 */

import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Combina clases CSS con clsx y resuelve conflictos con tailwind-merge
 *
 * Esta función permite:
 * - Combinar múltiples clases CSS
 * - Aplicar clases condicionalmente
 * - Resolver automáticamente conflictos entre clases de Tailwind
 * - Mantener solo las clases más específicas o últimas relevantes
 *
 * @param {...(string|object|Array|undefined|null|boolean)} inputs - Clases CSS a combinar
 * @returns {string} String con clases CSS combinadas y optimizadas
 *
 * @example
 * // Clases básicas
 * cn('px-4 py-2 bg-blue-500')
 * // → 'px-4 py-2 bg-blue-500'
 *
 * @example
 * // Clases condicionales
 * cn('px-4 py-2', isActive && 'bg-yellow-400', 'text-white')
 * // → 'px-4 py-2 bg-yellow-400 text-white' (si isActive es true)
 *
 * @example
 * // Resolución de conflictos (tailwind-merge)
 * cn('px-4 px-6')
 * // → 'px-6' (mantiene la última clase de padding-x)
 *
 * @example
 * // Uso típico en componentes
 * <button className={cn(
 *   'btn-base',
 *   variant === 'primary' && 'bg-yellow-400 hover:bg-yellow-300',
 *   variant === 'secondary' && 'bg-gray-700 hover:bg-gray-600',
 *   disabled && 'opacity-50 cursor-not-allowed',
 *   className // Props externos
 * )}>
 *
 * @example
 * // Con objetos condicionales
 * cn({
 *   'bg-yellow-400': variant === 'primary',
 *   'bg-red-400': hasError,
 *   'opacity-50': disabled
 * })
 *
 * @see https://github.com/dcastil/tailwind-merge - Documentación tailwind-merge
 * @see https://github.com/lukeed/clsx - Documentación clsx
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

// Re-export de las librerías para uso directo si es necesario
export { clsx } from 'clsx'
export { twMerge } from 'tailwind-merge'
