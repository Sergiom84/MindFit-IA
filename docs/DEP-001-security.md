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
5. **Protección de rama**: Dependabot y el job de CI **no** hacen obligatorios los checks
   por sí solos. **Acción para el admin del repo**: en GitHub → Settings → Branches, marcar
   `build-test`, `db-baseline-restore`, `integration-tests` y `dependency-audit` como
   _required status checks_ sobre `main`.

## Excepciones aceptadas (dev-only, con revisión)

Estas vulnerabilidades viven **exclusivamente en dependencias de desarrollo**, sin
exposición en el camino de peticiones de producción. `fixAvailable: false` al 2026-07-18.
**Revisar el 2026-10-18** (o cuando Dependabot ofrezca un fix).

| Paquete                                                                                                                   | Sev      | Cadena / uso                                                          | Motivo de aceptación                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `@capacitor/assets` y su cadena (`@capacitor/cli`, `@trapezedev/project`, `tar`, `minimatch`, `replace`, `xcode`, `uuid`) | high/mod | devDependency raíz: generación de iconos/splash de la app             | Herramienta offline de build; no se ejecuta en runtime ni procesa entrada de usuario. Sin fix upstream.                |
| `xlsx` (SheetJS)                                                                                                          | high     | devDependency backend: `scripts/import-recipe-examples-from-excel.js` | Script de importación offline ejecutado manualmente; nunca en el camino de peticiones. Sin fix en el registro público. |

### Follow-ups

- **`xlsx`**: migrar el script de importación de recetas a **`exceljs`** (mantenido, sin
  las vulnerabilidades de SheetJS) y retirar `xlsx`. Es un cambio de un script de tooling,
  aislado del runtime.
- **`@capacitor/assets`**: actualizar cuando publiquen una versión con la cadena
  (`tar`/`minimatch`) saneada; se coordina con OPS-002 (toolchain móvil).
