import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import { preloadAllPrompts } from './lib/promptRegistry.js';
import { validateAPIKeys } from './lib/openaiClient.js';
import { initializeSessionMaintenance } from './utils/sessionMaintenance.js';
import { startCleanupScheduler } from './jobs/sessionCleanupJob.js';
import { startMissedSessionsScheduler } from './jobs/missedSessionsJob.js';

// Helper function for Spanish timezone (UTC+2/UTC+1 depending on DST)
function getSpanishTimestamp() {
  const now = new Date();
  const madridTime = new Date(now.toLocaleString("en-US", {timeZone: "Europe/Madrid"}));
  return madridTime.toISOString();
}
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import authenticateToken from './middleware/auth.js';
import medicalDocsRoutes from './routes/medicalDocs.js';
import equipmentRoutes from './routes/equipment.js';
import aiVideoCorrection from './routes/aiVideoCorrection.js';
import aiPhotoCorrection from './routes/aiPhotoCorrection.js';

// ===============================================
// 🎯 RUTAS CONSOLIDADAS (NUEVA ARQUITECTURA)
// ===============================================
import routineGenerationRoutes from './routes/routineGeneration.js';
import trainingSessionRoutes from './routes/trainingSession.js';
import exerciseCatalogRoutes from './routes/exerciseCatalog.js';
import trainingStateRoutes from './routes/trainingState.js';
import progressReEvaluationRoutes from './routes/progressReEvaluation.js';

// ===============================================
// 🔗 OTRAS RUTAS DEL SISTEMA
// ===============================================
import bodyCompositionRoutes from './routes/bodyComposition.js';
import uploadsRoutes from './routes/uploads.js';
import techniqueRoutes from './routes/technique.js';
import nutritionRoutes from './routes/nutrition.js';
import nutritionV2Routes from './routes/nutritionV2.js';
import musicRoutes from './routes/music.js';
import analyticsRoutes from './routes/analytics.js';
import hipertrofiaV2Routes from './routes/hipertrofiaV2.js';
import adaptationBlockRoutes from './routes/adaptationBlock.js';

// ===============================================
// 🗄️ RUTAS LEGACY (MANTENER TEMPORALMENTE)
// ===============================================
import routinesRoutes from './routes/routines.js';
import homeTrainingRoutes from './routes/homeTraining.js';

// ===============================================
// 🎯 SERVICIO UNIFICADO DE METODOLOGÍA
// ===============================================

import { pool } from './db.js';

// Solo cargar dotenv en desarrollo
if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

const app = express();
const PORT = process.env.PORT || 3010;

// --- utilidades de path para servir el frontend ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_DIST = path.join(__dirname, '../dist'); // ajusta si tu build sale en otra carpeta

