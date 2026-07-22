import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { 
  Video, 
  Brain,
  Target
} from 'lucide-react';

// Context Provider
import { VideoAnalysisProvider } from '../contexts/VideoAnalysisContext';

// Subcomponentes especializados
import ExerciseSelector from '../shared/ExerciseSelector';
import VideoUpload from '../components/VideoUpload';
import CameraControls from '../components/CameraControls';
import AnalysisEngine from '../components/AnalysisEngine';
import ResultsDisplay from '../components/ResultsDisplay';

/**
 * Componente de Análisis de Video refactorizado
 * Utiliza múltiples subcomponentes especializados para mejor mantenibilidad
 */
export default function VideoAnalysis() {
  return (
    <VideoAnalysisProvider>
      <div className="space-y-6">
        {/* Header */}
        <Card className="bg-neutral-900/70 border border-white/10 ring-1 ring-white/5 shadow-[0_25px_60px_-50px_rgba(0,0,0,0.8)] backdrop-blur-lg border-l-2 border-l-emerald-400/40">
          <CardHeader className="text-center pb-6">
            <div className="flex justify-center mb-4">
              <div className="bg-emerald-500/15 p-4 rounded-full border border-emerald-400/30">
                <Video className="w-8 h-8 text-emerald-200" />
              </div>
            </div>
            <CardTitle className="text-2xl text-white mb-2 font-urbanist">
              Análisis por Video
            </CardTitle>
            <CardDescription className="text-gray-300/70 max-w-2xl mx-auto">
              Sube un video de tu ejercicio para análisis de movimiento completo 
              o usa la cámara en vivo para corrección en tiempo real
            </CardDescription>
          </CardHeader>
          
          <CardContent className="pt-0">
            <div className="flex flex-wrap justify-center gap-4 text-sm">
              <div className="flex items-center gap-2 text-emerald-300">
                <Target className="w-4 h-4" />
                Rango de movimiento
              </div>
              <div className="flex items-center gap-2 text-emerald-300">
                <Brain className="w-4 h-4" />
                Tempo y ritmo
              </div>
              <div className="flex items-center gap-2 text-emerald-300">
                <Video className="w-4 h-4" />
                Análisis completo
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Selector de Ejercicio */}
        <div className="max-w-md mx-auto">
          <ExerciseSelector />
        </div>

        {/* Grid de componentes principales */}
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Columna izquierda: Upload y Cámara */}
          <div className="space-y-6">
            <VideoUpload />
            <CameraControls />
          </div>

          {/* Columna derecha: Análisis y Resultados */}
          <div className="space-y-6">
            <AnalysisEngine />
            <ResultsDisplay />
          </div>
        </div>

        {/* Información adicional */}
        <Card className="bg-neutral-900/70 border border-white/10 ring-1 ring-white/5 shadow-[0_25px_60px_-50px_rgba(0,0,0,0.8)] backdrop-blur-lg border-l-2 border-l-sky-400/40">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Brain className="w-5 h-5 text-sky-300 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-gray-200/80">
                <p className="font-medium mb-2 text-white">Consejos para mejores resultados:</p>
                <ul className="space-y-1 text-xs text-gray-300/80">
                  <li>• Graba en un espacio con buena iluminación</li>
                  <li>• Mantén la cámara estable y a altura media</li>
                  <li>• Incluye todo el cuerpo en el encuadre</li>
                  <li>• Realiza el ejercicio a velocidad normal</li>
                  <li>• Graba de 3-5 repeticiones completas</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </VideoAnalysisProvider>
  );
}
