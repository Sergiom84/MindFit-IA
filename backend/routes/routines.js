/**
 * Rutas de rutinas - agregador. Monta los sub-routers por dominio.
 * La logica vive en routines/{session,plan,schedule,progress}Routes.js y routines/_helpers.js
 */

import express from 'express';
import sessionRoutes from './routines/sessions.js';
import planRoutes from './routines/plans.js';
import scheduleRoutes from './routines/schedule.js';
import progressRoutes from './routines/progress.js';

const router = express.Router();

router.use(sessionRoutes);
router.use(planRoutes);
router.use(scheduleRoutes);
router.use(progressRoutes);

export default router;
