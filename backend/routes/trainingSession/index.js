/**
 * @fileoverview Router principal de training session (agregador modular)
 *
 * FASE DE MIGRACIÓN:
 * Endpoints migrados a módulos especializados:
 * - active.js - Inicio de sesiones (start/methodology, start/home)
 * - complete.js - Finalización (complete, handle-abandon, close-active, cancel)
 * - progress.js - Tracking de progreso de ejercicios
 * - stats.js - Estado y estadísticas (today-status, weekend-status)
 *
 * @module routes/trainingSession
 */

import express from 'express';

// Sub-routers modulares
import activeRouter from './active.js';
import completeRouter from './complete.js';
import progressRouter from './progress.js';
import statsRouter from './stats.js';

// Router legacy para endpoints aún no migrados (feedback, warmup-time, etc.)
import legacyRouter from '../trainingSession.js';

const router = express.Router();

/**
 * ESTRATEGIA DE MIGRACIÓN:
 * 1. Los módulos nuevos se montan PRIMERO (tienen prioridad)
 * 2. El legacy router captura endpoints restantes
 * 3. A medida que se migren más endpoints, se añaden a los módulos
 */

// Módulos migrados (prioridad)
router.use('/', activeRouter);    // start/methodology, start/home
router.use('/', completeRouter);  // complete/*, handle-abandon, close-active, cancel
router.use('/', progressRouter);  // progress/*
router.use('/', statsRouter);     // today-status, weekend-status

// Legacy router para endpoints restantes (feedback, warmup-time, stats/*)
router.use('/', legacyRouter);

export default router;

