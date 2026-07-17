import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import tokenManager from '../../utils/tokenManager';
import { 
  Brain,
  Zap,
  Target,
  Calendar,
  Utensils,
  TrendingUp,
  Loader2,
  Sparkles,
  CheckCircle,
  AlertCircle
} from 'lucide-react';

export default function NutritionAI({ userData, currentRoutine, userMacros, onPlanGenerated }) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedPlan, setGeneratedPlan] = useState(null);
  const [customRequirements, setCustomRequirements] = useState('');
  const [selectedOptions, setSelectedOptions] = useState({
    duration: 7, // días
    mealCount: 4, // comidas por día
    includeSupplements: true,
    dietary: 'none', // none, vegetarian, vegan, keto, etc.
    budget: 'medium' // low, medium, high
  });

  const generateNutritionPlan = async () => {
    setIsGenerating(true);
    
    try {
      const token = tokenManager.getToken();
      const response = await fetch('/api/nutrition/generate-plan', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userData,
          currentRoutine,
          userMacros,
          options: selectedOptions,
          customRequirements
        })
      });

      if (!response.ok) {
        throw new Error('Error generando plan nutricional');
      }

      const data = await response.json();
      setGeneratedPlan(data.plan);
      
      if (onPlanGenerated) {
        onPlanGenerated(data.plan);
      }

    } catch (error) {
      console.error('Error generating nutrition plan:', error);
      alert('Error al generar el plan nutricional. Por favor, inténtalo de nuevo.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleOptionChange = (option, value) => {
    setSelectedOptions(prev => ({
      ...prev,
      [option]: value
    }));
  };

  const getPersonalizedPrompt = () => {
    if (!userData) return "Información del usuario no disponible";
    
    return `Generar plan nutricional personalizado para:
    
PERFIL DEL USUARIO:
- Edad: ${userData.edad || 'No especificado'} años
- Sexo: ${userData.sexo || 'No especificado'}
- Peso: ${userData.peso || 'No especificado'} kg
- Altura: ${userData.altura || 'No especificado'} cm
- Nivel de actividad: ${userData.nivel_actividad || 'Moderado'}
- Objetivo principal: ${userData.objetivo_principal || 'Mantenimiento'}
- Metodología de entrenamiento: ${userData.metodologia_preferida || 'No especificada'}
- Alergias: ${userData.alergias?.join(', ') || 'Ninguna'}
- Restricciones: ${userData.limitaciones_fisicas || 'Ninguna'}

OBJETIVOS NUTRICIONALES:
- Calorías objetivo: ${userMacros?.calories || 2000} kcal/día
- Proteína: ${userMacros?.protein || 150}g/día
- Carbohidratos: ${userMacros?.carbs || 200}g/día  
- Grasas: ${userMacros?.fat || 65}g/día

PREFERENCIAS SELECCIONADAS:
- Duración del plan: ${selectedOptions.duration} días
- Comidas por día: ${selectedOptions.mealCount}
- Estilo alimentario: ${selectedOptions.dietary === 'none' ? 'Sin restricciones' : selectedOptions.dietary}
- Presupuesto: ${selectedOptions.budget}
- Incluir suplementos: ${selectedOptions.includeSupplements ? 'Sí' : 'No'}

REQUISITOS ADICIONALES:
${customRequirements || 'Ninguno especificado'}

Por favor, genera un plan nutricional detallado que incluya:
1. Plan de comidas día por día
2. Recetas específicas con cantidades
3. Horarios de comidas optimizados para el entrenamiento
4. Lista de la compra organizada
5. Recomendaciones de suplementos (si aplica)
6. Tips de preparación y almacenamiento
7. Alternativas para cada comida
8. Análisis nutricional completo

El plan debe ser práctico, realista y adaptado específicamente a los objetivos y limitaciones del usuario.`;
  };

  return (
    <div className="space-y-6">
      {/* Header con resumen de macros */}
      <Card className="bg-neutral-900/70 border-white/10 ring-1 ring-white/5">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Brain className="text-yellow-400" size={24} />
            Asistente IA Nutricional
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-300 mb-4">
            Configura las opciones del plan y genera un plan nutricional personalizado basado en tu perfil, rutina de entrenamiento y objetivos específicos.
          </p>

          {userData && userMacros && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-white/5 rounded-lg">
              <div className="text-center">
                <div className="text-lg font-bold text-blue-400">{userMacros.calories}</div>
                <div className="text-xs text-gray-300">kcal objetivo</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-red-400">{userMacros.protein}g</div>
                <div className="text-xs text-gray-300">Proteína</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-green-400">{userMacros.carbs}g</div>
                <div className="text-xs text-gray-300">Carbohidratos</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-yellow-400">{userMacros.fat}g</div>
                <div className="text-xs text-gray-300">Grasas</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Opciones de configuración - AHORA VISIBLE SIEMPRE */}
      <Card className="bg-neutral-900/70 border-white/10 ring-1 ring-white/5">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Target className="text-yellow-400" size={20} />
            Configuración del Plan
          </CardTitle>
          <p className="text-sm text-gray-400 mt-2">
            Personaliza las opciones antes de generar tu plan nutricional
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Duración */}
            <div className="space-y-2">
              <label className="text-white font-medium">Duración del Plan</label>
              <select
                value={selectedOptions.duration}
                onChange={(e) => handleOptionChange('duration', parseInt(e.target.value))}
                className="w-full bg-white/5 border-white/10 text-white rounded-lg px-3 py-2"
              >
                <option value={3}>3 días</option>
                <option value={7}>1 semana</option>
                <option value={14}>2 semanas (máximo)</option>
              </select>
              <p className="text-xs text-gray-400 mt-1">
                Limitado a 14 días para optimizar la generación
              </p>
            </div>

            {/* Número de comidas */}
            <div className="space-y-2">
              <label className="text-white font-medium">Comidas por Día</label>
              <select
                value={selectedOptions.mealCount}
                onChange={(e) => handleOptionChange('mealCount', parseInt(e.target.value))}
                className="w-full bg-white/5 border-white/10 text-white rounded-lg px-3 py-2"
              >
                <option value={3}>3 comidas</option>
                <option value={4}>4 comidas</option>
                <option value={5}>5 comidas</option>
                <option value={6}>6 comidas</option>
              </select>
            </div>

            {/* Estilo alimentario */}
            <div className="space-y-2">
              <label className="text-white font-medium">Estilo Alimentario</label>
              <select
                value={selectedOptions.dietary}
                onChange={(e) => handleOptionChange('dietary', e.target.value)}
                className="w-full bg-white/5 border-white/10 text-white rounded-lg px-3 py-2"
              >
                <option value="none">Sin restricciones</option>
                <option value="vegetarian">Vegetariano</option>
                <option value="vegan">Vegano</option>
                <option value="keto">Cetogénico</option>
                <option value="paleo">Paleo</option>
                <option value="mediterranean">Mediterráneo</option>
              </select>
            </div>

            {/* Presupuesto */}
            <div className="space-y-2">
              <label className="text-white font-medium">Presupuesto</label>
              <select
                value={selectedOptions.budget}
                onChange={(e) => handleOptionChange('budget', e.target.value)}
                className="w-full bg-white/5 border-white/10 text-white rounded-lg px-3 py-2"
              >
                <option value="low">Económico</option>
                <option value="medium">Medio</option>
                <option value="high">Premium</option>
              </select>
            </div>

            {/* Suplementos */}
            <div className="space-y-2">
              <label className="text-white font-medium">Incluir Suplementos</label>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selectedOptions.includeSupplements}
                  onChange={(e) => handleOptionChange('includeSupplements', e.target.checked)}
                  className="w-4 h-4"
                />
                <span className="text-gray-300">Recomendaciones de suplementos</span>
              </div>
            </div>
          </div>

          {/* Requisitos personalizados */}
          <div className="mt-6">
            <label className="text-white font-medium mb-2 block">
              Requisitos Específicos (Opcional)
            </label>
            <Textarea
              placeholder="Ej: Evitar lácteos, preferir comidas rápidas de preparar, incluir más pescado, etc."
              value={customRequirements}
              onChange={(e) => setCustomRequirements(e.target.value)}
              className="bg-white/5 border-white/10 text-white min-h-[100px]"
            />
          </div>
        </CardContent>
      </Card>

      {/* Botón de generación */}
      <Card className="bg-neutral-900/70 border-white/10 ring-1 ring-white/5">
        <CardContent className="pt-6">
          <Button
            onClick={generateNutritionPlan}
            disabled={isGenerating}
            className="w-full bg-yellow-400 hover:bg-yellow-500 text-black font-semibold py-3 text-lg"
          >
            {isGenerating ? (
              <>
                <Loader2 className="animate-spin mr-2" size={20} />
                Generando plan nutricional...
              </>
            ) : (
              <>
                <Sparkles className="mr-2" size={20} />
                Generar Plan Nutricional con IA
              </>
            )}
          </Button>
          
          <div className="mt-4 text-center text-sm text-gray-400">
            La IA analizará tu perfil, rutina y objetivos para crear un plan personalizado
          </div>
        </CardContent>
      </Card>

      {/* Prompt generado (para desarrollo/debug) - Solo si userData está cargado */}
      {import.meta.env.DEV && userData && userData.peso && userData.altura && (
        <Card className="bg-neutral-900/70 border-white/10 ring-1 ring-white/5">
          <CardHeader>
            <CardTitle className="text-white text-sm flex items-center gap-2">
              <AlertCircle size={16} className="text-blue-400" />
              Prompt Generado (Debug - Solo Desarrollo)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs text-gray-300 whitespace-pre-wrap bg-white/5 border border-white/10 p-3 rounded overflow-auto max-h-64">
              {getPersonalizedPrompt()}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Plan generado */}
      {generatedPlan && (
        <Card className="bg-neutral-900/70 border-white/10 ring-1 ring-white/5">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <CheckCircle className="text-green-400" size={20} />
              Plan Nutricional Generado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Resumen del plan */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                <div className="text-center">
                  <Calendar className="mx-auto text-green-400 mb-2" size={24} />
                  <div className="text-lg font-bold text-green-400">
                    {selectedOptions.duration} días
                  </div>
                  <div className="text-sm text-gray-300">Duración</div>
                </div>
                <div className="text-center">
                  <Utensils className="mx-auto text-blue-400 mb-2" size={24} />
                  <div className="text-lg font-bold text-blue-400">
                    {selectedOptions.mealCount} comidas
                  </div>
                  <div className="text-sm text-gray-300">Por día</div>
                </div>
                <div className="text-center">
                  <Target className="mx-auto text-yellow-400 mb-2" size={24} />
                  <div className="text-lg font-bold text-yellow-400">
                    {userMacros?.calories || '2000'} kcal
                  </div>
                  <div className="text-sm text-gray-300">Objetivo diario</div>
                </div>
              </div>

              {/* Acciones del plan */}
              <div className="flex flex-wrap gap-3">
                <Button
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={() => {
                    // TODO: Navegar al calendario con el plan generado
                  }}
                >
                  <Calendar size={16} className="mr-2" />
                  Ver en Calendario
                </Button>
                <Button
                  variant="outline"
                  className="border-white/10 bg-white/5 text-white hover:bg-white/10"
                  onClick={() => {
                    // TODO: Descargar plan como PDF
                  }}
                >
                  Descargar PDF
                </Button>
                <Button
                  variant="outline"
                  className="border-white/10 bg-white/5 text-white hover:bg-white/10"
                  onClick={() => {
                    // TODO: Generar lista de compras
                  }}
                >
                  Lista de Compras
                </Button>
              </div>

              {/* Vista previa del contenido */}
              <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                <h4 className="text-white font-semibold mb-2">Vista Previa del Plan:</h4>
                <div className="text-sm text-gray-300 space-y-2">
                  <div>✓ Plan de {selectedOptions.duration} días personalizado</div>
                  <div>✓ {selectedOptions.mealCount} comidas diarias balanceadas</div>
                  <div>✓ Recetas detalladas con ingredientes y cantidades</div>
                  <div>✓ Horarios optimizados para tu entrenamiento</div>
                  <div>✓ Lista de compras organizada por categorías</div>
                  {selectedOptions.includeSupplements && (
                    <div>✓ Recomendaciones de suplementos personalizadas</div>
                  )}
                  <div>✓ Tips de preparación y almacenamiento</div>
                  <div>✓ Alternativas para cada comida</div>
                </div>
              </div>

              <div className="flex items-start gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                <AlertCircle className="text-yellow-400 mt-0.5 flex-shrink-0" size={16} />
                <div className="text-sm text-yellow-300">
                  <strong>Nota:</strong> Este plan es una recomendación basada en IA. Consulta con un profesional de la nutrición para planes específicos o si tienes condiciones médicas particulares.
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}