import express from 'express';
import multer from 'multer';
import { getOpenAIClient } from '../lib/openaiClient.js';
import { getPrompt, FeatureKey } from '../lib/promptRegistry.js';
import { AI_MODULES } from '../config/aiConfigs.js';
import authenticateToken from '../middleware/auth.js';
import { 
  logSeparator, 
  logUserProfile, 
  logRecentExercises, 
  logAIPayload, 
  logAIResponse, 
  logAPICall, 
  logTokens 
} from '../utils/aiLogger.js';

const router = express.Router();

// Config módulo Photo Correction
const PC_CONFIG = AI_MODULES.PHOTO_CORRECTION;
const MODEL = PC_CONFIG.model;

// Función helper para parsear JSON de manera segura
function safeJSON(v) { 
  try { 
    return v ? JSON.parse(v) : null; 
  } catch { 
    return null; 
  } 
}

// Configuración de multer para subida de fotos
const storage = multer.memoryStorage();
const upload = multer({ 
  storage, 
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten imágenes'), false);
    }
  },
});

// Función para convertir imagen a base64
function imageToBase64(buffer, mimetype) {
  return `data:${mimetype};base64,${buffer.toString('base64')}`;
}

// POST /api/ai-photo-correction/analyze - Análisis de fotos para corrección técnica
router.post('/analyze', authenticateToken, upload.array('photos', 5), async (req, res) => {
  try {
    const { exercise_name, exercise_description, user_context } = req.body;
    const photos = req.files;

    // ====== INICIO DEL LOGGING DETALLADO ======
    logSeparator(`Análisis de Fotos - ${exercise_name || 'Ejercicio no especificado'}`, 'blue');
    logAPICall('/api/ai-photo-correction/analyze', 'POST', 'usuario_foto');

    // Obtener cliente específico para photo correction
    const client = getOpenAIClient("photo");

    if (!photos || photos.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Se requiere al menos una foto para el análisis' 
      });
    }

    if (photos.length > 5) {
      return res.status(400).json({ 
        success: false, 
        error: 'Máximo 5 fotos por análisis' 
      });
    }

    // Preparar contexto del ejercicio
    const exerciseContext = exercise_name || 'Ejercicio no especificado';
    const exerciseDesc = exercise_description || '';
    const userInfo = safeJSON(user_context) || {};
    
    // Log del contexto del usuario (simulando perfil)
    const mockUser = {
      ejercicio: exerciseContext,
      nivel: userInfo.nivel || 'No especificado',
      objetivo: userInfo.objetivo || 'No especificado',
      lesiones: userInfo.lesiones?.join(', ') || 'Ninguna'
    };
    logUserProfile(mockUser, 'usuario_foto');

    // Log de ejercicios recientes (no aplicable para análisis de fotos)
    logRecentExercises([]);
    
    // Obtener system prompt desde archivo y construir mensaje dinámico
    const basePrompt = await getPrompt(FeatureKey.PHOTO);
    const systemMessage = `${basePrompt}

**CONTEXTO DEL ANÁLISIS:**
- Ejercicio: ${exerciseContext}
- Descripción: ${exerciseDesc}
- Información del usuario: ${userInfo.nivel || 'No especificado'} (${userInfo.objetivo || 'objetivo no definido'})
- Lesiones conocidas: ${userInfo.lesiones?.join(', ') || 'Ninguna reportada'}
- Número de fotos: ${photos.length}

**INSTRUCCIONES ESPECÍFICAS:**
Analiza las fotos secuencialmente si muestran diferentes fases del ejercicio, o comparativamente si muestran diferentes ángulos de la misma posición. Enfócate en los aspectos técnicos más importantes para la seguridad y efectividad del ejercicio.`;

    // Preparar imágenes para OpenAI
    const imageMessages = photos.map((photo) => ({
      type: 'image_url',
      image_url: {
        url: imageToBase64(photo.buffer, photo.mimetype),
        detail: 'high'
      }
    }));

    const messages = [
      { role: 'system', content: systemMessage },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Analiza la técnica del ejercicio "${exerciseContext}" en las siguientes fotos. ${exerciseDesc ? `Descripción del ejercicio: ${exerciseDesc}` : ''} 
            
Proporciona un análisis detallado siguiendo el formato JSON especificado.`
          },
          ...imageMessages
        ]
      }
    ];

    // Log del payload completo enviado a la IA
    logAIPayload(exerciseContext, {
      exercise_name: exerciseContext,
      exercise_description: exerciseDesc,
      user_context: userInfo,
      photos_count: photos.length,
      system_message_length: systemMessage.length
    });

    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: messages,
      response_format: { type: 'json_object' },
      temperature: PC_CONFIG.temperature,
      max_tokens: PC_CONFIG.max_output_tokens,
      top_p: PC_CONFIG.top_p
    });

    const content = completion?.choices?.[0]?.message?.content || '{}';
    
    // Log de tokens consumidos
    logTokens(completion);
    
    // Log de la respuesta completa de la IA
    logAIResponse(content, exerciseContext);

    let aiResponse;
    
    try {
      aiResponse = JSON.parse(content);
    } catch (error) {
      console.error('Error parsing AI response:', error);
      aiResponse = { 
        error: 'Error al procesar la respuesta de IA',
        raw_content: content 
      };
    }

    // Enriquecer respuesta con metadatos
    const enrichedResponse = {
      success: true,
      analysis: aiResponse,
      metadata: {
        exercise_analyzed: exerciseContext,
        photos_count: photos.length,
        model_used: MODEL,
        timestamp: new Date().toISOString(),
        user_context: userInfo
      }
    };

    console.log('✅ Análisis de fotos completado exitosamente');
    
    res.json(enrichedResponse);

  } catch (error) {
    console.error('Error en análisis de fotos:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error procesando el análisis de fotos',
      details: error.message 
    });
  }
});

// POST /api/ai-photo-correction/quick-check - Análisis rápido de una sola foto
router.post('/quick-check', authenticateToken, upload.single('photo'), async (req, res) => {
  try {
    const { exercise_name } = req.body;
    const photo = req.file;

    // Obtener cliente específico para photo correction
    const client = getOpenAIClient("photo");

    if (!photo) {
      return res.status(400).json({ 
        success: false, 
        error: 'Se requiere una foto para el análisis rápido' 
      });
    }

    const quickPrompt = `Realiza un análisis rápido de la técnica de ejercicio en esta foto. Proporciona solo los 2-3 puntos más importantes de corrección y una evaluación general. Mantén el formato JSON pero sé más conciso.

Ejercicio: ${exercise_name || 'No especificado'}`;

    // Obtener system prompt desde archivo
    const systemPrompt = await getPrompt(FeatureKey.PHOTO);

    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: quickPrompt },
            {
              type: 'image_url',
              image_url: {
                url: imageToBase64(photo.buffer, photo.mimetype),
                detail: 'low'
              }
            }
          ]
        }
      ],
      response_format: { type: 'json_object' },
      temperature: PC_CONFIG.temperature,
      max_tokens: 800,
      top_p: PC_CONFIG.top_p
    });

    const content = completion?.choices?.[0]?.message?.content || '{}';
    const aiResponse = safeJSON(content) || { error: 'Error al procesar respuesta' };

    res.json({
      success: true,
      quick_analysis: aiResponse,
      metadata: {
        exercise: exercise_name || 'No especificado',
        model_used: MODEL,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error en análisis rápido:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error en análisis rápido',
      details: error.message 
    });
  }
});

export default router;
