import express from 'express';
import multer from 'multer';
import authenticateToken from '../middleware/auth.js';
import { getOpenAI } from '../lib/openaiClient.js';

const router = express.Router();

// Configurar multer para múltiples archivos
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB por archivo
    files: 10 // máximo 10 archivos
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos de imagen'), false);
    }
  }
});

/**
 * POST /api/uploads/images
 * Subida y análisis básico de múltiples imágenes
 */
router.post('/images', authenticateToken, upload.array('images', 10), async (req, res) => {
  try {
    const { exerciseId } = req.body;
    const userId = req.user.userId; // Usar userId del token JWT

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        error: 'No se recibieron imágenes',
        code: 'NO_IMAGES'
      });
    }

    // Procesar información básica de los archivos subidos
    const uploadedFiles = req.files.map((file, index) => ({
      index,
      originalName: file.originalname,
      size: file.size,
      mimetype: file.mimetype,
      uploadedAt: new Date().toISOString()
    }));

    // Si hay OpenAI disponible, hacer análisis básico
    const openai = getOpenAI();
    let analyses = [];

    if (openai) {
      try {
        // Análisis básico de cada imagen
        analyses = await Promise.all(
          req.files.slice(0, 3).map(async (file, index) => { // Limitar a 3 para no agotar quota
            const imageBase64 = file.buffer.toString('base64');
            const imageDataUrl = `data:${file.mimetype};base64,${imageBase64}`;

            const response = await openai.chat.completions.create({
              model: process.env.OPENAI_VISION_MODEL || 'gpt-4o-mini',
              messages: [
                {
                  role: 'user',
                  content: [
                    {
                      type: 'text',
                      text: `Analiza brevemente esta imagen relacionada con ejercicio físico. 
                      Responde en formato JSON:
                      {
                        "contenido_detectado": "descripción breve",
                        "calidad_imagen": "buena/regular/mala",
                        "apto_para_analisis": true/false,
                        "observaciones": "comentarios breves"
                      }`
                    },
                    {
                      type: 'image_url',
                      image_url: {
                        url: imageDataUrl,
                        detail: 'low' // Análisis rápido y económico
                      }
                    }
                  ]
                }
              ],
              max_tokens: 200,
              temperature: 0.3,
              response_format: { type: 'json_object' }
            });

            return {
              imageIndex: index,
              analysis: JSON.parse(response.choices[0].message.content)
            };
          })
        );
      } catch (aiError) {
        console.warn('Error en análisis IA de imágenes subidas:', aiError.message);
        // Continúa sin el análisis IA si falla
      }
    }

    // Respuesta exitosa
    res.json({
      success: true,
      message: `${req.files.length} imagen(es) procesada(s) correctamente`,
      uploadedFiles,
      analyses,
      metadata: {
        exerciseId,
        userId,
        timestamp: new Date().toISOString(),
        totalSize: req.files.reduce((acc, file) => acc + file.size, 0),
        aiAnalysisAvailable: analyses.length > 0
      }
    });

  } catch (error) {
    console.error('Error procesando imágenes:', error);
    
    if (error.message.includes('Solo se permiten')) {
      return res.status(400).json({
        error: 'Tipo de archivo no permitido',
        code: 'INVALID_FILE_TYPE'
      });
    }

    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: 'Archivo demasiado grande (máximo 10MB por archivo)',
        code: 'FILE_TOO_LARGE'
      });
    }

    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        error: 'Demasiados archivos (máximo 10)',
        code: 'TOO_MANY_FILES'
      });
    }

    res.status(500).json({
      error: 'Error interno procesando imágenes',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * GET /api/uploads/status
 * Estado del servicio de uploads
 */
router.get('/status', (req, res) => {
  res.json({
    status: 'active',
    limits: {
      maxFileSize: '10MB',
      maxFiles: 10,
      allowedTypes: ['image/*']
    },
    aiAnalysisAvailable: !!getOpenAI(),
    timestamp: new Date().toISOString()
  });
});

export default router;
