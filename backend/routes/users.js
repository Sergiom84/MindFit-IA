import express from 'express';
import { pool } from '../db.js';
import authenticateToken from '../middleware/auth.js';
import {
  calculateGoalProgressPct,
  shouldResetBaselineForMetaChange,
  toNumericOrNull
} from '../services/goalProgressService.js';
import { normalizeUserObjective } from '../services/userProfileContract.js';

// Mapeo de objetivo principal: frontend → backend
const OBJETIVO_PRINCIPAL_MAP = {
  'Ganar Peso': 'ganar_peso',
  'Rehabilitación': 'rehabilitacion', 
  'Perder Peso': 'perder_peso',
  'Tonificar': 'tonificar',
  'Ganar Masa Muscular': 'ganar_masa_muscular',
  'Mejorar Resistencia': 'mejorar_resistencia',
  'Mejorar Flexibilidad': 'mejorar_flexibilidad',
  'Salud General': 'salud_general',
  'Mantenimiento': 'mantenimiento'
};

// Función para formatear fecha a DD/MM/YYYY
function formatDateToDDMMYYYY(dateString) {
  if (!dateString) return null;
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return null;
  
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  
  return `${day}/${month}/${year}`;
}

// Función para mapear objetivo principal
function mapObjetivoPrincipal(objetivo) {
  if (!objetivo) return null;
  return normalizeUserObjective(objetivo) || OBJETIVO_PRINCIPAL_MAP[objetivo] || null;
}

function normalizeLegacyBodyFields(payload = {}) {
  const normalized = { ...payload };

  if (normalized.masa_magra === undefined && normalized.masa_muscular !== undefined) {
    normalized.masa_magra = normalized.masa_muscular;
  }

  if (normalized.muslo === undefined && normalized.muslos !== undefined) {
    normalized.muslo = normalized.muslos;
  }

  return normalized;
}

const router = express.Router();

const USER_PROFILE_QUERY = `
  SELECT
    u.id, u.nombre, u.apellido, u.email, u.created_at,
    u.edad, u.sexo, u.peso, u.altura,
    u.nivel_entrenamiento, u.anos_entrenando, u.frecuencia_semanal,
    u.nivel_actividad, u.cintura, u.pecho, u.brazos,
    u.muslo, u.cuello, u.antebrazos, u.gemelo, u.pliegue_abdominal,
    u.historial_medico,
    u.alergias, u.medicamentos, u.lesiones, u.meta_peso,
    u.peso_inicio_objetivo, u.objetivo_activo_desde,
    u.fecha_meta_objetivo, u.notas_progreso,
    u.meta_grasa_corporal, u.enfoque_entrenamiento, u.horario_preferido,
    u.comidas_por_dia, u.suplementacion, u.alimentos_excluidos,
    u.grasa_corporal, u.masa_magra, u.agua_corporal, u.metabolismo_basal,
    u.cadera,
    COALESCE(p.metodologia_preferida, u.metodologia_preferida) AS metodologia_preferida,
    COALESCE(NULLIF(p.limitaciones_fisicas, ''), array_to_string(u.limitaciones_fisicas, '. ')) AS limitaciones_fisicas,
    COALESCE(p.objetivo_principal, u.objetivo_principal) AS objetivo_principal,
    p.usar_preferencias_ia, p.dias_preferidos_entrenamiento, p.ejercicios_por_dia_preferido,
    p.semanas_entrenamiento,
    u.objetivo_principal as u_objetivo_principal
  FROM app.users u
  LEFT JOIN app.user_profiles p ON u.id = p.user_id
  WHERE u.id = $1
`;

const enrichUserProfile = (row) => {
  const user = { ...row };
  user.goal_progress_pct = calculateGoalProgressPct({
    startWeight: user.peso_inicio_objetivo,
    currentWeight: user.peso,
    targetWeight: user.meta_peso
  });

  if (user.fecha_meta_objetivo) {
    user.fecha_meta_objetivo = formatDateToDDMMYYYY(user.fecha_meta_objetivo);
  }
  if (user.objetivo_activo_desde) {
    user.objetivo_activo_desde = formatDateToDDMMYYYY(user.objetivo_activo_desde);
  }

  return user;
};

const getUserProfileById = async (db, userId) => {
  const result = await db.query(USER_PROFILE_QUERY, [userId]);
  if (result.rows.length === 0) return null;
  return enrichUserProfile(result.rows[0]);
};

