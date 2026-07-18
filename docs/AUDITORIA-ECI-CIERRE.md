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
| ARCH-001 | P2        | **Tokens: cerrado**; base URL: centralización en curso (con ARCH-002) | adapter `tokenManager` / `getApiBaseUrl`                                                  |
| ARCH-002 | P2        | **En curso** (un PR por monolito)                                     | —                                                                                         |
| OPS-002  | P2        | **En curso** (Android CI/AAB); iOS = bloqueo externo                  | —                                                                                         |
| DOC-001  | P3        | **Este documento**                                                    | —                                                                                         |
| UX-001   | P3        | **Bloqueado por decisión de producto** (terminología)                 | —                                                                                         |
| QA-001   | P3        | **En curso** (a11y en CI)                                             | —                                                                                         |
| PERF-001 | P3        | **En curso** (Web Vitals + budgets)                                   | —                                                                                         |

## Gate para nuevas funcionalidades (auditoría)

- 0 P0 abiertos: ✅
- P1 de auth/DB/CI/config cerrados: ✅ (AUTH-001 requiere solo el flip de flags en Render)
- Restore de staging desde Git demostrado: ✅ (CI job `db-baseline-restore`)
- Suite central en CI sin acceso a producción: ✅
- Un release web y uno móvil reproducibles: web ✅ / móvil (AAB) — OPS-002 en curso

## Acciones pendientes fuera del código

1. **Render (Sergio)**: activación fasada de AUTH-001 — ver [AUTH-001-rollout.md](AUTH-001-rollout.md).
2. **GitHub (admin)**: marcar los checks de CI como _required status checks_ sobre `main`
   (ver [DEP-001-security.md](DEP-001-security.md)).
3. **Producto (Sergio)**: decisión de terminología para UX-001.
4. **Móvil (OPS-002)**: certificados/cuenta iOS (bloqueo externo) para el release iOS.
