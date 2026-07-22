import express from 'express';
import authenticateToken from '../middleware/auth.js';
import { pool } from '../db.js';

const router = express.Router();

// GET /api/equipment/catalog
router.get('/catalog', authenticateToken, async (_req, res) => {
  try {
    // Usar la nueva estructura con traducciones al español
    const equipmentQuery = await pool.query(`
      SELECT
        id as code,
        COALESCE(name_es, name) as name,
        COALESCE(category_es, category) as category,
        COALESCE(equipment_type_es, equipment_type) as equipment_type,
        difficulty_level as level,
        description,
        is_essential,
        price_range
      FROM app.equipment_items
      ORDER BY
        CASE category
          WHEN 'basico' THEN 1
          WHEN 'resistencia' THEN 2
          WHEN 'pesas' THEN 3
          WHEN 'funcional' THEN 4
          WHEN 'cardio' THEN 5
          WHEN 'avanzado' THEN 6
          ELSE 7
        END,
        name_es, name
    `);

    res.json({
      success: true,
      catalog: equipmentQuery.rows,
      total: equipmentQuery.rows.length,
      essential_count: equipmentQuery.rows.filter(item => item.is_essential).length
    });
  } catch (e) {
    console.error('equipment.catalog error:', e);
    res.status(500).json({ success: false, error: 'Error obteniendo catálogo de equipamiento' });
  }
});

// GET /api/equipment/user => curated + custom
router.get('/user', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    const curatedRes = await pool.query(
      `SELECT
         ue.equipment_type AS key,
         COALESCE(et.equipment_type_es, ue.equipment_type) AS label,
         ue.has_equipment,
         COALESCE(et.category_es, et.category_en) AS category
       FROM app.user_equipment ue
       LEFT JOIN app.equipment_translations et ON et.equipment_type_en = ue.equipment_type
       WHERE ue.user_id = $1 AND ue.has_equipment = true
       ORDER BY label`,
      [userId]
    );
    const customRes = await pool.query(
      `SELECT id, equipment_name as name, created_at FROM app.user_custom_equipment WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );
    res.json({ success: true, curated: curatedRes.rows, custom: customRes.rows });
  } catch (e) {
    console.error('equipment.user error:', e);
    res.status(500).json({ success: false, error: 'Error obteniendo equipamiento del usuario' });
  }
});

// POST /api/equipment/user { equipment_key } (backward compatible)
router.post('/user', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    const { equipment_key, equipment_type } = req.body || {};
    const equipmentType = equipment_type || equipment_key; // Accept both field names
    if (!equipmentType) return res.status(400).json({ success: false, error: 'equipment_key o equipment_type requerido' });

    await pool.query(
      `INSERT INTO app.user_equipment (user_id, equipment_type, has_equipment)
       VALUES ($1, $2, true)
       ON CONFLICT (user_id, equipment_type) DO UPDATE SET
       has_equipment = true, updated_at = NOW()`,
      [userId, equipmentType]
    );

    res.json({ success: true });
  } catch (e) {
    console.error('equipment.add error:', e);
    res.status(500).json({ success: false, error: 'Error añadiendo equipamiento' });
  }
});

// DELETE /api/equipment/user/:key (backward compatible)
router.delete('/user/:key', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    const { key } = req.params;
    await pool.query(
      `UPDATE app.user_equipment SET has_equipment = false, updated_at = NOW()
       WHERE user_id = $1 AND equipment_type = $2`,
      [userId, key]
    );
    res.json({ success: true });
  } catch (e) {
    console.error('equipment.remove error:', e);
    res.status(500).json({ success: false, error: 'Error eliminando equipamiento' });
  }
});

// POST /api/equipment/custom { name, note? }
router.post('/custom', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    const { name } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ success: false, error: 'name requerido' });

    const { rows } = await pool.query(
      `INSERT INTO app.user_custom_equipment (user_id, equipment_name)
       VALUES ($1, $2)
       ON CONFLICT (user_id, equipment_name) DO NOTHING
       RETURNING id, equipment_name as name, created_at`,
      [userId, name.trim()]
    );
    res.json({ success: true, item: rows[0] || null });
  } catch (e) {
    console.error('equipment.custom.add error:', e);
    res.status(500).json({ success: false, error: 'Error añadiendo equipamiento personalizado' });
  }
});

// DELETE /api/equipment/custom/:id
router.delete('/custom/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    const { id } = req.params;
    await pool.query(
      `DELETE FROM app.user_custom_equipment WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    res.json({ success: true });
  } catch (e) {
    console.error('equipment.custom.remove error:', e);
    res.status(500).json({ success: false, error: 'Error eliminando equipamiento personalizado' });
  }
});

export default router;

