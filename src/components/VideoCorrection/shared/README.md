# Componentes Compartidos - Sistema de Corrección por IA

Este directorio contiene componentes reutilizables por todos los módulos de corrección (Imagen, Video, En Vivo).

## Componentes Disponibles

### `ExerciseSelector.jsx`
**Propósito**: Selector unificado de ejercicios con información contextual

**Props**:
- `selectedExerciseId` (string): ID del ejercicio seleccionado
- `onExerciseChange` (function): Callback cuando cambia la selección

**Características**:
- Carga automática desde API `/api/exercises?limit=500`
- Fallback a ejercicios predefinidos si API no disponible
- Muestra errores comunes y puntos clave por ejercicio
- UI consistente con el sistema de diseño

**Uso**:
```jsx
<ExerciseSelector 
  selectedExerciseId={selectedExerciseId}
  onExerciseChange={setSelectedExerciseId}
/>
```

### `AnalysisResult.jsx` 
**Propósito**: Visualización unificada de resultados de análisis de IA

**Props**:
- `result` (object): Objeto con resultados normalizados de IA
- `onSpeakCorrections` (function): Callback para reproducir correcciones
- `onStopSpeaking` (function): Callback para detener síntesis de voz

**Estructura esperada del resultado**:
```javascript
{
  ejercicio: string,
  confianza_global: 'alta' | 'media' | 'baja',
  correcciones_priorizadas: [
    {
      prioridad: 'alta' | 'media' | 'baja',
      accion: string,
      fundamento: string
    }
  ],
  errores_detectados: [
    {
      severidad: string,
      tipo: string,
      zona: string,
      descripcion: string,
      impacto: string
    }
  ],
  metricas: object,
  puntos_clave: string[],
  riesgos_potenciales: string[],
  siguiente_paso: string,
  feedback_voz: string[],
  overlay_recomendado: array,
  metadata: {
    timestamp: string,
    model: string,
    imageCount?: number,
    videoCount?: number,
    duration?: number,
    confidence: string
  }
}
```

### `VoiceFeedback.jsx`
**Propósito**: Hook personalizado para síntesis de voz

**Returns**:
- `speakText(text)`: Reproduce texto específico
- `stopSpeaking()`: Detiene reproducción actual
- `speakCorrections(result)`: Reproduce correcciones del resultado de IA

**Características**:
- Soporte para español (es-ES)
- Configuración optimizada (rate: 0.95, pitch: 1.0, volume: 0.9)
- Cancelación automática de síntesis previa
- Selección automática de voz en español si disponible

## Utilidades de Normalización

### Normalización de Respuestas de IA

Cada módulo incluye funciones para normalizar las respuestas de diferentes endpoints de IA a un formato consistente:

```javascript
const normalizePhotoAnalysis = (payload, fallbackExercise) => {
  // Normaliza respuesta del endpoint de fotos
};

const normalizeVideoAnalysis = (payload, fallbackExercise) => {
  // Normaliza respuesta del endpoint de video  
};
```

**Funcionalidades de normalización**:
- Mapeo de niveles de riesgo a confianza
- Extracción de correcciones desde múltiples fuentes
- Generación automática de feedback de voz
- Manejo robusto de campos faltantes
- Timestamp y metadata automáticos

## Patrones de Uso

### Manejo de Estados
```javascript
const [selectedExerciseId, setSelectedExerciseId] = useState('squat');
const [isAnalyzing, setIsAnalyzing] = useState(false);
const [analysisResult, setAnalysisResult] = useState(null);
const [showResults, setShowResults] = useState(false);
```

### Integración con Contextos
```javascript
import { useAuth } from '@/contexts/AuthContext';
import { useUserContext } from '@/contexts/UserContext';

const { user } = useAuth();
const { userData } = useUserContext();
```

### Manejo de Archivos
```javascript
// Para imágenes
const previews = await Promise.all(
  files.map((file) =>
    new Promise((res) => {
      const reader = new FileReader();
      reader.onload = () => res({ 
        id: Math.random().toString(36),
        name: file.name, 
        url: reader.result,
        file: file
      });
      reader.readAsDataURL(file);
    })
  )
);

// Para videos
const videoInfo = await new Promise((resolve) => {
  video.onloadedmetadata = () => {
    resolve({
      duration: video.duration,
      width: video.videoWidth,
      height: video.videoHeight,
      size: file.size
    });
  };
});
```

## Estilos Consistentes

### Colores por Módulo
- **Imagen**: Azul (`blue-400`, `blue-500`)
- **Video**: Verde (`green-400`, `green-500`) 
- **En Vivo**: Amarillo (`yellow-400`, `yellow-500`)

### Cards Informativas
```jsx
<div className="flex items-center space-x-3 p-3 bg-blue-500/10 rounded-lg border border-blue-400/20">
  <Icon className="w-8 h-8 text-blue-400" />
  <div>
    <h4 className="text-white font-medium">Título</h4>
    <p className="text-gray-400 text-sm">Descripción</p>
  </div>
</div>
```

### Botones de Análisis
```jsx
<Button
  onClick={handleAnalyze}
  disabled={isAnalyzing}
  className="bg-yellow-400 text-black hover:bg-yellow-300 font-semibold"
>
  <Brain className="w-4 h-4 mr-2" />
  {isAnalyzing ? 'Analizando...' : 'Analizar'}
</Button>
```

## Próximas Mejoras

### Componentes Adicionales Sugeridos
- `FileUploadZone.jsx`: Zona de arrastrar y soltar universal
- `ProgressIndicator.jsx`: Indicador de progreso de análisis
- `ExerciseLibrary.jsx`: Biblioteca expandida con filtros
- `AnalysisHistory.jsx`: Historial de análisis previos
- `ComparisonView.jsx`: Comparación de múltiples análisis
- `ExportControls.jsx`: Exportación de reportes
- `SettingsPanel.jsx`: Configuraciones de análisis