# Cómo usar Render desde Windows

Fecha de revisión: 2026-03-06

## Comandos disponibles

Desde `CMD` o `PowerShell`, en la raíz del proyecto:

```bash
npm run render:auth:win
npm run render:whoami
npm run render:services
npm run render:logs:win list
npm run render:logs:win tail <service>
npm run render:logs:win view <service> 100
npm run render:logs:win errors <service>
```

## Qué hacen estos scripts

- `render:auth:win` inicia autenticación de la CLI nativa de Windows.
- `render:whoami` y `render:services` usan wrappers que llaman a WSL para consultar Render.
- `render:logs:win` usa el ejecutable `render` disponible en Windows y acepta `list`, `tail`, `view` y `errors`.

## Recomendación práctica

- Si solo necesitas logs, el dashboard web suele ser más rápido.
- Si vas a trabajar desde terminal, instala Render CLI en Windows y usa `render:auth:win`.

## Troubleshooting rápido

- Si `render:logs:win` falla, comprueba que `render` está instalado con `render --version`.
- Si los wrappers que usan WSL fallan, comprueba `wsl --version`.
- Si no estás autenticado, ejecuta `npm run render:auth:win`.