// Obtener perfil de usuario
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    
    // Verificar que el usuario solo pueda acceder a su propio perfil
    if (req.user.userId !== userId) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const user = await getUserProfileById(pool, userId);
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    res.json({ user });

  } catch (error) {
    console.error('Error obteniendo perfil:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Actualizar perfil de usuario
router.put('/:id', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  
  try {
    const userId = parseInt(req.params.id, 10);
    
    // Verificar que el usuario solo pueda actualizar su propio perfil
    if (req.user.userId !== userId) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    await client.query('BEGIN');
    const requestBody = normalizeLegacyBodyFields(req.body);

    const currentUserResult = await client.query(
      `SELECT peso, meta_peso, peso_inicio_objetivo
       FROM app.users
       WHERE id = $1
       FOR UPDATE`,
      [userId]
    );

    if (currentUserResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const currentUser = currentUserResult.rows[0];
    const hasWeightUpdate = requestBody.peso !== undefined;
    const nextWeight = hasWeightUpdate ? toNumericOrNull(requestBody.peso) : null;

    if (hasWeightUpdate && nextWeight === null) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'El peso debe ser un número válido' });
    }

    // Separar campos según la tabla correspondiente
    const usersFields = [
      'nombre', 'apellido', 'edad', 'sexo', 'peso', 'altura',
      'nivel_entrenamiento', 'anos_entrenando', 'frecuencia_semanal',
      'nivel_actividad', 'cintura', 'pecho', 'brazos',
      'muslo', 'cuello', 'antebrazos', 'gemelo', 'pliegue_abdominal', 'historial_medico',
      'alergias', 'medicamentos', 'lesiones', 'meta_peso',
      'fecha_meta_objetivo', 'notas_progreso',
      'meta_grasa_corporal', 'enfoque_entrenamiento', 'horario_preferido',
      'comidas_por_dia', 'suplementacion', 'alimentos_excluidos',
      'grasa_corporal', 'masa_magra', 'agua_corporal', 'metabolismo_basal', 'cadera'
    ];

    const profilesFields = [
      'metodologia_preferida', 'limitaciones_fisicas', 'objetivo_principal'
    ];

    // Si se actualiza metodologia_preferida, también actualizarla en users para consistencia
    // Actualizar tabla users
    const usersUpdateFields = [];
    const usersValues = [];
    let usersParamCount = 1;

    for (const field of usersFields) {
      if (requestBody[field] !== undefined) {
        usersUpdateFields.push(`${field} = $${usersParamCount}`);
        usersValues.push(requestBody[field]);
        usersParamCount++;
      }
    }

    // Agregar metodologia_preferida a users para mantener sincronía
    if (requestBody.metodologia_preferida !== undefined) {
      usersUpdateFields.push(`metodologia_preferida = $${usersParamCount}`);
      usersValues.push(requestBody.metodologia_preferida);
      usersParamCount++;
    }

    // Agregar objetivo_principal a users para mantener sincronía
    if (requestBody.objetivo_principal !== undefined) {
      const mappedObjetivo = mapObjetivoPrincipal(requestBody.objetivo_principal);
      console.log(`🔄 Mapeando objetivo principal: "${requestBody.objetivo_principal}" → "${mappedObjetivo}"`);
      usersUpdateFields.push(`objetivo_principal = $${usersParamCount}`);
      usersValues.push(mappedObjetivo);
      usersParamCount++;
    }

    const hasMetaUpdate = requestBody.meta_peso !== undefined;
    const previousMetaWeight = toNumericOrNull(currentUser.meta_peso);
    const nextMetaWeight = hasMetaUpdate
      ? toNumericOrNull(requestBody.meta_peso)
      : previousMetaWeight;
    const previousStartWeight = toNumericOrNull(currentUser.peso_inicio_objetivo);
    const currentWeightForRules = hasWeightUpdate
      ? nextWeight
      : toNumericOrNull(currentUser.peso);

    const shouldInitializeBaseline = nextMetaWeight !== null && previousStartWeight === null;
    const shouldResetForDirection = hasMetaUpdate && shouldResetBaselineForMetaChange({
      currentWeight: currentWeightForRules,
      previousMetaWeight,
      nextMetaWeight
    });

    if ((shouldInitializeBaseline || shouldResetForDirection) && currentWeightForRules !== null) {
      usersUpdateFields.push(`peso_inicio_objetivo = $${usersParamCount}`);
      usersValues.push(currentWeightForRules);
      usersParamCount++;

      usersUpdateFields.push(`objetivo_activo_desde = $${usersParamCount}`);
      usersValues.push(new Date().toISOString().slice(0, 10));
      usersParamCount++;
    }

    if (usersUpdateFields.length > 0) {
      usersValues.push(userId);
      const usersQuery = `
        UPDATE app.users
        SET ${usersUpdateFields.join(', ')}, updated_at = NOW()
        WHERE id = $${usersParamCount}
      `;
      await client.query(usersQuery, usersValues);
    }

    // Actualizar tabla user_profiles
    const profilesUpdateFields = [];
    const profilesValues = [];
    let profilesParamCount = 1;

    for (const field of profilesFields) {
      if (requestBody[field] !== undefined) {
        let value = requestBody[field];
        // Aplicar mapeo específico para objetivo_principal
        if (field === 'objetivo_principal') {
          value = mapObjetivoPrincipal(value);
          console.log(`🔄 Mapeando objetivo principal en profiles: "${requestBody[field]}" → "${value}"`);
        }
        profilesUpdateFields.push(`${field} = $${profilesParamCount}`);
        profilesValues.push(value);
        profilesParamCount++;
      }
    }

    if (profilesUpdateFields.length > 0) {
      profilesValues.push(userId);
      
      // Verificar si existe el registro en user_profiles
      const existsResult = await client.query(
        'SELECT id FROM app.user_profiles WHERE user_id = $1',
        [userId]
      );

      if (existsResult.rows.length > 0) {
        // Actualizar registro existente
        const profilesQuery = `
          UPDATE app.user_profiles
          SET ${profilesUpdateFields.join(', ')}, updated_at = NOW()
          WHERE user_id = $${profilesParamCount}
        `;
        await client.query(profilesQuery, profilesValues);
      } else {
        // Crear nuevo registro en user_profiles
        const insertFields = ['user_id', ...profilesFields.filter(field => requestBody[field] !== undefined)];
        const insertValues = [userId, ...profilesFields.filter(field => requestBody[field] !== undefined).map(field => {
          if (field === 'objetivo_principal') {
            const mapped = mapObjetivoPrincipal(requestBody[field]);
            console.log(`🔄 Mapeando objetivo principal en INSERT: "${requestBody[field]}" → "${mapped}"`);
            return mapped;
          }
          return requestBody[field];
        })];
        const placeholders = insertValues.map((_, index) => `$${index + 1}`);
        
        const insertQuery = `
          INSERT INTO app.user_profiles (${insertFields.join(', ')}, created_at, updated_at)
          VALUES (${placeholders.join(', ')}, NOW(), NOW())
        `;
        await client.query(insertQuery, insertValues);
      }
    }

    await client.query('COMMIT');

    const updatedUser = await getUserProfileById(client, userId);
    if (!updatedUser) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    console.log(`✅ Perfil actualizado para usuario ${userId}:`, {
      metodologia_preferida: updatedUser.metodologia_preferida,
      objetivo_principal: updatedUser.objetivo_principal,
      objetivo_principal_users: updatedUser.u_objetivo_principal,
      limitaciones_fisicas: updatedUser.limitaciones_fisicas,
      meta_peso: updatedUser.meta_peso,
      meta_grasa_corporal: updatedUser.meta_grasa_corporal,
      peso_inicio_objetivo: updatedUser.peso_inicio_objetivo,
      objetivo_activo_desde: updatedUser.objetivo_activo_desde,
      goal_progress_pct: updatedUser.goal_progress_pct
    });

    res.json({
      message: 'Perfil actualizado exitosamente',
      user: updatedUser
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error actualizando perfil:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    client.release();
  }
});

// Reiniciar baseline del objetivo de peso
router.post('/:id/objective/reset', authenticateToken, async (req, res) => {
  const client = await pool.connect();

  try {
    const userId = parseInt(req.params.id, 10);

    if (req.user.userId !== userId) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    await client.query('BEGIN');

    const currentUserResult = await client.query(
      `SELECT peso
       FROM app.users
       WHERE id = $1
       FOR UPDATE`,
      [userId]
    );

    if (currentUserResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const currentWeight = toNumericOrNull(currentUserResult.rows[0].peso);
    if (currentWeight === null) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'No hay peso actual para reiniciar el progreso' });
    }

    await client.query(
      `UPDATE app.users
       SET peso_inicio_objetivo = $1,
           objetivo_activo_desde = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [currentWeight, new Date().toISOString().slice(0, 10), userId]
    );

    await client.query('COMMIT');

    const user = await getUserProfileById(pool, userId);
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    return res.json({
      message: 'Progreso reiniciado exitosamente',
      user
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error reiniciando progreso del objetivo:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    client.release();
  }
});

// Actualizar preferencias de entrenamiento (días preferidos, ejercicios por día, frecuencia)
router.put('/:id/training-preferences', authenticateToken, async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const {
      usar_preferencias_ia,
      dias_preferidos_entrenamiento,
      ejercicios_por_dia_preferido,
      semanas_entrenamiento
    } = req.body;

    // Verificar que el usuario solo pueda actualizar su propio perfil
    if (req.user.userId !== parseInt(id)) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    await client.query('BEGIN');

    // Validaciones
    if (dias_preferidos_entrenamiento) {
      if (!Array.isArray(dias_preferidos_entrenamiento)) {
        throw new Error('dias_preferidos_entrenamiento debe ser un array');
      }
      if (dias_preferidos_entrenamiento.length === 0) {
        throw new Error('Debes seleccionar al menos un día de entrenamiento');
      }
    }

    if (ejercicios_por_dia_preferido !== undefined) {
      const num = parseInt(ejercicios_por_dia_preferido);
      if (num < 4 || num > 15) {
        throw new Error('ejercicios_por_dia_preferido debe estar entre 4 y 15');
      }
    }

    if (semanas_entrenamiento !== undefined) {
      const num = parseInt(semanas_entrenamiento);
      if (num < 1 || num > 8) {
        throw new Error('semanas_entrenamiento debe estar entre 1 y 8');
      }
    }

    // 1. Actualizar user_profiles (switch, días, ejercicios por día, semanas)
    const profileUpdates = [];
    const profileValues = [];
    let profileParamCount = 1;

    if (usar_preferencias_ia !== undefined) {
      profileUpdates.push(`usar_preferencias_ia = $${profileParamCount}`);
      profileValues.push(usar_preferencias_ia);
      profileParamCount++;
    }

    if (dias_preferidos_entrenamiento) {
      profileUpdates.push(`dias_preferidos_entrenamiento = $${profileParamCount}::jsonb`);
      profileValues.push(JSON.stringify(dias_preferidos_entrenamiento));
      profileParamCount++;
    }

    if (ejercicios_por_dia_preferido !== undefined) {
      profileUpdates.push(`ejercicios_por_dia_preferido = $${profileParamCount}`);
      profileValues.push(parseInt(ejercicios_por_dia_preferido));
      profileParamCount++;
    }

    if (semanas_entrenamiento !== undefined) {
      profileUpdates.push(`semanas_entrenamiento = $${profileParamCount}`);
      profileValues.push(parseInt(semanas_entrenamiento));
      profileParamCount++;
    }

    if (profileUpdates.length > 0) {
      profileValues.push(id);

      // Verificar si existe el registro
      const existsResult = await client.query(
        'SELECT id FROM app.user_profiles WHERE user_id = $1',
        [id]
      );

      if (existsResult.rows.length > 0) {
        // UPDATE
        const updateQuery = `
          UPDATE app.user_profiles
          SET ${profileUpdates.join(', ')}, updated_at = NOW()
          WHERE user_id = $${profileParamCount}
        `;
        await client.query(updateQuery, profileValues);
      } else {
        // INSERT
        const fields = ['user_id'];
        const values = [id];

        if (usar_preferencias_ia !== undefined) {
          fields.push('usar_preferencias_ia');
          values.push(usar_preferencias_ia);
        }
        if (dias_preferidos_entrenamiento) {
          fields.push('dias_preferidos_entrenamiento');
          values.push(JSON.stringify(dias_preferidos_entrenamiento));
        }
        if (ejercicios_por_dia_preferido !== undefined) {
          fields.push('ejercicios_por_dia_preferido');
          values.push(parseInt(ejercicios_por_dia_preferido));
        }
        if (semanas_entrenamiento !== undefined) {
          fields.push('semanas_entrenamiento');
          values.push(parseInt(semanas_entrenamiento));
        }

        const placeholders = values.map((_, index) => {
          // Detectar si es el valor de dias_preferidos_entrenamiento (JSONB)
          const fieldIndex = index - 1; // -1 porque el primer elemento es user_id
          if (fields[fieldIndex + 1] === 'dias_preferidos_entrenamiento') {
            return `$${index + 1}::jsonb`;
          }
          return `$${index + 1}`;
        });

        const insertQuery = `
          INSERT INTO app.user_profiles (${fields.join(', ')}, created_at, updated_at)
          VALUES (${placeholders.join(', ')}, NOW(), NOW())
        `;
        await client.query(insertQuery, values);
      }
    }

    await client.query('COMMIT');

    // Obtener datos actualizados
    const result = await client.query(
      `SELECT
        p.usar_preferencias_ia,
        p.dias_preferidos_entrenamiento,
        p.ejercicios_por_dia_preferido,
        p.semanas_entrenamiento
      FROM app.user_profiles p
      WHERE p.user_id = $1`,
      [id]
    );

    console.log(`✅ Preferencias de entrenamiento actualizadas para usuario ${id}:`, result.rows[0]);

    res.json({
      message: 'Preferencias de entrenamiento actualizadas exitosamente',
      preferences: result.rows[0]
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error actualizando preferencias de entrenamiento:', error);
    res.status(400).json({
      error: error.message || 'Error interno del servidor'
    });
  } finally {
    client.release();
  }
});

export default router;
