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
  Database,
  History,
  AlertTriangle
} from 'lucide-react';
import { getHistoricalData } from '../api';
import { useTrace } from '@/contexts/TraceContext.jsx';


export default function HistoricalTab({ methodologyPlanId }) {
  const { track } = useTrace();

  useEffect(() => {
    track('VIEW', { name: 'HistoricalTab' }, { component: 'HistoricalTab' });
  }, []);

  const [historicalData, setHistoricalData] = useState({
    totalRoutinesCompleted: 0,
    totalSessionsEver: 0,
    totalExercisesEver: 0,
    totalSeriesEver: 0,
    routineHistory: [],
    monthlyStats: []
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadHistoricalData = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getHistoricalData({
          methodologyPlanId: methodologyPlanId || null
        });

        // Validar estructura de datos
        const validatedData = validateHistoricalData(data);
        setHistoricalData(validatedData);
        track('DATA_LOAD', { ok: true, routines: validatedData.totalRoutinesCompleted, sessions: validatedData.totalSessionsEver }, { component: 'HistoricalTab' });
      } catch (err) {
        setError(err.message);
        track('DATA_LOAD', { ok: false, error: err.message }, { component: 'HistoricalTab' });
        // En caso de error, usar datos vacíos validados
        setHistoricalData({
          totalRoutinesCompleted: 0,
          totalSessionsEver: 0,
          totalExercisesEver: 0,
          totalSeriesEver: 0,
          totalTimeSpentEver: 0,
          firstWorkoutDate: null,
          lastWorkoutDate: null,
          routineHistory: [],
          monthlyStats: []
        });
      } finally {
        setLoading(false);
      }
    };


    loadHistoricalData();
  }, [methodologyPlanId]);

  // Función de validación de datos
  const validateHistoricalData = (data) => {
    if (!data || typeof data !== 'object') {
      throw new Error('Datos históricos inválidos');
    }

    return {
      totalRoutinesCompleted: Math.max(0, parseInt(data.totalRoutinesCompleted) || 0),
      totalSessionsEver: Math.max(0, parseInt(data.totalSessionsEver) || 0),
      totalExercisesEver: Math.max(0, parseInt(data.totalExercisesEver) || 0),
      totalSeriesEver: Math.max(0, parseInt(data.totalSeriesEver) || 0),
      totalTimeSpentEver: Math.max(0, parseInt(data.totalTimeSpentEver) || 0),
      firstWorkoutDate: data.firstWorkoutDate,
      lastWorkoutDate: data.lastWorkoutDate,
      routineHistory: Array.isArray(data.routineHistory) ? data.routineHistory : [],
      monthlyStats: Array.isArray(data.monthlyStats) ? data.monthlyStats : []
    };
  };

  const formatTime = (seconds) => {
    if (!seconds || seconds < 0) return '0h 0min';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}min`;
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  // Componente de Error
  const ErrorDisplay = ({ error }) => (
    <Card className="bg-red-900/30 border border-red-500/40 border-l-2 border-l-red-400/50 p-6">
      <div className="flex items-center space-x-3 text-red-400">
        <AlertTriangle className="w-5 h-5" />
        <div>
          <h3 className="font-semibold">Error cargando datos históricos</h3>
          <p className="text-sm text-red-300 mt-1">{error}</p>
        </div>
      </div>
    </Card>
  );

  if (loading) {
    return (
      <div className="space-y-6">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="bg-neutral-900/70 border border-white/10 ring-1 ring-white/5 border-l-2 border-l-yellow-400/25 p-6 shadow-[0_25px_60px_-50px_rgba(0,0,0,0.8)] backdrop-blur-lg transition-all duration-300 hover:border-white/20">
            <div className="animate-pulse">
              <div className="h-4 bg-gray-700 rounded w-1/4 mb-4"></div>
              <div className="h-2 bg-gray-700 rounded w-full"></div>
            </div>
          </Card>
        ))}
      </div>
    );
  }

  // Verificar si hay datos históricos
  const hasData = historicalData && (
    historicalData.totalRoutinesCompleted > 0 ||
    historicalData.totalSessionsEver > 0 ||
    historicalData.routineHistory.length > 0
  );

  if (error && !hasData) {
    return <ErrorDisplay error={error} />;
  }

  return (
    <div className="space-y-6">
      {/* Mostrar error si existe pero hay datos de fallback */}
      {error && historicalData && (
        <ErrorDisplay error={error} />
      )}

      {/* Resumen histórico total */}
      <Card className="bg-neutral-900/70 border border-white/10 ring-1 ring-white/5 border-l-2 border-l-yellow-400/40 p-6 shadow-[0_25px_60px_-50px_rgba(0,0,0,0.8)] backdrop-blur-lg transition-all duration-300 hover:border-white/20">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-2xl font-semibold font-urbanist text-white mb-2 flex items-center">
              <History className="w-6 h-6 mr-2 text-yellow-300" />
              Histórico Total
            </h2>
            <Badge variant="secondary" className="bg-yellow-400/20 text-yellow-200 border border-yellow-400/30">
              Todas las rutinas completadas
            </Badge>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-yellow-300">
              {historicalData.totalRoutinesCompleted}
            </div>
            <div className="text-sm text-gray-300/70">Rutinas Completadas</div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-sky-300">{historicalData.totalSessionsEver}</div>
            <div className="text-sm text-gray-300/70">Sesiones Totales</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-emerald-300">{historicalData.totalExercisesEver}</div>
            <div className="text-sm text-gray-300/70">Ejercicios Totales</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-yellow-300">{historicalData.totalSeriesEver}</div>
            <div className="text-sm text-gray-300/70">Series Totales</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-300">{formatTime(historicalData.totalTimeSpentEver)}</div>
            <div className="text-sm text-gray-300/70">Tiempo Total</div>
          </div>
        </div>
      </Card>

      {/* Rutinas completadas */}
      <Card className="bg-neutral-900/70 border border-white/10 ring-1 ring-white/5 border-l-2 border-l-sky-400/35 p-6 shadow-[0_25px_60px_-50px_rgba(0,0,0,0.8)] backdrop-blur-lg transition-all duration-300 hover:border-white/20">
        <h3 className="text-lg font-semibold font-urbanist text-white mb-4 flex items-center">
          <Database className="w-5 h-5 mr-2 text-yellow-300" />
          Rutinas
        </h3>

        <div className="space-y-4">
          {historicalData.routineHistory.length > 0 ? historicalData.routineHistory.map((routine) => (
            <div key={routine.id} className="border border-white/10 bg-black/50 rounded-lg p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between mb-3">
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  <Badge variant="outline" className="border-yellow-400/40 text-yellow-300 shrink-0">
                    {routine.methodologyType}
                  </Badge>
                  <span className="text-xs sm:text-sm text-gray-300/70 break-words">
                    {routine.status === 'cancelled' ? (
                      <>Cancelada{routine.completedAt ? ` el ${formatDate(routine.completedAt)}` : ''}</>
                    ) : (
                      <>Completada el {formatDate(routine.completedAt)}</>
                    )}
                  </span>
                </div>
                {routine.status === 'cancelled' ? (
                  <div className="text-xs sm:text-sm font-medium text-red-400 flex items-center">
                    <AlertTriangle className="w-3 h-3 mr-1" />
                    Cancelada
                  </div>
                ) : (
                  <div className="text-xs sm:text-sm font-medium text-emerald-300 flex items-center">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Completada
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div className="text-center">
                  <div className="text-sky-300 font-semibold">{routine.sessions}</div>
                  <div className="text-gray-300/70">Sesiones</div>
                </div>
                <div className="text-center">
                  <div className="text-emerald-300 font-semibold">{routine.exercises}</div>
                  <div className="text-gray-300/70">Ejercicios</div>
                </div>
                <div className="text-center">
                  <div className="text-yellow-300 font-semibold">{routine.series}</div>
                  <div className="text-gray-300/70">Series</div>
                </div>
                <div className="text-center">
                  <div className="text-red-300 font-semibold">{formatTime(routine.timeSpent)}</div>
                  <div className="text-gray-300/70">Tiempo</div>
                </div>
              </div>
            </div>
          )) : (
            <div className="text-center py-8 text-gray-300/70">
              <Database className="w-12 h-12 mx-auto mb-3 text-gray-500" />
              <p>No hay rutinas completadas aún</p>
              <p className="text-sm">Las rutinas aparecerán aquí al ser completadas</p>
            </div>
          )}
        </div>
      </Card>

      {/* Estadísticas mensuales */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Progreso mensual */}
        <Card className="bg-neutral-900/70 border border-white/10 ring-1 ring-white/5 border-l-2 border-l-sky-400/30 p-6 shadow-[0_25px_60px_-50px_rgba(0,0,0,0.8)] backdrop-blur-lg transition-all duration-300 hover:border-white/20">
          <h3 className="text-lg font-semibold font-urbanist text-white mb-4 flex items-center">
            <Calendar className="w-5 h-5 mr-2 text-yellow-300" />
            Progreso Mensual
          </h3>

          <div className="space-y-4">
            {historicalData.monthlyStats.length > 0 ? historicalData.monthlyStats.map((month, index) => (
              <div key={index} className="border-b border-white/10 pb-3 last:border-b-0">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-white font-medium">{month.month}</span>
                  <span className="text-sm text-gray-300/70">{month.sessions} sesiones</span>
                </div>
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div className="text-emerald-300">{month.exercises} ejercicios</div>
                  <div className="text-yellow-300">{month.series} series</div>
                </div>
              </div>
            )) : (
              <div className="text-center py-4 text-gray-300/70">
                <p className="text-sm">No hay datos mensuales disponibles</p>
              </div>
            )}
          </div>
        </Card>

        {/* Logros históricos */}
        <Card className="bg-neutral-900/70 border border-white/10 ring-1 ring-white/5 border-l-2 border-l-emerald-400/35 p-6 shadow-[0_25px_60px_-50px_rgba(0,0,0,0.8)] backdrop-blur-lg transition-all duration-300 hover:border-white/20">
          <h3 className="text-lg font-semibold font-urbanist text-white mb-4 flex items-center">
            <Award className="w-5 h-5 mr-2 text-yellow-300" />
            Logros Históricos
          </h3>

          <div className="space-y-3">
            <div className={`flex items-center space-x-3 p-2 bg-black/40 border border-white/10 rounded-lg ${historicalData.totalRoutinesCompleted > 0 ? '' : 'opacity-50'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${historicalData.totalRoutinesCompleted > 0 ? 'bg-yellow-400/60' : 'bg-gray-600/60'}`}>
                <Target className={`w-4 h-4 ${historicalData.totalRoutinesCompleted > 0 ? 'text-black' : 'text-gray-400'}`} />
              </div>
              <div>
                <p className={`text-sm font-medium ${historicalData.totalRoutinesCompleted > 0 ? 'text-yellow-300' : 'text-gray-400'}`}>
                  Primera Rutina {historicalData.totalRoutinesCompleted > 0 ? '✓' : ''}
                </p>
                <p className="text-xs text-gray-400/70">Completa tu primera rutina completa</p>
              </div>
            </div>

            <div className={`flex items-center space-x-3 p-2 bg-black/40 border border-white/10 rounded-lg ${historicalData.totalSessionsEver >= 10 ? '' : 'opacity-50'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${historicalData.totalSessionsEver >= 10 ? 'bg-emerald-500/60' : 'bg-gray-600/60'}`}>
                <Activity className={`w-4 h-4 ${historicalData.totalSessionsEver >= 10 ? 'text-white' : 'text-gray-400'}`} />
              </div>
              <div>
                <p className={`text-sm font-medium ${historicalData.totalSessionsEver >= 10 ? 'text-emerald-300' : 'text-gray-400'}`}>
                  Atleta Dedicado {historicalData.totalSessionsEver >= 10 ? '✓' : ''}
                </p>
                <p className="text-xs text-gray-400/70">Completa 10 sesiones de entrenamiento</p>
              </div>
            </div>

            <div className={`flex items-center space-x-3 p-2 bg-black/40 border border-white/10 rounded-lg ${historicalData.totalRoutinesCompleted >= 3 ? '' : 'opacity-50'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${historicalData.totalRoutinesCompleted >= 3 ? 'bg-sky-500/60' : 'bg-gray-600/60'}`}>
                <TrendingUp className={`w-4 h-4 ${historicalData.totalRoutinesCompleted >= 3 ? 'text-white' : 'text-gray-400'}`} />
              </div>
              <div>
                <p className={`text-sm font-medium ${historicalData.totalRoutinesCompleted >= 3 ? 'text-sky-300' : 'text-gray-400'}`}>
                  Maestro del Fitness {historicalData.totalRoutinesCompleted >= 3 ? '✓' : ''}
                </p>
                <p className="text-xs text-gray-400/70">Completa 3 rutinas diferentes</p>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
