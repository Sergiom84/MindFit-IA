import { alertDialog } from '../../ui/dialogService.jsx';
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Brain,
  Zap,
  Target,
  Eye,
  TrendingUp
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useUserContext } from '@/contexts/UserContext';
import { useVideoAnalysis } from '../contexts/VideoAnalysisContext';
import VoiceFeedback from '../shared/VoiceFeedback';
import tokenManager from '../../../utils/tokenManager';
import { extractFramesFromVideo } from '../utils/videoFrames';

export default function AnalysisEngine() {
  const { user } = useAuth();
  const { userData } = useUserContext();
  const { speakCorrections, stopSpeaking } = VoiceFeedback();
  const [frameProgress, setFrameProgress] = useState(null);
  const cardBase = 'bg-neutral-900/70 border border-white/10 ring-1 ring-white/5 shadow-[0_25px_60px_-50px_rgba(0,0,0,0.8)] backdrop-blur-lg';
  
  const {
    selectedExerciseId,
    selectedVideo,
    isAnalyzing,
    setIsAnalyzing,
    isLiveAnalyzing,
    setIsLiveAnalyzing,
    isCameraOn,
    liveVideoRef,
    canvasRef,
    setAnalysisResult,
    setShowResults,
    normalizeVideoAnalysis,
  } = useVideoAnalysis();

  const handleAnalyzeVideo = async () => {
    if (!selectedVideo) {
      alertDialog('Por favor, sube un video para analizar.');
      return;
    }

    setIsAnalyzing(true);
    setShowResults(false);

    try {
      console.log('🎯 Iniciando análisis de video:', selectedVideo.name);

      // AI-001: el backend analiza IMÁGENES (no vídeo). Extraemos fotogramas en el
      // cliente y los subimos como `images[]`, reutilizando el pipeline de imagen.
      const frames = await extractFramesFromVideo(
        selectedVideo.file,
        {},
        (p) => setFrameProgress(p)
      );

      const formData = new FormData();
      formData.append('exerciseId', selectedExerciseId);
      frames.forEach((blob, i) => formData.append('images', blob, `frame_${i + 1}.jpg`));

      if (userData) {
        formData.append('perfilUsuario', JSON.stringify({
          edad: userData.edad,
          sexo: userData.sexo,
          peso: userData.peso,
          altura: userData.altura,
          nivel_entrenamiento: userData.nivel_entrenamiento,
          limitaciones_fisicas: userData.limitaciones_fisicas || [],
          objetivo_principal: userData.objetivo_principal
        }));
      }

      const response = await fetch('/api/ai/advanced-correction', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokenManager.getToken()}`
        },
        body: formData
      });

      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('✅ Análisis completado:', result);

      const normalizedResult = normalizeVideoAnalysis(result, selectedExerciseId);
      setAnalysisResult(normalizedResult);
      setShowResults(true);

      // Activar feedback por voz si hay correcciones
      if (normalizedResult.corrections?.length > 0) {
        const corrections = normalizedResult.corrections.map(c => c.recommendation).join('. ');
        speakCorrections(corrections);
      }

    } catch (error) {
      console.error('❌ Error en análisis de video:', error);
      
      const errorResult = {
        exercise: selectedExerciseId,
        overall_score: 0,
        risk_level: 'alto',
        corrections: [{
          id: 1,
          aspect: 'Error de Análisis',
          problem: 'No se pudo completar el análisis',
          recommendation: 'Verifica tu conexión e inténtalo de nuevo',
          priority: 'alta',
          confidence: 'baja'
        }],
        summary: `Error: ${error.message}`,
        timestamp: new Date().toISOString(),
        confidence: 'baja',
        metadata: {
          processing_time: '0s',
          model_version: 'error',
          analysis_type: 'error'
        }
      };
      
      setAnalysisResult(errorResult);
      setShowResults(true);
      alertDialog(`Error en el análisis: ${error.message}`);
    } finally {
      setIsAnalyzing(false);
      setFrameProgress(null);
    }
  };

  const captureFrame = async () => {
    const video = liveVideoRef.current;
    if (!video) return null;
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const context = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0);

    return new Promise((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.8);
    });
  };

  const handleLiveAnalysis = async () => {
    if (!isCameraOn) {
      alertDialog('Por favor, activa la cámara primero para usar la Corrección IA en Vivo.');
      return;
    }

    setIsLiveAnalyzing(true);
    setShowResults(false);

    try {
      console.log('📸 Capturando frame para análisis en vivo...');
      
      const frameBlob = await captureFrame();
      if (!frameBlob) {
        throw new Error('No se pudo capturar el frame de la cámara');
      }

      const formData = new FormData();
      formData.append('exerciseId', selectedExerciseId);
      formData.append('frame', frameBlob, 'live_frame.jpg');
      
      if (userData) {
        formData.append('perfilUsuario', JSON.stringify({
          edad: userData.edad,
          sexo: userData.sexo,
          peso: userData.peso,
          altura: userData.altura,
          nivel_entrenamiento: userData.nivel_entrenamiento,
          limitaciones_fisicas: userData.limitaciones_fisicas || [],
          objetivo_principal: userData.objetivo_principal
        }));
      }

      const response = await fetch('/api/ai/advanced-correction', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokenManager.getToken()}`
        },
        body: formData
      });

      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('✅ Análisis en vivo completado:', result);

      const normalizedResult = normalizeVideoAnalysis(result, selectedExerciseId);
      setAnalysisResult(normalizedResult);
      setShowResults(true);

      // Activar feedback por voz inmediato para análisis en vivo
      if (normalizedResult.corrections?.length > 0) {
        const corrections = normalizedResult.corrections
          .slice(0, 2) // Solo las primeras 2 correcciones para no saturar
          .map(c => c.recommendation)
          .join('. ');
        speakCorrections(corrections);
      }

    } catch (error) {
      console.error('❌ Error en análisis en vivo:', error);
      
      const errorResult = {
        exercise: selectedExerciseId,
        overall_score: 0,
        risk_level: 'alto',
        corrections: [{
          id: 1,
          aspect: 'Error de Análisis en Vivo',
          problem: 'No se pudo completar el análisis en tiempo real',
          recommendation: 'Verifica la iluminación y posición de la cámara',
          priority: 'alta',
          confidence: 'baja'
        }],
        summary: `Error en análisis en vivo: ${error.message}`,
        timestamp: new Date().toISOString(),
        confidence: 'baja',
        metadata: {
          processing_time: '0s',
          model_version: 'error',
          analysis_type: 'live_error'
        }
      };
      
      setAnalysisResult(errorResult);
      setShowResults(true);
      alertDialog(`Error en análisis en vivo: ${error.message}`);
    } finally {
      setIsLiveAnalyzing(false);
    }
  };

  return (
    <Card className={`${cardBase} border-l-2 border-l-yellow-400/40`}>
      <CardHeader className="pb-3">
        <CardTitle className="text-white flex items-center gap-2 font-urbanist">
          <Brain className="w-5 h-5 text-yellow-300" />
          Motor de Análisis IA
        </CardTitle>
      </CardHeader>
      
      <CardContent>
        <div className="space-y-4">
          {/* Botón de análisis de video */}
          <div className="text-center">
            <Button 
              onClick={handleAnalyzeVideo}
              disabled={!selectedVideo || isAnalyzing || isLiveAnalyzing}
              className="bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 text-black hover:from-yellow-200 hover:via-yellow-300 hover:to-amber-400 px-8 py-3 text-lg font-semibold shadow-[0_12px_30px_-18px_rgba(250,204,21,0.8)]"
              size="lg"
            >
              {isAnalyzing ? (
                <>
                  <Brain className="w-5 h-5 mr-2 animate-spin" />
                  {frameProgress
                    ? `Extrayendo fotogramas ${frameProgress.done}/${frameProgress.total}...`
                    : 'Analizando Video...'}
                </>
              ) : (
                <>
                  <TrendingUp className="w-5 h-5 mr-2" />
                  Analizar Video con IA
                </>
              )}
            </Button>
          </div>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-white/10" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-neutral-900 px-2 text-gray-400">O</span>
            </div>
          </div>

          {/* Botón de análisis en vivo */}
          <div className="text-center">
            <Button 
              onClick={handleLiveAnalysis}
              disabled={!isCameraOn || isAnalyzing || isLiveAnalyzing}
              className="bg-white/10 text-white border border-white/10 hover:bg-white/20 px-6 py-2"
              size="lg"
            >
              {isLiveAnalyzing ? (
                <>
                  <Eye className="w-4 h-4 mr-2 animate-pulse" />
                  Analizando en Vivo...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 mr-2" />
                  Corrección IA en Vivo
                </>
              )}
            </Button>
          </div>

          {/* Información sobre el análisis */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 border-l-2 border-l-sky-400/40">
            <div className="flex items-start gap-3">
              <Target className="w-5 h-5 text-sky-300 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-gray-200/80">
                <p className="font-medium mb-1 text-white">Análisis con IA Avanzada</p>
                <ul className="space-y-1 text-xs text-gray-300/80">
                  <li>• Detección automática de posturas incorrectas</li>
                  <li>• Análisis personalizado según tu perfil</li>
                  <li>• Feedback por voz en tiempo real</li>
                  <li>• Recomendaciones específicas de mejora</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
