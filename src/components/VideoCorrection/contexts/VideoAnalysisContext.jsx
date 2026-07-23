import React, { createContext, useContext, useState, useRef } from 'react';

const VideoAnalysisContext = createContext();

export const useVideoAnalysis = () => {
  const context = useContext(VideoAnalysisContext);
  if (!context) {
    throw new Error('useVideoAnalysis must be used within a VideoAnalysisProvider');
  }
  return context;
};

export function VideoAnalysisProvider({ children }) {
  // Referencias
  const fileInputRef = useRef(null);
  const videoPreviewRef = useRef(null);
  const liveVideoRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedBlobsRef = useRef([]);
  const canvasRef = useRef(null);

  // Estados principales
  const [selectedExerciseId, setSelectedExerciseId] = useState('squat');
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [showResults, setShowResults] = useState(false);
  
  // Estados de análisis
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isLiveAnalyzing, setIsLiveAnalyzing] = useState(false);
  
  // Estados de cámara
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  // Función para normalizar respuestas del análisis
  const normalizeVideoAnalysis = (payload, fallbackExercise) => {
    try {
      const a = payload?.analysis || {};
      const md = payload?.metadata || {};

      const mapRiskToConfidence = (risk) => {
        const r = String(risk || '').toLowerCase();
        if (r === 'bajo') return 'alta';
        if (r === 'medio' || r === 'media') return 'media';
        if (r === 'alto') return 'baja';
        return 'media';
      };

      const correctionsSrc = Array.isArray(a.correcciones_priorizadas)
        ? a.correcciones_priorizadas
        : (Array.isArray(a.correcciones) ? a.correcciones : []);

      const corrections = correctionsSrc.map((c, i) => ({
        id: i,
        aspect: c.aspecto || c.area || 'General',
        problem: c.problema || c.descripcion || 'Sin descripción',
        recommendation: c.recomendacion || c.solucion || 'Sin recomendación',
        priority: c.prioridad || 'media',
        confidence: mapRiskToConfidence(c.riesgo),
      }));

      return {
        exercise: a.ejercicio || fallbackExercise || 'Ejercicio desconocido',
        overall_score: a.puntuacion_general || a.score || 75,
        risk_level: a.nivel_riesgo || a.risk || 'medio',
        corrections: corrections.length > 0 ? corrections : [],
        summary: a.resumen || a.feedback || 'Análisis completado exitosamente',
        timestamp: new Date().toISOString(),
        confidence: mapRiskToConfidence(a.nivel_riesgo || a.risk),
        metadata: {
          processing_time: md.tiempo_procesamiento || '2.5s',
          model_version: md.version_modelo || 'v1.0',
          analysis_type: 'video_analysis'
        }
      };
    } catch (error) {
      console.error('Error normalizando análisis de video:', error);
      return {
        exercise: fallbackExercise || 'Ejercicio desconocido',
        overall_score: 70,
        risk_level: 'medio',
        corrections: [],
        summary: 'Error al procesar el análisis. Inténtalo de nuevo.',
        timestamp: new Date().toISOString(),
        confidence: 'media',
        metadata: {
          processing_time: '0s',
          model_version: 'unknown',
          analysis_type: 'video_analysis'
        }
      };
    }
  };

  const value = {
    // Referencias
    fileInputRef,
    videoPreviewRef,
    liveVideoRef,
    mediaStreamRef,
    mediaRecorderRef,
    recordedBlobsRef,
    canvasRef,
    
    // Estados
    selectedExerciseId,
    setSelectedExerciseId,
    selectedVideo,
    setSelectedVideo,
    analysisResult,
    setAnalysisResult,
    showResults,
    setShowResults,
    isAnalyzing,
    setIsAnalyzing,
    isLiveAnalyzing,
    setIsLiveAnalyzing,
    isCameraOn,
    setIsCameraOn,
    isRecording,
    setIsRecording,
    
    // Utilidades
    normalizeVideoAnalysis,
  };

  return (
    <VideoAnalysisContext.Provider value={value}>
      {children}
    </VideoAnalysisContext.Provider>
  );
}