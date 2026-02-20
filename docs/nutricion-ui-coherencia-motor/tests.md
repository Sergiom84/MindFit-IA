que # Tests — UI Nutrición coherente con motor v2

## Estrategia por fase

- Fase 1: validación manual de banner, acciones y ayuda contextual.
- Fase 2: validación manual con plan activo y sin plan activo.
- Fase 3: validación manual de cálculos, botones y compensación.

## Casos borde

- Usuario sin plan activo ni calendario.
- Usuario con múltiples planes activos previos (debe quedar solo el último).
- Plan activo con calendario vacío.
- Fechas de calendario con timestamp (asegurar parseo correcto).
- Plan activo con metodología no mapeada (fallback a “general”).
- Perfil nutricional incompleto (sin estimaciones).
- Discrepancias múltiples entre perfil general y nutrición.
- Compensación semanal con `compensation_plan` vacío.
- Plan activo con duración larga: verificar texto de revisión automática cada 14 días.

## Datos de prueba

- Usuario con plan activo y calendario real (workout_schedule generado).
- Usuario sin plan activo.
- Usuario con varios planes activos históricos para validar archivado.
- Usuario con perfil nutricional completo y estimaciones.
- Usuario con perfil incompleto.
- Usuario con discrepancias en perfil general vs nutrición (para probar persistencia del sync).
- Usuario con plan activo de hipertrofia/fuerza/resistencia para validar mapeo de tipo.
- Plan activo con primera semana parcial (arranque mid-week) y siguiente semana completa, para validar calendario diario.
- Registro de salto con `compensation_plan.days`.

## Comandos

- `npm run lint`
- `npm run build`

## Criterio para avanzar de fase

- Todas las pruebas manuales listadas en la fase pasan.
- No hay errores de consola al navegar por Nutrición.

## Resultados

- No se ejecutaron tests en esta iteración.
