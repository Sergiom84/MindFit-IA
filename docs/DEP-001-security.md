# DEP-001 — Política de dependencias y seguridad de la cadena de suministro

## Estado (2026-07-18)

- **Producción raíz**: `npm audit --omit=dev` → **0 vulnerabilidades**.
- **Producción backend**: `npm audit --omit=dev` → **0 vulnerabilidades**.
- **Árbol completo** (incluye tooling de desarrollo): deuda **solo en dev**, sin fix
  disponible upstream (ver excepciones).

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

| Paquete                                                                                                                   | Sev      | Cadena / uso                                                          | Motivo de aceptación                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `@capacitor/assets` y su cadena (`@capacitor/cli`, `@trapezedev/project`, `tar`, `minimatch`, `replace`, `xcode`, `uuid`) | high/mod | devDependency raíz: generación de iconos/splash de la app             | Herramienta offline de build; no se ejecuta en runtime ni procesa entrada de usuario. Sin fix upstream.                |

### Follow-ups

- **Importadores Excel**: migrados a `exceljs`; `xlsx`/SheetJS ya no forma parte del árbol.
  El audit completo del backend conserva únicamente dos avisos moderados transitivos de
  tooling (`exceljs` → `uuid`), sin impacto en producción ni severidad alta.
- **`@capacitor/assets`**: actualizar cuando publiquen una versión con la cadena
  (`tar`/`minimatch`) saneada; se coordina con OPS-002 (toolchain móvil).
