/**
 * POST-WORKOUT TIMING MODAL
 * Modal que se muestra al terminar sesión con recomendación de carbos post-entreno
 *
 * VALOR PARA EL USUARIO:
 * - Saber EXACTAMENTE qué comer después de entrenar
 * - Ejemplos concretos de comidas con cantidades
 * - Urgencia visual según ventana anabólica
 */

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Alert } from '../ui/alert';
import { Badge } from '../ui/badge';
import tokenManager from '../../utils/tokenManager';

export default function PostWorkoutTimingModal({
  sessionData,
  onClose,
  autoShow = true
}) {
  const [recommendation, setRecommendation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState(30 * 60); // 30 minutos en segundos
  const cardBase = "bg-neutral-900/80 border border-white/10 ring-1 ring-white/5 shadow-[0_25px_60px_-50px_rgba(0,0,0,0.8)] backdrop-blur-xl text-white";

  useEffect(() => {
    if (autoShow && sessionData) {
      loadRecommendation();
    }
  }, [sessionData, autoShow]);

  useEffect(() => {
    // Countdown para ventana anabólica
    if (recommendation?.urgency === 'high') {
      const timer = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 0) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [recommendation]);

  const loadRecommendation = async () => {
    try {
      const token = tokenManager.getToken();
      const response = await fetch('/api/carb-timing/session-completed', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          session_id: sessionData.id,
          methodology: sessionData.methodology,
          intensity: sessionData.intensity,
          duration_min: sessionData.duration,
          volume_lifted: sessionData.totalVolume
        })
      });

      const data = await response.json();

      if (data.success) {
        setRecommendation(data.post_workout_recommendation);
      }
    } catch (err) {
      console.error('Error cargando recomendación:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
        <Card className={`w-full max-w-md ${cardBase}`}>
          <CardContent className="p-6">
            <div className="flex items-center justify-center">
              <div className="animate-spin h-8 w-8 border-4 border-yellow-400 border-t-transparent rounded-full"></div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!recommendation) {
    return null;
  }

  const urgencyColors = {
    high: 'bg-gradient-to-r from-red-500 to-rose-500',
    medium: 'bg-gradient-to-r from-amber-500 to-orange-500',
    low: 'bg-gradient-to-r from-emerald-500 to-teal-500'
  };

  const urgencyIcons = {
    high: '🔥',
    medium: '⏰',
    low: '✅'
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <Card className={`w-full max-w-3xl my-4 ${cardBase}`}>
        <CardHeader className={`${urgencyColors[recommendation.urgency]} text-white border-b border-white/10`}>
          <CardTitle className="flex items-center justify-between text-2xl">
            <span>{urgencyIcons[recommendation.urgency]} Post-Entreno: {recommendation.timing}</span>
            {recommendation.urgency === 'high' && (
              <Badge variant="destructive" className="bg-white text-red-600 text-lg px-4 py-2">
                {formatTime(countdown)}
              </Badge>
            )}
          </CardTitle>
          <p className="text-white/90 text-sm mt-2">
            {recommendation.rationale}
          </p>
        </CardHeader>

        <CardContent className="p-6 space-y-6">
          {/* Macros recomendados */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-amber-500/10 border border-amber-400/40 rounded-lg p-4 text-center">
              <p className="text-sm text-amber-200 font-semibold">Carbohidratos</p>
              <p className="text-4xl font-bold text-white">{recommendation.carbs_g}g</p>
            </div>
            <div className="bg-sky-500/10 border border-sky-400/40 rounded-lg p-4 text-center">
              <p className="text-sm text-sky-200 font-semibold">Proteína</p>
              <p className="text-4xl font-bold text-white">{recommendation.protein_g}g</p>
            </div>
          </div>

          {/* Tipo de carbohidrato */}
          <Alert className="bg-white/5 border-white/10 text-gray-200">
            <p className="font-semibold text-white">
              Tipo de carbohidrato: {recommendation.carb_type}
            </p>
            <p className="text-sm text-gray-300 mt-1">
              {recommendation.carb_type_description}
            </p>
            <div className="flex flex-wrap gap-2 mt-2">
              {recommendation.examples.map((example, i) => (
                <Badge key={i} variant="outline" className="bg-white/10 border-white/20 text-white">
                  {example}
                </Badge>
              ))}
            </div>
          </Alert>

          {/* Opciones de comidas */}
          <div>
            <h3 className="font-bold text-lg mb-3 text-white">🍽️ Opciones de Comidas</h3>
            <div className="space-y-4">
              {recommendation.meal_recommendations.map((meal, index) => (
                <Card key={index} className={`${cardBase} border-l-2 border-l-yellow-400/30`}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">{meal.name}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {/* Alimentos */}
                      <div className="space-y-1">
                        {meal.foods.map((food, i) => (
                          <div key={i} className="flex items-center justify-between text-sm text-gray-200">
                            <span className="font-medium text-white">{food.item}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-gray-300">{food.amount}</span>
                              {food.carbs > 0 && (
                                <Badge variant="outline" className="text-xs bg-white/10 border-white/20 text-yellow-200">
                                  {food.carbs}g C
                                </Badge>
                              )}
                              {food.protein > 0 && (
                                <Badge variant="outline" className="text-xs bg-white/10 border-white/20 text-sky-200">
                                  {food.protein}g P
                                </Badge>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Totales */}
                      <div className="flex items-center justify-between pt-2 border-t border-white/10">
                        <span className="font-bold text-white">Total:</span>
                        <div className="flex gap-2">
                          <Badge className="bg-amber-500 text-black">{meal.total_carbs}g carbos</Badge>
                          {meal.total_protein && (
                            <Badge className="bg-sky-500 text-black">{meal.total_protein}g proteína</Badge>
                          )}
                        </div>
                      </div>

                      {/* Nota */}
                      {meal.notes && (
                        <Alert className="bg-gray-50 border-gray-200">
                          <p className="text-xs text-gray-700">{meal.notes}</p>
                        </Alert>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Urgencia alta: aviso especial */}
          {recommendation.urgency === 'high' && countdown > 0 && (
            <Alert variant="destructive" className="bg-red-50 border-red-500">
              <div className="flex items-center gap-3">
                <span className="text-4xl">⏰</span>
                <div>
                  <p className="font-bold text-red-900">
                    ¡Ventana Anabólica Activa!
                  </p>
                  <p className="text-sm text-red-800">
                    Consume tu comida post-entreno en los próximos {formatTime(countdown)} para máxima recuperación
                  </p>
                </div>
              </div>
            </Alert>
          )}

          {/* Botón cerrar */}
          <div className="flex gap-3 pt-4">
            <Button onClick={onClose} className="flex-1">
              Entendido ✅
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
