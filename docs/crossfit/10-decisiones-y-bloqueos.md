# Registro de decisiones y bloqueos

## Decisiones cerradas

| ID         | Decision                                                                                           | Estado              |
| ---------- | -------------------------------------------------------------------------------------------------- | ------------------- |
| DEC-CF-001 | Gate externo = Fase 0 compartida, no roadmap CrossFit                                              | cerrada             |
| DEC-CF-002 | Tres niveles core; Elite/competicion fuera                                                         | cerrada             |
| DEC-CF-003 | Nivel, skill y escala separados                                                                    | cerrada             |
| DEC-CF-004 | Generador determinista; IA no rompe reglas                                                         | cerrada             |
| DEC-CF-005 | ACWR no es predictor ni hard gate                                                                  | cerrada             |
| DEC-CF-006 | Catalogo versionado; dosis separada de identidad                                                   | cerrada             |
| DEC-CF-007 | Benchmarks son WOD, no movimientos                                                                 | cerrada             |
| DEC-CF-008 | Nutricion usa motor canonico y training load                                                       | cerrada             |
| DEC-CF-009 | Dolor/seguridad precede a rendimiento                                                              | cerrada             |
| DEC-CF-010 | Default publico neutral hasta revision legal                                                       | cerrada por defecto |
| DEC-CF-011 | No modificar frontend agnostico/redireccion/convergencia                                           | cerrada             |
| DEC-CF-012 | Referencias no canónicas se modelan como variantes heredadas del padre, no como movimientos nuevos | cerrada             |
| DEC-CF-013 | Catálogo activo inmutable; importación siempre draft y activación separada                         | cerrada             |

## Fase 0 desbloqueada para desarrollo, rollout pendiente

| Dependencia  | Contrato esperado             | Archivos objetivo                  | Test                   | Gate de activación                             |
| ------------ | ----------------------------- | ---------------------------------- | ---------------------- | ---------------------------------------------- |
| planned load | `training-load/v1` por sesión | registry/builders/CrossFit adapter | schema + integration   | valid >=99 %, degradados <1 % justificados     |
| day identity | `plan_id+day_id`              | plan persistence/Today             | timezone/backfill/E2E  | no tocar deuda histórica; nuevos enlaces 100 % |
| close/outbox | atomic result + event         | complete route/adapter             | duplicate/out-of-order | cero duplicados, reintentos verdes             |
| nutrition    | D0/D1/D2 mapper               | load mapper/worker                 | shadow parity          | shadow + métricas + aprobación                 |
| metrics      | valid/degraded/fallback       | observability                      | synthetic alerts       | umbrales y dashboards aprobados                |

## Requiere decision Pablo/Sergio

1. Confirmar nombre publico neutral o iniciar revision/licencia de marca.
2. Politica para menores 13-17: default documental es solo principiante tecnico supervisado y sin alta intensidad automatica.
3. Confirmar que embarazo/posparto se mantiene bloqueado hasta proyecto clinico dedicado; esta es la opcion segura recomendada.
4. Aprobar estrategia RLS/service-role y ventana de migracion.
5. Confirmar owners humanos de revision deportiva y nutricional.

Ninguna de estas decisiones invalida el desarrollo ya abierto mientras se mantengan los defaults conservadores; sí bloquean producción o la parte específica del producto si se quieren ampliar menores o embarazo.

## Requiere validacion humana

- ratios/alternativas de clasificacion y checklists tecnicos;
- dosis high skill y progresiones;
- las 120 correspondencias y nuevas filas;
- matriz de sintomas/sustituciones y copy de derivacion;
- energia/macros/timing/RED-S/hidratacion;
- muestra final de planes, sesiones y escalas;
- revision juridica independiente de marca.

## Gates todavía no validados en infraestructura

El determinismo puro, las distribuciones y la idempotencia de servicios cuentan con tests locales; no están validados aún RLS, migraciones, cierre/outbox contra PostgreSQL, offline real, shadow nutricional ni E2E. Los documentos y suites definen oráculos, pero no sustituyen la ejecución en CI efímero ni la revisión humana.
