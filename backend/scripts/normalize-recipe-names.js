/**
 * Genera y persiste títulos normalizados/coherentes para recetas.
 *
 * Uso:
 *   cd backend
 *   node scripts/normalize-recipe-names.js
 *
 * Variables opcionales:
 *   RECIPE_SOURCE=excel_v2_2_examples   (default)
 *   DRY_RUN=true|false                  (default false)
 */

import { pool } from "../db.js";

const RECIPE_SOURCE = String(process.env.RECIPE_SOURCE || "excel_v2_2_examples").trim();
const DRY_RUN = String(process.env.DRY_RUN || "false").toLowerCase() === "true";

function normalizeKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function sentenceCase(value) {
  const text = String(value || "").trim();
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function stripExampleSuffix(name) {
  return String(name || "")
    .replace(/\s*\(Ejemplo\s*\d+\)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function simplifyFoodName(foodName) {
  const raw = String(foodName || "").trim();
  const key = normalizeKey(raw);

  const map = {
    "proteina whey aislada 90%": "whey",
    "proteina whey concentrado 80%": "whey",
    "proteina vegetal (guisante)": "proteína vegetal",
    "proteina vegetal (soja)": "proteína vegetal",
    "clara de huevo": "claras",
    "clara pasteurizada": "claras",
    "tortilla de claras": "claras",
    "huevo de gallina": "huevo",
    "pechuga de pavo (fiambre)": "pavo",
    "pavo pechuga": "pavo",
    "pechuga de pollo": "pollo",
    "carne picada vacuno 5%": "ternera magra",
    "caballo": "carne magra",
    "caballo (carne de potro)": "carne magra",
    "higado de pollo": "pollo",
    "higado de ternera": "ternera",
    "huevas de pescado": "pescado",
    "pavo ahumado": "pavo",
    "jamon cocido": "jamon cocido",
    "queso fresco batido 0%": "queso batido 0%",
    "queso fresco tipo burgos": "queso fresco",
    "pan de molde integral": "pan integral",
    "harina de avena instant": "avena",
    "avena (copos)": "avena",
    "avena instantanea": "avena",
    "yogur natural desnatado": "yogur desnatado",
    "aceite de oliva": "aceite de oliva",
    "aceite de coco": "aceite de coco",
    "zanahoria cocida": "zanahoria",
    "zanahoria cruda": "zanahoria",
    "patata cocida": "patata"
  };

  if (map[key]) {
    return map[key];
  }

  return raw
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function hasWord(value, words) {
  const key = normalizeKey(value);
  return words.some((word) => key.includes(word));
}

function chooseFirst(items, predicate) {
  for (const item of items) {
    if (predicate(item)) return item;
  }
  return null;
}

function buildFallbackName(originalName, mealType) {
  const cleaned = stripExampleSuffix(originalName);
  if (cleaned) {
    return sentenceCase(cleaned);
  }
  const mealLabel =
    mealType === "DESAYUNO" ? "Desayuno" :
      mealType === "COMIDA" ? "Comida" :
        mealType === "CENA" ? "Cena" : "Snack";
  return `${mealLabel} equilibrado`;
}

function buildNormalizedTitle({ mealType, originalName, items }) {
  const simplifiedItems = items.map((item) => ({
    ...item,
    role: String(item.role || "").toUpperCase(),
    simpleName: simplifyFoodName(item.food_name)
  }));

  const proteinItem = chooseFirst(
    simplifiedItems,
    (item) => item.role.includes("PROTEINA")
      || item.role === "HUEVO"
      || item.role === "CLARAS"
      || item.role.includes("LACTEO_PROTEICO")
      || item.role === "LEGUMBRE"
      || item.role.includes("SUPLEMENTO_PROTEINA")
  );
  const carbItem = chooseFirst(
    simplifiedItems,
    (item) => item.role.includes("CARBO")
  );
  const vegItem = chooseFirst(
    simplifiedItems,
    (item) => item.role === "VERDURA"
  );
  const fruitItem = chooseFirst(
    simplifiedItems,
    (item) => item.role === "FRUTA"
  );
  const fatItem = chooseFirst(
    simplifiedItems,
    (item) => item.role.includes("GRASA")
  );

  const protein = proteinItem?.simpleName || null;
  const carb = carbItem?.simpleName || null;
  const veg = vegItem?.simpleName || null;
  const fruit = fruitItem?.simpleName || null;
  const fat = fatItem?.simpleName || null;

  const carbIsBreadLike = carb && hasWord(carb, ["pan", "bagel", "pita", "tortilla", "arepa", "wrap"]);
  const carbIsCerealLike = carb && hasWord(carb, ["avena", "corn flakes", "arroz inflado", "muesli", "granola"]);
  const proteinIsShakeLike = protein && hasWord(protein, ["whey", "caseina", "proteina vegetal"]);

  let title = "";

  if (mealType === "DESAYUNO") {
    if (proteinIsShakeLike && (carb || fruit)) {
      title = `Batido de ${protein}${carb ? ` con ${carb}` : ""}${fruit ? ` y ${fruit}` : ""}`;
    } else if (carbIsBreadLike && protein) {
      title = `${sentenceCase(carb)} con ${protein}${veg ? ` y ${veg}` : ""}`;
    } else if (carbIsCerealLike) {
      title = `Bowl de ${carb}${protein ? ` con ${protein}` : ""}${fruit ? ` y ${fruit}` : ""}`;
    } else if (protein && carb) {
      title = `Desayuno de ${protein} con ${carb}${fruit ? ` y ${fruit}` : ""}`;
    } else if (protein && fruit) {
      title = `Desayuno de ${protein} y ${fruit}`;
    } else if (carb && fruit) {
      title = `Desayuno de ${carb} y ${fruit}`;
    } else {
      title = buildFallbackName(originalName, mealType);
    }
  } else if (mealType === "COMIDA") {
    if (protein && carb) {
      title = `Comida de ${protein} con ${carb}${veg ? ` y ${veg}` : ""}`;
    } else if (protein && veg) {
      title = `Comida de ${protein} con ${veg}`;
    } else if (carb && veg) {
      title = `Comida de ${carb} con ${veg}`;
    } else {
      title = buildFallbackName(originalName, mealType);
    }
  } else if (mealType === "CENA") {
    if (protein && veg) {
      title = `Cena de ${protein} con ${veg}${carb ? ` y ${carb}` : ""}`;
    } else if (protein && carb) {
      title = `Cena de ${protein} con ${carb}`;
    } else if (carb && veg) {
      title = `Cena de ${carb} con ${veg}`;
    } else {
      title = buildFallbackName(originalName, mealType);
    }
  } else {
    if (protein && fruit) {
      title = `Snack de ${protein} y ${fruit}`;
    } else if (protein && carb) {
      title = `Snack de ${carb} con ${protein}`;
    } else if (carb && fruit) {
      title = `Snack de ${carb} y ${fruit}`;
    } else if (fat && fruit) {
      title = `Snack de ${fruit} y ${fat}`;
    } else {
      title = buildFallbackName(originalName, mealType);
    }
  }

  title = sentenceCase(title)
    .replace(/\s+/g, " ")
    .replace(/\s+,/g, ",")
    .trim();

  if (title.length > 88) {
    title = `${title.slice(0, 85).trim()}...`;
  }

  return title || buildFallbackName(originalName, mealType);
}

async function run() {
  const client = await pool.connect();
  try {
    const recipeRows = await client.query(
      `
        SELECT id, recipe_code, name, meal_type
        FROM app.recipes
        WHERE source = $1
        ORDER BY recipe_code;
      `,
      [RECIPE_SOURCE]
    );

    if (recipeRows.rows.length === 0) {
      console.log(`⚠️ No hay recetas con source='${RECIPE_SOURCE}'`);
      process.exit(0);
    }

    const recipeIds = recipeRows.rows.map((row) => row.id);
    const itemsRows = await client.query(
      `
        SELECT
          ri.recipe_id,
          ri.slot_order,
          ri.role,
          f.nombre AS food_name
        FROM app.recipe_items ri
        JOIN app.foods f ON f.id = ri.food_id
        WHERE ri.recipe_id = ANY($1)
        ORDER BY ri.recipe_id, ri.slot_order;
      `,
      [recipeIds]
    );

    const itemsByRecipe = new Map();
    itemsRows.rows.forEach((row) => {
      if (!itemsByRecipe.has(row.recipe_id)) {
        itemsByRecipe.set(row.recipe_id, []);
      }
      itemsByRecipe.get(row.recipe_id).push(row);
    });

    await client.query("BEGIN");

    let updated = 0;
    const preview = [];
    for (const recipe of recipeRows.rows) {
      const items = itemsByRecipe.get(recipe.id) || [];
      const normalizedTitle = buildNormalizedTitle({
        mealType: recipe.meal_type,
        originalName: recipe.name,
        items
      });

      await client.query(
        `
          UPDATE app.recipes
          SET name_normalized = $2,
              updated_at = NOW()
          WHERE id = $1;
        `,
        [recipe.id, normalizedTitle]
      );
      updated += 1;

      if (preview.length < 20) {
        preview.push({
          recipe_code: recipe.recipe_code,
          old_name: recipe.name,
          new_name: normalizedTitle
        });
      }
    }

    if (DRY_RUN) {
      await client.query("ROLLBACK");
      console.log("🧪 DRY_RUN=true → rollback ejecutado");
    } else {
      await client.query("COMMIT");
    }

    console.log(`✅ Recetas procesadas: ${updated}`);
    console.log("📝 Preview (primeras 20):");
    preview.forEach((item) => {
      console.log(`- ${item.recipe_code}: "${item.new_name}"`);
    });

    process.exit(0);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ Error normalizando nombres:", error.message);
    process.exit(1);
  } finally {
    client.release();
  }
}

run();
