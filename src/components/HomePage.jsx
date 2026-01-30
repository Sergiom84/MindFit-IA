import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.jsx";
import { Badge } from "@/components/ui/badge.jsx";
import { Button } from "@/components/ui/button.jsx";
import apiClient from "@/lib/apiClient";
import { getActivePlan } from "@/components/routines/api";
import { Brain, Smartphone, Camera, CalendarDays, ListChecks, Zap } from "lucide-react";
import { CycleHomeCard } from "./MenstrualCycle";

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
  const [showCycleCard, setShowCycleCard] = useState(false);
  const navigate = useNavigate();
  const { user, isAuthenticated, isLoading } = useAuth();

  // Verificar si el usuario es femenino para mostrar tarjeta de ciclo
  useEffect(() => {
    const checkCycleFeature = async () => {
      if (!isAuthenticated) return;
      try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/menstrual-cycle/check-user', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          const data = await response.json();
          setShowCycleCard(data.showCycleFeature === true);
        }
      } catch (err) {
        console.error('Error verificando ciclo:', err);
      }
    };
    checkCycleFeature();
  }, [isAuthenticated]);

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

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden pt-24 pb-24">
      <div
        className="absolute inset-0 opacity-10"
        style={{
          background: `radial-gradient(circle at ${mousePosition.x}px ${mousePosition.y}px, yellow 0%, transparent 50%)`
        }}
      />

      <div className="relative z-10 px-6">
        <div className="max-w-6xl mx-auto space-y-10">
          <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-yellow-400/80">Dashboard</p>
              <h1 className="text-4xl md:text-5xl font-bold mt-3">
                Hola, {user?.nombre || "atleta"}
              </h1>
              <p className="text-gray-300 mt-3 max-w-2xl">
                Tu panel de entrenamiento con acceso directo a la sesión de hoy y el estado del plan.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Badge className={hasActivePlan ? "bg-yellow-400 text-black" : "bg-white/10 text-gray-200 border border-white/10"}>
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

              {/* Tarjeta de Ciclo Menstrual - Solo para mujeres */}
              {showCycleCard && (
                <div className="mb-6">
                  <CycleHomeCard userId={user?.id} />
                </div>
              )}

              <div className="grid gap-6 lg:grid-cols-5">
                <Card className="lg:col-span-3 bg-gradient-to-br from-yellow-400/20 via-black/80 to-black border-yellow-400/30">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-white">Entrenamiento de hoy</CardTitle>
                      <Badge className="bg-black/70 text-yellow-300 border border-yellow-400/30">
                        {todaySession ? "Programado" : "Sin sesión"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {hasActivePlan ? (
                      <>
                        <div>
                          <p className="text-2xl font-semibold text-white">
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
                            className="bg-yellow-400 text-black hover:bg-yellow-300"
                            onClick={() => navigate("/routines")}
                            type="button"
                          >
                            Ir al entrenamiento
                          </Button>
                          <Button
                            className="border border-yellow-400/40 text-yellow-200 hover:bg-yellow-400/10"
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
                        <p className="text-xl font-semibold">Aún no tienes un plan activo</p>
                        <p className="text-gray-300">
                          Crea tu metodología para empezar a ver tus sesiones y progreso.
                        </p>
                        <Button
                          className="bg-yellow-400 text-black hover:bg-yellow-300"
                          onClick={() => navigate("/methodologies")}
                          type="button"
                        >
                          Crear plan
                        </Button>
                      </>
                    )}
                  </CardContent>
                </Card>

                <Card className="lg:col-span-2 bg-black/60 border-yellow-400/20">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-white">Estado del plan</CardTitle>
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
                              className="h-full bg-yellow-400"
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

              <div className="grid gap-6 lg:grid-cols-3">
                <Card className="lg:col-span-2 bg-black/60 border-yellow-400/20">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-white">Resumen reciente</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4 md:grid-cols-3 text-sm text-gray-200">
                    <div className="space-y-1">
                      <p className="text-gray-400">Última sesión</p>
                      <p className="text-lg font-semibold text-white">{lastSessionLabel}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-gray-400">Sesiones completadas</p>
                      <p className="text-lg font-semibold text-white">{completedSessions}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-gray-400">Progreso del plan</p>
                      <p className="text-lg font-semibold text-white">{completionRate}%</p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-black/60 border-yellow-400/20">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-white">Accesos rápidos</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <button
                      className="w-full flex items-center gap-3 rounded-lg border border-yellow-400/20 px-4 py-3 text-left text-sm text-gray-200 hover:border-yellow-400/50 hover:text-white transition-colors"
                      onClick={() => navigate("/methodologies")}
                      type="button"
                    >
                      <Brain className="w-5 h-5 text-yellow-300" />
                      IA Adaptativa
                    </button>
                    <button
                      className="w-full flex items-center gap-3 rounded-lg border border-yellow-400/20 px-4 py-3 text-left text-sm text-gray-200 hover:border-yellow-400/50 hover:text-white transition-colors"
                      onClick={() => navigate("/home-training")}
                      type="button"
                    >
                      <Smartphone className="w-5 h-5 text-yellow-300" />
                      Entrenamiento en Casa
                    </button>
                    <button
                      className="w-full flex items-center gap-3 rounded-lg border border-yellow-400/20 px-4 py-3 text-left text-sm text-gray-200 hover:border-yellow-400/50 hover:text-white transition-colors"
                      onClick={() => navigate("/video-correction")}
                      type="button"
                    >
                      <Camera className="w-5 h-5 text-yellow-300" />
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
