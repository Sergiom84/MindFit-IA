/**
 * Fixtures SINTÉTICOS y deterministas para los tests de Calistenia (PR-CAL-00a).
 *
 * PROHIBIDO usar datos reales, emails, ids de producción o volcados de BD. Todo lo
 * que hay aquí es inventado y estable entre ejecuciones para poder congelar el
 * comportamiento actual y los defectos conocidos (ver docs/ROADMAP_CALISTENIA_ARQUITECTO.md
 * §3 PR-CAL-00a y §3 PR-CAL-00b).
 */

/** Perfil principiante SIN limitaciones físicas. */
export const healthyBeginnerProfile = Object.freeze({
  userId: 900001,
  nivel_entrenamiento: 'principiante',
  edad: 28,
  peso: 70,
  altura: 175,
  frecuencia_semanal: 3,
  objetivo_principal: 'ganar_fuerza',
  limitaciones_fisicas: []
});

/** Perfil intermedio con lesión de MUÑECA (limitaciones_fisicas canónico). */
export const wristInjuryProfile = Object.freeze({
  userId: 900002,
  nivel_entrenamiento: 'intermedio',
  edad: 33,
  peso: 78,
  altura: 180,
  frecuencia_semanal: 4,
  objetivo_principal: 'ganar_fuerza',
  limitaciones_fisicas: ['muñeca']
});

/**
 * Pool sintético de ejercicios de calistenia por categoría, con el shape que
 * devuelve el SELECT de single-day/multi-semana (source_exercise_id AS exercise_id).
 *
 * IMPORTANTE para G8: "Flexiones" (Empuje) está CONTRAINDICADO para muñeca; las
 * demás categorías (Tracción/Piernas) son seguras para muñeca. Así el filtro de
 * lesiones tiene algo que excluir y algo que conservar.
 */
export function buildCalisteniaExercisePool() {
  return {
    Empuje: [
      { exercise_id: 'ex-push-1', nombre: 'Flexiones', categoria: 'Empuje', nivel: 'Principiante', patron: 'empuje horizontal', series_reps_objetivo: '3x8-12', descanso_seg: 60 },
      { exercise_id: 'ex-push-2', nombre: 'Fondos en paralelas', categoria: 'Empuje', nivel: 'Intermedio', patron: 'empuje vertical', series_reps_objetivo: '3x6-10', descanso_seg: 90 }
    ],
    Tracción: [
      { exercise_id: 'ex-pull-1', nombre: 'Dominadas', categoria: 'Tracción', nivel: 'Intermedio', patron: 'traccion vertical', series_reps_objetivo: '3x5-8', descanso_seg: 120 },
      { exercise_id: 'ex-pull-2', nombre: 'Remo australiano', categoria: 'Tracción', nivel: 'Principiante', patron: 'traccion horizontal', series_reps_objetivo: '3x8-12', descanso_seg: 90 }
    ],
    Piernas: [
      { exercise_id: 'ex-leg-1', nombre: 'Sentadilla', categoria: 'Piernas', nivel: 'Principiante', patron: 'rodilla', series_reps_objetivo: '3x12-15', descanso_seg: 60 },
      { exercise_id: 'ex-leg-2', nombre: 'Puente de glúteo', categoria: 'Piernas', nivel: 'Principiante', patron: 'cadera', series_reps_objetivo: '3x12-15', descanso_seg: 60 }
    ],
    Core: [
      { exercise_id: 'ex-core-1', nombre: 'Crunch abdominal', categoria: 'Core', nivel: 'Principiante', patron: 'flexion tronco', series_reps_objetivo: '3x15-20', descanso_seg: 45 }
    ]
  };
}

/**
 * Plan de calistenia con el shape REAL que persiste CalisteniaService
 * (version 'calistenia_v2', semanas keyed por `numero`). Este shape es el que
 * rompe A3: la reevaluación busca `w.semana`/`w.week` y nunca `w.numero`.
 */
export function buildCalisteniaV2Plan() {
  return {
    metodologia: 'Calistenia',
    version: 'calistenia_v2',
    nivel: 'Principiante',
    total_weeks: 2,
    frecuencia_semanal: 3,
    semanas: [
      {
        numero: 1,
        tipo: 'entrenamiento',
        es_deload: false,
        sesiones: [
          {
            id: 'W1-D1',
            dia: 'Lunes',
            nombre: 'Empuje + Core',
            ejercicios: [
              { id: 'W1-D1-E1', nombre: 'Flexiones', series: 3, reps_objetivo: '8-12' },
              { id: 'W1-D1-E2', nombre: 'Crunch abdominal', series: 3, reps_objetivo: '15-20' }
            ]
          }
        ]
      },
      {
        numero: 2,
        tipo: 'entrenamiento',
        es_deload: false,
        sesiones: [
          {
            id: 'W2-D1',
            dia: 'Lunes',
            nombre: 'Tracción + Piernas',
            ejercicios: [
              { id: 'W2-D1-E1', nombre: 'Dominadas', series: 3, reps_objetivo: '5-8' },
              { id: 'W2-D1-E2', nombre: 'Sentadilla', series: 3, reps_objetivo: '12-15' }
            ]
          }
        ]
      }
    ]
  };
}

/**
 * Mock de dbClient para single-day: responde al SELECT de app.ejercicios con el
 * pool sintético (por categoría) y a los INSERT de persistSingleDaySession con
 * ids ficticios. No conecta a ninguna BD.
 *
 * @param {object} pool - resultado de buildCalisteniaExercisePool()
 */
export function makeSingleDayDbMock(pool) {
  const queries = [];
  return {
    queries,
    async query(sql, params = []) {
      queries.push({ sql, params });
      const text = String(sql);
      if (/INSERT\s+INTO\s+app\.methodology_plans/i.test(text)) {
        return { rows: [{ id: 5001 }], rowCount: 1 };
      }
      if (/INSERT\s+INTO\s+app\.methodology_exercise_sessions/i.test(text)) {
        return { rows: [{ id: 6002 }], rowCount: 1 };
      }
      if (/INSERT\s+INTO\s+app\.exercise_session_tracking/i.test(text)) {
        return { rows: [], rowCount: 1 };
      }
      // Dedupe de sesión single-day existente: ninguna.
      if (/FROM\s+app\.methodology_exercise_sessions/i.test(text)) {
        return { rows: [], rowCount: 0 };
      }
      // Selección por categoría desde app.ejercicios.
      if (/FROM\s+app\.ejercicios/i.test(text)) {
        const categoria = params[0];
        const rows = (pool[categoria] || []).map((r) => ({ ...r }));
        return { rows, rowCount: rows.length };
      }
      return { rows: [], rowCount: 0 };
    }
  };
}
