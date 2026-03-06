# MCP Supabase - referencia vigente

Fecha de revisión: 2026-03-06

## Proyecto obligatorio

- Para este repositorio se usa siempre el proyecto Supabase `lhsnmjgdtjalfcsurxvg`.
- Si tienes varios proyectos conectados, no cambies este identificador salvo decisión explícita.

## Configuración recomendada

- Mantén la configuración del servidor MCP en `.mcp.json`.
- Guarda el token de acceso solo en configuración local; no lo copies en Markdown ni lo subas al repositorio.
- Si cambias la configuración MCP, reinicia el cliente/herramienta que carga los servidores, porque se leen al arranque.

Ejemplo mínimo de configuración segura:

```json
{
  "mcpServers": {
    "supabase": {
      "command": "npx",
      "args": [
        "-y",
        "@supabase/mcp-server-supabase@latest",
        "--project-ref",
        "lhsnmjgdtjalfcsurxvg"
      ],
      "env": {
        "SUPABASE_ACCESS_TOKEN": "<configurar-localmente>"
      }
    }
  }
}
```

## Comprobaciones rápidas

1. Verifica que `.mcp.json` existe en la raíz.
2. Confirma que el `project-ref` es `lhsnmjgdtjalfcsurxvg`.
3. Reinicia el host MCP si acabas de tocar la configuración.
4. Si sigue fallando, revisa el token en tu cuenta de Supabase y vuelve a probar.

## Notas

- Este documento sustituye a las notas antiguas con tokens ficticios, paths de otra máquina y estados de troubleshooting cerrados.
- Las credenciales reales deben vivir en archivos locales ignorados por Git, no en la documentación.
