/**
 * CHEAT MEAL MANAGER
 * Gestión de saltos de dieta con compensación automática
 */

import { alertDialog } from '../ui/dialogService.jsx';
import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Alert } from '../ui/alert';
import tokenManager from '../../utils/tokenManager';

export default function CheatMealManager() {
  const [formData, setFormData] = useState({
    excess_kcal: '',
    description: '',
    meal_slot: 'cena',
    confidence_level: 'medio'
  });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const cardBase = "bg-neutral-900/70 border border-white/10 ring-1 ring-white/5 shadow-[0_25px_60px_-50px_rgba(0,0,0,0.8)] backdrop-blur-lg text-white";
  const inputClass = "bg-white/5 border-white/10 text-white placeholder:text-gray-400 focus:border-yellow-300";
  const selectClass = "w-full p-2 rounded bg-white/5 border border-white/10 text-white";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const token = tokenManager.getToken() || tokenManager.getToken();
      const response = await fetch('/api/diet-deviation/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          date: new Date().toISOString().split('T')[0],
          meal_slot: formData.meal_slot,
          excess_kcal: parseInt(formData.excess_kcal),
          description: formData.description,
          confidence_level: formData.confidence_level
        })
      });

      const data = await response.json();
      setResult(data);

      // Limpiar formulario
      setFormData({
        excess_kcal: '',
        description: '',
        meal_slot: 'cena',
        confidence_level: 'medio'
      });
    } catch (err) {
      alertDialog('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto text-white">
      <Card className={`${cardBase} border-l-2 border-l-yellow-400/30`}>
        <CardHeader>
          <CardTitle>🍕 Registrar Salto de Dieta</CardTitle>
          <p className="text-sm text-gray-300">
            Rompe tu dieta sin culpa - el sistema compensará automáticamente
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label className="text-gray-200" htmlFor="excess_kcal">Calorías de EXCESO (kcal) *</Label>
              <Input
                id="excess_kcal"
                type="number"
                value={formData.excess_kcal}
                onChange={(e) => setFormData({ ...formData, excess_kcal: e.target.value })}
                placeholder="800"
                required
                className={inputClass}
              />
              <p className="text-xs text-gray-400 mt-1">
                Solo las calorías de MÁS, no el total consumido
              </p>
            </div>

            <div>
              <Label className="text-gray-200" htmlFor="description">Descripción</Label>
              <textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Ej: Cena con amigos - pizza y cerveza"
                className="w-full p-3 rounded bg-white/5 border border-white/10 text-white placeholder:text-gray-400 min-h-[80px]"
              />
            </div>

            <div>
              <Label className="text-gray-200" htmlFor="meal_slot">Momento del día</Label>
              <select
                id="meal_slot"
                value={formData.meal_slot}
                onChange={(e) => setFormData({ ...formData, meal_slot: e.target.value })}
                className={selectClass}
              >
                <option value="desayuno">Desayuno</option>
                <option value="comida">Comida</option>
                <option value="cena">Cena</option>
                <option value="snack">Snack</option>
                <option value="extra">Extra</option>
              </select>
            </div>

            <div>
              <Label className="text-gray-200" htmlFor="confidence_level">Confianza en la estimación</Label>
              <select
                id="confidence_level"
                value={formData.confidence_level}
                onChange={(e) => setFormData({ ...formData, confidence_level: e.target.value })}
                className={selectClass}
              >
                <option value="bajo">Baja (aprox. al ojo)</option>
                <option value="medio">Media (estimación razonable)</option>
                <option value="alto">Alta (conteo preciso)</option>
              </select>
              <p className="text-xs text-gray-400 mt-1">
                Si es baja, el sistema compensará solo el 50% por seguridad
              </p>
            </div>

            <Button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 text-black hover:from-yellow-200 hover:via-yellow-300 hover:to-amber-400 shadow-[0_12px_30px_-18px_rgba(250,204,21,0.8)]">
              {loading ? 'Registrando...' : 'Registrar Salto'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Resultado */}
      {result && result.success && (
        <Card className={`${cardBase} border-l-2 border-l-emerald-400/40`}>
          <CardHeader>
            <CardTitle className="text-emerald-300">✅ Salto Registrado</CardTitle>
          </CardHeader>
          <CardContent>
            <Alert className="bg-white/5 border-white/10 text-gray-200 mb-4">
              <p className="font-semibold text-white">{result.message}</p>
            </Alert>

            {result.compensation_plan?.days && result.compensation_plan.days.length > 0 && (
              <div>
                <h3 className="font-bold mb-2 text-white">Plan de Compensación:</h3>
                <div className="space-y-2">
                  {result.compensation_plan.days.map((comp, i) => (
                    <div key={i} className="flex items-center justify-between bg-white/5 p-2 rounded border border-white/10">
                      <span className="text-sm text-gray-200">
                        {new Date(comp.date).toLocaleDateString('es-ES')}
                      </span>
                      <span className="font-semibold text-amber-300">
                        {comp.kcal_adjustment} kcal
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
