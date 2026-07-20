/**
 * CARB TIMING GUIDE
 * Guía rápida de timing de carbohidratos por metodología
 */

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { Alert } from '../ui/alert';
import tokenManager from '../../utils/tokenManager';

export default function CarbTimingGuide() {
  const [guide, setGuide] = useState(null);
  const [methodology, setMethodology] = useState('hipertrofia');
  const [loading, setLoading] = useState(true);
  const cardBase = "bg-neutral-900/70 border border-white/10 ring-1 ring-white/5 shadow-[0_25px_60px_-50px_rgba(0,0,0,0.8)] backdrop-blur-lg text-white";
  const selectClass = "w-full mt-2 p-2 rounded bg-white/5 border border-white/10 text-white";

  useEffect(() => {
    loadGuide();
  }, [methodology]);

  const loadGuide = async () => {
    try {
      const token = tokenManager.getToken() || tokenManager.getToken();
      const response = await fetch(`/api/carb-timing/quick-guide?methodology=${methodology}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const data = await response.json();
      setGuide(data);
    } catch (err) {
      console.error('Error cargando guía:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center p-12 text-white">Cargando...</div>;
  }

  // Contención P0 (§14): mientras la personalización numérica esté desactivada, el
  // backend responde en modo educativo (sin gramos ni cuenta atrás). Se muestra la guía
  // de contexto en vez de números derivados de fórmulas sin validar.
  const isEducational = !guide || guide.mode === 'educational' || guide.personalized === false;

  return (
    <div className="space-y-6 max-w-4xl mx-auto text-white">
      {/* Selector de metodología */}
      <Card className={`${cardBase} border-l-2 border-l-yellow-400/30`}>
        <CardHeader>
          <CardTitle>⏰ Timing de Carbohidratos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <label className="block">
              <span className="font-semibold text-gray-200">Selecciona tu metodología:</span>
              <select
                value={methodology}
                onChange={(e) => setMethodology(e.target.value)}
                className={selectClass}
              >
                <option value="hipertrofia">Hipertrofia / Gym</option>
                <option value="calistenia">Calistenia</option>
                <option value="oposicion">Oposiciones / CrossFit</option>
                <option value="powerlifting">Powerlifting / Fuerza</option>
              </select>
            </label>

            {!isEducational && guide?.user_weight_kg && (
              <Alert className="bg-white/5 border-white/10 text-gray-200">
                <p className="text-sm">Tu peso: <strong className="text-white">{guide.user_weight_kg}kg</strong></p>
              </Alert>
            )}
          </div>
        </CardContent>
      </Card>

      {isEducational && (
        <Card className={`${cardBase} border-l-2 border-l-sky-400/40`}>
          <CardHeader>
            <CardTitle>💡 Orientación de timing</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {(guide?.guidance || [
                'Prioriza el total diario y una comida tolerable alrededor del entrenamiento.',
                'La reposición rápida cobra más importancia si hay otra sesión exigente en pocas horas.'
              ]).map((tip, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-yellow-300">•</span>
                  <span className="text-sm text-gray-200">{tip}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {!isEducational && guide && (
        <>
          {/* Pre-Entreno */}
          <Card className={`${cardBase} border-l-2 border-l-amber-400/50`}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>🍽️ Pre-Entreno</span>
                <Badge className="bg-amber-500 text-black">{guide.pre_workout.carbs_g}g carbos</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="space-y-3">
                <div>
                  <p className="font-semibold text-amber-200">Timing: {guide.pre_workout.timing}</p>
                </div>

                <div>
                  <p className="text-sm font-semibold text-gray-300 mb-2">Opciones:</p>
                  <div className="flex flex-wrap gap-2">
                    {guide.pre_workout.examples.map((ex, i) => (
                      <Badge key={i} variant="outline" className="bg-white/10 border-white/20 text-white">
                        {ex}
                      </Badge>
                    ))}
                  </div>
                </div>

                <Alert className="bg-amber-500/10 border-amber-400/40 text-amber-100">
                  <p className="text-sm">💡 {guide.pre_workout.tip}</p>
                </Alert>
              </div>
            </CardContent>
          </Card>

          {/* Post-Entreno */}
          <Card className={`${cardBase} border-l-2 border-l-sky-400/50`}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>💪 Post-Entreno</span>
                <div className="flex gap-2">
                  <Badge className="bg-amber-500 text-black">{guide.post_workout.carbs_g}g carbos</Badge>
                  <Badge className="bg-sky-500 text-black">{guide.post_workout.protein_g}g proteína</Badge>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="space-y-3">
                <div>
                  <p className="font-semibold text-sky-200">Timing: {guide.post_workout.timing}</p>
                </div>

                <div>
                  <p className="text-sm font-semibold text-gray-300 mb-2">Opciones:</p>
                  <div className="flex flex-wrap gap-2">
                    {guide.post_workout.examples.map((ex, i) => (
                      <Badge key={i} variant="outline" className="bg-white/10 border-white/20 text-white">
                        {ex}
                      </Badge>
                    ))}
                  </div>
                </div>

                <Alert className="bg-sky-500/10 border-sky-400/40 text-sky-100">
                  <p className="text-sm">💡 {guide.post_workout.tip}</p>
                </Alert>
              </div>
            </CardContent>
          </Card>

          {/* Consejos generales */}
          <Card className={`${cardBase} border-l-2 border-l-emerald-400/40`}>
            <CardHeader>
              <CardTitle>💡 Consejos Generales</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {guide.general_tips.map((tip, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-yellow-300">•</span>
                    <span className="text-sm text-gray-200">{tip}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
