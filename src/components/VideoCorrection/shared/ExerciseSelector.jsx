import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CheckCircle } from 'lucide-react';

// NO ejercicios hardcodeados - deben venir de la API de ejercicios
const FALLBACK_EXERCISES = [];

export default function ExerciseSelector({ selectedExerciseId, onExerciseChange }) {
  const [exercises, setExercises] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const cardBase = 'bg-neutral-900/70 border border-white/10 ring-1 ring-white/5 shadow-[0_25px_60px_-50px_rgba(0,0,0,0.8)] backdrop-blur-lg';

  // Cargar biblioteca de ejercicios desde el backend
  useEffect(() => {
    const loadExercises = async () => {
      try {
        const res = await fetch('/api/exercises?limit=500');
        if (res.ok) {
          const data = await res.json();
          // Mapeamos al esquema esperado
          const mapped = (data?.items || data || []).map((e) => ({
            id: e.id || e.slug || e.code || crypto.randomUUID(),
            name: e.name || e.titulo || 'Ejercicio',
            commonErrors: e.common_errors || e.errores || [],
            keyPoints: e.key_points || e.puntos_clave || [],
          }));
          if (mapped.length) setExercises(mapped);
        }
      } catch (e) {
        console.error('Error cargando ejercicios:', e.message);
        setError('No se pudo cargar la biblioteca de ejercicios. Todos los ejercicios deben obtenerse de la base de datos.');
        setExercises([]);
      } finally {
        setLoading(false);
      }
    };
    loadExercises();
  }, []);

  const selectedExercise = exercises.find((e) => e.id === selectedExerciseId) || exercises[0];

  if (loading) {
    return (
      <Card className={`${cardBase} border-l-2 border-l-yellow-400/40 mb-8`}>
        <CardContent className="p-4">
          <div className="text-center">
            <div className="animate-spin w-6 h-6 border-2 border-yellow-400 border-t-transparent rounded-full mx-auto mb-2"></div>
            <p className="text-gray-300/70">Cargando ejercicios desde la base de datos...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || exercises.length === 0) {
    return (
      <Card className={`${cardBase} border-l-2 border-l-red-400/40 mb-8`}>
        <CardContent className="p-4">
          <div className="text-center text-red-300">
            <AlertTriangle className="w-6 h-6 mx-auto mb-2 text-red-300" />
            <p>{error || 'No hay ejercicios disponibles en la base de datos.'}</p>
            <p className="text-sm text-gray-300/70 mt-2">Todos los ejercicios deben cargarse dinámicamente desde la API.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`${cardBase} border-l-2 border-l-yellow-400/40 mb-8`}>
      <CardHeader>
        <CardTitle className="text-white font-urbanist">Biblioteca de Ejercicios</CardTitle>
        <CardDescription className="text-gray-300/70">
          Elige el ejercicio para personalizar el análisis.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2 mb-6">
          {exercises.map((ex) => (
            <Button
              key={ex.id}
              variant={selectedExerciseId === ex.id ? 'default' : 'outline'}
              onClick={() => onExerciseChange(ex.id)}
              className={selectedExerciseId === ex.id
                ? 'bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 text-black hover:from-yellow-200 hover:via-yellow-300 hover:to-amber-400 shadow-[0_10px_24px_-16px_rgba(250,204,21,0.8)]'
                : 'border-white/10 text-gray-200 hover:border-yellow-400/40 hover:bg-white/5'}
            >
              {ex.name}
            </Button>
          ))}
        </div>

        {selectedExercise && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="text-white font-semibold mb-3 flex items-center font-urbanist">
                <AlertTriangle className="w-4 h-4 mr-2 text-red-400" /> Errores comunes
              </h4>
              <ul className="space-y-2">
                {(selectedExercise.commonErrors || []).map((err, idx) => (
                  <li key={idx} className="flex items-center gap-2 text-sm">
                    <div className="w-2 h-2 bg-red-400 rounded-full" />
                    <span className="text-gray-300/80">{err}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-3 flex items-center font-urbanist">
                <CheckCircle className="w-4 h-4 mr-2 text-green-400" /> Puntos clave
              </h4>
              <ul className="space-y-2">
                {(selectedExercise.keyPoints || []).map((pt, idx) => (
                  <li key={idx} className="flex items-center gap-2 text-sm">
                    <div className="w-2 h-2 bg-green-400 rounded-full" />
                    <span className="text-gray-300/80">{pt}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
