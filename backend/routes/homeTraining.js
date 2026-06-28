/**
 * Rutas de home-training - agregador. Monta los sub-routers por dominio.
 */

import express from 'express';
import plansRoutes from './homeTraining/plans.js';
import sessionsRoutes from './homeTraining/sessions.js';
import statsRoutes from './homeTraining/stats.js';
import preferencesRoutes from './homeTraining/preferences.js';
import exerciseInfoRoutes from './homeTraining/exerciseInfo.js';

const router = express.Router();

router.use(plansRoutes);
router.use(sessionsRoutes);
router.use(statsRoutes);
router.use(preferencesRoutes);
router.use(exerciseInfoRoutes);

export default router;
