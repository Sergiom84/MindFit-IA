/**
 * Helpers y constantes de las rutas de home-training (extraidos del monolito).
 */

import express from 'express';
import {
  pool
} from '../../db.js';
import authenticateToken from '../../middleware/auth.js';
import {
  getOpenAIClient,
  getModuleOpenAI
} from '../../lib/openaiClient.js';
import {
  AI_MODULES
} from '../../config/aiConfigs.js';
import {
  getPrompt,
  FeatureKey
} from '../../lib/promptRegistry.js';

// TODO: Integrar endpoint IA de generación de plan usando módulo HOME_TRAINING (promptId, temperature 1.0)
// Ejemplo futuro: POST /plans/ai/generate
//   - Usa datos de perfil + objetivos
//   - Llama a responses.create con config HOME_TRAINING
//   - Devuelve plan estructurado para persistir


// Helpers para normalizar combinaciones (evitar 500 por valores inesperados)
const ALLOWED_EQUIPMENT = new Set(['minimo','basico','avanzado','personalizado','usar_este_equipamiento']);
const ALLOWED_TRAINING  = new Set(['funcional','hiit','fuerza']);

function normalizeEquipmentType(val) {
  const v = String(val || '').toLowerCase().trim();
  if (ALLOWED_EQUIPMENT.has(v)) return v;
  // Mapear alias comunes
  if (v === 'ninguno' || v === 'sin_equipo' || v === 'sin_equipamiento') return 'minimo';
  if (v === 'custom' || v === 'personalizado_equipo') return 'personalizado';
  // Por defecto, usar inventario del usuario
  return 'usar_este_equipamiento';
}

function normalizeTrainingType(val) {
  const v = String(val || '').toLowerCase().trim();
  if (ALLOWED_TRAINING.has(v)) return v;
  // Mapear alias/metodologías a categorías home-training
  if (v.includes('hiit')) return 'hiit';
  if (v.includes('fuerza') || v.includes('calistenia') || v.includes('strength')) return 'fuerza';
  // Fallback genérico
  return 'funcional';
}

function toExerciseKey(name) {
  const s = String(name || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,'');
  return s.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 100) || 'ejercicio';
}

function buildRejectedKeySet(rejectionList = []) {
  const keys = new Set();
  for (const item of rejectionList) {
    const rawKey = item?.exercise_key ? String(item.exercise_key).trim() : '';
    const key = rawKey || toExerciseKey(item?.exercise_name);
    if (key) {
      keys.add(key);
    }
  }
  return keys;
}

function splitRejectedExercises(exercises, rejectedKeys) {
  const kept = [];
  const removed = [];

  for (const exercise of Array.isArray(exercises) ? exercises : []) {
    const name = exercise?.nombre ?? exercise?.exercise_name ?? exercise?.name;
    if (!name) {
      kept.push(exercise);
      continue;
    }

    const key = toExerciseKey(name);
    if (rejectedKeys.has(key)) {
      removed.push({ name, key });
      continue;
    }

    kept.push(exercise);
  }

  return { kept, removed };
}

const EQUIPMENT_PRESETS = {
  minimo: ['Peso corporal', 'Toalla resistente', 'Silla estable', 'Pared o sofa'],
  basico: ['Esterilla', 'Bandas elasticas', 'Mancuernas ajustables', 'Banco o step'],
  avanzado: ['TRX', 'Barra de dominadas', 'Kettlebells', 'Discos y barra']
};

function normalizeArrayField(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.filter(Boolean);
      }
    } catch (_) {
      // ignore JSON parse failures
    }
    return value
      .split(/[;,]/)
      .map(item => item.trim())
      .filter(Boolean);
  }
  return [value].filter(Boolean);
}

function computeBMI(weightKg, heightCm) {
  const weight = Number(weightKg);
  const height = Number(heightCm);
  if (!weight || !height) return null;
  const meters = height / 100;
  if (!meters) return null;
  const bmi = weight / (meters * meters);
  return Number.isFinite(bmi) ? Number(bmi.toFixed(1)) : null;
}

