/**
 * Rutas de home-training - dominio: exerciseInfo (extraidas del monolito).
 */

import express from 'express';
import {
  pool
} from '../../db.js';
import authenticateToken from '../../middleware/auth.js';
import {
  getOpenAIClient
} from '../../lib/openaiClient.js';
import {
  findExerciseInTables,
  saveExerciseInfoToTable
} from './_helpers.js';

const router = express.Router();


// ===============================================
// 🤖 ENDPOINT DE INFORMACIÓN DE EJERCICIOS CON IA
// ===============================================

/**
 * POST /api/ia-home-training/exercise-info
 * Obtiene información detallada de un ejercicio usando IA con cache en BD
 * NUEVO: Busca primero en tablas de metodologías específicas
 */
router.post('/exercise-info', authenticateToken, async (req, res) => {
  try {
    const { exerciseName } = req.body;
    const user_id = req.user.userId || req.user.id;

    if (!exerciseName) {
      return res.status(400).json({
        success: false,
        error: 'Se requiere el nombre del ejercicio'
      });
    }

    // Normalizar nombre del ejercicio para búsqueda
    const normalizedName = exerciseName.toLowerCase().trim();

    console.log(`🔍 Buscando información para ejercicio: ${exerciseName}`);

    // 1. BUSCAR PRIMERO EN TABLAS DE METODOLOGÍAS ESPECÍFICAS
    const exerciseLocation = await findExerciseInTables(exerciseName);

    if (exerciseLocation.found && exerciseLocation.hasCache) {
      // ✅ ENCONTRADO EN TABLA ESPECÍFICA CON CACHE
      console.log(`💾 Cache HIT en ${exerciseLocation.table} para: ${exerciseName}`);

      return res.json({
        success: true,
        exerciseInfo: exerciseLocation.cacheData,
        source: 'specific_table',
        table_name: exerciseLocation.table,
        cached: true
      });
    }

    // 2. SI EXISTE EN TABLA ESPECÍFICA PERO SIN CACHE → Generar y guardar ahí
    // 3. SI NO EXISTE EN NINGUNA TABLA → Buscar en exercise_ai_info (fallback)

    if (!exerciseLocation.found) {
      // Buscar en tabla genérica (exercise_ai_info) como fallback
      const cacheResult = await pool.query(
        `SELECT ejecucion, consejos, errores_evitar, request_count, ai_model_used, created_at
         FROM app.exercise_ai_info
         WHERE exercise_name_normalized = $1 OR exercise_name = $2
         LIMIT 1`,
        [normalizedName, exerciseName]
      );

      if (cacheResult.rows.length > 0) {
        const cachedInfo = cacheResult.rows[0];

        await pool.query(
          `UPDATE app.exercise_ai_info
           SET request_count = request_count + 1,
               last_updated = NOW()
           WHERE exercise_name_normalized = $1 OR exercise_name = $2`,
          [normalizedName, exerciseName]
        );

        console.log(`💾 Cache HIT en exercise_ai_info (genérica) para ${exerciseName}`);

        return res.json({
          success: true,
          exerciseInfo: {
            ejecucion: cachedInfo.ejecucion,
            consejos: cachedInfo.consejos,
            errores_evitar: cachedInfo.errores_evitar
          },
          source: 'generic_cache',
          cached_at: cachedInfo.created_at,
          model_used: cachedInfo.ai_model_used
        });
      }
    }

    // 4. NO ENCONTRADO EN NINGÚN CACHE - GENERAR CON IA
    const cacheTarget = exerciseLocation.found ? exerciseLocation.table : 'exercise_ai_info';
    console.log(`🤖 Cache MISS - Generando información para: ${exerciseName} → guardará en ${cacheTarget}`);

    // Prompt específico para información de ejercicios
    const exerciseInfoPrompt = `Eres un experto entrenador personal y biomecánico. Te voy a dar el nombre de un ejercicio y necesito que me proporciones información detallada sobre él.

Ejercicio: "${exerciseName}"

Proporciona una respuesta en formato JSON con la siguiente estructura exacta:
{
  "ejecucion": "Explicación paso a paso de cómo ejecutar correctamente el ejercicio",
  "consejos": "Consejos específicos para mejorar la técnica y maximizar los beneficios",
  "errores_evitar": "Errores comunes que deben evitarse al realizar este ejercicio"
}

Instrucciones importantes:
- Sé específico y técnico en las explicaciones
- Cada sección debe tener entre 100-200 palabras
- Usa un lenguaje claro y profesional
- Si el ejercicio no existe o no lo conoces, indica alternativas similares
- Responde ÚNICAMENTE con el JSON, sin texto adicional`;

    try {
      // Obtener cliente OpenAI para home training
      const openai = getOpenAIClient('home');
      const model = "gpt-4o-mini";

      const startTime = Date.now();
      const completion = await openai.chat.completions.create({
        model: model,
        messages: [
          {
            role: "system",
            content: exerciseInfoPrompt
          }
        ],
        temperature: 0.7,
        max_tokens: 1000
      });

      const aiResponse = completion.choices[0]?.message?.content;
      const tokensUsed = completion.usage?.total_tokens || 0;
      const responseTime = Date.now() - startTime;

      if (!aiResponse) {
        throw new Error('No se recibió respuesta de OpenAI');
      }

      // Limpiar respuesta de IA (puede venir con ```json...``` markdown)
      let cleanedResponse = aiResponse.trim();

      // Eliminar bloques de código markdown si existen
      const blockMatch = cleanedResponse.match(/```json\s*([\s\S]*?)```/i) || cleanedResponse.match(/```\s*([\s\S]*?)```/i);
      if (blockMatch && blockMatch[1]) {
        cleanedResponse = blockMatch[1].trim();
      }

      // Extraer solo el objeto JSON (buscar primera { y última })
      const firstBrace = cleanedResponse.indexOf('{');
      const lastBrace = cleanedResponse.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1) {
        cleanedResponse = cleanedResponse.slice(firstBrace, lastBrace + 1);
      }

      // Intentar parsear la respuesta JSON limpia
      let exerciseInfo;
      try {
        exerciseInfo = JSON.parse(cleanedResponse);
      } catch (parseError) {
        console.error('Error parseando respuesta de IA:', parseError);
        console.error('Respuesta recibida:', cleanedResponse.slice(0, 500));
        throw new Error('Respuesta de IA no válida');
      }

      // Validar que la respuesta tenga la estructura esperada
      if (!exerciseInfo.ejecucion || !exerciseInfo.consejos || !exerciseInfo.errores_evitar) {
        throw new Error('Respuesta de IA incompleta');
      }

      // 3. GUARDAR EN CACHE (tabla específica o genérica según corresponda)
      const estimatedCost = (tokensUsed / 1000) * 0.0015; // Estimación para gpt-4o-mini

      try {
        if (exerciseLocation.found) {
          // ✅ GUARDAR EN TABLA ESPECÍFICA (el ejercicio existe en una metodología)
          const saved = await saveExerciseInfoToTable(
            exerciseLocation.table,
            exerciseName,
            exerciseInfo,
            exerciseLocation.disciplina
          );

          if (saved) {
            console.log(`💾 Información guardada en ${exerciseLocation.table} para: ${exerciseName} (${tokensUsed} tokens, ~$${estimatedCost.toFixed(4)})`);
          } else {
            console.warn(`⚠️ No se pudo guardar en ${exerciseLocation.table}, intentando con cache genérica...`);
            // Fallback: intentar guardar en tabla genérica si falla el guardado específico
            await pool.query(
              `INSERT INTO app.exercise_ai_info
               (exercise_name, exercise_name_normalized, ejecucion, consejos, errores_evitar,
                first_requested_by, ai_model_used, tokens_used, generation_cost, created_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
               ON CONFLICT (exercise_name) DO UPDATE SET
                 request_count = app.exercise_ai_info.request_count + 1,
                 last_updated = NOW()`,
              [exerciseName, normalizedName, exerciseInfo.ejecucion, exerciseInfo.consejos,
               exerciseInfo.errores_evitar, user_id, model, tokensUsed, estimatedCost]
            );
            console.log(`💾 Información guardada en cache genérica (fallback) para: ${exerciseName}`);
          }
        } else {
          // ❌ NO EXISTE EN NINGUNA TABLA → GUARDAR EN CACHE GENÉRICA (exercise_ai_info)
          await pool.query(
            `INSERT INTO app.exercise_ai_info
             (exercise_name, exercise_name_normalized, ejecucion, consejos, errores_evitar,
              first_requested_by, ai_model_used, tokens_used, generation_cost, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
             ON CONFLICT (exercise_name) DO UPDATE SET
               request_count = app.exercise_ai_info.request_count + 1,
               last_updated = NOW()`,
            [
              exerciseName,
              normalizedName,
              exerciseInfo.ejecucion,
              exerciseInfo.consejos,
              exerciseInfo.errores_evitar,
              user_id,
              model,
              tokensUsed,
              estimatedCost
            ]
          );

          console.log(`💾 Información guardada en cache genérica para: ${exerciseName} (${tokensUsed} tokens, ~$${estimatedCost.toFixed(4)})`);
        }
      } catch (cacheError) {
        console.warn('⚠️ Error guardando en cache (no crítico):', cacheError.message);
      }

      console.log(`✅ Información generada exitosamente para: ${exerciseName} (${responseTime}ms)`);

      res.json({
        success: true,
        exerciseInfo: {
          ejecucion: exerciseInfo.ejecucion,
          consejos: exerciseInfo.consejos,
          errores_evitar: exerciseInfo.errores_evitar
        },
        source: 'ai_generated',
        tokens_used: tokensUsed,
        model_used: model,
        response_time_ms: responseTime
      });

    } catch (aiError) {
      console.error('Error llamando a OpenAI:', aiError);

      // Respuesta de fallback en caso de error de IA
      res.json({
        success: true,
        exerciseInfo: {
          ejecucion: `Para realizar ${exerciseName} correctamente, asegúrate de mantener una postura adecuada y realizar el movimiento de forma controlada. Consulta con un entrenador para obtener instrucciones específicas.`,
          consejos: `Concéntrate en la técnica antes que en la intensidad. Realiza el ejercicio lentamente al principio para dominar la forma correcta.`,
          errores_evitar: `Evita realizar movimientos bruscos, no mantener la postura correcta, y no calentar adecuadamente antes del ejercicio.`
        },
        source: 'fallback'
      });
    }

  } catch (error) {
    console.error('Error en endpoint exercise-info:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor al obtener información del ejercicio'
    });
  }
});


