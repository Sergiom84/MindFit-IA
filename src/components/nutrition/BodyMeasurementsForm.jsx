/**
 * BODY MEASUREMENTS FORM
 * Formulario para registrar mediciones corporales con validación automática
 *
 * VALOR PARA EL USUARIO:
 * - Registro rápido y sencillo de mediciones
 * - Validación en tiempo real que previene errores
 * - Feedback inmediato sobre progresión (ICG/IPG)
 */

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Alert } from '../ui/alert';
import { useUserContext } from '@/contexts/UserContext';

export default function BodyMeasurementsForm({ onSuccess, onCancel }) {
  const { userData, refreshProfile } = useUserContext();
  const [formData, setFormData] = useState({
    weight: '',
    waist: '',
    biceps: '',
    chest: '',
    calf: '',
    skinfold_abdominal: '',
    time_of_day: 'morning',
    fasted: true,
    post_workout: false,
    notes: ''
  });

  const [warnings, setWarnings] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const cardBase = "bg-neutral-900/70 border border-white/10 ring-1 ring-white/5 shadow-[0_25px_60px_-50px_rgba(0,0,0,0.8)] backdrop-blur-lg text-white";
  const inputClass = "bg-white/5 border-white/10 text-white placeholder:text-gray-400 focus:border-yellow-300";

  // Asegura que el Dashboard lea el perfil actualizado (UserContext usa cache).
  useEffect(() => {
    refreshProfile?.();
  }, [refreshProfile]);

  // Prefill desde el perfil (peso, cintura y perímetros) si el usuario los tiene
  useEffect(() => {
    if (!userData) return;
    setFormData(prev => ({
      ...prev,
      weight: prev.weight || userData.peso || '',
      waist: prev.waist || userData.cintura || '',
      biceps: prev.biceps || userData.brazos || '',
      chest: prev.chest || userData.pecho || '',
      calf: prev.calf || userData.gemelo || '',
      skinfold_abdominal: prev.skinfold_abdominal || userData.pliegue_abdominal || ''
    }));
  }, [userData]);

  const handleSubmit = async (e, forceSave = false) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('token') || localStorage.getItem('authToken');
      const response = await fetch('/api/body-measurements', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          date: new Date().toISOString().split('T')[0],
          weight: parseFloat(formData.weight),
          waist: parseFloat(formData.waist),
          biceps: formData.biceps ? parseFloat(formData.biceps) : null,
          chest: formData.chest ? parseFloat(formData.chest) : null,
          calf: formData.calf ? parseFloat(formData.calf) : null,
          skinfold_abdominal: formData.skinfold_abdominal ? parseFloat(formData.skinfold_abdominal) : null,
          conditions: {
            time_of_day: formData.time_of_day,
            fasted: formData.fasted,
            post_workout: formData.post_workout,
            notes: formData.notes
          },
          force_save: forceSave
        })
      });

      const data = await response.json();

      // ✨ VALIDACIÓN: Si requiere confirmación, mostrar advertencias
      if (data.requires_confirmation && !forceSave) {
        setWarnings(data);
        setLoading(false);
        return;
      }

      // ✅ Éxito
      if (data.success) {
        onSuccess(data);
      }

    } catch (err) {
      setError(err.message || 'Error al registrar medición');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmWarnings = (e) => {
    // Usuario confirma que los datos son correctos pese a advertencias
    handleSubmit(e, true);
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Limpiar advertencias al editar
    if (warnings) setWarnings(null);
  };

  // Si hay advertencias, mostrar modal de confirmación
  if (warnings) {
    return (
      <Card className={`${cardBase} max-w-2xl mx-auto border-l-2 border-l-red-400/40`}>
        <CardHeader>
          <CardTitle className="text-red-300">⚠️ Mediciones Sospechosas Detectadas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Advertencias críticas (high) */}
            {warnings.warnings.filter(w => w.severity === 'high').length > 0 && (
              <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-4">
                <h3 className="font-bold text-red-200 mb-3">🔴 Advertencias Críticas</h3>
                {warnings.warnings.filter(w => w.severity === 'high').map((warning, i) => (
                  <div key={i} className="mb-3 last:mb-0">
                    <p className="font-semibold text-red-100">{warning.message}</p>
                    <p className="text-sm text-red-200 mt-1">{warning.suggestion}</p>
                    {warning.data && (
                      <p className="text-xs text-red-200/80 mt-1">
                        Cambio: {warning.data.change} ({warning.data.days_between} días)
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Advertencias moderadas (medium) */}
            {warnings.warnings.filter(w => w.severity === 'medium').length > 0 && (
              <div className="bg-amber-500/10 border border-amber-400/60 rounded-lg p-4">
                <h3 className="font-bold text-amber-200 mb-3">🟡 Advertencias</h3>
                {warnings.warnings.filter(w => w.severity === 'medium').map((warning, i) => (
                  <div key={i} className="mb-3 last:mb-0">
                    <p className="font-semibold text-amber-100">{warning.message}</p>
                    <p className="text-sm text-amber-200 mt-1">{warning.suggestion}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Recomendación general */}
            <Alert className="bg-white/5 border-white/10 text-gray-200">
              <p className="text-sm">{warnings.recommendation}</p>
            </Alert>

            {/* Botones de acción */}
            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setWarnings(null)}
                className="flex-1 border-white/10 bg-white/5 text-white hover:bg-white/10"
              >
                ← Revisar Datos
              </Button>
              <Button
                type="button"
                onClick={handleConfirmWarnings}
                disabled={loading}
                className="flex-1 bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 text-black hover:from-yellow-200 hover:via-yellow-300 hover:to-amber-400 shadow-[0_12px_30px_-18px_rgba(250,204,21,0.8)]"
              >
                {loading ? 'Guardando...' : 'Confirmar y Guardar'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Formulario normal
  return (
    <Card className={`${cardBase} max-w-3xl mx-auto border-l-2 border-l-yellow-400/30`}>
      <CardHeader>
        <CardTitle>📏 Registrar Mediciones Corporales</CardTitle>
        <p className="text-sm text-gray-300">
          Registra tus mediciones semanales para seguimiento automático de progreso
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Mediciones OBLIGATORIAS */}
          <div className="bg-white/5 border border-white/10 rounded-lg p-4">
            <h3 className="font-bold text-white mb-3">Mediciones Obligatorias</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-gray-200" htmlFor="weight">Peso (kg) *</Label>
                <Input
                  id="weight"
                  type="number"
                  step="0.1"
                  value={formData.weight}
                  onChange={(e) => handleChange('weight', e.target.value)}
                  placeholder="75.5"
                  required
                  className={inputClass}
                />
              </div>
              <div>
                <Label className="text-gray-200" htmlFor="waist">Cintura (cm) *</Label>
                <Input
                  id="waist"
                  type="number"
                  step="0.1"
                  value={formData.waist}
                  onChange={(e) => handleChange('waist', e.target.value)}
                  placeholder="82.0"
                  required
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          {/* Perímetros musculares OPCIONALES */}
          <div className="border border-white/10 bg-white/5 rounded-lg p-4">
            <h3 className="font-bold text-white mb-2">Perímetros Musculares (Opcional)</h3>
            <p className="text-xs text-gray-400 mb-3">
              Recomendado para detectar pérdida muscular en definición
            </p>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label className="text-gray-200" htmlFor="biceps">Bíceps (cm)</Label>
                <Input
                  id="biceps"
                  type="number"
                  step="0.1"
                  value={formData.biceps}
                  onChange={(e) => handleChange('biceps', e.target.value)}
                  placeholder="38.0"
                  className={inputClass}
                />
              </div>
              <div>
                <Label className="text-gray-200" htmlFor="chest">Pecho (cm)</Label>
                <Input
                  id="chest"
                  type="number"
                  step="0.1"
                  value={formData.chest}
                  onChange={(e) => handleChange('chest', e.target.value)}
                  placeholder="102.0"
                  className={inputClass}
                />
              </div>
              <div>
                <Label className="text-gray-200" htmlFor="calf">Gemelo (cm)</Label>
                <Input
                  id="calf"
                  type="number"
                  step="0.1"
                  value={formData.calf}
                  onChange={(e) => handleChange('calf', e.target.value)}
                  placeholder="38.5"
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          {/* Pliegues cutáneos OPCIONALES */}
          <div className="border border-white/10 bg-white/5 rounded-lg p-4">
            <h3 className="font-bold text-white mb-2">Pliegues Cutáneos (Opcional)</h3>
            <p className="text-xs text-gray-400 mb-3">
              Para usuarios avanzados con calibrador
            </p>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <Label className="text-gray-200" htmlFor="skinfold_abdominal">Pliegue Abdominal (mm)</Label>
                <Input
                  id="skinfold_abdominal"
                  type="number"
                  step="0.1"
                  value={formData.skinfold_abdominal}
                  onChange={(e) => handleChange('skinfold_abdominal', e.target.value)}
                  placeholder="15.0"
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          {/* Condiciones de medición */}
          <div className="border border-white/10 bg-white/5 rounded-lg p-4">
            <h3 className="font-bold text-white mb-3">Condiciones de Medición</h3>
            <div className="space-y-3">
              <div>
                <Label className="text-gray-200" htmlFor="time_of_day">Momento del día</Label>
                <select
                  id="time_of_day"
                  value={formData.time_of_day}
                  onChange={(e) => handleChange('time_of_day', e.target.value)}
                  className="w-full p-2 rounded bg-white/5 border border-white/10 text-white"
                >
                  <option value="morning">Mañana (6:00-12:00)</option>
                  <option value="afternoon">Tarde (12:00-18:00)</option>
                  <option value="evening">Noche (18:00-22:00)</option>
                  <option value="night">Noche tardía (22:00+)</option>
                </select>
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.fasted}
                    onChange={(e) => handleChange('fasted', e.target.checked)}
                  />
                  <span className="text-sm text-gray-200">En ayunas</span>
                </label>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.post_workout}
                    onChange={(e) => handleChange('post_workout', e.target.checked)}
                  />
                  <span className="text-sm text-gray-200">Post-entreno</span>
                </label>
              </div>

              <div>
                <Label className="text-gray-200" htmlFor="notes">Notas (opcional)</Label>
                <textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => handleChange('notes', e.target.value)}
                  placeholder="Ej: Me sentía hinchado, comí mucho sal ayer..."
                  className="w-full p-3 rounded bg-white/5 border border-white/10 text-white placeholder:text-gray-400 min-h-[80px]"
                />
              </div>
            </div>
          </div>

          {/* Error */}
          {error && (
            <Alert variant="destructive" className="bg-red-500/20 border-red-500/40 text-red-100">
              <p>{error}</p>
            </Alert>
          )}

          {/* Botones */}
          <div className="flex gap-3">
            {onCancel && (
              <Button type="button" variant="outline" onClick={onCancel} className="flex-1 border-white/10 bg-white/5 text-white hover:bg-white/10">
                Cancelar
              </Button>
            )}
            <Button type="submit" disabled={loading} className="flex-1 bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 text-black hover:from-yellow-200 hover:via-yellow-300 hover:to-amber-400 shadow-[0_12px_30px_-18px_rgba(250,204,21,0.8)]">
              {loading ? 'Registrando...' : '✅ Registrar Medición'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
