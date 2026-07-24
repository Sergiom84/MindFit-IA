import { CROSSFIT_VERSIONS } from "../versions.js";

const DAY_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const LEVEL_LABELS = Object.freeze({
  beginner: "Principiante",
  intermediate: "Intermedio",
  advanced: "Avanzado"
});

function dayName(date) {
  return DAY_NAMES[new Date(`${date}T12:00:00.000Z`).getUTCDay()];
}

function doseLabel(dose = {}) {
  if (dose.type === "reps") return String(dose.reps ?? 0);
  if (dose.type === "calories") return `${dose.calories ?? 0} cal`;
  if (dose.type === "distance") return `${dose.distance_m ?? 0} m`;
  if (dose.type === "duration") return `${dose.duration_seconds ?? 0}s`;
  if (dose.type === "load") {
    return dose.load_unit === "percent_1rm" ? `${dose.load ?? 0}% 1RM` : `${dose.load ?? 0} ${dose.load_unit ?? ""}`.trim();
  }
  return "Calidad técnica";
}

function verifiedMediaUrl(movement) {
  return (movement?.media ?? []).find((item) =>
    ["verified_owned", "verified_licensed"].includes(item.status) && item.url)?.url ?? null;
}

function movementPresentation(movement, catalogById, order) {
  const canonical = catalogById.get(movement.canonical_movement_id) ?? {};
  const reps = doseLabel(movement.dose);
  return {
    id: movement.canonical_movement_id,
    exercise_id: null,
    canonical_movement_id: movement.canonical_movement_id,
    catalog_version: movement.catalog_version,
    orden: order,
    nombre: movement.name ?? canonical.name ?? movement.canonical_movement_id,
    categoria: canonical.category ?? "crossfit",
    dominio: canonical.domain ?? "mixed",
    patron: canonical.pattern ?? null,
    equipamiento: movement.equipment,
    tipo_ejercicio: "crossfit",
    series: "1",
    repeticiones: reps,
    reps_objetivo: reps,
    descanso_seg: 60,
    intensidad: movement.scale_id ?? "base",
    escala_rx: reps,
    escala_scaled: canonical.scaling_rule ?? "Preservar estímulo reduciendo carga, rango o complejidad",
    escalamiento: canonical.scaling_rule ?? null,
    como_hacerlo: canonical.instruction_text ?? null,
    cues: canonical.cues ?? [],
    errores_comunes: canonical.common_errors ?? [],
    contraindicaciones: canonical.contraindication_keys ?? [],
    sustituciones: movement.substitutions,
    notas: (canonical.cues ?? []).join(" · ") || null,
    gif_url: verifiedMediaUrl(canonical),
    media_status: verifiedMediaUrl(canonical) ? "verified" : "missing_or_unverified"
  };
}

function standaloneSession(session, requestId) {
  return {
    schema_version: CROSSFIT_VERSIONS.session,
    ruleset_version: CROSSFIT_VERSIONS.ruleset,
    catalog_version: CROSSFIT_VERSIONS.catalog,
    request_id: requestId,
    ...session
  };
}

export function presentCrossfitPlanV2(plan, catalog = [], { objective = "Preparación física general" } = {}) {
  const catalogById = new Map(catalog.map((movement) => [movement.canonical_id, movement]));
  const levelLabel = LEVEL_LABELS[plan.level];
  const semanas = plan.weeks.map((week) => ({
    numero: week.week_number,
    numero_semana: week.week_number,
    tipo: week.target_load.is_deload ? "descarga" : week.target_load.phase,
    objetivo: objective,
    target_load: week.target_load,
    sesiones: week.sessions.map((session, index) => {
      const ejercicios = session.wod.movements.map((movement, movementIndex) =>
        movementPresentation(movement, catalogById, movementIndex + 1));
      const patterns = [...new Set(ejercicios.map((exercise) => exercise.patron).filter(Boolean))];
      const v2Session = standaloneSession(session, plan.request_id);
      return {
        id: session.session_id,
        dia: dayName(session.date),
        fecha: session.date,
        orden: index + 1,
        titulo: `WOD ${session.wod.format.toUpperCase()}`,
        nombre: `WOD ${session.wod.format.toUpperCase()}`,
        descripcion: session.wod.stimulus,
        coach_tip: "Mantén el estímulo objetivo y detén el movimiento si la técnica cae a 0 o aparece dolor agudo.",
        grupos_musculares: patterns,
        session_load: session.training_load,
        metadata: {
          session_load: session.training_load,
          persisted_session_metadata: {
            crossfit_v2_session: v2Session,
            crossfit_v2: {
              schema_version: CROSSFIT_VERSIONS.session,
              level: session.level,
              logical_plan_id: session.plan_id,
              logical_day_id: session.day_id,
              logical_session_id: session.session_id,
              provenance: {
                domain: session.wod.time_domain,
                is_test: session.training_load.context?.test === true
              }
            }
          }
        },
        warmup: session.warmup,
        blocks: session.blocks,
        cooldown: session.cooldown,
        wod: {
          wod_id: session.wod.wod_id,
          formato: session.wod.format,
          time_domain: session.wod.time_domain,
          target_minutes: session.wod.target_minutes,
          time_cap_min: session.wod.time_cap_seconds / 60,
          time_cap_seconds: session.wod.time_cap_seconds,
          rounds: null,
          label: `WOD ${session.wod.format.toUpperCase()}`,
          dominio_principal: session.wod.stimulus,
          stimulus: session.wod.stimulus,
          score_type: session.wod.score_type,
          stop_rules: session.wod.stop_rules,
          movimientos: ejercicios
        },
        ejercicios
      };
    })
  }));

  return {
    metodologia: "CrossFit",
    version: CROSSFIT_VERSIONS.plan,
    schema_version: CROSSFIT_VERSIONS.plan,
    ruleset_version: CROSSFIT_VERSIONS.ruleset,
    catalog_version: CROSSFIT_VERSIONS.catalog,
    nivel: levelLabel,
    total_weeks: plan.block.week_count,
    duracion_total_semanas: plan.block.week_count,
    frecuencia_semanal: plan.weeks[0]?.sessions.length ?? 0,
    fecha_inicio: plan.weeks[0]?.sessions[0]?.date ?? null,
    objetivo: objective,
    configuracion: {
      source: "crossfit_v2_deterministic",
      progression_type: "state_machine_v2",
      elite_in_scope: false,
      doubles_allowed: false,
      schema_version: CROSSFIT_VERSIONS.plan,
      ruleset_version: CROSSFIT_VERSIONS.ruleset,
      catalog_version: CROSSFIT_VERSIONS.catalog
    },
    crossfit_v2: plan,
    semanas
  };
}