async function getUserProfileForHomeTraining(userId) {
  const { rows } = await pool.query(
    `SELECT
        u.id,
        u.nombre,
        u.apellido,
        u.edad,
        u.sexo,
        u.peso,
        u.altura,
        u.anos_entrenando,
        u.nivel_entrenamiento,
        u.nivel_actividad,
        u.objetivo_principal,
        u.frecuencia_semanal,
        u.grasa_corporal,
        u.masa_magra,
        u.alergias,
        u.medicamentos,
        u.suplementacion,
        p.limitaciones_fisicas,
        p.metodologia_preferida,
        p.objetivo_principal AS perfil_objetivo,
        p.dias_preferidos_entrenamiento,
        p.ejercicios_por_dia_preferido
     FROM app.users u
     LEFT JOIN app.user_profiles p ON u.id = p.user_id
     WHERE u.id = $1`,
    [userId]
  );

  if (rows.length === 0) {
    throw new Error('Usuario no encontrado');
  }

  const profile = rows[0];
  if (!profile.objetivo_principal && profile.perfil_objetivo) {
    profile.objetivo_principal = profile.perfil_objetivo;
  }

  return profile;
}

function buildUserProfileSummary(profile) {
  return {
    id: profile.id,
    nombre: profile.nombre,
    apellido: profile.apellido,
    edad: profile.edad != null ? Number(profile.edad) : null,
    sexo: profile.sexo || null,
    peso_kg: profile.peso != null ? Number(profile.peso) : null,
    altura_cm: profile.altura != null ? Number(profile.altura) : null,
    imc: computeBMI(profile.peso, profile.altura),
    anos_entrenando: profile.anos_entrenando != null ? Number(profile.anos_entrenando) : null,
    nivel_entrenamiento: profile.nivel_entrenamiento || 'intermedio',
    nivel_actividad: profile.nivel_actividad || 'moderado',
    objetivo_principal: profile.objetivo_principal || 'general',
    metodologia_preferida: profile.metodologia_preferida || null,
    frecuencia_semanal: profile.frecuencia_semanal != null ? Number(profile.frecuencia_semanal) : 3,
    dias_preferidos_entrenamiento: profile.dias_preferidos_entrenamiento || ['lunes','martes','miercoles','jueves','viernes'],
    ejercicios_por_dia_preferido: profile.ejercicios_por_dia_preferido != null ? Number(profile.ejercicios_por_dia_preferido) : 8,
    grasa_corporal: profile.grasa_corporal != null ? Number(profile.grasa_corporal) : null,
    masa_magra: profile.masa_magra != null ? Number(profile.masa_magra) : null,
    alergias: normalizeArrayField(profile.alergias),
    medicamentos: normalizeArrayField(profile.medicamentos),
    suplementacion: normalizeArrayField(profile.suplementacion),
    limitaciones_fisicas: normalizeArrayField(profile.limitaciones_fisicas)
  };
}

async function getUserEquipmentInventory(userId) {
  try {
    const [curatedRes, customRes] = await Promise.all([
      pool.query(
        `SELECT
            ue.equipment_type AS key,
            COALESCE(et.equipment_type_es, ue.equipment_type) AS label,
            COALESCE(et.category_es, et.category_en, 'general') AS category
         FROM app.user_equipment ue
         LEFT JOIN app.equipment_translations et ON et.equipment_type_en = ue.equipment_type
         WHERE ue.user_id = $1 AND ue.has_equipment = true
         ORDER BY label`,
        [userId]
      ),
      pool.query(
        `SELECT equipment_name AS name
           FROM app.user_custom_equipment
          WHERE user_id = $1
          ORDER BY created_at DESC
          LIMIT 25`,
        [userId]
      )
    ]);

    return {
      curated: curatedRes.rows.map(row => ({
        key: row.key,
        label: row.label,
        category: row.category
      })),
      custom: customRes.rows.map(row => row.name)
    };
  } catch (error) {
    console.warn('No se pudo obtener equipamiento del usuario:', error.message);
    return { curated: [], custom: [] };
  }
}

