# Documentación vigente

Fecha de revisión: 2026-03-06

## Qué leer primero

1. `docs/_active.md`
2. La carpeta referenciada por `docs/_active.md`
3. `docs/REGISTRO_DIARIO_IMPLEMENTACIONES.md`
4. El código real en `src/` y `backend/`

## Qué se considera fuente de verdad

- Estado funcional actual: `docs/_active.md` y la documentación activa enlazada desde ahí.
- Estado técnico real: el código de `src/`, `backend/` y los tests automatizados existentes.
- Contexto de base de datos: `docs/SUPABASE_DATABASE_CONTEXT.md` como snapshot documental; si hay dudas de producción o datos sensibles, verificar contra la base real.
- Operativa local: `docs/COMO_FUNCIONA_SUPABASE_Y_SERVIDOR_LOCAL.md`.
- Operativa de Render: `docs/RENDER_CLI_GUIDE.md`, `docs/QUICK_START_RENDER_LOGS.md` y `docs/USAR_RENDER_DESDE_WINDOWS.md`.

## Cómo interpretar el resto de `docs/`

- Archivos con prefijos `PLAN_`, `PROPUESTA_`, `ANALISIS_`, `VERIFICACION_`, `AUDITORIA_` o `CHECKPOINTS_` son documentos de trabajo, validación o diseño; pueden seguir siendo útiles, pero no describen necesariamente el estado actual si no están enlazados desde `docs/_active.md`.
- Los resúmenes de cierre, reportes narrativos y notas de implementación puntuales se han retirado o reducido cuando ya no aportaban contexto fiable.
- Si un documento contradice al código, prevalece el código.

## Alcance de esta limpieza

- Se han retirado resúmenes finales, guías cerradas y documentos con estados absolutos como "completado al 100%" que ya no eran fiables.
- Se han saneado documentos que exponían datos personales o credenciales.
