# 🔧 Configuración Completa: GitHub + Render + Supabase

**Fecha**: 26 de noviembre de 2025
**Dispositivo**: Windows - C:\Users\sergi
**Estado**: En progreso

---

## ✅ COMPLETADO

### 1. Git - Configuración Básica

- ✅ `user.name` configurado: "Sergio Hernández Lara"
- ⏳ `user.email` pendiente (necesitas proporcionarlo)

---

## 📋 PASOS PENDIENTES

### PASO 2: Configurar Email de Git

**¿Cuál es tu email de GitHub?** Proporcióname tu email para ejecutar:

```bash
git config --global user.email "tu-email@ejemplo.com"
```

**Verificación**: El email debe coincidir con el de tu cuenta GitHub (@Sergiom84)

---

### PASO 3: Autenticación con GitHub

**Opción A: GitHub CLI (RECOMENDADO)**

1. **Descargar GitHub CLI**:
   - Ve a: https://cli.github.com/
   - Descarga e instala GitHub CLI para Windows

2. **Autenticar**:

   ```bash
   gh auth login
   ```

   - Selecciona: GitHub.com
   - Selecciona: HTTPS
   - Autenticar con navegador web (recomendado)

3. **Cambiar a SSH (opcional pero recomendado)**:

   ```bash
   # Generar clave SSH si no tienes una
   ssh-keygen -t ed25519 -C "tu-email@ejemplo.com"

   # Agregar a GitHub
   gh ssh-key add ~/.ssh/id_ed25519.pub --title "Windows-Desktop"

   # Cambiar remote
   git remote set-url origin git@github.com:Sergiom84/Entrenaconia.git
   ```

**Opción B: Personal Access Token (PAT)**

Si no quieres instalar GitHub CLI:

1. Ve a: https://github.com/settings/tokens
2. Genera un token con permisos: `repo`, `workflow`, `read:org`
3. Copia el token
4. La primera vez que hagas `git push`, Git Credential Manager te pedirá credenciales
5. Usuario: `Sergiom84`
6. Contraseña: Pega el PAT (no tu contraseña real)

---

### PASO 4: Crear Archivo `.env` en Backend

**Necesito que me proporciones las siguientes credenciales:**

1. **DATABASE_URL** de Supabase (formato: `postgresql://user:password@host:port/db`)
2. **OPENAI_API_KEY** (tu clave de OpenAI)
3. **JWT_SECRET** (cualquier string secreto para tokens)

Una vez las proporciones, crearé el archivo `.env` automáticamente.

**¿Dónde encontrar DATABASE_URL?**

- Ve a: https://supabase.com/dashboard/project/lhsnmjgdtjalfcsurxvg/settings/database
- Copia la "Connection string" (URI)
- Debe verse como: `postgresql://postgres.xxx:password@aws-xxx.pooler.supabase.com:5432/postgres`

---

### PASO 5: Regenerar Token MCP de Supabase

**El token actual en `.mcp.json` puede estar expirado.**

**Pasos:**

1. Ve a: https://supabase.com/dashboard/account/tokens
2. Busca el token: `sbp_TU_TOKEN_AQUI`
3. **Revócalo** si existe
4. Genera un nuevo token con estos permisos:
   - ✅ Read access to all projects
   - ✅ Write access to all projects
5. Copia el nuevo token
6. Dímelo y actualizaré `.mcp.json`

---

### PASO 6: Instalar y Configurar Render CLI

**Instalación en Windows:**

**Opción A: Script de Instalación (ya lo tienes)**

```bash
npm run render:install:win
```

Esto ejecutará: `scripts\install-render-windows.bat`

**Opción B: Manual con winget**

```bash
winget install render
```

**Opción C: Manual con PowerShell**

```powershell
Invoke-WebRequest -Uri "https://github.com/render-oss/cli/releases/latest/download/render-windows-amd64.exe" -OutFile "$env:LOCALAPPDATA\Programs\render.exe"
```

**Autenticación:**

Una vez instalado, autentica con:

```bash
# Opción 1: Login interactivo
render auth login

# Opción 2: API Key
render config set-key YOUR_RENDER_API_KEY
```

**¿Dónde encontrar Render API Key?**

- Ve a: https://dashboard.render.com/account/api-keys
- Genera una nueva API key si no tienes una
- Cópiala (solo se muestra una vez)

---

### PASO 7: Verificación Final

Una vez completados todos los pasos anteriores:

**Git:**

```bash
git config --list | Select-String "user"
# Debe mostrar user.name y user.email
```

**GitHub:**

```bash
gh auth status
# Debe mostrar: Logged in to github.com as Sergiom84
```

**Render:**

```bash
render whoami
# Debe mostrar tu información de Render
```

**Supabase MCP:**

```bash
# Probar en Claude Code:
/mcp list
# Debe mostrar: supabase (connected)
```

**Aplicación local:**

```bash
npm run dev:all
# Debe iniciar frontend y backend sin errores
```

---

## 🎯 RESUMEN DE LO QUE NECESITO

Para continuar, necesito que me proporciones:

1. **Email de GitHub** (para configurar `git config user.email`)
2. **DATABASE_URL de Supabase** (connection string completa)
3. **OPENAI_API_KEY** (tu API key de OpenAI)
4. **JWT_SECRET** (puedo generar uno aleatorio si lo prefieres)
5. **Nuevo Token de Supabase** (regenerar desde dashboard)
6. **Render API Key** (opcional, para CLI)

**IMPORTANTE**: Nunca compartas estas credenciales públicamente. Solo compártelas conmigo en esta conversación privada.

---

## 📝 NOTAS ADICIONALES

### Múltiples Dispositivos

Si usas 3 dispositivos diferentes:

1. **Configura Git en cada uno** con el mismo `user.name` y `user.email`
2. **Usa GitHub CLI** en todos (más cómodo que HTTPS con PAT)
3. **Genera una clave SSH diferente por dispositivo** y agrégalas todas a GitHub:
   - `Windows-Desktop`
   - `Linux-Laptop`
   - `MacOS-Work` (por ejemplo)
4. **Render CLI** puede usar la misma API key en todos
5. **Supabase MCP** usa el mismo token en todos (regenera uno solo)

### Seguridad

- ✅ `.env` ya está en `.gitignore`
- ✅ `.mcp.json` debería estar en `.gitignore` (voy a verificarlo)
- ✅ Nunca hagas commit de credenciales
- ✅ Usa variables de entorno para secretos

---

## 🚀 SIGUIENTE PASO

Una vez que me proporciones las credenciales, ejecutaré:

1. Configurar `git config user.email`
2. Crear `backend/.env` con todas las credenciales
3. Actualizar `.mcp.json` con nuevo token de Supabase
4. Verificar que `.mcp.json` está en `.gitignore`
5. Hacer commit de prueba para verificar Git
6. Probar la aplicación localmente

**¿Estás listo para proporcionarme las credenciales?**
