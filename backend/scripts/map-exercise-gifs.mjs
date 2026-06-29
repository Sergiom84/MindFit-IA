import dotenv from "dotenv";
import pg from "pg";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendDir = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(backendDir, ".env") });

const { Pool } = pg;

const DATASET_URL = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json";
const RAW_EXERCISE_BASE_URL = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises";
const CACHE_PATH = path.join(__dirname, ".cache", "free-exercise-db-exercises.json");
const DEFAULT_REPORT_PATH = path.join(__dirname, "_out", "gif_mapping_report.csv");
const DEFAULT_THRESHOLD = 0.60;

const LEGACY_SOURCES = [
  { tableName: "Ejercicios_CrossFit", label: "crossfit", patronColumn: "dominio" },
  { tableName: "Ejercicios_Bomberos", label: "bomberos" },
  { tableName: "Ejercicios_Guardia_Civil", label: "guardia_civil" },
  { tableName: "Ejercicios_Policia_Local", label: "policia_local" }
];

const SAFE_LEGACY_TABLES = new Set(LEGACY_SOURCES.map((source) => source.tableName));
const ORIGINAL_TABLE_BY_DISCIPLINA = {
  calistenia: "Ejercicios_Calistenia",
  casa: "Ejercicios_Casa",
  funcional: "Ejercicios_Funcional",
  halterofilia: "Ejercicios_Halterofilia",
  heavy_duty: "Ejercicios_Heavy_Duty",
  hipertrofia: "Ejercicios_Hipertrofia",
  powerlifting: "Ejercicios_Powerlifting"
};

const SAFE_ORIGINAL_TABLES = new Set(Object.values(ORIGINAL_TABLE_BY_DISCIPLINA));
const tableExistenceCache = new Map();

const STOP_WORDS = new Set([
  "a", "al", "ante", "con", "contra", "de", "del", "desde", "el", "en", "entre",
  "hacia", "la", "las", "lo", "los", "para", "por", "sin", "sobre", "un", "una",
  "unos", "unas", "y", "or", "and", "the", "to", "with", "using"
]);

const PHRASE_HINTS = [
  ["press de pecho con mancuernas en suelo", "dumbbell floor press"],
  ["press pecho con mancuernas en suelo", "dumbbell floor press"],
  ["press de banca", "bench press"],
  ["press banca", "bench press"],
  ["press inclinado", "incline press"],
  ["press militar", "military press shoulder press"],
  ["press arnold", "arnold press"],
  ["press de pecho", "chest press bench press"],
  ["peso muerto rumano", "romanian deadlift"],
  ["peso muerto", "deadlift"],
  ["sentadilla bulgara", "split squat side split squat"],
  ["sentadilla goblet", "goblet squat"],
  ["sentadilla frontal", "front squat"],
  ["sentadilla trasera", "back squat"],
  ["elevacion lateral", "side lateral raise"],
  ["elevaciones laterales", "side lateral raise"],
  ["flexion diamante", "diamond push up"],
  ["flexion declinada", "decline push up"],
  ["flexion inclinada", "incline push up"],
  ["flexion en rodillas", "knee push up"],
  ["flexion a una mano", "one arm push up"],
  ["flexion archer", "archer push up"],
  ["flexion estandar", "push up"],
  ["flexiones", "push up"],
  ["flexion", "push up"],
  ["jalon al pecho", "lat pulldown"],
  ["jalon agarre ancho", "wide grip lat pulldown"],
  ["remo invertido", "inverted row"],
  ["remo con barra", "barbell row"],
  ["remo con mancuerna", "dumbbell row"],
  ["remo", "row"],
  ["curl de biceps", "biceps curl"],
  ["curl con barra", "barbell curl"],
  ["curl con mancuernas", "dumbbell biceps curl"],
  ["curl femoral", "leg curl hamstring curl"],
  ["extension de triceps", "triceps extension"],
  ["extension de cuadriceps", "leg extension"],
  ["fondos en paralelas", "parallel bar dips"],
  ["fondos", "dips"],
  ["pull up", "pull up"],
  ["pullup", "pull up"],
  ["dominadas", "pull up"],
  ["dominada", "pull up"],
  ["zancadas", "lunge"],
  ["zancada", "lunge"],
  ["puente de gluteo", "glute bridge"],
  ["elevacion de gemelos", "calf raise"],
  ["gemelos", "calf raise calves"],
  ["plancha lateral", "side plank"],
  ["plancha frontal", "plank"],
  ["hollow body", "hollow hold"],
  ["dragon flag", "dragon flag"],
  ["front lever", "front lever"],
  ["back lever", "back lever"],
  ["l sit", "l sit"],
  ["handstand", "handstand"],
  ["hip thrust", "hip thrust"],
  ["rueda abdominal", "ab wheel rollout"],
  ["ab wheel", "ab wheel rollout"],
  ["burpee", "burpee"],
  ["mountain climber", "mountain climber"],
  ["escalador", "mountain climber"],
  ["pallof press", "pallof press"],
  ["face pull", "face pull"]
];

