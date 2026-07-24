import express from "express";

import { pool } from "../db.js";
import authenticateToken from "../middleware/auth.js";
import { getCrossfitFeatureFlags } from "../services/crossfit/featureFlags.js";
import { loadCrossfitEquipment } from "../services/crossfit/integration/productPlanService.js";
import {
  loadCrossfitRuntimeSession,
  normalizeCrossfitRuntimeEvent,
  recordCrossfitRuntimeEvent,
  registerCrossfitSubstitution
} from "../services/crossfit/runtime/runtimeService.js";
import { getUserFullProfile } from "../services/routineGeneration/database/userRepository.js";

const router = express.Router();

function runtimeEnabled(req, res, next) {
  if (!getCrossfitFeatureFlags().generation) {
    return res.status(404).json({ success: false, code: "CROSSFIT_V2_DISABLED", error: "Not found" });
  }
  next();
}

function errorResponse(res, error) {
  const status = error.status || 500;
  return res.status(status).json({
    success: false,
    code: error.code || "CROSSFIT_RUNTIME_ERROR",
    error: status >= 500 ? "No se pudo registrar el evento CrossFit" : error.message,
    details: status >= 500 ? undefined : error.details,
    retryable: error.details?.retryable ?? status >= 500,
    safe_fallback: error.details?.safe_fallback ?? "keep_local_state_and_retry"
  });
}

function validSessionId(req, res, next) {
  const sessionId = Number(req.params.sessionId);
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    return res.status(422).json({
      success: false,
      code: "CROSSFIT_SESSION_ID_INVALID",
      error: "sessionId no es valido",
      retryable: false,
      safe_fallback: "keep_local_state_and_retry"
    });
  }
  req.crossfitSessionId = sessionId;
  next();
}

router.post("/sessions/:sessionId/events", authenticateToken, runtimeEnabled, validSessionId, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const userId = req.user?.userId || req.user?.id;
    const normalized = normalizeCrossfitRuntimeEvent(req.body ?? {});
    const context = await loadCrossfitRuntimeSession(client, userId, req.crossfitSessionId);
    const persisted = await recordCrossfitRuntimeEvent(client, context, normalized);
    await client.query("COMMIT");
    return res.status(persisted.idempotent_replay ? 200 : 201).json({ success: true, ...persisted });
  } catch (error) {
    await client.query("ROLLBACK");
    return errorResponse(res, error);
  } finally {
    client.release();
  }
});

router.post("/sessions/:sessionId/substitutions", authenticateToken, runtimeEnabled, validSessionId, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const userId = req.user?.userId || req.user?.id;
    const result = await registerCrossfitSubstitution(client, {
      userId,
      sessionId: req.crossfitSessionId,
      body: req.body ?? {},
      profileLoader: getUserFullProfile,
      equipmentLoader: loadCrossfitEquipment
    });
    await client.query("COMMIT");
    return res.status(result.idempotent_replay ? 200 : 201).json(result);
  } catch (error) {
    await client.query("ROLLBACK");
    return errorResponse(res, error);
  } finally {
    client.release();
  }
});

export default router;
