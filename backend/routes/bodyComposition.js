import express from 'express';
import { pool } from '../db.js';
import authenticateToken from '../middleware/auth.js';

const router = express.Router();

/**
 * GET /api/body-composition/history/:userId
 * Obtener historial de composición corporal de un usuario
 */
router.get('/history/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 10 } = req.query;
    
    // Verificar que el usuario solo pueda acceder a su propio historial
    if (req.user.userId !== parseInt(userId)) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const result = await pool.query(
      `SELECT 
        id,
        measurement_date,
        peso,
        grasa_corporal,
        masa_magra,
        agua_corporal,
        metabolismo_basal,
        imc,
        cintura,
        cuello,
        cadera,
        calculation_method,
        notes
      FROM app.body_composition_history 
      WHERE user_id = $1 
      ORDER BY measurement_date DESC 
      LIMIT $2`,
      [userId, limit]
    );

    res.json({
      success: true,
      history: result.rows,
      total: result.rows.length
    });

  } catch (error) {
    console.error('Error obteniendo historial de composición corporal:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * POST /api/body-composition/record
 * Registrar nueva medición de composición corporal
 */
router.post('/record', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const {
      peso,
      grasa_corporal,
      masa_magra,
      masa_muscular,
      agua_corporal,
      metabolismo_basal,
      cintura,
      cuello,
      cadera,
      calculation_method = 'us_navy',
      notes = 'Registro manual'
    } = req.body;

    const leanMass = masa_magra ?? masa_muscular ?? null;

    // Calcular IMC si tenemos peso y altura
    let imc = null;
    if (peso) {
      const userResult = await pool.query(
        'SELECT u.altura FROM app.users u WHERE u.id = $1',
        [userId]
      );
      
      if (userResult.rows.length > 0 && userResult.rows[0].altura) {
        const alturaM = userResult.rows[0].altura / 100;
        imc = (peso / (alturaM * alturaM));
      }
    }

    const result = await pool.query(
      `INSERT INTO app.body_composition_history (
        user_id, peso, grasa_corporal, masa_magra, agua_corporal,
        metabolismo_basal, imc, cintura, cuello, cadera,
        calculation_method, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id, measurement_date`,
      [
        userId, peso, grasa_corporal, leanMass, agua_corporal,
        metabolismo_basal, imc, cintura, cuello, cadera,
        calculation_method, notes
      ]
    );

    res.json({
      success: true,
      message: 'Composición corporal registrada exitosamente',
      record: result.rows[0]
    });

  } catch (error) {
    console.error('Error registrando composición corporal:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * GET /api/body-composition/latest/:userId
 * Obtener la última medición de composición corporal
 */
router.get('/latest/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Verificar que el usuario solo pueda acceder a su propia información
    if (req.user.userId !== parseInt(userId)) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const result = await pool.query(
      `SELECT 
        id,
        measurement_date,
        peso,
        grasa_corporal,
        masa_magra,
        agua_corporal,
        metabolismo_basal,
        imc,
        calculation_method,
        notes
      FROM app.body_composition_history 
      WHERE user_id = $1 
      ORDER BY measurement_date DESC 
      LIMIT 1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.json({
        success: true,
        latest: null,
        message: 'No hay registros de composición corporal'
      });
    }

    res.json({
      success: true,
      latest: result.rows[0]
    });

  } catch (error) {
    console.error('Error obteniendo última composición corporal:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * DELETE /api/body-composition/record/:recordId
 * Eliminar un registro de composición corporal
 */
router.delete('/record/:recordId', authenticateToken, async (req, res) => {
  try {
    const { recordId } = req.params;
    const userId = req.user.userId;

    // Verificar que el registro pertenece al usuario
    const checkResult = await pool.query(
      'SELECT user_id FROM app.body_composition_history WHERE id = $1',
      [recordId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Registro no encontrado' });
    }

    if (checkResult.rows[0].user_id !== userId) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    await pool.query(
      'DELETE FROM app.body_composition_history WHERE id = $1',
      [recordId]
    );

    res.json({
      success: true,
      message: 'Registro eliminado exitosamente'
    });

  } catch (error) {
    console.error('Error eliminando registro de composición corporal:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * GET /api/body-composition/progress/:userId
 * Obtener progreso de composición corporal (comparación con registro anterior)
 */
router.get('/progress/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Verificar que el usuario solo pueda acceder a su propio progreso
    if (req.user.userId !== parseInt(userId)) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const result = await pool.query(
      `SELECT 
        measurement_date,
        peso,
        grasa_corporal,
        masa_magra,
        agua_corporal,
        metabolismo_basal,
        LAG(peso) OVER (ORDER BY measurement_date) as peso_anterior,
        LAG(grasa_corporal) OVER (ORDER BY measurement_date) as grasa_anterior,
        LAG(masa_magra) OVER (ORDER BY measurement_date) as masa_anterior
      FROM app.body_composition_history 
      WHERE user_id = $1 
      ORDER BY measurement_date DESC 
      LIMIT 2`,
      [userId]
    );

    if (result.rows.length < 2) {
      return res.json({
        success: true,
        progress: null,
        message: 'Se necesitan al menos 2 mediciones para calcular progreso'
      });
    }

    const [current, previous] = result.rows;
    
    const progress = {
      current: {
        date: current.measurement_date,
        peso: current.peso,
        grasa_corporal: current.grasa_corporal,
        masa_magra: current.masa_magra
      },
      previous: {
        date: previous.measurement_date,
        peso: previous.peso_anterior,
        grasa_corporal: previous.grasa_anterior,
        masa_magra: previous.masa_anterior
      },
      changes: {
        peso: current.peso - (previous.peso_anterior || 0),
        grasa_corporal: current.grasa_corporal - (previous.grasa_anterior || 0),
        masa_magra: current.masa_magra - (previous.masa_anterior || 0)
      }
    };

    res.json({
      success: true,
      progress
    });

  } catch (error) {
    console.error('Error obteniendo progreso de composición corporal:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
