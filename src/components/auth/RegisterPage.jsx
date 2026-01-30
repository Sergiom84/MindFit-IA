import { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { User, ArrowLeft, ArrowRight, Check, AlertCircle } from 'lucide-react';
import BasicInfoStep from './steps/BasicInfoStep';
import BodyMeasurementsStep from './steps/BodyMeasurementsStep';
import HealthInfoStep from './steps/HealthInfoStep';
import GoalsStep from './steps/GoalsStep';
import SuccessPopup from '../ui/SuccessPopup';
import ErrorPopup from '../ui/ErrorPopup';
import { useMultiStepForm } from '../../hooks/useMultiStepForm';
import { useRegistration } from '../../hooks/useRegistration';

const INITIAL_FORM_DATA = {
  // Información básica
  nombre: '',
  apellido: '',
  email: '',
  password: '',

  // Datos personales
  edad: '',
  sexo: '',
  peso: '',
  altura: '',

  // Experiencia en entrenamiento
  nivelEntrenamiento: '',
  anosEntrenando: '',
  frecuenciaSemanal: '',
  metodologiaPreferida: '',
  nivelActividad: '',

  // Medidas corporales (opcional)
  cintura: '',
  pecho: '',
  brazos: '',
  muslos: '',
  cuello: '',
  antebrazos: '',

  // Información de salud (opcional)
  historialMedico: '',
  limitacionesFisicas: '',
  alergias: '',
  medicamentos: '',

  // Metas y objetivos
  objetivoPrincipal: '',
  metaPeso: '',
  metaGrasaCorporal: '',
  enfoqueEntrenamiento: '',
  horarioPreferido: '',
  comidasPorDia: '',
  suplementacion: '',
  alimentosExcluidos: ''
};

const RegisterPage = () => {
  const navigate = useNavigate();
  const { register, isSubmitting } = useRegistration();

  const steps = [
    { title: 'Básicos', component: BasicInfoStep },
    { title: 'Composición', component: BodyMeasurementsStep },
    { title: 'Salud', component: HealthInfoStep },
    { title: 'Objetivos', component: GoalsStep }
  ];

  const {
    currentStep,
    formData,
    stepErrors,
    canGoNext,
    canGoPrevious,
    handleNext,
    handlePrevious,
    handleInputChange,
    validateAllSteps,
    clearFormData,
    progress,
    isLastStep
  } = useMultiStepForm(INITIAL_FORM_DATA, steps);

  const [showSuccessPopup, setShowSuccessPopup] = useState(false);
  const [errorPopup, setErrorPopup] = useState({ show: false, message: '', title: '' });

  const handleStepNext = () => {
    const success = handleNext();
    if (!success) {
      // El hook ya maneja la validación y muestra errores
      console.log('Validation failed for step:', currentStep);
    }
  };

  const handleSubmit = async () => {
    // Validar todos los pasos antes de enviar
    const { isValid } = validateAllSteps();
    if (!isValid) {
      setErrorPopup({
        show: true,
        title: 'Formulario incompleto',
        message: 'Por favor, completa todos los campos requeridos antes de continuar.'
      });
      return;
    }

    const result = await register(formData);

    if (result.success) {
      if (result.autoLogin) {
        // Navegación manejada por useRegistration
      } else {
        setShowSuccessPopup(true);
      }
    } else {
      setErrorPopup({
        show: true,
        title: 'Error en el registro',
        message: result.error
      });
    }
  };

  const handleSuccessClose = () => {
    setShowSuccessPopup(false);
    navigate('/login');
  };

  const CurrentStepComponent = steps[currentStep].component;

  return (
    <div className="min-h-screen bg-[#050506] text-white relative overflow-hidden font-body">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[url('/assets/tech-lux/bg-tech-lux-mobile.jpg')] sm:bg-[url('/assets/tech-lux/bg-tech-lux-desktop.jpg')] bg-cover bg-center opacity-80 sm:opacity-70" />
        <div className="absolute inset-0 bg-[url('/assets/tech-lux/texture-tech-lux-tile.jpg')] bg-repeat opacity-20 mix-blend-soft-light" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/40 to-black/80 sm:from-black/40 sm:via-black/60 sm:to-black" />
        <div className="absolute -top-20 right-0 h-56 w-56 bg-yellow-400/10 blur-[140px]" />
        <div className="absolute top-1/3 -left-16 h-64 w-64 bg-yellow-400/10 blur-[160px]" />
      </div>
      <div className="relative z-10 min-h-screen flex items-center justify-center px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="w-full max-w-4xl"
        >
          {/* Header con pestañas */}
          <div className="mb-8">
            <div className="flex rounded-2xl overflow-hidden border border-white/10 bg-white/5 backdrop-blur">
              <button
                onClick={() => navigate('/login')}
                className="flex-1 bg-transparent text-gray-200 py-3 px-6 font-semibold hover:bg-white/10 transition-colors"
              >
                Iniciar Sesión
              </button>
              <button className="flex-1 bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 text-black py-3 px-6 font-semibold flex items-center justify-center gap-2 transition-colors">
                <User size={18} />
                Registrarse
              </button>
            </div>

            {/* Subtítulo */}
            <div className="text-center mt-4">
              <p className="text-gray-300/80 text-lg font-semibold">Tu entrenador personal con inteligencia artificial</p>
            </div>
          </div>

          {/* Indicador de pasos */}
          <div className="mb-8">
            <div className="flex justify-center space-x-4 mb-4">
              {steps.map((step, index) => (
                <div
                  key={index}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    index === currentStep
                      ? 'bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 text-black'
                      : index < currentStep
                      ? 'bg-white/5 text-yellow-200 border border-yellow-400/40'
                      : 'bg-white/5 text-gray-300 border border-white/10'
                  }`}
                >
                  {step.title}
                </div>
              ))}
            </div>

            {/* Barra de progreso */}
            <div className="w-full bg-white/10 rounded-full h-2">
              <div
                className="bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Contenido del formulario */}
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
            className="bg-neutral-900/70 border border-white/10 ring-1 ring-white/5 shadow-[0_25px_60px_-50px_rgba(0,0,0,0.8)] backdrop-blur-lg rounded-2xl p-6 sm:p-8"
          >
            <CurrentStepComponent
              formData={formData}
              onInputChange={handleInputChange}
              errors={stepErrors}
            />

            {/* Botones de navegación */}
            <div className="flex justify-between mt-8">
              <button
                onClick={handlePrevious}
                disabled={!canGoPrevious}
                className="flex items-center gap-2 px-6 py-3 bg-white/5 text-gray-100 rounded-lg hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-white/10 font-semibold"
              >
                <ArrowLeft size={18} />
                Anterior
              </button>

              {isLastStep ? (
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 text-black rounded-lg hover:from-yellow-200 hover:via-yellow-300 hover:to-amber-400 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_12px_30px_-18px_rgba(250,204,21,0.8)]"
                >
                  {isSubmitting ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-black/40 border-t-transparent"></div>
                      Guardando...
                    </>
                  ) : (
                    <>
                      <Check size={18} />
                      Guardar Perfil
                    </>
                  )}
                </button>
              ) : (
                <button
                  onClick={handleStepNext}
                  className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 text-black rounded-lg hover:from-yellow-200 hover:via-yellow-300 hover:to-amber-400 transition-colors font-semibold shadow-[0_12px_30px_-18px_rgba(250,204,21,0.8)]"
                >
                  Siguiente
                  <ArrowRight size={18} />
                </button>
              )}
            </div>

            {/* Indicador de errores de validación */}
            {Object.keys(stepErrors).length > 0 && (
              <div className="mt-4 p-3 bg-red-900/20 border border-red-400/30 rounded-lg">
                <div className="flex items-center gap-2 text-red-400 text-sm">
                  <AlertCircle size={16} />
                  <span>Por favor, corrige los errores antes de continuar</span>
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>

        {/* Popup de Éxito */}
        <SuccessPopup
          show={showSuccessPopup}
          title="¡Registro Exitoso!"
          message="Se ha registrado correctamente. Ahora puedes iniciar sesión con tus credenciales."
          onClose={handleSuccessClose}
          onContinue={handleSuccessClose}
        />

        {/* Popup de Error */}
        <ErrorPopup
          show={errorPopup.show}
          title={errorPopup.title}
          message={errorPopup.message}
          onClose={() => setErrorPopup({ show: false, message: '', title: '' })}
        />
      </div>
    </div>
  );
};

export default RegisterPage;
