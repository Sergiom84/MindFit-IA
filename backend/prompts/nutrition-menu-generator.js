/**
 * Prompt para generación de menús nutricionales con IA
 * Sistema determinista: Los macros están PRE-CALCULADOS
 * La IA solo genera los menús específicos usando el catálogo
 */
import { isTrainingDay } from '../services/trainingLoad/dayType.js';

export const nutritionMenuGeneratorPrompt = ({
  meal,
  dayInfo,
  userPreferences,
  availableFoods
}) => {
  const { nombre, kcal, macros, orden, timing_note } = meal;
  const { tipo_dia } = dayInfo;
  const { preferencias = {}, alergias = [] } = userPreferences;
  const foodCatalogLines = availableFoods.map((food) => {
    const rawMacros = food.macros_100g;
    const parsedMacros = typeof rawMacros === 'string' ? JSON.parse(rawMacros) : (rawMacros || {});
    const estadoBase = food.estado_pesado_base || 'tal_cual';
    const estadoMostrado = food.estado_pesado_mostrado_default || estadoBase;
    const grupoFactor = food.grupo_factor ? `, grupo_factor: ${food.grupo_factor}` : '';
    const categoriaDetalle = food.categoria_detalle ? `/${food.categoria_detalle}` : '';

    return `- ${food.nombre} (${food.categoria}${categoriaDetalle}) [estado_base: ${estadoBase}, estado_mostrado_default: ${estadoMostrado}${grupoFactor}]: ${parsedMacros.protein_g ?? 0}g P, ${parsedMacros.carbs_g ?? 0}g C, ${parsedMacros.fat_g ?? 0}g G, ${parsedMacros.kcal ?? 0} kcal/100g`;
  }).join('\n');

  return `Eres un nutricionista deportivo experto. Tu tarea es generar un menú específico para una comida PRE-CALCULADA.

## DATOS DE LA COMIDA (YA CALCULADOS):
- Comida: ${nombre} (${orden === 1 ? 'Desayuno' : orden === 2 ? 'Almuerzo' : orden === 3 ? 'Comida' : orden === 4 ? 'Merienda' : orden === 5 ? 'Cena' : 'Snack'})
- Calorías objetivo: ${kcal} kcal
- Macros objetivo:
  * Proteína: ${macros.protein_g}g
  * Carbohidratos: ${macros.carbs_g}g
  * Grasas: ${macros.fat_g}g
${timing_note ? `- Timing: ${timing_note}` : ''}
${isTrainingDay(tipo_dia) ? '- Es un DÍA DE ENTRENAMIENTO (carb cycling aplicado)' : '- Es un DÍA DE DESCANSO'}

## RESTRICCIONES DEL USUARIO:
${preferencias.vegetariano ? '- VEGETARIANO (sin carne ni pescado)' : ''}
${preferencias.vegano ? '- VEGANO (sin productos animales)' : ''}
${preferencias.sin_gluten ? '- SIN GLUTEN' : ''}
${preferencias.sin_lactosa ? '- SIN LACTOSA' : ''}
${alergias.length > 0 ? `- ALERGIAS: ${alergias.join(', ')}` : ''}

## CATÁLOGO DE ALIMENTOS DISPONIBLES:
${foodCatalogLines}

## INSTRUCCIONES CRÍTICAS:
1. **VALIDACIÓN DE MACROS**: Los macros del menú generado DEBEN coincidir con los objetivos con ±2% de margen
2. **USA SOLO ALIMENTOS DEL CATÁLOGO**: No inventes alimentos que no están en la lista
3. **RESPETA RESTRICCIONES**: Filtra alimentos según preferencias y alergias
4. **CANTIDADES EXACTAS**: Calcula gramos exactos de cada alimento para cumplir macros
5. **TIMING ADECUADO**: Si es post-entreno, prioriza proteína + carbohidratos de rápida absorción
6. **ESTADO DE PESADO**: Respeta \`estado_mostrado_default\` del catálogo y no inventes estados

## FORMATO DE RESPUESTA (JSON):
Debes responder ÚNICAMENTE con un JSON válido en este formato:

{
  "items": [
    {
      "alimento_nombre": "nombre exacto del catálogo",
      "cantidad_g": número,
      "kcal": número,
      "macros": {
        "protein_g": número,
        "carbs_g": número,
        "fat_g": número
      }
    }
  ],
  "instrucciones": "Breve descripción de preparación (opcional)",
  "notas": "Notas adicionales sobre el menú",
  "validacion": {
    "kcal_total": número,
    "macros_totales": {
      "protein_g": número,
      "carbs_g": número,
      "fat_g": número
    },
    "error_kcal_porcentaje": número,
    "error_protein_porcentaje": número,
    "error_carbs_porcentaje": número,
    "error_fat_porcentaje": número
  }
}

## EJEMPLO DE RESPUESTA VÁLIDA:
{
  "items": [
    {
      "alimento_nombre": "Pechuga de pollo",
      "cantidad_g": 150,
      "kcal": 248,
      "macros": {
        "protein_g": 46.5,
        "carbs_g": 0,
        "fat_g": 5.4
      }
    },
    {
      "alimento_nombre": "Arroz blanco cocido",
      "cantidad_g": 200,
      "kcal": 260,
      "macros": {
        "protein_g": 5.4,
        "carbs_g": 56,
        "fat_g": 0.6
      }
    },
    {
      "alimento_nombre": "Brócoli",
      "cantidad_g": 100,
      "kcal": 34,
      "macros": {
        "protein_g": 2.8,
        "carbs_g": 7,
        "fat_g": 0.4
      }
    },
    {
      "alimento_nombre": "Aceite de oliva virgen extra",
      "cantidad_g": 10,
      "kcal": 88,
      "macros": {
        "protein_g": 0,
        "carbs_g": 0,
        "fat_g": 10
      }
    }
  ],
  "instrucciones": "Cocinar el pollo a la plancha, hervir el arroz y el brócoli al vapor. Aliñar con aceite de oliva.",
  "notas": "Comida post-entreno ideal con proteína de calidad y carbohidratos para recuperación",
  "validacion": {
    "kcal_total": 630,
    "macros_totales": {
      "protein_g": 54.7,
      "carbs_g": 63,
      "fat_g": 16.4
    },
    "error_kcal_porcentaje": 0.5,
    "error_protein_porcentaje": 1.2,
    "error_carbs_porcentaje": 0.8,
    "error_fat_porcentaje": 1.5
  }
}

## VERIFICACIONES FINALES:
- ✅ Todos los alimentos están en el catálogo
- ✅ Se respetan las restricciones dietéticas
- ✅ Los macros totales cumplen con ±2% de margen
- ✅ Las cantidades son realistas y prácticas
- ✅ El menú es variado y apetecible

GENERA EL MENÚ AHORA:`;
};

export default nutritionMenuGeneratorPrompt;