const TOKEN_HINTS = new Map(Object.entries({
  abdomen: ["abdominals", "abs", "core"],
  abdominal: ["abdominals", "abs", "core"],
  abdominales: ["abdominals", "abs", "core"],
  agarre: ["grip"],
  alto: ["high"],
  alterno: ["alternate"],
  ancho: ["wide"],
  barra: ["barbell"],
  biceps: ["biceps"],
  banco: ["bench"],
  banca: ["bench"],
  banda: ["band"],
  bandas: ["band"],
  cable: ["cable"],
  cadera: ["hip"],
  cardio: ["cardio"],
  cerrado: ["close"],
  completa: ["full"],
  core: ["core", "abdominals"],
  cuadriceps: ["quadriceps", "quads"],
  cuerda: ["rope"],
  declinado: ["decline"],
  dorsal: ["lats", "back"],
  espalda: ["back", "lats"],
  escalador: ["mountain", "climber"],
  frontal: ["front"],
  gemelos: ["calves", "calf", "raise"],
  gluteo: ["glutes"],
  gluteos: ["glutes"],
  hombro: ["shoulder", "shoulders"],
  hombros: ["shoulder", "shoulders"],
  inclinado: ["incline"],
  isquios: ["hamstrings"],
  kettlebell: ["kettlebell"],
  maquina: ["machine"],
  mancuernas: ["dumbbell"],
  mancuerna: ["dumbbell"],
  medio: ["medium"],
  pecho: ["chest", "pectorals"],
  pierna: ["leg", "legs"],
  piernas: ["leg", "legs"],
  pistol: ["pistol"],
  plancha: ["plank"],
  polea: ["cable", "pulldown"],
  posterior: ["rear"],
  pronacion: ["overhand", "pronated"],
  prono: ["prone"],
  remo: ["row"],
  sentado: ["seated"],
  sentadilla: ["squat"],
  suelo: ["floor"],
  supino: ["supine"],
  traccion: ["pull"],
  triceps: ["triceps"],
  unilateral: ["single", "one"],
  vertical: ["vertical"]
}));

const ENGLISH_ALIASES = [
  ["pullups", "pull up"],
  ["pullup", "pull up"],
  ["chinups", "chin up"],
  ["chinup", "chin up"],
  ["pushups", "push up"],
  ["pushup", "push up"],
  ["situps", "sit up"],
  ["situp", "sit up"],
  ["bodyweight", "body weight"],
  ["bicep", "biceps"],
  ["one arm", "one arm single"],
  ["single arm", "one arm single"],
  ["side split squat", "split squat"],
  ["db", "dumbbell"]
];

