import { pool } from "../db.js";

const DAY_TYPES = new Set(["normal", "libre", "cheat", "diet_break"]);

function isIsoDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function ensureNumberField(name, rawValue) {
  const hasValue = rawValue !== null && rawValue !== undefined && rawValue !== "";
  const parsed = toNumberOrNull(rawValue);
  if (hasValue && parsed === null) {
    throw new Error(`${name} debe ser un número`);
  }
  return parsed;
}

function normalizeDayType(value) {
  if (value === null || value === undefined || value === "") return null;
  const normalized = String(value).trim().toLowerCase();
  return DAY_TYPES.has(normalized) ? normalized : null;
}

function normalizeNoiseFlags(value) {
  if (value === null || value === undefined) return null;
  const arr = Array.isArray(value) ? value : [value];
  const normalized = [];
  for (const item of arr) {
    if (item === null || item === undefined) continue;
    const s = String(item).trim();
    if (!s) continue;
    // Guardarraíl: evita flags enormes o con caracteres raros.
    normalized.push(s.slice(0, 64));
  }
  // Dedupe estable
  return [...new Set(normalized)];
}

function ensureLegacyDailyLogShape(existing = {}) {
  const base = typeof existing === "object" && existing ? existing : {};
  const mealProgress =
    base.mealProgress && typeof base.mealProgress === "object" ? base.mealProgress : {};

  return {
    calories: Number(base.calories) || 0,
    protein: Number(base.protein) || 0,
    carbs: Number(base.carbs) || 0,
    fat: Number(base.fat) || 0,
    meals: Array.isArray(base.meals) ? base.meals : [],
    mealProgress,
    // Mantiene compatibilidad con el legacy; si no existe, se añade.
    lastUpdated: base.lastUpdated || new Date().toISOString(),
  };
}

function mergeDailyLog(existing = {}, patch = null) {
  const safeExisting = typeof existing === "object" && existing ? existing : {};
  const safePatch = typeof patch === "object" && patch ? patch : null;

  const merged = safePatch ? { ...safeExisting, ...safePatch } : { ...safeExisting };
  return ensureLegacyDailyLogShape(merged);
}

export function isNutritionDayRegistered(row) {
  if (!row) return false;
  const dayType = row.day_type || row.dayType;
  if (dayType && dayType !== "normal") return true;

  const calories = row.calories !== undefined ? toNumberOrNull(row.calories) : null;
  if (calories !== null && calories > 0) return true;

  const dailyLog = row.daily_log || row.dailyLog;
  if (dailyLog && Array.isArray(dailyLog.meals) && dailyLog.meals.length > 0) return true;
  if (dailyLog && dailyLog.mealProgress && Object.keys(dailyLog.mealProgress).length > 0) return true;

  const protein = row.protein !== undefined ? toNumberOrNull(row.protein) : null;
  const carbs = row.carbs !== undefined ? toNumberOrNull(row.carbs) : null;
  const fat = row.fat !== undefined ? toNumberOrNull(row.fat) : null;
  if ((protein ?? 0) > 0 || (carbs ?? 0) > 0 || (fat ?? 0) > 0) return true;

  return false;
}

export async function getDailyNutritionLogV2(userId, logDate) {
  if (!userId) throw new Error("userId requerido");
  if (!isIsoDate(logDate)) throw new Error("Fecha inválida. Formato esperado: YYYY-MM-DD");

  const { rows } = await pool.query(
    `
      SELECT user_id, log_date::text as log_date, daily_log, calories, protein, carbs, fat, day_type, noise_flags
      FROM app.daily_nutrition_log
      WHERE user_id = $1 AND log_date = $2
      LIMIT 1;
    `,
    [userId, logDate]
  );

  if (rows.length === 0) {
    return {
      exists: false,
      daily: {
        date: logDate,
        calories: null,
        protein: null,
        carbs: null,
        fat: null,
        day_type: "normal",
        noise_flags: [],
        daily_log: ensureLegacyDailyLogShape({}),
      },
    };
  }

  const row = rows[0];
  return {
    exists: true,
    daily: {
      date: row.log_date,
      calories: row.calories === null ? null : Number(row.calories),
      protein: row.protein === null ? null : Number(row.protein),
      carbs: row.carbs === null ? null : Number(row.carbs),
      fat: row.fat === null ? null : Number(row.fat),
      day_type: row.day_type,
      noise_flags: row.noise_flags || [],
      daily_log: ensureLegacyDailyLogShape(row.daily_log),
    },
  };
}

