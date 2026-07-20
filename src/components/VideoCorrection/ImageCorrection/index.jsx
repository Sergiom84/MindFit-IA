import { alertDialog } from '../../ui/dialogService.jsx';
import React, { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { useUserContext } from '@/contexts/UserContext';
import { 
  Image as ImageIcon, 
  Upload, 
  Brain, 
  Trash2,
  Camera,
  Eye,
  Target
} from 'lucide-react';

import tokenManager from '../../../utils/tokenManager';
import ExerciseSelector from '../shared/ExerciseSelector';
import AnalysisResult from '../shared/AnalysisResult';
import VoiceFeedback from '../shared/VoiceFeedback';

// NO ejercicios hardcodeados - deben venir de la API de ejercicios
const FALLBACK_EXERCISES = [];

/**
 * Componente de Corrección por Imagen
 * Permite subir múltiples fotos para análisis postural
 */
export default function ImageCorrection() {
  const { user } = useAuth();
  const { userData } = useUserContext();
  const { speakCorrections, stopSpeaking } = VoiceFeedback();
  
  const fileInputRef = useRef(null);
  
  const [selectedExerciseId, setSelectedExerciseId] = useState('squat');
  const [photos, setPhotos] = useState([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [showResults, setShowResults] = useState(false);
  const [exercises, setExercises] = useState(FALLBACK_EXERCISES);
  const cardBase = 'bg-neutral-900/70 border border-white/10 ring-1 ring-white/5 shadow-[0_25px_60px_-50px_rgba(0,0,0,0.8)] backdrop-blur-lg';

  // Normaliza la respuesta del endpoint de fotos al formato esperado por la UI
  const normalizePhotoAnalysis = (payload, fallbackExercise) => {
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

      // Fuente de correcciones: soporta "correcciones" y "correcciones_priorizadas"
      const correctionsSrc = Array.isArray(a.correcciones_priorizadas)
        ? a.correcciones_priorizadas
        : (Array.isArray(a.correcciones) ? a.correcciones : []);

      const correcciones = correctionsSrc.map((c) => {
        if (typeof c === 'string') {
          return { prioridad: 'media', accion: c, fundamento: '' };
        }
        return {
          prioridad: c.prioridad || c.importancia || 'media',
          accion: c.accion || c.solucion || c.aspecto || c.descripcion || c.description || '',
          fundamento: c.fundamento || c.problema || c.evidencia || c.evidence || ''
        };
      });

      const feedbackVoz = correcciones
        .map(c => c.accion)
        .filter(Boolean)
        .slice(0, 5);

      return {
        ejercicio: md.exercise_analyzed || fallbackExercise || 'No especificado',
        confianza_global: mapRiskToConfidence(a.nivel_riesgo),
        correcciones_priorizadas: correcciones,
        errores_detectados: Array.isArray(a.errores_detectados) ? a.errores_detectados : [],
        metricas: a.metricas || null,
        puntos_clave: Array.isArray(a.puntos_positivos) ? a.puntos_positivos : (Array.isArray(a.puntos_clave) ? a.puntos_clave : []),
        riesgos_potenciales: Array.isArray(a.riesgos_potenciales) ? a.riesgos_potenciales : (a.nivel_riesgo ? [a.nivel_riesgo] : []),
        siguiente_paso: a.siguiente_paso || a.recomendaciones_adicionales || a.nota_final || '',
        feedback_voz: Array.isArray(a.feedback_voz) ? a.feedback_voz : feedbackVoz,
        overlay_recomendado: Array.isArray(a.overlay_recomendado) ? a.overlay_recomendado : [],
        metadata: {
          timestamp: md.timestamp || new Date().toISOString(),
          model: md.model_used || md.model || 'gpt-4o-mini',
          imageCount: md.photos_count || md.imageCount || 0,
          confidence: mapRiskToConfidence(a.nivel_riesgo)
        }
      };
    } catch (e) {
      console.warn('No se pudo normalizar análisis de foto, devolviendo payload crudo:', e);
      return payload;
    }
  };

  const handlePickPhotos = () => {
    fileInputRef.current?.click();
  };

  const handlePhotosSelected = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    // Crear previews locales
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
    setPhotos((prev) => [...prev, ...previews]);
  };

  const removePhoto = (photoId) => {
    setPhotos(photos => photos.filter(p => p.id !== photoId));
  };

  const clearAllPhotos = () => {
    setPhotos([]);
    setAnalysisResult(null);
    setShowResults(false);
  };

  const handleAnalyzePhotos = async () => {
    if (!photos.length) {
      alertDialog('Por favor, sube al menos una imagen para analizar.');
      return;
    }

    if (!user?.id) {
      alertDialog('Necesitas estar autenticado para usar el Análisis IA de Fotos.');
      return;
    }

    try {
      setIsAnalyzing(true);

      const fd = new FormData();

      // Convertir las fotos de base64 a blob y agregarlas al FormData
      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i];
        fd.append('photos', photo.file, photo.name);
      }

      // Obtener el ejercicio seleccionado para descripción
      const selectedExercise = exercises.find(e => e.id === selectedExerciseId);
      
      // El backend devuelve { user: {...} }, necesitamos acceder a los datos correctamente
      const userProfile = userData?.user || userData || {};
      
      // Construir contexto del usuario más detallado
      const userContext = {
        // Datos básicos
        edad: userProfile?.edad || null,
        peso: userProfile?.peso || null,
        altura: userProfile?.altura || null,
        sexo: userProfile?.sexo || null,
        
        // Nivel y experiencia  
        nivel: userProfile?.nivel_entrenamiento || null,
        nivel_actividad: userProfile?.nivel_actividad || null,
        años_entrenando: userProfile?.anos_entrenando || null,
        frecuencia_semanal: userProfile?.frecuencia_semanal || null,
        
        // Objetivos y composición
        objetivo_principal: userProfile?.objetivo_principal || null,
        objetivos_secundarios: [], // Se puede expandir si hay una tabla separada
        grasa_corporal: userProfile?.grasa_corporal || null,
        masa_magra: userProfile?.masa_magra ?? userProfile?.masa_muscular ?? null,
        
        // Limitaciones y salud
        // F1 (ONB-P1-01): limitaciones_fisicas ahora llega como array (canónico); se
        // conserva compatibilidad con el formato string legacy.
        lesiones: Array.isArray(userProfile?.limitaciones_fisicas)
          ? userProfile.limitaciones_fisicas.map(l => String(l).trim()).filter(Boolean)
          : (userProfile?.limitaciones_fisicas ? String(userProfile.limitaciones_fisicas).split(',').map(l => l.trim()).filter(Boolean) : []),
        limitaciones: userProfile?.historial_medico ? userProfile.historial_medico.split(',').map(h => h.trim()) : [],
        medicamentos: userProfile?.medicamentos ? userProfile.medicamentos.split(',').map(m => m.trim()) : [],
        alergias: userProfile?.alergias ? userProfile.alergias.split(',').map(a => a.trim()) : [],
        
        // Medidas corporales adicionales
        cintura: userProfile?.cintura || null,
        pecho: userProfile?.pecho || null,  
        brazos: userProfile?.brazos || null,
        muslo: userProfile?.muslo ?? userProfile?.muslos ?? null,
        cuello: userProfile?.cuello || null,
        cadera: userProfile?.cadera || null,
        
        // Datos de composición corporal
        agua_corporal: userProfile?.agua_corporal || null,
        metabolismo_basal: userProfile?.metabolismo_basal || null,
        
        // Metas
        meta_peso: userProfile?.meta_peso || null,
        meta_grasa_corporal: userProfile?.meta_grasa_corporal || null,
        
        // Preferencias de entrenamiento
        metodologia_preferida: userProfile?.metodologia_preferida || null,
        enfoque_entrenamiento: userProfile?.enfoque_entrenamiento || null,
        horario_preferido: userProfile?.horario_preferido || null,
        
        // Nutrición
        comidas_por_dia: userProfile?.comidas_por_dia || null,
        suplementacion: userProfile?.suplementacion || null,
        alimentos_excluidos: userProfile?.alimentos_excluidos ? userProfile.alimentos_excluidos.split(',').map(a => a.trim()) : [],
        
        // Ubicación por defecto
        lugar_entrenamiento: 'casa'
      };

      // Campos esperados por el endpoint de fotos
      fd.append('exercise_name', selectedExerciseId);
      fd.append('exercise_description', selectedExercise?.name || selectedExerciseId);
      fd.append('user_context', JSON.stringify(userContext));

      console.log(`🖼️ Analizando ${photos.length} fotos subidas...`);
      console.log('👤 Datos raw del usuario:', userData);
      console.log('🔍 Perfil procesado:', userProfile);
      console.log('📊 Contexto final enviado:', userContext);
      console.log('🎯 Ejercicio:', selectedExercise?.name || selectedExerciseId);
      
      // Verificar qué campos tienen datos
      const fieldsWithData = Object.entries(userContext)
        .filter(([key, value]) => value !== null && value !== '' && 
          (Array.isArray(value) ? value.length > 0 : true))
        .map(([key, value]) => key);
      console.log('✅ Campos con datos:', fieldsWithData);

      // Llamar a la ruta específica de análisis de fotos (AI-001: requiere JWT)
      const res = await fetch('/api/ai-photo-correction/analyze', {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenManager.getToken()}` },
        body: fd,
      });
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Análisis IA no disponible: ${errorText}`);
      }

      const data = await res.json();
      console.log('Análisis IA de Fotos (raw):', data);
      const normalized = normalizePhotoAnalysis(data, selectedExerciseId);
      console.log('Análisis IA de Fotos (normalizado):', normalized);
      
      setAnalysisResult(normalized);
      setShowResults(true);

      // Mostrar mensaje de éxito
      alertDialog('¡Análisis IA de fotos completado exitosamente! Los resultados se muestran a continuación.');
    } catch (err) {
      console.error('Error en Análisis IA de Fotos:', err);
      alertDialog(`No se pudo ejecutar el Análisis IA de Fotos: ${err.message}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Información del módulo */}
      <Card className={`${cardBase} border-l-2 border-l-sky-400/40`}>
        <CardHeader>
          <CardTitle className="text-white flex items-center font-urbanist">
            <ImageIcon className="w-5 h-5 mr-2 text-sky-300" />
            Iniciar Análisis por Imagen
          </CardTitle>
          <CardDescription className="text-gray-300/70">
            Sube fotografías (frontal, lateral, posterior) para obtener un análisis postural detallado usando inteligencia artificial.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="flex items-center space-x-3 p-3 bg-white/5 rounded-lg border border-white/10 border-l-2 border-l-sky-400/40">
              <Camera className="w-8 h-8 text-sky-300" />
              <div>
                <h4 className="text-white font-medium">Múltiples Ángulos</h4>
                <p className="text-gray-300/70 text-sm">Frontal, lateral y posterior</p>
              </div>
            </div>
            <div className="flex items-center space-x-3 p-3 bg-white/5 rounded-lg border border-white/10 border-l-2 border-l-sky-400/40">
              <Eye className="w-8 h-8 text-sky-300" />
              <div>
                <h4 className="text-white font-medium">Análisis Postural</h4>
                <p className="text-gray-300/70 text-sm">Detección de desalineaciones</p>
              </div>
            </div>
            <div className="flex items-center space-x-3 p-3 bg-white/5 rounded-lg border border-white/10 border-l-2 border-l-sky-400/40">
              <Target className="w-8 h-8 text-sky-300" />
              <div>
                <h4 className="text-white font-medium">Feedback Detallado</h4>
                <p className="text-gray-300/70 text-sm">Correcciones específicas</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Selector de ejercicio */}
      <ExerciseSelector 
        selectedExerciseId={selectedExerciseId}
        onExerciseChange={setSelectedExerciseId}
      />

      {/* Subida de fotos */}
      <Card className={`${cardBase} border-l-2 border-l-sky-400/40`}>
        <CardHeader>
          <CardTitle className="text-white flex items-center font-urbanist">
            <Upload className="w-5 h-5 mr-2 text-sky-300" />
            Subir Fotos para Análisis
          </CardTitle>
          <CardDescription className="text-gray-300/70">
            Selecciona múltiples imágenes de tu ejercicio desde diferentes ángulos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3 items-center mb-4">
            <Input 
              ref={fileInputRef} 
              type="file" 
              accept="image/*" 
              multiple 
              onChange={handlePhotosSelected} 
              className="hidden" 
            />
            
            <Button 
              onClick={handlePickPhotos}
              className="bg-white/10 text-white border border-white/10 hover:bg-white/20"
            >
              <Upload className="w-4 h-4 mr-2" /> 
              Seleccionar Fotos
            </Button>

            {photos.length > 0 && (
              <>
                <Button
                  onClick={handleAnalyzePhotos}
                  disabled={isAnalyzing}
                  className="bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 text-black hover:from-yellow-200 hover:via-yellow-300 hover:to-amber-400 font-semibold shadow-[0_12px_30px_-18px_rgba(250,204,21,0.8)]"
                >
                  <Brain className="w-4 h-4 mr-2" />
                  {isAnalyzing ? 'Analizando...' : `Analizar ${photos.length} Foto${photos.length > 1 ? 's' : ''}`}
                </Button>

                <Button
                  onClick={clearAllPhotos}
                  variant="outline"
                  className="border-red-400/60 text-red-300 hover:bg-red-500/10"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Limpiar Todo
                </Button>
              </>
            )}

            {isAnalyzing && (
              <Badge className="bg-sky-500/20 text-sky-200 border border-sky-400/40 animate-pulse">
                Procesando imágenes...
              </Badge>
            )}
          </div>

          {/* Preview de fotos */}
          {photos.length > 0 && (
            <div>
              <h4 className="text-white font-medium mb-3">
                Fotos Seleccionadas ({photos.length})
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {photos.map((photo) => (
                  <div key={photo.id} className="relative group rounded-lg overflow-hidden border border-white/10">
                    <img
                      src={photo.url}
                      alt={photo.name}
                      decoding="async"
                      className="w-full h-36 object-cover"
                    />
                    <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-xs p-2 truncate text-white">
                      {photo.name}
                    </div>
                    <button
                      onClick={() => removePhoto(photo.id)}
                      className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Resultados del análisis */}
      {showResults && analysisResult && (
        <AnalysisResult
          result={analysisResult}
          onSpeakCorrections={() => speakCorrections(analysisResult)}
          onStopSpeaking={stopSpeaking}
        />
      )}
    </div>
  );
}
