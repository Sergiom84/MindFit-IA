// Utilidades para logging detallado de datos enviados a IA
import util from 'util';

// Colores para la consola
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m'
};

const logSeparator = (title = 'AI REQUEST', color = 'cyan') => {
  const separator = '='.repeat(80);
  console.log(colors[color] + colors.bright + separator + colors.reset);
  console.log(colors[color] + colors.bright + `📊 ${title.toUpperCase()}` + colors.reset);
  console.log(colors[color] + colors.bright + separator + colors.reset);
};

const logSubSection = (title, color = 'yellow') => {
  console.log(colors[color] + colors.bright + `\n🔹 ${title}` + colors.reset);
  console.log(colors[color] + '-'.repeat(50) + colors.reset);
};

const logObject = (obj, maxDepth = 3) => {
  console.log(util.inspect(obj, {
    colors: true,
    depth: maxDepth,
    compact: false,
    breakLength: 80
  }));
};

const logUserProfile = (user, userId) => {
  logSubSection('PERFIL DEL USUARIO', 'green');
  console.log(colors.green + `👤 Usuario ID: ${userId}` + colors.reset);
  
  if (user) {
    const userInfo = {
      'Datos Básicos': {
        edad: user.edad || 'No especificado',
        peso: user.peso_kg ? `${user.peso_kg} kg` : (user.peso ? `${user.peso} kg` : 'No especificado'),
        altura: user.altura_cm ? `${user.altura_cm} cm` : (user.altura ? `${user.altura} cm` : 'No especificado'),
        sexo: user.sexo || 'No especificado'
      },
      'Entrenamiento': {
        // Usar 'nivel' que es el campo que viene de la vista (COALESCE de nivel_actividad y nivel_entrenamiento)
        nivel_actividad: user.nivel || user.nivel_actividad || 'No especificado',
        nivel_entrenamiento: user.nivel_entrenamiento || user.nivel || 'No especificado',
        años_entrenando: user.anos_entrenando || user.años_entrenando || 'No especificado',
        objetivo_principal: user.objetivo_principal || 'No especificado'
      },
      'Composición Corporal': {
        grasa_corporal: user.grasa_corporal || 'No especificado',
        masa_magra: user.masa_magra || 'No especificado',
        pecho: user.pecho || 'No especificado',
        brazos: user.brazos || 'No especificado'
      },
      'Otros': {
        suplementacion: Array.isArray(user.suplementacion) ? user.suplementacion.join(', ') : (user.suplementacion || 'Ninguna'),
        medicamentos: Array.isArray(user.medicamentos) ? user.medicamentos.filter(med => med && med.trim()).join(', ') : (user.medicamentos || 'Ninguno'),
        alergias: user.alergias || 'Ninguna',
        limitaciones_fisicas: Array.isArray(user.limitaciones_fisicas) ? user.limitaciones_fisicas.join(', ') : (user.limitaciones_fisicas || 'Ninguna')
      }
    };
    
    logObject(userInfo, 2);
  } else {
    console.log(colors.red + '❌ No se encontraron datos del usuario' + colors.reset);
  }
};

const logRecentExercises = (exercises) => {
  logSubSection('EJERCICIOS RECIENTES (Para evitar repetición)', 'magenta');
  
  if (exercises && exercises.length > 0) {
    console.log(colors.magenta + `📋 Total de ejercicios recientes: ${exercises.length}` + colors.reset);
    
    exercises.forEach((ex, index) => {
      const exerciseName = ex.exercise_name || ex.nombre || 'Sin nombre';
      
      // Verificar si es del historial agregado o ejercicio individual
      if (ex.usage_count && ex.last_used) {
        // Ejercicio del historial agregado
        const lastUsed = new Date(ex.last_used).toLocaleDateString('es-ES');
        const usageCount = ex.usage_count;
        const avgReps = ex.avg_reps ? Math.round(ex.avg_reps) : null;
        const avgSeries = ex.avg_series ? Math.round(ex.avg_series) : null;
        const avgLoad = ex.avg_load ? Math.round(ex.avg_load * 10) / 10 : null;
        
        let avgInfo = [];
        if (avgReps) avgInfo.push(`${avgReps} reps`);
        if (avgSeries) avgInfo.push(`${avgSeries} series`);
        if (avgLoad) avgInfo.push(`${avgLoad}kg`);
        
        console.log(colors.magenta + `${index + 1}. ${exerciseName}` + colors.reset);
        console.log(colors.dim + `   Usado ${usageCount} veces - Último: ${lastUsed}${avgInfo.length > 0 ? ` - Promedio: ${avgInfo.join(', ')}` : ''}` + colors.reset);
      } else if (ex.category || ex.difficulty_level) {
        // Ejercicio del catálogo
        const category = ex.category || 'General';
        const difficulty = ex.difficulty_level || 'Estándar';
        
        console.log(colors.magenta + `${index + 1}. ${exerciseName}` + colors.reset);
        console.log(colors.dim + `   Categoría: ${category} - Dificultad: ${difficulty}` + colors.reset);
      } else {
        // Ejercicio individual (formato anterior)
        const lastUsed = ex.created_at ? new Date(ex.created_at).toLocaleDateString('es-ES') : 'Sin fecha';
        const repsInfo = ex.reps ? `${ex.reps} reps` : '';
        const seriesInfo = ex.series ? `${ex.series} series` : '';
        const loadInfo = ex.load_kg ? `${ex.load_kg}kg` : '';
        
        console.log(colors.magenta + `${index + 1}. ${exerciseName}` + colors.reset);
        console.log(colors.dim + `   Último uso: ${lastUsed} - ${[repsInfo, seriesInfo, loadInfo].filter(Boolean).join(', ')}` + colors.reset);
      }
    });
    
    console.log(colors.yellow + '\n⚠️  La IA evitará usar estos ejercicios prioritariamente' + colors.reset);
  } else {
    console.log(colors.green + '✅ No hay ejercicios recientes - La IA tendrá libertad total' + colors.reset);
  }
};

