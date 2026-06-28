/**
 * Rutas de training-session - agregador. Monta los sub-routers por dominio.
 */

import express from 'express';
import startRoutes from './trainingSession/start.js';
import progressRoutes from './trainingSession/progress.js';
import completeRoutes from './trainingSession/complete.js';
import statsRoutes from './trainingSession/stats.js';
import manageRoutes from './trainingSession/manage.js';

const router = express.Router();

router.use(startRoutes);
router.use(progressRoutes);
router.use(completeRoutes);
router.use(statsRoutes);
router.use(manageRoutes);

export default router;
