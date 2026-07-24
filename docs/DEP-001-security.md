# DEP-001 — Política de dependencias y seguridad de la cadena de suministro

## Estado (2026-07-24)

- **Producción raíz**: `npm audit --omit=dev --audit-level=high` → **0 high/critical**;
  permanece un aviso moderado de `tar` (`GHSA-r292-9mhp-454m`) en la cadena de
  `@capacitor/cli`.
- **Producción backend**: `npm audit --omit=dev` → **0 vulnerabilidades**.
- **Árbol completo** (incluye tooling de desarrollo): los avisos high/critical
  residuales están solo en dev y sin fix upstream; el moderate productivo de `tar`
  queda visible por debajo del umbral bloqueante.

## Corrección React Router 8.3.0

`react-router` 7.18.1 estaba afectado por `GHSA-qwww-vcr4-c8h2`. Se corrige sin
excepción de audit ni downgrade:

- runtime fijado en Node `24.14.1` mediante `.node-version` y
  `engines.node: ">=24.14.1 <25"`; CI y Android consumen la misma fuente;
- React y ReactDOM fijados en `19.2.7`;
- `react-router` fijado en `8.3.0` y retirada total de `react-router-dom`, eliminado
  en la versión 8;
- los 22 imports existentes pasan a `react-router`; todos usan APIs declarativas y
  no se introduce modo framework ni React Server Components.

Validación reproducible con Node `24.14.1`:

- instalación limpia raíz y backend: `npm ci` y `npm ci --prefix backend`;
- audit productivo raíz: 0 high/critical, 1 moderate de `tar`; backend: 0;
- lint quiet, build productivo y budget de 17 chunks: verdes;
- backend: 479 pass, 0 fail y 1 TODO heredado de Calistenia;
- contratos focales de navegación: 18/18 y 10 exports declarativos requeridos
  presentes en `react-router`.

## Política

1. **Gate duro en CI** (job `dependency-audit` en `.github/workflows/ci.yml`):
   `npm audit --omit=dev --audit-level=high` en raíz y backend. Un PR que introduzca una
   vulnerabilidad **high/critical en producción** pone el CI en rojo.
2. **Runtime vs dev**: solo se **bloquea** por vulnerabilidades de _producción_. El árbol
   completo se audita en modo **informativo** (no bloquea) para dar visibilidad a la deuda
   de tooling.
3. **Dependabot** (`.github/dependabot.yml`): PRs semanales para raíz, backend y GitHub
   Actions; minor/patch agrupados; majors sueltos para revisión.
4. **SBOM CycloneDX**: se genera por build (raíz y backend) y se sube como artefacto.
5. **Protección de rama**: aplicada el 2026-07-18. `build-test`,
   `db-baseline-restore`, `integration-tests`, `dependency-audit` y `a11y-audit` son
   _required status checks_ sobre `main`; también se exige resolver conversaciones y se
   impiden force-push y borrado.

## Excepciones aceptadas (dev-only, con revisión)

Estas vulnerabilidades viven **exclusivamente en dependencias de desarrollo**, sin
exposición en el camino de peticiones de producción. `fixAvailable: false` al 2026-07-18.
**Revisar el 2026-10-18** (o cuando Dependabot ofrezca un fix).

| Paquete                                                                                                                   | Sev      | Cadena / uso                                              | Motivo de aceptación                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `@capacitor/assets` y su cadena (`@capacitor/cli`, `@trapezedev/project`, `tar`, `minimatch`, `replace`, `xcode`, `uuid`) | high/mod | devDependency raíz: generación de iconos/splash de la app | Herramienta offline de build; no se ejecuta en runtime ni procesa entrada de usuario. Sin fix upstream. |

### Follow-ups

- **Importadores Excel**: migrados a `exceljs`; `xlsx`/SheetJS ya no forma parte del árbol.
  El audit completo del backend conserva únicamente dos avisos moderados transitivos de
  tooling (`exceljs` → `uuid`), sin impacto en producción ni severidad alta.
- **`@capacitor/assets`**: actualizar cuando publiquen una versión con la cadena
  (`tar`/`minimatch`) saneada; se coordina con OPS-002 (toolchain móvil).
