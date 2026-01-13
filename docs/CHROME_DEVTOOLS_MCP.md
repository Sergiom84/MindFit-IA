# 🔍 Chrome DevTools MCP - Guía de Uso

## ¿Qué es?

Chrome DevTools MCP permite que Claude Code acceda directamente a la consola del navegador Chrome, errores, network requests y más, facilitando la depuración de tu aplicación Entrena con IA en tiempo real.

## ✅ Estado de Configuración

**Instalado**: Sí (Global - disponible en todos los proyectos)
**Versión**: Latest (auto-actualizable)
**Fecha de configuración**: 2026-01-13

## 🚀 Cómo Usar

### 1. Iniciar la Aplicación

```bash
# Inicia tu aplicación normalmente
npm run dev:auto
```

### 2. Abrir Chrome DevTools

1. Abre tu aplicación en Chrome: http://localhost:5173
2. Abre DevTools (F12 o Ctrl+Shift+I)
3. El MCP se conectará automáticamente a Chrome

### 3. Pedir a Claude que Revise los Errores

Ahora puedes pedirme cosas como:

- "¿Qué errores hay en la consola?"
- "Revisa los errores de red"
- "Toma un screenshot de la página"
- "¿Hay problemas de rendimiento?"
- "Analiza las peticiones fallidas a la API"

## 🛠️ Capacidades del MCP

### Consola y Errores

- ✅ Ver mensajes de consola (log, warn, error)
- ✅ Ver problemas del panel Issues
- ✅ Acceder a stack traces completos

### Network

- ✅ Analizar peticiones HTTP
- ✅ Ver headers y payloads
- ✅ Detectar peticiones fallidas (404, 500, etc.)
- ✅ Analizar tiempos de respuesta

### Elementos y DOM

- ✅ Inspeccionar elementos seleccionados
- ✅ Analizar árbol de accesibilidad
- ✅ Ver estilos aplicados

### Performance

- ✅ Grabar trazas de rendimiento
- ✅ Analizar tiempos de carga
- ✅ Detectar memory leaks

### Automatización

- ✅ Tomar screenshots
- ✅ Recargar página (con/sin caché)
- ✅ Simular eventos de teclado
- ✅ Automatizar acciones con Puppeteer

## 📝 Ejemplos de Uso

### Debugging de Errores API

```
Usuario: "Claude, ¿por qué falla la petición de login?"

Claude usa el MCP para:
1. Ver el error en consola
2. Revisar el Network tab
3. Analizar el payload y headers
4. Identificar el problema (ej: token faltante)
```

### Problemas de Rendering

```
Usuario: "El modal no se muestra correctamente"

Claude usa el MCP para:
1. Inspeccionar el elemento
2. Ver los estilos aplicados
3. Detectar z-index conflicts
4. Proponer la solución
```

### Performance Issues

```
Usuario: "La app va lenta"

Claude usa el MCP para:
1. Grabar un trace de performance
2. Identificar renders excesivos
3. Ver peticiones lentas
4. Sugerir optimizaciones
```

## ⚙️ Configuración Avanzada

### Conectar a Chrome Existente

Si quieres usar tu Chrome personal (con extensiones, sesión, etc.):

```bash
claude mcp add chrome-devtools --scope user npx chrome-devtools-mcp@latest --autoConnect
```

### Modo Headless (Sin Ventana)

Para tests automatizados:

```bash
claude mcp add chrome-devtools --scope user npx chrome-devtools-mcp@latest --headless
```

### Viewport Personalizado

Para testing responsive:

```bash
claude mcp add chrome-devtools --scope user npx chrome-devtools-mcp@latest --viewport "375x667"
```

## 🔧 Opciones Disponibles

| Opción             | Descripción                                    | Ejemplo                                   |
| ------------------ | ---------------------------------------------- | ----------------------------------------- |
| `--autoConnect`    | Conecta automáticamente a Chrome (Chrome 145+) | `--autoConnect`                           |
| `--browserUrl`     | Conecta a Chrome existente                     | `--browserUrl http://localhost:9222`      |
| `--headless`       | Sin interfaz gráfica                           | `--headless`                              |
| `--executablePath` | Ruta a Chrome custom                           | `--executablePath "C:/Chrome/chrome.exe"` |
| `--isolated`       | Usa perfil temporal                            | `--isolated`                              |
| `--userDataDir`    | Directorio de perfil custom                    | `--userDataDir "./chrome-profile"`        |
| `--channel`        | Canal de Chrome                                | `--channel canary`                        |
| `--viewport`       | Tamaño de ventana                              | `--viewport "1280x720"`                   |

## 🐛 Troubleshooting

### El MCP no se conecta

1. Verifica que Chrome esté abierto con DevTools
2. Asegúrate de estar en la pestaña correcta (localhost:5173)
3. Reinicia Claude Code

### No veo errores de consola

1. Verifica que los errores se muestren en DevTools
2. Asegúrate de que el panel Console esté abierto
3. Recarga la página para regenerar los errores

### Chrome se cierra automáticamente

Si usas `--isolated`, Chrome se cierra al terminar la sesión. Usa `--autoConnect` o `--userDataDir` para persistir.

## 📚 Referencias

- [Documentación Oficial](https://github.com/ChromeDevTools/chrome-devtools-mcp)
- [Blog Chrome Developers](https://developer.chrome.com/blog/chrome-devtools-mcp)
- [Guía Paso a Paso](https://dev.to/proflead/a-step-by-step-guide-to-chrome-devtools-mcp-for-ai-assistants-337f)

## 🎯 Casos de Uso en Entrena con IA

### 1. Debugging de Rutinas

**Problema**: Los ejercicios no se cargan
**Solución con MCP**:

- Ver errores de API en Network
- Revisar respuesta del backend
- Identificar datos malformados

### 2. Problemas de Modal

**Problema**: El modal no se abre
**Solución con MCP**:

- Inspeccionar z-index del modal
- Ver errores JavaScript
- Detectar conflictos de estado

### 3. Performance de Calendario

**Problema**: El calendario es lento
**Solución con MCP**:

- Grabar trace de renders
- Identificar useEffect loops
- Ver peticiones duplicadas

### 4. Autenticación

**Problema**: Login falla silenciosamente
**Solución con MCP**:

- Ver petición en Network
- Revisar token en headers
- Detectar CORS issues

## 💡 Mejores Prácticas

1. **Siempre ten DevTools abierto** cuando pidas ayuda a Claude
2. **Reproduce el error** antes de pedir análisis
3. **Sé específico** en tus preguntas ("¿por qué falla X?" vs "¿hay errores?")
4. **Mantén la pestaña activa** donde ocurre el error
5. **Limpia la consola** antes de reproducir para ver solo errores nuevos

## 🚨 Notas Importantes

- ⚠️ El MCP solo funciona con **Chrome/Chromium**
- ⚠️ Requiere DevTools **abierto** para funcionar
- ⚠️ Los datos de DevTools son **locales** (no se envían a servidores)
- ⚠️ Funciona mejor con **Chrome 145+** para autoConnect
- ✅ Es **totalmente seguro** - solo lectura de datos de debugging
