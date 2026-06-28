# 🚀 Guía de Instalación: GitHub CLI y Render CLI

**Fecha**: 26 de noviembre de 2025
**Sistema**: Windows

---

## 1️⃣ INSTALAR GITHUB CLI

### Paso 1: Descargar

He abierto la página oficial en tu navegador: https://cli.github.com/

### Paso 2: Instalar

1. Descarga el archivo **`gh_X.X.X_windows_amd64.msi`**
2. Haz doble clic en el archivo descargado
3. Sigue el asistente de instalación (Siguiente → Siguiente → Instalar)
4. **IMPORTANTE**: Después de instalar, cierra y abre de nuevo PowerShell

### Paso 3: Verificar instalación

Abre una nueva ventana de PowerShell y ejecuta:

```powershell
gh --version
```

Debería mostrar algo como: `gh version 2.x.x`

---

## 2️⃣ INSTALAR RENDER CLI

### Paso 1: Descargar

He abierto la página de releases en tu navegador: https://github.com/render-oss/cli/releases/latest

### Paso 2: Descargar el archivo correcto

Busca y descarga el archivo:

- **`cli_X.X.X_windows_amd64.zip`**

### Paso 3: Extraer y mover

1. Extrae el archivo ZIP (botón derecho → Extraer todo)
2. Dentro encontrarás `render.exe`
3. Crea la carpeta: `C:\Program Files\Render`
4. Mueve `render.exe` a esa carpeta

### Paso 4: Agregar al PATH

**Opción A - PowerShell (Administrador):**

```powershell
# Ejecuta PowerShell como Administrador
[Environment]::SetEnvironmentVariable("Path", $env:Path + ";C:\Program Files\Render", "Machine")
```

**Opción B - Manual:**

1. Abre el menú Inicio
2. Busca "Variables de entorno"
3. Click en "Editar las variables de entorno del sistema"
4. Click en "Variables de entorno..."
5. En "Variables del sistema", selecciona "Path" → Click "Editar"
6. Click "Nuevo"
7. Escribe: `C:\Program Files\Render`
8. Click "Aceptar" en todas las ventanas

### Paso 5: Verificar instalación

**IMPORTANTE**: Cierra y abre de nuevo PowerShell, luego ejecuta:

```powershell
render --version
```

Debería mostrar: `render version X.X.X`

---

## 3️⃣ ¿QUÉ HACER DESPUÉS DE INSTALAR?

Una vez que tengas ambos instalados y verificados, vuelve aquí y dime:
**"Ya instalé GitHub CLI y Render CLI"**

Entonces continuaremos con:

1. ✅ Configurar Git con tu email
2. ✅ Autenticar GitHub CLI
3. ✅ Autenticar Render CLI
4. ✅ Crear archivo `.env` con credenciales
5. ✅ Regenerar token de Supabase
6. ✅ Probar todo

---

## ⚠️ PROBLEMAS COMUNES

### "El comando 'gh' no se reconoce"

- Cierra y abre PowerShell de nuevo
- Verifica que instalaste el `.msi` correctamente
- Reinicia el ordenador si es necesario

### "El comando 'render' no se reconoce"

- Verifica que `render.exe` está en `C:\Program Files\Render`
- Verifica que agregaste la carpeta al PATH
- Cierra y abre PowerShell de nuevo
- Reinicia el ordenador si es necesario

### No puedo agregar al PATH

- Ejecuta PowerShell como Administrador
- O usa la opción manual desde Variables de entorno

---

## 📝 NOTAS

- **GitHub CLI** facilita la autenticación con GitHub (no necesitarás tokens)
- **Render CLI** te permite ver logs, deployar, y gestionar servicios desde terminal
- Ambos son oficiales y seguros
- Son herramientas de línea de comandos (no tienen interfaz gráfica)

---

**¿Listo para instalar?** Abre las dos páginas que he abierto en tu navegador y sigue los pasos.
