/**
 * Rutas de Bloque de Adaptación - HipertrofiaV2
 *
 * Endpoints para gestionar la fase de adaptación inicial
 * antes de entrar al ciclo D1-D5 completo.
 *
 * Criterios de transición:
 * 1. Adherencia >80% (4/5 sesiones por semana)
 * 2. RIR medio <4 (control de esfuerzo)
 * 3. Flags técnicas <1/semana (técnica aceptable)
 * 4. Progreso carga >8% (adaptación neuromuscular)
 *
 * Este fichero es un agregador: cada grupo de endpoints vive en
 * routes/adaptation/*.js y los helpers en
 * services/hipertrofia/adaptation/adaptationHelpers.js.
 * Todos se montan bajo /api/adaptation (ver server.js) sin cambiar rutas.
 */

import express from 'express';
import generateRouter from './adaptation/generate.js';
import trackingRouter from './adaptation/tracking.js';
import transitionRouter from './adaptation/transition.js';

const router = express.Router();

router.use(generateRouter);    // POST /generate
router.use(trackingRouter);    // /progress, /sessions, /evaluate-week, /auto-evaluate-week, /technique-flag, /problem-exercises
router.use(transitionRouter);  // /transition, /evaluate

export default router;
