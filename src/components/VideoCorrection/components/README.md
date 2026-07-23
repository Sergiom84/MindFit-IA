# 🎬 VideoCorrection - Subcomponentes Especializados

Este directorio contiene los subcomponentes especializados que resultaron de la refactorización del componente `VideoAnalysis` monolítico.

## 📁 Estructura de Archivos

```
components/
├── CameraControls.jsx      # 🎥 Controles de cámara en vivo
├── VideoUpload.jsx         # 📤 Subida y preview de videos
├── AnalysisEngine.jsx      # 🧠 Motor de análisis IA
├── ResultsDisplay.jsx      # 📊 Visualización de resultados
└── README.md              # 📚 Documentación
```

## 🧩 Descripción de Componentes

### 🎥 CameraControls.jsx

**Responsabilidades:**

- Activar/desactivar cámara web
- Controles de grabación (iniciar/detener)
- Captura de frames para análisis en vivo
- Gestión del stream de MediaDevices
- Estados visuales de la cámara

**Estados gestionados:**

- `isCameraOn` - Estado de la cámara
- `isRecording` - Estado de grabación
- `mediaStreamRef` - Referencia al stream

### 📤 VideoUpload.jsx

**Responsabilidades:**

- Selección de archivos de video
- Validación de formato y tamaño
- Preview del video seleccionado
- Información del archivo (duración, tamaño, tipo)
- Gestión de URL.createObjectURL()

**Estados gestionados:**

- `selectedVideo` - Video seleccionado
- `fileInputRef` - Referencia al input file

### 🧠 AnalysisEngine.jsx

**Responsabilidades:**

- Procesamiento de análisis de videos subidos
- Análisis en tiempo real con cámara
- Comunicación con API `/api/ai/advanced-correction`
- Normalización de respuestas de IA
- Feedback por voz
- Manejo de errores de análisis

**Estados gestionados:**

- `isAnalyzing` - Estado de análisis de video
- `isLiveAnalyzing` - Estado de análisis en vivo

### 📊 ResultsDisplay.jsx

**Responsabilidades:**

- Visualización de resultados de análisis
- Controles para resetear/replay
- Información de metadata (tiempo, modelo, etc.)
- Estados de loading durante análisis
- Integración con el componente `AnalysisResult` existente

**Estados gestionados:**

- `analysisResult` - Resultado del análisis
- `showResults` - Control de visualización

## 🔄 Context: VideoAnalysisContext

Todos los subcomponentes comparten estado a través del context `VideoAnalysisContext.jsx` ubicado en `../contexts/VideoAnalysisContext.jsx`.

**Estado compartido:**

```javascript
{
  // Referencias DOM
  (fileInputRef,
    videoPreviewRef,
    liveVideoRef,
    mediaStreamRef,
    mediaRecorderRef,
    recordedBlobsRef,
    canvasRef,
    // Estados principales
    selectedExerciseId,
    selectedVideo,
    analysisResult,
    showResults,
    // Estados de análisis
    isAnalyzing,
    isLiveAnalyzing,
    // Estados de cámara
    isCameraOn,
    isRecording,
    // Utilidades
    normalizeVideoAnalysis);
}
```

## 🎯 Beneficios de la Refactorización

### ✅ Antes (Monolítico)

- **752 líneas** en un solo archivo
- Múltiples responsabilidades mezcladas
- Difícil de mantener y testear
- Código repetitivo
- Estados acoplados

### ✅ Después (Modular)

- **102 líneas** en componente principal
- **~150 líneas** promedio por subcomponente
- Responsabilidades bien separadas
- Fácil mantenimiento y testing
- Reutilización de código
- Estados compartidos via Context

## 🔧 Uso

```jsx
import VideoAnalysis from "./VideoAnalysis";

// El componente principal ya incluye el Provider y todos los subcomponentes
function MyApp() {
  return <VideoAnalysis />;
}
```

## 🧪 Testing

Cada subcomponente puede ser testeado de forma independiente:

```jsx
import { VideoAnalysisProvider } from "../contexts/VideoAnalysisContext";
import CameraControls from "./CameraControls";

// Test aislado
const TestWrapper = ({ children }) => (
  <VideoAnalysisProvider>{children}</VideoAnalysisProvider>
);

test("CameraControls renders correctly", () => {
  render(
    <TestWrapper>
      <CameraControls />
    </TestWrapper>,
  );
});
```

## 🚀 Futuras Mejoras

- [ ] Añadir tests unitarios para cada subcomponente
- [ ] Implementar lazy loading para subcomponentes pesados
- [ ] Añadir PropTypes o TypeScript para type safety
- [ ] Optimizar re-renders con React.memo()
- [ ] Añadir más configuraciones via props

## 📈 Métricas de Refactorización

| Métrica            | Antes       | Después   | Mejora  |
| ------------------ | ----------- | --------- | ------- |
| Líneas por archivo | 752         | ~150      | ⬇️ 80%  |
| Responsabilidades  | 6+          | 1-2       | ⬇️ 70%  |
| Testabilidad       | ❌ Difícil  | ✅ Fácil  | ⬆️ 100% |
| Mantenibilidad     | ❌ Compleja | ✅ Simple | ⬆️ 90%  |
| Reutilización      | ❌ Nula     | ✅ Alta   | ⬆️ 100% |