// Verificar search_path y precargar prompts al arrancar el backend
(async () => {
  try {
    const { rows } = await pool.query('SHOW search_path;');
    console.log('📂 search_path actual:', rows[0].search_path);

    // Verificar que la tabla users existe
    const userCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'app' AND table_name = 'users'
      );
    `);

    if (userCheck.rows[0].exists) {
      console.log('✅ Tabla users encontrada (search_path)');
    } else {
      console.warn('⚠️ Tabla users NO encontrada en search_path actual');
    }

    // Precargar prompts en caché
    console.log('🔄 Precargando prompts de IA...');
    const promptResult = await preloadAllPrompts();
    console.log(`✅ Prompts cargados: ${promptResult.successful}/${promptResult.total} exitosos`);

    // Validar API keys
    console.log('🔑 Validando API keys...');
    const apiKeyStatus = validateAPIKeys();
    if (apiKeyStatus.allConfigured) {
      console.log('✅ Todas las API keys configuradas correctamente');
      console.log('🤖 Features disponibles: photo, video, home, methodologie, nutrition, calistenia_specialist');
    } else {
      console.warn('⚠️ API keys faltantes:', apiKeyStatus.missing.join(', '));
      console.log('🔍 Estado detallado:', apiKeyStatus.features);
    }

    // Inicializar sistema de mantenimiento de sesiones
    console.log('🔧 Inicializando sistema de mantenimiento de sesiones...');
    initializeSessionMaintenance();
    console.log('✅ Sistema de mantenimiento de sesiones inicializado');
    startMissedSessionsScheduler();

  } catch (err) {
    console.error('❌ Error en inicialización:', err);
  }
})();

// Middleware
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'http://localhost:3000',
    'http://192.168.1.68:5173',
    'https://entrenaconia.onrender.com'
  ],
  credentials: true
}));
// Aumentar límite de body-parser para manejar planes grandes (50MB)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Middleware para logging de peticiones (sin imprimir datos masivos)
app.use((req, res, next) => {
  console.log(`📥 ${req.method} ${req.path} - ${getSpanishTimestamp()}`);
  if (req.body && Object.keys(req.body).length > 0) {
    // Solo mostrar las claves del body para evitar logs masivos
    const bodyKeys = Object.keys(req.body);
    console.log(`📦 Body keys: [${bodyKeys.join(', ')}]`);

    // Si el body es pequeño (< 500 caracteres), mostrarlo completo
    const bodyStr = JSON.stringify(req.body);
    if (bodyStr.length < 500) {
      console.log('📦 Body:', bodyStr);
    }
  }
  next();
});

// Info base de auth (evita 404 en GET /api/auth)
app.get('/api/auth', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Auth API base. Usa los endpoints específicos (p. ej. /api/auth/login, /api/auth/register, /api/auth/logout, /api/auth/refresh, etc.).'
  });
});

console.log('✅ Sistema consolidado de generación de rutinas activado en /api/routine-generation');

// === ALIASES DE COMPATIBILIDAD PARA EL FRONTEND ===
// Mantienen funcionando las rutas existentes redirigiendo al sistema consolidado

// Calistenia Specialist - Evaluación y Generación
app.post('/api/calistenia-specialist/evaluate-profile', (req, res, next) => {
  req.url = '/api/routine-generation/specialist/calistenia/evaluate';
  next();
});

app.post('/api/calistenia-specialist/generate-plan', (req, res, next) => {
  req.url = '/api/routine-generation/specialist/calistenia/generate';
  next();
});

// Heavy Duty Specialist - Evaluación y Generación
app.post('/api/heavy-duty-specialist/evaluate-profile', (req, res, next) => {
  req.url = '/api/routine-generation/specialist/heavy-duty/evaluate';
  next();
});

app.post('/api/heavy-duty-specialist/generate-plan', (req, res, next) => {
  req.url = '/api/routine-generation/specialist/heavy-duty/generate';
  next();
});

// Hipertrofia Specialist - Evaluación y Generación
app.post('/api/hipertrofia-specialist/evaluate-profile', (req, res, next) => {
  req.url = '/api/routine-generation/specialist/hipertrofia/evaluate';
  next();
});

app.post('/api/hipertrofia-specialist/generate-plan', (req, res, next) => {
  req.url = '/api/routine-generation/specialist/hipertrofia/generate';
  next();
});

// Powerlifting Specialist - Evaluación y Generación
app.post('/api/powerlifting-specialist/evaluate-profile', (req, res, next) => {
  req.url = '/api/routine-generation/specialist/powerlifting/evaluate';
  next();
});

app.post('/api/powerlifting-specialist/generate-plan', (req, res, next) => {
  req.url = '/api/routine-generation/specialist/powerlifting/generate';
  next();
});

// CrossFit Specialist - Evaluación y Generación
app.post('/api/crossfit-specialist/evaluate-profile', (req, res, next) => {
  req.url = '/api/routine-generation/specialist/crossfit/evaluate';
  next();
});

app.post('/api/crossfit-specialist/generate-plan', (req, res, next) => {
  req.url = '/api/routine-generation/specialist/crossfit/generate';
  next();
});

// Funcional Specialist - Evaluación y Generación
app.post('/api/funcional-specialist/evaluate-profile', (req, res, next) => {
  req.url = '/api/routine-generation/specialist/funcional/evaluate';
  next();
});

app.post('/api/funcional-specialist/generate-plan', (req, res, next) => {
  req.url = '/api/routine-generation/specialist/funcional/generate';
  next();
});

// Halterofilia Specialist - Evaluación y Generación
app.post('/api/halterofilia-specialist/evaluate-profile', (req, res, next) => {
  req.url = '/api/routine-generation/specialist/halterofilia/evaluate';
  next();
});

app.post('/api/halterofilia-specialist/generate-plan', (req, res, next) => {
  req.url = '/api/routine-generation/specialist/halterofilia/generate';
  next();
});

// Casa Specialist - Entrenamiento en Casa - Evaluación y Generación
app.post('/api/casa-specialist/evaluate-profile', (req, res, next) => {
  req.url = '/api/routine-generation/specialist/casa/evaluate';
  next();
});

app.post('/api/casa-specialist/generate-plan', (req, res, next) => {
  req.url = '/api/routine-generation/specialist/casa/generate';
  next();
});

// Metodologías IA - Múltiples endpoints
app.post('/api/methodologie/generate', (req, res, next) => {
  req.url = '/api/routine-generation/ai/methodology';
  next();
});

// 🎯 REDIRECCIÓN INTELIGENTE PARA METODOLOGÍAS - MOVIDO ABAJO

app.post('/api/methodologie/generate-plan', (req, res, next) => {
  req.url = '/api/routine-generation/ai/methodology';
  next();
});

app.get('/api/methodologie/list', (req, res, next) => {
  req.url = '/api/routine-generation/methodologies';
  next();
});

// Metodologías Manual
app.post('/api/methodology-manual/generate-manual', (req, res, next) => {
  req.url = '/api/routine-generation/manual/methodology';
  next();
});

// Calistenia Manual
app.post('/api/calistenia-manual/generate', (req, res, next) => {
  req.url = '/api/routine-generation/manual/calistenia';
  next();
});

// Gym Routine AI
app.post('/api/gym-routine/generate', (req, res, next) => {
  req.url = '/api/routine-generation/ai/gym-routine';
  next();
});

// GET endpoints auxiliares
app.get('/api/gym-routine/methodologies', (req, res, next) => {
  req.url = '/api/routine-generation/methodologies';
  next();
});

app.get('/api/calistenia-manual/exercises/:level', (req, res, next) => {
  req.url = `/api/routine-generation/calistenia/exercises/${req.params.level}`;
  next();
});

// ===============================================
// 🎯 SERVICIO UNIFICADO DE METODOLOGÍA (PRIORIDAD)
// ===============================================

// ===============================================
// 🎯 SISTEMA UNIFICADO DE METODOLOGÍAS (DEBE IR ANTES DE LAS RUTAS)
// ===============================================

// Sistema Unificado de Metodologías - Proxy inteligente
console.log('🆕 Using unified methodology system (proxy approach)');

// IMPORTANTE: Este endpoint actúa como enrutador interno hacia las rutas consolidadas
app.post('/api/methodology/generate', authenticateToken, (req, res, next) => {
  const { mode } = req.body || {};
  const methodology = String(req.body?.methodology || req.body?.metodologia_solicitada || '').toLowerCase();

  console.log(`🔀 Proxy metodología: mode=${mode}, methodology=${methodology}`);

  // Normalizar caso histórico: mode === 'calistenia' → manual calistenia
  const isCalisteniaManual = (mode === 'calistenia') || (mode === 'manual' && methodology === 'calistenia');

  if (isCalisteniaManual) {
    console.log('🤸 Calistenia manual detectada - specialist/calistenia/generate');
    req.url = '/api/routine-generation/specialist/calistenia/generate';
  } else if (mode === 'manual' && methodology) {
    // Para otras metodologías, mantener patrón actual (se añadirá routing específico cuando se habiliten)
    if (methodology === 'heavy-duty' || methodology === 'heavy duty') {
      console.log('💪 Heavy Duty manual detectada - specialist/heavy-duty/generate');
      req.url = '/api/routine-generation/specialist/heavy-duty/generate';
    } else if (methodology === 'hipertrofiav2') {
      console.log('🏋️‍♂️ HipertrofiaV2 manual detectada - hipertrofiav2/generate');
      req.url = '/api/hipertrofiav2/generate';
      // Reestructurar el body para que coincida con lo esperado
      if (req.body && !req.body.planData) {
        // Extraer planData del body si existe, si no, usar todo el body
        const { mode, methodology, metodologia_solicitada, ...restData } = req.body;
        req.body = {
          planData: restData.planData || restData
        };
      }
    } else if (methodology === 'hipertrofia') {
      console.log('🏋️ Hipertrofia manual detectada - specialist/hipertrofia/generate');
      req.url = '/api/routine-generation/specialist/hipertrofia/generate';
    } else if (methodology === 'oposicion' || methodology === 'oposiciones') {
      console.log('🏃 Oposiciones detectada - specialist/oposicion/generate');
      req.url = '/api/routine-generation/specialist/oposicion/generate';
    } else if (methodology === 'crossfit') {
      console.log('🤸 CrossFit detectado - specialist/crossfit/generate');
      req.url = '/api/routine-generation/specialist/crossfit/generate';
    } else if (methodology === 'powerlifting') {
      console.log('🏋️ Powerlifting manual detectada - specialist/powerlifting/generate');
      req.url = '/api/routine-generation/specialist/powerlifting/generate';
    } else if (methodology === 'funcional') {
      console.log('⚙️ Funcional detectado - specialist/funcional/generate');
      req.url = '/api/routine-generation/specialist/funcional/generate';
    } else if (methodology === 'halterofilia') {
      console.log('🏋️ Halterofilia detectado - specialist/halterofilia/generate');
      req.url = '/api/routine-generation/specialist/halterofilia/generate';
    } else if (methodology === 'entrenamiento-casa' || methodology === 'casa') {
      console.log('🏠 Entrenamiento en Casa detectado - specialist/casa/generate');
      req.url = '/api/routine-generation/specialist/casa/generate';
    } else if (methodology === 'bomberos' || methodology === 'bombero') {
      console.log('🚒 Bomberos detectado - specialist/bomberos/generate');
      req.url = '/api/routine-generation/specialist/bomberos/generate';
    } else if (methodology === 'guardia-civil' || methodology === 'guardia civil') {
      console.log('🛡️ Guardia Civil detectado - specialist/guardia-civil/generate');
      req.url = '/api/routine-generation/specialist/guardia-civil/generate';
    } else if (methodology === 'policia-nacional' || methodology === 'policia nacional') {
      console.log('👮 Policía Nacional detectado - specialist/policia-nacional/generate');
      req.url = '/api/routine-generation/specialist/policia-nacional/generate';
    } else if (methodology === 'policia-local' || methodology === 'policia local') {
      console.log('🚓 Policía Local detectado - specialist/policia-local/generate');
      req.url = '/api/routine-generation/specialist/policia-local/generate';
    } else {
      // Metodología manual genérica
      req.url = '/api/routine-generation/manual/methodology';
    }
  } else if (mode === 'automatic' || mode === 'regenerate') {
    // AUTOMÁTICO: IA decide la metodología
    req.url = '/api/routine-generation/ai/methodology';
  } else {
    // Default: IA methodology
    req.url = '/api/routine-generation/ai/methodology';
  }

  console.log(`🎯 Redirecting internally to: ${req.url}`);
  next();
});

// ===============================================
// 🎯 RUTAS PRINCIPALES CONSOLIDADAS
// ===============================================
app.use('/api/routine-generation', routineGenerationRoutes);
app.use('/api/training-session', trainingSessionRoutes);
app.use('/api/training', trainingStateRoutes);
app.use('/api/exercise-catalog', exerciseCatalogRoutes);
app.use('/api/progress', progressReEvaluationRoutes);

// === RUTAS NO AFECTADAS POR LA CONSOLIDACIÓN ===
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/medical-docs', medicalDocsRoutes);
app.use('/api/equipment', equipmentRoutes);
app.use('/api/ai', aiVideoCorrection);
app.use('/api/ai-photo-correction', aiPhotoCorrection);
app.use('/api/body-composition', bodyCompositionRoutes);
app.use('/api/uploads', uploadsRoutes);
// Legacy routes mantidas temporalmente para compatibilidad
app.use('/api/routines', routinesRoutes);
app.use('/api/home-training', homeTrainingRoutes);
app.use('/api/ia-home-training', homeTrainingRoutes); // Alias para IA home training
app.use('/api/technique', techniqueRoutes);
app.use('/api/nutrition', nutritionRoutes);
app.use('/api/nutrition-v2', nutritionV2Routes); // Sistema determinista normalizado
app.use('/api/music', musicRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/hipertrofiav2', hipertrofiaV2Routes); // Sistema de tracking RIR
app.use('/api/adaptation', adaptationBlockRoutes); // Bloque de Adaptación Inicial

// Endpoint simple de salud
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Servidor funcionando correctamente - v2',
    timestamp: new Date().toISOString(),
    version: '2.0'
  });
});

// Endpoints de administración de sesiones
app.get('/api/admin/sessions/status', async (req, res) => {
  try {
    const { getSessionSystemStatus } = await import('./utils/sessionMaintenance.js');
    const status = await getSessionSystemStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({
      error: 'Error obteniendo estado del sistema',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

app.post('/api/admin/sessions/maintenance', async (req, res) => {
  try {
    const { runManualMaintenance } = await import('./utils/sessionMaintenance.js');
    await runManualMaintenance();
    res.json({
      message: 'Mantenimiento manual ejecutado correctamente',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      error: 'Error ejecutando mantenimiento',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// === SERVIR FRONTEND ESTÁTICO (después de las rutas /api/*) ===
app.use(express.static(FRONTEND_DIST));

// Catch-all: cualquier ruta que NO empiece por /api la atiende el frontend
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
});

// Endpoint de test para validar módulos IA
app.get('/api/test-ai-modules', async (req, res) => {
  try {
    const { getOpenAIClient } = await import('./lib/openaiClient.js');
    const { getPrompt } = await import('./lib/promptRegistry.js');

    const features = ['video', 'photo', 'home', 'methodologie', 'nutrition'];
    const results = [];

    for (const feature of features) {
      try {
        // 1. Verificar cliente OpenAI
        getOpenAIClient(feature);

        // 2. Verificar prompt
        const prompt = await getPrompt(feature);

        results.push({
          feature: feature.toUpperCase(),
          status: 'OK',
          client: '✅ Cliente creado',
          prompt: `✅ Prompt cargado (${prompt.length} caracteres)`,
          preview: prompt.substring(0, 100) + '...'
        });

      } catch (error) {
        results.push({
          feature: feature.toUpperCase(),
          status: 'ERROR',
          error: error.message
        });
      }
    }

    res.json({
      message: 'Test de módulos IA completado',
      timestamp: new Date().toISOString(),
      results
    });

  } catch (error) {
    res.status(500).json({
      error: 'Error ejecutando tests de IA',
      details: error.message
    });
  }
});

// Manejo de errores
app.use((err, req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Algo salió mal!',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Error interno del servidor'
  });
});

// Ruta 404 (solo si aún no se respondió nada; las rutas no-/api ya las coge el frontend)
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// Iniciar servidor en Render (0.0.0.0 obligatorio)
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor backend ejecutándose en http://0.0.0.0:${PORT}`);
  console.log(`📊 Endpoint de salud: http://0.0.0.0:${PORT}/api/health`);
  console.log(`🔐 Rutas de autenticación: http://0.0.0.0:${PORT}/api/auth`);
  console.log(`🗂️  Frontend estático servido desde: ${FRONTEND_DIST}`);

  // 🧹 Inicializar sistema de limpieza automática
  console.log('🧹 Inicializando sistema de limpieza automática de sesiones...');
  startCleanupScheduler(60); // Cada 60 minutos
  console.log('✅ Sistema de limpieza automática iniciado');
});
