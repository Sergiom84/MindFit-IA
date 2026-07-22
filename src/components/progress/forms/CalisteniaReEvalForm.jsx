/**
 * 💪 CalisteniaReEvalForm - Formulario de Re-evaluación para Calistenia
 *
 * PROPÓSITO: Capturar progreso específico de ejercicios de calistenia
 * FEATURES:
 *  - Progreso detallado por ejercicio (series, reps)
 *  - Evaluación de dificultad percibida
 *  - Sensaciones generales del período
 *  - Comentarios y observaciones
 *
 * @version 1.0.0 - Sistema de Re-evaluación Progresiva
 */

import { alertDialog } from '../../ui/dialogService.jsx';
import React, { useState, useEffect } from 'react';
import tokenManager from '../../../utils/tokenManager';
import {
  Heart,
  Frown,
  AlertOctagon,
  Smile,
  Star,
  TrendingUp,
  Dumbbell,
  MessageSquare,
  CheckCircle,
  XCircle
} from 'lucide-react';

// =============================================================================
// 🎨 OPCIONES DE FEEDBACK (inspirado en ExerciseFeedbackModal)
// =============================================================================

const sentimentOptions = [
  {
    key: 'excelente',
    label: 'Excelente',
    icon: Star,
    color: 'text-green-400',
    bgColor: 'bg-green-400/10',
    borderColor: 'border-green-400',
    description: '¡Me siento genial! Superando expectativas'
  },
  {
    key: 'bien',
    label: 'Bien',
    icon: Smile,
    color: 'text-blue-400',
    bgColor: 'bg-blue-400/10',
    borderColor: 'border-blue-400',
    description: 'Progreso constante, me siento bien'
  },
  {
    key: 'regular',
    label: 'Regular',
    icon: Heart,
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-400/10',
    borderColor: 'border-yellow-400',
    description: 'Aceptable, pero podría mejorar'
  },
  {
    key: 'dificil',
    label: 'Difícil',
    icon: Frown,
    color: 'text-orange-400',
    bgColor: 'bg-orange-400/10',
    borderColor: 'border-orange-400',
    description: 'Me está costando más de lo esperado'
  },
  {
    key: 'muy_dificil',
    label: 'Muy Difícil',
    icon: AlertOctagon,
    color: 'text-red-400',
    bgColor: 'bg-red-400/10',
    borderColor: 'border-red-400',
    description: 'Necesito ajustar el plan'
  }
];

const difficultyOptions = [
  { value: 'facil', label: 'Fácil', color: 'text-green-400' },
  { value: 'adecuado', label: 'Adecuado', color: 'text-blue-400' },
  { value: 'dificil', label: 'Difícil', color: 'text-orange-400' }
];

// =============================================================================
// 🎯 COMPONENTE: ExerciseProgressInput
// =============================================================================

