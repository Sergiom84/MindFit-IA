/**
 * CalendarTab - Calendario de entrenamiento con vista semanal
 *
 * IMPORTANTE - MAPEO DE SESIONES:
 * Este componente maneja dos modos de mapeo de sesiones:
 *
 * 1. MODO LEGACY: Las sesiones vienen con nombres de días (Lunes, Miércoles, Viernes)
 *    - Se buscan por coincidencia de nombre de día
 *    - Problema: Si se genera un sábado, el sábado no tiene sesión asignada
 *
 * 2. MODO NUEVO: Las sesiones se distribuyen secuencialmente desde el día de inicio
 *    - Si se genera un sábado: Sábado = Día 1, Domingo = Día 2, etc.
 *    - Las sesiones se distribuyen uniformemente en la semana
 *    - Soluciona el problema de rutinas que comienzan en cualquier día
 *
 * El componente detecta automáticamente qué modo usar basándose en el formato
 * del campo 'dia' de las sesiones.
 */

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Card } from '@/components/ui/card.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Badge } from '@/components/ui/badge.jsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog.jsx';
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  Clock,
  Target,
  Dumbbell,
  CheckCircle,
  AlertTriangle,
  X
} from 'lucide-react';
import { getTodaySessionStatus, getSessionProgress } from '../api';
import { mapSessionsToWeekDays } from '../../../utils/calendarMapping';
import { getSentimentIcon } from '../../../utils/exerciseUtils';
import { CalendarExerciseCard } from './components/CalendarExerciseCard';

import { useTrace } from '@/contexts/TraceContext.jsx';

