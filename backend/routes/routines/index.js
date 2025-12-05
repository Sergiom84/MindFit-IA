/**
 * @fileoverview Router principal de routines (agregador modular)
 *
 * FASE DE MIGRACIÓN:
 * Esta es una migración incremental. Los endpoints se están moviendo gradualmente
 * desde el archivo monolítico routines.js a módulos especializados.
 *
 * Módulos completados:
 * - plans.js - GET /plan, POST /bootstrap-plan, GET /active-plan (parcial)
 * - progress.js - GET /progress-data (parcial)
 * - schedule.js - GET /plan-config/:planId, GET /calendar-schedule/:planId, GET /schedule/:id
 *
 * Módulos pendientes (delegados al archivo original):
 * - sessions.js - Endpoints de sesiones (en progreso)
 *
 * Los endpoints no migrados aún utilizan el router original.
 *
 * @module routes/routines
 */

import express from 'express';

// Sub-routers migrados
import plansRouter from './plans.js';
import progressRouter from './progress.js';
import scheduleRouter from './schedule.js';

// Router original para endpoints no migrados (compatibilidad)
import legacyRouter from '../routines.js';

const router = express.Router();

/**
 * ESTRATEGIA DE MIGRACIÓN:
 * 1. Los nuevos routers modulares se montan primero
 * 2. Los endpoints migrados tienen prioridad
 * 3. Los endpoints no migrados fallback al router legacy
 */

// Plans management (migrado parcialmente)
router.use('/', plansRouter);

// Progress tracking (migrado parcialmente)
router.use('/', progressRouter);

// Schedule management (migrado)
router.use('/', scheduleRouter);

// Legacy router para endpoints no migrados
// NOTA: Esto mantiene compatibilidad mientras se completa la migración
router.use('/', legacyRouter);

export default router;