const logAIPayload = (methodology, userData) => {
  logSubSection('PAYLOAD COMPLETO ENVIADO A LA IA', 'blue');

  console.log(colors.blue + `🎯 Metodología solicitada: ${methodology}` + colors.reset);

  if (userData) {
    try {
      console.log(colors.blue + `📊 Tamaño del payload: ${JSON.stringify(userData).length} caracteres` + colors.reset);
    } catch (e) {
      console.log(colors.blue + `📊 Tamaño del payload: No se pudo calcular (${e.message})` + colors.reset);
    }

    // 🎯 OPTIMIZACIÓN: Mostrar solo estructura resumida, no el objeto completo
    console.log(colors.blue + '\n📦 Keys del payload:' + colors.reset);
    console.log(colors.dim + `   ${Object.keys(userData).join(', ')}` + colors.reset);

    // Mostrar info específica útil
    if (userData.available_exercises) {
      console.log(colors.blue + `💪 Ejercicios disponibles: ${userData.available_exercises.length} ejercicios` + colors.reset);
    }

    if (userData.selected_level) {
      console.log(colors.blue + `🎯 Nivel seleccionado: ${userData.selected_level}` + colors.reset);
    }

    if (userData.plan_requirements) {
      const req = userData.plan_requirements;
      console.log(colors.blue + `📋 Plan: ${req.duration_weeks || 4} semanas, ${req.sessions_per_week || 3} sesiones/semana, ${req.session_duration_min || 30}min` + colors.reset);
    }
  } else {
    console.log(colors.red + '❌ No se recibieron datos del usuario para la IA' + colors.reset);
  }
};

