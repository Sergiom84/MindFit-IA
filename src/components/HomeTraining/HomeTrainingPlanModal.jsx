import { Target } from 'lucide-react';

const HomeTrainingPlanModal = ({
  plan,
  planSource,
  personalizedMessage,
  onStart,
  onGenerateAnother,
  onClose,
  onCancel,
}) => {
  if (!plan) return null;
  const cardBase = 'bg-neutral-900/70 border border-white/10 ring-1 ring-white/5 shadow-[0_25px_60px_-50px_rgba(0,0,0,0.8)] backdrop-blur-lg';

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 px-4 pt-[calc(6rem+env(safe-area-inset-top))] pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <div className="bg-neutral-900/90 border border-white/10 ring-1 ring-white/10 rounded-3xl max-w-5xl w-full max-h-[calc(100vh-14rem)] overflow-hidden shadow-[0_40px_90px_-60px_rgba(0,0,0,0.9)] flex flex-col">
        {/* Header del modal */}
        <div className="p-6 border-b border-white/10">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-yellow-200/80 mb-2">Plan generado</p>
              <h2 className="text-2xl md:text-3xl font-semibold text-white mb-2 font-urbanist">
                {plan.titulo}
              </h2>
              <p className="text-gray-200/80">
                {plan.subtitulo}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-300 hover:text-white transition-colors bg-white/5 border border-white/10 rounded-full p-2"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Contenido del modal */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1 min-h-0 pb-10">
          {/* Mensaje personalizado */}
          {personalizedMessage && (
            <div className="bg-gradient-to-r from-yellow-400/10 to-amber-500/10 border border-yellow-400/30 rounded-2xl p-4">
              <p className="text-yellow-100 leading-relaxed">{personalizedMessage}</p>
            </div>
          )}

          {/* Información del entrenamiento */}
          <div className={`${cardBase} rounded-2xl p-5 border-l-2 border-yellow-400/40`}>
            <div className="flex items-center mb-3 gap-2">
              <Target size={20} className="text-yellow-300" />
              <h3 className="text-lg font-semibold text-yellow-200">
                {plan.tipo_nombre?.toUpperCase()} en Casa
              </h3>
            </div>
            <p className="text-gray-200/80 mb-4">Entrenamiento personalizado adaptado a tu equipamiento</p>

            <div className="space-y-2 text-sm">
              <p className="text-gray-200/80">
                <span className="font-semibold">Fuente del plan:</span> {planSource?.label || 'OpenAI'}{planSource?.detail ? ` (${planSource.detail})` : ''}
              </p>
              <p className="text-gray-200/80">
                <span className="font-semibold">Perfil:</span> {plan.perfil_usuario}
              </p>
            </div>

            {/* Barra de progreso */}
            <div className="mt-4">
              <div className="flex justify-between text-sm text-gray-300/70 mb-1">
                <span>Progreso</span>
                <span>0%</span>
              </div>
              <div className="w-full bg-white/10 rounded-full h-2">
                <div className="bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 h-2 rounded-full" style={{ width: '0%' }}></div>
              </div>
            </div>

            {/* Información adicional */}
            <div className="mt-4 flex flex-wrap gap-4 text-xs text-gray-300/70">
              <span>Fecha: {plan.fecha_formateada}</span>
              <span>Equipo: {plan.equipamiento}</span>
              <span>Tipo: {plan.tipoEntrenamiento}</span>
              <span>Duración estimada: {plan.duracion_estimada_min} min</span>
            </div>
          </div>

          {/* Lista de ejercicios */}
          {plan.ejercicios && (
            <div>
              <h4 className="text-lg font-semibold text-white mb-4 font-urbanist">Ejercicios del Plan</h4>
              <div className="space-y-3">
                {plan.ejercicios.map((ejercicio, idx) => (
                  <div key={idx} className="bg-white/5 border border-white/10 rounded-xl p-4">
                    <h5 className="font-semibold text-white mb-2">{ejercicio.nombre}</h5>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm text-gray-200/80 mb-2">
                      <span>Series: {ejercicio.series}</span>
                      {ejercicio.repeticiones && <span>Reps: {ejercicio.repeticiones}</span>}
                      {ejercicio.duracion_seg && <span>Duración: {ejercicio.duracion_seg}s</span>}
                      <span>Descanso: {ejercicio.descanso_seg}s</span>
                    </div>
                    {ejercicio.notas && (
                      <p className="text-xs text-gray-300/70 italic">{ejercicio.notas}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Botón de cancelar rutina - al final del todo */}
          {onCancel && (
            <div className="border-t border-white/10 pt-4">
              <button
                onClick={onCancel}
                className="w-full bg-red-500/10 hover:bg-red-500/20 text-red-200 font-semibold py-2.5 px-4 rounded-xl transition-colors duration-200 text-sm border border-red-400/30"
              >
                ❌ Cancelar Rutina Completamente
              </button>
              <p className="text-xs text-gray-300/70 text-center mt-2">
                Esto eliminará todo el progreso actual y regresará al inicio
              </p>
            </div>
          )}

          {/* Botones de acción */}
          <div className="flex gap-4 pt-4">
            <button
              onClick={onGenerateAnother}
              className="flex-1 bg-white/10 hover:bg-white/15 text-white font-semibold py-3 px-6 rounded-xl transition-colors duration-200 border border-white/10 hover:border-yellow-400/30"
            >
              Generar Otro Plan
            </button>
            <button
              onClick={onStart}
              className="flex-1 bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 hover:from-yellow-200 hover:via-yellow-300 hover:to-amber-400 text-black font-semibold py-3 px-6 rounded-xl transition-all duration-200 shadow-[0_12px_30px_-18px_rgba(250,204,21,0.8)]"
            >
              Comenzar Entrenamiento
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HomeTrainingPlanModal;