// ===============================================
// 📊 ENDPOINT DE ESTADÍSTICAS Y ADMINISTRACIÓN DE CACHE
// ===============================================

/**
 * GET /api/ia-home-training/exercise-info/stats
 * Obtiene estadísticas del cache de información de ejercicios
 */
router.get('/exercise-info/stats', authenticateToken, async (req, res) => {
  try {
    console.log('📊 Obteniendo estadísticas del cache de ejercicios...');

    // Estadísticas generales
    const generalStats = await pool.query(`
      SELECT
        COUNT(*) as total_exercises,
        SUM(request_count) as total_requests,
        SUM(tokens_used) as total_tokens,
        SUM(generation_cost) as total_cost,
        COUNT(*) FILTER (WHERE is_verified = true) as verified_count,
        MAX(request_count) as max_requests,
        MIN(created_at) as first_exercise_date,
        MAX(last_updated) as last_request_date
      FROM app.exercise_ai_info
    `);

    // Top ejercicios más solicitados
    const topRequested = await pool.query(`
      SELECT
        exercise_name,
        request_count,
        ai_model_used,
        created_at,
        last_updated
      FROM app.exercise_ai_info
      ORDER BY request_count DESC, last_updated DESC
      LIMIT 10
    `);

    // Ejercicios recientes
    const recentExercises = await pool.query(`
      SELECT
        exercise_name,
        request_count,
        ai_model_used,
        created_at
      FROM app.exercise_ai_info
      ORDER BY created_at DESC
      LIMIT 5
    `);

    // Distribución por modelo de IA
    const modelDistribution = await pool.query(`
      SELECT
        ai_model_used,
        COUNT(*) as exercise_count,
        SUM(tokens_used) as total_tokens,
        SUM(generation_cost) as total_cost
      FROM app.exercise_ai_info
      GROUP BY ai_model_used
      ORDER BY exercise_count DESC
    `);

    const stats = generalStats.rows[0];

    res.json({
      success: true,
      stats: {
        general: {
          total_exercises: parseInt(stats.total_exercises),
          total_requests: parseInt(stats.total_requests || 0),
          total_tokens: parseInt(stats.total_tokens || 0),
          total_cost: parseFloat(stats.total_cost || 0),
          verified_count: parseInt(stats.verified_count || 0),
          max_requests: parseInt(stats.max_requests || 0),
          first_exercise_date: stats.first_exercise_date,
          last_request_date: stats.last_request_date,
          cache_efficiency: stats.total_requests > stats.total_exercises
            ? ((stats.total_requests - stats.total_exercises) / stats.total_requests * 100).toFixed(1) + '%'
            : '0%'
        },
        top_requested: topRequested.rows,
        recent_exercises: recentExercises.rows,
        model_distribution: modelDistribution.rows
      }
    });

  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener estadísticas del cache de ejercicios'
    });
  }
});


/**
 * PUT /api/ia-home-training/exercise-info/:exerciseId/verify
 * Marcar información de ejercicio como verificada
 */
router.put('/exercise-info/:exerciseId/verify', authenticateToken, async (req, res) => {
  try {
    const { exerciseId } = req.params;
    const { verified = true } = req.body;

    const result = await pool.query(
      `UPDATE app.exercise_ai_info
       SET is_verified = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING exercise_name, is_verified`,
      [verified, exerciseId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Ejercicio no encontrado'
      });
    }

    const exercise = result.rows[0];

    res.json({
      success: true,
      message: `Ejercicio "${exercise.exercise_name}" ${exercise.is_verified ? 'verificado' : 'marcado como no verificado'}`,
      exercise: exercise
    });

  } catch (error) {
    console.error('Error verificando ejercicio:', error);
    res.status(500).json({
      success: false,
      error: 'Error al verificar información del ejercicio'
    });
  }
});

export default router;
