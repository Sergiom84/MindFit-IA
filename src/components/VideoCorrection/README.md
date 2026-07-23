# Sistema de Corrección por IA

Este módulo proporciona dos métodos principales para analizar y corregir la técnica de ejercicios usando inteligencia artificial, con funcionalidad de corrección en vivo integrada.

## Estructura del Sistema

```
VideoCorrection/
├── index.jsx                    # Componente principal con navegación
├── ImageCorrection/             # 📸 Análisis por imagen
│   └── index.jsx
├── VideoAnalysis/               # 🎥 Análisis por video + 👁️ En vivo
│   └── index.jsx
├── shared/                      # 🔧 Componentes compartidos
│   ├── ExerciseSelector.jsx     # Selector de ejercicios
│   ├── AnalysisResult.jsx       # Mostrar resultados de IA
│   ├── VoiceFeedback.jsx        # Síntesis de voz
│   └── README.md
└── README.md                    # Este archivo
```

## Métodos Disponibles

### 1. 📸 Análisis por Imagen (`ImageCorrection`)

- **Propósito**: Análisis postural estático usando fotografías
- **Casos de uso**: Evaluación de postura, alineación corporal, análisis de posiciones específicas
- **Ventajas**: No requiere movimiento, perfecto para análisis detallado de posición
- **Archivos soportados**: JPG, PNG, WEBP
- **Características**:
  - Subida de múltiples imágenes
  - Análisis desde diferentes ángulos (frontal, lateral, posterior)
  - Preview de imágenes seleccionadas
  - Eliminación individual de fotos

### 2. 🎥 Análisis por Video + 👁️ Corrección en Vivo (`VideoAnalysis`)

- **Propósito**: Análisis completo de movimiento usando archivos de video **Y** corrección en tiempo real
- **Casos de uso**:
  - **Video**: Evaluación de rango de movimiento, tempo, técnica durante el ejercicio
  - **En Vivo**: Entrenamiento supervisado, correcciones inmediatas, coaching virtual
- **Ventajas**:
  - **Video**: Análisis completo del movimiento, detección de patrones temporales
  - **En Vivo**: Feedback instantáneo, ideal para aprendizaje activo
- **Archivos soportados**: MP4, MOV, AVI, WEBM (máx 50MB)
- **Características**:
  - **Subida de Video**:
    - Preview del video seleccionado
    - Información detallada del archivo (duración, resolución, tamaño)
    - Controles de reproducción
    - Tips para optimizar la calidad del análisis
  - **Cámara en Vivo**:
    - Acceso a cámara web en tiempo real
    - Grabación opcional de la sesión
    - Captura de fotogramas para análisis
    - Descarga de grabaciones
    - Tips de configuración en pantalla
    - Análisis instantáneo con IA

## Componentes Compartidos

### `ExerciseSelector.jsx`

- Biblioteca de ejercicios con fallback local
- Información de errores comunes y puntos clave
- Integración con API de ejercicios

### `AnalysisResult.jsx`

- Visualización unificada de resultados de IA
- Soporte para múltiples formatos de respuesta
- Controles de reproducción de audio
- Métricas y estadísticas detalladas

### `VoiceFeedback.jsx`

- Síntesis de voz en español
- Reproducción de correcciones prioritarias
- Control de audio (play/stop)

## Integración con Backend

### Endpoints utilizados:

- **Imagen**: `/api/ai-photo-correction/analyze`
- **Video**: `/api/ai/analyze-video`
- **En vivo**: `/api/ai/advanced-correction`
- **Ejercicios**: `/api/exercises?limit=500`

### Formato de datos enviados:

```javascript
{
  exercise_name: 'squat',
  exercise_description: '',
  user_context: {
    edad: 30,
    peso: 70,
    altura: 175,
    nivel: 'intermedio',
    lesiones: [],
    equipamiento: ['mancuernas'],
    objetivos: ['fuerza']
  }
}
```

## Flujo de Uso

1. **Selección de método**: El usuario elige entre imagen o video (que incluye corrección en vivo)
2. **Configuración**: Selecciona el ejercicio a analizar
3. **Captura de datos**:
   - **Imagen**: Sube fotos desde diferentes ángulos
   - **Video**: Sube archivo de video del ejercicio **O** activa cámara en vivo
4. **Análisis**: El sistema procesa los datos con IA
5. **Resultados**: Muestra correcciones, métricas y feedback
6. **Retroalimentación**: Síntesis de voz opcional de las correcciones

## Características Técnicas

### Autenticación

- Todos los módulos requieren usuario autenticado
- Contexto de usuario disponible para personalización

### Manejo de Errores

- Validación de archivos (tamaño, formato)
- Mensajes de error descriptivos
- Fallbacks para API no disponible

### Accesibilidad

- Soporte para síntesis de voz
- Controles de teclado
- Mensajes descriptivos

### Responsividad

- Diseño adaptativo para móviles
- Grid layouts flexibles
- Controles optimizados para touch

## Próximas Mejoras

- [ ] Análisis en tiempo real durante grabación
- [ ] Overlays visuales en video/imagen
- [ ] Integración con MediaPipe para landmarks
- [ ] Historial de análisis
- [ ] Comparación de progreso temporal
- [ ] Exportación de reportes
- [ ] Integración con rutinas de entrenamiento
