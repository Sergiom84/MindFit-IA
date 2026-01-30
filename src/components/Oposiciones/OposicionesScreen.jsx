/**
  * Oposiciones Screen - Pantalla principal de preparación física para oposiciones
  *
  * @description Interfaz para seleccionar y entrenar para diferentes oposiciones:
  *       - Bomberos
  *       - Guardia Civil
  *       - Policía Nacional
  *       - Policía Local
  *
  * @author Claude Code - Arquitectura Modular Profesional
  * @version 1.0.0
  * @date 2025-10-10
  */

import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Alert, AlertDescription } from '@/components/ui/alert.jsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog.jsx';
import { Flame, Shield, AlertCircle, Info, Loader, Sparkles } from 'lucide-react';
import { useWorkout } from '@/contexts/WorkoutContext.jsx';
import { useAuth } from '@/contexts/AuthContext.jsx';
import { useNavigate } from 'react-router-dom';

// Importar componentes de metodologías específicas
import BomberosManualCard from './methodologies/Bomberos/BomberosManualCard.jsx';
import TrainingPlanConfirmationModal from '../routines/TrainingPlanConfirmationModal.jsx';
import WarmupModal from '../routines/WarmupModal.jsx';
import RoutineSessionModal from '../routines/RoutineSessionModal.jsx';

// Configuración de oposiciones
const OPOSICIONES = [
  {
    id: 'bomberos',
    name: 'Bomberos',
    description: 'Preparación física completa para oposiciones de Bombero',
    icon: Flame,
    color: 'orange',
    pruebas: [
      'Natación 50-100m',
      'Buceo/Apnea 25m',
      'Trepa de cuerda 6m',
      'Dominadas máximas 30 seg',
      'Carrera velocidad 100-200m',
      'Carrera resistencia 2800-3000m',
      'Press banca 40kg (H) / 30kg (M)',
      'Flexiones mínimo 17',
      'Lanzamiento balón medicinal 5kg (H) / 3kg (M)'
    ],
    nivel: 'Intermedio-Avanzado',
    duracion: '12-16 semanas',
    detalle: 'Las pruebas físicas de bombero son las más exigentes y variadas. Requieren preparación específica en natación, fuerza, resistencia y agilidad.'
  },
  {
    id: 'guardia-civil',
    name: 'Guardia Civil',
    description: 'Entrenamiento específico para las pruebas físicas de la Guardia Civil',
    icon: Shield,
    color: 'green',
    pruebas: [
      'Circuito de coordinación (agilidad)',
      'Carrera 2000m',
      'Extensiones de brazos 16 (H) / 11 (M)',
      'Natación 50m libre'
    ],
    nivel: 'Intermedio',
    duracion: '8-12 semanas',
    detalle: 'Pruebas oficiales según BOE. Sistema de baremos por edad y sexo. Todas las pruebas son eliminatorias.'
  },
  {
    id: 'policia-nacional',
    name: 'Policía Nacional',
    description: 'Preparación para el circuito y pruebas físicas de Policía Nacional',
    icon: Shield,
    color: 'blue',
    pruebas: [
      'Circuito de agilidad con obstáculos',
      'Dominadas máximas (H) / Suspensión en barra (M)',
      'Carrera 1000m'
    ],
    nivel: 'Intermedio',
    duracion: '8-12 semanas',
    detalle: 'Sistema de puntuación 0-10 por prueba. Media mínima de 5 puntos para aprobar. Certificado médico obligatorio.'
  },
  {
    id: 'policia-local',
    name: 'Policía Local',
    description: 'Entrenamiento adaptado a las pruebas físicas de Policía Local',
    icon: Shield,
    color: 'purple',
    pruebas: [
      'Carrera velocidad 50m',
      'Carrera resistencia 1000m',
      'Salto de longitud 2.10m (H) / 1.80m (M)',
      'Suspensión en barra / Dominadas',
      'Circuito de agilidad (según convocatoria)'
    ],
    nivel: 'Intermedio',
    duracion: '8-12 semanas',
    detalle: 'IMPORTANTE: Las pruebas varían significativamente por ayuntamiento. Consultar siempre las bases específicas de tu convocatoria.'
  }
];