const logAIResponse = (response) => {
  logSubSection('RESPUESTA DE LA IA', 'green');

  try {
    const planData = typeof response === 'string' ? JSON.parse(response) : response;

    // 🎯 OPTIMIZACIÓN: Detectar tipo de respuesta (evaluación vs generación)
    const isEvaluation = planData.recommended_level || planData.confidence;

    if (isEvaluation) {
      // LOGGING PARA EVALUACIÓN
      console.log(colors.green + `🎯 Nivel recomendado: ${planData.recommended_level || 'No especificado'}` + colors.reset);
      console.log(colors.green + `📊 Confianza: ${planData.confidence ? (planData.confidence * 100).toFixed(0) + '%' : 'N/A'}` + colors.reset);

      if (planData.reasoning) {
        console.log(colors.dim + `💭 Razón: ${planData.reasoning.substring(0, 100)}...` + colors.reset);
      }

      if (planData.suggested_focus_areas && planData.suggested_focus_areas.length > 0) {
        console.log(colors.yellow + `🎯 Áreas de enfoque: ${planData.suggested_focus_areas.join(', ')}` + colors.reset);
      }
    } else {
      // LOGGING PARA GENERACIÓN DE PLAN
      console.log(colors.green + `✅ Metodología: ${planData.selected_style || 'No especificado'}` + colors.reset);
      console.log(colors.green + `📅 Duración: ${planData.duracion_total_semanas || 'No especificado'} semanas` + colors.reset);
      console.log(colors.green + `🔄 Frecuencia: ${planData.frecuencia_por_semana || 'No especificado'} días/semana` + colors.reset);

      // 🎯 OPTIMIZACIÓN: Resumen comprimido del plan (en lugar de mostrar TODO)
      if (planData.semanas && planData.semanas.length > 0) {
        console.log(colors.green + `\n📊 RESUMEN DEL PLAN:` + colors.reset);

        // Calcular totales
        let totalSessions = 0;
        let totalExercises = 0;
        const sessionDays = [];

        planData.semanas.forEach((semana) => {
          if (semana.sesiones && semana.sesiones.length > 0) {
            totalSessions += semana.sesiones.length;

            semana.sesiones.forEach((sesion) => {
              if (sesion.ejercicios) {
                totalExercises += sesion.ejercicios.length;
              }
              // Recoger días de la primera semana como ejemplo
              if (semana.semana === 1 && !sessionDays.includes(sesion.dia)) {
                sessionDays.push(sesion.dia);
              }
            });
          }
        });

        console.log(colors.cyan + `📈 Total: ${totalSessions} sesiones, ${totalExercises} ejercicios` + colors.reset);
        console.log(colors.cyan + `🗓️ Patrón semanal: ${sessionDays.join(', ')}` + colors.reset);

        // Mostrar solo primera sesión como muestra
        if (planData.semanas[0] && planData.semanas[0].sesiones && planData.semanas[0].sesiones[0]) {
          const primeraSession = planData.semanas[0].sesiones[0];
          const ejerciciosCount = primeraSession.ejercicios ? primeraSession.ejercicios.length : 0;

          console.log(colors.yellow + `\n📍 Ejemplo (Semana 1, ${primeraSession.dia}):` + colors.reset);
          console.log(colors.dim + `   Duración: ${primeraSession.duracion_sesion_min || 'N/A'}min` + colors.reset);
          console.log(colors.dim + `   Ejercicios: ${ejerciciosCount}` + colors.reset);

          // Mostrar solo los nombres de los ejercicios, no todo el detalle
          if (primeraSession.ejercicios && primeraSession.ejercicios.length > 0) {
            const ejerciciosNombres = primeraSession.ejercicios.map(ej => ej.nombre).join(', ');
            console.log(colors.dim + `   (${ejerciciosNombres})` + colors.reset);
          }
        }
      }
    }

    // Consideraciones y safety notes (mantener)
    if (planData.consideraciones) {
      console.log(colors.yellow + '\n⚠️  CONSIDERACIONES:' + colors.reset);
      console.log(colors.yellow + planData.consideraciones + colors.reset);
    }

    if (planData.safety_notes) {
      console.log(colors.red + '\n🚨 NOTAS DE SEGURIDAD:' + colors.reset);
      console.log(colors.red + planData.safety_notes + colors.reset);
    }

  } catch (error) {
    console.log(colors.red + '❌ Error parseando respuesta de IA:' + colors.reset);
    console.log(colors.red + error.message + colors.reset);
    console.log(colors.dim + 'Respuesta raw (primeros 500 chars):' + colors.reset);
    console.log(colors.dim + (typeof response === 'string' ? response.substring(0, 500) : JSON.stringify(response).substring(0, 500)) + colors.reset);
  }
};

const logError = (error, context = '') => {
  logSubSection(`ERROR ${context}`, 'red');
  console.log(colors.red + colors.bright + '❌ ' + error.message + colors.reset);
  if (error.stack) {
    console.log(colors.red + colors.dim + error.stack + colors.reset);
  }
};

const logAPICall = (endpoint, method, userId) => {
  const timestamp = new Date().toISOString();
  console.log(colors.cyan + `\n🌐 ${method} ${endpoint} - Usuario: ${userId} - ${timestamp}` + colors.reset);
};

const logTokens = (response) => {
  if (response && response.usage) {
    logSubSection('CONSUMO DE TOKENS', 'magenta');
    console.log(colors.magenta + `📊 Tokens prompt: ${response.usage.prompt_tokens || 'N/A'}` + colors.reset);
    console.log(colors.magenta + `📊 Tokens completión: ${response.usage.completion_tokens || 'N/A'}` + colors.reset);
    console.log(colors.magenta + `📊 Tokens totales: ${response.usage.total_tokens || 'N/A'}` + colors.reset);
  }
};

export {
  logSeparator,
  logSubSection,
  logObject,
  logUserProfile,
  logRecentExercises,
  logAIPayload,
  logAIResponse,
  logError,
  logAPICall,
  logTokens,
  colors
};