async function getCombinationHistory(userId, equipmentType, trainingType) {
  try {
    const { rows } = await pool.query(
      `SELECT plan_data, created_at
         FROM app.home_training_plans
        WHERE user_id = $1 AND equipment_type = $2 AND training_type = $3
        ORDER BY created_at DESC
        LIMIT 10`,
      [userId, equipmentType, trainingType]
    );

    const exercises = new Set();
    const summaries = [];

    for (const row of rows) {
      let planData = row.plan_data;
      if (typeof planData === 'string') {
        try {
          planData = JSON.parse(planData);
        } catch (parseError) {
          console.warn('Plan guardado con JSON invalido para combinacion, se omite:', parseError.message);
          continue;
        }
      }

      const workout = planData?.plan_entrenamiento;
      const exercisesList = Array.isArray(workout?.ejercicios) ? workout.ejercicios : [];

      exercisesList.forEach(exercise => {
        if (exercise?.nombre) {
          exercises.add(exercise.nombre);
        }
      });

      if (summaries.length < 3 && workout) {
        summaries.push({
          titulo: workout.titulo || null,
          fecha: workout.fecha || row.created_at,
          total_ejercicios: exercisesList.length,
          primeros_ejercicios: exercisesList.slice(0, 5).map(ex => ex.nombre)
        });
      }
    }

    return {
      total_planes: rows.length,
      ejercicios_usados: Array.from(exercises).slice(0, 25),
      ultimos_planes: summaries
    };
  } catch (error) {
    console.warn('No se pudo obtener historico de combinacion:', error.message);
    return {
      total_planes: 0,
      ejercicios_usados: [],
      ultimos_planes: []
    };
  }
}

async function getRecentExerciseHistory(userId, limit = 20) {
  try {
    const { rows } = await pool.query(
      `SELECT exercise_name
         FROM app.home_exercise_history
        WHERE user_id = $1
        ORDER BY created_at DESC NULLS LAST
        LIMIT $2`,
      [userId, limit]
    );

    const seen = new Set();
    const ordered = [];

    for (const row of rows) {
      const name = row.exercise_name;
      if (name && !seen.has(name)) {
        seen.add(name);
        ordered.push(name);
      }
    }

    return ordered;
  } catch (error) {
    console.warn('No se pudo obtener historial general de ejercicios:', error.message);
    return [];
  }
}

async function getUserFeedbackSummary(userId) {
  try {
    const { rows } = await pool.query(
      `SELECT exercise_name, sentiment, feedback_type, comment, avoidance_duration_days, expires_at
         FROM app.user_exercise_feedback
        WHERE user_id = $1
        ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
        LIMIT 40`,
      [userId]
    );

    const liked = new Set();
    const challenging = new Set();
    const disliked = new Set();
    const avoid = [];
    const comments = [];

    for (const row of rows) {
      const name = row.exercise_name;
      const sentiment = (row.sentiment || '').toLowerCase();
      const feedbackType = (row.feedback_type || '').toLowerCase();
      const flag = feedbackType || sentiment;

      if (['like', 'favorite', 'love'].includes(flag)) {
        liked.add(name);
      } else if (['hard', 'challenging', 'difficult', 'too_difficult'].includes(flag)) {
        challenging.add(name);
      } else if (['dislike', 'dont_like', 'no_equipment'].includes(flag)) {
        disliked.add(name);
      }

      if (['too_difficult', 'no_equipment', 'change_focus', 'dont_like'].includes(feedbackType)) {
        avoid.push({
          exercise: name,
          reason: feedbackType,
          comment: row.comment || null,
          expires_at: row.expires_at,
          avoidance_days: row.avoidance_duration_days || null
        });
      } else if (row.comment) {
        comments.push({ exercise: name, comment: row.comment });
      }
    }

    return {
      liked: Array.from(liked).slice(0, 10),
      challenging: Array.from(challenging).slice(0, 10),
      disliked: Array.from(disliked).slice(0, 10),
      avoid: avoid.slice(0, 10),
      comments: comments.slice(0, 10)
    };
  } catch (error) {
    console.warn('No se pudo obtener feedback del usuario:', error.message);
    return {
      liked: [],
      challenging: [],
      disliked: [],
      avoid: [],
      comments: []
    };
  }
}

