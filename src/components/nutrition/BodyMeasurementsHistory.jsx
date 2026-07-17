/**
 * BODY MEASUREMENTS HISTORY
 * Historial y gráficas de mediciones corporales con progreso visual
 */

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import tokenManager from '../../utils/tokenManager';

export default function BodyMeasurementsHistory() {
  const [measurements, setMeasurements] = useState([]);
  const [changes, setChanges] = useState([]);
  const [loading, setLoading] = useState(true);
  const cardBase = "bg-neutral-900/70 border border-white/10 ring-1 ring-white/5 shadow-[0_25px_60px_-50px_rgba(0,0,0,0.8)] backdrop-blur-lg text-white";

  const formatNumber = (value, decimals = 1) => {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return '-';
    return numericValue.toFixed(decimals);
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      const token = tokenManager.getToken() || tokenManager.getToken();

      // Cargar historial
      const historyRes = await fetch('/api/body-measurements/history?limit=10', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const historyData = await historyRes.json();

      // Cargar cambios (con ICG/IPG)
      const changesRes = await fetch('/api/body-measurements/changes', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const changesData = await changesRes.json();

      setMeasurements(historyData.measurements || []);
      setChanges(changesData.changes || []);
    } catch (err) {
      console.error('Error cargando historial:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 text-white">
        <div className="animate-spin h-12 w-12 border-4 border-yellow-400 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-white">
      {/* Tabla de mediciones */}
      <Card className={`${cardBase} border-l-2 border-l-yellow-400/30`}>
        <CardHeader>
          <CardTitle>📋 Historial de Mediciones</CardTitle>
        </CardHeader>
        <CardContent>
          {measurements.length === 0 ? (
            <p className="text-center text-gray-400 py-8">No hay mediciones registradas</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-white/5">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-300">Fecha</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-300">Peso (kg)</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-300">Cintura (cm)</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-300">Bíceps</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-300">Pecho</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-300">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {measurements.map((m, i) => (
                    <tr key={i} className="border-b border-white/5 hover:bg-white/5">
                      <td className="px-4 py-3">{new Date(m.measurement_date).toLocaleDateString('es-ES')}</td>
                      <td className="px-4 py-3 font-semibold text-yellow-200">{formatNumber(m.weight_kg, 1)}</td>
                      <td className="px-4 py-3 font-semibold text-emerald-200">{formatNumber(m.waist_cm, 1)}</td>
                      <td className="px-4 py-3 text-gray-300">{formatNumber(m.biceps_cm, 1)}</td>
                      <td className="px-4 py-3 text-gray-300">{formatNumber(m.chest_cm, 1)}</td>
                      <td className="px-4 py-3">
                        {m.is_validated ? (
                          <Badge variant="success">✅ Validada</Badge>
                        ) : (
                          <Badge variant="warning">⚠️ Pendiente</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cambios y progresión */}
      <Card className={`${cardBase} border-l-2 border-l-sky-400/30`}>
        <CardHeader>
          <CardTitle>📈 Cambios Entre Mediciones</CardTitle>
        </CardHeader>
        <CardContent>
          {changes.length === 0 ? (
            <p className="text-center text-gray-400 py-8">Necesitas al menos 2 mediciones</p>
          ) : (
            <div className="space-y-3">
              {changes.slice(0, 5).map((change, i) => {
                const weightChange = Number(change.weight_change_kg);
                const waistChange = Number(change.waist_change_cm);
                const hasWeightChange = Number.isFinite(weightChange);
                const hasWaistChange = Number.isFinite(waistChange);

                const weightClass = hasWeightChange
                  ? (weightChange > 0 ? 'text-sky-300' : 'text-orange-300')
                  : 'text-gray-300';

                const waistClass = hasWaistChange
                  ? (waistChange > 0 ? 'text-red-300' : 'text-emerald-300')
                  : 'text-gray-300';

                const daysBetween = Number(change.days_between);
                const daysLabel = Number.isFinite(daysBetween) ? daysBetween : change.days_between;

                return (
                  <div key={i} className="border border-white/10 rounded-lg p-4 bg-white/5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold">{new Date(change.measurement_date).toLocaleDateString('es-ES')}</span>
                      <Badge>{daysLabel} días</Badge>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-gray-300">Peso</p>
                        <p className={`font-bold ${weightClass}`}>
                          {hasWeightChange ? `${weightChange > 0 ? '+' : ''}${weightChange.toFixed(2)} kg` : '-'}
                        </p>
                      </div>

                      <div>
                        <p className="text-gray-300">Cintura</p>
                        <p className={`font-bold ${waistClass}`}>
                          {hasWaistChange ? `${waistChange > 0 ? '+' : ''}${waistChange.toFixed(1)} cm` : '-'}
                        </p>
                      </div>

                      {change.icg_ratio && (
                        <div>
                          <p className="text-gray-600">ICG</p>
                          <p className="font-bold">{formatNumber(change.icg_ratio, 2)}</p>
                        </div>
                      )}

                      {change.ipg_ratio && (
                        <div>
                          <p className="text-gray-600">IPG</p>
                          <p className="font-bold">{formatNumber(change.ipg_ratio, 2)}</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
