import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card.jsx';
import { Badge } from '@/components/ui/badge.jsx';
import { Progress } from '@/components/ui/progress.jsx';
import {
  BarChart3,
  TrendingUp,
  Calendar,
  Clock,
  Target,
  Award,
  Activity,
  CheckCircle,
  Flame,
  Zap,
  Trophy,
  Star,
  Dumbbell,
  Timer
} from 'lucide-react';
import { getProgressData } from '../api';

export default function ProgressTab({ plan, methodologyPlanId, routinePlan, routinePlanId, progressUpdatedAt }) {
  // Usar routinePlan si plan no está disponible (compatibilidad)
  const effectivePlan = plan || routinePlan;
  const effectiveMethodologyPlanId = methodologyPlanId || routinePlanId;

  const [progressData, setProgressData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadProgressData = async () => {
      if (!effectiveMethodologyPlanId) {
        console.log('⚠️ ProgressTab: No hay methodologyPlanId disponible');
        return;
      }

      console.log(`📊 ProgressTab: Cargando datos para plan ${effectiveMethodologyPlanId}`);
      setLoading(true);
      setError(null);

      try {
        const data = await getProgressData({ methodology_plan_id: effectiveMethodologyPlanId });
        console.log('✅ ProgressTab: Datos cargados:', data);
        // Validar estructura de datos recibidos
        if (!data || typeof data !== 'object') {
          throw new Error('Datos de progreso inválidos');
        }
        setProgressData(data);
      } catch (err) {
        console.error('❌ ProgressTab: Error cargando datos de progreso:', err);
        setError(err.message);
        // Establecer datos de progreso vacíos basados en estructura esperada
        setProgressData({
          totalWeeks: 0,
          currentWeek: 1,
          totalSessions: 0,
          completedSessions: 0,
          totalExercises: 0,
          completedExercises: 0,
          totalSeriesCompleted: 0,
          totalTimeSpentSeconds: 0,
          weeklyProgress: [],
          recentActivity: []
        });
      } finally {
        setLoading(false);
      }
    };

    loadProgressData();
  }, [effectiveMethodologyPlanId, effectivePlan, progressUpdatedAt]);

  const calculateOverallProgress = () => {
    if (!progressData || !progressData.totalSessions || progressData.totalSessions === 0) return 0;
    const completed = progressData.completedSessions || 0;
    const total = progressData.totalSessions || 0;
    return Math.round((completed / total) * 100);
  };

  const calculateWeekProgress = (weekData) => {
    if (!weekData || !weekData.sessions || weekData.sessions === 0) return 0;
    const completed = weekData.completed || 0;
    const total = weekData.sessions || 0;
    return Math.round((completed / total) * 100);
  };

  const formatTime = (seconds) => {
    if (!seconds || seconds === 0) return '0h 0min';
    const totalSeconds = Math.max(0, parseInt(seconds) || 0);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return `${hours}h ${minutes}min`;
  };

  // Calcular racha actual (días consecutivos con entrenamientos)
  const calculateCurrentStreak = () => {
    if (!progressData?.recentActivity || progressData.recentActivity.length === 0) return 0;

    const sortedActivity = [...progressData.recentActivity].sort((a, b) =>
      new Date(b.date) - new Date(a.date)
    );

    let streak = 0;
    let currentDate = new Date();
    currentDate.setHours(0, 0, 0, 0);

    for (const activity of sortedActivity) {
      const activityDate = new Date(activity.date);
      activityDate.setHours(0, 0, 0, 0);

      const diffDays = Math.floor((currentDate - activityDate) / (1000 * 60 * 60 * 24));

      if (diffDays === streak) {
        streak++;
      } else if (diffDays > streak) {
        break;
      }
    }

    return streak;
  };

  // Calcular mejor racha histórica
  const calculateBestStreak = () => {
    if (!progressData?.recentActivity || progressData.recentActivity.length === 0) return 0;

    const sortedActivity = [...progressData.recentActivity].sort((a, b) =>
      new Date(a.date) - new Date(b.date)
    );

    let maxStreak = 0;
    let currentStreak = 1;

    for (let i = 1; i < sortedActivity.length; i++) {
      const prevDate = new Date(sortedActivity[i - 1].date);
      const currDate = new Date(sortedActivity[i].date);

      prevDate.setHours(0, 0, 0, 0);
      currDate.setHours(0, 0, 0, 0);

      const diffDays = Math.floor((currDate - prevDate) / (1000 * 60 * 60 * 24));

      if (diffDays === 1) {
        currentStreak++;
      } else {
        maxStreak = Math.max(maxStreak, currentStreak);
        currentStreak = 1;
      }
    }

    return Math.max(maxStreak, currentStreak);
  };

  // Calcular intensidad promedio (basado en completitud de ejercicios)
  const calculateAverageIntensity = () => {
    if (!progressData || !progressData.totalExercises || progressData.totalExercises === 0) return 0;
    const completed = progressData.completedExercises || 0;
    const total = progressData.totalExercises || 0;
    return Math.round((completed / total) * 100);
  };

  // Calcular consistencia (sesiones completadas vs totales)
  const calculateConsistency = () => {
    if (!progressData || !progressData.totalSessions || progressData.totalSessions === 0) return 0;
    const completed = progressData.completedSessions || 0;
    const total = progressData.totalSessions || 0;
    return Math.round((completed / total) * 100);
  };

  // Obtener próximos hitos
  const getNextMilestones = () => {
    const sessions = progressData?.completedSessions || 0;
    const series = progressData?.totalSeriesCompleted || 0;
    const weeks = progressData?.weeklyProgress?.filter(w => Number(w.completed || 0) === Number(w.sessions || 0) && Number(w.sessions || 0) > 0).length || 0;

    const milestones = [
      {
        title: '10 Sesiones',
        progress: Math.min(100, Math.round((sessions / 10) * 100)),
        achieved: sessions >= 10,
        icon: <Dumbbell className="w-5 h-5 text-white" />
      },
      {
        title: '100 Series',
        progress: Math.min(100, Math.round((series / 100) * 100)),
        achieved: series >= 100,
        icon: <Target className="w-5 h-5 text-white" />
      },
      {
        title: '2 Semanas Completas',
        progress: Math.min(100, Math.round((weeks / 2) * 100)),
        achieved: weeks >= 2,
        icon: <Calendar className="w-5 h-5 text-white" />
      },
      {
        title: '20 Sesiones',
        progress: Math.min(100, Math.round((sessions / 20) * 100)),
        achieved: sessions >= 20,
        icon: <Trophy className="w-5 h-5 text-white" />
      }
    ];

    return milestones;
  };

  // Mostrar error si existe
  if (error && !loading && !progressData) {
    return (
      <div className="text-center py-12">
        <BarChart3 className="w-16 h-16 text-red-500 mx-auto mb-4" />
        <p className="text-red-400 text-lg mb-2">Error cargando datos de progreso</p>
        <p className="text-gray-400 text-sm">{error}</p>
        <button
          onClick={() => {
            setError(null);
            setLoading(true);
            // Recargar datos
            const loadProgressData = async () => {
              try {
                const data = await getProgressData({ methodology_plan_id: effectiveMethodologyPlanId });
                if (!data || typeof data !== 'object') {
                  throw new Error('Datos de progreso inválidos');
                }
                setProgressData(data);
              } catch (err) {
                setError(err.message);
                setProgressData({
                  totalWeeks: 0,
                  currentWeek: 1,
                  totalSessions: 0,
                  completedSessions: 0,
                  totalExercises: 0,
                  completedExercises: 0,
                  totalSeriesCompleted: 0,
                  totalTimeSpentSeconds: 0,
                  weeklyProgress: [],
                  recentActivity: []
                });
              } finally {
                setLoading(false);
              }
            };
            if (effectiveMethodologyPlanId) loadProgressData();
          }}
          className="mt-4 px-4 py-2 bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 text-black rounded-lg hover:from-yellow-200 hover:via-yellow-300 hover:to-amber-400 transition-colors shadow-[0_12px_30px_-18px_rgba(250,204,21,0.8)]"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (!effectivePlan && !loading && !error) {
    return (
      <div className="text-center py-12">
        <BarChart3 className="w-16 h-16 text-gray-500 mx-auto mb-4" />
        <p className="text-gray-400 text-lg">No hay datos de progreso disponibles</p>
        <p className="text-gray-500 text-sm mt-2">Selecciona una rutina para ver tu progreso</p>
      </div>
    );
  }

  if (loading || (!progressData && !error)) {
    return (
      <div className="space-y-6">
        <Card className="bg-neutral-900/70 border border-white/10 ring-1 ring-white/5 border-l-2 border-l-yellow-400/25 p-6 shadow-[0_25px_60px_-50px_rgba(0,0,0,0.8)] backdrop-blur-lg transition-all duration-300 hover:border-white/20">
          <div className="animate-pulse">
            <div className="h-6 bg-gray-700 rounded w-1/3 mb-4"></div>
            <div className="h-3 bg-gray-700 rounded w-full mb-4"></div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="text-center">
                  <div className="h-8 bg-gray-700 rounded w-12 mx-auto mb-2"></div>
                  <div className="h-3 bg-gray-700 rounded w-20 mx-auto"></div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card className="bg-neutral-900/70 border border-white/10 ring-1 ring-white/5 border-l-2 border-l-yellow-400/25 p-6 shadow-[0_25px_60px_-50px_rgba(0,0,0,0.8)] backdrop-blur-lg transition-all duration-300 hover:border-white/20">
          <div className="animate-pulse">
            <div className="h-5 bg-gray-700 rounded w-1/4 mb-4"></div>
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="border border-gray-700 rounded-lg p-4">
                  <div className="h-4 bg-gray-700 rounded w-1/6 mb-2"></div>
                  <div className="h-2 bg-gray-700 rounded w-full"></div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <div className="grid md:grid-cols-2 gap-6">
          {[1, 2].map((i) => (
            <Card key={i} className="bg-neutral-900/70 border border-white/10 ring-1 ring-white/5 border-l-2 border-l-yellow-400/25 p-6 shadow-[0_25px_60px_-50px_rgba(0,0,0,0.8)] backdrop-blur-lg transition-all duration-300 hover:border-white/20">
              <div className="animate-pulse">
                <div className="h-5 bg-gray-700 rounded w-1/3 mb-4"></div>
                <div className="space-y-3">
                  <div className="h-3 bg-gray-700 rounded w-full"></div>
                  <div className="h-3 bg-gray-700 rounded w-3/4"></div>
                  <div className="h-3 bg-gray-700 rounded w-5/6"></div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Resumen general */}
      <Card className="bg-neutral-900/70 border border-white/10 ring-1 ring-white/5 border-l-2 border-l-yellow-400/40 p-6 shadow-[0_25px_60px_-50px_rgba(0,0,0,0.8)] backdrop-blur-lg transition-all duration-300 hover:border-white/20">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-2xl font-semibold font-urbanist text-white mb-2">Progreso General</h2>
            <Badge variant="secondary" className="bg-yellow-400/20 text-yellow-200 border border-yellow-400/30">
              {effectivePlan?.selected_style || effectivePlan?.nombre || 'Metodología'}
            </Badge>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-yellow-300">
              {calculateOverallProgress()}%
            </div>
            <div className="text-sm text-gray-300/70">Completado</div>
          </div>
        </div>

        <Progress 
          value={calculateOverallProgress()} 
          className="h-3 mb-4"
        />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-white">{progressData.currentWeek || 1}</div>
            <div className="text-sm text-gray-300/70">Semana Actual</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-emerald-300">{progressData.completedSessions || 0}</div>
            <div className="text-sm text-gray-300/70">Sesiones Completadas</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-yellow-300">{progressData.completedExercises || 0}</div>
            <div className="text-sm text-gray-300/70">Ejercicios Completados</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-sky-300">{progressData.totalSeriesCompleted || 0}</div>
            <div className="text-sm text-gray-300/70">Series Totales</div>
          </div>
        </div>
      </Card>

      {/* Progreso por semanas */}
      <Card className="bg-neutral-900/70 border border-white/10 ring-1 ring-white/5 border-l-2 border-l-sky-400/35 p-6 shadow-[0_25px_60px_-50px_rgba(0,0,0,0.8)] backdrop-blur-lg transition-all duration-300 hover:border-white/20">
        <h3 className="text-lg font-semibold font-urbanist text-white mb-4 flex items-center">
          <Calendar className="w-5 h-5 mr-2 text-yellow-300" />
          Progreso por Semanas
        </h3>

        <div className="space-y-4">
          {progressData.weeklyProgress?.length > 0 ? progressData.weeklyProgress.map((week) => (
            <div key={week.week} className="border border-white/10 rounded-lg p-4 bg-black/50">
              <div className="flex justify-between items-center mb-3">
                <div className="flex items-center space-x-3">
                  <Badge variant="outline" className="border-yellow-400/40 text-yellow-300">
                    Semana {week.week}
                  </Badge>
                  <span className="text-sm text-gray-300/70">
                    {week.completed || 0}/{week.sessions || 0} sesiones
                  </span>
                </div>
                <div className="text-sm font-medium text-white">
                  {calculateWeekProgress(week)}%
                </div>
              </div>

              <Progress 
                value={calculateWeekProgress(week)} 
                className="h-2 mb-2"
              />

              <div className="flex justify-between text-xs text-gray-300/70">
                <span>{week.exercisesCompleted || 0}/{week.exercises || 0} ejercicios</span>
                {(week.seriesCompleted || 0) > 0 && (
                  <span className="text-sky-300">
                    {week.seriesCompleted || 0} series completadas
                  </span>
                )}
                {Number(week.completed || 0) === Number(week.sessions || 0) && Number(week.completed || 0) > 0 && (
                  <span className="text-emerald-300 flex items-center">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Completada
                  </span>
                )}
              </div>
            </div>
          )) : (
            <div className="text-center py-8 text-gray-300/70">
              <Calendar className="w-12 h-12 mx-auto mb-3 text-gray-500" />
              <p>No hay progreso por semanas aún</p>
              <p className="text-sm">Completa entrenamientos para ver tu progreso semanal</p>
            </div>
          )}
        </div>
      </Card>

      {/* Estadísticas adicionales */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Tiempo total */}
        <Card className="bg-neutral-900/70 border border-white/10 ring-1 ring-white/5 border-l-2 border-l-yellow-400/30 p-6 shadow-[0_25px_60px_-50px_rgba(0,0,0,0.8)] backdrop-blur-lg transition-all duration-300 hover:border-white/20">
          <h3 className="text-lg font-semibold font-urbanist text-white mb-4 flex items-center">
            <Clock className="w-5 h-5 mr-2 text-yellow-300" />
            Tiempo de Entrenamiento
          </h3>
          
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-gray-300/70">Total entrenado:</span>
              <span className="text-white font-semibold">{formatTime(progressData.totalTimeSpentSeconds || 0)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-300/70">Promedio por sesión:</span>
              <span className="text-white font-semibold">
                {(progressData.completedSessions || 0) > 0
                  ? formatTime(Math.round((progressData.totalTimeSpentSeconds || 0) / progressData.completedSessions))
                  : '0h 0min'
                }
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-300/70">Sesiones completadas:</span>
              <span className="text-white font-semibold">{progressData.completedSessions || 0}/{progressData.totalSessions || 0}</span>
            </div>
          </div>
        </Card>

        {/* Logros */}
        <Card className="bg-neutral-900/70 border border-white/10 ring-1 ring-white/5 border-l-2 border-l-emerald-400/30 p-6 shadow-[0_25px_60px_-50px_rgba(0,0,0,0.8)] backdrop-blur-lg transition-all duration-300 hover:border-white/20">
          <h3 className="text-lg font-semibold font-urbanist text-white mb-4 flex items-center">
            <Award className="w-5 h-5 mr-2 text-yellow-300" />
            Logros
          </h3>
          
          <div className="space-y-3">
            <div className={`flex items-center space-x-3 p-2 bg-black/40 border border-white/10 rounded-lg ${(progressData.completedSessions || 0) > 0 ? '' : 'opacity-50'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${(progressData.completedSessions || 0) > 0 ? 'bg-emerald-500/60' : 'bg-gray-600/60'}`}>
                <Target className={`w-4 h-4 ${(progressData.completedSessions || 0) > 0 ? 'text-white' : 'text-gray-400'}`} />
              </div>
              <div>
                <p className={`text-sm font-medium ${(progressData.completedSessions || 0) > 0 ? 'text-emerald-300' : 'text-gray-400'}`}>
                  Primera Sesión {(progressData.completedSessions || 0) > 0 ? '✓' : ''}
                </p>
                <p className="text-xs text-gray-400/70">Completa tu primer entrenamiento</p>
              </div>
            </div>

            <div className={`flex items-center space-x-3 p-2 bg-black/40 border border-white/10 rounded-lg ${progressData.weeklyProgress?.some(w => Number(w.completed || 0) === Number(w.sessions || 0) && Number(w.sessions || 0) > 0) ? '' : 'opacity-50'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${progressData.weeklyProgress?.some(w => Number(w.completed || 0) === Number(w.sessions || 0) && Number(w.sessions || 0) > 0) ? 'bg-emerald-500/60' : 'bg-gray-600/60'}`}>
                <Activity className={`w-4 h-4 ${progressData.weeklyProgress?.some(w => Number(w.completed || 0) === Number(w.sessions || 0) && Number(w.sessions || 0) > 0) ? 'text-white' : 'text-gray-400'}`} />
              </div>
              <div>
                <p className={`text-sm font-medium ${progressData.weeklyProgress?.some(w => Number(w.completed || 0) === Number(w.sessions || 0) && Number(w.sessions || 0) > 0) ? 'text-emerald-300' : 'text-gray-400'}`}>
                  Semana Completa {progressData.weeklyProgress?.some(w => Number(w.completed || 0) === Number(w.sessions || 0) && Number(w.sessions || 0) > 0) ? '✓' : ''}
                </p>
                <p className="text-xs text-gray-400/70">Completa una semana de entrenamientos</p>
              </div>
            </div>

            <div className={`flex items-center space-x-3 p-2 bg-black/40 border border-white/10 rounded-lg ${(progressData.completedSessions || 0) >= 7 ? '' : 'opacity-50'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${(progressData.completedSessions || 0) >= 7 ? 'bg-emerald-500/60' : 'bg-gray-600/60'}`}>
                <TrendingUp className={`w-4 h-4 ${(progressData.completedSessions || 0) >= 7 ? 'text-white' : 'text-gray-400'}`} />
              </div>
              <div>
                <p className={`text-sm font-medium ${(progressData.completedSessions || 0) >= 7 ? 'text-emerald-300' : 'text-gray-400'}`}>
                  Constancia {(progressData.completedSessions || 0) >= 7 ? '✓' : ''}
                </p>
                <p className="text-xs text-gray-400/70">Completa 7 sesiones de entrenamiento</p>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Actividad reciente */}
      <Card className="bg-neutral-900/70 border border-white/10 ring-1 ring-white/5 border-l-2 border-l-sky-400/30 p-6 shadow-[0_25px_60px_-50px_rgba(0,0,0,0.8)] backdrop-blur-lg transition-all duration-300 hover:border-white/20">
        <h3 className="text-lg font-semibold font-urbanist text-white mb-4 flex items-center">
          <Activity className="w-5 h-5 mr-2 text-yellow-300" />
          Actividad Reciente
        </h3>

        {progressData.recentActivity?.length > 0 ? (
          <div className="space-y-3">
            {progressData.recentActivity.map((activity, index) => (
              <div key={activity.sessionId || index} className="flex items-center justify-between p-3 bg-black/50 rounded-lg border border-white/10">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-emerald-500/60 rounded-full flex items-center justify-center">
                    <CheckCircle className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">
                      Semana {activity.weekNumber || 'N/A'} - {activity.dayName || 'Sin día'}
                    </p>
                    <p className="text-xs text-gray-300/70">
                      {activity.exercisesCount || 0} ejercicios • {activity.totalSeries || 0} series
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-300/70">{activity.formattedDate || 'Fecha no disponible'}</p>
                  <p className="text-xs text-yellow-300/80">{formatTime(activity.durationSeconds || 0)}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-300/70">
            <Calendar className="w-12 h-12 mx-auto mb-3 text-gray-500" />
            <p>No hay actividad reciente</p>
            <p className="text-sm">Completa tu primer entrenamiento para ver tu progreso aquí</p>
          </div>
        )}
      </Card>

      {/* Racha de entrenamiento */}
      <Card className="bg-neutral-900/70 border border-white/10 ring-1 ring-white/5 border-l-2 border-l-orange-400/35 p-6 shadow-[0_25px_60px_-50px_rgba(0,0,0,0.8)] backdrop-blur-lg transition-all duration-300 hover:border-white/20">
        <h3 className="text-lg font-semibold font-urbanist text-white mb-4 flex items-center">
          <Flame className="w-5 h-5 mr-2 text-yellow-300" />
          Racha de Entrenamiento
        </h3>

        <div className="grid md:grid-cols-3 gap-6">
          <div className="text-center">
            <div className="w-20 h-20 mx-auto mb-3 bg-yellow-400/10 rounded-full flex items-center justify-center">
              <Flame className="w-10 h-10 text-yellow-300" />
            </div>
            <div className="text-3xl font-bold text-yellow-300 mb-1">
              {calculateCurrentStreak()}
            </div>
            <div className="text-sm text-gray-300/70">Días consecutivos</div>
          </div>

          <div className="text-center">
            <div className="w-20 h-20 mx-auto mb-3 bg-emerald-500/10 rounded-full flex items-center justify-center">
              <Trophy className="w-10 h-10 text-emerald-300" />
            </div>
            <div className="text-3xl font-bold text-emerald-300 mb-1">
              {calculateBestStreak()}
            </div>
            <div className="text-sm text-gray-300/70">Mejor racha</div>
          </div>

          <div className="text-center">
            <div className="w-20 h-20 mx-auto mb-3 bg-sky-500/10 rounded-full flex items-center justify-center">
              <Star className="w-10 h-10 text-sky-300" />
            </div>
            <div className="text-3xl font-bold text-sky-300 mb-1">
              {progressData.completedSessions || 0}
            </div>
            <div className="text-sm text-gray-300/70">Entrenamientos totales</div>
          </div>
        </div>

        {calculateCurrentStreak() > 0 && (
          <div className="mt-6 p-4 bg-yellow-400/10 border border-yellow-400/30 rounded-lg">
            <p className="text-center text-yellow-200 text-sm">
              🔥 ¡Sigue así! Llevas {calculateCurrentStreak()} {calculateCurrentStreak() === 1 ? 'día' : 'días'} entrenando consecutivamente
            </p>
          </div>
        )}
      </Card>

      {/* Estadísticas detalladas */}
      <div className="grid md:grid-cols-3 gap-6">
        {/* Intensidad promedio */}
        <Card className="bg-neutral-900/70 border border-white/10 ring-1 ring-white/5 border-l-2 border-l-yellow-400/35 p-6 shadow-[0_25px_60px_-50px_rgba(0,0,0,0.8)] backdrop-blur-lg transition-all duration-300 hover:border-white/20">
          <h3 className="text-lg font-semibold font-urbanist text-white mb-4 flex items-center">
            <Zap className="w-5 h-5 mr-2 text-yellow-300" />
            Intensidad
          </h3>

          <div className="text-center">
            <div className="text-4xl font-bold text-yellow-300 mb-2">
              {calculateAverageIntensity()}%
            </div>
            <div className="text-sm text-gray-300/70 mb-4">Promedio</div>

            <Progress
              value={calculateAverageIntensity()}
              className="h-2"
            />
          </div>
        </Card>

        {/* Volumen total */}
        <Card className="bg-neutral-900/70 border border-white/10 ring-1 ring-white/5 border-l-2 border-l-sky-400/35 p-6 shadow-[0_25px_60px_-50px_rgba(0,0,0,0.8)] backdrop-blur-lg transition-all duration-300 hover:border-white/20">
          <h3 className="text-lg font-semibold font-urbanist text-white mb-4 flex items-center">
            <Dumbbell className="w-5 h-5 mr-2 text-sky-300" />
            Volumen
          </h3>

          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-300/70 text-sm">Series totales:</span>
              <span className="text-white font-semibold">{progressData.totalSeriesCompleted || 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-300/70 text-sm">Ejercicios:</span>
              <span className="text-white font-semibold">{progressData.completedExercises || 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-300/70 text-sm">Por sesión:</span>
              <span className="text-white font-semibold">
                {(progressData.completedSessions || 0) > 0
                  ? Math.round((progressData.totalSeriesCompleted || 0) / progressData.completedSessions)
                  : 0
                } series
              </span>
            </div>
          </div>
        </Card>

        {/* Consistencia */}
        <Card className="bg-neutral-900/70 border border-white/10 ring-1 ring-white/5 border-l-2 border-l-emerald-400/35 p-6 shadow-[0_25px_60px_-50px_rgba(0,0,0,0.8)] backdrop-blur-lg transition-all duration-300 hover:border-white/20">
          <h3 className="text-lg font-semibold font-urbanist text-white mb-4 flex items-center">
            <Timer className="w-5 h-5 mr-2 text-emerald-300" />
            Consistencia
          </h3>

          <div className="text-center">
            <div className="text-4xl font-bold text-emerald-300 mb-2">
              {calculateConsistency()}%
            </div>
            <div className="text-sm text-gray-300/70 mb-4">
              {progressData.completedSessions || 0} de {progressData.totalSessions || 0} sesiones
            </div>

            <Progress
              value={calculateConsistency()}
              className="h-2"
            />
          </div>
        </Card>
      </div>

      {/* Próximos hitos */}
      <Card className="bg-neutral-900/70 border border-white/10 ring-1 ring-white/5 border-l-2 border-l-yellow-400/35 p-6 shadow-[0_25px_60px_-50px_rgba(0,0,0,0.8)] backdrop-blur-lg transition-all duration-300 hover:border-white/20">
        <h3 className="text-lg font-semibold font-urbanist text-white mb-4 flex items-center">
          <Target className="w-5 h-5 mr-2 text-yellow-300" />
          Próximos Hitos
        </h3>

        <div className="grid md:grid-cols-2 gap-4">
          {getNextMilestones().map((milestone, index) => (
            <div key={index} className="flex items-center space-x-3 p-3 bg-black/50 rounded-lg border border-white/10">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${milestone.achieved ? 'bg-emerald-500/60' : 'bg-gray-600/60'}`}>
                {milestone.icon}
              </div>
              <div className="flex-1">
                <p className={`text-sm font-medium ${milestone.achieved ? 'text-emerald-300' : 'text-gray-300'}`}>
                  {milestone.title}
                </p>
                <div className="flex items-center space-x-2 mt-1">
                  <Progress
                    value={milestone.progress}
                    className="h-1 flex-1"
                  />
                  <span className="text-xs text-gray-300/70">{milestone.progress}%</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