function parseArgs(argv) {
  const options = {
    apply: false,
    refresh: false,
    overwrite: false,
    limit: null,
    only: null,
    reportPath: DEFAULT_REPORT_PATH,
    threshold: DEFAULT_THRESHOLD
  };

  for (const arg of argv) {
    if (arg === "--apply") options.apply = true;
    else if (arg === "--dry-run") options.apply = false;
    else if (arg === "--refresh") options.refresh = true;
    else if (arg === "--overwrite") options.overwrite = true;
    else if (arg.startsWith("--limit=")) options.limit = Number(arg.slice("--limit=".length)) || null;
    else if (arg.startsWith("--only=")) options.only = normalizeText(arg.slice("--only=".length));
    else if (arg.startsWith("--threshold=")) options.threshold = Number(arg.slice("--threshold=".length)) || DEFAULT_THRESHOLD;
    else if (arg.startsWith("--report=")) options.reportPath = path.resolve(arg.slice("--report=".length));
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  return options;
}

function printHelp() {
  console.log(`
Uso:
  node backend/scripts/map-exercise-gifs.mjs [--dry-run] [--apply]

Opciones:
  --dry-run              Genera CSV sin escribir en BD (por defecto)
  --apply                Actualiza gif_url para matches por encima del umbral
  --overwrite            Reemplaza gif_url existente al aplicar
  --threshold=0.62       Confianza minima para aplicar
  --limit=25             Procesa solo N ejercicios
  --only=hipertrofia     Filtra por disciplina o tabla
  --refresh              Fuerza redescarga de free-exercise-db
  --report=path.csv      Ruta de salida del CSV
`);
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokensFromText(value) {
  return normalizeText(value)
    .split(" ")
    .filter((token) => token && !STOP_WORDS.has(token));
}

function expandSpanishHints(text) {
  const normalized = normalizeText(text);
  const hints = [];

  hints.push(...collectPhraseHints(normalized));

  for (const token of tokensFromText(normalized)) {
    const mapped = TOKEN_HINTS.get(token);
    if (mapped) hints.push(...mapped);
  }

  return `${normalized} ${hints.join(" ")}`;
}

function collectPhraseHints(text) {
  const normalized = normalizeText(text);
  const hints = [];

  for (const [spanish, english] of PHRASE_HINTS) {
    if (normalized.includes(spanish)) {
      hints.push(english);
    }
  }

  return hints;
}

function expandEnglishAliases(text) {
  let expanded = normalizeText(text);
  for (const [source, alias] of ENGLISH_ALIASES) {
    if (expanded.includes(source)) {
      expanded += ` ${alias}`;
    }
  }
  return expanded;
}

function toTokenSet(value) {
  return new Set(tokensFromText(value));
}

function intersectSize(a, b) {
  let count = 0;
  for (const token of a) {
    if (b.has(token)) count += 1;
  }
  return count;
}

function jaccard(a, b) {
  if (a.size === 0 && b.size === 0) return 0;
  const intersection = intersectSize(a, b);
  return intersection / (a.size + b.size - intersection);
}

function canonicalEquipment(value) {
  const text = normalizeText(value);
  const tags = new Set();

  if (/mancuerna|dumbbell/.test(text)) tags.add("dumbbell");
  if (/barra|barbell|ez curl/.test(text)) tags.add("barbell");
  if (/polea|cable/.test(text)) tags.add("cable");
  if (/maquina|machine/.test(text)) tags.add("machine");
  if (/banda|band/.test(text)) tags.add("band");
  if (/kettlebell/.test(text)) tags.add("kettlebell");
  if (/banco|bench/.test(text)) tags.add("bench");
  if (/balon|medicine ball/.test(text)) tags.add("medicine_ball");
  if (/peso corporal|body only|bodyweight|body weight|calistenia/.test(text)) tags.add("body");
  if (/disco|weight|plate/.test(text)) tags.add("weight");

  return tags;
}

function muscleHints(value) {
  const text = normalizeText(value);
  const tags = new Set();

  if (/pecho|chest|pectoral/.test(text)) tags.add("pectorals");
  if (/espalda|dorsal|back/.test(text)) {
    tags.add("lats");
    tags.add("middle back");
  }
  if (/hombro|shoulder/.test(text)) tags.add("shoulders");
  if (/biceps/.test(text)) tags.add("biceps");
  if (/triceps/.test(text)) tags.add("triceps");
  if (/pierna|cuadriceps|quadriceps|quad/.test(text)) tags.add("quadriceps");
  if (/isquio|femoral|hamstring/.test(text)) tags.add("hamstrings");
  if (/gluteo|glute/.test(text)) tags.add("glutes");
  if (/gemelo|calf|calves/.test(text)) tags.add("calves");
  if (/abdom|core/.test(text)) tags.add("abdominals");

  return tags;
}

function imageUrlForExercise(exercise) {
  const imagePath = Array.isArray(exercise.images) && exercise.images[0]
    ? exercise.images[0]
    : `${exercise.id}/0.jpg`;

  return `${RAW_EXERCISE_BASE_URL}/${imagePath}`;
}

function buildDatasetIndex(dataset) {
  return dataset.map((exercise) => {
    const fullText = [
      exercise.name,
      exercise.id,
      exercise.equipment,
      exercise.category,
      exercise.force,
      exercise.mechanic,
      ...(exercise.primaryMuscles || []),
      ...(exercise.secondaryMuscles || [])
    ].join(" ");

    const expandedName = expandEnglishAliases(exercise.name);
    const expandedFullText = expandEnglishAliases(fullText);

    return {
      id: exercise.id,
      name: exercise.name,
      nameText: normalizeText(exercise.name),
      equipment: exercise.equipment || "",
      primaryMuscles: exercise.primaryMuscles || [],
      imageUrl: imageUrlForExercise(exercise),
      nameTokens: toTokenSet(expandedName),
      allTokens: toTokenSet(expandedFullText),
      equipmentTags: canonicalEquipment(exercise.equipment),
      muscleTags: muscleHints([...(exercise.primaryMuscles || []), ...(exercise.secondaryMuscles || [])].join(" "))
    };
  });
}

function buildExerciseQuery(exercise) {
  const nameText = expandSpanishHints(exercise.nombre);
  const contextText = expandSpanishHints([
    exercise.nombre,
    exercise.categoria,
    exercise.patron,
    exercise.equipamiento
  ].join(" "));

  return {
    nameTokens: toTokenSet(nameText),
    allTokens: toTokenSet(contextText),
    phraseHints: collectPhraseHints(exercise.nombre),
    rawTokens: toTokenSet(exercise.nombre),
    equipmentTags: canonicalEquipment(`${exercise.equipamiento || ""} ${exercise.disciplina || ""}`),
    muscleTags: muscleHints(`${exercise.categoria || ""} ${exercise.patron || ""}`)
  };
}

function scoreCandidate(query, candidate) {
  const nameIntersection = intersectSize(query.nameTokens, candidate.nameTokens);
  const nameContainment = query.nameTokens.size > 0 ? nameIntersection / query.nameTokens.size : 0;
  const allIntersection = intersectSize(query.allTokens, candidate.allTokens);
  const allContainment = query.allTokens.size > 0 ? allIntersection / query.allTokens.size : 0;
  const nameJaccard = jaccard(query.nameTokens, candidate.nameTokens);
  const allJaccard = jaccard(query.allTokens, candidate.allTokens);

  let equipmentScore = 0;
  if (query.equipmentTags.size > 0 && candidate.equipmentTags.size > 0) {
    const equipmentOverlap = intersectSize(query.equipmentTags, candidate.equipmentTags);
    equipmentScore = equipmentOverlap > 0 ? 0.12 : -0.04;
  }

  let muscleScore = 0;
  if (query.muscleTags.size > 0 && candidate.muscleTags.size > 0) {
    const muscleOverlap = intersectSize(query.muscleTags, candidate.muscleTags);
    muscleScore = muscleOverlap > 0 ? 0.08 : 0;
  }

  const exactTokenBonus = nameIntersection >= Math.min(3, query.nameTokens.size) ? 0.06 : 0;
  let phraseBonus = 0;
  for (const phrase of query.phraseHints) {
    const phraseTokens = toTokenSet(phrase);
    if (phraseTokens.size > 0 && intersectSize(phraseTokens, candidate.nameTokens) === phraseTokens.size) {
      phraseBonus = Math.max(phraseBonus, 0.20);
    }
  }

  let modifierPenalty = 0;
  const candidateModifiers = ["rear", "lying", "incline", "decline", "seated", "inner", "behind", "neck", "guillotine"];
  for (const modifier of candidateModifiers) {
    if (candidate.nameTokens.has(modifier) && !query.nameTokens.has(modifier) && !query.rawTokens.has(modifier)) {
      modifierPenalty += 0.025;
    }
  }

  const score =
    (nameContainment * 0.42) +
    (allContainment * 0.18) +
    (nameJaccard * 0.18) +
    (allJaccard * 0.08) +
    equipmentScore +
    muscleScore +
    exactTokenBonus +
    phraseBonus -
    modifierPenalty;

  return Math.max(0, Math.min(1, score));
}

function findBestMatch(exercise, datasetIndex, threshold) {
  const query = buildExerciseQuery(exercise);
  const candidates = datasetIndex
    .map((candidate) => ({
      ...candidate,
      confidence: scoreCandidate(query, candidate)
    }))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5);

  const best = candidates[0] || null;
  const status = best && best.confidence >= threshold
    ? "auto"
    : best && best.confidence >= 0.35
      ? "review"
      : "no_match";

  return {
    best,
    candidates,
    status
  };
}

async function loadDataset(refresh) {
  if (!refresh) {
    try {
      const cached = await readFile(CACHE_PATH, "utf8");
      return JSON.parse(cached);
    } catch (_) {
      // Cache inexistente o invalida: se descarga abajo.
    }
  }

  const response = await fetch(DATASET_URL);
  if (!response.ok) {
    throw new Error(`No se pudo descargar free-exercise-db: ${response.status} ${response.statusText}`);
  }

  const dataset = await response.json();
  if (!Array.isArray(dataset)) {
    throw new Error("El dataset descargado no tiene formato de array");
  }

  await mkdir(path.dirname(CACHE_PATH), { recursive: true });
  await writeFile(CACHE_PATH, JSON.stringify(dataset, null, 2), "utf8");
  return dataset;
}

async function getTableColumns(pool, tableName) {
  const { rows } = await pool.query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'app' AND table_name = $1`,
    [tableName]
  );

  return new Set(rows.map((row) => row.column_name));
}

async function tableExists(pool, tableName) {
  if (tableExistenceCache.has(tableName)) {
    return tableExistenceCache.get(tableName);
  }

  const { rows } = await pool.query(
    `SELECT EXISTS (
       SELECT 1
         FROM information_schema.tables
        WHERE table_schema = 'app' AND table_name = $1
     ) AS exists`,
    [tableName]
  );
  const exists = Boolean(rows[0]?.exists);
  tableExistenceCache.set(tableName, exists);
  return exists;
}

async function loadUnifiedExercises(pool) {
  const { rows } = await pool.query(`
    SELECT
      'unified' AS source_type,
      'ejercicios' AS table_name,
      id::text AS row_id,
      disciplina,
      source_exercise_id::text AS exercise_id,
      nombre,
      categoria,
      patron,
      array_to_string(equipamiento, ', ') AS equipamiento,
      gif_url
    FROM app.ejercicios
    WHERE nombre IS NOT NULL AND btrim(nombre) <> ''
    ORDER BY disciplina, nombre
  `);

  return rows;
}

async function loadLegacyExercises(pool, source) {
  if (!SAFE_LEGACY_TABLES.has(source.tableName)) {
    throw new Error(`Tabla legacy no permitida: ${source.tableName}`);
  }

  const columns = await getTableColumns(pool, source.tableName);
  const patronExpr = source.patronColumn && columns.has(source.patronColumn)
    ? `${source.patronColumn}::text AS patron`
    : "NULL::text AS patron";
  const categoriaExpr = columns.has("categoria") ? "categoria::text AS categoria" : "NULL::text AS categoria";
  const equipamientoExpr = columns.has("equipamiento") ? "equipamiento::text AS equipamiento" : "NULL::text AS equipamiento";
  const gifExpr = columns.has("gif_url") ? "gif_url" : "NULL::text AS gif_url";

  const { rows } = await pool.query(`
    SELECT
      'legacy' AS source_type,
      $1::text AS table_name,
      exercise_id::text AS row_id,
      $2::text AS disciplina,
      exercise_id::text AS exercise_id,
      nombre::text AS nombre,
      ${categoriaExpr},
      ${patronExpr},
      ${equipamientoExpr},
      ${gifExpr}
    FROM app."${source.tableName}"
    WHERE nombre IS NOT NULL AND btrim(nombre::text) <> ''
    ORDER BY nombre
  `, [source.tableName, source.label]);

  return rows;
}

function matchesOnly(exercise, only) {
  if (!only) return true;

  return [
    exercise.source_type,
    exercise.table_name,
    exercise.disciplina
  ].some((value) => normalizeText(value).includes(only));
}

async function loadExercises(pool, options) {
  const unified = await loadUnifiedExercises(pool);
  const legacyGroups = await Promise.all(LEGACY_SOURCES.map((source) => loadLegacyExercises(pool, source)));

  let exercises = [...unified, ...legacyGroups.flat()].filter((exercise) => matchesOnly(exercise, options.only));
  if (options.limit) exercises = exercises.slice(0, options.limit);
  return exercises;
}

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, "\"\"")}"`;
  }
  return str;
}

