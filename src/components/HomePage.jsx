import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.jsx";
import { Badge } from "@/components/ui/badge.jsx";
import { Button } from "@/components/ui/button.jsx";
import apiClient from "@/lib/apiClient";
import { getActivePlan } from "@/components/routines/api";
import { Brain, Smartphone, Camera, CalendarDays, ListChecks, Zap } from "lucide-react";

const formatDate = (value) => {
  if (!value) return "Sin sesiones aún";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin sesiones aún";
  return date.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
};

const parseExercisesCount = (exercises) => {
  if (!exercises) return 0;
  if (Array.isArray(exercises)) return exercises.length;
  if (typeof exercises === "string") {
    try {
      const parsed = JSON.parse(exercises);
      return Array.isArray(parsed) ? parsed.length : 0;
    } catch (error) {
      return 0;
    }
  }
  return 0;
};

const HomePage = () => {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [dashboardState, setDashboardState] = useState({
    isLoading: true,
    error: null,
    activePlan: null,
    progress: null
  });
  const navigate = useNavigate();
  const { user, isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    const handleMouseMove = (e) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;
    let isMounted = true;

    const loadDashboard = async () => {
      setDashboardState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const activePlan = await getActivePlan();
        if (!isMounted) return;

        if (!activePlan?.hasActivePlan) {
          setDashboardState({
            isLoading: false,
            error: null,
            activePlan: null,
            progress: null
          });
          return;
        }

        const planId = activePlan.methodology_plan_id || activePlan.planId;
        let progress = null;

        if (planId) {
          const params = new URLSearchParams({ methodology_plan_id: String(planId) });
          try {
            const response = await apiClient.get(`/training-session/stats/progress-data?${params.toString()}`, {
              cache: false
            });
            progress = response?.data || response;
          } catch (error) {
            progress = null;
          }
        }

        if (!isMounted) return;
        setDashboardState({
          isLoading: false,
          error: null,
          activePlan,
          progress
        });
      } catch (error) {
        if (!isMounted) return;
        setDashboardState({
          isLoading: false,
          error: error.message || "No se pudo cargar el dashboard",
          activePlan: null,
          progress: null
        });
      }
    };

    loadDashboard();

    return () => {
      isMounted = false;
    };
  }, [isAuthenticated, user?.id]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-white">
        <div className="animate-spin rounded-full h-12 w-12 border-2 border-yellow-400 border-t-transparent"></div>
      </div>
    );
  }

  const activePlan = dashboardState.activePlan;
  const hasActivePlan = Boolean(activePlan?.hasActivePlan);
  const planData = activePlan?.routinePlan || null;
  const todaySession = activePlan?.todaySession || null;
  const progress = dashboardState.progress;

  const planWeeks = planData?.semanas || planData?.weeks || [];
  const totalWeeks = Array.isArray(planWeeks) ? planWeeks.length : (progress?.totalWeeks || 0);
  const totalSessionsFromPlan = Array.isArray(planWeeks)
    ? planWeeks.reduce((acc, semana) => acc + (semana.sesiones?.length || semana.sessions?.length || 0), 0)
    : 0;
  const totalSessions = progress?.totalSessions || totalSessionsFromPlan || 0;
  const completedSessions = progress?.completedSessions || 0;
  const completionRate = totalSessions ? Math.round((completedSessions / totalSessions) * 100) : 0;
  const currentWeek = todaySession?.week_number || progress?.currentWeek || 1;
  const todayExercisesCount = parseExercisesCount(todaySession?.exercises);
  const lastSessionLabel = formatDate(progress?.lastSessionDate);
  const todayDateLabel = todaySession?.scheduled_date ? formatDate(todaySession.scheduled_date) : "Hoy";
  const cardBase = "bg-neutral-900/70 border border-white/10 ring-1 ring-white/5 shadow-[0_25px_60px_-50px_rgba(0,0,0,0.8)] backdrop-blur-lg";

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

      <div className="relative z-10 px-4 py-8">
        <div className="max-w-6xl mx-auto space-y-10">
          <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between animate-fade-in">
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-yellow-200/80">Dashboard</p>
              <h1 className="text-4xl md:text-5xl font-semibold font-urbanist mt-3">
                Hola, {user?.nombre || "atleta"}
              </h1>
              <p className="text-gray-200/80 mt-3 max-w-2xl">
                Acceso rápido a la sesión de hoy, tu progreso y el estado del plan.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Badge
                className={hasActivePlan
                  ? "bg-gradient-to-r from-yellow-300 to-amber-400 text-black border border-yellow-200/60"
                  : "bg-white/10 text-gray-200 border border-white/10"}
              >
                {hasActivePlan ? "Plan activo" : "Sin plan activo"}
              </Badge>
            </div>
          </header>

          {dashboardState.isLoading ? (
            <div className="flex items-center gap-3 text-gray-300">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-yellow-400 border-t-transparent"></div>
              <span>Cargando tu panel...</span>
            </div>
          ) : (
            <>
              {dashboardState.error ? (
                <div className="text-sm text-red-300 bg-red-950/40 border border-red-400/20 rounded-lg p-4">
                  {dashboardState.error}
                </div>
              ) : null}

              <div className="grid gap-6 lg:grid-cols-5 animate-slide-up">
                <Card className={`lg:col-span-3 ${cardBase} border-l-2 border-l-yellow-400/30`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-white font-urbanist">Entrenamiento de hoy</CardTitle>
                      <Badge className="bg-black/70 text-yellow-300 border border-yellow-400/30">
                        {todaySession ? "Programado" : "Sin sesión"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {hasActivePlan ? (
                      <>
                        <div>
                          <p className="text-2xl font-semibold text-white font-urbanist">
                            {todaySession?.session_title || "No hay sesión programada para hoy"}
                          </p>
                          <p className="text-gray-300 mt-2">
                            {todaySession ? `${todaySession.day_name || "Hoy"} · ${todayDateLabel}` : "Aprovecha para recuperar o revisar tu plan."}
                          </p>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-3 text-sm text-gray-200">
                          <div className="flex items-center gap-2">
                            <CalendarDays className="w-4 h-4 text-yellow-300" />
                            Semana {currentWeek}{totalWeeks ? ` de ${totalWeeks}` : ""}
                          </div>
                          <div className="flex items-center gap-2">
                            <ListChecks className="w-4 h-4 text-yellow-300" />
                            {todayExercisesCount} ejercicios previstos
                          </div>
                          <div className="flex items-center gap-2">
                            <Zap className="w-4 h-4 text-yellow-300" />
                            Estado: {todaySession?.status || "sin iniciar"}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-3 pt-2">
                          <Button
                            className="bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 text-black hover:from-yellow-200 hover:via-yellow-300 hover:to-amber-400 shadow-[0_12px_30px_-18px_rgba(250,204,21,0.8)]"
                            onClick={() => navigate("/routines")}
                            type="button"
                          >
                            Ir al entrenamiento
                          </Button>
                          <Button
                            className="border border-yellow-400/40 text-yellow-100 hover:bg-yellow-400/10"
                            variant="outline"
                            onClick={() => navigate("/routines")}
                            type="button"
                          >
                            Ver plan completo
                          </Button>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="text-xl font-semibold font-urbanist">Aún no tienes un plan activo</p>
                        <p className="text-gray-300">
                          Crea tu metodología para empezar a ver tus sesiones y progreso.
                        </p>
                        <Button
                          className="bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 text-black hover:from-yellow-200 hover:via-yellow-300 hover:to-amber-400 shadow-[0_12px_30px_-18px_rgba(250,204,21,0.8)]"
                          onClick={() => navigate("/methodologies")}
                          type="button"
                        >
                          Crear plan
                        </Button>
                      </>
                    )}
                  </CardContent>
                </Card>

                <Card className={`lg:col-span-2 ${cardBase}`}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-white font-urbanist">Estado del plan</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    {hasActivePlan ? (
                      <>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm text-gray-300">
                            <span>Progreso general</span>
                            <span>{completionRate}% completado</span>
                          </div>
                          <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500"
                              style={{ width: `${completionRate}%` }}
                            />
                          </div>
                        </div>
                        <div className="grid gap-4 text-sm text-gray-200">
                          <div className="flex items-center justify-between">
                            <span>Semana actual</span>
                            <span className="text-white font-semibold">
                              {currentWeek}{totalWeeks ? ` / ${totalWeeks}` : ""}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Sesiones completadas</span>
                            <span className="text-white font-semibold">
                              {completedSessions} / {totalSessions || "-"}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Última sesión</span>
                            <span className="text-white font-semibold">{lastSessionLabel}</span>
                          </div>
                        </div>
                      </>
                    ) : (
                      <p className="text-gray-300">
                        Activa un plan para desbloquear el seguimiento semanal.
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-6 lg:grid-cols-3 animate-slide-up">
                <Card className={`lg:col-span-2 ${cardBase}`}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-white font-urbanist">Resumen reciente</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4 md:grid-cols-3 text-sm text-gray-200">
                    <div className="space-y-1">
                      <p className="text-gray-300/70">Última sesión</p>
                      <p className="text-lg font-semibold text-white font-urbanist">{lastSessionLabel}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-gray-300/70">Sesiones completadas</p>
                      <p className="text-lg font-semibold text-white font-urbanist">{completedSessions}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-gray-300/70">Progreso del plan</p>
                      <p className="text-lg font-semibold text-white font-urbanist">{completionRate}%</p>
                    </div>
                  </CardContent>
                </Card>

                <Card className={cardBase}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-white font-urbanist">Accesos rápidos</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <button
                      className="group w-full flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-left text-sm text-gray-200 hover:border-yellow-400/50 hover:text-white transition-all hover:bg-white/10"
                      onClick={() => navigate("/methodologies")}
                      type="button"
                    >
                      <Brain className="w-5 h-5 text-yellow-300 group-hover:text-yellow-200" />
                      IA adaptativa
                    </button>
                    <button
                      className="group w-full flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-left text-sm text-gray-200 hover:border-yellow-400/50 hover:text-white transition-all hover:bg-white/10"
                      onClick={() => navigate("/home-training")}
                      type="button"
                    >
                      <Smartphone className="w-5 h-5 text-yellow-300 group-hover:text-yellow-200" />
                      Entrenamiento en Casa
                    </button>
                    <button
                      className="group w-full flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-left text-sm text-gray-200 hover:border-yellow-400/50 hover:text-white transition-all hover:bg-white/10"
                      onClick={() => navigate("/video-correction")}
                      type="button"
                    >
                      <Camera className="w-5 h-5 text-yellow-300 group-hover:text-yellow-200" />
                      Corrección por Video IA
                    </button>
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default HomePage;
