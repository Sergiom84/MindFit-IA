import { useState, useEffect, useMemo } from 'react';
import useVirtualizedList, { VirtualizedListSearch, VirtualizedListLoader } from '../../hooks/useVirtualizedList.jsx';
import { ArrowLeft, Heart, ThumbsDown, Zap, Clock, TrendingUp, RotateCcw, Trash2, AlertTriangle, CheckCircle } from 'lucide-react';
import tokenManager from '../../utils/tokenManager';

const HomeTrainingPreferencesHistory = ({ onBack }) => {
  const [preferences, setPreferences] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('favorites'); // favorites, rejected, challenging, analytics
  const [isReactivating, setIsReactivating] = useState({});
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    loadPreferencesData();
  }, []);
  useEffect(() => {
    const handleMouseMove = (event) => {
      setMousePosition({ x: event.clientX, y: event.clientY });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const loadPreferencesData = async () => {
    try {
      const token = tokenManager.getToken();
      if (!token) return;

      const response = await fetch('/api/home-training/preferences-history', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();
      if (data.success) {
        setPreferences(data.preferences);
      }
    } catch (error) {
      console.error('Error loading preferences:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleReactivateExercise = async (rejectionId, exerciseName) => {
    try {
      setIsReactivating(prev => ({ ...prev, [rejectionId]: true }));
      
      const token = tokenManager.getToken();
      const response = await fetch(`/api/home-training/rejections/${rejectionId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();
      if (data.success) {
        // Recargar datos
        await loadPreferencesData();
        alert(`✅ "${exerciseName}" ya no será rechazado`);
      } else {
        throw new Error(data.message);
      }
    } catch (error) {
      console.error('Error reactivating exercise:', error);
      alert('Error al reactivar el ejercicio. Por favor, inténtalo de nuevo.');
    } finally {
      setIsReactivating(prev => ({ ...prev, [rejectionId]: false }));
    }
  };

  const tabs = [
    { id: 'favorites', label: 'Favoritos', icon: Heart, color: 'text-red-400' },
    { id: 'rejected', label: 'Rechazados', icon: ThumbsDown, color: 'text-gray-400' },
    { id: 'challenging', label: 'Desafiantes', icon: Zap, color: 'text-yellow-400' },
    { id: 'analytics', label: 'Estadísticas', icon: TrendingUp, color: 'text-blue-400' }
  ];
  const cardBase = 'bg-neutral-900/70 border border-white/10 ring-1 ring-white/5 shadow-[0_25px_60px_-50px_rgba(0,0,0,0.8)] backdrop-blur-lg';

  const getCategoryIcon = (category) => {
    const icons = {
      'too_hard': AlertTriangle,
      'dont_like': ThumbsDown,
      'injury': Heart,
      'equipment': Zap,
      'other': Clock
    };
    return icons[category] || Clock;
  };

  const getCategoryColor = (category) => {
    const colors = {
      'too_hard': 'text-red-400 bg-red-400/10 border-red-400/30',
      'dont_like': 'text-gray-400 bg-gray-400/10 border-gray-400/30',
      'injury': 'text-orange-400 bg-orange-400/10 border-orange-400/30',
      'equipment': 'text-blue-400 bg-blue-400/10 border-blue-400/30',
      'other': 'text-purple-400 bg-purple-400/10 border-purple-400/30'
    };
    return colors[category] || 'text-gray-400 bg-gray-400/10 border-gray-400/30';
  };

  const getCategoryLabel = (category) => {
    const labels = {
      'too_hard': 'Muy difícil',
      'dont_like': 'No me gusta',
      'injury': 'Lesión/Limitación',
      'equipment': 'Sin equipamiento',
      'other': 'Otro motivo'
    };
    return labels[category] || 'Otro';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050506] text-white relative overflow-hidden pt-24 pb-24 font-body">
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
        <div className="relative z-10 container mx-auto px-6 flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-yellow-400/30 border-t-yellow-400 rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-300/70">Cargando preferencias...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050506] text-white relative overflow-hidden pt-24 pb-24 font-body">
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
      <div className="relative z-10 container mx-auto px-6">
        <div className="space-y-10">
          <header className="space-y-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-3">
                <p className="text-xs uppercase tracking-[0.4em] text-yellow-200/80">Entrenamiento en casa</p>
                <h1 className="text-4xl md:text-5xl font-semibold font-urbanist text-white">
                  Historial de Preferencias
                </h1>
                <p className="text-lg text-gray-200/80 max-w-2xl">
                  Revisa tus ejercicios favoritos, rechazados y estadísticas de entrenamiento
                </p>
              </div>
              <button
                onClick={onBack}
                className="flex items-center gap-2 text-gray-200 hover:text-white transition-all duration-200 px-4 py-2 rounded-full border border-white/10 bg-white/5 hover:border-yellow-400/30"
              >
                <ArrowLeft size={18} />
                Volver al entrenamiento
              </button>
            </div>
          </header>

          {/* Tabs */}
          <div className="flex justify-center">
            <div className="bg-black/60 border border-white/10 rounded-2xl p-2 flex gap-2 backdrop-blur">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold uppercase tracking-wider transition-all duration-200 ${
                      isActive
                        ? 'bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 text-black shadow-[0_12px_30px_-18px_rgba(250,204,21,0.8)]'
                        : 'text-gray-200 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <Icon size={16} className={`mr-2 ${isActive ? 'text-black' : tab.color}`} />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Content */}
          <div className="max-w-6xl mx-auto">
          {/* Tab: Favoritos */}
          {activeTab === 'favorites' && (
            <div>
              <div className="text-center mb-8">
                <Heart size={48} className="text-red-400 mx-auto mb-4" />
                <h2 className="text-2xl font-semibold text-white mb-2 font-urbanist">Ejercicios Favoritos</h2>
                <p className="text-gray-200/70">Ejercicios que has completado y calificado como "me encanta"</p>
              </div>

              {preferences?.favorites?.length > 0 ? (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {preferences.favorites.map((exercise, index) => (
                    <div key={index} className={`${cardBase} rounded-2xl p-6 border-l-2 border-red-400/40`}>
                      <div className="flex items-center justify-between mb-4">
                        <Heart size={24} className="text-red-400" />
                        <span className="text-sm text-gray-300/70">
                          {exercise.times_completed} veces completado
                        </span>
                      </div>
                      <h3 className="text-lg font-semibold text-white mb-2">{exercise.exercise_name}</h3>
                      <div className="flex items-center justify-between text-sm text-gray-300/70">
                        <span>Última vez: {new Date(exercise.last_completed).toLocaleDateString()}</span>
                        <span className="bg-red-400/20 text-red-300 px-2 py-1 rounded-full">
                          ❤️ Favorito
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 bg-white/5 border border-white/10 rounded-2xl">
                  <Heart size={64} className="text-gray-600 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-gray-300 mb-2">No hay ejercicios favoritos aún</h3>
                  <p className="text-gray-400/70">Completa ejercicios y califícalos como "me encanta" para verlos aquí</p>
                </div>
              )}
            </div>
          )}

          {/* Tab: Rechazados */}
          {activeTab === 'rejected' && (
            <div>
              <div className="text-center mb-8">
                <ThumbsDown size={48} className="text-gray-400 mx-auto mb-4" />
                <h2 className="text-2xl font-semibold text-white mb-2 font-urbanist">Ejercicios Rechazados</h2>
                <p className="text-gray-200/70">Ejercicios que has marcado para evitar. Puedes reactivarlos cuando quieras.</p>
              </div>

              {preferences?.rejected?.length > 0 ? (
                <div className="space-y-4">
                  {preferences.rejected.map((rejection) => {
                    const Icon = getCategoryIcon(rejection.rejection_category);
                    const colorClass = getCategoryColor(rejection.rejection_category);
                    const categoryLabel = getCategoryLabel(rejection.rejection_category);
                    const isExpiring = rejection.days_until_expires !== null;
                    const isReactivatingThis = isReactivating[rejection.id];

                    return (
                      <div key={rejection.id} className={`${cardBase} rounded-2xl p-6`}>
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center mb-3">
                              <Icon size={20} className={`mr-3 ${colorClass.split(' ')[0]}`} />
                              <h3 className="text-lg font-semibold text-white">{rejection.exercise_name}</h3>
                              <div className={`ml-3 px-3 py-1 rounded-lg border text-sm ${colorClass}`}>
                                {categoryLabel}
                              </div>
                            </div>

                            {rejection.rejection_reason && (
                              <p className="text-gray-300/70 mb-3 italic">"{rejection.rejection_reason}"</p>
                            )}

                            <div className="flex items-center gap-4 text-sm text-gray-400/70">
                              <span>Rechazado: {new Date(rejection.rejected_at).toLocaleDateString()}</span>
                              {isExpiring ? (
                                <span className="text-yellow-300">
                                  <Clock size={16} className="inline mr-1" />
                                  Expira en {rejection.days_until_expires} días
                                </span>
                              ) : (
                                <span className="text-red-300">Permanente</span>
                              )}
                            </div>
                          </div>

                          <button
                            onClick={() => handleReactivateExercise(rejection.id, rejection.exercise_name)}
                            disabled={isReactivatingThis}
                            className="flex items-center px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 disabled:bg-white/5 disabled:cursor-not-allowed text-emerald-200 rounded-xl transition-colors ml-4 border border-emerald-400/30"
                          >
                            {isReactivatingThis ? (
                              <>
                                <div className="w-4 h-4 border-2 border-emerald-200/20 border-t-emerald-200 rounded-full animate-spin mr-2" />
                                Reactivando...
                              </>
                            ) : (
                              <>
                                <RotateCcw size={16} className="mr-2" />
                                Reactivar
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12 bg-white/5 border border-white/10 rounded-2xl">
                  <CheckCircle size={64} className="text-emerald-400 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-emerald-300 mb-2">¡Perfecto!</h3>
                  <p className="text-gray-400/70">No has rechazado ningún ejercicio. Todos están disponibles para tus entrenamientos.</p>
                </div>
              )}
            </div>
          )}

          {/* Tab: Desafiantes */}
          {activeTab === 'challenging' && (
            <div>
              <div className="text-center mb-8">
                <Zap size={48} className="text-yellow-400 mx-auto mb-4" />
                <h2 className="text-2xl font-semibold text-white mb-2 font-urbanist">Ejercicios Desafiantes</h2>
                <p className="text-gray-200/70">Ejercicios que has completado pero calificado como "difícil"</p>
              </div>

              {preferences?.challenging?.length > 0 ? (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {preferences.challenging.map((exercise, index) => (
                    <div key={index} className={`${cardBase} rounded-2xl p-6 border-l-2 border-yellow-400/40`}>
                      <div className="flex items-center justify-between mb-4">
                        <Zap size={24} className="text-yellow-400" />
                        <span className="text-sm text-gray-300/70">
                          {exercise.times_completed} veces completado
                        </span>
                      </div>
                      <h3 className="text-lg font-semibold text-white mb-2">{exercise.exercise_name}</h3>
                      <div className="flex items-center justify-between text-sm text-gray-300/70">
                        <span>Última vez: {new Date(exercise.last_completed).toLocaleDateString()}</span>
                        <span className="bg-yellow-400/20 text-yellow-300 px-2 py-1 rounded-full">
                          💪 Difícil
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 bg-white/5 border border-white/10 rounded-2xl">
                  <Zap size={64} className="text-gray-600 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-gray-300 mb-2">No hay ejercicios desafiantes registrados</h3>
                  <p className="text-gray-400/70">Completa ejercicios y califícalos como "difícil" para verlos aquí</p>
                </div>
              )}
            </div>
          )}

          {/* Tab: Estadísticas */}
          {activeTab === 'analytics' && (
            <div>
              <div className="text-center mb-8">
                <TrendingUp size={48} className="text-blue-400 mx-auto mb-4" />
                <h2 className="text-2xl font-semibold text-white mb-2 font-urbanist">Estadísticas de Preferencias</h2>
                <p className="text-gray-200/70">Análisis de tus patrones de entrenamiento y preferencias</p>
              </div>

              {preferences && (
                <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {/* Total Ejercicios Completados */}
                  <div className={`${cardBase} rounded-2xl p-6 text-center border-l-2 border-green-400/40`}>
                    <CheckCircle size={32} className="text-green-400 mx-auto mb-3" />
                    <div className="text-3xl font-bold text-white mb-1">
                      {preferences.analytics?.total_completed || 0}
                    </div>
                    <div className="text-sm text-gray-300/70">Ejercicios completados</div>
                  </div>

                  {/* Favoritos */}
                  <div className={`${cardBase} rounded-2xl p-6 text-center border-l-2 border-red-400/40`}>
                    <Heart size={32} className="text-red-400 mx-auto mb-3" />
                    <div className="text-3xl font-bold text-white mb-1">
                      {preferences.favorites?.length || 0}
                    </div>
                    <div className="text-sm text-gray-300/70">Ejercicios favoritos</div>
                  </div>

                  {/* Rechazados */}
                  <div className={`${cardBase} rounded-2xl p-6 text-center border-l-2 border-gray-400/40`}>
                    <ThumbsDown size={32} className="text-gray-400 mx-auto mb-3" />
                    <div className="text-3xl font-bold text-white mb-1">
                      {preferences.rejected?.length || 0}
                    </div>
                    <div className="text-sm text-gray-300/70">Ejercicios rechazados</div>
                  </div>

                  {/* Desafiantes */}
                  <div className={`${cardBase} rounded-2xl p-6 text-center border-l-2 border-yellow-400/40`}>
                    <Zap size={32} className="text-yellow-400 mx-auto mb-3" />
                    <div className="text-3xl font-bold text-white mb-1">
                      {preferences.challenging?.length || 0}
                    </div>
                    <div className="text-sm text-gray-300/70">Ejercicios desafiantes</div>
                  </div>
                </div>
              )}

              {/* Motivational Messages */}
              {preferences && (
                <div className="mt-8 bg-gradient-to-r from-yellow-400/10 to-blue-400/10 border border-yellow-400/30 rounded-2xl p-6">
                  <h3 className="text-xl font-semibold text-white mb-4 font-urbanist">💡 Sugerencias Personalizadas</h3>
                  <div className="space-y-3">
                    {preferences.favorites?.length > 0 && (
                      <p className="text-yellow-100/90">
                        🔥 ¡Tienes {preferences.favorites.length} ejercicios favoritos! ¿Te gustaría incluir más de ellos en tu próximo entrenamiento?
                      </p>
                    )}
                    {preferences.challenging?.length > 2 && (
                      <p className="text-blue-100/90">
                        💪 Has superado {preferences.challenging.length} ejercicios desafiantes. ¡Eres más fuerte de lo que crees!
                      </p>
                    )}
                    {preferences.rejected?.some(r => r.rejection_category === 'too_hard') && (
                      <p className="text-orange-100/90">
                        🎯 Algunos ejercicios te parecieron muy difíciles. ¿Quieres probar versiones más fáciles para progresar gradualmente?
                      </p>
                    )}
                    {(!preferences.rejected?.length || preferences.rejected.length === 0) && (
                      <p className="text-emerald-100/90">
                        ✨ ¡Excelente! No has rechazado ningún ejercicio. Tu actitud positiva es admirable.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
    </div>
  );
};

export default HomeTrainingPreferencesHistory;