function toCsv(rows) {
  const headers = [
    "source_type",
    "table_name",
    "disciplina",
    "row_id",
    "exercise_id",
    "nombre",
    "categoria",
    "patron",
    "equipamiento",
    "current_gif_url",
    "status",
    "confidence",
    "match_id",
    "match_name",
    "match_equipment",
    "gif_url",
    "top_candidates"
  ];

  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => csvEscape(row[header])).join(","));
  }
  return `${lines.join("\n")}\n`;
}

async function writeReport(reportPath, rows) {
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, toCsv(rows), "utf8");
}

async function applyMatch(pool, exercise, match, options) {
  if (!match.best || match.status !== "auto") return false;
  if (exercise.gif_url && !options.overwrite) return false;

  if (exercise.source_type === "unified") {
    const result = await pool.query(
      `UPDATE app.ejercicios
          SET gif_url = $1,
              updated_at = NOW()
        WHERE id = $2::bigint
          AND ($3::boolean OR gif_url IS NULL OR gif_url = '')`,
      [match.best.imageUrl, exercise.row_id, options.overwrite]
    );

    const originalTable = ORIGINAL_TABLE_BY_DISCIPLINA[exercise.disciplina];
    if (originalTable && SAFE_ORIGINAL_TABLES.has(originalTable) && await tableExists(pool, originalTable)) {
      await pool.query(
        `UPDATE app."${originalTable}"
            SET gif_url = $1,
                updated_at = NOW()
          WHERE exercise_id = $2::integer
            AND ($3::boolean OR gif_url IS NULL OR gif_url = '')`,
        [match.best.imageUrl, exercise.exercise_id, options.overwrite]
      );
    }

    return result.rowCount > 0;
  }

  if (!SAFE_LEGACY_TABLES.has(exercise.table_name)) {
    throw new Error(`Tabla legacy no permitida para update: ${exercise.table_name}`);
  }

  const result = await pool.query(
    `UPDATE app."${exercise.table_name}"
        SET gif_url = $1,
            updated_at = NOW()
      WHERE exercise_id = $2::integer
        AND ($3::boolean OR gif_url IS NULL OR gif_url = '')`,
    [match.best.imageUrl, exercise.exercise_id, options.overwrite]
  );
  return result.rowCount > 0;
}

