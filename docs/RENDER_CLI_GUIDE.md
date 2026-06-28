# Guía vigente de Render CLI

Fecha de revisión: 2026-03-06

## Objetivo

Usar Render CLI sin depender de documentación vieja, claves incrustadas ni configuración global compartida con otros proyectos.

## Fuente de verdad

- Este repositorio toma la credencial de Render desde `.env` en la raíz del proyecto.
- Se acepta `RENDER_MCP_BEARER_TOKEN` como variable canónica; si existe `RENDER_API_KEY`, también se usa.
- `RENDER_WORKSPACE_ID` o `RENDER_WORKSPACE_NAME` permiten fijar el workspace del proyecto sin usar el global del usuario.
- Los scripts de `scripts/` exportan la credencial solo para el proceso actual y guardan la config de la CLI en `.render/cli.yaml`; no escriben en `~/.bashrc`, PowerShell profile ni variables globales del sistema.

## Instalación

### Windows

- Descarga el binario desde `https://github.com/render-oss/cli/releases/latest`
- O instala con `choco install render` / `scoop install render`

### WSL o Linux

```bash
curl -fsSL https://raw.githubusercontent.com/render-oss/cli/refs/heads/main/bin/install.sh | sh
```

## Comandos válidos en este repositorio

### Autenticación

```bash
npm run render:auth
npm run render:auth:win
```

### Verificación y servicios

```bash
npm run render:whoami
npm run render:services
```

### Logs

```bash
npm run render:logs:win list
npm run render:logs:win tail <service>
npm run render:logs:win view <service> [limit]
npm run render:logs:win errors <service>
npm run render:tail
```

## Importante

- `npm run render:login` no existe en este repositorio; el comando correcto es `npm run render:auth` o `npm run render:auth:win`.
- No guardes API keys en archivos `.md`.
- No incrustes `RENDER_API_KEY` o `RENDER_MCP_BEARER_TOKEN` en scripts versionados.
- Si actualizas la credencial o el workspace, hazlo en el `.env` de este proyecto.

## Flujo recomendado

1. Autentícate con `npm run render:auth` o `npm run render:auth:win`.
2. Comprueba el acceso con `npm run render:whoami`.
3. Lista servicios con `npm run render:services`.
4. Mira logs con `npm run render:logs:win ...` o con `npm run render:tail` si tu CLI local ya está lista.

## Si algo falla

- Revisa `docs/RENDER_AUTH_TROUBLESHOOTING.md`.
- Si solo quieres ver logs rápido, usa el dashboard web de Render.
