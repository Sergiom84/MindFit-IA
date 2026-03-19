# 🚀 Guía Práctica: Configurar Servidores MCP en Claude Code

## ¿Qué es MCP?

**MCP (Model Context Protocol)** es como un "puente" que conecta Claude Code con servicios externos:

- GitHub (para gestionar repositorios)
- Supabase (para bases de datos)
- Render (para deployment)
- Y muchos más...

**Piensa en MCP como "enchufes"** que le dan a Claude nuevos poderes para interactuar con tus herramientas favoritas.

---

## 📋 Antes de Empezar

### ✅ Checklist

- [ ] Tienes Claude Code instalado en VS Code
- [ ] Tienes acceso a terminal/línea de comandos
- [ ] Sabes qué servicio quieres conectar

---

## 🎯 Tipos de Servidores MCP

Hay **2 tipos principales**:

### 1️⃣ **Servidores NPM (stdio)**

- Se instalan con `npx` (Node Package Manager)
- Corren en tu computadora
- Ejemplos: GitHub, Supabase, PostgreSQL

### 2️⃣ **Servidores HTTP (remotos)**

- Se conectan a un servidor en internet
- No necesitan instalación local
- Ejemplos: Render, Stripe, APIs externas

---

## 📖 Guía Paso a Paso

### PASO 1: Identificar Qué Necesitas

**Pregúntate:**

- ¿Qué servicio quiero conectar?
- ¿Es un paquete npm o un servidor HTTP?
- ¿Tengo las credenciales necesarias (API keys, tokens)?

---

### PASO 2: Obtener Credenciales

Cada servicio requiere autenticación:

#### GitHub

1. Ve a: https://github.com/settings/tokens
2. Clic en "Generate new token (classic)"
3. Selecciona permisos: `repo`, `read:org`
4. Copia el token: `ghp_xxxxxxxxxxxx`

#### Supabase

1. Ve a: https://supabase.com/dashboard/account/tokens
2. Clic en "Generate new token"
3. Copia el token: `sbp_xxxxxxxxxxxx`

#### Render

1. Ve a: https://dashboard.render.com/account/api-keys
2. Clic en "Create API Key"
3. Copia la key: `rnd_xxxxxxxxxxxx`

---

### PASO 3: Configurar el Servidor MCP

Tienes **2 opciones**:

---

## 🅰️ OPCIÓN A: Comando CLI (Recomendado)

### Para Servidores NPM (GitHub, Supabase, etc.)

**Sintaxis básica:**

```bash
claude mcp add --scope project <nombre> <paquete-npm>
```

**Ejemplos:**

#### GitHub

```bash
# No funciona directamente con CLI, usa Opción B
```

#### Supabase

```bash
claude mcp add --scope project supabase npx @supabase/mcp-server-supabase --access-token sbp_TU_TOKEN_AQUI
```

---

### Para Servidores HTTP (Render, APIs, etc.)

**Sintaxis:**

```bash
claude mcp add --transport http --scope project <nombre> <url> --header "Authorization: Bearer <TOKEN>"
```

**Ejemplo Render:**

```bash
claude mcp add --transport http --scope project render https://mcp.render.com/mcp --header "Authorization: Bearer rnd_TU_API_KEY"
```

---

## 🅱️ OPCIÓN B: Archivo .mcp.json (Manual)

### Ubicación del archivo:

```
tu-proyecto/
└── .mcp.json
```

### Formato básico:

```json
{
  "mcpServers": {
    "nombre-servidor": {
      "command": "npx",
      "args": ["-y", "paquete-npm"],
      "env": {
        "VARIABLE": "valor"
      }
    }
  }
}
```

---

### Ejemplos Completos:

#### 1. GitHub MCP

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_TU_TOKEN_AQUI"
      }
    }
  }
}
```

#### 2. Supabase MCP

```json
{
  "mcpServers": {
    "supabase": {
      "command": "npx",
      "args": [
        "-y",
        "@supabase/mcp-server-supabase",
        "--access-token",
        "sbp_TU_TOKEN_AQUI"
      ]
    }
  }
}
```

#### 3. Render MCP (HTTP)

```json
{
  "mcpServers": {
    "render": {
      "type": "http",
      "url": "https://mcp.render.com/mcp",
      "headers": {
        "Authorization": "Bearer rnd_TU_API_KEY"
      }
    }
  }
}
```

---

## 🔄 PASO 4: Habilitar el Servidor

### En `.claude/settings.local.json`:

```json
{
  "enableAllProjectMcpServers": true,
  "enabledMcpjsonServers": ["github", "supabase", "render"]
}
```

**¿Qué hace esto?**

- `enableAllProjectMcpServers`: Activa todos los servidores del proyecto
- `enabledMcpjsonServers`: Lista de servidores específicos habilitados

---

## ✅ PASO 5: Verificar la Conexión

### 1. Reinicia Claude Code/VS Code

**Importante:** Los servidores MCP solo se cargan al inicio.

### 2. Verifica en terminal:

```bash
claude mcp list
```

**Deberías ver:**

```
✓ github: Connected
✓ supabase: Connected
✓ render: Connected
```

### 3. Prueba dentro de Claude Code:

En el chat de Claude Code, pregunta:

```
"¿Puedes listar mis proyectos de Supabase?"
"¿Cuáles son mis repositorios de GitHub?"
```

---

## 🔧 Solución de Problemas Comunes

### ❌ "Failed to connect"

**Causas posibles:**

1. **Token inválido/expirado**
   - Solución: Genera un nuevo token

2. **Paquete npm incorrecto**
   - Solución: Verifica el nombre exacto del paquete

3. **No reiniciaste Claude Code**
   - Solución: Cierra y abre VS Code completamente

---

### ❌ "Server not found"

**Causa:** No está en `enabledMcpjsonServers`

**Solución:**

```json
{
  "enabledMcpjsonServers": [
    "github",
    "supabase",
    "tu-servidor-aqui" // ← Agrégalo aquí
  ]
}
```

---

### ❌ "Cannot read property 'xxx' of undefined"

**Causa:** Formato JSON incorrecto

**Solución:**

- Verifica que todas las comillas sean `"` (no `'`)
- Verifica que no falten comas
- Usa un validador JSON: https://jsonlint.com

