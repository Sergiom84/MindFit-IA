# Registro diario de implementaciones

## 22.01.2026

- Evita que el reproductor se abra al arrastrar el botón flotante mediante un umbral de movimiento para distinguir click de drag.
- Añadidas confirmaciones de “ninguna/ninguno” en listas de perfil (alergias, medicación, lesiones, suplementación y alimentos excluidos) para guardar explícitamente que no aplica.
- Cálculo de progreso del perfil por campo alineado con BD y modal de pendientes con edición inline (incluye preferencias IA y equipamiento con opción “no tengo”).
- Home convertido en dashboard con estado del plan activo, sesión de hoy y accesos rápidos.
- Acceso directo a la calculadora de composición corporal desde el modal de campos pendientes.
- Notas de progreso excluidas del cálculo de completitud del perfil al ser opcionales.
- Parche SQL en `calculate_mean_rir_last_microcycle` para promediar últimas 5 sesiones y evitar error al avanzar microciclo.
- Ajuste SQL en `evaluate_level_change` para calcular `progression_rate` con columnas reales de `hypertrophy_progression`.

## 21.01.2026

- Ajuste en la deteccion del entrenamiento de hoy para priorizar la sesion real del dia y evitar que se marque descanso cuando hay entrenamiento.
- Envio de la fecha de la sesion desde la pestana de hoy para asegurar que se muestre lo realizado en el dia.
- Bloqueo de ejercicios rechazados en el entrenamiento en casa: se incluye la lista en el prompt, se filtran tras la IA y se guardan con upsert en `home_exercise_rejections`.
- Ayuda contextual en `EditableField` con helpText y etiqueta unificada.
- Aclaracion de etiquetas en perfil (nivel de actividad con ayuda, peso y estatura con unidades).
- Modal de cambios sin guardar al cambiar de pestana en el perfil.
- Se amplio el constraint de estados de sesion para permitir `incomplete` y `abandoned` en la tabla de sesiones de metodologia.
- Script de simulacion HipertrofiaV2 y reportes tecnico/narrativo en `docs/`.
- Mejora de logging en el script de simulacion HipertrofiaV2 para identificar el endpoint que falla.
- Fix en cancelacion de plan activo: UPDATE con ORDER BY/LIMIT reemplazado por CTE.
- Ajuste del script HipertrofiaV2 para enviar RIR entero y normalizar exercise_id.
- Busqueda por nombre en catalogo de ejercicios extendida a hipertrofia + fallback de exercise_id en simulacion.