async function getActiveRejectionsSummary(userId, equipmentType, trainingType) {
  try {
    const { rows } = await pool.query(
      `SELECT exercise_name, rejection_category, rejection_reason, expires_at
         FROM app.get_rejected_exercises_for_combination($1, $2, $3)`,
      [userId, equipmentType, trainingType]
    );

    return rows.slice(0, 15).map(row => ({
      exercise: row.exercise_name,
      category: row.rejection_category,
      reason: row.rejection_reason,
      expires_at: row.expires_at
    }));
  } catch (error) {
    console.warn('No se pudo obtener rechazos activos:', error.message);
    return [];
  }
}

function buildEquipmentContext(equipmentType, inventory) {
  const context = {
    modo: equipmentType,
    curated: inventory.curated,
    custom: inventory.custom
  };

  if (EQUIPMENT_PRESETS[equipmentType]) {
    context.preset_toolkit = EQUIPMENT_PRESETS[equipmentType];
  }

  if ((equipmentType === 'personalizado' || equipmentType === 'usar_este_equipamiento') && context.curated.length === 0 && context.custom.length === 0) {
    context.notice = 'El usuario selecciono equipamiento personalizado pero no tiene elementos registrados.';
  }

  return context;
}

function parseAIPlanResponse(rawContent) {
  if (!rawContent || typeof rawContent !== 'string') {
    throw new Error('Respuesta de IA vacia');
  }

  let content = rawContent.trim();
  const blockMatch = content.match(/```json\s*([\s\S]*?)```/i) || content.match(/```\s*([\s\S]*?)```/i);
  if (blockMatch && blockMatch[1]) {
    content = blockMatch[1].trim();
  }

  const firstBrace = content.indexOf('{');
  const lastBrace = content.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1) {
    content = content.slice(firstBrace, lastBrace + 1);
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    console.error('Respuesta de IA no es JSON valido:', error.message);
    console.error('Fragmento recibido:', content.slice(0, 200));
    throw new Error('La IA devolvio un JSON invalido');
  }

  if (!parsed.plan_entrenamiento || !Array.isArray(parsed.plan_entrenamiento.ejercicios)) {
    throw new Error('La IA no devolvio ejercicios validos');
  }

  return parsed;
}

// ===============================================
// FUNCIONES HELPER PARA CACHÉ DE EJERCICIOS
// ===============================================

/**
 * Tablas de ejercicios AÚN no unificadas (CrossFit + oposiciones).
 * La familia de entreno estándar (calistenia, casa, funcional, halterofilia,
 * heavy_duty, hipertrofia, powerlifting) vive en app.ejercicios con columna `disciplina`.
 */
const LEGACY_EXERCISE_TABLES = [
  'Ejercicios_CrossFit',       // columnas capitalizadas "Cómo_hacerlo"/"Consejos"/"Errores_comunes"
  'Ejercicios_Bomberos',       // columnas ejecucion/consejos/errores_evitar
  'Ejercicios_Guardia_Civil',
  'Ejercicios_Policia_Local'
];
const LEGACY_CAPITALIZED_TABLES = ['Ejercicios_CrossFit'];

/**
 * Busca un ejercicio (cache de info de IA) primero en la tabla unificada
 * app.ejercicios y luego en las tablas legacy no unificadas.
 * Retorna: { found, table, disciplina, hasCache, cacheData }
 */
