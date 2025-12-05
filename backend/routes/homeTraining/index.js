/**
 * @fileoverview Router principal de home training (agregador modular)
 *
 * FASE DE MIGRACIÓN:
 * Endpoints migrados a módulos especializados:
 * - plans.js - Gestión de planes (generate, plans, current-plan)
 * - sessions.js - Sesiones de entrenamiento (start, progress, stats)
 * - preferences.js - Preferencias y rechazos
 *
 * @module routes/homeTraining
 */

import express from 'express';

// Sub-routers modulares
import plansRouter from './plans.js';
import sessionsRouter from './sessions.js';
import preferencesRouter from './preferences.js';

// Router legacy para endpoints aún no migrados
import legacyRouter from '../homeTraining.js';

const router = express.Router();

/**
 * ESTRATEGIA DE MIGRACIÓN:
 * 1. Los módulos nuevos se montan PRIMERO (tienen prioridad)
 * 2. El legacy router captura endpoints restantes
 * 3. A medida que se migren más endpoints, se añaden a los módulos
 */

// Módulos migrados (prioridad)
router.use('/', plansRouter);       // generate, plans, current-plan
router.use('/', sessionsRouter);    // sessions/start, sessions/:id/progress, stats
router.use('/', preferencesRouter); // rejections, preferences-history

// Legacy router para endpoints restantes
router.use('/', legacyRouter);

export default router;

