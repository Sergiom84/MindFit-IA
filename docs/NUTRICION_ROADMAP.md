# Hoja de ruta Nutrición & Bridge (Feb 1, 2026)

## Implementado

- **Metabolismo y macros**: Cuestionario cuantificado (score S), anti-ruido (2 evaluaciones, cambio máximo 1 categoría), confianza alta/media/baja con fallback a mixto, rangos de macros por perfil (tolerante/mixto/intolerante) y guardarraíles (proteína mínima por fase, grasa ≥0.6 g/kg o 20% kcal). Persistencia en `app.user_metabolic_*` y `app.nutrition_profiles`.
- **Control nutricional integral**: Semáforos ICG/IPG/IEC, detección de mediciones sospechosas, pliegues y perímetros opcionales, validación automática, API de mediciones completas y endpoints de progreso/alertas. Umbrales ICG/IPG alineados al doc (ICG verde+ 0.5–0.7, verde 0.8–0.9, amarillo 1.0–1.4; IPG verde+ 1.2–1.5, verde 0.8–1.2, amarillo 0.6–0.8). Carb cycling D0/D1/D2 operativo desde el bridge.
- **Saltos de dieta (schema + flujo básico)**: Tablas de saltos, objetivos semanales y plan de compensación diario; anti-ruido simple (confianza baja reduce 50%); límite 20% de kcal/día restante; endpoints `dietDeviation`.
- **Puente Entrenamiento↔Nutrición**: Estado unificado, carb cycling por tipo de día, matriz de fatiga/flags, logs de decisiones, endpoints bridge registrados en `server.js`.
- **Carb timing**: Migración, servicios y rutas pre/post/daily/quick-guide integrados.
- **Frontend**: `NutritionDashboard` accesible desde la pestaña "Dashboard Nutrición" (dentro de la sección Nutrición), con mediciones (form + history + semáforo), cheat meals, carb timing guide, post-workout modal y cuestionario metabólico; exportador en `src/components/nutrition/index.js`.

## Pendiente / Gaps detectados

- **Anti-ruido 14 días real**: Cambios de fase/kcal no deberían aplicarse por una sola semana; falta media móvil 14d + doble confirmación en bridge y reevaluación automática quincenal (metabolismo + calorías).
- **IEC (mantenimiento) en ventana fija 14d**: falta ajustar IEC a una ventana fija de 14 días y/o confirmación doble; ICG/IPG ya están alineados al documento.
- **Saltos de dieta**: No se aplica proteína fija ni reparto de corrección por fase (volumen: carbos primero; definición: carbos manteniendo grasa mínima; normo: neutro/no compensar si no supera objetivo semanal). No se rellenan macros en el plan de compensación ni se revisa al cierre semanal.
- **Puente reglas compuestas**: Falta tabla coordinada de acciones (déficit+rendimiento baja+fatiga alta; superávit+ICG alto; normo+rendimiento cae) con confirmación 2 semanas. Jerarquía de decisiones y snapshots semanales sin implementar.
- **Frontend integración**: falta vincular `NutritionDashboard` con HipertrofiaV2/bridge (confirmaciones 14d, alertas y acciones coordinadas) para que el usuario vea el loop completo nutrición ↔ entrenamiento.
- **Reevaluación metabólica**: Falta scheduler/recordatorio 14d y uso sistemático de señales objetivas (peso/cintura) en todas las evaluaciones.
- **Logging y explicabilidad**: No se emite mensaje corto al usuario ni snapshot semanal con fase, kcal/macros, perfil metabólico, CLS, flags.

## Mejoras sugeridas (orden prioridad)

1. Anti-ruido y confirmación 14d en bridge y nutrición-v2 (bloquear cambios sin doble confirmación o media móvil).
2. Ajustar IEC a ventana fija 14d y aplicar tabla de acciones coordinadas (nutrición ↔ entrenamiento).
3. Saltos de dieta: proteína estable (2 g/kg), reparto de corrección por fase, macros en `daily_compensation_plan`, reevaluación al cierre semanal.
4. Completar integración UI con HipertrofiaV2/bridge (confirmaciones 14d, alertas, acciones) y exponer semáforo/compensación/timing en el loop de uso.
5. Snapshots semanales + mensajes explicativos en decision logs.
6. Scheduler de reevaluación metabólica cada 14 días con recordatorio al usuario.