function summarize(reportRows) {
  const summary = new Map();
  for (const row of reportRows) {
    const key = row.source_type === "unified" ? row.disciplina : row.table_name;
    const current = summary.get(key) || { total: 0, auto: 0, review: 0, no_match: 0, existing: 0 };
    current.total += 1;
    if (row.current_gif_url) current.existing += 1;
    current[row.status] = (current[row.status] || 0) + 1;
    summary.set(key, current);
  }

  return [...summary.entries()].map(([source, stats]) => ({ source, ...stats }));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL no esta definida en backend/.env");
  }

  const dataset = await loadDataset(options.refresh);
  const datasetIndex = buildDatasetIndex(dataset);
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  let applied = 0;
  try {
    const exercises = await loadExercises(pool, options);
    const reportRows = [];

    for (const exercise of exercises) {
      const match = findBestMatch(exercise, datasetIndex, options.threshold);
      if (options.apply && await applyMatch(pool, exercise, match, options)) {
        applied += 1;
      }

      reportRows.push({
        source_type: exercise.source_type,
        table_name: exercise.table_name,
        disciplina: exercise.disciplina,
        row_id: exercise.row_id,
        exercise_id: exercise.exercise_id,
        nombre: exercise.nombre,
        categoria: exercise.categoria,
        patron: exercise.patron,
        equipamiento: exercise.equipamiento,
        current_gif_url: exercise.gif_url,
        status: match.status,
        confidence: match.best ? match.best.confidence.toFixed(3) : "0.000",
        match_id: match.best?.id || "",
        match_name: match.best?.name || "",
        match_equipment: match.best?.equipment || "",
        gif_url: match.best?.imageUrl || "",
        top_candidates: match.candidates
          .map((candidate) => `${candidate.id}:${candidate.confidence.toFixed(3)}`)
          .join(" | ")
      });
    }

    await writeReport(options.reportPath, reportRows);

    console.log(`Dataset: ${dataset.length} ejercicios de free-exercise-db`);
    console.log(`Procesados: ${reportRows.length}`);
    console.log(`Modo: ${options.apply ? "apply" : "dry-run"}`);
    if (options.apply) console.log(`Actualizados: ${applied}`);
    console.log(`Informe: ${options.reportPath}`);
    console.table(summarize(reportRows));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
