import { alertDialog } from '../../ui/dialogService.jsx';
import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Upload, 
  Trash2, 
  Video,
  FileVideo,
  Clock,
  HardDrive
} from 'lucide-react';
import { useVideoAnalysis } from '../contexts/VideoAnalysisContext';

export default function VideoUpload() {
  const {
    fileInputRef,
    videoPreviewRef,
    selectedVideo,
    setSelectedVideo,
    isAnalyzing,
  } = useVideoAnalysis();
  const cardBase = 'bg-neutral-900/70 border border-white/10 ring-1 ring-white/5 shadow-[0_25px_60px_-50px_rgba(0,0,0,0.8)] backdrop-blur-lg';

  const handlePickVideo = () => {
    fileInputRef.current?.click();
  };

  const handleVideoSelected = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validaciones
    if (!file.type.startsWith('video/')) {
      alertDialog('Por favor, selecciona un archivo de video válido.');
      return;
    }

    const maxSize = 100 * 1024 * 1024; // 100MB
    if (file.size > maxSize) {
      alertDialog('El archivo es demasiado grande. Máximo permitido: 100MB.');
      return;
    }

    try {
      // Crear objeto URL para preview
      const videoUrl = URL.createObjectURL(file);
      
      const videoData = {
        file,
        name: file.name,
        size: file.size,
        type: file.type,
        url: videoUrl,
        duration: null, // Se calculará cuando se cargue
        uploadedAt: new Date().toISOString()
      };

      setSelectedVideo(videoData);
      console.log('✅ Video seleccionado:', file.name);

      // Cargar video para obtener duración
      if (videoPreviewRef.current) {
        videoPreviewRef.current.src = videoUrl;
        videoPreviewRef.current.onloadedmetadata = () => {
          const duration = videoPreviewRef.current.duration;
          setSelectedVideo(prev => ({
            ...prev,
            duration: Math.round(duration)
          }));
        };
      }
    } catch (error) {
      console.error('❌ Error procesando video:', error);
      alertDialog('Error al procesar el video. Inténtalo de nuevo.');
    }
  };

  const handleRemoveVideo = () => {
    if (selectedVideo?.url) {
      URL.revokeObjectURL(selectedVideo.url);
    }
    setSelectedVideo(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    console.log('🗑️ Video removido');
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Card className={`${cardBase} border-l-2 border-l-emerald-400/40`}>
      <CardHeader className="pb-3">
        <CardTitle className="text-white flex items-center gap-2 font-urbanist">
          <Upload className="w-5 h-5 text-emerald-300" />
          Subir Video para Análisis
        </CardTitle>
      </CardHeader>
      
      <CardContent>
        {/* Input oculto para seleccionar archivo */}
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          onChange={handleVideoSelected}
          className="hidden"
        />

        {/* Zona de upload o preview */}
        {!selectedVideo ? (
          <div className="border-2 border-dashed border-white/15 rounded-2xl p-8 text-center mb-4 bg-white/5">
            <Video className="w-16 h-16 mx-auto mb-4 text-emerald-200/80" />
            <p className="text-gray-200/80 mb-4">
              Sube un video de tu ejercicio para análisis completo
            </p>
            <Button 
              onClick={handlePickVideo}
              className="bg-white/10 text-white border border-white/10 hover:bg-white/20"
              disabled={isAnalyzing}
            >
              <Upload className="w-4 h-4 mr-2" />
              Seleccionar Video
            </Button>
            <p className="text-xs text-gray-400 mt-3">
              Formatos: MP4, WebM, AVI • Máximo: 100MB
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Preview del video */}
            <div className="relative rounded-2xl overflow-hidden bg-black/40 border border-white/10">
              <video 
                ref={videoPreviewRef}
                className="w-full max-h-64 object-contain"
                controls
                preload="metadata"
              />
            </div>

            {/* Información del archivo */}
            <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <FileVideo className="w-4 h-4 text-emerald-300 flex-shrink-0" />
                    <p className="text-white font-medium truncate">
                      {selectedVideo.name}
                    </p>
                  </div>
                  
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary" className="bg-white/5 border border-white/10 text-gray-200">
                      <HardDrive className="w-3 h-3 mr-1" />
                      {formatFileSize(selectedVideo.size)}
                    </Badge>
                    
                    {selectedVideo.duration && (
                      <Badge variant="secondary" className="bg-white/5 border border-white/10 text-gray-200">
                        <Clock className="w-3 h-3 mr-1" />
                        {formatDuration(selectedVideo.duration)}
                      </Badge>
                    )}
                    
                    <Badge variant="secondary" className="bg-white/5 border border-white/10 text-gray-200">
                      {selectedVideo.type}
                    </Badge>
                  </div>
                </div>
                
                <Button 
                  onClick={handleRemoveVideo}
                  variant="destructive" 
                  size="sm"
                  disabled={isAnalyzing}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Botón para cambiar video */}
            <div className="text-center">
              <Button 
                onClick={handlePickVideo}
                variant="outline"
                disabled={isAnalyzing}
                className="border-white/10 text-gray-200 hover:bg-white/10"
              >
                <Upload className="w-4 h-4 mr-2" />
                Cambiar Video
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
