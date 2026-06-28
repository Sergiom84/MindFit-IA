import test from "node:test";
import assert from "node:assert/strict";

import { pool } from "../db.js";
import {
  generateMethodologyPlan,
  normalizeMethodologyId,
} from "../services/routineGeneration/methodologies/MethodologyOrchestrator.js";

const originalQuery = pool.query.bind(pool);

function makeUnifiedExercises(categories) {
  let id = 1;
  return categories.flatMap((categoria) =>
    [1, 2, 3, 4].map(() => ({
      exercise_id: String(id++),
      nombre: `${categoria} ${id}`,
      nivel: "Intermedio",
      categoria,
      patron: "Compuesto",
      patron_movimiento: "Compuesto",
      series_reps_objetivo: "3x8-12",
      descanso_seg: 75,
      tempo: "2-0-2",
      criterio_de_progreso: "Subir reps antes de carga",
      como_hacerlo: "Control técnico",
      notas: "",
      extra: {},
    }))
  );
}

function makeCrossFitExercises() {
  const domains = ["Weightlifting", "Gymnastic", "Monostructural", "Accesorios"];
  let id = 1;
  return domains.flatMap((dominio) =>
    [1, 2, 3, 4].map(() => ({
      exercise_id: id++,
      nombre: `${dominio} ${id}`,
      nivel: "Intermedio",
      dominio,
      categoria: dominio,
      equipamiento: "General",
      tipo_wod: "AMRAP",
      intensidad: "Media",
      duracion_seg: 600,
      descanso_seg: 60,
      escalamiento: "Reducir reps",
      notas: "",
      rx_carga_sugerida: null,
      como_hacerlo: "Técnica primero",
    }))
  );
}

function installMockPool({ expectedDisciplina, categories, crossFit = false }) {
  const inserts = [];

  pool.query = async (sql, params = []) => {
    const text = String(sql);

    if (crossFit && text.includes('"Ejercicios_CrossFit"')) {
      return { rows: makeCrossFitExercises(), rowCount: 16 };
    }

    if (text.includes("FROM app.ejercicios")) {
      assert.equal(params[0], expectedDisciplina);
      const rows = makeUnifiedExercises(categories);
      return { rows, rowCount: rows.length };
    }

    if (text.includes("INSERT INTO app.methodology_plans")) {
      const plan = typeof params[2] === "string" ? JSON.parse(params[2]) : params[2];
      inserts.push({ methodologyType: params[1], plan });
      return { rows: [{ id: 10_000 + inserts.length }], rowCount: 1 };
    }

    throw new Error(`Consulta no esperada en test: ${text.slice(0, 120)}`);
  };

  return inserts;
}

function assertValidGeneratedPlan(result, expected) {
  assert.equal(result.success, true);
  assert.equal(result.methodology, expected.methodology);
  assert.equal(result.plan.metodologia, expected.displayName);
  assert.equal(result.plan.nivel, expected.levelLabel || "Intermedio");
  assert.equal(result.plan.objetivo, expected.goals);
  const expectedFreq = expected.frecuencia ?? 4;
  assert.equal(result.plan.frecuencia_semanal, expectedFreq);
  assert.equal(result.plan.semanas.length, expected.semanas ?? 10);
  assert.ok(result.plan.methodologyPlanId);

  for (const semana of result.plan.semanas) {
    assert.equal(semana.sesiones.length, expectedFreq);
    for (const sesion of semana.sesiones) {
      assert.ok(Array.isArray(sesion.ejercicios));
      assert.ok(sesion.ejercicios.length > 0);
      assert.ok(sesion.ejercicios.every((ejercicio) => ejercicio.nombre));
    }
  }
}