export async function upsertDailyNutritionLogV2(userId, payload) {
  if (!userId) throw new Error("userId requerido");
  const date = payload?.date;
  if (!isIsoDate(date)) throw new Error("Fecha inválida. Formato esperado: YYYY-MM-DD");

  const calories = ensureNumberField("calories", payload?.calories);
  const protein = ensureNumberField("protein", payload?.protein);
  const carbs = ensureNumberField("carbs", payload?.carbs);
  const fat = ensureNumberField("fat", payload?.fat);

  if (calories !== null && calories < 0) throw new Error("calories no puede ser negativo");
  if (protein !== null && protein < 0) throw new Error("protein no puede ser negativo");
  if (carbs !== null && carbs < 0) throw new Error("carbs no puede ser negativo");
  if (fat !== null && fat < 0) throw new Error("fat no puede ser negativo");

  const rawDayType = payload?.day_type ?? payload?.dayType;
  const normalizedDayType = normalizeDayType(rawDayType);
  const dayType =
    rawDayType === null || rawDayType === undefined || rawDayType === "" ? "normal" : normalizedDayType;
  if (!dayType) throw new Error("day_type inválido. Valores: normal|libre|cheat|diet_break");

  const noiseFlags = normalizeNoiseFlags(payload?.noise_flags ?? payload?.noiseFlags) ?? [];
  const dailyLogPatch = payload?.daily_log ?? payload?.dailyLog ?? null;

  // Mantener compatibilidad con legacy: si existe daily_log, preservarlo y mergear.
  const existing = await pool.query(
    `SELECT daily_log FROM app.daily_nutrition_log WHERE user_id = $1 AND log_date = $2`,
    [userId, date]
  );
  const existingDailyLog = existing.rows[0]?.daily_log || {};

  const mergedDailyLog = mergeDailyLog(existingDailyLog, dailyLogPatch);

  // Si el usuario manda kcal/macros, reflejarlo también en daily_log para coherencia con legacy.
  if (calories !== null) mergedDailyLog.calories = calories;
  if (protein !== null) mergedDailyLog.protein = protein;
  if (carbs !== null) mergedDailyLog.carbs = carbs;
  if (fat !== null) mergedDailyLog.fat = fat;
  mergedDailyLog.lastUpdated = new Date().toISOString();

  const { rows } = await pool.query(
    `
      INSERT INTO app.daily_nutrition_log
        (user_id, log_date, daily_log, calories, protein, carbs, fat, day_type, noise_flags, created_at, updated_at)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
      ON CONFLICT (user_id, log_date)
      DO UPDATE SET
        daily_log = EXCLUDED.daily_log,
        calories = EXCLUDED.calories,
        protein = EXCLUDED.protein,
        carbs = EXCLUDED.carbs,
        fat = EXCLUDED.fat,
        day_type = EXCLUDED.day_type,
        noise_flags = EXCLUDED.noise_flags,
        updated_at = NOW()
      RETURNING user_id, log_date::text as log_date, daily_log, calories, protein, carbs, fat, day_type, noise_flags;
    `,
    [userId, date, JSON.stringify(mergedDailyLog), calories, protein, carbs, fat, dayType, noiseFlags]
  );

  const row = rows[0];
  return {
    date: row.log_date,
    calories: row.calories === null ? null : Number(row.calories),
    protein: row.protein === null ? null : Number(row.protein),
    carbs: row.carbs === null ? null : Number(row.carbs),
    fat: row.fat === null ? null : Number(row.fat),
    day_type: row.day_type,
    noise_flags: row.noise_flags || [],
    daily_log: ensureLegacyDailyLogShape(row.daily_log),
  };
}
