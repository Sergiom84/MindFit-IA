import express from 'express';
import { pool } from '../db.js';
import authenticateToken from '../middleware/auth.js';

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
  // Si ya viene en formato backend (snake_case), devolverlo tal como está
  if (objetivo.includes('_')) return objetivo;
  // Si viene del frontend, mapearlo
  return OBJETIVO_PRINCIPAL_MAP[objetivo] || objetivo;
}

const router = express.Router();

// Obtener perfil de usuario
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verificar que el usuario solo pueda acceder a su propio perfil
    if (req.user.userId !== parseInt(id)) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const result = await pool.query(
      `SELECT
        u.id, u.nombre, u.apellido, u.email, u.created_at,
        u.edad, u.sexo, u.peso, u.altura,
        u.nivel_entrenamiento, u.anos_entrenando, u.frecuencia_semanal,
        u.nivel_actividad, u.cintura, u.pecho, u.brazos,
        u.muslos, u.cuello, u.antebrazos, u.gemelo, u.pliegue_abdominal,
        u.historial_medico,
        u.alergias, u.medicamentos, u.lesiones, u.meta_peso, u.meta_grasa,
        u.fecha_inicio_objetivo, u.fecha_meta_objetivo, u.notas_progreso,
        u.meta_grasa_corporal, u.enfoque_entrenamiento, u.horario_preferido,
        u.comidas_por_dia, u.suplementacion, u.alimentos_excluidos,
        u.grasa_corporal, u.masa_muscular, u.agua_corporal, u.metabolismo_basal,
        u.cadera,
        p.metodologia_preferida, p.limitaciones_fisicas, p.objetivo_principal,
        p.usar_preferencias_ia, p.dias_preferidos_entrenamiento, p.ejercicios_por_dia_preferido,
        p.semanas_entrenamiento,
        u.objetivo_principal as u_objetivo_principal
      FROM app.users u
      LEFT JOIN app.user_profiles p ON u.id = p.user_id
      WHERE u.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    // Formatear fechas antes de enviar la respuesta
    const user = result.rows[0];
    if (user.fecha_inicio_objetivo) {
      user.fecha_inicio_objetivo = formatDateToDDMMYYYY(user.fecha_inicio_objetivo);
    }
    if (user.fecha_meta_objetivo) {
      user.fecha_meta_objetivo = formatDateToDDMMYYYY(user.fecha_meta_objetivo);
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
    const { id } = req.params;
    
    // Verificar que el usuario solo pueda actualizar su propio perfil
    if (req.user.userId !== parseInt(id)) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    await client.query('BEGIN');

    // Separar campos según la tabla correspondiente
    const usersFields = [
      'nombre', 'apellido', 'edad', 'sexo', 'peso', 'altura',
      'nivel_entrenamiento', 'anos_entrenando', 'frecuencia_semanal',
      'nivel_actividad', 'cintura', 'pecho', 'brazos',
      'muslos', 'cuello', 'antebrazos', 'gemelo', 'pliegue_abdominal', 'historial_medico',
      'alergias', 'medicamentos', 'lesiones', 'meta_peso', 'meta_grasa',
      'fecha_inicio_objetivo', 'fecha_meta_objetivo', 'notas_progreso',
      'meta_grasa_corporal', 'enfoque_entrenamiento', 'horario_preferido',
      'comidas_por_dia', 'suplementacion', 'alimentos_excluidos',
      'grasa_corporal', 'masa_muscular', 'agua_corporal', 'metabolismo_basal', 'cadera'
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
      if (req.body[field] !== undefined) {
        usersUpdateFields.push(`${field} = $${usersParamCount}`);
        usersValues.push(req.body[field]);
        usersParamCount++;
      }
    }

    // Agregar metodologia_preferida a users para mantener sincronía
    if (req.body.metodologia_preferida !== undefined) {
      usersUpdateFields.push(`metodologia_preferida = $${usersParamCount}`);
      usersValues.push(req.body.metodologia_preferida);
      usersParamCount++;
    }

    // Agregar objetivo_principal a users para mantener sincronía
    if (req.body.objetivo_principal !== undefined) {
      const mappedObjetivo = mapObjetivoPrincipal(req.body.objetivo_principal);
      console.log(`🔄 Mapeando objetivo principal: "${req.body.objetivo_principal}" → "${mappedObjetivo}"`);
      usersUpdateFields.push(`objetivo_principal = $${usersParamCount}`);
      usersValues.push(mappedObjetivo);
      usersParamCount++;
    }

    if (usersUpdateFields.length > 0) {
      usersValues.push(id);
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
      if (req.body[field] !== undefined) {
        let value = req.body[field];
        // Aplicar mapeo específico para objetivo_principal
        if (field === 'objetivo_principal') {
          value = mapObjetivoPrincipal(value);
          console.log(`🔄 Mapeando objetivo principal en profiles: "${req.body[field]}" → "${value}"`);
        }
        profilesUpdateFields.push(`${field} = $${profilesParamCount}`);
        profilesValues.push(value);
        profilesParamCount++;
      }
    }

    if (profilesUpdateFields.length > 0) {
      profilesValues.push(id);
      
      // Verificar si existe el registro en user_profiles
      const existsResult = await client.query(
        'SELECT id FROM app.user_profiles WHERE user_id = $1',
        [id]
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
        const insertFields = ['user_id', ...profilesFields.filter(field => req.body[field] !== undefined)];
        const insertValues = [id, ...profilesFields.filter(field => req.body[field] !== undefined).map(field => {
          if (field === 'objetivo_principal') {
            const mapped = mapObjetivoPrincipal(req.body[field]);
            console.log(`🔄 Mapeando objetivo principal en INSERT: "${req.body[field]}" → "${mapped}"`);
            return mapped;
          }
          return req.body[field];
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

    // Obtener los datos actualizados
    const result = await client.query(
      `SELECT 
        u.id, u.nombre, u.apellido, u.email,
        u.meta_peso, u.meta_grasa_corporal, u.fecha_inicio_objetivo, 
        u.fecha_meta_objetivo, u.notas_progreso, u.objetivo_principal as u_objetivo_principal,
        p.metodologia_preferida, p.limitaciones_fisicas, p.objetivo_principal
      FROM app.users u
      LEFT JOIN app.user_profiles p ON u.id = p.user_id
      WHERE u.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    console.log(`✅ Perfil actualizado para usuario ${id}:`, {
      metodologia_preferida: result.rows[0].metodologia_preferida,
      objetivo_principal: result.rows[0].objetivo_principal,
      objetivo_principal_users: result.rows[0].u_objetivo_principal,
      limitaciones_fisicas: result.rows[0].limitaciones_fisicas,
      meta_peso: result.rows[0].meta_peso,
      meta_grasa_corporal: result.rows[0].meta_grasa_corporal,
      fecha_inicio_objetivo: result.rows[0].fecha_inicio_objetivo,
      fecha_meta_objetivo: result.rows[0].fecha_meta_objetivo,
      notas_progreso: result.rows[0].notas_progreso
    });

    // Formatear fechas antes de enviar la respuesta
    const updatedUser = result.rows[0];
    if (updatedUser.fecha_inicio_objetivo) {
      updatedUser.fecha_inicio_objetivo = formatDateToDDMMYYYY(updatedUser.fecha_inicio_objetivo);
    }
    if (updatedUser.fecha_meta_objetivo) {
      updatedUser.fecha_meta_objetivo = formatDateToDDMMYYYY(updatedUser.fecha_meta_objetivo);
    }

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