export default function CalendarTab({ plan, planStartDate, methodologyPlanId, ensureMethodologyPlan, refreshTrigger }) {
  const { track } = useTrace();

  // Estado para el plan actualizado desde la BD
  const [updatedPlan, setUpdatedPlan] = useState(plan);
  const [planStart, setPlanStart] = useState(planStartDate);
  const [isLoadingCalendar, setIsLoadingCalendar] = useState(false);

  // Cargar el calendario real desde la BD cuando el componente se monta o cambia el planId
  useEffect(() => {
    const loadCalendarSchedule = async () => {
      if (!methodologyPlanId) return;

      setIsLoadingCalendar(true);
      try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`${import.meta.env.VITE_API_URL || ""}/api/routines/calendar-schedule/${methodologyPlanId}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success && data.plan) {
            console.log('[CalendarTab] Plan actualizado con días redistribuidos:', {
              firstWeek: data.plan.semanas[0]?.sesiones?.map(s => s.dia)
            });
            setUpdatedPlan(data.plan);
            if (data.planStartDate) {
              setPlanStart(data.planStartDate);
            }
          } else if (ensureMethodologyPlan && typeof ensureMethodologyPlan === 'function') {
            // Fallback: intentar regenerar si el calendario viene vacío
            console.warn('[CalendarTab] Calendario vacío; intentando ensureMethodologyPlan()');
            await ensureMethodologyPlan();
          }
        }
      } catch (error) {
        console.error('[CalendarTab] Error cargando calendario:', error);
      } finally {
        setIsLoadingCalendar(false);
      }
    };

    loadCalendarSchedule();
  }, [methodologyPlanId]);

  // Calcular qué semana mostrar inicialmente basándose en la fecha actual
  const getInitialWeek = useCallback(() => {
    if (!planStart) return 0;
    const startDate = new Date(planStart);
    startDate.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Calcular diferencia en días desde el inicio
    const daysSinceStart = Math.floor((today - startDate) / (1000 * 60 * 60 * 24));

    // Si es negativo (fecha futura), mostrar semana 0
    if (daysSinceStart < 0) return 0;

    // Calcular en qué semana estamos (0-indexed)
    const currentWeek = Math.floor(daysSinceStart / 7);

    // Asegurar que no excedemos el total de semanas
    const totalWeeks = updatedPlan?.duracion_total_semanas || 4;
    return Math.min(currentWeek, totalWeeks - 1);
  }, [planStart, updatedPlan]);


  const [currentWeek, setCurrentWeek] = useState(getInitialWeek);
  const [selectedDay, setSelectedDay] = useState(null);
  const [showDayModal, setShowDayModal] = useState(false);

  const [weekStatuses, setWeekStatuses] = useState({});
  const [apiCache, setApiCache] = useState({});
  const apiCacheRef = useRef({});

  // Mantener la ref sincronizada con el estado
  useEffect(() => {
    apiCacheRef.current = apiCache;
  }, [apiCache]);

  // Sincronizar currentWeek cuando cambie la fecha de inicio calculada
  useEffect(() => {
    setCurrentWeek(getInitialWeek());
  }, [getInitialWeek]);

  // Ref para evitar loop infinito en tracking del modal
  const prevShowDayModalRef = useRef(showDayModal);

  // Tracking corregido con useRef
  useEffect(() => {
    if (prevShowDayModalRef.current !== showDayModal) {
      if (showDayModal) {
        track('MODAL_OPEN', { name: 'CalendarDayModal' }, { component: 'CalendarTab' });
      } else if (selectedDay) {
        track('MODAL_CLOSE', { name: 'CalendarDayModal' }, { component: 'CalendarTab' });
      }
      prevShowDayModalRef.current = showDayModal;
    }
  }, [showDayModal, selectedDay, track]);

  // Días de la semana (empezando por lunes) - used for display reference
  // const weekDays = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  // const weekDaysFull = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

  // Procesar el plan para crear estructura de calendario
  const calendarData = useMemo(() => {
    console.log('[CalendarTab] Procesando calendarData:', {
      hasUpdatedPlan: !!updatedPlan,
      semanasLength: updatedPlan?.semanas?.length,
      planStartDate: planStart,
      firstWeekSessions: updatedPlan?.semanas?.[0]?.sesiones?.map(s => ({ dia: s.dia, titulo: s.titulo }))
    });

    if (!updatedPlan?.semanas?.length || !planStart) {
      console.log('[CalendarTab] No hay datos suficientes para calendarData');
      return [];
    }

    const startDate = new Date(planStart);
    startDate.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const totalWeeks = updatedPlan.duracion_total_semanas || updatedPlan.semanas.length;

    // IMPORTANTE: El plan comienza desde el día actual en que se genera, no desde el lunes
    // Si el usuario genera la rutina un sábado, el sábado es el Día 1 de entrenamiento
    const firstWeekStart = new Date(startDate);
    firstWeekStart.setHours(0, 0, 0, 0);
    const startDow = firstWeekStart.getDay(); // 0=Dom,1=Lun,...,6=Sab
    const daysToMonday = startDow === 0 ? -6 : 1 - startDow;
    const firstWeekMonday = new Date(firstWeekStart);
    firstWeekMonday.setDate(firstWeekStart.getDate() + daysToMonday);

    // Crear semanas basadas en períodos de 7 días desde la fecha de inicio
    return Array.from({ length: totalWeeks }, (_, weekIndex) => {
      const semana = updatedPlan.semanas[weekIndex] || updatedPlan.semanas[0];

      // Calcular el primer día de esta semana del plan
      const weekStartDate = new Date(firstWeekMonday);
      weekStartDate.setDate(firstWeekMonday.getDate() + (weekIndex * 7));
      weekStartDate.setHours(0, 0, 0, 0);

      // Usar la función de mapeo inteligente
      console.log(`[CalendarTab] Semana ${weekIndex + 1} - Mapeando sesiones:`, {
        sesionesCount: semana.sesiones?.length,
        sesiones: semana.sesiones?.map(s => ({ dia: s.dia, titulo: s.titulo })),
        weekStartDate: weekStartDate.toISOString().split('T')[0]
      });

      const mappedDays = mapSessionsToWeekDays(
        semana.sesiones,
        weekStartDate,
        startDate,
        weekIndex
      );

      console.log(`[CalendarTab] Semana ${weekIndex + 1} - Días mapeados:`, {
        mappedDaysCount: mappedDays.length,
        sessionsFound: mappedDays.filter(d => d.session).length,
        sessionsPerDay: mappedDays.map((d, i) => ({ day: i, hasSession: !!d.session, dia: d.session?.dia }))
      });

      // Construir el array de días con toda la información necesaria
      const weekDays = mappedDays.map((mappedDay, dayIndex) => {
        const dayDate = mappedDay.date;
        const dayName = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'][dayDate.getDay()];
        const dayNameShort = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'][dayDate.getDay()];

        const isPast = dayDate < today;
        const isToday = dayDate.getTime() === today.getTime();
        const isFuture = dayDate > today;

        // Añadir información adicional a la sesión si existe
        const session = mappedDay.session;
        if (session) {
          session.planDayNumber = (weekIndex * 7) + dayIndex + 1;
          session.weekNumber = weekIndex + 1;
        }

        return {
          date: dayDate,
          dayName,
          dayNameShort,
          session: session || null,
          isPast,
          isToday,
          isFuture,
          weekNumber: weekIndex + 1,
          isWithinPlan: true,
          planWeekNumber: weekIndex + 1
        };
      });

      return {
        weekNumber: weekIndex + 1,
        weekStartDate,
        days: weekDays
      };
    });
  }, [updatedPlan, planStart]);

  const currentWeekData = calendarData[currentWeek] || null;

  // Clave estable para mapear estado de la semana
  const getDayKey = (weekNumber, day) =>
    `${weekNumber}-${(day.dayNameShort || day.dayName).toLowerCase()}`;


  // Función de carga con cache memoizada
  const loadWeekStatuses = useCallback(async () => {
      if (!currentWeekData) return;

      const cacheKey = `week-${currentWeekData.weekNumber}-${methodologyPlanId}`;
      const now = Date.now();

      // Verificar cache existente - cache más agresivo para evitar spam
      if (apiCacheRef.current[cacheKey] && (now - apiCacheRef.current[cacheKey].timestamp) < 300000) { // 5 minutos
        return;
      }

      try {
        const mId = await (ensureMethodologyPlan ? ensureMethodologyPlan() : methodologyPlanId);

        // Determinar qué días necesitan actualización según su estado temporal
        const daysToLoad = currentWeekData.days.filter(day => {
          if (!day.session) return false;

          const dayKey = getDayKey(currentWeekData.weekNumber || 1, day);
          const dayCache = apiCacheRef.current[`${cacheKey}-${dayKey}`];

          if (!dayCache) return true; // No hay cache, cargar

          const cacheAge = now - dayCache.timestamp;

          // Cache más agresivo para reducir spam de API
          if (day.isPast) {
            return cacheAge > 600000; // 10 minutos para días pasados (no cambian)
          } else if (day.isToday) {
            return cacheAge > 180000; // 3 minutos para hoy
          } else {
            return cacheAge > 900000; // 15 minutos para días futuros
          }
        });


        if (daysToLoad.length === 0) return;

        const entries = await Promise.all(
          daysToLoad.map(async (day) => {
            const key = getDayKey(currentWeekData.weekNumber || 1, day);
            try {
              // Preferir day_id si el plan/sesin lo aporta
              const maybeDayId = day?.session?.day_id ?? day?.session?.dayId ?? null;
              const data = await getTodaySessionStatus({
                methodology_plan_id: mId,
                week_number: currentWeekData.weekNumber || 1,
                day_name: day.dayNameShort || day.dayName,
                day_id: maybeDayId || undefined
              });
              if (data?.session?.id) {
                try {
                  const progress = await getSessionProgress(data.session.id);
                  return [key, progress];
                } catch {
                  return [key, data];
                }
              }
              return [key, data];
            } catch {
              return [key, null];
            }
          })
        );


        // Actualizar cache y estado
        setApiCache(prev => ({
          ...prev,
          [cacheKey]: { timestamp: now },
          ...Object.fromEntries(
            entries.map(([key, value]) => [`${cacheKey}-${key}`, { timestamp: now, data: value }])
          )
        }));

        setWeekStatuses((prev) => {
          const next = { ...prev };
          entries.forEach(([k, v]) => { next[k] = v; });
          return next;
        });
      } catch (e) {
        console.warn('Error cargando estados de semana:', e);
        // ignorar errores para días sin sesión
      }
  }, [currentWeekData, methodologyPlanId, ensureMethodologyPlan]);

  // Sincronización: cargar estado para los 7 días visibles
  useEffect(() => {
    let cancelled = false;

    const wrappedLoad = async () => {
      if (cancelled) return;
      await loadWeekStatuses();
    };

    // carga inicial
    wrappedLoad();

    // **REMOVER AUTO-REFRESCO AUTOMÁTICO** - solo refresh manual o por refreshTrigger
    // El auto-refresco causa bucles innecesarios

    return () => {
      cancelled = true;
    };
  }, [loadWeekStatuses, refreshTrigger]);

  const handlePrevWeek = () => {
    const next = Math.max(0, currentWeek - 1);
    track('WEEK_NAV', { dir: 'prev', from: currentWeek, to: next }, { component: 'CalendarTab' });
    setCurrentWeek(next);
  };

  const handleNextWeek = () => {
    const next = Math.min(calendarData.length - 1, currentWeek + 1);
    track('WEEK_NAV', { dir: 'next', from: currentWeek, to: next }, { component: 'CalendarTab' });
    setCurrentWeek(next);
  };

  const handleDayClick = (day) => {
    if (!day.session) return;
    track('DAY_CLICK', { date: day.date?.toISOString?.() || String(day.date), dayName: day.dayName, hasSession: !!day.session, weekNumber: day.weekNumber }, { component: 'CalendarTab' });
    setSelectedDay(day);
    setShowDayModal(true);
  };

  // Utility function removed - was unused
  // const formatDate = (date) => {
  //   return date.toLocaleDateString('es-ES', {
  //     day: 'numeric',
  //     month: 'short'
  //   });
  // };

  const formatFullDate = (date) => {
    return date.toLocaleDateString('es-ES', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getDayClassName = (day) => {
    let baseClasses = "min-h-48 p-3 border-r border-white/10 last:border-r-0 transition-all relative flex flex-col";

    if (day.session) {
      baseClasses += " cursor-pointer bg-black/60 hover:bg-black/70";
      if (day.isPast) {
        baseClasses += " bg-emerald-900/15 hover:bg-emerald-900/20";
      } else if (day.isFuture) {
        baseClasses += " bg-sky-900/10 hover:bg-sky-900/15";
      }
    } else {
      baseClasses += " bg-black/40 cursor-default";
    }

    if (day.isToday) {
      baseClasses += " ring-1 ring-yellow-400/20";
    }

    return baseClasses;
  };

  if (!plan) {
    return (
      <div className="text-center py-12">
        <Calendar className="w-16 h-16 text-gray-500 mx-auto mb-4" />
        <p className="text-gray-300/80 text-lg">No hay plan de entrenamiento disponible</p>
      </div>
    );
  }

  if (!calendarData.length) {
    return (
      <div className="text-center py-12">
        <Calendar className="w-16 h-16 text-gray-500 mx-auto mb-4" />
        <p className="text-gray-300/80 text-lg">No se pudo cargar el calendario</p>
      </div>
    );
  }

  // Mostrar loading mientras se cargan los datos
  if (isLoadingCalendar) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-yellow-400 mx-auto mb-4"></div>
          <p className="text-gray-300/80">Cargando calendario actualizado...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header del calendario */}
      <Card className="bg-neutral-900/70 border border-white/10 ring-1 ring-white/5 border-l-2 border-l-sky-400/35 shadow-[0_25px_60px_-50px_rgba(0,0,0,0.8)] backdrop-blur-lg transition-all duration-300 hover:border-white/20 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold font-urbanist text-white mb-2">Calendario de Entrenamiento</h2>
            <Badge variant="secondary" className="bg-yellow-400/20 text-yellow-200 border border-yellow-400/30">
              {updatedPlan?.selected_style || plan?.selected_style}
            </Badge>
          </div>

          <div className="flex w-full items-center justify-between sm:w-auto sm:justify-start sm:space-x-4">
            <span className="text-sm text-gray-300/80 font-medium">
              Semana {currentWeekData?.weekNumber || 1} de {calendarData.length}
            </span>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrevWeek}
                disabled={currentWeek === 0}
                className="border-white/10 text-gray-200 hover:bg-white/10"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleNextWeek}
                disabled={currentWeek === calendarData.length - 1}
                className="border-white/10 text-gray-200 hover:bg-white/10"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Grid del calendario estilo Google Calendar */}
      <div className="space-y-4 sm:hidden">
        {currentWeekData?.days.map((day, index) => {
          const key = getDayKey(day.weekNumber || currentWeekData.weekNumber, day);
          const progressList = weekStatuses[key]?.exercises || [];
          const totalExercises = day.session?.ejercicios?.length || 0;
          const completedExercises = progressList.filter(ex => ex.status === 'completed').length;
          const allCompleted = totalExercises > 0 && completedExercises === totalExercises;
          const hasIncompleteExercises = completedExercises > 0 && completedExercises < totalExercises;
          const previewExercises = day.session?.ejercicios?.slice(0, 3) || [];
          const remainingExercises = totalExercises - previewExercises.length;

          return (
            <Card
              key={index}
              onClick={() => handleDayClick(day)}
              className="cursor-pointer bg-neutral-900/70 border border-white/10 ring-1 ring-white/5 border-l-2 border-l-sky-400/30 shadow-[0_25px_60px_-50px_rgba(0,0,0,0.8)] backdrop-blur-lg transition-all duration-300 hover:border-white/20"
            >
              <div className="p-5 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.35em] text-gray-300/70">
                      {day.dayNameShort}
                    </p>
                    <h3 className="text-lg font-semibold font-urbanist text-white">
                      {day.dayName} {day.date.getDate()}
                    </h3>
                  </div>
                  <div className="flex items-center gap-2">
                    {day.isToday && (
                      <Badge variant="secondary" className="bg-yellow-400/20 text-yellow-200 border border-yellow-400/30">
                        Hoy
                      </Badge>
                    )}
                    {allCompleted && <CheckCircle className="w-4 h-4 text-emerald-400" />}
                    {hasIncompleteExercises && <AlertTriangle className="w-4 h-4 text-yellow-400" />}
                  </div>
                </div>

                <div className="flex items-center justify-between text-sm text-gray-300/80">
                  <span>{day.session ? `${totalExercises} ejercicios` : 'Día de descanso'}</span>
                  <span className="text-yellow-300/80">Semana {day.weekNumber}</span>
                </div>

                {day.session ? (
                  <div className="space-y-2">
                    {previewExercises.map((ejercicio, exIndex) => {
                      const statusEntry = progressList.find(ex => ex.exercise_order === exIndex);
                      const status = statusEntry?.status;
                      const progress = statusEntry;
                      return (
                        <CalendarExerciseCard
                          key={exIndex}
                          ejercicio={ejercicio}
                          exIndex={exIndex}
                          status={status}
                          progress={progress}
                        />
                      );
                    })}
                    {remainingExercises > 0 && (
                      <div className="text-xs text-gray-300/70">
                        + {remainingExercises} ejercicios más
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-center text-xs text-gray-300/70">
                    Recupera energía para tu próxima sesión.
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="hidden sm:block bg-neutral-900/70 border border-white/10 ring-1 ring-white/5 border-l-2 border-l-sky-400/30 overflow-hidden shadow-[0_25px_60px_-50px_rgba(0,0,0,0.8)] backdrop-blur-lg transition-all duration-300 hover:border-white/20">
        {/* Header de días de la semana */}
        <div className="grid grid-cols-7 bg-black/60 border-b border-white/10">
          {currentWeekData?.days.map((day, index) => (
            <div key={index} className={`p-4 text-center font-semibold border-r border-white/10 last:border-r-0 ${
              day.isToday ? 'bg-yellow-400/15 text-yellow-200' : 'text-gray-300/80'
            }`}>
              {day.dayNameShort} {day.date.getDate()}
            </div>
          ))}
        </div>

        {/* Grid de días */}
        <div className="grid grid-cols-7">
          {currentWeekData?.days.map((day, index) => (
            <div
              key={index}
              className={getDayClassName(day)}
              onClick={() => handleDayClick(day)}
            >
              {/* Indicadores de estado en la esquina */}
              {day.isPast && day.session && (() => {
                const key = getDayKey(day.weekNumber || currentWeekData.weekNumber, day);
                const progressList = weekStatuses[key]?.exercises || [];
                const totalExercises = day.session.ejercicios?.length || 0;
                const completedExercises = progressList.filter(ex => ex.status === 'completed').length;

                // Solo verde si TODOS los ejercicios están completados
                const allCompleted = totalExercises > 0 && completedExercises === totalExercises;
                // Triángulo amarillo si hay algunos completados pero no todos
                const hasIncompleteExercises = completedExercises > 0 && completedExercises < totalExercises;

                return (
                  <div className="absolute top-2 right-2">
                    {allCompleted ? (
                      <CheckCircle className="w-4 h-4 text-green-400" />
                    ) : hasIncompleteExercises ? (
                      <AlertTriangle className="w-4 h-4 text-yellow-400" />
                    ) : null}
                  </div>
                );
              })()}



              {/* Lista de ejercicios ocupando todo el espacio disponible */}
              {day.session ? (
                <div className="space-y-2 flex-1 py-2">
                  {(() => {
                    const key = getDayKey(day.weekNumber || currentWeekData.weekNumber, day);
                    const progressList = weekStatuses[key]?.exercises || [];
                    const statusByOrder = new Map(progressList.map(ex => [ex.exercise_order, ex.status]));
                    const progressByOrder = new Map(progressList.map(ex => [ex.exercise_order, ex]));

                    return day.session.ejercicios?.map((ejercicio, exIndex) => (
                      <CalendarExerciseCard
                        key={exIndex}
                        ejercicio={ejercicio}
                        exIndex={exIndex}
                        status={statusByOrder.get(exIndex)}
                        progress={progressByOrder.get(exIndex)}
                      />
                    ));
                  })()}
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <div className={`text-xs text-center ${
                    day.isToday ? 'text-yellow-200/80 font-semibold' : 'text-gray-400/70'
                  }`}>
                    Día de descanso
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Leyenda */}
      <Card className="bg-neutral-900/70 border border-white/10 ring-1 ring-white/5 border-l-2 border-l-sky-400/25 shadow-[0_25px_60px_-50px_rgba(0,0,0,0.8)] backdrop-blur-lg transition-all duration-300 hover:border-white/20 p-4">
        <div className="flex flex-wrap gap-4 text-sm">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-emerald-400/80 rounded-full" />
            <span className="text-gray-300/80">Completado</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-gray-400/70 rounded-full" />
            <span className="text-gray-300/80">Saltado</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-red-400/80 rounded-full" />
            <span className="text-gray-300/80">Cancelado</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-yellow-400/80 rounded-full" />
            <span className="text-gray-300/80">Hoy</span>
          </div>
        </div>
      </Card>

      {/* Modal de detalles del día */}
      <Dialog open={showDayModal} onOpenChange={setShowDayModal}>
        <DialogContent className="mx-2 sm:mx-4 w-[calc(100vw-16px)] sm:max-w-2xl max-h-[calc(100dvh-16px)] sm:max-h-[80vh] overflow-hidden flex flex-col bg-black/80 border border-white/10 border-l-2 border-l-sky-400/30 backdrop-blur-lg transition-all duration-300 hover:border-white/20 p-5 sm:p-6">
          <DialogHeader className="relative">
            <button
              type="button"
              onClick={() => setShowDayModal(false)}
              className="absolute -right-1 -top-1 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-gray-200 hover:bg-white/10 hover:text-white transition-colors"
              aria-label="Cerrar"
            >
              <X className="h-4 w-4" />
            </button>
            <DialogTitle className="text-white flex items-center font-urbanist text-lg sm:text-xl">
              <Calendar className="w-5 h-5 mr-2 text-yellow-300" />
              {selectedDay && formatFullDate(selectedDay.date)}
            </DialogTitle>
          </DialogHeader>

          {selectedDay?.session && (
            <div className="space-y-4 flex-1 min-h-0">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Badge variant="secondary" className="bg-yellow-400/20 text-yellow-200 border border-yellow-400/30">
                  Semana {selectedDay.weekNumber}
                </Badge>
                <div className="text-sm text-gray-300/80">
                  {selectedDay.session.ejercicios?.length || 0} ejercicios
                </div>
              </div>

              <div className="space-y-3 max-h-[calc(100dvh-260px)] sm:max-h-96 overflow-y-auto pr-1">
                {(() => {
                  const key = getDayKey(selectedDay.weekNumber, selectedDay);
                  const statusMap = new Map((weekStatuses[key]?.exercises || []).map(ex => [ex.exercise_order, ex.status]));
                  return selectedDay.session.ejercicios?.map((ejercicio, index) => {
                    const status = statusMap.get(index);
                    const badge = status === 'completed' ? (
                      <Badge variant="outline" className="border-green-500 text-green-400 text-xs">Completado</Badge>
                    ) : status === 'skipped' ? (
                      <Badge variant="outline" className="border-gray-500 text-gray-400 text-xs">Saltado</Badge>
                    ) : status === 'cancelled' ? (
                      <Badge variant="outline" className="border-red-500 text-red-400 text-xs">Cancelado</Badge>
                    ) : null;
                    return (
                      <div
                        key={index}
                        className="flex justify-between items-center p-3 bg-black/50 border border-white/10 rounded-lg"
                      >
                        <div className="flex-1">
                          <p className="font-medium text-white">{ejercicio.nombre}</p>
                          <div className="flex items-center space-x-4 text-sm text-gray-300/70 mt-1">
                            <span className="flex items-center">
                              <Target className="w-3 h-3 mr-1" />
                              {ejercicio.series} × {ejercicio.repeticiones}
                            </span>
                            {ejercicio.descanso_seg && (
                              <span className="flex items-center">
                                <Clock className="w-3 h-3 mr-1" />
                                {Math.round(ejercicio.descanso_seg / 60)}min
                              </span>
                            )}
                          </div>
                          {(() => {
                            const key = getDayKey(selectedDay.weekNumber, selectedDay);
                            const p = (weekStatuses[key]?.exercises || []).find(ex => ex.exercise_order === index);
                            const sd = getSentimentIcon(p?.sentiment);
                            const hasC = !!(p?.comment && p.comment.trim());
                            return (sd || hasC) ? (
                              <div className="flex items-center gap-2 mt-2">
                                {sd && (
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-md border ${sd.bg} ${sd.border}`}>
                                    <sd.Icon className={`w-3 h-3 mr-1 ${sd.color}`} />
                                    <span className={`text-xs ${sd.color}`}>{sd.label}</span>
                                  </span>
                                )}
                                {hasC && <span className="text-xs text-gray-300/70 italic">"{p.comment}"</span>}
                              </div>
                            ) : null;
                          })()}
                        </div>
                        {badge}
                      </div>
                    );
                  });
                })()}
              </div>

            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
