# Guía vigente de Render CLI

Fecha de revisión: 2026-03-06

## Objetivo

Usar Render CLI sin depender de documentación vieja ni de credenciales incrustadas en Markdown.

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
- Si usas `RENDER_API_KEY`, configúrala solo en entorno local o en tu shell, nunca en documentación versionada.

## Flujo recomendado

1. Autentícate con `npm run render:auth` o `npm run render:auth:win`.
2. Comprueba el acceso con `npm run render:whoami`.
3. Lista servicios con `npm run render:services`.
4. Mira logs con `npm run render:logs:win ...` o con `npm run render:tail` si tu CLI local ya está lista.

## Si algo falla

- Revisa `docs/RENDER_AUTH_TROUBLESHOOTING.md`.
- Si solo quieres ver logs rápido, usa el dashboard web de Render.
