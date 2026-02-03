const buildConditions = ({
  pattern,
  maxImpact,
  maxAxial,
  maxCod,
  excludeIds = [],
  requireEquipmentMatch
}) => {
  const conditions = ['t.source_table = $1', 't.pattern = $2'];
  const params = [
    'Ejercicios_Hipertrofia',
    pattern
  ];
  let paramIndex = params.length;

  if (excludeIds.length > 0) {
    paramIndex += 1;
    conditions.push(`t.exercise_id <> ALL($${paramIndex}::bigint[])`);
    params.push(excludeIds);
  }

  if (Number.isFinite(maxImpact)) {
    paramIndex += 1;
    conditions.push(`t.impact_level IS NOT NULL AND t.impact_level <= $${paramIndex}`);
    params.push(maxImpact);
  }

  if (Number.isFinite(maxAxial)) {
    paramIndex += 1;
    conditions.push(`t.axial_load_level IS NOT NULL AND t.axial_load_level <= $${paramIndex}`);
    params.push(maxAxial);
  }

  if (Number.isFinite(maxCod)) {
    paramIndex += 1;
    conditions.push(`t.cod_level IS NOT NULL AND t.cod_level <= $${paramIndex}`);
    params.push(maxCod);
  }

  if (requireEquipmentMatch) {
    paramIndex += 1;
    conditions.push(`t.equipment && $${paramIndex}::text[]`);
    params.push(requireEquipmentMatch);
  }

  return { conditions, params };
};

export async function getExerciseTags(client, exerciseIds = []) {
  if (!exerciseIds.length) return new Map();

  const result = await client.query(
    `SELECT * FROM app.exercise_tags
     WHERE source_table = 'Ejercicios_Hipertrofia'
       AND exercise_id = ANY($1::bigint[])`,
    [exerciseIds]
  );

  const map = new Map();
  result.rows.forEach(row => {
    map.set(Number(row.exercise_id), row);
  });
  return map;
}

export async function findSwapCandidate(client, {
  pattern,
  equipment = [],
  maxImpact,
  maxAxial,
  maxCod,
  excludeIds = []
} = {}) {
  if (!pattern) return null;

  const queryBase = `
    SELECT
      e.exercise_id,
      e.nombre,
      e.categoria,
      e.tipo_ejercicio,
      e.patron_movimiento,
      e.descanso_seg,
      e.notas,
      t.pattern,
      t.impact_level,
      t.axial_load_level,
      t.cod_level,
      t.overhead,
      t.equipment
    FROM app.exercise_tags t
    JOIN app."Ejercicios_Hipertrofia" e ON e.exercise_id = t.exercise_id
  `;

  const runQuery = async (equipmentMatch) => {
    const { conditions, params } = buildConditions({
      pattern,
      maxImpact,
      maxAxial,
      maxCod,
      excludeIds,
      requireEquipmentMatch: equipmentMatch
    });

    const query = `${queryBase}
      WHERE ${conditions.join(' AND ')}
      ORDER BY RANDOM()
      LIMIT 1`;

    const result = await client.query(query, params);
    return result.rows[0] || null;
  };

  const hasEquipment = Array.isArray(equipment) && equipment.length > 0;
  if (hasEquipment) {
    const candidate = await runQuery(equipment);
    if (candidate) return candidate;
  }

  return runQuery(null);
}