const ExerciseProgressInput = ({ exercise, onChange, value }) => {
  const [series, setSeries] = useState(value?.series_achieved || '');
  const [reps, setReps] = useState(value?.reps_achieved || '');
  const [difficulty, setDifficulty] = useState(value?.difficulty_rating || '');
  const [notes, setNotes] = useState(value?.notes || '');

  useEffect(() => {
    onChange({
      exercise_id: exercise.id,
      exercise_name: exercise.nombre,
      series_achieved: series ? parseInt(series) : null,
      reps_achieved: reps,
      difficulty_rating: difficulty,
      notes: notes.trim()
    });
  }, [series, reps, difficulty, notes]);

  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 hover:border-gray-600 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h4 className="text-white font-semibold">{exercise.nombre}</h4>
          {exercise.descripcion && (
            <p className="text-xs text-gray-400 mt-1">{exercise.descripcion}</p>
          )}
        </div>
        <Dumbbell className="text-gray-600" size={20} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Series */}
        <div>
          <label className="block text-xs text-gray-400 mb-1">Series completadas</label>
          <input
            type="number"
            min="0"
            max="20"
            value={series}
            onChange={e => setSeries(e.target.value)}
            placeholder="Ej: 3"
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-600 focus:border-yellow-400 focus:outline-none"
          />
        </div>

        {/* Repeticiones */}
        <div>
          <label className="block text-xs text-gray-400 mb-1">Repeticiones</label>
          <input
            type="text"
            value={reps}
            onChange={e => setReps(e.target.value)}
            placeholder="Ej: 10 o 8-10"
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-600 focus:border-yellow-400 focus:outline-none"
          />
        </div>
      </div>

      {/* Dificultad */}
      <div className="mt-3">
        <label className="block text-xs text-gray-400 mb-2">¿Cómo lo sentiste?</label>
        <div className="grid grid-cols-3 gap-2">
          {difficultyOptions.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setDifficulty(opt.value)}
              className={`py-2 px-3 rounded-lg border transition-all text-sm ${
                difficulty === opt.value
                  ? `border-yellow-400 bg-yellow-400/10 ${opt.color} font-semibold`
                  : 'border-gray-700 hover:border-gray-600 text-gray-400'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Notas opcionales */}
      <div className="mt-3">
        <input
          type="text"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Notas opcionales (Ej: Progresé a arquera)"
          maxLength={100}
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-yellow-400 focus:outline-none"
        />
      </div>
    </div>
  );
};

// =============================================================================
// 🏗️ COMPONENTE PRINCIPAL: CalisteniaReEvalForm
// =============================================================================

const CalisteniaReEvalForm = ({
  planId,
  currentWeek,
  methodology,
  onSubmit,
  onCancel,
  isSubmitting
}) => {
  const [keyExercises, setKeyExercises] = useState([]);
  const [exercisesData, setExercisesData] = useState({});
  const [sentiment, setSentiment] = useState(null);
  const [overallComment, setOverallComment] = useState('');
  const [isLoadingExercises, setIsLoadingExercises] = useState(true);

  // =============================================================================
  // 📥 CARGAR EJERCICIOS CLAVE DEL PLAN
  // =============================================================================

  useEffect(() => {
    const loadKeyExercises = async () => {
      try {
        setIsLoadingExercises(true);
        console.log(`📋 Cargando ejercicios clave del plan ${planId}`);

        const response = await fetch(
          `/api/progress/key-exercises?methodology_plan_id=${planId}&week=${currentWeek}`,
          {
            headers: {
              'Authorization': `Bearer ${tokenManager.getToken()}`
            }
          }
        );

        if (!response.ok) {
          throw new Error('No se pudieron cargar los ejercicios');
        }

        const data = await response.json();
        console.log('✅ Ejercicios clave cargados:', data.exercises);
        setKeyExercises(data.exercises || []);

      } catch (error) {
        console.error('❌ Error cargando ejercicios:', error);
        // Usar ejercicios de ejemplo si falla la carga
        setKeyExercises([
          { id: 'pull-ups', nombre: 'Pull-ups', descripcion: 'Dominadas estrictas' },
          { id: 'push-ups', nombre: 'Push-ups', descripcion: 'Flexiones' },
          { id: 'squats', nombre: 'Squats', descripcion: 'Sentadillas' }
        ]);
      } finally {
        setIsLoadingExercises(false);
      }
    };

    if (planId) {
      loadKeyExercises();
    }
  }, [planId, currentWeek]);

  // =============================================================================
  // 📝 HANDLERS
  // =============================================================================

  const handleExerciseChange = (exerciseId, data) => {
    setExercisesData(prev => ({
      ...prev,
      [exerciseId]: data
    }));
  };

  const handleSubmitForm = () => {
    // Validación básica
    if (!sentiment) {
      alertDialog('Por favor selecciona cómo te has sentido estas semanas');
      return;
    }

    // Filtrar solo ejercicios con datos ingresados
    const exercisesArray = Object.values(exercisesData).filter(
      ex => ex.series_achieved || ex.reps_achieved || ex.difficulty_rating
    );

    const formData = {
      sentiment,
      overall_comment: overallComment.trim(),
      exercises: exercisesArray
    };

    console.log('📤 Enviando datos del formulario:', formData);
    onSubmit(formData);
  };

  const canSubmit = sentiment !== null && !isSubmitting;

  // =============================================================================
  // 🎨 RENDER
  // =============================================================================

  if (isLoadingExercises) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-yellow-400 border-t-transparent mx-auto mb-4"></div>
        <p className="text-gray-400">Cargando ejercicios del plan...</p>
      </div>
    );
  }

  return (
    <form onSubmit={e => e.preventDefault()} className="space-y-6">

      {/* SECCIÓN 1: Sensación General */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Heart className="text-yellow-400" size={20} />
          <h3 className="text-lg font-semibold text-white">
            ¿Cómo te has sentido estas semanas?
          </h3>
        </div>
        <p className="text-sm text-gray-400 mb-4">
          Evalúa tu experiencia general durante este período de entrenamiento
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {sentimentOptions.map(opt => {
            const Icon = opt.icon;
            const isSelected = sentiment === opt.key;

            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => setSentiment(opt.key)}
                className={`p-4 rounded-lg border transition-all text-left ${
                  isSelected
                    ? `${opt.borderColor} ${opt.bgColor} ${opt.color}`
                    : 'border-gray-700 hover:border-gray-600 hover:bg-gray-800/30'
                }`}
              >
                <div className="flex items-start gap-3">
                  <Icon
                    size={24}
                    className={isSelected ? opt.color : 'text-gray-500'}
                  />
                  <div className="flex-1">
                    <p className={`font-semibold mb-1 ${isSelected ? opt.color : 'text-gray-300'}`}>
                      {opt.label}
                    </p>
                    <p className="text-xs text-gray-400">{opt.description}</p>
                  </div>
                  {isSelected && (
                    <CheckCircle size={20} className={opt.color} />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* SECCIÓN 2: Progreso por Ejercicio */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="text-yellow-400" size={20} />
          <h3 className="text-lg font-semibold text-white">
            Progreso en Ejercicios Clave
          </h3>
        </div>
        <p className="text-sm text-gray-400 mb-4">
          Comparte tu progreso en los ejercicios principales (opcional, pero recomendado para mejores ajustes de IA)
        </p>

        <div className="space-y-3">
          {keyExercises.map(exercise => (
            <ExerciseProgressInput
              key={exercise.id}
              exercise={exercise}
              value={exercisesData[exercise.id]}
              onChange={data => handleExerciseChange(exercise.id, data)}
            />
          ))}
        </div>

        {keyExercises.length === 0 && (
          <div className="bg-gray-800/30 border border-gray-700 rounded-lg p-6 text-center">
            <MessageSquare className="text-gray-600 mx-auto mb-2" size={32} />
            <p className="text-gray-400">No se encontraron ejercicios para esta semana</p>
          </div>
        )}
      </section>

      {/* SECCIÓN 3: Comentarios Generales */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <MessageSquare className="text-yellow-400" size={20} />
          <h3 className="text-lg font-semibold text-white">
            Observaciones Generales
          </h3>
        </div>
        <p className="text-sm text-gray-400 mb-4">
          Comparte cualquier comentario, dificultad o logro que quieras destacar
        </p>

        <textarea
          value={overallComment}
          onChange={e => setOverallComment(e.target.value)}
          placeholder="Ejemplo: Los pull-ups me resultan más fáciles, pero las dips siguen siendo difíciles. He notado mejora en la fuerza de agarre..."
          className="w-full bg-gray-800 border border-gray-700 rounded-lg p-4 text-white placeholder-gray-500 resize-none focus:border-yellow-400 focus:outline-none transition-colors"
          rows={5}
          maxLength={500}
        />
        <div className="flex items-center justify-between mt-2">
          <p className="text-xs text-gray-500">{overallComment.length}/500 caracteres</p>
          {overallComment.length > 450 && (
            <p className="text-xs text-orange-400">Cerca del límite</p>
          )}
        </div>
      </section>

      {/* BOTONES DE ACCIÓN */}
      <div className="flex gap-3 justify-end pt-6 border-t border-gray-700">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="px-5 py-2.5 text-gray-300 hover:text-white transition-colors disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleSubmitForm}
          disabled={!canSubmit}
          className="px-6 py-2.5 bg-yellow-400 hover:bg-yellow-500 text-black font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl flex items-center gap-2"
        >
          {isSubmitting ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-black border-t-transparent"></div>
              Enviando...
            </>
          ) : (
            <>
              <CheckCircle size={18} />
              Enviar Evaluación
            </>
          )}
        </button>
      </div>

      {/* Hint de Validación */}
      {!sentiment && (
        <div className="bg-yellow-400/10 border border-yellow-400/30 rounded-lg p-3 flex items-start gap-2">
          <AlertOctagon className="text-yellow-400 flex-shrink-0 mt-0.5" size={18} />
          <p className="text-sm text-yellow-200">
            Por favor selecciona cómo te has sentido para poder enviar la evaluación
          </p>
        </div>
      )}
    </form>
  );
};

export default CalisteniaReEvalForm;