async function findExerciseInTables(exerciseName) {
  const normalizedName = exerciseName.toLowerCase().trim();

  // 1) Familia estándar unificada (app.ejercicios, columnas ya consistentes)
  try {
    const result = await pool.query(
      `SELECT disciplina, nombre,
              como_hacerlo as ejecucion, consejos, errores_comunes as errores_evitar
         FROM app.ejercicios
        WHERE LOWER(TRIM(nombre)) = $1
        LIMIT 1`,
      [normalizedName]
    );
    if (result.rows.length > 0) {
      const row = result.rows[0];
      const hasCache = row.ejecucion && row.consejos && row.errores_evitar;
      return {
        found: true,
        table: 'app.ejercicios',
        disciplina: row.disciplina,
        hasCache,
        cacheData: hasCache ? {
          ejecucion: row.ejecucion,
          consejos: row.consejos,
          errores_evitar: row.errores_evitar
        } : null
      };
    }
  } catch (error) {
    console.warn('Error buscando en app.ejercicios:', error.message);
  }

  // 2) Tablas legacy no unificadas (CrossFit + oposiciones)
  for (const table of LEGACY_EXERCISE_TABLES) {
    try {
      const selectQuery = LEGACY_CAPITALIZED_TABLES.includes(table)
        ? `SELECT nombre, "Cómo_hacerlo" as ejecucion, "Consejos" as consejos, "Errores_comunes" as errores_evitar`
        : `SELECT nombre, ejecucion, consejos, errores_evitar`;

      const result = await pool.query(
        `${selectQuery}
         FROM app."${table}"
         WHERE LOWER(TRIM(nombre)) = $1
         LIMIT 1`,
        [normalizedName]
      );

      if (result.rows.length > 0) {
        const row = result.rows[0];
        const hasCache = row.ejecucion && row.consejos && row.errores_evitar;

        return {
          found: true,
          table,
          disciplina: null,
          hasCache,
          cacheData: hasCache ? {
            ejecucion: row.ejecucion,
            consejos: row.consejos,
            errores_evitar: row.errores_evitar
          } : null
        };
      }
    } catch (error) {
      console.warn(`Error buscando en ${table}:`, error.message);
      continue;
    }
  }

  return { found: false, table: null, disciplina: null, hasCache: false, cacheData: null };
}

/**
 * Guarda la información de IA en la tabla de origen del ejercicio.
 * Para app.ejercicios usa la columna `disciplina` para no actualizar otra disciplina.
 */
async function saveExerciseInfoToTable(tableName, exerciseName, exerciseInfo, disciplina = null) {
  try {
    let updateQuery;
    let params;

    if (tableName === 'app.ejercicios') {
      updateQuery = `UPDATE app.ejercicios
         SET como_hacerlo = $1,
             consejos = $2,
             errores_comunes = $3,
             updated_at = NOW()
         WHERE LOWER(TRIM(nombre)) = $4 AND disciplina = $5`;
      params = [
        exerciseInfo.ejecucion,
        exerciseInfo.consejos,
        exerciseInfo.errores_evitar,
        exerciseName.toLowerCase().trim(),
        disciplina
      ];
    } else {
      updateQuery = LEGACY_CAPITALIZED_TABLES.includes(tableName)
        ? `UPDATE app."${tableName}"
           SET "Cómo_hacerlo" = $1,
               "Consejos" = $2,
               "Errores_comunes" = $3,
               updated_at = NOW()
           WHERE LOWER(TRIM(nombre)) = $4`
        : `UPDATE app."${tableName}"
           SET ejecucion = $1,
               consejos = $2,
               errores_evitar = $3,
               updated_at = NOW()
           WHERE LOWER(TRIM(nombre)) = $4`;
      params = [
        exerciseInfo.ejecucion,
        exerciseInfo.consejos,
        exerciseInfo.errores_evitar,
        exerciseName.toLowerCase().trim()
      ];
    }

    await pool.query(updateQuery, params);

    console.log(`💾 Información guardada en ${tableName} para: ${exerciseName}`);
    return true;
  } catch (error) {
    console.error(`❌ Error guardando en ${tableName}:`, error.message);
    return false;
  }
}

export {
  ALLOWED_EQUIPMENT,
  ALLOWED_TRAINING,
  EQUIPMENT_PRESETS,
  LEGACY_EXERCISE_TABLES,
  LEGACY_CAPITALIZED_TABLES,
  normalizeEquipmentType,
  normalizeTrainingType,
  toExerciseKey,
  buildRejectedKeySet,
  splitRejectedExercises,
  normalizeArrayField,
  computeBMI,
  getUserProfileForHomeTraining,
  buildUserProfileSummary,
  getUserEquipmentInventory,
  getCombinationHistory,
  getRecentExerciseHistory,
  getUserFeedbackSummary,
  getActiveRejectionsSummary,
  buildEquipmentContext,
  parseAIPlanResponse,
  findExerciseInTables,
  saveExerciseInfoToTable
};
