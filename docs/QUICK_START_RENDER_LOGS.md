# Acceso rápido a logs de Render

Fecha de revisión: 2026-03-06

## Opción más rápida

1. Abre `https://dashboard.render.com`
2. Entra en tu servicio
3. Abre la pestaña `Logs`

## Opción por CLI

### Verifica que estás autenticado

```bash
npm run render:whoami
```

### Lista servicios

```bash
npm run render:services
```

### Consulta logs desde Windows

```bash
npm run render:logs:win list
npm run render:logs:win tail <service>
npm run render:logs:win view <service> 200
npm run render:logs:win errors <service>
```

### Consulta logs con CLI directa

```bash
npm run render:tail
```

## Notas

- Sustituye `<service>` por el identificador real del recurso en Render.
- Si la autenticación no funciona, usa `npm run render:auth` o `npm run render:auth:win`.
- Esta guía ya no guarda datos de cuenta, emails ni API keys.