test("normaliza nombres legacy/de UI a ids de metodología", () => {
  assert.equal(normalizeMethodologyId("Funcional Manual"), "funcional");
  assert.equal(normalizeMethodologyId("CrossFit Specialist"), "crossfit");
  assert.equal(normalizeMethodologyId("Entrenamiento en Casa"), "casa");
  assert.equal(normalizeMethodologyId("Heavy Duty Manual"), "heavy-duty");
  assert.equal(normalizeMethodologyId("Halterofília Specialist"), "halterofilia");
});

test("motor genera planes válidos desde payloads anidados del frontend", async () => {
  const cases = [
    {
      methodology: "calistenia",
      dataKey: "calisteniaData",
      expectedDisciplina: "calistenia",
      displayName: "Calistenia",
      categories: ["Empuje", "Tracción", "Piernas", "Core", "Equilibrio/Soporte"],
    },
    {
      methodology: "funcional",
      dataKey: "funcionalData",
      expectedDisciplina: "funcional",
      displayName: "Funcional",
      categories: ["Empuje", "Tracción", "Piernas", "Core", "Movilidad"],
    },
    {
      methodology: "casa",
      dataKey: "casaData",
      expectedDisciplina: "casa",
      displayName: "Entrenamiento en Casa",
      categories: ["Funcional", "Fuerza", "Cardio", "Movilidad"],
    },
    {
      methodology: "heavy-duty",
      dataKey: "heavyDutyData",
      expectedDisciplina: "heavy_duty",
      displayName: "Heavy Duty",
      categories: ["Pecho", "Espalda", "Piernas (cuádriceps)", "Core"],
      // Heavy Duty: baja frecuencia (3 días intermedio) por filosofía Mentzer.
      frecuencia: 3,
    },
    {
      methodology: "powerlifting",
      dataKey: "powerliftingData",
      expectedDisciplina: "powerlifting",
      displayName: "Powerlifting",
      categories: ["Sentadilla", "Press Banca", "Peso Muerto", "Asistencia Inferior", "Asistencia Superior"],
    },
    {
      methodology: "halterofilia",
      dataKey: "halterofiliaData",
      expectedDisciplina: "halterofilia",
      displayName: "Halterofilia",
      categories: ["Snatch", "Clean & Jerk", "Fuerza Base", "Técnica", "Accesorios"],
    },
    {
      methodology: "hipertrofia",
      dataKey: "hipertrofiaData",
      expectedDisciplina: "hipertrofia",
      displayName: "Hipertrofia",
      categories: ["Pecho", "Espalda", "Piernas (cuádriceps)", "Core"],
    },
    {
      methodology: "gimnasio",
      dataKey: "gymData",
      expectedDisciplina: "hipertrofia",
      displayName: "Gimnasio",
      categories: ["Pecho", "Espalda", "Piernas (cuádriceps)", "Core"],
    },
  ];

  for (const item of cases) {
    installMockPool({
      expectedDisciplina: item.expectedDisciplina,
      categories: item.categories,
    });

    const goals = `Objetivo ${item.displayName}`;
    const result = await generateMethodologyPlan(item.methodology, 123, {
      mode: "manual",
      methodology: item.methodology,
      [item.dataKey]: {
        methodology: `${item.displayName} Manual`,
        level: "intermedio",
        goals,
      },
    });

    assertValidGeneratedPlan(result, {
      methodology: item.methodology,
      displayName: item.displayName,
      goals,
      frecuencia: item.frecuencia,
      semanas: item.semanas,
    });
  }
});

test("motor CrossFit conserva contrato de plan con payload anidado", async () => {
  installMockPool({ crossFit: true });

  const result = await generateMethodologyPlan("crossfit", 123, {
    mode: "manual",
    methodology: "crossfit",
    crossfitData: {
      methodology: "CrossFit Manual",
      level: "intermedio",
      goals: "Desarrollar GPP",
    },
  });

  assertValidGeneratedPlan(result, {
    methodology: "crossfit",
    displayName: "CrossFit",
    goals: "Desarrollar GPP",
    levelLabel: "Intermedio (RX)",
  });
});

test.after(async () => {
  pool.query = originalQuery;
  await pool.end();
});
