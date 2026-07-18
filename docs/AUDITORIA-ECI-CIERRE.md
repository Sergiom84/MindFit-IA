# Auditoría ECI — Índice de cierre

Expediente índice del programa de cierre de la Auditoría Integral (fuente original:
`Auditoria ECI/Auditor1`). Rama de trabajo: `fix/auditoria-eci-cierre`.

> DOC-001: este documento es el **índice vivo** del estado de cada hallazgo. Los
> snapshots antiguos (Supabase, guía iOS, `.env.production`, contadores) deben
> considerarse **archivados por fecha**, no la fuente de verdad; la fuente es el código
>
> - este índice.

## Estado por hallazgo

| ID       | Severidad | Estado                                                                | Referencia                                                                                |
| -------- | --------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| SEC-004  | P2        | **Cerrado**                                                           | rate limit IA por IP + clasificado por usuario (`backend/middleware/rateLimiters.js`)     |
| DB-001   | P1        | **Cerrado**                                                           | ledger reconciliado 95/95 + CI restore-from-zero (`backend/migrations/RECONCILIATION.md`) |
| AUTH-001 | P1        | **Backend/cliente listos; activación fasada pendiente en Render**     | [AUTH-001-rollout.md](AUTH-001-rollout.md)                                                |
| AI-001   | P1        | **Cerrado**                                                           | Corrección Foto/Vídeo reparada (frames en cliente)                                        |
| DEP-001  | P1        | **Cerrado** (prod limpia) + Dependabot/SBOM                           | [DEP-001-security.md](DEP-001-security.md)                                                |
| ARCH-001 | P2        | **Cerrado**                                                           | [ARCH-001-ADAPTER-UNICO.md](ARCH-001-ADAPTER-UNICO.md)                                   |
| ARCH-002 | P2        | **Cerrado** (cuatro monolitos priorizados, incluida fase profunda)    | [ARCH-002-REFRACTOR-PROFUNDO.md](ARCH-002-REFRACTOR-PROFUNDO.md)                          |
| OPS-002  | P2        | **Cerrado para el gate** (Android AAB reproducible)                   | [OPS-002-mobile.md](OPS-002-mobile.md)                                                    |
| DOC-001  | P3        | **Este documento**                                                    | —                                                                                         |
| UX-001   | P3        | **Cerrado**                                                           | [UX-001-TERMINOLOGIA.md](UX-001-TERMINOLOGIA.md)                                         |
| QA-001   | P3        | **Cerrado**                                                           | [QA-001-ACCESIBILIDAD.md](QA-001-ACCESIBILIDAD.md)                                       |
| PERF-001 | P3        | **Cerrado**                                                           | [PERF-001-RENDIMIENTO.md](PERF-001-RENDIMIENTO.md)                                       |

## Gate para nuevas funcionalidades (auditoría)

- 0 P0 abiertos: ✅
- P1 de auth/DB/CI/config cerrados: ✅ (AUTH-001 requiere solo el flip de flags en Render)
- Restore de staging desde Git demostrado: ✅ (CI job `db-baseline-restore`)
- Suite central en CI sin acceso a producción: ✅
- Un release web y uno móvil reproducibles: web ✅ / Android AAB ✅

## Acciones pendientes fuera del código

1. **Render (Sergio)**: activación fasada de AUTH-001 — ver [AUTH-001-rollout.md](AUTH-001-rollout.md).
2. **Móvil opcional**: certificados/cuenta iOS para publicar en TestFlight; no bloquea el
   gate, que queda cubierto por el AAB Android reproducible.

La rama `main` quedó protegida el 2026-07-18 con `build-test`,
`db-baseline-restore`, `integration-tests`, `dependency-audit` y `a11y-audit` como
checks obligatorios, resolución de conversaciones y bloqueo de force-push/borrado.