export default function OposicionesScreen() {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [selectedOposicion, setSelectedOposicion] = useState(null);
  const [showDetails, setShowDetails] = useState(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [generatedPlan, setGeneratedPlan] = useState(null);
  const [error, setError] = useState(null);

  // Estados para modales específicos
  const [showBomberosModal, setShowBomberosModal] = useState(false);
  const [showWarmupModal, setShowWarmupModal] = useState(false);
  const [showRoutineSessionModal, setShowRoutineSessionModal] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [sessionData, setSessionData] = useState(null);
  const [methodologyPlanId, setMethodologyPlanId] = useState(null);

  useEffect(() => {
    const handleMouseMove = (event) => {
      setMousePosition({ x: event.clientX, y: event.clientY });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // Contexts
  const { generatePlan, startSession, ui: { isLoading } } = useWorkout();
  const { user } = useAuth();
  const navigate = useNavigate();

  // Handler para abrir modal de detalles
  const handleOpenDetails = (oposicion) => {
    setShowDetails(oposicion);
  };

  // Handler para seleccionar oposición y abrir modal correspondiente
  const handleSelectOposicion = (oposicion) => {
    setSelectedOposicion(oposicion);
    setError(null);

    console.log(`🎯 Abriendo modal para: ${oposicion.name} (${oposicion.id})`);

    // Abrir modal específico según la oposición
    switch(oposicion.id) {
      case 'bomberos':
        setShowBomberosModal(true);
        break;
      case 'guardia-civil':
        // TODO: Implementar GuardiaCivilManualCard
        alert('Guardia Civil próximamente disponible');
        break;
      case 'policia-nacional':
        // TODO: Implementar PoliciaNacionalManualCard
        alert('Policía Nacional próximamente disponible');
        break;
      case 'policia-local':
        // TODO: Implementar PoliciaLocalManualCard
        alert('Policía Local próximamente disponible');
        break;
      default:
        setError('Oposición no reconocida');
    }
  };

  // Handler para generar plan de Bomberos desde el modal
  const handleBomberosGenerate = async (bomberosData) => {
    try {
      console.log('🚒 Generando plan de Bomberos con datos completos:', bomberosData);

      // Generar plan con los datos del modal (incluye selectedLevel)
      const result = await generatePlan({
        mode: 'manual',
        methodology: 'bomberos',
        ...bomberosData // Incluye selectedLevel, userProfile, goals, etc.
      });

      if (result.success && result.plan) {
        console.log('✅ Plan de Bomberos generado exitosamente:', result);
        setGeneratedPlan(result.plan);

        // Guardar el ID del plan para iniciar la sesión después
        if (result.methodology_plan_id) {
          setMethodologyPlanId(result.methodology_plan_id);
          console.log('📝 Guardado methodology_plan_id:', result.methodology_plan_id);
        }

        setShowBomberosModal(false);
        setShowConfirmation(true);
      } else {
        throw new Error(result.error || 'No se pudo generar el plan');
      }
    } catch (err) {
      console.error('❌ Error generando plan de Bomberos:', err);
      setError(err.message || 'Error generando el plan de entrenamiento');
    }
  };

  // Handler para cuando el usuario acepta el plan y quiere comenzar el entrenamiento
  const handleStartTraining = async () => {
    try {
      console.log('🚀 Iniciando sesión de entrenamiento de oposiciones...');

      if (!methodologyPlanId) {
        throw new Error('No hay plan confirmado para iniciar');
      }

      console.log('🎯 PASO 1: Confirmando plan con ID:', methodologyPlanId);

      // Confirmar el plan (draft → active)
      const confirmResponse = await fetch('/api/routines/confirm-plan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        },
        body: JSON.stringify({
          methodology_plan_id: methodologyPlanId
        })
      });

      if (!confirmResponse.ok) {
        const errorData = await confirmResponse.json();
        throw new Error(errorData.error || 'Error al confirmar el plan');
      }

      console.log('✅ Plan confirmado exitosamente');

      console.log('🎯 PASO 2: Iniciando sesión...');

      // Obtener el nombre del día actual en español
      const todayName = new Date().toLocaleDateString('es-ES', { weekday: 'long' });
      const dayNameEs = todayName.charAt(0).toUpperCase() + todayName.slice(1);

      // Iniciar sesión usando WorkoutContext
      const result = await startSession({
        methodologyPlanId: methodologyPlanId,
        dayName: dayNameEs
      });

      if (result.success) {
        console.log('✅ Sesión iniciada, session_id:', result.session_id);

        // Cargar los ejercicios de la sesión
        const { getSessionProgress } = await import('../routines/api');
        const progressData = await getSessionProgress(result.session_id);
        console.log('✅ Ejercicios cargados para la sesión:', progressData);

        if (!progressData.exercises || progressData.exercises.length === 0) {
          throw new Error('La sesión no tiene ejercicios disponibles');
        }

        console.log('✅ Ejercicios disponibles:', progressData.exercises.length);

        // Mapear exercise_name → nombre para compatibilidad con el modal
        const mappedExercises = progressData.exercises.map(ex => ({
          ...ex,
          nombre: ex.exercise_name || ex.nombre,
          series: ex.series_total || ex.series,
          repeticiones: ex.repeticiones,
          descanso_seg: ex.descanso_seg,
          intensidad: ex.intensidad,
          tempo: ex.tempo,
          notas: ex.notas,
          status: ex.status,
          series_completed: ex.series_completed || 0,
          time_spent_seconds: ex.time_spent_seconds || 0
        }));

        setSessionData({
          ejercicios: mappedExercises,
          session_id: result.session_id,
          sessionId: result.session_id,
          currentExerciseIndex: 0
        });

        setSessionId(result.session_id);
        setShowConfirmation(false);
        setShowWarmupModal(true);

        console.log('🔥 Iniciando calentamiento...');
      } else {
        throw new Error(result.error || 'Error al iniciar el entrenamiento');
      }
    } catch (error) {
      console.error('❌ Error iniciando entrenamiento:', error);
      setError(error.message);
    }
  };

  // Handler cuando se completa el calentamiento
  const handleWarmupComplete = () => {
    console.log('✅ Calentamiento completado');
    setShowWarmupModal(false);
    setShowRoutineSessionModal(true);
  };

  // Handler para saltar calentamiento
  const handleSkipWarmup = () => {
    console.log('⭕ Calentamiento saltado');
    handleWarmupComplete();
  };

  // Handler cuando se completa la sesión de rutina
  const handleCompleteSession = () => {
    console.log('🎯 Sesión completada, navegando a TodayTrainingTab');
    setShowRoutineSessionModal(false);
    // Navegar a rutinas con el tab activo de "today" para ver el progreso
    navigate('/routines', { state: { activeTab: 'today', fromSession: true } });
  };

  // Handler para generar otro plan
  const handleGenerateAnother = async (feedbackData) => {
    console.log('🔄 Generando otro plan con feedback:', feedbackData);
    setShowConfirmation(false);
    // Reabrir modal de la oposición seleccionada
    if (selectedOposicion?.id === 'bomberos') {
      setShowBomberosModal(true);
    }
  };

  // Obtener color para iconos y bordes
  const getColorClasses = (color) => {
    const colors = {
      orange: {
        text: 'text-orange-200',
        dot: 'text-orange-300',
        iconBg: 'bg-orange-400/10',
        accent: 'border-l-2 border-l-orange-400/40'
      },
      green: {
        text: 'text-emerald-200',
        dot: 'text-emerald-300',
        iconBg: 'bg-emerald-400/10',
        accent: 'border-l-2 border-l-emerald-400/40'
      },
      blue: {
        text: 'text-sky-200',
        dot: 'text-sky-300',
        iconBg: 'bg-sky-400/10',
        accent: 'border-l-2 border-l-sky-400/40'
      },
      purple: {
        text: 'text-violet-200',
        dot: 'text-violet-300',
        iconBg: 'bg-violet-400/10',
        accent: 'border-l-2 border-l-violet-400/40'
      }
    };
    return colors[color] || colors.blue;
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
            <p className="text-xs uppercase tracking-[0.4em] text-yellow-200/80">Oposiciones</p>
            <h1 className="text-4xl md:text-5xl font-semibold font-urbanist text-white">
              Preparación Física para Oposiciones
            </h1>
            <p className="text-gray-200/80 text-lg">
              Entrena específicamente para superar las pruebas físicas de tu oposición objetivo.
            </p>
          </header>

          {/* Alert informativo */}
          <Alert className="bg-white/5 border-white/10">
            <Info className="w-5 h-5 text-yellow-300" />
            <AlertDescription className="text-gray-200/80">
              Cada oposición tiene pruebas físicas oficiales. Nuestro sistema IA crea planes personalizados
              para ayudarte a alcanzar los baremos mínimos y maximizar tu puntuación.
            </AlertDescription>
          </Alert>

          {/* Grid de tarjetas de oposiciones */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {OPOSICIONES.map((oposicion) => {
              const colors = getColorClasses(oposicion.color);
              const Icon = oposicion.icon;

              return (
                <Card
                  key={oposicion.id}
                  className={`bg-neutral-900/70 border border-white/10 ring-1 ring-white/5 ${colors.accent} shadow-[0_25px_60px_-50px_rgba(0,0,0,0.8)] backdrop-blur-lg transition-all duration-300 hover:border-white/20 cursor-pointer`}
                >
                  <div className="p-6">
                    {/* Header de la tarjeta */}
                    <div className="flex items-center gap-4 mb-4">
                      <div className={`p-3 ${colors.iconBg} rounded-xl`}>
                        <Icon className={`w-8 h-8 ${colors.text}`} />
                      </div>
                      <div className="flex-1">
                        <h2 className="text-2xl font-semibold font-urbanist text-white">{oposicion.name}</h2>
                        <p className="text-sm text-gray-300/80">{oposicion.nivel} • {oposicion.duracion}</p>
                      </div>
                    </div>

                    {/* Descripción */}
                    <p className="text-gray-300/90 mb-4">{oposicion.description}</p>

                    {/* Lista de pruebas (primeras 4) */}
                    <div className="mb-4">
                      <h3 className="text-sm font-semibold text-gray-300/70 mb-2">Pruebas principales</h3>
                      <ul className="space-y-1">
                        {oposicion.pruebas.slice(0, 4).map((prueba, index) => (
                          <li key={index} className="text-sm text-gray-200/90 flex items-start gap-2">
                            <span className={`${colors.dot} mt-1`}>•</span>
                            <span>{prueba}</span>
                          </li>
                        ))}
                        {oposicion.pruebas.length > 4 && (
                          <li className="text-sm text-gray-400">
                            + {oposicion.pruebas.length - 4} pruebas más...
                          </li>
                        )}
                      </ul>
                    </div>

                    {/* Botones de acción */}
                    <div className="flex gap-3 pt-4 border-t border-white/10">
                      <Button
                        variant="outline"
                        className="flex-1 border border-white/10 text-gray-200 hover:bg-white/10 hover:text-white"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenDetails(oposicion);
                        }}
                      >
                        Ver Detalles
                      </Button>
                      <Button
                        className="flex-1 bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 text-black hover:from-yellow-200 hover:via-yellow-300 hover:to-amber-400 shadow-[0_12px_30px_-18px_rgba(250,204,21,0.8)]"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectOposicion(oposicion);
                        }}
                      >
                        Comenzar Preparación
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Sección informativa adicional */}
          <Card className="bg-neutral-900/70 border border-white/10 ring-1 ring-white/5 shadow-[0_25px_60px_-50px_rgba(0,0,0,0.8)] backdrop-blur-lg p-6">
            <h3 className="text-xl font-semibold font-urbanist text-white mb-4">¿Por qué entrenar con nosotros?</h3>
            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <h4 className="font-semibold text-yellow-300 mb-2">🎯 Entrenamiento específico</h4>
                <p className="text-gray-300/80 text-sm">
                  Planes personalizados basados en las pruebas oficiales exactas de tu oposición objetivo.
                </p>
              </div>
              <div>
                <h4 className="font-semibold text-yellow-300 mb-2">📊 Seguimiento de progreso</h4>
                <p className="text-gray-300/80 text-sm">
                  Monitorea tu evolución hacia los baremos oficiales y ajusta tu entrenamiento en tiempo real.
                </p>
              </div>
              <div>
                <h4 className="font-semibold text-yellow-300 mb-2">🤖 IA especializada</h4>
                <p className="text-gray-300/80 text-sm">
                  Nuestro sistema IA conoce los requisitos de cada oposición y adapta el plan a tu nivel actual.
                </p>
              </div>
            </div>
          </Card>

      {/* Modal de detalles */}
      {showDetails && (
        <Dialog open={!!showDetails} onOpenChange={() => setShowDetails(null)}>
          <DialogContent className="sm:max-w-2xl bg-black/80 text-white border border-white/10 backdrop-blur-md">
            <DialogHeader>
              <DialogTitle className="text-2xl font-urbanist flex items-center gap-3">
                <showDetails.icon className={`w-8 h-8 ${getColorClasses(showDetails.color).text}`} />
                {showDetails.name}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-yellow-300 mb-2">Descripción</h3>
                <p className="text-gray-200/80">{showDetails.detalle}</p>
              </div>

              <div>
                <h3 className="font-semibold text-yellow-300 mb-2">Todas las pruebas físicas</h3>
                <ul className="space-y-2">
                  {showDetails.pruebas.map((prueba, index) => (
                    <li key={index} className="text-gray-200/90 flex items-start gap-2">
                      <span className="text-yellow-300 mt-1">•</span>
                      <span>{prueba}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="grid md:grid-cols-2 gap-4 pt-4 border-t border-white/10">
                <div>
                  <h4 className="font-semibold text-gray-300/70 mb-1">Nivel requerido</h4>
                  <p className="text-white">{showDetails.nivel}</p>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-300/70 mb-1">Duración preparación</h4>
                  <p className="text-white">{showDetails.duracion}</p>
                </div>
              </div>

              <Button
                className="w-full bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 text-black hover:from-yellow-200 hover:via-yellow-300 hover:to-amber-400 shadow-[0_12px_30px_-18px_rgba(250,204,21,0.8)]"
                onClick={() => {
                  setShowDetails(null);
                  handleSelectOposicion(showDetails);
                }}
              >
                Comenzar Preparación
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Error display */}
      {error && (
        <Alert className="mb-6 bg-red-900/30 border-red-500/40">
          <AlertCircle className="w-5 h-5 text-red-400" />
          <AlertDescription className="text-red-300">
            {error}
          </AlertDescription>
        </Alert>
      )}

      {/* Loading overlay */}
      {isLoading && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60]">
          <div className="bg-black/80 border border-yellow-400/30 rounded-2xl p-8 text-center shadow-2xl max-w-md">
            <div className="relative mb-4">
              <Loader className="w-12 h-12 text-yellow-300 animate-spin mx-auto" />
              <Sparkles className="w-6 h-6 text-yellow-300 absolute top-0 right-1/3 animate-pulse" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">Generando Plan de Entrenamiento</h3>
            <p className="text-gray-300/80">
              Nuestra IA especializada está creando tu plan personalizado para {selectedOposicion?.name}...
            </p>
          </div>
        </div>
      )}

      {/* Modal de confirmación del plan - Reutilizando el componente existente */}
      <TrainingPlanConfirmationModal
        isOpen={showConfirmation}
        onClose={() => setShowConfirmation(false)}
        onStartTraining={handleStartTraining}
        onGenerateAnother={handleGenerateAnother}
        plan={generatedPlan}
        methodology={selectedOposicion?.name}
        isLoading={isLoading}
        error={error}
        isConfirming={isLoading}
      />

      {/* Modal de Bomberos */}
      {showBomberosModal && (
        <Dialog open={showBomberosModal} onOpenChange={() => setShowBomberosModal(false)}>
          <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto bg-black/80 text-white border border-white/10 backdrop-blur-md">
            <DialogHeader className="sr-only">
              <DialogTitle>Evaluación Bomberos</DialogTitle>
            </DialogHeader>
            <BomberosManualCard
              onGenerate={handleBomberosGenerate}
              isLoading={isLoading}
              error={error}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Modal de calentamiento */}
      {showWarmupModal && sessionId && (
        <WarmupModal
          sessionId={sessionId}
          level={generatedPlan?.level || 'básico'}
          onComplete={handleWarmupComplete}
          onSkip={handleSkipWarmup}
          onClose={() => setShowWarmupModal(false)}
        />
      )}

      {/* Modal de sesión de rutina */}
      {showRoutineSessionModal && sessionData && (
        <RoutineSessionModal
          isOpen={showRoutineSessionModal}
          session={sessionData}
          sessionId={sessionId}
          onClose={() => {
            setShowRoutineSessionModal(false);
            handleCompleteSession();
          }}
          onFinishExercise={(exerciseIndex, progressData) => {
            console.log('Ejercicio terminado:', exerciseIndex, progressData);
          }}
          onSkipExercise={(exerciseIndex, progressData) => {
            console.log('Ejercicio saltado:', exerciseIndex, progressData);
          }}
          onCompleteSession={handleCompleteSession}
          navigateToRoutines={() => navigate('/routines', { state: { activeTab: 'today', fromSession: true } })}
        />
      )}
        </div>
      </div>
    </div>
  );
}