---

## 📚 Servidores MCP Populares

### GitHub

- **Paquete**: `@modelcontextprotocol/server-github`
- **Necesitas**: GitHub Personal Access Token
- **Funciones**: Crear repos, issues, PRs, buscar código

### Supabase

- **Paquete**: `@supabase/mcp-server-supabase`
- **Necesitas**: Supabase Access Token
- **Funciones**: Gestionar proyectos, ejecutar SQL, migrations

### Render (HTTP)

- **URL**: `https://mcp.render.com/mcp`
- **Necesitas**: Render API Key
- **Funciones**: Deploy apps, ver logs, gestionar servicios

### PostgreSQL

- **Paquete**: `@modelcontextprotocol/server-postgres`
- **Necesitas**: Connection string
- **Funciones**: Ejecutar queries, gestionar tablas

### Filesystem

- **Paquete**: `@modelcontextprotocol/server-filesystem`
- **Necesitas**: Rutas permitidas
- **Funciones**: Leer/escribir archivos locales

---

## 🎓 Mejores Prácticas

### ✅ DO (Haz esto):

- Usa `--scope project` para compartir con el equipo
- Guarda tokens en variables de entorno en producción
- Reinicia siempre después de cambios en configuración
- Verifica con `claude mcp list` antes de usar

### ❌ DON'T (No hagas esto):

- Subir tokens/API keys a GitHub
- Usar servidores sin verificar su conexión
- Configurar muchos servidores innecesarios (consume recursos)
- Olvidar renovar tokens expirados

---

## 📖 Estructura de Archivos Completa

```
tu-proyecto/
├── .mcp.json                      # ← Configuración de servidores MCP
├── .claude/
│   └── settings.local.json        # ← Servidores habilitados
├── .gitignore                     # ← Importante: ignora tokens
└── src/
    └── ...
```

**Contenido de `.gitignore`:**

```
.claude/settings.local.json
.env
```

---

## 🚀 Ejemplo Completo: Proyecto con 3 Servidores

### `.mcp.json`

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_xxxxxxxxxxxx"
      }
    },
    "supabase": {
      "command": "npx",
      "args": [
        "-y",
        "@supabase/mcp-server-supabase",
        "--access-token",
        "sbp_xxxxxxxxxxxx"
      ]
    },
    "render": {
      "type": "http",
      "url": "https://mcp.render.com/mcp",
      "headers": {
        "Authorization": "Bearer rnd_xxxxxxxxxxxx"
      }
    }
  }
}
```

### `.claude/settings.local.json`

```json
{
  "permissions": {
    "allow": [
      "Bash(npm install:*)",
      "WebSearch",
      "mcp__supabase__list_projects",
      "mcp__github__search_repositories"
    ]
  },
  "enableAllProjectMcpServers": true,
  "enabledMcpjsonServers": ["github", "render", "supabase"]
}
```

---

## 🎯 Resumen Rápido

1. **Obtén credenciales** del servicio que quieres conectar
2. **Elige método**: CLI (`claude mcp add`) o Manual (`.mcp.json`)
3. **Configura el servidor** con el formato correcto
4. **Habilítalo** en `.claude/settings.local.json`
5. **Reinicia** Claude Code
6. **Verifica** con `claude mcp list`
7. **Prueba** pidiendo a Claude que use el servicio

---

## 📚 Recursos Útiles

- [Documentación oficial MCP](https://docs.claude.com/en/docs/claude-code/mcp)
- [Lista de servidores MCP](https://github.com/modelcontextprotocol/servers)
- [Render MCP Docs](https://render.com/docs/mcp-server)
- [Supabase MCP Docs](https://supabase.com/docs/guides/getting-started/mcp)

---

## 💡 Consejo Final

**Empieza simple:**

1. Conecta **UN** servidor primero (ej: GitHub)
2. Pruébalo hasta que funcione perfectamente
3. Luego agrega el siguiente

**No intentes configurar todo de una vez.** Es mejor dominar uno a la vez.

---

¿Tienes dudas? Pregunta a Claude Code: _"¿Cómo configuro el servidor MCP de [nombre del servicio]?"_
