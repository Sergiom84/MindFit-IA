/**
 * ICG/IPG DASHBOARD
 * Dashboard visual con semáforo de progresión y alertas automáticas
 *
 * VALOR PARA EL USUARIO:
 * - Visualización clara del estado de progresión
 * - Alertas proactivas antes de que los problemas se agraven
 * - Recomendaciones accionables con cantidades exactas
 */

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Alert } from '../ui/alert';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import tokenManager from '../../utils/tokenManager';

export default function ICGIPGDashboard({ userId }) {
  const [progression, setProgression] = useState(null);
  const [weeklySummary, setWeeklySummary] = useState(null);
  const [bridgeState, setBridgeState] = useState(null);
  const [summaryError, setSummaryError] = useState(null);
  const [bridgeError, setBridgeError] = useState(null);
  const [loadingSupplemental, setLoadingSupplemental] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const cardBase = "bg-neutral-900/70 border border-white/10 ring-1 ring-white/5 shadow-[0_25px_60px_-50px_rgba(0,0,0,0.8)] backdrop-blur-lg text-white";

  useEffect(() => {
    loadProgressionData();
    loadSupplementalData();
  }, [userId]);

  const loadProgressionData = async () => {
    try {
      const token = tokenManager.getToken() || tokenManager.getToken();
      const response = await fetch('/api/body-measurements/progression-check', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const data = await response.json();

      if (data.success && data.has_data) {
        setProgression(data);
      } else {
        setProgression({ has_data: false, message: data.message });
      }
    } catch (err) {
      setError(err.message || 'Error al cargar progresión');
    } finally {
      setLoading(false);
    }
  };

  const loadSupplementalData = async () => {
    setLoadingSupplemental(true);
    setSummaryError(null);
    setBridgeError(null);

    try {
      const token = tokenManager.getToken() || tokenManager.getToken();
      const [weeklyRes, bridgeRes] = await Promise.all([
        fetch('/api/diet-deviation/weekly', {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch('/api/bridge/state', {
          headers: { 'Authorization': `Bearer ${token}` }
        })
      ]);

      const weeklyData = await weeklyRes.json();
      const bridgeData = await bridgeRes.json();

      if (weeklyData?.success) {
        setWeeklySummary(weeklyData.summary);
      } else {
        setWeeklySummary(null);
        setSummaryError(weeklyData?.error || 'No se pudo cargar el resumen semanal');
      }

      if (bridgeData?.success) {
        setBridgeState(bridgeData);
      } else {
        setBridgeState(null);
        setBridgeError(bridgeData?.error || 'No se pudo cargar el estado del bridge');
      }
    } catch (err) {
      setSummaryError(err.message || 'Error al cargar resumen semanal');
      setBridgeError(err.message || 'Error al cargar estado del bridge');
    } finally {
      setLoadingSupplemental(false);
    }
  };

  const getDaysRemaining = () => {
    if (!weeklySummary?.weekStart) return null;
    const weekStart = new Date(weeklySummary.weekStart);
    const today = new Date();
    const MS_PER_DAY = 1000 * 60 * 60 * 24;
    const dayIndex = Math.floor((today - weekStart) / MS_PER_DAY);
    if (!Number.isFinite(dayIndex)) return null;
    return Math.max(0, 6 - dayIndex);
  };

  const getWeeklySuggestion = () => {
    if (!weeklySummary) return null;
    if (weeklySummary.netDeviation <= 0) {
      return 'Sin compensación: la semana está dentro del objetivo.';
    }
    const daysRemaining = getDaysRemaining();
    if (!daysRemaining || daysRemaining <= 0) {
      return 'Semana cerrada: no quedan días para compensar.';
    }
    const perDay = Math.round(weeklySummary.netDeviation / daysRemaining);
    return `Recorte sugerido ~${perDay} kcal/día durante ${daysRemaining} días, manteniendo proteína alta.`;
  };

  const normalizeFlags = (flags) => {
    if (Array.isArray(flags)) return flags;
    if (typeof flags === 'string') {
      try {
        const parsed = JSON.parse(flags);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  };

  if (loading) {
    return (
      <Card className={cardBase}>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="animate-spin h-8 w-8 border-4 border-yellow-400 border-t-transparent rounded-full"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="bg-red-500/20 border-red-500/40 text-red-100">
        <p>{error}</p>
      </Alert>
    );
  }

  if (!progression?.has_data) {
    return (
      <Card className={cardBase}>
        <CardContent className="p-6">
          <Alert className="bg-white/5 border-white/10 text-gray-200">
            <p>{progression?.message || 'Necesitas al menos 2 mediciones para evaluar progresión'}</p>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const getStatusColor = (status) => {
    const colors = {
      green_plus: 'bg-green-500',
      green: 'bg-green-400',
      yellow: 'bg-yellow-500',
      red: 'bg-red-500'
    };
    return colors[status] || 'bg-gray-400';
  };

  const getStatusEmoji = (status) => {
    const emojis = {
      green_plus: '🟢✨',
      green: '🟢',
      yellow: '🟡',
      red: '🔴'
    };
    return emojis[status] || '⚪';
  };

  const getStatusLabel = (status) => {
    const labels = {
      neutral: 'Sin señal',
      green_plus: 'Óptimo',
      green: 'Bueno',
      yellow: 'Revisar',
      red: 'Ajustar Urgente'
    };
    return labels[status] || 'Desconocido';
  };

  const getIndicatorMessage = (key) => {
    const indicator = progression?.indicators?.[key];
    if (!indicator) return null;

    // Si hay valor o estado no neutral, el mensaje actual es suficiente.
    if (indicator.value !== null && indicator.value !== undefined) return indicator.message;
    if (indicator.status !== 'neutral') return indicator.message;

    const weightChange = Number(progression?.weight_change_kg);

    if (key === 'ipg') {
      if (Number.isFinite(weightChange)) {
        if (weightChange > 0.2) {
          return `Has subido ${weightChange.toFixed(2)} kg entre mediciones. El IPG solo se calcula cuando hay pérdida de peso (>0.2 kg), para que no sea ruido.`;
        }
        if (weightChange >= -0.2) {
          return `Aún no hay pérdida de peso suficiente para calcular IPG. Necesitamos una bajada >0.2 kg entre dos mediciones validadas para que la señal sea fiable.`;
        }
        return indicator.message;
      }

      return `Para calcular IPG necesitamos una bajada >0.2 kg entre dos mediciones validadas (si no, es ruido).`;
    }

    if (key === 'icg') {
      if (Number.isFinite(weightChange)) {
        if (weightChange < -0.2) {
          return `Has bajado ${Math.abs(weightChange).toFixed(2)} kg entre mediciones. El ICG se usa sobre todo cuando hay ganancia de peso (>0.2 kg), para evaluar si sube la cintura proporcionalmente.`;
        }
        if (weightChange <= 0.2) {
          return `Aún no hay ganancia de peso suficiente para calcular ICG. Necesitamos una subida >0.2 kg entre dos mediciones validadas para que la señal sea fiable.`;
        }
        return indicator.message;
      }

      return `Para calcular ICG necesitamos una subida >0.2 kg entre dos mediciones validadas (si no, es ruido).`;
    }

    return indicator.message;
  };

  return (
    <div className="space-y-4 text-white">
      {/* Resumen general */}
      <Card className={`${cardBase} border-l-2 border-l-yellow-400/30`}>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>📊 Estado de Progresión</span>
            <Badge variant={progression.requires_reevaluation ? 'destructive' : 'success'}>
              {progression.requires_reevaluation ? 'Requiere Atención' : 'Todo OK'}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Fase y contexto */}
            <div className="flex items-center justify-between p-3 bg-white/5 border border-white/10 rounded-lg">
              <span className="text-sm font-semibold text-gray-200">Fase Actual:</span>
              <Badge>{progression.current_phase || 'No definida'}</Badge>
            </div>

            <div className="text-sm text-gray-300 space-y-1">
              <p>Última medición: {new Date(progression.measurement_date).toLocaleDateString('es-ES')}</p>
              <p>Período analizado: {progression.days_between} días</p>
              <p>Cambio de peso: {progression.weight_change_kg > 0 ? '+' : ''}{progression.weight_change_kg?.toFixed(2)} kg</p>
              <p>Cambio de cintura: {progression.waist_change_cm > 0 ? '+' : ''}{progression.waist_change_cm?.toFixed(1)} cm</p>
            </div>

            {/* Resumen general */}
            <Alert className={progression.requires_reevaluation ? 'bg-amber-500/10 border-amber-400/40 text-amber-100' : 'bg-emerald-500/10 border-emerald-400/40 text-emerald-100'}>
              <p className="font-semibold">{progression.summary}</p>
            </Alert>
          </div>
        </CardContent>
      </Card>

      {/* Indicadores ICG/IPG/IEC */}
      {progression.indicators && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* ICG (Volumen) */}
          {progression.indicators.icg && (
            <Card className={cardBase}>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">ICG - Volumen</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {/* Semáforo visual */}
                  <div className="flex items-center gap-3">
                    <div className={`h-16 w-16 rounded-full ${getStatusColor(progression.indicators.icg.status)} flex items-center justify-center text-3xl`}>
                      {getStatusEmoji(progression.indicators.icg.status)}
                    </div>
                    <div>
                      <p className="text-2xl font-bold">
                        {progression.indicators.icg.value?.toFixed(2) || 'N/A'}
                      </p>
                      <Badge variant={progression.indicators.icg.status === 'red' || progression.indicators.icg.status === 'yellow' ? 'destructive' : 'success'}>
                        {getStatusLabel(progression.indicators.icg.status)}
                      </Badge>
                    </div>
                  </div>

                  {/* Mensaje */}
                  <p className="text-sm text-gray-200 font-medium">
                    {getIndicatorMessage('icg')}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* IPG (Definición) */}
          {progression.indicators.ipg && (
            <Card className={cardBase}>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">IPG - Definición</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {/* Semáforo visual */}
                  <div className="flex items-center gap-3">
                    <div className={`h-16 w-16 rounded-full ${getStatusColor(progression.indicators.ipg.status)} flex items-center justify-center text-3xl`}>
                      {getStatusEmoji(progression.indicators.ipg.status)}
                    </div>
                    <div>
                      <p className="text-2xl font-bold">
                        {progression.indicators.ipg.value?.toFixed(2) || 'N/A'}
                      </p>
                      <Badge variant={progression.indicators.ipg.status === 'red' || progression.indicators.ipg.status === 'yellow' ? 'destructive' : 'success'}>
                        {getStatusLabel(progression.indicators.ipg.status)}
                      </Badge>
                    </div>
                  </div>

                  {/* Mensaje */}
                  <p className="text-sm text-gray-200 font-medium">
                    {getIndicatorMessage('ipg')}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* IEC (Mantenimiento) */}
          {progression.indicators.iec && (
            <Card className={cardBase}>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">IEC - Mantenimiento</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {/* Estado */}
                  <div className="flex items-center gap-3">
                    <div className={`h-16 w-16 rounded-full ${progression.indicators.iec.stable ? 'bg-green-500' : 'bg-orange-500'} flex items-center justify-center text-3xl`}>
                      {progression.indicators.iec.stable ? '✅' : '⚠️'}
                    </div>
                    <div>
                      <p className="text-lg font-bold">
                        {progression.indicators.iec.weeks_stable} semanas
                      </p>
                      <Badge variant={progression.indicators.iec.stable ? 'success' : 'warning'}>
                        {progression.indicators.iec.stable ? 'Estable' : 'Inestable'}
                      </Badge>
                    </div>
                  </div>

                  {/* Mensaje */}
                  <p className="text-sm text-gray-200 font-medium">
                    {progression.indicators.iec.message}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Alertas activas */}
      {progression.alerts && progression.alerts.length > 0 && (
        <Card className={`${cardBase} border-l-2 border-l-red-400/40`}>
          <CardHeader>
            <CardTitle className="text-red-300">🚨 Alertas Activas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {progression.alerts.map((alert, index) => (
                <Alert
                  key={index}
                  variant={alert.severity === 'high' ? 'destructive' : 'default'}
                  className={alert.severity === 'high' ? 'bg-red-500/15 border-red-500/40 text-red-100' : 'bg-amber-500/10 border-amber-400/40 text-amber-100'}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-lg text-white">
                        {alert.severity === 'high' ? '🔴' : '🟡'} {alert.type.replace(/_/g, ' ').toUpperCase()}
                      </span>
                      <div className="flex items-center gap-2">
                        <Badge variant={alert.severity === 'high' ? 'destructive' : 'warning'}>
                          {alert.severity === 'high' ? 'Crítico' : 'Advertencia'}
                        </Badge>
                        {(alert.type?.includes('PENDING_CONFIRMATION') || alert.confirmed === false || alert.severity === 'info') && (
                          <Badge variant="secondary">Pendiente</Badge>
                        )}
                        {alert.confirmed && !alert.type?.includes('PENDING_CONFIRMATION') && (
                          <Badge variant="success">Confirmada</Badge>
                        )}
                      </div>
                    </div>
                    <p className="font-semibold text-white">{alert.message}</p>
                    <p className="text-xs text-gray-300">
                      Detectado: {new Date(alert.triggered_at).toLocaleString('es-ES')}
                    </p>
                  </div>
                </Alert>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recomendaciones */}
      {progression.recommendations && progression.recommendations.length > 0 && (
        <Card className={`${cardBase} border-l-2 border-l-emerald-400/30`}>
          <CardHeader>
            <CardTitle>💡 Recomendaciones</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {progression.recommendations.map((rec, index) => (
                <Alert key={index} className="bg-white/5 border-white/10 text-gray-200">
                  <p className="text-sm font-medium">{rec}</p>
                </Alert>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Compensación semanal */}
      <Card className={`${cardBase} border-l-2 border-l-amber-400/30`}>
        <CardHeader>
          <CardTitle>📆 Compensación semanal</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingSupplemental && (
            <p className="text-sm text-gray-300">Cargando resumen semanal...</p>
          )}
          {summaryError && (
            <Alert className="bg-red-500/15 border-red-500/40 text-red-100">
              <p>{summaryError}</p>
            </Alert>
          )}
          {weeklySummary && !summaryError && (
            <div className="space-y-3 text-sm text-gray-200">
              <div className="flex items-center justify-between">
                <span className="text-gray-300">Objetivo semanal</span>
                <span className="font-semibold">{weeklySummary.weeklyTarget} kcal</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-300">Exceso acumulado</span>
                <span className={`font-semibold ${weeklySummary.netDeviation > 0 ? 'text-amber-300' : 'text-emerald-300'}`}>
                  {weeklySummary.netDeviation} kcal
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-300">Compensado</span>
                <span className="font-semibold">{weeklySummary.totalCompensated} kcal</span>
              </div>
              <Alert className="bg-white/5 border-white/10 text-gray-200">
                <p className="font-semibold text-white">{getWeeklySuggestion()}</p>
              </Alert>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Estado del bridge */}
      <Card className={`${cardBase} border-l-2 border-l-sky-400/30`}>
        <CardHeader>
          <CardTitle>🔁 Estado del Bridge</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingSupplemental && (
            <p className="text-sm text-gray-300">Cargando estado del bridge...</p>
          )}
          {bridgeError && (
            <Alert className="bg-red-500/15 border-red-500/40 text-red-100">
              <p>{bridgeError}</p>
            </Alert>
          )}
          {bridgeState?.state && !bridgeError && (
            <div className="space-y-4 text-sm text-gray-200">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-white/5 border border-white/10 rounded-lg p-3">
                  <p className="text-gray-300">Kcal actuales</p>
                  <p className="text-lg font-semibold text-white">{bridgeState.state.current_kcal || 'N/A'}</p>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-lg p-3">
                  <p className="text-gray-300">CLS semanal</p>
                  <p className="text-lg font-semibold text-white">{bridgeState.state.weekly_cls || 'N/A'}</p>
                </div>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-lg p-3">
                <p className="text-gray-300 mb-2">Macros base</p>
                <div className="flex flex-wrap gap-3">
                  <span>Proteína: {bridgeState.state.current_macros?.protein_g ?? 'N/A'} g</span>
                  <span>Carbos: {bridgeState.state.current_macros?.carbs_g ?? 'N/A'} g</span>
                  <span>Grasas: {bridgeState.state.current_macros?.fat_g ?? 'N/A'} g</span>
                </div>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-lg p-3">
                <p className="text-gray-300 mb-2">Flags activos</p>
                <div className="flex flex-wrap gap-2">
                  {normalizeFlags(bridgeState.state.active_flags).length === 0 && (
                    <span className="text-gray-400">Sin flags activos</span>
                  )}
                  {normalizeFlags(bridgeState.state.active_flags).map((flag, idx) => (
                    <Badge key={`${flag.flag || flag}-${idx}`} variant="secondary">
                      {(flag.flag || flag).toString().replace(/_/g, ' ')}
                    </Badge>
                  ))}
                </div>
              </div>

              {bridgeState.recentDecisions?.[0]?.applied_nutrition?.per_day && (
                <div className="bg-white/5 border border-white/10 rounded-lg p-3">
                  <p className="text-gray-300 mb-2">Carb cycling (última decisión)</p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {Object.entries(bridgeState.recentDecisions[0].applied_nutrition.per_day).map(([key, value]) => (
                      <div key={key} className="rounded-lg border border-white/10 bg-black/30 p-3">
                        <p className="text-xs uppercase text-gray-400">{key}</p>
                        <p className="text-sm text-white">{value.kcal} kcal</p>
                        <p className="text-xs text-gray-300">P {value.protein_g}g · C {value.carbs_g}g · G {value.fat_g}g</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Botón para refrescar */}
      <div className="flex justify-center">
        <Button onClick={() => { loadProgressionData(); loadSupplementalData(); }} variant="outline" className="border-white/10 bg-white/5 text-white hover:bg-white/10">
          🔄 Actualizar Estado
        </Button>
      </div>
    </div>
  );
}
