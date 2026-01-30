import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Camera, 
  Image as ImageIcon, 
  Video, 
  Eye,
  Brain,
  Target
} from 'lucide-react';

// Import de los 2 módulos principales
import ImageCorrection from './ImageCorrection';
import VideoAnalysis from './VideoAnalysis';

/**
  * Componente principal de Corrección por IA
  * Separa en 2 métodos principales:
  * 1. Análisis por Imagen - Subir fotos para análisis postural
  * 2. Análisis por Video - Subir videos O usar cámara en vivo
  */
export default function VideoCorrection() {
  const [activeMode, setActiveMode] = useState('image'); // 'image', 'video'
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (event) => {
      setMousePosition({ x: event.clientX, y: event.clientY });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const modes = [
    {
      id: 'image',
      name: 'Análisis por Imagen',
      icon: <ImageIcon className="w-6 h-6" />,
      description: 'Sube fotos frontales, laterales o posteriores para análisis postural',
      accentBorder: 'border-l-2 border-l-sky-400/40',
      accentText: 'text-sky-300',
      iconBg: 'bg-sky-500/10',
      features: ['Múltiples ángulos', 'Análisis postural', 'Feedback detallado']
    },
    {
      id: 'video',
      name: 'Análisis por Video',
      icon: <Video className="w-6 h-6" />,
      description: 'Sube un video de tu ejercicio para análisis de movimiento completo',
      accentBorder: 'border-l-2 border-l-emerald-400/40',
      accentText: 'text-emerald-300',
      iconBg: 'bg-emerald-500/10',
      features: ['Rango de movimiento', 'Tempo y ritmo', 'Análisis completo']
    }
  ];

  const currentMode = modes.find(m => m.id === activeMode);
  const cardBase = 'bg-neutral-900/70 border border-white/10 ring-1 ring-white/5 shadow-[0_25px_60px_-50px_rgba(0,0,0,0.8)] backdrop-blur-lg';

  const renderActiveComponent = () => {
    switch (activeMode) {
      case 'image':
        return <ImageCorrection />;
      case 'video':
        return <VideoAnalysis />;
      default:
        return <ImageCorrection />;
    }
  };

  return (
    <div className="min-h-screen bg-[#050506] text-white relative overflow-hidden font-body">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[url('/assets/tech-lux/bg-tech-lux-mobile.jpg')] sm:bg-[url('/assets/tech-lux/bg-tech-lux-desktop.jpg')] bg-cover bg-center opacity-80 sm:opacity-70" />
        <div className="absolute inset-0 bg-[url('/assets/tech-lux/texture-tech-lux-tile.jpg')] bg-repeat opacity-20 mix-blend-soft-light" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/40 to-black/80 sm:from-black/40 sm:via-black/60 sm:to-black" />
        <div className="absolute -top-24 right-0 h-60 w-60 bg-yellow-400/10 blur-[140px]" />
        <div className="absolute top-1/3 -left-16 h-72 w-72 bg-yellow-400/10 blur-[160px]" />
        <div
          className="absolute inset-0 opacity-20"
          style={{
            background: `radial-gradient(600px circle at ${mousePosition.x}px ${mousePosition.y}px, rgba(250, 204, 21, 0.18), transparent 60%)`
          }}
        />
      </div>

      <div className="relative z-10 container mx-auto px-4 py-8">
        <div className="space-y-10">
          {/* Header */}
          <header className="space-y-3">
            <p className="text-xs uppercase tracking-[0.4em] text-yellow-200/80">Corrección IA</p>
            <h1 className="text-4xl md:text-5xl font-semibold font-urbanist text-white">
              Corrección por IA
            </h1>
            <p className="text-gray-200/80 text-lg max-w-3xl">
              Elige el método de análisis que mejor se adapte a tus necesidades y recibe feedback personalizado con inteligencia artificial.
            </p>
          </header>

          {/* Selector de Modos */}
          <Card className={`${cardBase}`}>
            <CardHeader>
              <CardTitle className="text-white flex items-center font-urbanist">
                <Target className="w-5 h-5 mr-2 text-yellow-300" />
                Selecciona el Método de Análisis
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {modes.map((mode) => (
                  <div
                    key={mode.id}
                    className={`relative p-6 rounded-2xl cursor-pointer transition-all duration-300 bg-white/5 border border-white/10 ${mode.accentBorder} ${
                      activeMode === mode.id
                        ? 'ring-2 ring-yellow-400/20 shadow-[0_20px_40px_-30px_rgba(250,204,21,0.6)] bg-white/10'
                        : 'hover:border-yellow-400/30'
                    }`}
                    onClick={() => setActiveMode(mode.id)}
                  >
                    {/* Badge de activo */}
                    {activeMode === mode.id && (
                      <Badge className="absolute -top-2 -right-2 bg-gradient-to-r from-yellow-300 to-amber-500 text-black border border-yellow-200/60">
                        Activo
                      </Badge>
                    )}

                    <div className="text-center">
                      <div className={`w-16 h-16 rounded-full ${mode.iconBg} border border-white/10 flex items-center justify-center mx-auto mb-4`}>
                        <span className={mode.accentText}>{mode.icon}</span>
                      </div>
                      <h3 className="text-xl font-semibold text-white mb-2 font-urbanist">
                        {mode.name}
                      </h3>
                      <p className="text-gray-300/70 text-sm mb-4">
                        {mode.description}
                      </p>
                      
                      {/* Features */}
                      <div className="space-y-2">
                        {mode.features.map((feature, idx) => (
                          <div key={idx} className="flex items-center justify-center text-xs text-gray-200/80">
                            <div className={`w-1 h-1 ${mode.accentText} rounded-full mr-2`}></div>
                            {feature}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Botón de acción */}
              <div className="mt-6 flex justify-center">
                <Button
                  onClick={() => setActiveMode(activeMode)}
                  className="bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 text-black font-semibold px-8 py-2 hover:from-yellow-200 hover:via-yellow-300 hover:to-amber-400 shadow-[0_12px_30px_-18px_rgba(250,204,21,0.8)]"
                >
                  <Brain className="w-4 h-4 mr-2" />
                  Iniciar {currentMode?.name}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Renderizar componente activo */}
          {renderActiveComponent()}
        </div>
      </div>
    </div>
  );
}
